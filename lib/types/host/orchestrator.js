/** 基于 Host 普通会话服务编排待办的启动与恢复。 */
import { randomUUID } from 'node:crypto';
import { TODO_STATUSES } from "../types.js";
import { PersonalTodoError, TodoStore } from "./store.js";
function taskPrompt(todo) {
    const notes = todo.notes === null ? '无补充备注。' : todo.notes;
    const assignee = todo.assignee === null ? '未分配。' : todo.assignee;
    const priority = { none: '未设置', low: '低', medium: '中', high: '高' }[todo.priority];
    return [
        `执行个人待办 ${todo.id}。`,
        '执行前请加载并遵循 personal-todo-execution Skill。',
        '',
        `标题：${todo.title}`,
        `备注：${notes}`,
        `负责人：${assignee}`,
        `优先级：${priority}`,
        `截止时间：${todo.dueAt ?? '未设置'}`,
        `标签：${todo.tags.length === 0 ? '无' : JSON.stringify(todo.tags)}`,
    ].join('\n');
}
function replyPrompt(todoId, message) {
    return `用户已回复阻塞中的个人待办 ${todoId}：\n\n${message}\n\n请继续执行任务，结果准备就绪后提交审核。`;
}
function changesPrompt(todoId, feedback) {
    return `用户要求修改个人待办 ${todoId}：\n\n${feedback}\n\n请根据反馈调整，汇报有意义的进展，并在结果准备就绪后重新提交审核。`;
}
function recoveryPrompt(todoId) {
    return `DSH 服务重启后，恢复执行个人待办 ${todoId}。执行前请查看已有对话，仅继续未完成的工作，结果准备就绪后提交审核。`;
}
/** 启动和恢复每条待办所属的唯一普通根会话。 */
export class TodoOrchestrator {
    store;
    sessions;
    config;
    agents;
    changing = new Set();
    idleRuns = new Map();
    observations = new Map();
    disposed = false;
    constructor(store, sessions, config, agents) {
        this.store = store;
        this.sessions = sessions;
        this.config = config;
        this.agents = agents;
    }
    dispose() {
        this.disposed = true;
        this.observations.clear();
        this.idleRuns.clear();
    }
    assertAvailable(id) {
        if (this.changing.has(id))
            throw new PersonalTodoError('任务正在切换执行状态，请稍后重试。');
    }
    async exclusive(id, operation) {
        this.assertAvailable(id);
        this.changing.add(id);
        let succeeded = false;
        try {
            await operation();
            succeeded = true;
        }
        finally {
            this.changing.delete(id);
            const runId = this.idleRuns.get(id);
            this.idleRuns.delete(id);
            if (succeeded && runId !== undefined)
                this.settleIdle(id, runId);
        }
        return this.store.get(id);
    }
    settleIdle(id, runId) {
        if (this.disposed)
            return;
        const todo = this.store.get(id);
        if (todo.activeRunId === runId && todo.executionStatus === 'running') {
            this.store.stopExecution(id, 'Agent 已停止，尚未提交结果；可重试或由用户接手。');
        }
    }
    observe(id, runId, agent) {
        const observation = Symbol();
        this.observations.set(id, observation);
        void agent.whenIdle().then(() => {
            if (this.disposed || this.observations.get(id) !== observation || agent.status !== 'idle')
                return;
            this.observations.delete(id);
            if (this.changing.has(id))
                this.idleRuns.set(id, runId);
            else
                this.settleIdle(id, runId);
        }).catch(() => undefined);
    }
    async stopAgents(id) {
        this.observations.delete(id);
        this.idleRuns.delete(id);
        const deadline = Date.now() + 15_000;
        const stopped = new Set();
        while (true) {
            const agents = this.store.detail(id).sessions
                .map(session => this.agents.get(session.sessionId))
                .filter((agent) => agent !== undefined && (!stopped.has(agent) || agent.status !== 'idle'));
            if (agents.length === 0)
                return;
            if (Date.now() >= deadline)
                throw new PersonalTodoError('未能确认 Agent 已停止，任务状态未变更，请稍后重试。');
            for (const agent of agents)
                agent.cancel({ kind: 'user' });
            let timeout;
            try {
                await Promise.race([
                    Promise.all(agents.map(agent => agent.whenIdle())),
                    new Promise((_resolve, reject) => {
                        timeout = setTimeout(() => { reject(new PersonalTodoError('未能确认 Agent 已停止，任务状态未变更，请稍后重试。')); }, Math.max(0, deadline - Date.now()));
                    }),
                ]);
                if (agents.some(agent => agent.status !== 'idle'))
                    throw new PersonalTodoError('Agent 仍在执行，任务状态未变更。');
                for (const agent of agents)
                    stopped.add(agent);
            }
            finally {
                if (timeout !== undefined)
                    clearTimeout(timeout);
            }
        }
    }
    setStatus(id, status) {
        return this.exclusive(id, async () => {
            if (!TODO_STATUSES.includes(status))
                throw new PersonalTodoError('无效的任务状态。');
            const before = this.store.get(id);
            if (before.status === status)
                return before;
            await this.stopAgents(id);
            if (this.store.get(id).executionStatus !== 'submitted')
                this.store.stopExecution(id);
            return this.store.setStatus(id, status);
        });
    }
    stop(id) {
        return this.exclusive(id, async () => {
            await this.stopAgents(id);
            return this.store.stopExecution(id);
        });
    }
    archive(id) {
        return this.exclusive(id, async () => {
            await this.stopAgents(id);
            this.store.stopExecution(id);
            return this.store.archive(id);
        });
    }
    async deliver(sessionId, text) {
        const resolved = await this.sessions.resolveAgent(sessionId);
        if ('error' in resolved)
            throw new PersonalTodoError(resolved.error.message);
        resolved.agent.followup({
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'user' },
        });
        return resolved.agent;
    }
    /** 恢复已持久化且 Agent 尚未运行的执行中待办。 */
    async recover(signal) {
        for (const todo of this.store.recoverableTodos()) {
            signal.throwIfAborted();
            if (this.changing.has(todo.id))
                continue;
            await this.exclusive(todo.id, async () => {
                const current = this.store.get(todo.id);
                if (current.activeRunId !== todo.activeRunId || current.executionStatus !== 'running')
                    return current;
                const sessionId = current.primarySessionId;
                const runId = current.activeRunId;
                try {
                    const resolved = await this.sessions.resolveAgent(sessionId);
                    signal.throwIfAborted();
                    if ('error' in resolved)
                        throw new PersonalTodoError(resolved.error.message);
                    if (resolved.agent.status !== 'running')
                        resolved.agent.followup({
                            id: randomUUID(),
                            role: 'user',
                            content: [{ type: 'text', text: recoveryPrompt(todo.id) }],
                            source: { kind: 'user' },
                        });
                    this.observe(todo.id, runId, resolved.agent);
                }
                catch (error) {
                    if (signal.aborted)
                        throw error;
                    this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
                }
                return this.store.get(todo.id);
            });
        }
    }
    /** 创建或复用根会话，并派发一条待处理待办。 */
    async start(id) {
        return this.exclusive(id, () => this.startRun(id));
    }
    async startRun(id) {
        const before = this.store.get(id);
        const runId = randomUUID();
        const sessionId = before.primarySessionId ?? `personal-todo-${before.id}`;
        this.store.beginRun(id, runId, sessionId);
        try {
            await this.sessions.create({
                sessionId,
                ...(this.config.agentPreset === undefined ? {} : { agentPreset: this.config.agentPreset }),
            });
            const agent = await this.deliver(sessionId, taskPrompt(before));
            this.observe(id, runId, agent);
            return this.store.get(id);
        }
        catch (error) {
            this.store.failRun(id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /** 将用户回复发送到被阻塞待办的根会话。 */
    async reply(request) {
        return this.exclusive(request.id, () => this.replyRun(request));
    }
    async replyRun(request) {
        const todo = this.store.reply(request);
        const sessionId = todo.primarySessionId;
        const runId = todo.activeRunId;
        if (sessionId === null || runId === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no active Session`);
        try {
            const agent = await this.deliver(sessionId, replyPrompt(todo.id, request.message.trim()));
            this.observe(todo.id, runId, agent);
            return this.store.get(todo.id);
        }
        catch (error) {
            this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /** 携带用户审核意见，在同一根会话中开始新一轮执行。 */
    async requestChanges(request) {
        return this.exclusive(request.id, () => this.changeRun(request));
    }
    async changeRun(request) {
        const runId = randomUUID();
        const todo = this.store.requestChanges(request, runId);
        const sessionId = todo.primarySessionId;
        if (sessionId === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no primary Session`);
        try {
            const agent = await this.deliver(sessionId, changesPrompt(todo.id, request.feedback.trim()));
            this.observe(todo.id, runId, agent);
            return this.store.get(todo.id);
        }
        catch (error) {
            this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
}
//# sourceMappingURL=orchestrator.js.map

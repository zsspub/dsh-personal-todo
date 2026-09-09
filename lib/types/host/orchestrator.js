/** 基于 Host 普通会话服务编排待办的启动与恢复。 */
import { randomUUID } from 'node:crypto';
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
    constructor(store, sessions, config) {
        this.store = store;
        this.sessions = sessions;
        this.config = config;
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
    }
    /** 恢复已持久化且 Agent 尚未运行的执行中待办。 */
    async recover(signal) {
        for (const todo of this.store.recoverableTodos()) {
            signal.throwIfAborted();
            const sessionId = todo.primarySessionId;
            const runId = todo.activeRunId;
            try {
                const resolved = await this.sessions.resolveAgent(sessionId);
                signal.throwIfAborted();
                if ('error' in resolved)
                    throw new PersonalTodoError(resolved.error.message);
                if (resolved.agent.status === 'running')
                    continue;
                resolved.agent.followup({
                    id: randomUUID(),
                    role: 'user',
                    content: [{ type: 'text', text: recoveryPrompt(todo.id) }],
                    source: { kind: 'user' },
                });
            }
            catch (error) {
                if (signal.aborted)
                    return;
                this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
            }
        }
    }
    /** 创建或复用根会话，并派发一条待处理待办。 */
    async start(id) {
        const before = this.store.get(id);
        const runId = randomUUID();
        const sessionId = before.primarySessionId ?? `personal-todo-${before.id}`;
        this.store.beginRun(id, runId, sessionId);
        try {
            await this.sessions.create({
                sessionId,
                ...(this.config.agentPreset === undefined ? {} : { agentPreset: this.config.agentPreset }),
            });
            await this.deliver(sessionId, taskPrompt(before));
            return this.store.get(id);
        }
        catch (error) {
            this.store.failRun(id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /** 将用户回复发送到被阻塞待办的根会话。 */
    async reply(request) {
        const todo = this.store.reply(request);
        const sessionId = todo.primarySessionId;
        const runId = todo.activeRunId;
        if (sessionId === null || runId === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no active Session`);
        try {
            await this.deliver(sessionId, replyPrompt(todo.id, request.message.trim()));
            return this.store.get(todo.id);
        }
        catch (error) {
            this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /** 携带用户审核意见，在同一根会话中开始新一轮执行。 */
    async requestChanges(request) {
        const runId = randomUUID();
        const todo = this.store.requestChanges(request, runId);
        const sessionId = todo.primarySessionId;
        if (sessionId === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no primary Session`);
        try {
            await this.deliver(sessionId, changesPrompt(todo.id, request.feedback.trim()));
            return this.store.get(todo.id);
        }
        catch (error) {
            this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
}
//# sourceMappingURL=orchestrator.js.map

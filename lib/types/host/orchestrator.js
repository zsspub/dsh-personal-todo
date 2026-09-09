/** 基于 Host 普通会话服务编排待办的启动与恢复。 */
import { randomUUID } from 'node:crypto';
import { PersonalTodoError, TodoStore } from "./store.js";
function taskPrompt(todo) {
    const notes = todo.notes === null ? 'No additional notes.' : todo.notes;
    const assignee = todo.assignee === null ? 'Unassigned.' : todo.assignee;
    return [
        `Execute personal todo ${todo.id}.`,
        `Title: ${todo.title}`,
        `Notes: ${notes}`,
        `Assignee: ${assignee}`,
        '',
        'Load and follow the personal-todo-execution skill before acting; it is the full procedure for this run.',
        'Work autonomously within the current DSH permissions and execution context.',
        `Report meaningful milestones with personal_todo_progress (id ${todo.id}); if user input is required, call personal_todo_block (id ${todo.id}) with the exact question; when the outcome is ready, call personal_todo_submit_review (id ${todo.id}) with a concise summary, verification performed, and remaining risks.`,
        'Do not mark the todo completed; only the user may approve it.',
    ].join('\n');
}
function replyPrompt(todoId, message) {
    return `The user replied to the blocked personal todo ${todoId}:\n\n${message}\n\nContinue the task and submit it for review when ready.`;
}
function changesPrompt(todoId, feedback) {
    return `The user requested changes for personal todo ${todoId}:\n\n${feedback}\n\nApply the feedback, report meaningful progress, and submit a new review when ready.`;
}
function recoveryPrompt(todoId) {
    return `Resume personal todo ${todoId} after the DSH service restart. Inspect the existing conversation before acting, continue only unfinished work, and submit the result for review when ready.`;
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

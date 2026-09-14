/** Host 服务、Agent 工具和 Web 客户端共用的 JSON 可序列化类型契约。 */
export const TODO_STATUSES = [
    'pending', 'in_progress', 'completed', 'cancelled',
];
export const TODO_PRIORITIES = ['none', 'low', 'medium', 'high'];
export const TODO_RUN_STATUSES = ['running', 'waiting_input', 'submitted', 'failed', 'cancelled'];
export const TODO_EVENT_TYPES = [
    'created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied',
    'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled',
    'archived', 'restored',
];
//# sourceMappingURL=types.js.map

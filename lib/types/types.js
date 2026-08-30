/** JSON-safe contracts shared by the Host service, Agent tools, and Web client. */
export const TODO_STATUSES = [
    'pending', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled',
];
export const TODO_PRIORITIES = ['none', 'low', 'medium', 'high'];
export const TODO_RUN_STATUSES = ['running', 'waiting_input', 'submitted', 'failed', 'cancelled'];
export const TODO_EVENT_TYPES = [
    'created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied',
    'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled',
];
//# sourceMappingURL=types.js.map

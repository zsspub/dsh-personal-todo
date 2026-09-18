/** 侧栏与对话卡片共用的单项待办动作规则。 */
export function todoActionState(todo) {
    const actionable = todo.status === 'pending' || todo.status === 'in_progress';
    const archived = todo.archivedAt !== null;
    const running = todo.executionStatus === 'running';
    return {
        actionable,
        archived,
        running,
        canStart: actionable && !archived && !running,
        canComplete: actionable,
        canReopen: !actionable,
        canCancel: actionable,
        canArchive: !archived,
        canRestore: archived,
        canDelete: archived || todo.status !== 'in_progress',
        canOpenConversation: todo.primarySessionId !== null,
    };
}
export function requiresAgentStop(todo, action) {
    return todo.executionStatus === 'running'
        && (action === 'complete' || action === 'pending' || action === 'cancel' || action === 'archive' || action === 'stop');
}
//# sourceMappingURL=todo-actions.js.map

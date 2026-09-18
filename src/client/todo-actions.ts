/** 侧栏与对话卡片共用的单项待办动作规则。 */

import type { Todo } from '../types.ts'

export type TodoLifecycleAction = 'complete' | 'pending' | 'cancel' | 'archive' | 'stop'

export interface TodoActionState {
  readonly actionable: boolean
  readonly archived: boolean
  readonly running: boolean
  readonly canStart: boolean
  readonly canComplete: boolean
  readonly canReopen: boolean
  readonly canCancel: boolean
  readonly canArchive: boolean
  readonly canRestore: boolean
  readonly canDelete: boolean
  readonly canOpenConversation: boolean
}

export function todoActionState(todo: Todo): TodoActionState {
  const actionable = todo.status === 'pending' || todo.status === 'in_progress'
  const archived = todo.archivedAt !== null
  const running = todo.executionStatus === 'running'
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
  }
}

export function requiresAgentStop(todo: Todo, action: TodoLifecycleAction): boolean {
  return todo.executionStatus === 'running'
    && (action === 'complete' || action === 'pending' || action === 'cancel' || action === 'archive' || action === 'stop')
}

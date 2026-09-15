/** Host 服务、Agent 工具和 Web 客户端共用的 JSON 可序列化类型契约。 */

export const TODO_STATUSES = [
  'pending', 'in_progress', 'completed', 'cancelled',
] as const
export const TODO_PRIORITIES = ['none', 'low', 'medium', 'high'] as const
export const TODO_RUN_STATUSES = ['running', 'waiting_input', 'submitted', 'failed', 'cancelled'] as const
export const TODO_EVENT_TYPES = [
  'created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied',
  'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled',
  'archived', 'restored',
] as const

export type TodoStatus = (typeof TODO_STATUSES)[number]
export type TodoPriority = (typeof TODO_PRIORITIES)[number]
export type TodoRunStatus = (typeof TODO_RUN_STATUSES)[number]
export type TodoEventType = (typeof TODO_EVENT_TYPES)[number]
export type TodoLiveStatus = 'running' | 'idle' | 'failed' | 'stopped' | 'unavailable'
export type TodoExecutionStatus = TodoLiveStatus | 'waiting_input' | 'submitted'

/** 一条持久化个人待办；时间戳采用标准 RFC 3339 UTC 字符串。 */
export interface Todo {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  readonly assignee: string | null
  readonly status: TodoStatus
  readonly executionStatus: TodoExecutionStatus | null
  readonly priority: TodoPriority
  readonly dueAt: string | null
  readonly tags: string[]
  readonly primarySessionId: string | null
  readonly activeRunId: string | null
  readonly latestSummary: string | null
  readonly blockedReason: string | null
  readonly reviewRound: number
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
  readonly archivedAt: string | null
}

/** 待办的一轮 Agent 执行周期。 */
export interface TodoRun {
  readonly id: string
  readonly todoId: string
  readonly sequence: number
  readonly status: TodoRunStatus
  readonly rootSessionId: string
  readonly resultSummary: string | null
  readonly verification: string | null
  readonly risk: string | null
  readonly startedAt: string
  readonly finishedAt: string | null
}

/** 与待办关联的一条持久化会话记录。 */
export interface TodoSession {
  readonly todoId: string
  readonly sessionId: string
  readonly role: 'primary' | 'related'
  readonly parentSessionId: string | null
  readonly createdAt: string
}

/** 一条不可变、用户可见的待办活动记录。 */
export interface TodoEvent {
  readonly id: string
  readonly todoId: string
  readonly runId: string | null
  readonly type: TodoEventType
  readonly message: string | null
  readonly createdAt: string
}

/** 待办快照及其执行、会话和活动历史。 */
export interface TodoDetail {
  readonly todo: Todo
  readonly runs: TodoRun[]
  readonly sessions: TodoSession[]
  readonly events: TodoEvent[]
}

export type LiveTodo = Omit<Todo, 'executionStatus'> & { readonly executionStatus: TodoLiveStatus | null }
export type LiveTodoDetail = Omit<TodoDetail, 'todo'> & { readonly todo: LiveTodo }
export type LiveTodoListResult = Omit<TodoListResult, 'todos'> & { readonly todos: LiveTodo[] }

/** 创建待办时接受的字段；新待办始终从待处理状态开始。 */
export interface CreateTodoInput {
  readonly title: string
  readonly notes?: string | null
  readonly assignee?: string | null
  readonly priority?: TodoPriority
  readonly dueAt?: string | null
  readonly tags?: readonly string[]
}

/** 可编辑的待办字段；生命周期变更使用专用命令。 */
export interface UpdateTodoPatch {
  readonly title?: string
  readonly notes?: string | null
  readonly assignee?: string | null
  readonly priority?: TodoPriority
  readonly dueAt?: string | null
  readonly tags?: readonly string[]
}

/** 通过不透明标识符更新待办。 */
export interface UpdateTodoRequest {
  readonly id: string
  readonly patch: UpdateTodoPatch
}

/** 通过不透明标识符定位待办。 */
export interface TodoIdRequest {
  readonly id: string
}

export interface SetTodoStatusRequest extends TodoIdRequest {
  readonly status: TodoStatus
}

/** 通过不透明标识符删除待办。 */
export type DeleteTodoRequest = TodoIdRequest

/** 用户对 Agent 阻塞问题的回复。 */
export interface ReplyTodoRequest extends TodoIdRequest {
  readonly message: string
}

/** 触发新一轮执行的用户修改意见。 */
export interface RequestTodoChangesRequest extends TodoIdRequest {
  readonly feedback: string
}

/** Agent 汇报的进度更新。 */
export interface ReportTodoProgressRequest extends TodoIdRequest {
  readonly message: string
}

/** Agent 提出的阻塞问题。 */
export interface BlockTodoRequest extends TodoIdRequest {
  readonly question: string
}

/** Agent 提交的审核结果。 */
export interface SubmitTodoReviewRequest extends TodoIdRequest {
  readonly summary: string
  readonly verification?: string | null
  readonly risk?: string | null
}

/** 待办列表的筛选和分页条件；必须匹配所有指定标签。 */
export interface ListTodoInput {
  readonly statuses?: readonly TodoStatus[]
  readonly priorities?: readonly TodoPriority[]
  readonly tags?: readonly string[]
  readonly dueBefore?: string
  readonly search?: string
  readonly limit?: number
  readonly offset?: number
  /** 为 true 时返回归档待办，否则排除归档待办。 */
  readonly archived?: boolean
}

/** 整个数据库的状态计数，不受列表筛选条件影响。 */
export interface TodoCounts {
  readonly pending: number
  readonly inProgress: number
  readonly completed: number
  readonly cancelled: number
  readonly archived: number
}

/** 一页有数量上限的待办，以及全局生命周期计数。 */
export interface TodoListResult {
  readonly todos: Todo[]
  readonly total: number
  readonly counts: TodoCounts
  readonly hasMore: boolean
}

/** 永久删除成功的结果。 */
export interface DeleteTodoResult {
  readonly id: string
  readonly deleted: true
}

export interface TodoBackup {
  readonly format: 'dsh-personal-todo'
  readonly version: 2
  readonly exportedAt: string
  readonly todos: TodoDetail[]
}

export type ExportTodoDataRequest = Record<string, never>

export interface ExportTodoDataResult {
  readonly filename: string
  readonly json: string
}

export interface ImportTodoDataRequest {
  readonly json: string
}

export interface ImportTodoDataResult {
  readonly imported: number
  readonly skipped: number
  readonly resetToPending: number
}

/** JSON-safe contracts shared by the Host service, Agent tools, and Web client. */

export const TODO_STATUSES = ['pending', 'in_progress', 'completed'] as const
export const TODO_PRIORITIES = ['none', 'low', 'medium', 'high'] as const

export type TodoStatus = (typeof TODO_STATUSES)[number]
export type TodoPriority = (typeof TODO_PRIORITIES)[number]

/** One durable personal todo. Timestamps use canonical RFC 3339 UTC strings. */
export interface Todo {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  readonly status: TodoStatus
  readonly priority: TodoPriority
  readonly dueAt: string | null
  readonly tags: string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
}

/** Fields accepted when creating a todo. */
export interface CreateTodoInput {
  readonly title: string
  readonly notes?: string | null
  readonly status?: TodoStatus
  readonly priority?: TodoPriority
  readonly dueAt?: string | null
  readonly tags?: readonly string[]
}

/** Mutable fields for an existing todo. Null clears notes or dueAt; tags replace the full set. */
export interface UpdateTodoPatch {
  readonly title?: string
  readonly notes?: string | null
  readonly status?: TodoStatus
  readonly priority?: TodoPriority
  readonly dueAt?: string | null
  readonly tags?: readonly string[]
}

/** Update one todo by opaque id. */
export interface UpdateTodoRequest {
  readonly id: string
  readonly patch: UpdateTodoPatch
}

/** Delete one todo by opaque id. */
export interface DeleteTodoRequest {
  readonly id: string
}

/** Filters and pagination for a todo listing. Every supplied tag must match. */
export interface ListTodoInput {
  readonly statuses?: readonly TodoStatus[]
  readonly priorities?: readonly TodoPriority[]
  readonly tags?: readonly string[]
  readonly dueBefore?: string
  readonly search?: string
  readonly limit?: number
  readonly offset?: number
}

/** Counts across the complete database, independent of list filters. */
export interface TodoCounts {
  readonly pending: number
  readonly inProgress: number
  readonly completed: number
}

/** One bounded page plus global lifecycle counts. */
export interface TodoListResult {
  readonly todos: Todo[]
  readonly total: number
  readonly counts: TodoCounts
  readonly hasMore: boolean
}

/** Successful hard-delete result. */
export interface DeleteTodoResult {
  readonly id: string
  readonly deleted: true
}

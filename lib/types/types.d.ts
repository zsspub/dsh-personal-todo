/** JSON-safe contracts shared by the Host service, Agent tools, and Web client. */
export declare const TODO_STATUSES: readonly ["pending", "in_progress", "blocked", "in_review", "completed", "cancelled"];
export declare const TODO_PRIORITIES: readonly ["none", "low", "medium", "high"];
export declare const TODO_RUN_STATUSES: readonly ["running", "waiting_input", "submitted", "failed", "cancelled"];
export declare const TODO_EVENT_TYPES: readonly ["created", "updated", "run_started", "progress", "blocked", "user_replied", "review_submitted", "review_approved", "changes_requested", "run_failed", "cancelled"];
export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoPriority = (typeof TODO_PRIORITIES)[number];
export type TodoRunStatus = (typeof TODO_RUN_STATUSES)[number];
export type TodoEventType = (typeof TODO_EVENT_TYPES)[number];
/** One durable personal todo. Timestamps use canonical RFC 3339 UTC strings. */
export interface Todo {
    readonly id: string;
    readonly title: string;
    readonly notes: string | null;
    readonly status: TodoStatus;
    readonly priority: TodoPriority;
    readonly dueAt: string | null;
    readonly tags: string[];
    readonly primarySessionId: string | null;
    readonly activeRunId: string | null;
    readonly latestSummary: string | null;
    readonly blockedReason: string | null;
    readonly reviewRound: number;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly completedAt: string | null;
}
/** One Agent execution cycle for a todo. */
export interface TodoRun {
    readonly id: string;
    readonly todoId: string;
    readonly sequence: number;
    readonly status: TodoRunStatus;
    readonly rootSessionId: string;
    readonly resultSummary: string | null;
    readonly verification: string | null;
    readonly risk: string | null;
    readonly startedAt: string;
    readonly finishedAt: string | null;
}
/** One durable Session associated with a todo. */
export interface TodoSession {
    readonly todoId: string;
    readonly sessionId: string;
    readonly role: 'primary' | 'related';
    readonly parentSessionId: string | null;
    readonly createdAt: string;
}
/** One immutable user-visible todo activity record. */
export interface TodoEvent {
    readonly id: string;
    readonly todoId: string;
    readonly runId: string | null;
    readonly type: TodoEventType;
    readonly message: string | null;
    readonly createdAt: string;
}
/** Todo snapshot plus its execution, Session, and activity history. */
export interface TodoDetail {
    readonly todo: Todo;
    readonly runs: TodoRun[];
    readonly sessions: TodoSession[];
    readonly events: TodoEvent[];
}
/** Fields accepted when creating a todo. New todos always begin pending. */
export interface CreateTodoInput {
    readonly title: string;
    readonly notes?: string | null;
    readonly priority?: TodoPriority;
    readonly dueAt?: string | null;
    readonly tags?: readonly string[];
}
/** Editable todo fields. Lifecycle changes use dedicated commands. */
export interface UpdateTodoPatch {
    readonly title?: string;
    readonly notes?: string | null;
    readonly priority?: TodoPriority;
    readonly dueAt?: string | null;
    readonly tags?: readonly string[];
}
/** Update one todo by opaque id. */
export interface UpdateTodoRequest {
    readonly id: string;
    readonly patch: UpdateTodoPatch;
}
/** Address one todo by opaque id. */
export interface TodoIdRequest {
    readonly id: string;
}
/** Delete one todo by opaque id. */
export type DeleteTodoRequest = TodoIdRequest;
/** User reply to an Agent-blocked todo. */
export interface ReplyTodoRequest extends TodoIdRequest {
    readonly message: string;
}
/** User feedback that starts another execution cycle. */
export interface RequestTodoChangesRequest extends TodoIdRequest {
    readonly feedback: string;
}
/** Agent-authored progress update. */
export interface ReportTodoProgressRequest extends TodoIdRequest {
    readonly message: string;
}
/** Agent-authored blocking question. */
export interface BlockTodoRequest extends TodoIdRequest {
    readonly question: string;
}
/** Agent-authored review submission. */
export interface SubmitTodoReviewRequest extends TodoIdRequest {
    readonly summary: string;
    readonly verification?: string | null;
    readonly risk?: string | null;
}
/** Filters and pagination for a todo listing. Every supplied tag must match. */
export interface ListTodoInput {
    readonly statuses?: readonly TodoStatus[];
    readonly priorities?: readonly TodoPriority[];
    readonly tags?: readonly string[];
    readonly dueBefore?: string;
    readonly search?: string;
    readonly limit?: number;
    readonly offset?: number;
}
/** Counts across the complete database, independent of list filters. */
export interface TodoCounts {
    readonly pending: number;
    readonly inProgress: number;
    readonly blocked: number;
    readonly inReview: number;
    readonly completed: number;
    readonly cancelled: number;
}
/** One bounded page plus global lifecycle counts. */
export interface TodoListResult {
    readonly todos: Todo[];
    readonly total: number;
    readonly counts: TodoCounts;
    readonly hasMore: boolean;
}
/** Successful hard-delete result. */
export interface DeleteTodoResult {
    readonly id: string;
    readonly deleted: true;
}

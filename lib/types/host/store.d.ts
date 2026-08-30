/** SQLite owner for personal todo validation, ordering, and durable writes. */
import type { BlockTodoRequest, CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest, Todo, TodoDetail, TodoListResult, TodoSession, UpdateTodoPatch } from '../types.ts';
export declare const PERSONAL_TODO_SCHEMA_VERSION = 3;
export type JournalMode = 'wal' | 'delete' | 'truncate' | 'persist';
export interface TodoStoreConfig {
    readonly databasePath: string;
    readonly journalMode: JournalMode;
    readonly busyTimeoutMs: number;
    readonly defaultListLimit: number;
    readonly maxListLimit: number;
}
interface TodoStoreDependencies {
    readonly now?: () => number;
    readonly createId?: () => string;
    readonly createEventId?: () => string;
}
/** Stable domain failure surfaced through tools and Remote calls. */
export declare class PersonalTodoError extends Error {
    constructor(message: string);
}
/** Synchronous SQLite repository. Each public mutation is one database transaction. */
export declare class TodoStore {
    private readonly config;
    private readonly database;
    private readonly now;
    private readonly createId;
    private readonly createEventId;
    private closed;
    constructor(config: TodoStoreConfig, dependencies?: TodoStoreDependencies);
    private initialize;
    private createSchema;
    private migrateV1;
    private migrateV2;
    private assertOpen;
    private transaction;
    private tagsFor;
    private todoFromRow;
    private runFromRow;
    private sessionFromRow;
    private eventFromRow;
    private find;
    private requireRow;
    private requireStatus;
    private requireOwnedRun;
    private appendEvent;
    /** Return one todo snapshot or fail for an unknown id. */
    get(id: string): Todo;
    /** Return one todo with its durable execution history. */
    detail(id: string): TodoDetail;
    /** Create and durably return one normalized pending todo. */
    create(input: CreateTodoInput): Todo;
    /** Replace supplied editable fields and return the durable todo. */
    update(id: string, patch: UpdateTodoPatch): Todo;
    /** Claim a pending todo and create its first Agent execution cycle. */
    beginRun(id: string, runId: string, sessionId: string): Todo;
    /** Attach one child Session when its direct parent already belongs to a todo. */
    linkRelatedSession(parentSessionId: string, sessionId: string): TodoSession | undefined;
    /** Return running todos whose existing root Sessions need process-start recovery. */
    recoverableTodos(): Todo[];
    /** Return a failed initial dispatch to pending while retaining its audit record. */
    failRun(id: string, runId: string, message: string): Todo;
    /** Record progress from the todo's primary Agent Session. */
    progress(id: string, sessionId: string, message: string): Todo;
    /** Pause an in-progress todo on an Agent-authored user question. */
    block(request: BlockTodoRequest, sessionId: string): Todo;
    /** Resume a blocked todo after the user supplies an answer. */
    reply(request: ReplyTodoRequest): Todo;
    /** Submit Agent results for explicit user review. */
    submitReview(request: SubmitTodoReviewRequest, sessionId: string): Todo;
    /** Accept the latest Agent submission as complete. */
    approve(id: string): Todo;
    /** Return a reviewed todo to its primary Session in a new execution cycle. */
    requestChanges(request: RequestTodoChangesRequest, runId: string): Todo;
    /** Permanently delete one todo and its related records. */
    delete(id: string): DeleteTodoResult;
    /** Return a bounded filtered page and unfiltered status counts. */
    list(input?: ListTodoInput): TodoListResult;
    private normalizeEnumFilter;
    private counts;
    /** Release the SQLite handle. Repeated calls are harmless. */
    close(): void;
}
export {};

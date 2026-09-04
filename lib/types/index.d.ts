/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type TodoSessionController } from './host/orchestrator.ts';
import { type JournalMode } from './host/store.ts';
import type { BlockTodoRequest, CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput, ReplyTodoRequest, ReportTodoProgressRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest, Todo, TodoDetail, TodoIdRequest, TodoListResult, UpdateTodoRequest } from './types.ts';
export type * from './types.ts';
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from './host/store.ts';
export type { JournalMode, TodoStoreConfig } from './host/store.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        personalTodo: PersonalTodoService;
        sessionController: TodoSessionController;
    }
    interface Events {
        /** @mode emit */
        'session/created'(session: {
            readonly id: string;
            readonly header: {
                readonly parentSession?: string;
            };
        }): void;
    }
}
/** Deployment configuration for the personal todo database and list bounds. */
export interface Config {
    readonly databasePath: string;
    readonly journalMode?: JournalMode;
    readonly busyTimeoutMs?: number;
    readonly defaultListLimit?: number;
    readonly maxListLimit?: number;
    /** Optional Agent preset used by todo-created root Sessions. */
    readonly agentPreset?: string;
}
/** Authoritative todo service shared by generated Remote methods and Agent tools. */
export declare class PersonalTodoService extends TypertRemoteService {
    static inject: string[];
    static Config: z<Config>;
    private readonly store;
    private readonly orchestrator;
    /** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
    constructor(ctx: Context, config: Config);
    /** List one bounded page. Cancellation is checked before synchronous SQLite work begins. */
    list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    /** Create one durable todo. */
    create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo>;
    /** Read one todo with its runs, Sessions, and activity timeline. */
    get(request: TodoIdRequest, signal: AbortSignal): Promise<TodoDetail>;
    /** Update one durable todo. */
    update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo>;
    /** Start one pending todo in its durable root Session. */
    start(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** Resume a blocked todo with the user's answer. */
    reply(request: ReplyTodoRequest, signal: AbortSignal): Promise<Todo>;
    /** Accept the latest Agent submission as complete. */
    approve(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** Move one todo to the archive without changing its lifecycle state. */
    archive(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** Restore one archived todo to its lifecycle list. */
    restore(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** Return the reviewed todo to its root Session with user feedback. */
    requestChanges(request: RequestTodoChangesRequest, signal: AbortSignal): Promise<Todo>;
    /** Return exact source fields for delegation by the active primary Agent Session. */
    delegationSource(id: string, sessionId: string): Todo;
    /** Return the active todo linked to one Session, when present. */
    activeTodoForSession(sessionId: string): Todo | undefined;
    /** Record one progress milestone from the todo's primary Agent Session. */
    reportProgress(request: ReportTodoProgressRequest, sessionId: string): Promise<Todo>;
    /** Pause one todo on a question from its primary Agent Session. */
    block(request: BlockTodoRequest, sessionId: string): Promise<Todo>;
    /** Submit one primary Agent Session's result for user review. */
    submitReview(request: SubmitTodoReviewRequest, sessionId: string): Promise<Todo>;
    /** Permanently delete one todo. */
    delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult>;
}
export default PersonalTodoService;

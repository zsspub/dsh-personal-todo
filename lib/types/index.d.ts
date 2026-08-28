/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type JournalMode } from './host/store.ts';
import type { CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput, Todo, TodoListResult, UpdateTodoRequest } from './types.ts';
export type * from './types.ts';
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from './host/store.ts';
export type { JournalMode, TodoStoreConfig } from './host/store.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        personalTodo: PersonalTodoService;
    }
}
/** Deployment configuration for the personal todo database and list bounds. */
export interface Config {
    readonly databasePath: string;
    readonly journalMode?: JournalMode;
    readonly busyTimeoutMs?: number;
    readonly defaultListLimit?: number;
    readonly maxListLimit?: number;
}
/** Authoritative todo service shared by generated Remote methods and Agent tools. */
export declare class PersonalTodoService extends TypertRemoteService {
    static Config: z<Config>;
    private readonly store;
    /** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
    constructor(ctx: Context, config: Config);
    /** List one bounded page. Cancellation is checked before synchronous SQLite work begins. */
    list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    /** Create one durable todo. */
    create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo>;
    /** Update one durable todo. */
    update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo>;
    /** Permanently delete one todo. */
    delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult>;
}
export default PersonalTodoService;

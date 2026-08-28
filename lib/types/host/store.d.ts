/** SQLite owner for personal todo validation, ordering, and durable writes. */
import type { CreateTodoInput, DeleteTodoResult, ListTodoInput, Todo, TodoListResult, UpdateTodoPatch } from '../types.ts';
export declare const PERSONAL_TODO_SCHEMA_VERSION = 1;
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
    private closed;
    constructor(config: TodoStoreConfig, dependencies?: TodoStoreDependencies);
    private initialize;
    private createSchema;
    private assertOpen;
    private transaction;
    private tagsFor;
    private todoFromRow;
    private find;
    private requireRow;
    /** Create and durably return one normalized todo. */
    create(input: CreateTodoInput): Todo;
    /** Replace supplied mutable fields and return the durable todo. */
    update(id: string, patch: UpdateTodoPatch): Todo;
    /** Permanently delete one todo; unknown ids fail instead of reporting a false success. */
    delete(id: string): DeleteTodoResult;
    /** Return a bounded filtered page and unfiltered status counts. */
    list(input?: ListTodoInput): TodoListResult;
    private normalizeEnumFilter;
    private counts;
    /** Release the SQLite handle. Repeated calls are harmless. */
    close(): void;
}
export {};

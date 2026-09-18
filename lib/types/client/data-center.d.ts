/** 个人待办 Web 客户端的唯一数据中心。 */
import { type ReadableAtom } from 'nanostores';
import type { CreateTodoInput, DeleteTodoResult, ExportTodoDataResult, ImportTodoDataRequest, ImportTodoDataResult, ListTodoInput, SetTodoStatusRequest, Todo, TodoCounts, TodoDetail, TodoListResult, UpdateTodoRequest } from '../types.ts';
import { PersonalTodoCanvasController } from './canvas.ts';
export type TodoQueryMode = 'paged' | 'all';
export type TodoMutationKind = 'update' | 'start' | 'setStatus' | 'stop' | 'approve' | 'archive' | 'restore' | 'delete';
export interface TodoMutationState {
    readonly kind: TodoMutationKind;
    readonly startedAt: number;
}
export interface TodoQuerySnapshot {
    readonly ids: readonly string[];
    readonly total: number;
    readonly counts: TodoCounts;
    readonly hasMore: boolean;
    readonly loading: boolean;
    readonly refreshing: boolean;
    readonly error: string | undefined;
    readonly updatedAt: number | undefined;
}
export interface TodoQuerySeed {
    readonly todos: readonly Todo[];
    readonly total: number;
    readonly counts?: TodoCounts;
    readonly hasMore?: boolean;
}
export interface TodoQueryHandle {
    readonly key: string;
    readonly mode: TodoQueryMode;
    readonly request: Readonly<ListTodoInput>;
    readonly store: ReadableAtom<TodoQuerySnapshot>;
    readonly getSnapshot: () => TodoQuerySnapshot;
    readonly subscribe: (listener: () => void) => () => void;
    readonly seed: (seed: TodoQuerySeed) => void;
    readonly refresh: () => Promise<TodoQuerySnapshot>;
    readonly loadMore: () => Promise<TodoQuerySnapshot>;
}
export interface PersonalTodoRemoteApi {
    readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>;
    readonly exportData: (signal: AbortSignal) => Promise<ExportTodoDataResult>;
    readonly importData: (request: ImportTodoDataRequest, signal: AbortSignal) => Promise<ImportTodoDataResult>;
    readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>;
    readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>;
    readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly start: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly setStatus: (request: SetTodoStatusRequest, signal: AbortSignal) => Promise<Todo>;
    readonly stop: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly archive: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly restore: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>;
}
interface FocusTarget {
    addEventListener(type: 'focus', listener: () => void): void;
    removeEventListener(type: 'focus', listener: () => void): void;
    setInterval(handler: () => void, timeout: number): number;
    clearInterval(id: number): void;
}
interface DataCenterOptions {
    readonly focusTarget?: FocusTarget;
    readonly now?: () => number;
    readonly panelRefreshMs?: number;
}
/** 返回忽略分页参数后的稳定查询键。 */
export declare function normalizeTodoQueryKey(input: ListTodoInput, mode: TodoQueryMode): string;
/**
 * 规范化并共享全部客户端待办状态。组件只保存草稿、菜单和弹窗等瞬时 UI 状态。
 */
export declare class PersonalTodoDataCenter {
    #private;
    readonly entities: import("nanostores").PreinitializedMapStore<Record<string, Todo>> & object;
    readonly details: import("nanostores").PreinitializedMapStore<Record<string, TodoDetail>> & object;
    readonly deletedIds: import("nanostores").PreinitializedMapStore<Record<string, true>> & object;
    readonly counts: import("nanostores").PreinitializedWritableAtom<TodoCounts> & object;
    readonly mutations: import("nanostores").PreinitializedMapStore<Record<string, TodoMutationState>> & object;
    readonly canvas: PersonalTodoCanvasController;
    constructor(remote: PersonalTodoRemoteApi, options?: DataCenterOptions);
    setOpenPanel(openPanel: () => void): void;
    openTodo(id?: string): void;
    setPanelVisible(visible: boolean): void;
    query(input: ListTodoInput, mode: TodoQueryMode, seed?: TodoQuerySeed): TodoQueryHandle;
    getEntity(id: string): Todo | undefined;
    seedTodos(todos: readonly Todo[]): void;
    isMutating(id: string): boolean;
    list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    get(id: string, signal: AbortSignal): Promise<TodoDetail>;
    exportData(signal: AbortSignal): Promise<ExportTodoDataResult>;
    importData(request: ImportTodoDataRequest, signal: AbortSignal): Promise<ImportTodoDataResult>;
    create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo>;
    update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo>;
    start(id: string, signal: AbortSignal): Promise<Todo>;
    approve(id: string, signal: AbortSignal): Promise<Todo>;
    setStatus(request: SetTodoStatusRequest, signal: AbortSignal): Promise<Todo>;
    stop(id: string, signal: AbortSignal): Promise<Todo>;
    archive(id: string, signal: AbortSignal): Promise<Todo>;
    restore(id: string, signal: AbortSignal): Promise<Todo>;
    delete(id: string, signal: AbortSignal): Promise<DeleteTodoResult>;
    refreshSubscribed(mode?: TodoQueryMode): Promise<void>;
    dispose(): void;
}
export {};

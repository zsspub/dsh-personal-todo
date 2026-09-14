/** 负责个人待办校验、排序和持久化写入的 SQLite 存储层。 */
import type { BlockTodoRequest, CreateTodoInput, DeleteTodoResult, ExportTodoDataResult, ImportTodoDataResult, ListTodoInput, ReplyTodoRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest, Todo, TodoDetail, TodoListResult, TodoSession, TodoStatus, UpdateTodoPatch } from '../types.ts';
export declare const PERSONAL_TODO_SCHEMA_VERSION = 6;
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
/** 通过工具与 Remote 调用返回的统一业务错误。 */
export declare class PersonalTodoError extends Error {
    constructor(message: string);
}
/** 同步 SQLite 存储库；每个公开写入操作均在一个数据库事务中完成。 */
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
    private migrateV3;
    private migrateV4;
    private assertOpen;
    private migrateV5;
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
    private requireRunStatus;
    private appendEvent;
    /** 返回待办快照；标识符不存在时抛出错误。 */
    get(id: string): Todo;
    /** 返回待办及其持久化执行历史。 */
    detail(id: string): TodoDetail;
    private readDetail;
    exportData(): ExportTodoDataResult;
    importData(json: string): ImportTodoDataResult;
    /** 规范化并持久化一条待处理待办，返回保存结果。 */
    create(input: CreateTodoInput): Todo;
    /** 替换指定的可编辑字段，返回持久化后的待办。 */
    update(id: string, patch: UpdateTodoPatch): Todo;
    /** 认领一条待处理待办，并创建其首轮 Agent 执行周期。 */
    beginRun(id: string, runId: string, sessionId: string): Todo;
    /** 直接父会话已关联待办时，将子会话关联到同一待办。 */
    linkRelatedSession(parentSessionId: string, sessionId: string): TodoSession | undefined;
    /** 返回服务启动后需要在原根会话中恢复的执行中待办。 */
    recoverableTodos(): Todo[];
    /** 保留失败轮次与任务进度，允许用户重试或接手。 */
    failRun(id: string, runId: string, message: string): Todo;
    /** 记录待办主 Agent 会话汇报的进度。 */
    progress(id: string, sessionId: string, message: string): Todo;
    /** 根据 Agent 提出的用户问题暂停执行中的待办。 */
    block(request: BlockTodoRequest, sessionId: string): Todo;
    /** 用户回复后恢复被阻塞的待办。 */
    reply(request: ReplyTodoRequest): Todo;
    /** 提交 Agent 结果，等待用户明确审核。 */
    submitReview(request: SubmitTodoReviewRequest, sessionId: string): Todo;
    /** 持久化用户完成操作；调用方须先协调停止实际 Agent。 */
    approve(id: string): Todo;
    setStatus(id: string, status: TodoStatus): Todo;
    stopExecution(id: string, message?: string): Todo;
    /** 在原主会话中创建新一轮执行，处理用户修改意见。 */
    requestChanges(request: RequestTodoChangesRequest, runId: string): Todo;
    /** 永久删除待办及其关联记录。 */
    delete(id: string): DeleteTodoResult;
    /** 将待办移出常规生命周期列表，不改变其状态。 */
    archive(id: string): Todo;
    /** 将归档待办恢复到其当前生命周期对应的列表。 */
    restore(id: string): Todo;
    /** 返回有数量上限的筛选结果页，以及不受筛选影响的状态计数。 */
    list(input?: ListTodoInput): TodoListResult;
    private normalizeEnumFilter;
    private counts;
    /** 释放 SQLite 连接；重复调用不会产生影响。 */
    close(): void;
}
export {};

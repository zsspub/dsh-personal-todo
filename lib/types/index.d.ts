/** 向工具和 Web Remote 调用提供统一 SQLite 个人待办数据库的 Host 服务。 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type TodoSessionController } from './host/orchestrator.ts';
import { type JournalMode } from './host/store.ts';
import type { BlockTodoRequest, CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput, ReplyTodoRequest, ReportTodoProgressRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest, Todo, TodoDetail, TodoIdRequest, TodoListResult, UpdateTodoRequest, ExportTodoDataRequest, ExportTodoDataResult, ImportTodoDataRequest, ImportTodoDataResult } from './types.ts';
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
/** 个人待办数据库及列表数量限制的部署配置。 */
export interface Config {
    readonly databasePath: string;
    readonly journalMode?: JournalMode;
    readonly busyTimeoutMs?: number;
    readonly defaultListLimit?: number;
    readonly maxListLimit?: number;
    /** 创建待办根会话时使用的可选 Agent 预设。 */
    readonly agentPreset?: string;
}
/** 生成的 Remote 方法与 Agent 工具共用的权威待办服务。 */
export declare class PersonalTodoService extends TypertRemoteService {
    static inject: string[];
    static Config: z<Config>;
    private readonly store;
    private readonly orchestrator;
    /** @param ctx - 发布 personalTodo Remote 命名空间的 Host 上下文。 @param config - 已校验的数据库配置。 */
    constructor(ctx: Context, config: Config);
    /** 查询一页待办；在开始同步 SQLite 操作前检查取消信号。 */
    list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    exportData(_request: ExportTodoDataRequest, signal: AbortSignal): Promise<ExportTodoDataResult>;
    importData(request: ImportTodoDataRequest, signal: AbortSignal): Promise<ImportTodoDataResult>;
    /** 创建并持久化一条待办。 */
    create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo>;
    /** 读取待办及其执行轮次、关联会话和活动记录。 */
    get(request: TodoIdRequest, signal: AbortSignal): Promise<TodoDetail>;
    /** 更新已持久化的待办。 */
    update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo>;
    /** 在待办的持久化根会话中启动一条待处理任务。 */
    start(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** 使用用户回复继续执行被阻塞的待办。 */
    reply(request: ReplyTodoRequest, signal: AbortSignal): Promise<Todo>;
    /** 用户完成待处理、执行中、阻塞或待审核的待办；保留历史，不中断 Agent。 */
    approve(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** 归档待办，不改变其生命周期状态。 */
    archive(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** 将归档待办恢复到对应生命周期列表。 */
    restore(request: TodoIdRequest, signal: AbortSignal): Promise<Todo>;
    /** 将用户修改意见发回待办的根会话。 */
    requestChanges(request: RequestTodoChangesRequest, signal: AbortSignal): Promise<Todo>;
    /** 记录待办主 Agent 会话汇报的进度节点。 */
    reportProgress(request: ReportTodoProgressRequest, sessionId: string): Promise<Todo>;
    /** 根据主 Agent 会话提出的问题暂停待办。 */
    block(request: BlockTodoRequest, sessionId: string): Promise<Todo>;
    /** 提交主 Agent 会话的执行结果，等待用户审核。 */
    submitReview(request: SubmitTodoReviewRequest, sessionId: string): Promise<Todo>;
    /** 永久删除一条待办。 */
    delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult>;
}
export default PersonalTodoService;

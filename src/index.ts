/** 向工具和 Web Remote 调用提供统一 SQLite 个人待办数据库的 Host 服务。 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { TodoOrchestrator, type TodoSessionController } from './host/orchestrator.ts'
import { TodoStore, type JournalMode } from './host/store.ts'
import type {
  BlockTodoRequest, CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput,
  ReplyTodoRequest, ReportTodoProgressRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest,
  Todo, TodoDetail, TodoIdRequest, TodoListResult, UpdateTodoRequest,
  ExportTodoDataRequest, ExportTodoDataResult, ImportTodoDataRequest, ImportTodoDataResult,
} from './types.ts'

export type * from './types.ts'
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from './host/store.ts'
export type { JournalMode, TodoStoreConfig } from './host/store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    personalTodo: PersonalTodoService
    sessionController: TodoSessionController
  }

  interface Events {
    /** @mode emit */
    'session/created'(session: {
      readonly id: string
      readonly header: { readonly parentSession?: string }
    }): void
  }
}

/** 个人待办数据库及列表数量限制的部署配置。 */
export interface Config {
  readonly databasePath: string
  readonly journalMode?: JournalMode
  readonly busyTimeoutMs?: number
  readonly defaultListLimit?: number
  readonly maxListLimit?: number
  /** 创建待办根会话时使用的可选 Agent 预设。 */
  readonly agentPreset?: string
}

interface ResolvedConfig {
  readonly databasePath: string
  readonly journalMode: JournalMode
  readonly busyTimeoutMs: number
  readonly defaultListLimit: number
  readonly maxListLimit: number
  readonly agentPreset?: string
}

const DEFAULTS = {
  journalMode: 'wal',
  busyTimeoutMs: 5_000,
  defaultListLimit: 50,
  maxListLimit: 200,
} as const

function resolveConfig(config: Config): ResolvedConfig {
  return {
    databasePath: config.databasePath,
    journalMode: config.journalMode ?? DEFAULTS.journalMode,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULTS.busyTimeoutMs,
    defaultListLimit: config.defaultListLimit ?? DEFAULTS.defaultListLimit,
    maxListLimit: config.maxListLimit ?? DEFAULTS.maxListLimit,
    ...(config.agentPreset === undefined ? {} : { agentPreset: config.agentPreset }),
  }
}

/** 生成的 Remote 方法与 Agent 工具共用的权威待办服务。 */
export class PersonalTodoService extends TypertRemoteService {
  static inject = ['sessionController', 'sessions']

  static Config: z<Config> = z.object({
    databasePath: z.string().required(),
    journalMode: z.union(['wal', 'delete', 'truncate', 'persist'] as const).default(DEFAULTS.journalMode),
    busyTimeoutMs: z.number().step(1).min(1).default(DEFAULTS.busyTimeoutMs),
    defaultListLimit: z.number().step(1).min(1).default(DEFAULTS.defaultListLimit),
    maxListLimit: z.number().step(1).min(1).default(DEFAULTS.maxListLimit),
    agentPreset: z.string(),
  })

  private readonly store: TodoStore
  private readonly orchestrator: TodoOrchestrator

  /** @param ctx - 发布 personalTodo Remote 命名空间的 Host 上下文。 @param config - 已校验的数据库配置。 */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'personalTodo')
    const resolved = resolveConfig(config)
    this.store = new TodoStore(resolved)
    this.orchestrator = new TodoOrchestrator(this.store, ctx.sessionController, resolved)
    ctx.on('session/created', (session) => {
      const parentSessionId = session.header.parentSession
      if (parentSessionId !== undefined) this.store.linkRelatedSession(parentSessionId, session.id)
    }, { global: true })
    ctx.effect(() => {
      const recovery = new AbortController()
      void this.orchestrator.recover(recovery.signal).catch((error: unknown) => {
        if (!recovery.signal.aborted) ctx.logger.warn(`personal-todo: recovery failed: ${String(error)}`)
      })
      return () => {
        recovery.abort()
        this.store.close()
      }
    }, 'personal-todo: recover runs and close sqlite')
  }

  /** 查询一页待办；在开始同步 SQLite 操作前检查取消信号。 */
  @Remote
  list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.list(request))
  }

  @Remote
  exportData(_request: ExportTodoDataRequest, signal: AbortSignal): Promise<ExportTodoDataResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.exportData())
  }

  @Remote
  importData(request: ImportTodoDataRequest, signal: AbortSignal): Promise<ImportTodoDataResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.importData(request.json))
  }

  /** 创建并持久化一条待办。 */
  @Remote
  create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.create(request))
  }

  /** 读取待办及其执行轮次、关联会话和活动记录。 */
  @Remote
  get(request: TodoIdRequest, signal: AbortSignal): Promise<TodoDetail> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.detail(request.id))
  }

  /** 更新已持久化的待办。 */
  @Remote
  update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.update(request.id, request.patch))
  }

  /** 在待办的持久化根会话中启动一条待处理任务。 */
  @Remote
  start(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.start(request.id)
  }

  /** 使用用户回复继续执行被阻塞的待办。 */
  @Remote
  reply(request: ReplyTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.reply(request)
  }

  /** 用户完成待处理、执行中、阻塞或待审核的待办；保留历史，不中断 Agent。 */
  @Remote
  approve(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.approve(request.id))
  }

  /** 归档待办，不改变其生命周期状态。 */
  @Remote
  archive(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.archive(request.id))
  }

  /** 将归档待办恢复到对应生命周期列表。 */
  @Remote
  restore(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.restore(request.id))
  }

  /** 将用户修改意见发回待办的根会话。 */
  @Remote
  requestChanges(request: RequestTodoChangesRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.requestChanges(request)
  }

  /** 记录待办主 Agent 会话汇报的进度节点。 */
  reportProgress(request: ReportTodoProgressRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.progress(request.id, sessionId, request.message))
  }

  /** 根据主 Agent 会话提出的问题暂停待办。 */
  block(request: BlockTodoRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.block(request, sessionId))
  }

  /** 提交主 Agent 会话的执行结果，等待用户审核。 */
  submitReview(request: SubmitTodoReviewRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.submitReview(request, sessionId))
  }

  /** 永久删除一条待办。 */
  @Remote
  delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.delete(request.id))
  }
}

export default PersonalTodoService

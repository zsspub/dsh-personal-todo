/** 向工具和 Web Remote 调用提供统一 SQLite 个人待办数据库的 Host 服务。 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { TodoOrchestrator, type TodoSessionController, type TodoAgentRegistry } from './host/orchestrator.ts'
import { TodoRuntime, type RuntimeEvent, type TodoSessionQuery } from './host/runtime.ts'
import { TodoStore, type JournalMode } from './host/store.ts'
import type {
  CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput,
  Todo as StoredTodo, LiveTodo as Todo, LiveTodoDetail as TodoDetail, TodoIdRequest, LiveTodoListResult as TodoListResult, UpdateTodoRequest,
  ExportTodoDataRequest, ExportTodoDataResult, ImportTodoDataRequest, ImportTodoDataResult,
  SetTodoStatusRequest,
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
    'agent/status'(payload: { readonly agent: { readonly id: string }; readonly status: 'running' | 'idle' }): void
    'agent/error'(payload: { readonly agent: { readonly id: string }; readonly error: unknown }): void
    'agent/disposed'(payload: { readonly agent: { readonly id: string } }): void
    'session/event'(session: { readonly id: string }, event: RuntimeEvent): void
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
  static inject = ['sessionController', 'sessions', 'agents', 'sessionQuery']

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
  private readonly runtime: TodoRuntime

  /** @param ctx - 发布 personalTodo Remote 命名空间的 Host 上下文。 @param config - 已校验的数据库配置。 */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'personalTodo')
    const resolved = resolveConfig(config)
    this.store = new TodoStore(resolved)
    const host = ctx as unknown as { agents: TodoAgentRegistry; sessionQuery: TodoSessionQuery }
    this.runtime = new TodoRuntime(host.agents, host.sessionQuery, message => ctx.logger.warn(message))
    for (const id of this.store.linkedSessionIds()) this.runtime.watch(id)
    this.orchestrator = new TodoOrchestrator(this.store, ctx.sessionController, resolved, host.agents, this.runtime)
    ctx.on('agent/status', ({ agent, status }) => { this.runtime.agentStatus(agent.id, status) }, { global: true })
    ctx.on('agent/error', ({ agent }) => { this.runtime.notify(agent.id, 'failed') }, { global: true })
    ctx.on('agent/disposed', ({ agent }) => { this.runtime.agentDisposed(agent.id) }, { global: true })
    ctx.on('session/event', (session, event) => { this.runtime.event(session.id, event) }, { global: true })
    ctx.on('session/created', (session) => {
      const parentSessionId = session.header.parentSession
      if (parentSessionId !== undefined) this.store.linkRelatedSession(parentSessionId, session.id)
    }, { global: true })
    ctx.effect(() => () => {
      this.runtime.dispose()
      this.store.close()
    }, 'personal-todo: dispose runtime and close sqlite')
  }

  private async present(todo: StoredTodo, signal: AbortSignal): Promise<Todo> {
    if (todo.primarySessionId === null) return { ...todo, executionStatus: null }
    await this.runtime.refresh(todo.primarySessionId)
    signal.throwIfAborted()
    return { ...todo, executionStatus: this.runtime.status(todo.primarySessionId) }
  }

  /** 查询一页待办；在开始同步 SQLite 操作前检查取消信号。 */
  @Remote
  list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult> {
    signal.throwIfAborted()
    const page = this.store.list(request)
    return Promise.all(page.todos.map(todo => this.present(todo, signal))).then(todos => ({
      ...page, todos,
    }))
  }

  @Remote
  exportData(_request: ExportTodoDataRequest, signal: AbortSignal): Promise<ExportTodoDataResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.exportData())
  }

  @Remote
  importData(request: ImportTodoDataRequest, signal: AbortSignal): Promise<ImportTodoDataResult> {
    signal.throwIfAborted()
    const result = this.store.importData(request.json)
    for (const id of this.store.linkedSessionIds()) this.runtime.watch(id)
    return Promise.resolve(result)
  }

  /** 创建并持久化一条待办。 */
  @Remote
  create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.present(this.store.create(request), signal)
  }

  /** 读取待办及其执行轮次、关联会话和活动记录。 */
  @Remote
  get(request: TodoIdRequest, signal: AbortSignal): Promise<TodoDetail> {
    signal.throwIfAborted()
    const detail = this.store.detail(request.id)
    return this.present(detail.todo, signal).then(todo => ({ ...detail, todo }))
  }

  /** 更新已持久化的待办。 */
  @Remote
  update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.present(this.store.update(request.id, request.patch), signal)
  }

  /** 在待办的持久化根会话中启动一条待处理任务。 */
  @Remote
  start(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.start(request.id).then(todo => this.present(todo, signal))
  }

  /** 用户确认完成任务；先停止活动执行并保留历史。 */
  @Remote
  approve(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.setStatus(request.id, 'completed').then(todo => this.present(todo, signal))
  }

  @Remote
  setStatus(request: SetTodoStatusRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.setStatus(request.id, request.status).then(todo => this.present(todo, signal))
  }

  @Remote
  stop(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.stop(request.id).then(todo => this.present(todo, signal))
  }

  /** 归档待办，不改变其生命周期状态。 */
  @Remote
  archive(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.archive(request.id).then(todo => this.present(todo, signal))
  }

  /** 将归档待办恢复到对应生命周期列表。 */
  @Remote
  restore(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.present(this.store.restore(request.id), signal)
  }

  /** 永久删除一条待办。 */
  @Remote
  delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult> {
    signal.throwIfAborted()
    this.orchestrator.assertAvailable(request.id)
    return Promise.resolve(this.store.delete(request.id))
  }
}

export default PersonalTodoService

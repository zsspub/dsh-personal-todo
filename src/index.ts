/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { TodoOrchestrator, type TodoSessionController } from './host/orchestrator.ts'
import { TodoStore, type JournalMode } from './host/store.ts'
import type {
  BlockTodoRequest, CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput,
  ReplyTodoRequest, ReportTodoProgressRequest, RequestTodoChangesRequest, SubmitTodoReviewRequest,
  Todo, TodoDetail, TodoIdRequest, TodoListResult, UpdateTodoRequest,
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

/** Deployment configuration for the personal todo database and list bounds. */
export interface Config {
  readonly databasePath: string
  readonly journalMode?: JournalMode
  readonly busyTimeoutMs?: number
  readonly defaultListLimit?: number
  readonly maxListLimit?: number
  /** Optional Agent preset used by todo-created root Sessions. */
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

/** Authoritative todo service shared by generated Remote methods and Agent tools. */
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

  /** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
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

  /** List one bounded page. Cancellation is checked before synchronous SQLite work begins. */
  @Remote
  list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.list(request))
  }

  /** Create one durable todo. */
  @Remote
  create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.create(request))
  }

  /** Read one todo with its runs, Sessions, and activity timeline. */
  @Remote
  get(request: TodoIdRequest, signal: AbortSignal): Promise<TodoDetail> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.detail(request.id))
  }

  /** Update one durable todo. */
  @Remote
  update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.update(request.id, request.patch))
  }

  /** Start one pending todo in its durable root Session. */
  @Remote
  start(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.start(request.id)
  }

  /** Resume a blocked todo with the user's answer. */
  @Remote
  reply(request: ReplyTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.reply(request)
  }

  /** Accept the latest Agent submission as complete. */
  @Remote
  approve(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.approve(request.id))
  }

  /** Move one todo to the archive without changing its lifecycle state. */
  @Remote
  archive(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.archive(request.id))
  }

  /** Restore one archived todo to its lifecycle list. */
  @Remote
  restore(request: TodoIdRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.restore(request.id))
  }

  /** Return the reviewed todo to its root Session with user feedback. */
  @Remote
  requestChanges(request: RequestTodoChangesRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return this.orchestrator.requestChanges(request)
  }

  /** Return exact source fields for delegation by the active primary Agent Session. */
  delegationSource(id: string, sessionId: string): Todo {
    return this.store.delegationSource(id, sessionId)
  }

  /** Return the active todo linked to one Session, when present. */
  activeTodoForSession(sessionId: string): Todo | undefined {
    return this.store.activeTodoForSession(sessionId)
  }

  /** Record one progress milestone from the todo's primary Agent Session. */
  reportProgress(request: ReportTodoProgressRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.progress(request.id, sessionId, request.message))
  }

  /** Pause one todo on a question from its primary Agent Session. */
  block(request: BlockTodoRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.block(request, sessionId))
  }

  /** Submit one primary Agent Session's result for user review. */
  submitReview(request: SubmitTodoReviewRequest, sessionId: string): Promise<Todo> {
    return Promise.resolve(this.store.submitReview(request, sessionId))
  }

  /** Permanently delete one todo. */
  @Remote
  delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.delete(request.id))
  }
}

export default PersonalTodoService

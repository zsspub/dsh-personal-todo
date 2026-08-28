/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { TodoStore, type JournalMode } from './host/store.ts'
import type {
  CreateTodoInput, DeleteTodoRequest, DeleteTodoResult, ListTodoInput, Todo, TodoListResult,
  UpdateTodoRequest,
} from './types.ts'

export type * from './types.ts'
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from './host/store.ts'
export type { JournalMode, TodoStoreConfig } from './host/store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    personalTodo: PersonalTodoService
  }
}

/** Deployment configuration for the personal todo database and list bounds. */
export interface Config {
  readonly databasePath: string
  readonly journalMode?: JournalMode
  readonly busyTimeoutMs?: number
  readonly defaultListLimit?: number
  readonly maxListLimit?: number
}

interface ResolvedConfig {
  readonly databasePath: string
  readonly journalMode: JournalMode
  readonly busyTimeoutMs: number
  readonly defaultListLimit: number
  readonly maxListLimit: number
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
  }
}

/** Authoritative todo service shared by generated Remote methods and Agent tools. */
export class PersonalTodoService extends TypertRemoteService {
  static Config: z<Config> = z.object({
    databasePath: z.string().required(),
    journalMode: z.union(['wal', 'delete', 'truncate', 'persist'] as const).default(DEFAULTS.journalMode),
    busyTimeoutMs: z.number().step(1).min(1).default(DEFAULTS.busyTimeoutMs),
    defaultListLimit: z.number().step(1).min(1).default(DEFAULTS.defaultListLimit),
    maxListLimit: z.number().step(1).min(1).default(DEFAULTS.maxListLimit),
  })

  private readonly store: TodoStore

  /** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'personalTodo')
    this.store = new TodoStore(resolveConfig(config))
    ctx.effect(() => () => { this.store.close() }, 'personal-todo: close sqlite')
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

  /** Update one durable todo. */
  @Remote
  update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.update(request.id, request.patch))
  }

  /** Permanently delete one todo. */
  @Remote
  delete(request: DeleteTodoRequest, signal: AbortSignal): Promise<DeleteTodoResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.delete(request.id))
  }
}

export default PersonalTodoService

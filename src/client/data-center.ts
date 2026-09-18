/** 个人待办 Web 客户端的唯一数据中心。 */

import { atom, batch, map, type ReadableAtom } from 'nanostores'
import type {
  CreateTodoInput, DeleteTodoResult, ExportTodoDataResult, ImportTodoDataRequest,
  ImportTodoDataResult, ListTodoInput, SetTodoStatusRequest, Todo, TodoCounts,
  TodoDetail, TodoListResult, TodoPriority, TodoStatus, UpdateTodoRequest,
} from '../types.ts'
import { PersonalTodoCanvasController } from './canvas.ts'

const ALL_PAGE_SIZE = 200
const PANEL_REFRESH_MS = 2_000
const DEFAULT_STATUSES = ['in_progress', 'pending'] as const satisfies readonly TodoStatus[]
const EMPTY_COUNTS: TodoCounts = {
  pending: 0,
  inProgress: 0,
  completed: 0,
  cancelled: 0,
  archived: 0,
}

export type TodoQueryMode = 'paged' | 'all'
export type TodoMutationKind =
  | 'update'
  | 'start'
  | 'setStatus'
  | 'stop'
  | 'approve'
  | 'archive'
  | 'restore'
  | 'delete'

export interface TodoMutationState {
  readonly kind: TodoMutationKind
  readonly startedAt: number
}

export interface TodoQuerySnapshot {
  readonly ids: readonly string[]
  readonly total: number
  readonly counts: TodoCounts
  readonly hasMore: boolean
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: string | undefined
  readonly updatedAt: number | undefined
}

export interface TodoQuerySeed {
  readonly todos: readonly Todo[]
  readonly total: number
  readonly counts?: TodoCounts
  readonly hasMore?: boolean
}

export interface TodoQueryHandle {
  readonly key: string
  readonly mode: TodoQueryMode
  readonly request: Readonly<ListTodoInput>
  readonly store: ReadableAtom<TodoQuerySnapshot>
  readonly getSnapshot: () => TodoQuerySnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly seed: (seed: TodoQuerySeed) => void
  readonly refresh: () => Promise<TodoQuerySnapshot>
  readonly loadMore: () => Promise<TodoQuerySnapshot>
}

export interface PersonalTodoRemoteApi {
  readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>
  readonly exportData: (signal: AbortSignal) => Promise<ExportTodoDataResult>
  readonly importData: (request: ImportTodoDataRequest, signal: AbortSignal) => Promise<ImportTodoDataResult>
  readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>
  readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>
  readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly start: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly setStatus: (request: SetTodoStatusRequest, signal: AbortSignal) => Promise<Todo>
  readonly stop: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly archive: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly restore: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>
}

interface FocusTarget {
  addEventListener(type: 'focus', listener: () => void): void
  removeEventListener(type: 'focus', listener: () => void): void
  setInterval(handler: () => void, timeout: number): number
  clearInterval(id: number): void
}

interface DataCenterOptions {
  readonly focusTarget?: FocusTarget
  readonly now?: () => number
  readonly panelRefreshMs?: number
}

interface CanonicalQuery {
  readonly statuses: readonly TodoStatus[]
  readonly priorities: readonly TodoPriority[] | undefined
  readonly tags: readonly string[]
  readonly dueBefore: string | undefined
  readonly search: string | undefined
  readonly archived: boolean
  readonly pageSize: number
}

interface QueryRecord {
  readonly key: string
  readonly mode: TodoQueryMode
  readonly request: CanonicalQuery
  readonly store: ReturnType<typeof atom<TodoQuerySnapshot>>
  readonly handle: TodoQueryHandle
  subscribers: number
  controller: AbortController | undefined
  inflight: Promise<TodoQuerySnapshot> | undefined
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function uniqueSorted<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return values === undefined ? [] : [...new Set(values)].sort()
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLocaleLowerCase()
  return normalized === '' ? undefined : normalized
}

function normalizeValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

function pageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50
  return Math.max(1, Math.min(ALL_PAGE_SIZE, Math.trunc(value)))
}

function canonicalQuery(input: ListTodoInput): CanonicalQuery {
  return {
    statuses: input.statuses === undefined ? DEFAULT_STATUSES : uniqueSorted(input.statuses),
    priorities: input.priorities === undefined ? undefined : uniqueSorted(input.priorities),
    tags: uniqueSorted(input.tags?.map(tag => tag.trim().toLocaleLowerCase()).filter(Boolean)),
    dueBefore: normalizeValue(input.dueBefore),
    search: normalizeSearch(input.search),
    archived: input.archived === true,
    pageSize: pageSize(input.limit),
  }
}

function requestOf(query: CanonicalQuery, offset: number, limit: number): ListTodoInput {
  return {
    statuses: query.statuses,
    ...(query.priorities === undefined ? {} : { priorities: query.priorities }),
    ...(query.tags.length === 0 ? {} : { tags: query.tags }),
    ...(query.dueBefore === undefined ? {} : { dueBefore: query.dueBefore }),
    ...(query.search === undefined ? {} : { search: query.search }),
    archived: query.archived,
    offset,
    limit,
  }
}

/** 返回忽略分页参数后的稳定查询键。 */
export function normalizeTodoQueryKey(input: ListTodoInput, mode: TodoQueryMode): string {
  const query = canonicalQuery(input)
  return JSON.stringify({
    mode,
    statuses: query.statuses,
    priorities: query.priorities ?? null,
    tags: query.tags,
    dueBefore: query.dueBefore ?? null,
    search: query.search ?? null,
    archived: query.archived,
    ...(mode === 'paged' ? { pageSize: query.pageSize } : {}),
  })
}

function initialQuerySnapshot(seed?: TodoQuerySeed): TodoQuerySnapshot {
  return {
    ids: seed?.todos.map(todo => todo.id) ?? [],
    total: seed?.total ?? seed?.todos.length ?? 0,
    counts: seed?.counts ?? EMPTY_COUNTS,
    hasMore: seed?.hasMore ?? false,
    loading: false,
    refreshing: false,
    error: undefined,
    updatedAt: undefined,
  }
}

function countBucket(todo: Todo): keyof TodoCounts {
  if (todo.archivedAt !== null) return 'archived'
  if (todo.status === 'in_progress') return 'inProgress'
  return todo.status
}

function matches(todo: Todo, query: CanonicalQuery): boolean {
  if ((todo.archivedAt !== null) !== query.archived) return false
  if (!query.statuses.includes(todo.status)) return false
  if (query.priorities !== undefined && !query.priorities.includes(todo.priority)) return false
  if (query.tags.some(tag => !todo.tags.includes(tag))) return false
  if (query.dueBefore !== undefined && (todo.dueAt === null || todo.dueAt > query.dueBefore)) return false
  if (query.search !== undefined) {
    const needle = query.search.toLocaleLowerCase()
    const text = `${todo.title}\n${todo.notes ?? ''}\n${todo.assignee ?? ''}`.toLocaleLowerCase()
    if (!text.includes(needle)) return false
  }
  return true
}

/**
 * 规范化并共享全部客户端待办状态。组件只保存草稿、菜单和弹窗等瞬时 UI 状态。
 */
export class PersonalTodoDataCenter {
  readonly entities = map<Record<string, Todo>>({})
  readonly details = map<Record<string, TodoDetail>>({})
  readonly deletedIds = map<Record<string, true>>({})
  readonly counts = atom<TodoCounts>(EMPTY_COUNTS)
  readonly mutations = map<Record<string, TodoMutationState>>({})
  readonly canvas = new PersonalTodoCanvasController()

  readonly #queries = new Map<string, QueryRecord>()
  readonly #controllers = new Set<AbortController>()
  readonly #remote: PersonalTodoRemoteApi
  readonly #focusTarget: FocusTarget | undefined
  readonly #now: () => number
  readonly #panelRefreshMs: number
  readonly #focusListener = (): void => { void this.refreshSubscribed('all') }
  #panelVisible = false
  #panelTimer: number | undefined
  #disposed = false
  #openPanel: (() => void) | undefined

  constructor(remote: PersonalTodoRemoteApi, options: DataCenterOptions = {}) {
    this.#remote = remote
    this.#focusTarget = options.focusTarget ?? (typeof window === 'undefined' ? undefined : window)
    this.#now = options.now ?? Date.now
    this.#panelRefreshMs = options.panelRefreshMs ?? PANEL_REFRESH_MS
    this.#focusTarget?.addEventListener('focus', this.#focusListener)
  }

  setOpenPanel(openPanel: () => void): void {
    this.#openPanel = openPanel
  }

  openTodo(id?: string): void {
    if (id === undefined) this.canvas.open()
    else this.canvas.focusTodo(id)
    this.#openPanel?.()
  }

  setPanelVisible(visible: boolean): void {
    if (this.#disposed || visible === this.#panelVisible) return
    this.#panelVisible = visible
    if (visible) {
      void this.refreshSubscribed('paged')
      this.#panelTimer = this.#focusTarget?.setInterval(() => {
        void this.refreshSubscribed('paged')
      }, this.#panelRefreshMs)
    } else if (this.#panelTimer !== undefined) {
      this.#focusTarget?.clearInterval(this.#panelTimer)
      this.#panelTimer = undefined
    }
  }

  query(input: ListTodoInput, mode: TodoQueryMode, seed?: TodoQuerySeed): TodoQueryHandle {
    const key = normalizeTodoQueryKey(input, mode)
    const existing = this.#queries.get(key)
    if (existing !== undefined) {
      if (seed !== undefined) existing.handle.seed(seed)
      return existing.handle
    }

    const request = canonicalQuery(input)
    const store = atom(initialQuerySnapshot())
    const record = {} as QueryRecord
    const handle: TodoQueryHandle = {
      key,
      mode,
      request: requestOf(request, 0, mode === 'all' ? ALL_PAGE_SIZE : request.pageSize),
      store,
      getSnapshot: store.get,
      subscribe: listener => {
        record.subscribers++
        const unlisten = store.listen(listener)
        return () => {
          unlisten()
          record.subscribers = Math.max(0, record.subscribers - 1)
        }
      },
      seed: value => { this.#seed(record, value) },
      refresh: () => this.#refreshQuery(record),
      loadMore: () => this.#loadMore(record),
    }
    Object.assign(record, {
      key, mode, request, store, handle, subscribers: 0,
      controller: undefined, inflight: undefined,
    } satisfies QueryRecord)
    this.#queries.set(key, record)
    if (seed !== undefined) handle.seed(seed)
    return handle
  }

  getEntity(id: string): Todo | undefined {
    return this.entities.get()[id]
  }

  seedTodos(todos: readonly Todo[]): void {
    this.#ingest(todos, false)
  }

  isMutating(id: string): boolean {
    return this.mutations.get()[id] !== undefined
  }

  async list(request: ListTodoInput, signal: AbortSignal): Promise<TodoListResult> {
    const result = await this.#remote.list(request, signal)
    signal.throwIfAborted()
    batch(() => {
      this.#ingest(result.todos)
      this.counts.set(result.counts)
      this.canvas.setAttentionCount(result.counts.pending + result.counts.inProgress)
    })
    return {
      ...result,
      todos: result.todos.map(todo => this.entities.get()[todo.id] ?? todo),
    }
  }

  async get(id: string, signal: AbortSignal): Promise<TodoDetail> {
    const detail = await this.#remote.get(id, signal)
    signal.throwIfAborted()
    this.#setDetail(detail)
    return this.details.get()[id] ?? detail
  }

  exportData(signal: AbortSignal): Promise<ExportTodoDataResult> {
    return this.#remote.exportData(signal)
  }

  async importData(request: ImportTodoDataRequest, signal: AbortSignal): Promise<ImportTodoDataResult> {
    const result = await this.#remote.importData(request, signal)
    signal.throwIfAborted()
    await this.#revalidate()
    return result
  }

  async create(request: CreateTodoInput, signal: AbortSignal): Promise<Todo> {
    const todo = await this.#remote.create(request, signal)
    signal.throwIfAborted()
    this.#writeTodo(todo)
    await this.#revalidate()
    return this.getEntity(todo.id) ?? todo
  }

  update(request: UpdateTodoRequest, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(request.id, 'update', inner => this.#remote.update(request, inner), signal)
  }

  start(id: string, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(id, 'start', inner => this.#remote.start(id, inner), signal)
  }

  approve(id: string, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(id, 'approve', inner => this.#remote.approve(id, inner), signal)
  }

  setStatus(request: SetTodoStatusRequest, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(request.id, 'setStatus', inner => this.#remote.setStatus(request, inner), signal)
  }

  stop(id: string, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(id, 'stop', inner => this.#remote.stop(id, inner), signal)
  }

  archive(id: string, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(id, 'archive', inner => this.#remote.archive(id, inner), signal)
  }

  restore(id: string, signal: AbortSignal): Promise<Todo> {
    return this.#mutate(id, 'restore', inner => this.#remote.restore(id, inner), signal)
  }

  async delete(id: string, signal: AbortSignal): Promise<DeleteTodoResult> {
    return this.#withMutation(id, 'delete', async inner => {
      const result = await this.#remote.delete(id, inner)
      inner.throwIfAborted()
      this.#removeTodo(id)
      await this.#revalidate()
      return result
    }, signal)
  }

  async refreshSubscribed(mode?: TodoQueryMode): Promise<void> {
    const active = [...this.#queries.values()]
      .filter(record => record.subscribers > 0 && (mode === undefined || record.mode === mode))
    await Promise.all(active.map(record => this.#refreshQuery(record).then(
      () => undefined,
      () => undefined,
    )))
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#focusTarget?.removeEventListener('focus', this.#focusListener)
    if (this.#panelTimer !== undefined) this.#focusTarget?.clearInterval(this.#panelTimer)
    this.#panelTimer = undefined
    for (const controller of this.#controllers) controller.abort()
    this.#controllers.clear()
    for (const record of this.#queries.values()) record.controller?.abort()
    this.#queries.clear()
    this.entities.off()
    this.details.off()
    this.deletedIds.off()
    this.counts.off()
    this.mutations.off()
  }

  #seed(record: QueryRecord, seed: TodoQuerySeed): void {
    const current = record.store.get()
    if (current.updatedAt !== undefined) return
    const deletedIds = this.deletedIds.get()
    const todos = seed.todos.filter(todo => deletedIds[todo.id] === undefined)
    const removed = seed.todos.length - todos.length
    this.#ingest(todos, false)
    record.store.set(initialQuerySnapshot({
      ...seed,
      todos,
      total: Math.max(0, seed.total - removed),
    }))
  }

  #controller(signal?: AbortSignal): { controller: AbortController; release: () => void } {
    const controller = new AbortController()
    const abort = (): void => { controller.abort(signal?.reason) }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    this.#controllers.add(controller)
    return {
      controller,
      release: () => {
        signal?.removeEventListener('abort', abort)
        this.#controllers.delete(controller)
      },
    }
  }

  async #refreshQuery(record: QueryRecord, replace = false): Promise<TodoQuerySnapshot> {
    if (this.#disposed) throw new Error('个人待办数据中心已释放。')
    if (record.inflight !== undefined && !replace) return record.inflight
    if (replace) record.controller?.abort()
    const { controller, release } = this.#controller()
    record.controller = controller
    const current = record.store.get()
    record.store.set({
      ...current,
      loading: current.ids.length === 0,
      refreshing: current.ids.length > 0,
      error: undefined,
    })
    const operation = this.#fetchQuery(record, controller.signal).then(result => {
      if (record.controller !== controller) return record.store.get()
      batch(() => {
        this.#ingest(result.todos)
        this.counts.set(result.counts)
        this.canvas.setAttentionCount(result.counts.pending + result.counts.inProgress)
        record.store.set({
          ids: result.todos.map(todo => todo.id),
          total: result.total,
          counts: result.counts,
          hasMore: result.hasMore,
          loading: false,
          refreshing: false,
          error: undefined,
          updatedAt: this.#now(),
        })
      })
      return record.store.get()
    }).catch((error: unknown) => {
      if (controller.signal.aborted || record.controller !== controller) return record.store.get()
      record.store.set({
        ...record.store.get(),
        loading: false,
        refreshing: false,
        error: errorText(error),
      })
      throw error
    }).finally(() => {
      release()
      if (record.controller === controller) record.controller = undefined
      if (record.inflight === operation) record.inflight = undefined
    })
    record.inflight = operation
    return operation
  }

  async #fetchQuery(record: QueryRecord, signal: AbortSignal): Promise<TodoListResult> {
    if (record.mode === 'paged') {
      return this.#remote.list(requestOf(record.request, 0, record.request.pageSize), signal)
    }
    const todos: Todo[] = []
    let offset = 0
    let page: TodoListResult
    do {
      page = await this.#remote.list(requestOf(record.request, offset, ALL_PAGE_SIZE), signal)
      signal.throwIfAborted()
      todos.push(...page.todos)
      offset += page.todos.length
    } while (page.hasMore && page.todos.length > 0)
    return { ...page, todos, hasMore: false }
  }

  async #loadMore(record: QueryRecord): Promise<TodoQuerySnapshot> {
    if (record.mode === 'all') return this.#refreshQuery(record)
    if (record.inflight !== undefined) return record.inflight
    const current = record.store.get()
    if (!current.hasMore && current.updatedAt !== undefined) return current
    const { controller, release } = this.#controller()
    record.controller = controller
    record.store.set({ ...current, refreshing: current.ids.length > 0, loading: current.ids.length === 0, error: undefined })
    const operation = this.#remote.list(
      requestOf(record.request, current.ids.length, record.request.pageSize),
      controller.signal,
    ).then(page => {
      batch(() => {
        this.#ingest(page.todos)
        this.counts.set(page.counts)
        this.canvas.setAttentionCount(page.counts.pending + page.counts.inProgress)
        const ids = [...current.ids]
        for (const todo of page.todos) if (!ids.includes(todo.id)) ids.push(todo.id)
        record.store.set({
          ids,
          total: page.total,
          counts: page.counts,
          hasMore: page.hasMore,
          loading: false,
          refreshing: false,
          error: undefined,
          updatedAt: this.#now(),
        })
      })
      return record.store.get()
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        record.store.set({
          ...record.store.get(), loading: false, refreshing: false, error: errorText(error),
        })
      }
      throw error
    }).finally(() => {
      release()
      if (record.controller === controller) record.controller = undefined
      if (record.inflight === operation) record.inflight = undefined
    })
    record.inflight = operation
    return operation
  }

  #ingest(todos: readonly Todo[], authoritative = true): void {
    if (todos.length === 0) return
    const entities = { ...this.entities.get() }
    const details = { ...this.details.get() }
    const deletedIds = { ...this.deletedIds.get() }
    let entitiesChanged = false
    let detailsChanged = false
    let deletedIdsChanged = false
    for (const todo of todos) {
      if (!authoritative && deletedIds[todo.id] !== undefined) continue
      if (authoritative && deletedIds[todo.id] !== undefined) {
        delete deletedIds[todo.id]
        deletedIdsChanged = true
      }
      const current = entities[todo.id]
      if (current === undefined
        || todo.revision > current.revision
        || (authoritative && todo.revision === current.revision)) {
        entities[todo.id] = todo
        entitiesChanged = true
        const detail = details[todo.id]
        if (detail !== undefined) {
          details[todo.id] = { ...detail, todo }
          detailsChanged = true
        }
      }
    }
    batch(() => {
      if (entitiesChanged) this.entities.set(entities)
      if (detailsChanged) this.details.set(details)
      if (deletedIdsChanged) this.deletedIds.set(deletedIds)
    })
  }

  #setDetail(detail: TodoDetail): void {
    this.#writeTodo(detail.todo)
    const todo = this.entities.get()[detail.todo.id] ?? detail.todo
    this.details.setKey(detail.todo.id, { ...detail, todo })
  }

  #writeTodo(todo: Todo): void {
    const previous = this.entities.get()[todo.id]
    if (previous !== undefined && previous.revision > todo.revision) return
    batch(() => {
      this.deletedIds.setKey(todo.id, undefined)
      this.entities.setKey(todo.id, todo)
      const detail = this.details.get()[todo.id]
      if (detail !== undefined) this.details.setKey(todo.id, { ...detail, todo })
      this.#updateCounts(previous, todo)
      this.#reconcileQueries(previous, todo)
    })
  }

  #removeTodo(id: string): void {
    const previous = this.entities.get()[id]
    batch(() => {
      this.deletedIds.setKey(id, true)
      this.entities.setKey(id, undefined)
      this.details.setKey(id, undefined)
      if (previous !== undefined) this.#updateCounts(previous, undefined)
      for (const record of this.#queries.values()) {
        const snapshot = record.store.get()
        if (!snapshot.ids.includes(id)) continue
        record.store.set({
          ...snapshot,
          ids: snapshot.ids.filter(candidate => candidate !== id),
          total: Math.max(0, snapshot.total - 1),
        })
      }
    })
  }

  #updateCounts(previous: Todo | undefined, current: Todo | undefined): void {
    const counts = { ...this.counts.get() }
    if (previous !== undefined) {
      const bucket = countBucket(previous)
      counts[bucket] = Math.max(0, counts[bucket] - 1)
    }
    if (current !== undefined) {
      const bucket = countBucket(current)
      counts[bucket]++
    }
    this.counts.set(counts)
    this.canvas.setAttentionCount(counts.pending + counts.inProgress)
  }

  #reconcileQueries(previous: Todo | undefined, current: Todo): void {
    for (const record of this.#queries.values()) {
      const snapshot = record.store.get()
      const included = snapshot.ids.includes(current.id)
      const matchesNow = matches(current, record.request)
      if (included && !matchesNow) {
        record.store.set({
          ...snapshot,
          ids: snapshot.ids.filter(id => id !== current.id),
          total: Math.max(0, snapshot.total - 1),
        })
      } else if (!included && matchesNow && snapshot.updatedAt !== undefined) {
        record.store.set({ ...snapshot, ids: [...snapshot.ids, current.id], total: snapshot.total + 1 })
      }
    }
  }

  async #mutate(
    id: string,
    kind: TodoMutationKind,
    operation: (signal: AbortSignal) => Promise<Todo>,
    signal: AbortSignal,
  ): Promise<Todo> {
    return this.#withMutation(id, kind, async inner => {
      const todo = await operation(inner)
      inner.throwIfAborted()
      this.#writeTodo(todo)
      await this.#revalidate()
      return this.getEntity(id) ?? todo
    }, signal)
  }

  async #withMutation<T>(
    id: string,
    kind: TodoMutationKind,
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (this.isMutating(id)) throw new Error('该待办正在处理中，请稍后再试。')
    const { controller, release } = this.#controller(signal)
    this.mutations.setKey(id, { kind, startedAt: this.#now() })
    try {
      return await operation(controller.signal)
    } finally {
      release()
      this.mutations.setKey(id, undefined)
    }
  }

  async #revalidate(): Promise<void> {
    const active = [...this.#queries.values()].filter(record => record.subscribers > 0)
    const detailIds = Object.keys(this.details.get())
    if (active.length === 0) {
      const { controller, release } = this.#controller()
      try {
        await this.list({ limit: 1 }, controller.signal)
      } catch {
        // 写操作已经成功，后台重新校验失败不能反转权威实体。
      } finally {
        release()
      }
    }
    await Promise.all([
      ...active.map(record => this.#refreshQuery(record, true).then(
        () => undefined,
        () => undefined,
      )),
      ...detailIds.map(async id => {
        const { controller, release } = this.#controller()
        try {
          await this.get(id, controller.signal)
        } catch {
          // 保留已写入的权威实体及现有详情历史。
        } finally {
          release()
        }
      }),
    ])
  }
}

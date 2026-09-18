import { describe, expect, it, vi } from 'vitest'
import {
  normalizeTodoQueryKey, PersonalTodoDataCenter, type PersonalTodoRemoteApi,
} from '../src/client/data-center.ts'
import type {
  CreateTodoInput, ListTodoInput, Todo, TodoDetail, UpdateTodoRequest,
} from '../src/types.ts'

function todo(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    title: `待办 ${id}`,
    notes: null,
    assignee: null,
    status: 'pending',
    executionStatus: null,
    priority: 'none',
    dueAt: null,
    tags: [],
    primarySessionId: null,
    activeRunId: null,
    latestSummary: null,
    blockedReason: null,
    reviewRound: 0,
    revision: 0,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

function detail(row: Todo): TodoDetail {
  return { todo: row, runs: [], sessions: [], events: [] }
}

function remote(initial: Todo[] = []): PersonalTodoRemoteApi & { rows: Todo[] } {
  const rows = initial
  const replace = (id: string, patch: Partial<Todo>): Todo => {
    const index = rows.findIndex(row => row.id === id)
    if (index < 0) throw new Error('not found')
    const value = { ...rows[index]!, ...patch, revision: rows[index]!.revision + 1 }
    rows[index] = value
    return value
  }
  const list = vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
    signal.throwIfAborted()
    const statuses = request.statuses ?? ['pending', 'in_progress']
    const priorities = request.priorities ?? []
    const tags = request.tags ?? []
    const archived = request.archived === true
    const search = request.search?.toLocaleLowerCase()
    const matching = rows.filter(row =>
      statuses.includes(row.status)
      && (row.archivedAt !== null) === archived
      && (priorities.length === 0 || priorities.includes(row.priority))
      && tags.every(tag => row.tags.includes(tag))
      && (search === undefined || `${row.title} ${row.notes ?? ''} ${row.assignee ?? ''}`.toLocaleLowerCase().includes(search)),
    )
    const offset = request.offset ?? 0
    const limit = request.limit ?? 50
    return {
      todos: matching.slice(offset, offset + limit),
      total: matching.length,
      counts: {
        pending: rows.filter(row => row.archivedAt === null && row.status === 'pending').length,
        inProgress: rows.filter(row => row.archivedAt === null && row.status === 'in_progress').length,
        completed: rows.filter(row => row.archivedAt === null && row.status === 'completed').length,
        cancelled: rows.filter(row => row.archivedAt === null && row.status === 'cancelled').length,
        archived: rows.filter(row => row.archivedAt !== null).length,
      },
      hasMore: offset + limit < matching.length,
    }
  })
  return {
    rows,
    list,
    exportData: vi.fn(async () => ({ filename: 'todo.json', json: '{}' })),
    importData: vi.fn(async () => ({ imported: 0, skipped: 0, resetToPending: 0 })),
    get: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      const row = rows.find(candidate => candidate.id === id)
      if (row === undefined) throw new Error('not found')
      return detail(row)
    }),
    create: vi.fn(async (request: CreateTodoInput) => {
      const row = todo(`todo-${String(rows.length + 1)}`, {
        title: request.title,
        ...(request.notes === undefined ? {} : { notes: request.notes }),
        ...(request.assignee === undefined ? {} : { assignee: request.assignee }),
        ...(request.priority === undefined ? {} : { priority: request.priority }),
        ...(request.dueAt === undefined ? {} : { dueAt: request.dueAt }),
        ...(request.tags === undefined ? {} : { tags: [...request.tags] }),
      })
      rows.push(row)
      return row
    }),
    update: vi.fn(async (request: UpdateTodoRequest) => {
      const current = rows.find(row => row.id === request.id)
      if (current === undefined) throw new Error('not found')
      return replace(request.id, {
        title: request.patch.title ?? current.title,
        notes: request.patch.notes === undefined ? current.notes : request.patch.notes,
        assignee: request.patch.assignee === undefined ? current.assignee : request.patch.assignee,
        priority: request.patch.priority ?? current.priority,
        dueAt: request.patch.dueAt === undefined ? current.dueAt : request.patch.dueAt,
        tags: request.patch.tags === undefined ? current.tags : [...request.patch.tags],
      })
    }),
    start: vi.fn(async id => replace(id, { status: 'in_progress', executionStatus: 'running' })),
    approve: vi.fn(async id => replace(id, { status: 'completed', completedAt: '2026-09-15T01:00:00.000Z' })),
    setStatus: vi.fn(async request => replace(request.id, { status: request.status })),
    stop: vi.fn(async id => replace(id, { executionStatus: 'stopped' })),
    archive: vi.fn(async id => replace(id, { archivedAt: '2026-09-15T02:00:00.000Z' })),
    restore: vi.fn(async id => replace(id, { archivedAt: null })),
    delete: vi.fn(async id => {
      const index = rows.findIndex(row => row.id === id)
      if (index < 0) throw new Error('not found')
      rows.splice(index, 1)
      return { id, deleted: true as const }
    }),
  }
}

class FocusTarget {
  readonly listeners = new Set<() => void>()
  readonly intervals = new Map<number, () => void>()
  #nextInterval = 1

  addEventListener(_type: 'focus', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'focus', listener: () => void): void {
    this.listeners.delete(listener)
  }

  setInterval(handler: () => void): number {
    const id = this.#nextInterval++
    this.intervals.set(id, handler)
    return id
  }

  clearInterval(id: number): void {
    this.intervals.delete(id)
  }

  focus(): void {
    for (const listener of this.listeners) listener()
  }
}

describe('PersonalTodoDataCenter', () => {
  it('规范化等价查询，并让相同查询共享请求和缓存', async () => {
    expect(normalizeTodoQueryKey({
      statuses: ['pending', 'in_progress', 'pending'],
      priorities: ['high', 'low'],
      tags: ['WORK', ' urgent ', 'work'],
      search: '  插件 ABC  ',
      offset: 100,
      limit: 20,
    }, 'all')).toBe(normalizeTodoQueryKey({
      statuses: ['in_progress', 'pending'],
      priorities: ['low', 'high'],
      tags: ['urgent', 'work'],
      search: '插件 abc',
      offset: 0,
      limit: 200,
    }, 'all'))
    expect(normalizeTodoQueryKey({ statuses: [] }, 'all'))
      .not.toBe(normalizeTodoQueryKey({}, 'all'))
    expect(normalizeTodoQueryKey({ priorities: [] }, 'all'))
      .not.toBe(normalizeTodoQueryKey({}, 'all'))

    const service = remote([todo('one')])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    const first = center.query({ statuses: ['pending'] }, 'all')
    const second = center.query({ statuses: ['pending'], offset: 50, limit: 10 }, 'all')
    expect(second).toBe(first)
    await Promise.all([first.refresh(), second.refresh()])
    expect(service.list).toHaveBeenCalledOnce()
    center.dispose()
  })

  it('实时空结果不会被后挂载的历史快照覆盖', async () => {
    const service = remote([])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    const query = center.query({ statuses: ['pending'] }, 'all')
    await query.refresh()

    query.seed({ todos: [todo('stale')], total: 1 })
    expect(query.getSnapshot()).toMatchObject({ ids: [], total: 0 })
    expect(center.getEntity('stale')).toBeUndefined()
    center.dispose()
  })

  it('历史快照不会覆盖同 revision 的实时实体', async () => {
    const service = remote([todo('one', { title: '实时标题' })])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    await center.list({ statuses: ['pending'] }, new AbortController().signal)
    const query = center.query({ statuses: ['pending'] }, 'all')
    query.seed({ todos: [todo('one', { title: '历史标题' })], total: 1 })
    expect(center.getEntity('one')?.title).toBe('实时标题')
    center.dispose()
  })

  it('全量查询按 Host 上限连续翻页并归一化实体', async () => {
    const rows = Array.from({ length: 405 }, (_, index) => todo(`todo-${String(index)}`))
    const service = remote(rows)
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    const query = center.query({ statuses: ['pending'], limit: 12 }, 'all')
    const snapshot = await query.refresh()
    expect(snapshot.ids).toHaveLength(405)
    expect(snapshot.hasMore).toBe(false)
    expect(service.list).toHaveBeenCalledTimes(3)
    expect(vi.mocked(service.list).mock.calls.map(([request]) => request)).toMatchObject([
      { offset: 0, limit: 200 },
      { offset: 200, limit: 200 },
      { offset: 400, limit: 200 },
    ])
    expect(Object.keys(center.entities.get())).toHaveLength(405)
    center.dispose()
  })

  it('列表返回的新实体会同步已有详情', async () => {
    const service = remote([todo('one', { title: '详情旧标题' })])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    await center.get('one', new AbortController().signal)
    service.rows[0] = todo('one', { title: '列表新标题', revision: 1 })

    await center.list({ statuses: ['pending'] }, new AbortController().signal)
    expect(center.entities.get().one?.title).toBe('列表新标题')
    expect(center.details.get().one?.todo.title).toBe('列表新标题')
    center.dispose()
  })

  it('权威写入立即同步实体、详情和交叉查询，删除统一移除', async () => {
    const row = todo('shared', { title: '旧标题' })
    const service = remote([row])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    const first = center.query({ statuses: ['pending'] }, 'all')
    const second = center.query({ statuses: ['pending'], tags: [] }, 'paged')
    const unlistenFirst = first.subscribe(() => undefined)
    const unlistenSecond = second.subscribe(() => undefined)
    await Promise.all([first.refresh(), second.refresh()])
    await center.get(row.id, new AbortController().signal)

    await center.update({ id: row.id, patch: { title: '新标题' } }, new AbortController().signal)
    expect(center.entities.get()[row.id]?.title).toBe('新标题')
    expect(center.details.get()[row.id]?.todo.title).toBe('新标题')
    expect(first.getSnapshot().ids).toContain(row.id)
    expect(second.getSnapshot().ids).toContain(row.id)

    await center.delete(row.id, new AbortController().signal)
    expect(center.entities.get()[row.id]).toBeUndefined()
    expect(center.details.get()[row.id]).toBeUndefined()
    expect(first.getSnapshot().ids).not.toContain(row.id)
    expect(second.getSnapshot().ids).not.toContain(row.id)
    unlistenFirst()
    unlistenSecond()
    center.dispose()
  })

  it('删除墓碑阻止历史快照重新注入实体和查询', async () => {
    const row = todo('deleted')
    const service = remote([row])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    center.seedTodos([row])
    await center.delete(row.id, new AbortController().signal)

    center.seedTodos([row])
    const query = center.query({ statuses: ['pending'] }, 'all')
    query.seed({ todos: [row], total: 1 })
    expect(center.deletedIds.get()[row.id]).toBe(true)
    expect(center.getEntity(row.id)).toBeUndefined()
    expect(query.getSnapshot()).toMatchObject({ ids: [], total: 0 })
    center.dispose()
  })

  it('刷新失败保留已有数据，并在聚焦时刷新已订阅的对话查询', async () => {
    const target = new FocusTarget()
    const service = remote([todo('one')])
    const center = new PersonalTodoDataCenter(service, { focusTarget: target })
    const query = center.query({ statuses: ['pending'] }, 'all')
    const unlisten = query.subscribe(() => undefined)
    await query.refresh()
    vi.mocked(service.list).mockRejectedValueOnce(new Error('网络不可用'))
    await expect(query.refresh()).rejects.toThrow('网络不可用')
    expect(query.getSnapshot()).toMatchObject({ ids: ['one'], error: '网络不可用' })

    target.focus()
    await vi.waitFor(() => {
      expect(service.list).toHaveBeenCalledTimes(3)
      expect(query.getSnapshot().error).toBeUndefined()
    })
    unlisten()
    center.dispose()
  })

  it('阻止同一待办并发操作，并在释放时取消请求和定时任务', async () => {
    const target = new FocusTarget()
    let resolveUpdate: ((value: Todo) => void) | undefined
    const service = remote([todo('one')])
    vi.mocked(service.update).mockImplementation((_request, signal) => new Promise((resolve, reject) => {
      resolveUpdate = resolve
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    }))
    const center = new PersonalTodoDataCenter(service, { focusTarget: target })
    const pending = center.update({ id: 'one', patch: { title: '进行中' } }, new AbortController().signal)
    expect(center.mutations.get().one?.kind).toBe('update')
    await expect(center.archive('one', new AbortController().signal)).rejects.toThrow('正在处理中')
    resolveUpdate?.(todo('one', { title: '完成', revision: 1 }))
    await pending
    expect(center.mutations.get().one).toBeUndefined()

    center.setPanelVisible(true)
    expect(target.intervals.size).toBe(1)
    center.dispose()
    expect(target.listeners.size).toBe(0)
    expect(target.intervals.size).toBe(0)
  })

  it('刷新失败不会反转写操作返回的权威实体', async () => {
    const service = remote([todo('one')])
    const center = new PersonalTodoDataCenter(service, { focusTarget: new FocusTarget() })
    const query = center.query({ statuses: ['pending'] }, 'all')
    const unlisten = query.subscribe(() => undefined)
    await query.refresh()
    vi.mocked(service.list).mockRejectedValue(new Error('刷新失败'))
    const updated = await center.update(
      { id: 'one', patch: { title: '服务端权威标题' } },
      new AbortController().signal,
    )
    expect(updated.title).toBe('服务端权威标题')
    expect(center.entities.get().one?.title).toBe('服务端权威标题')
    expect(query.getSnapshot()).toMatchObject({ ids: ['one'], error: '刷新失败' })
    unlisten()
    center.dispose()
  })
})

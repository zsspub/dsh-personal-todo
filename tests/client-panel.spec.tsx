import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PersonalTodoCanvas, PersonalTodoTrigger, type PersonalTodoPanelInjected,
} from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoCanvasController } from '../src/client/canvas.ts'
import { parseTodoBackup, TODO_BACKUP_MAX_BYTES } from '../src/backup.ts'
import { en, zh } from '../src/client/locales.ts'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CreateTodoInput, ListTodoInput, Todo, TodoCounts, TodoDetail, TodoListResult, TodoSession, UpdateTodoRequest,
} from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const original = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  return {
    MarkdownText: original.MarkdownText,
    Button: ({ icon, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; variant?: string }) => <button {...props} data-variant={variant}>{icon}{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Menu: ({ open, anchor, items, selectedId, onSelect }: {
      open: boolean
      anchor: React.ReactNode
      items: readonly MenuEntry[]
      selectedId?: string
      onSelect: (id: string) => void
    }) => <span>
      {anchor}
      {open && createPortal(<div role="menu">{items.map(item => 'type' in item
        ? item.type === 'separator' ? <hr key={item.id} /> : <span key={item.id}>{item.text}</span>
        : <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        data-danger={item.danger}
        aria-current={item.id === selectedId ? 'true' : undefined}
        key={item.id}
        onClick={() => { onSelect(item.id) }}
      >{item.label}</button>)}</div>, document.body)}
    </span>,
    Modal: ({ open, onClose, title, closeLabel, description, children, footer }: {
      open: boolean
      onClose: () => void
      title: string
      closeLabel?: string
      description?: string
      children?: React.ReactNode
      footer?: React.ReactNode
    }) => open ? createPortal(<div role="dialog" aria-label={title}>
      <button type="button" aria-label={closeLabel ?? title} onClick={onClose}>×</button>
      {description === undefined ? null : <p>{description}</p>}
      {children}
      {footer}
    </div>, document.body) : null,
  }
})

type Translate = ComponentProps<typeof PersonalTodoCanvas>['t']

async function selectDetailMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: '更多待办操作' }))
  await user.click(await screen.findByRole('menuitem', { name }))
}

const t = ((key: keyof typeof en, parameters?: Record<string, string | number>) => {
  let message = en[key]
  for (const [name, value] of Object.entries(parameters ?? {})) message = message.replace(`{${name}}`, String(value))
  return message
}) as Translate

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: 'Ship plugin',
    notes: 'Run the checks',
    assignee: null,
    status: 'pending',
    executionStatus: null,
    priority: 'high',
    dueAt: null,
    tags: ['work'],
    primarySessionId: null,
    activeRunId: null,
    latestSummary: null,
    blockedReason: null,
    reviewRound: 0,
    revision: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

function detail(row: Todo): TodoDetail {
  return {
    todo: row,
    runs: row.primarySessionId === null ? [] : [{
      id: row.activeRunId ?? 'run-1',
      todoId: row.id,
      sequence: row.reviewRound === 0 ? 1 : row.reviewRound,
      status: row.executionStatus === 'stopped' ? 'cancelled'
        : row.executionStatus === 'idle' || row.executionStatus === 'unavailable' ? 'failed' : row.executionStatus ?? 'running',
      rootSessionId: row.primarySessionId,
      resultSummary: row.executionStatus === 'submitted' ? row.latestSummary : null,
      verification: row.executionStatus === 'submitted' ? 'Unit tests passed.' : null,
      risk: null,
      startedAt: row.createdAt,
      finishedAt: row.executionStatus === 'submitted' ? row.updatedAt : null,
    }],
    sessions: row.primarySessionId === null ? [] : [{
      todoId: row.id,
      sessionId: row.primarySessionId,
      role: 'primary',
      parentSessionId: null,
      createdAt: row.createdAt,
    }],
    events: [{ id: 'event-1', todoId: row.id, runId: row.activeRunId, type: 'created', message: null, createdAt: row.createdAt }],
  }
}

function api(initial: Todo[] = []): PersonalTodoPanelInjected & { readonly rows: Todo[] } {
  const rows = initial
  const replace = (id: string, patch: Partial<Todo>): Todo => {
    const index = rows.findIndex(row => row.id === id)
    if (index < 0) throw new Error('not found')
    const updated = { ...(rows[index] as Todo), ...patch, revision: (rows[index] as Todo).revision + 1 }
    rows[index] = updated
    return updated
  }
  return {
    canvas: new PersonalTodoCanvasController(),
    openCanvas: vi.fn(),
    rows,
    exportData: vi.fn(async (signal: AbortSignal) => {
      signal.throwIfAborted()
      return {
        filename: 'personal-todo-test.json',
        json: JSON.stringify({ format: 'dsh-personal-todo', version: 2, exportedAt: '2026-09-14T10:00:00.000Z', todos: rows.map(row => detail(row)) }),
      }
    }),
    importData: vi.fn(async (request: { json: string }, signal: AbortSignal) => {
      signal.throwIfAborted()
      const backup = parseTodoBackup(request.json)
      let imported = 0
      let skipped = 0
      let resetToPending = 0
      for (const entry of backup.todos) {
        if (rows.some(row => row.id === entry.todo.id)) {
          skipped++
          continue
        }
        const reset = entry.todo.executionStatus === 'running'
        rows.push({ ...entry.todo, status: reset ? 'pending' : entry.todo.status, activeRunId: reset ? null : entry.todo.activeRunId })
        imported++
        if (reset) resetToPending++
      }
      return { imported, skipped, resetToPending }
    }),
    list: vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const statuses = request.statuses ?? ['pending', 'in_progress']
      const tags = request.tags ?? []
      const search = request.search?.toLowerCase()
      const archived = request.archived === true
      const matching = rows.filter(row => statuses.includes(row.status)
        && (row.archivedAt !== null) === archived
        && tags.every(tag => row.tags.includes(tag.toLowerCase()))
        && (search === undefined || `${row.title} ${row.notes ?? ''}`.toLowerCase().includes(search)))
      const counts: TodoCounts = {
        pending: rows.filter(row => row.archivedAt === null && row.status === 'pending').length,
        inProgress: rows.filter(row => row.archivedAt === null && row.status === 'in_progress').length,
        completed: rows.filter(row => row.archivedAt === null && row.status === 'completed').length,
        cancelled: rows.filter(row => row.archivedAt === null && row.status === 'cancelled').length,
        archived: rows.filter(row => row.archivedAt !== null).length,
      }
      return { todos: matching.slice(request.offset ?? 0), total: matching.length, counts, hasMore: false }
    }),
    get: vi.fn(async (id: string, signal: AbortSignal) => {
      signal.throwIfAborted()
      const row = rows.find(candidate => candidate.id === id)
      if (row === undefined) throw new Error('not found')
      return detail(row)
    }),
    create: vi.fn(async (request: CreateTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const created = todo({
        id: `todo-${String(rows.length + 1)}`,
        title: request.title.trim(),
        notes: request.notes ?? null,
        assignee: request.assignee?.trim() || null,
        priority: request.priority ?? 'none',
        dueAt: request.dueAt ?? null,
        tags: [...(request.tags ?? [])].map(tag => tag.trim().toLowerCase()),
      })
      rows.push(created)
      return created
    }),
    update: vi.fn(async (request: UpdateTodoRequest, signal: AbortSignal) => {
      signal.throwIfAborted()
      const current = rows.find(row => row.id === request.id)
      if (current === undefined) throw new Error('not found')
      return replace(request.id, {
        ...request.patch,
        assignee: request.patch.assignee === undefined ? current.assignee : request.patch.assignee?.trim() || null,
        tags: request.patch.tags === undefined ? current.tags : [...request.patch.tags],
      })
    }),
    start: vi.fn(async (id: string, signal: AbortSignal) => {
      signal.throwIfAborted()
      return replace(id, { status: 'in_progress', executionStatus: 'running', primarySessionId: `session-${id}`, activeRunId: null })
    }),
    setStatus: vi.fn(async (request, signal) => {
      signal.throwIfAborted()
      return replace(request.id, { status: request.status, activeRunId: null, blockedReason: null, completedAt: request.status === 'completed' ? '2026-01-02T00:00:00.000Z' : null })
    }),
    stop: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      return replace(id, { executionStatus: 'stopped', activeRunId: null, blockedReason: null })
    }),
    approve: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      return replace(id, { status: 'completed', activeRunId: null, completedAt: '2026-01-02T00:00:00.000Z' })
    }),
    archive: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      return replace(id, { archivedAt: '2026-01-03T00:00:00.000Z' })
    }),
    restore: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      return replace(id, { archivedAt: null })
    }),
    delete: vi.fn(async (id: string, signal: AbortSignal) => {
      signal.throwIfAborted()
      const index = rows.findIndex(row => row.id === id)
      if (index < 0) throw new Error('not found')
      rows.splice(index, 1)
      return { id, deleted: true as const }
    }),
    openSession: vi.fn(async () => true),
  }
}

function TodoSurface({ service, wide = true }: { service: PersonalTodoPanelInjected; wide?: boolean }) {
  const snapshot = useSyncExternalStore(service.canvas.subscribe, service.canvas.getSnapshot)
  const surfaceService: PersonalTodoPanelInjected = {
    ...service,
    openCanvas: () => {
      service.openCanvas()
      service.canvas.open()
    },
  }
  return (
    <>
      <PersonalTodoTrigger {...{
        wide,
        t,
        ...surfaceService,
      } as ComponentProps<typeof PersonalTodoTrigger>} />
      <div data-testid="frame">
        <div data-sidebar-right-panel>
          {snapshot.open && <PersonalTodoCanvas {...{
            t,
            ...surfaceService,
            useTabInfo: () => ({ tab: { visible: true } }),
          } as ComponentProps<typeof PersonalTodoCanvas>} />}
        </div>
      </div>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PersonalTodoCanvas', () => {
  it.each([
    { status: 'pending', executionStatus: null, buttons: ['Mark complete', '交给 Agent', '更多待办操作'], primary: 'Mark complete' },
    { status: 'in_progress', executionStatus: null, buttons: ['Mark complete', '交给 Agent', '更多待办操作'], primary: 'Mark complete' },
    { status: 'in_progress', executionStatus: 'running', buttons: ['Open conversation', '停止并接手', '更多待办操作'], primary: 'Open conversation' },
    { status: 'in_progress', executionStatus: 'idle', buttons: ['Mark complete', 'Open conversation', '更多待办操作'], primary: 'Mark complete' },
    { status: 'in_progress', executionStatus: 'unavailable', buttons: ['Mark complete', 'Open conversation', '更多待办操作'], primary: 'Mark complete' },
    { status: 'in_progress', executionStatus: 'failed', buttons: ['Mark complete', 'Open conversation', '更多待办操作'], primary: 'Mark complete' },
    { status: 'in_progress', executionStatus: 'stopped', buttons: ['Mark complete', 'Open conversation', '更多待办操作'], primary: 'Mark complete' },
    { status: 'completed', executionStatus: null, buttons: ['重新打开', '更多待办操作'], primary: '重新打开' },
    { status: 'cancelled', executionStatus: null, buttons: ['重新打开', '更多待办操作'], primary: '重新打开' },
  ] as const)('$status / $executionStatus 详情只显示相关动作且仅一个主操作', async ({ status, executionStatus, buttons, primary }) => {
    const user = userEvent.setup()
    const service = api([todo({
      status, executionStatus, primarySessionId: executionStatus === null ? null : 'session-1',
      activeRunId: null,
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    if (status === 'cancelled') {
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('menuitem', { name: /Cancelled/ }))
    } else {
      await user.click(screen.getByRole('tab', { name: status === 'pending' ? /Pending/ : status === 'completed' ? /Completed/ : /In progress/ }))
    }
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    const actions = document.querySelector('.dsh-personal-todo-detail-actions') as HTMLElement
    expect(within(actions).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual(buttons)
    const pane = document.querySelector('.dsh-personal-todo-detail-pane') as HTMLElement
    expect(pane.querySelectorAll('button[data-variant=primary]')).toHaveLength(1)
    expect(within(pane).getAllByRole('button', { name: primary }).filter(button => button.getAttribute('data-variant') === 'primary')).toHaveLength(1)
    expect(within(actions).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(actions).queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('更多菜单分组保留低频操作，删除使用危险样式并仍需确认', async () => {
    const user = userEvent.setup()
    const service = api([todo()])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    const more = screen.getByRole('button', { name: '更多待办操作' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await user.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      '标为进行中', 'Edit', 'Duplicate todo', 'Archive', '取消任务', 'Delete',
    ])
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    const remove = screen.getByRole('menuitem', { name: 'Delete' })
    expect(remove.getAttribute('data-danger')).toBe('true')
    await user.click(remove)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(service.delete).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(service.delete).not.toHaveBeenCalled()
    await selectDetailMenu(user, '取消任务')
    expect(service.setStatus).toHaveBeenCalledWith({ id: 'todo-1', status: 'cancelled' }, expect.any(AbortSignal))
  })

  it('归档记录只突出恢复，旧待确认记录不同时展示执行按钮', async () => {
    const user = userEvent.setup()
    const service = api([todo({
      status: 'in_progress', executionStatus: 'submitted', activeRunId: 'run-1', primarySessionId: 'session-1',
      archivedAt: '2026-01-02T00:00:00.000Z',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    const actions = document.querySelector('.dsh-personal-todo-detail-actions') as HTMLElement
    expect(within(actions).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Open conversation', 'Restore', '更多待办操作'])
    expect(screen.queryByRole('button', { name: '确认完成' })).toBeNull()
    expect(screen.queryByRole('button', { name: '继续修改' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '更多待办操作' }))
    expect(screen.getByRole('menuitem', { name: 'Mark complete' })).toBeTruthy()
  })

  it('执行中的完成操作收进菜单，仍先确认停止，不直接写状态', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'in_progress', executionStatus: 'running', activeRunId: 'run-1', primarySessionId: 'session-1' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Mark complete')
    expect(service.approve).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '停止并继续' }))
    expect(service.approve).toHaveBeenCalledOnce()
  })

  it('手动开始和重开不调用 Agent，纯人工任务不展示对话区', async () => {
    const user = userEvent.setup()
    const service = api([todo({ title: '下班取快递' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: /下班取快递/ }))
    expect(screen.queryByText('Conversations')).toBeNull()
    await selectDetailMenu(user, '标为进行中')
    expect(service.setStatus).toHaveBeenCalledWith({ id: 'todo-1', status: 'in_progress' }, expect.any(AbortSignal))
    expect(service.start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /下班取快递/ }))
    await user.click(screen.getAllByRole('button', { name: 'Mark complete' }).at(-1)!)
    await user.click(screen.getByRole('tab', { name: /Completed/ }))
    await user.click(await screen.findByRole('button', { name: /下班取快递/ }))
    await user.click(screen.getByRole('button', { name: '重新打开' }))
    expect(service.rows[0]).toMatchObject({ status: 'pending', completedAt: null, executionStatus: null })
    expect(service.start).not.toHaveBeenCalled()
  })

  it('停止接手先确认，取消无操作；失败保持状态并允许重试', async () => {
    const user = userEvent.setup()
    const row = todo({ status: 'in_progress', executionStatus: 'running', activeRunId: 'run-1', primarySessionId: 'session-1' })
    const service = api([row])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(screen.getByRole('button', { name: '停止并接手' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(service.stop).not.toHaveBeenCalled()
    vi.mocked(service.stop).mockRejectedValueOnce(new Error('未能确认 Agent 已停止'))
    await user.click(screen.getByRole('button', { name: '停止并接手' }))
    await user.click(screen.getByRole('button', { name: '停止并继续' }))
    expect((await screen.findByRole('alert')).textContent).toContain('未能确认 Agent 已停止')
    expect(service.rows[0]).toEqual(row)
    await user.click(screen.getByRole('button', { name: '停止并继续' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(service.rows[0]).toMatchObject({ status: 'in_progress', executionStatus: 'stopped', activeRunId: null })
    expect(service.start).not.toHaveBeenCalled()
    await selectDetailMenu(user, '交给 Agent')
    expect(service.start).toHaveBeenCalledOnce()
  })

  function backupFile(rows: Todo[] = [], json?: string): File {
    const content = json ?? JSON.stringify({
      format: 'dsh-personal-todo', version: 1, exportedAt: '2026-09-14T10:00:00.000Z',
      todos: rows.map(row => {
        const snapshot = detail(row)
        return { ...snapshot, events: snapshot.events.map(event => ({ ...event, id: `${row.id}-${event.id}` })) }
      }),
    })
    const file = new File([content], '备份.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => content })
    return file
  }

  it('数据菜单下载完整 JSON 并释放下载 URL', async () => {
    const user = userEvent.setup()
    const service = api([todo(), todo({ id: 'archived', archivedAt: '2026-01-01T00:00:00.000Z' })])
    const createUrl = vi.fn(() => 'blob:todo-backup')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = createUrl
      static override revokeObjectURL = revokeUrl
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('personal-todo-test.json')
      expect(this.href).toBe('blob:todo-backup')
    })
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: '数据' }))
    await user.click(screen.getByRole('menuitem', { name: '导出 JSON' }))
    expect(await screen.findByText('备份已生成并请求下载。')).toBeTruthy()
    expect(service.exportData).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    await waitFor(() => { expect(revokeUrl).toHaveBeenCalledWith('blob:todo-backup') })
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('确认前不导入，取消后可重选同一文件，成功刷新计数且保留筛选', async () => {
    const user = userEvent.setup()
    const service = api([todo()])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('tab', { name: 'In progress 0' }))
    const file = backupFile([todo(), todo({ id: 'new', status: 'in_progress', activeRunId: 'run-1', primarySessionId: 'session-1' })])
    const input = screen.getByLabelText('选择 JSON 备份')
    await user.upload(input, file)
    const dialog = await screen.findByRole('dialog', { name: '确认导入备份' })
    expect(within(dialog).getByText(/共 2 项待办，其中 1 项含旧版运行中记录/u)).toBeTruthy()
    expect(service.importData).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(service.importData).not.toHaveBeenCalled()
    await user.upload(input, file)
    await user.click(within(await screen.findByRole('dialog', { name: '确认导入备份' })).getByRole('button', { name: '确认导入' }))
    expect(await screen.findByText('导入完成：新增 1 项，跳过 1 项，其中 1 项已转为待处理。')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'In progress 0' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Pending 2' })).toBeTruthy()
    expect(service.canvas.getSnapshot().attentionCount).toBe(2)
    expect(service.importData).toHaveBeenCalledTimes(1)
  })

  it('导入失败保留预览并允许重试，处理中禁止重复提交', async () => {
    const user = userEvent.setup()
    const service = api([])
    vi.mocked(service.importData).mockRejectedValueOnce(new Error('导入冲突'))
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.upload(await screen.findByLabelText('选择 JSON 备份'), backupFile())
    await user.click(screen.getByRole('button', { name: '确认导入' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '备份操作失败：导入冲突')
    let finish: ((value: { imported: number; skipped: number; resetToPending: number }) => void) | undefined
    vi.mocked(service.importData).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await user.click(screen.getByRole('button', { name: '确认导入' }))
    const dialog = screen.getByRole('dialog', { name: '确认导入备份' })
    expect((within(dialog).getByRole('button', { name: '正在处理备份…' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: '正在处理备份…' }))
    await user.click(within(dialog).getByRole('button', { name: '关闭导入确认' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(service.importData).toHaveBeenCalledTimes(2)
    await act(async () => { finish?.({ imported: 0, skipped: 0, resetToPending: 0 }) })
    expect(await screen.findByText(/导入完成/u)).toBeTruthy()
  })

  it('文件校验与导出失败使用独立错误提示，不调用导入接口', async () => {
    const user = userEvent.setup()
    const service = api([])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    const input = await screen.findByLabelText('选择 JSON 备份')
    await user.upload(input, backupFile([], '{'))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('不是有效的 JSON'))
    const oversized = backupFile()
    Object.defineProperty(oversized, 'size', { value: TODO_BACKUP_MAX_BYTES + 1 })
    await user.upload(input, oversized)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('20 MiB'))
    expect(service.importData).not.toHaveBeenCalled()
    vi.mocked(service.exportData).mockRejectedValueOnce(new Error('网络错误'))
    await user.click(screen.getByRole('button', { name: '数据' }))
    await user.click(screen.getByRole('menuitem', { name: '导出 JSON' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '备份操作失败：网络错误')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('将摘要、验证、风险、备注和活动渲染为安全的 Markdown', async () => {
    const user = userEvent.setup()
    const source = todo({
      status: 'in_progress', executionStatus: 'submitted', primarySessionId: 'session-1', activeRunId: 'run-1',
      latestSummary: '**摘要加粗**', notes: '## 备注标题\n\n[文档](https://example.com/docs)',
    })
    const service = api([source])
    const snapshot = detail(source)
    vi.mocked(service.get).mockResolvedValue({
      ...snapshot,
      runs: snapshot.runs.map(run => ({ ...run, verification: '1. 验证一\n2. 验证二', risk: '`风险代码`' })),
      events: [{ ...snapshot.events[0]!, message: '> 活动引用\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))' }],
    })
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('tab', { name: 'In progress 1' }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect((await screen.findByText('摘要加粗')).tagName).toBe('STRONG')
    expect(screen.getByRole('heading', { name: '备注标题' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '文档' }).getAttribute('href')).toBe('https://example.com/docs')
    expect(screen.getByText('验证一').closest('ol')).not.toBeNull()
    expect(screen.getByText('风险代码').tagName).toBe('CODE')
    expect(screen.getByText('活动引用').closest('blockquote')).not.toBeNull()
    expect(document.querySelector('.dsh-personal-todo-markdown script')).toBeNull()
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
  })

  it.each(['pending', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled', 'archived'] as const)('复制 %s 待办时只保留元信息并打开新的待处理待办', async (state) => {
    const user = userEvent.setup()
    const source = todo({
      status: state === 'archived' ? 'completed' : state === 'blocked' || state === 'in_review' ? 'in_progress' : state,
      executionStatus: state === 'blocked' ? 'waiting_input' : state === 'in_review' ? 'submitted' : null,
      assignee: '张三',
      dueAt: '2026-09-20T10:00:00.000Z',
      primarySessionId: 'old-session',
      activeRunId: 'old-run',
      latestSummary: '旧进度',
      blockedReason: '旧阻塞',
      reviewRound: 3,
      revision: 9,
      completedAt: '2026-09-01T10:00:00.000Z',
      archivedAt: state === 'archived' ? '2026-09-02T10:00:00.000Z' : null,
    })
    const service = api([source])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    if (state === 'completed') {
      await user.click(screen.getByRole('tab', { name: 'Completed 1' }))
    } else if (state === 'cancelled' || state === 'archived') {
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('menuitem', { name: state === 'archived' ? 'Archive 1' : 'Cancelled 1' }))
    } else if (state !== 'pending') {
      await user.click(await screen.findByRole('tab', { name: 'In progress 1' }))
    }
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Duplicate todo')
    await waitFor(() => { expect(service.rows).toHaveLength(2) })
    expect(service.create).toHaveBeenCalledWith({
      title: source.title, notes: source.notes, assignee: source.assignee,
      priority: source.priority, dueAt: source.dueAt, tags: source.tags,
    }, expect.any(AbortSignal))
    expect(service.rows[0]).toEqual(source)
    expect(service.rows[1]).toMatchObject({
      id: 'todo-2', status: 'pending', primarySessionId: null, activeRunId: null,
      latestSummary: null, blockedReason: null, reviewRound: 0, revision: 0,
      completedAt: null, archivedAt: null,
    })
    expect(service.start).not.toHaveBeenCalled()
    expect((await screen.findAllByRole('button', { name: '交给 Agent' })).length).toBeGreaterThan(0)
    expect(service.get).toHaveBeenCalledWith('todo-2', expect.any(AbortSignal))
    expect(document.querySelector('.dsh-personal-todo-detail-actions')?.textContent).not.toContain('Open conversation')
    await user.click(screen.getByRole('button', { name: 'Back to list' }))
    expect(screen.getByRole('tab', { name: /^Pending/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('复制失败时保留原待办并允许重试', async () => {
    const user = userEvent.setup()
    const source = todo()
    const service = api([source])
    vi.mocked(service.create).mockRejectedValueOnce(new Error('复制失败'))
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Duplicate todo')
    expect(await screen.findByText(/复制失败/)).toBeTruthy()
    expect(service.rows).toEqual([source])
    await selectDetailMenu(user, 'Duplicate todo')
    await waitFor(() => { expect(service.rows).toHaveLength(2) })
  })

  it('重复点击侧栏入口时聚焦同一个宿主 Tab，并保留正在编辑的表单', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)
    const trigger = screen.getByRole('button', { name: /personal todos/i })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    await user.click(trigger)
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Personal Todos' })).toBeTruthy()
    expect(service.openCanvas).toHaveBeenCalledTimes(2)
  })

  it('keeps English and Chinese dictionaries structurally aligned', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('没有当前会话时允许入口处理宿主尚未挂载的右栏服务', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)
    const trigger = screen.getByRole('button', { name: /personal todos/i })
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    await user.click(trigger)
    expect(service.openCanvas).toHaveBeenCalledOnce()
  })

  it('renders a full-width text action in a wide sidebar and an icon in a narrow sidebar', () => {
    const service = api()
    const view = render(<TodoSurface service={service} />)
    const wideAction = screen.getByRole('button', { name: /personal todos/i })
    expect(wideAction.textContent).toContain('Todos')
    expect(wideAction.getAttribute('data-wide')).toBe('true')
    expect(document.querySelector('style')?.textContent).toContain(
      "[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true])",
    )
    view.rerender(<TodoSurface service={service} wide={false} />)
    expect(screen.getByRole('button', { name: /personal todos/i }).textContent).toBe('')
  })

  it('侧栏统计未完成任务，不再按等待回复或审核分类', async () => {
    const service = api([
      todo({ id: 'blocked', status: 'in_progress', executionStatus: 'waiting_input', activeRunId: 'blocked-run', blockedReason: 'Need input' }),
      todo({ id: 'review', status: 'in_progress', executionStatus: 'submitted', activeRunId: 'review-run', latestSummary: 'Ready' }),
      todo({ id: 'pending' }),
      todo({ id: 'running', status: 'in_progress' }),
      todo({ id: 'completed', status: 'completed' }),
      todo({ id: 'cancelled', status: 'cancelled' }),
      todo({ id: 'archived', archivedAt: '2026-01-03T00:00:00.000Z' }),
    ])
    render(<TodoSurface service={service} />)

    const trigger = await screen.findByRole('button', { name: '4 项待办未完成' })
    expect(within(trigger).getByText('4')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Personal Todos' })).toBeNull()
  })

  it.each([false, true])('Agent 新增待办后自动更新侧栏和已打开的空面板（打开：%s）', async (open) => {
    vi.useFakeTimers()
    const service = api()
    if (open) service.canvas.open()
    const rendered = render(<TodoSurface service={service} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    service.rows.push(todo({ title: 'Agent 新增待办' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    if (open) {
      expect(screen.getByRole('tab', { name: 'Pending 1' })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Agent 新增待办/ })).toBeTruthy()
      await act(async () => { service.canvas.close() })
      vi.mocked(service.list).mockClear()
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
      expect(service.list).toHaveBeenCalledTimes(1)
      expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }), expect.any(AbortSignal))
    }
    expect(screen.getByRole('button', { name: '1 项待办未完成' })).toBeTruthy()
    rendered.unmount()
    vi.mocked(service.list).mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(service.list).not.toHaveBeenCalled()
  })

  it('只在宿主右栏 Tab 可见时读取内容', async () => {
    const service = api()
    const view = render(<PersonalTodoCanvas {...{
      t,
      ...service,
      useTabInfo: () => ({ tab: { visible: false } }),
    } as unknown as ComponentProps<typeof PersonalTodoCanvas>} />)
    expect(service.list).not.toHaveBeenCalled()

    view.rerender(<PersonalTodoCanvas {...{
      t,
      ...service,
      useTabInfo: () => ({ tab: { visible: true } }),
    } as unknown as ComponentProps<typeof PersonalTodoCanvas>} />)
    await waitFor(() => expect(service.list).toHaveBeenCalledOnce())
  })

  it('switches active statuses with tabs and history statuses from the more menu', async () => {
    const user = userEvent.setup()
    const service = api([
      todo({ id: 'pending-1', title: 'Pending task' }),
      todo({ id: 'pending-2', title: 'Another pending task' }),
      todo({ id: 'running', title: 'Running task', status: 'in_progress' }),
      todo({ id: 'blocked', title: 'Blocked task', status: 'in_progress', executionStatus: 'waiting_input', activeRunId: 'blocked-run' }),
      todo({ id: 'review', title: 'Review task', status: 'in_progress', executionStatus: 'submitted', activeRunId: 'review-run' }),
      todo({ id: 'completed', title: 'Completed task', status: 'completed' }),
      todo({ id: 'cancelled', title: 'Cancelled task', status: 'cancelled' }),
      todo({ id: 'archived', title: 'Archived task', archivedAt: '2026-01-03T00:00:00.000Z' }),
    ])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))

    expect((await screen.findByRole('tab', { name: 'Pending 2' })).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: /Pending task/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Another pending task/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Pending ·/ })).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: /Completed/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.getByRole('button', { name: 'More' }).closest('.dsh-personal-todo-tabs')).toBeNull()
    const statusRow = screen.getByRole('tablist').closest('.dsh-personal-todo-status-row')
    const toolbar = screen.getByRole('button', { name: 'New todo' }).closest('.dsh-personal-todo-toolbar')
    expect(within(statusRow as HTMLElement).getByRole('button', { name: 'More' }).textContent).toBe('')
    expect(toolbar?.nextElementSibling).toBe(statusRow)
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(within(toolbar as HTMLElement).queryByRole('button', { name: 'More' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Search todos' })).toBeNull()

    for (const [tabName, title] of [
      ['In progress 3', 'Running task'],
      ['In progress 3', 'Blocked task'],
      ['In progress 3', 'Review task'],
    ] as const) {
      await user.click(screen.getByRole('tab', { name: tabName }))
      expect(await screen.findByRole('button', { name: new RegExp(title) })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Pending task/ })).toBeNull()
    }

    expect(screen.queryByRole('checkbox', { name: /需要我处理/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Running task/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Blocked task/ })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Completed 1' }))
    expect(await screen.findByRole('button', { name: /Completed task/ })).toBeTruthy()
    for (const [menuName, title] of [
      ['Cancelled 1', 'Cancelled task'],
      ['Archive 1', 'Archived task'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('menuitem', { name: menuName }))
      expect(await screen.findByRole('button', { name: new RegExp(title) })).toBeTruthy()
      expect(screen.queryByRole('menuitem')).toBeNull()
    }
  })

  it('groups the selected status by assignee and puts unassigned todos last', async () => {
    const user = userEvent.setup()
    const service = api([
      todo({ id: 'alice-1', title: 'Alice first', assignee: 'Alice' }),
      todo({ id: 'unassigned', title: 'Needs owner', assignee: null }),
      todo({ id: 'bob', title: 'Bob task', assignee: 'Bob' }),
      todo({ id: 'alice-2', title: 'Alice second', assignee: 'Alice' }),
    ])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))

    const groups = [...document.querySelectorAll<HTMLElement>('.dsh-personal-todo-assignee-heading')]
    expect(groups.map(group => group.textContent)).toEqual(['Alice2', 'Bob1', 'Unassigned1'])
    expect(within(groups[0]?.closest('section') as HTMLElement).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Alice first/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Needs owner/ })).toBeTruthy()
  })

  it('opens in the host right Sidebar Tab, clamps card descriptions, and reveals full details', async () => {
    const user = userEvent.setup()
    const notes = 'First line\nSecond line\nThird line with the remaining task detail.'
    const service = api([todo({ notes })])
    render(<TodoSurface service={service} />)

    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /personal todos/i }))

    const canvas = await screen.findByRole('region', { name: 'Personal Todos' })
    expect(canvas.classList.contains('dsh-personal-todo-canvas')).toBe(true)
    expect(service.openCanvas).toHaveBeenCalledOnce()
    expect(canvas.closest('[data-sidebar-right-panel]')).not.toBeNull()
    const card = within(canvas).getByRole('button', { name: /Ship plugin/ })
    expect(card.querySelector('p')?.textContent).toBe(notes)
    expect(document.querySelector('style')?.textContent).toContain('-webkit-line-clamp:2')

    await user.click(card)
    expect([...canvas.querySelectorAll('p')].filter(node => node.textContent === notes)).toHaveLength(2)
    expect(within(canvas).getByRole('button', { name: 'Back to list' })).toBeTruthy()
    await user.click(within(canvas).getByRole('button', { name: 'Back to list' }))
    expect([...canvas.querySelectorAll('p')].filter(node => node.textContent === notes)).toHaveLength(1)

    expect(within(canvas).queryByRole('button', { name: 'Close todo panel' })).toBeNull()
  })

  it.each([null, '2026-09-15T10:30:00.000Z'])('shows the due date and header back navigation for %s', async (dueAt) => {
    const user = userEvent.setup()
    const service = api([todo({ dueAt })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByRole('heading', { name: 'Todo details' })).toBeTruthy()
    await screen.findByText('Due date')
    const deadline = screen.getByText('Due date').parentElement
    if (dueAt === null) expect(deadline?.textContent).toContain('Not set')
    else expect(deadline?.querySelector('time')?.dateTime).toBe(dueAt)
    const back = screen.getByRole('button', { name: 'Back to list' })
    expect(back.closest('header')).not.toBeNull()
    await user.click(back)
    expect(screen.getByRole('tablist')).toBeTruthy()
  })

  it('creates a pending todo without starting it and returns to the pending tab', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: 'In progress 0' }))
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    const createButton = screen.getByRole('button', { name: 'Create' })
    expect((createButton as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Plan for later')
    await user.click(createButton)
    expect(await screen.findByRole('button', { name: /Plan for later/ })).toBeTruthy()
    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.start).not.toHaveBeenCalled()
    expect(service.rows[0]).toMatchObject({ title: 'Plan for later', status: 'pending', primarySessionId: null })
    expect(screen.getByRole('tab', { name: 'Pending 1' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
  })

  it('creates, edits, starts, inspects, and opens the root execution conversation', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)

    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect(await screen.findByText('No Pending todos.')).toBeTruthy()
    expect(screen.getByText(zh['empty.pending'])).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Create a todo' }))
    expect(screen.queryByRole('dialog', { name: 'New todo' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New todo' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'New todo' })).toBeTruthy()
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Write tests')
    await user.type(screen.getByPlaceholderText('Optional details'), 'Client behavior')
    await user.type(screen.getByPlaceholderText('Enter an assignee'), 'Alice')
    await user.type(screen.getByPlaceholderText('work, this-week'), 'Work, UI')
    await user.click(screen.getByRole('button', { name: '创建并交给 Agent' }))
    expect(await screen.findByText('Write tests')).toBeTruthy()
    await waitFor(() => expect(service.start).toHaveBeenCalledWith('todo-1', expect.any(AbortSignal)))

    await user.click(screen.getByRole('button', { name: /Write tests/ }))
    expect(await screen.findByText('Assignee: Alice')).toBeTruthy()
    await selectDetailMenu(user, 'Edit')
    const title = screen.getByDisplayValue('Write tests')
    await user.clear(title)
    await user.type(title, 'Write browser tests')
    const assignee = screen.getByDisplayValue('Alice')
    await user.clear(assignee)
    await user.type(assignee, 'Bob')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findAllByText('Write browser tests')).length).toBe(2)
    expect(await screen.findByText('Assignee: Bob')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Write browser tests/ }))
    expect(await screen.findByText('Primary execution conversation')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Open conversation' })[0] as HTMLElement)
    expect(service.openSession).toHaveBeenCalledWith('session-todo-1', null)
    expect(screen.getByRole('region', { name: 'Personal Todos' })).toBeTruthy()
  })

  it('reports a stale Host when an assignee update is silently discarded', async () => {
    const user = userEvent.setup()
    const row = todo({ assignee: null })
    const base = api([row])
    const service: PersonalTodoPanelInjected = {
      ...base,
      update: vi.fn(async (request, signal) => {
        signal.throwIfAborted()
        return { ...row, title: request.patch.title ?? row.title, revision: row.revision + 1 }
      }),
    }
    render(<TodoSurface service={service} />)

    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Edit')
    await user.type(screen.getByPlaceholderText('Enter an assignee'), 'Alice')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The assignee was not saved. Restart the DSH Web service and try again.',
    )
    expect(screen.getByDisplayValue('Alice')).toBeTruthy()
  })

  it('lists and opens Agent-created related conversations', async () => {
    const user = userEvent.setup()
    const row = todo({ status: 'in_progress', executionStatus: 'submitted', primarySessionId: 'session-1', activeRunId: 'run-1', reviewRound: 1 })
    const base = api([row])
    const service: PersonalTodoPanelInjected = {
      ...base,
      get: vi.fn(async (_id, signal) => {
        signal.throwIfAborted()
        return {
          ...detail(row),
          sessions: [
            { todoId: row.id, sessionId: 'session-1', role: 'primary', parentSessionId: null, createdAt: row.createdAt },
            { todoId: row.id, sessionId: 'child-1', role: 'related', parentSessionId: 'session-1', createdAt: row.updatedAt },
          ] satisfies TodoSession[],
        }
      }),
    }
    render(<TodoSurface service={service} />)

    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText('Primary execution conversation')).toBeTruthy()
    expect(await screen.findByText('Related work conversation 1')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Open conversation' })[2] as HTMLElement)
    expect(service.openSession).toHaveBeenCalledWith('child-1', 'session-1')
  })

  it('旧阻塞记录不再出现回复框，沟通统一跳转原对话', async () => {
    const user = userEvent.setup()
    const service = api([todo({
      status: 'in_progress', executionStatus: 'waiting_input', primarySessionId: 'session-1', activeRunId: 'run-1',
      blockedReason: 'Which option?', latestSummary: 'Which option?',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(screen.queryByRole('textbox', { name: 'Reply to Agent' })).toBeNull()
    expect(screen.queryByText('Which option?')).toBeNull()
    await user.click(within(document.querySelector('.dsh-personal-todo-detail-actions') as HTMLElement).getByRole('button', { name: 'Open conversation' }))
    expect(service.openSession).toHaveBeenCalledWith('session-1', null)
    expect(service.rows[0]).toMatchObject({ status: 'in_progress', blockedReason: 'Which option?' })
  })

  it.each([
    ['pending', /Pending/], ['in_progress', /In progress/],
  ] as const)('用户从 %s 详情直接完成待办并在完成列表查看', async (status, tab) => {
    const user = userEvent.setup()
    const service = api([todo({ status })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: tab }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click((await screen.findAllByRole('button', { name: 'Mark complete' })).at(-1)!)
    await waitFor(() => expect(service.approve).toHaveBeenCalledWith('todo-1', expect.any(AbortSignal)))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'completed', activeRunId: null }))
    expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Completed 1' }))
    expect(await screen.findByRole('button', { name: /Ship plugin/ })).toBeTruthy()
  })

  it('旧审核结果仅作为历史展示，完成任务不需要审核流程', async () => {
    const user = userEvent.setup()
    const review = todo({
      status: 'in_progress', executionStatus: 'submitted', primarySessionId: 'session-1', activeRunId: 'run-1',
      latestSummary: 'Implemented the change.', reviewRound: 1,
    })
    const service = api([review])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText('Unit tests passed.')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Change request' })).toBeNull()
    expect(screen.queryByRole('button', { name: '继续修改' })).toBeNull()
    await user.click(within(document.querySelector('.dsh-personal-todo-detail-actions') as HTMLElement).getByRole('button', { name: 'Mark complete' }))
    expect(screen.queryByRole('button', { name: '停止并继续' })).toBeNull()
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'completed' }))
  })

  it('Agent 空闲后仍留在进行中详情，只刷新运行标识与操作', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const service = api([todo({
      status: 'in_progress', executionStatus: 'running', primarySessionId: 'session-1',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))

    service.rows[0] = todo({
      status: 'in_progress', executionStatus: 'idle', primarySessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(2_000)

    expect(screen.queryByText('No In progress todos.')).toBeNull()
    expect((await screen.findAllByText('Agent · 空闲')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Mark complete' }).length).toBeGreaterThan(0)
  })

  it('loads completed history without search or tag filters and deletes from task details', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect(screen.queryByRole('textbox', { name: 'Search todos' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Filter by tags' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: /Completed/ }))
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ statuses: ['completed'], archived: false, offset: 0 }, expect.any(AbortSignal)))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Delete')
    const dialog = screen.getByRole('dialog', { name: 'Delete todo' })
    expect(within(dialog).getByText(/permanently deleted/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(service.rows).toHaveLength(0))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete todo' })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(service.get).toHaveBeenCalledTimes(1)
  })

  it('archives completed todos and restores them from the archive view', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /Completed/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Archive')
    await waitFor(() => expect(service.rows[0]).toMatchObject({ archivedAt: expect.any(String) }))
    expect(await screen.findByText('No Completed todos.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText(/Archived/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ archivedAt: null }))
    expect(await screen.findByText('No archived history yet.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('archives in-progress todos while preserving their lifecycle state', async () => {
    const user = userEvent.setup()
    const service = api([todo({
      status: 'in_progress', executionStatus: 'running', primarySessionId: 'session-1', activeRunId: null,
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await selectDetailMenu(user, 'Archive')
    expect(service.archive).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '停止并继续' }))
    expect(await screen.findByText('No In progress todos.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect((await screen.findAllByText('In progress')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('No archived history yet.')).toBeTruthy()
    expect(service.rows[0]).toMatchObject({ status: 'in_progress', archivedAt: null })
  })

  it('deletes an archived in-progress todo from its details', async () => {
    const user = userEvent.setup()
    const service = api([todo({
      status: 'in_progress',
      primarySessionId: 'session-1',
      activeRunId: 'run-1',
      archivedAt: '2026-01-03T00:00:00.000Z',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy()
    await selectDetailMenu(user, 'Delete')
    const dialog = screen.getByRole('dialog', { name: 'Delete todo' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(service.rows).toHaveLength(0))
    expect(await screen.findByText('No archived history yet.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows load failures and aborts an in-flight read when the host tab unmounts', async () => {
    const user = userEvent.setup()
    let aborted = false
    let fail = false
    const base = api()
    const service: PersonalTodoPanelInjected = { ...base, list: vi.fn((_request: ListTodoInput, signal: AbortSignal) => fail
      ? Promise.reject(new Error('database unavailable'))
      : new Promise<TodoListResult>((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason) }, { once: true })
      })) }
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await act(async () => { service.canvas.close() })
    expect(aborted).toBe(true)
    fail = true
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect((await screen.findByRole('alert')).textContent).toContain('database unavailable')
  })
})

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { TodoToolCard } from '../src/client/TodoToolCard.tsx'
import { TodoTurnTail } from '../src/client/TodoTurnTail.tsx'
import { PersonalTodoCanvas, type PersonalTodoPanelInjected } from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoDataCenter, type PersonalTodoRemoteApi } from '../src/client/data-center.ts'
import { en } from '../src/client/locales.ts'
import { personalTodoPresentationMeta } from '../src/presentation.ts'
import type { ListTodoInput, Todo, TodoCounts, TodoDetail, UpdateTodoRequest } from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: ({ text }: { text: string }) => <span>{text}</span>,
  Button: ({ icon, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; variant?: string }) =>
    <button {...props} data-variant={variant}>{icon}{children}</button>,
  Menu: ({ open, anchor, items, onSelect }: {
    open: boolean
    anchor: React.ReactNode
    items: readonly MenuEntry[]
    onSelect: (id: string) => void
  }) => <span>
    {anchor}
    {open && createPortal(<div role="menu">{items.map(item => 'type' in item
      ? <hr key={item.id} />
      : <button type="button" role="menuitem" disabled={item.disabled} key={item.id}
          onClick={() => { onSelect(item.id) }}>{item.label}</button>)}</div>, document.body)}
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
}))

const t = ((key: keyof typeof en, parameters?: Record<string, unknown>) => {
  let message = en[key]
  for (const [name, value] of Object.entries(parameters ?? {})) message = message.replace(`{${name}}`, String(value))
  return message
}) as ComponentProps<typeof TodoToolCard>['t']

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: '同步卡片',
    notes: '从卡片修改后应同步到所有视图',
    assignee: 'Alice',
    status: 'pending',
    executionStatus: null,
    priority: 'high',
    dueAt: '2026-09-20T10:00:00.000Z',
    tags: ['dsh'],
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

function service(initial: Todo[]): PersonalTodoRemoteApi & { rows: Todo[] } {
  const rows = initial
  const replace = (id: string, patch: Partial<Todo>): Todo => {
    const index = rows.findIndex(row => row.id === id)
    if (index < 0) throw new Error('not found')
    const updated = { ...rows[index]!, ...patch, revision: rows[index]!.revision + 1 }
    rows[index] = updated
    return updated
  }
  const list = vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
    signal.throwIfAborted()
    const statuses = request.statuses ?? ['pending', 'in_progress']
    const archived = request.archived === true
    const matching = rows.filter(row => statuses.includes(row.status) && (row.archivedAt !== null) === archived)
    const counts: TodoCounts = {
      pending: rows.filter(row => row.archivedAt === null && row.status === 'pending').length,
      inProgress: rows.filter(row => row.archivedAt === null && row.status === 'in_progress').length,
      completed: rows.filter(row => row.archivedAt === null && row.status === 'completed').length,
      cancelled: rows.filter(row => row.archivedAt === null && row.status === 'cancelled').length,
      archived: rows.filter(row => row.archivedAt !== null).length,
    }
    const offset = request.offset ?? 0
    const limit = request.limit ?? 50
    return {
      todos: matching.slice(offset, offset + limit),
      total: matching.length,
      counts,
      hasMore: offset + limit < matching.length,
    }
  })
  return {
    rows,
    list,
    exportData: vi.fn(async () => ({ filename: 'todos.json', json: '{}' })),
    importData: vi.fn(async () => ({ imported: 0, skipped: 0, resetToPending: 0 })),
    get: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      const row = rows.find(candidate => candidate.id === id)
      if (row === undefined) throw new Error('not found')
      return detail(row)
    }),
    create: vi.fn(async () => todo({ id: 'created' })),
    update: vi.fn(async (request: UpdateTodoRequest, signal) => {
      signal.throwIfAborted()
      return replace(request.id, {
        ...(request.patch.title === undefined ? {} : { title: request.patch.title }),
        ...(request.patch.notes === undefined ? {} : { notes: request.patch.notes }),
        ...(request.patch.assignee === undefined ? {} : { assignee: request.patch.assignee }),
        ...(request.patch.priority === undefined ? {} : { priority: request.patch.priority }),
        ...(request.patch.dueAt === undefined ? {} : { dueAt: request.patch.dueAt }),
        ...(request.patch.tags === undefined ? {} : { tags: [...request.patch.tags] }),
      })
    }),
    start: vi.fn(async (id, signal) => { signal.throwIfAborted(); return replace(id, { status: 'in_progress', executionStatus: 'running' }) }),
    approve: vi.fn(async (id, signal) => { signal.throwIfAborted(); return replace(id, { status: 'completed', executionStatus: null }) }),
    setStatus: vi.fn(async (request, signal) => { signal.throwIfAborted(); return replace(request.id, { status: request.status }) }),
    stop: vi.fn(async (id, signal) => { signal.throwIfAborted(); return replace(id, { executionStatus: 'stopped' }) }),
    archive: vi.fn(async (id, signal) => { signal.throwIfAborted(); return replace(id, { archivedAt: '2026-09-15T01:00:00.000Z' }) }),
    restore: vi.fn(async (id, signal) => { signal.throwIfAborted(); return replace(id, { archivedAt: null }) }),
    delete: vi.fn(async (id, signal) => {
      signal.throwIfAborted()
      const index = rows.findIndex(row => row.id === id)
      if (index < 0) throw new Error('not found')
      rows.splice(index, 1)
      return { id, deleted: true as const }
    }),
  }
}

function resultBlock(query: ListTodoInput, rows: Todo[], meta = true) {
  const result = {
    todos: rows,
    total: rows.length,
    counts: { pending: rows.length, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
    hasMore: false,
  }
  return {
    kind: 'tool-result' as const,
    seq: 1,
    time: 1,
    callId: 'call-1',
    call: { name: 'personal_todo_show', argsRaw: JSON.stringify(query) },
    callTime: 0,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    isError: false,
    meta: meta ? personalTodoPresentationMeta(query, result) : undefined,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function snapshotOnlyBlock(rows: Todo[]) {
  const result = {
    todos: rows,
    total: rows.length,
    counts: { pending: rows.length, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
    hasMore: false,
  }
  return {
    kind: 'tool-result' as const,
    seq: 1,
    time: 1,
    callId: 'call-snapshot',
    call: null,
    callTime: 0,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    isError: false,
    meta: undefined,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function Card(props: {
  center: PersonalTodoDataCenter
  block: ReturnType<typeof resultBlock> | ReturnType<typeof snapshotOnlyBlock>
  callId?: string
  openSession?: (id: string, parentSessionId: string | null) => Promise<boolean>
}) {
  return <TodoToolCard {...{
    block: { ...props.block, callId: props.callId ?? props.block.callId },
    callId: props.callId ?? props.block.callId,
    toolName: 'personal_todo_show',
    dataCenter: props.center,
    openSession: props.openSession ?? vi.fn(async () => true),
    openFile: vi.fn(),
    loadImage: vi.fn(),
    t,
    sessionId: 'session-1',
  } as unknown as ComponentProps<typeof TodoToolCard>} />
}

function Panel({ center }: { center: PersonalTodoDataCenter }) {
  const panel: PersonalTodoPanelInjected = {
    dataCenter: center,
    canvas: center.canvas,
    openCanvas: () => { center.canvas.open() },
    list: center.list.bind(center),
    exportData: center.exportData.bind(center),
    importData: center.importData.bind(center),
    get: center.get.bind(center),
    create: center.create.bind(center),
    update: center.update.bind(center),
    start: center.start.bind(center),
    approve: center.approve.bind(center),
    setStatus: center.setStatus.bind(center),
    stop: center.stop.bind(center),
    archive: center.archive.bind(center),
    restore: center.restore.bind(center),
    delete: center.delete.bind(center),
    openSession: vi.fn(async () => true),
  }
  return <PersonalTodoCanvas {...{
    ...panel,
    t,
    useTabInfo: () => ({ tab: { visible: true } }),
  } as unknown as ComponentProps<typeof PersonalTodoCanvas>} />
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TodoToolCard', () => {
  it('在 turn 结束位置复用实时卡片展示持久化快照', async () => {
    const row = todo({ title: '回合末尾待办' })
    const api = service([row])
    const center = new PersonalTodoDataCenter(api)
    const result = {
      todos: [row],
      total: 1,
      counts: { pending: 1, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
      hasMore: false,
    }

    render(<TodoTurnTail {...{
      seq: 11,
      turn: {
        status: 'closed',
        data: {
          get: () => ({
            results: [{
              callId: 'tail-call',
              seq: 11,
              meta: personalTodoPresentationMeta({ statuses: ['pending'] }, result),
            }],
          }),
        },
      },
      openFile: vi.fn(),
      dataCenter: center,
      openSession: vi.fn(async () => true),
      t,
    } as unknown as ComponentProps<typeof TodoTurnTail>} />)

    expect(screen.getByRole('region', { name: 'Personal Todos' })).toBeTruthy()
    expect(screen.getByText('回合末尾待办')).toBeTruthy()
    await waitFor(() => { expect(api.list).toHaveBeenCalledOnce() })
    center.dispose()
  })

  it('使用历史快照立即展示，并在刷新失败时保留卡片内容', async () => {
    const row = todo({ title: '历史快照标题' })
    const api = service([row])
    vi.mocked(api.list).mockRejectedValue(new Error('网络不可用'))
    const center = new PersonalTodoDataCenter(api)
    render(<Card center={center} block={resultBlock({ statuses: ['pending'] }, [row])} />)

    expect(screen.getByText('历史快照标题')).toBeTruthy()
    expect(await screen.findByText(/Refresh failed; showing existing data: 网络不可用/)).toBeTruthy()
    expect(screen.getByText('1 total')).toBeTruthy()
    center.dispose()
  })

  it('旧 personal_todo_list 没有 metadata 时从 JSON 结果恢复快照', () => {
    const row = todo({ title: '旧日志待办' })
    const api = service([])
    vi.mocked(api.list).mockRejectedValue(new Error('离线'))
    const center = new PersonalTodoDataCenter(api)
    render(<Card center={center} block={resultBlock({ statuses: ['pending'] }, [row], false)} />)
    expect(screen.getByText('旧日志待办')).toBeTruthy()
    center.dispose()
  })

  it('无查询头的历史快照在删除后立即移除且不会复活', async () => {
    const user = userEvent.setup()
    const row = todo({ title: '仅快照待办' })
    const api = service([row])
    const center = new PersonalTodoDataCenter(api)
    render(<Card center={center} block={snapshotOnlyBlock([row])} />)

    await user.click(screen.getByRole('button', { name: '更多待办操作' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Delete todo' }))
      .getByRole('button', { name: 'Delete' }))

    await waitFor(() => { expect(screen.queryByText('仅快照待办')).toBeNull() })
    expect(screen.getByText('0 total')).toBeTruthy()
    center.dispose()
  })

  it('查看对话失败时在卡片内显示错误', async () => {
    const user = userEvent.setup()
    const row = todo({ primarySessionId: 'session-1' })
    const api = service([row])
    const center = new PersonalTodoDataCenter(api)
    render(<Card center={center} block={resultBlock({ statuses: ['pending'] }, [row])}
      openSession={vi.fn(async () => { throw new Error('打开失败') })} />)

    await user.click(await screen.findByRole('button', { name: 'Open conversation' }))
    expect(await screen.findByText('打开失败')).toBeTruthy()
    center.dispose()
  })

  it('两张卡片和侧栏共享实体，编辑后同步更新，完成后从原筛选移除', async () => {
    const user = userEvent.setup()
    const row = todo()
    const api = service([row])
    const center = new PersonalTodoDataCenter(api)
    const block = resultBlock({ statuses: ['pending'] }, [row])
    render(<>
      <Card center={center} block={block} callId="card-a" />
      <Card center={center} block={block} callId="card-b" />
      <Panel center={center} />
    </>)
    await waitFor(() => { expect(screen.getAllByText('同步卡片')).toHaveLength(3) })

    const cards = screen.getAllByRole('region', { name: 'Personal Todos' })
    const firstCard = cards[0]!
    await user.click(within(firstCard).getByRole('button', { name: '更多待办操作' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, '已同步标题')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(screen.getAllByText('已同步标题')).toHaveLength(3) })

    await user.click(within(firstCard).getByRole('button', { name: 'Mark complete' }))
    await waitFor(() => { expect(screen.queryByText('已同步标题')).toBeNull() })
    expect(api.approve).toHaveBeenCalledOnce()
    center.dispose()
  })

  it('运行中操作先确认停止，删除始终二次确认且失败不修改实体', async () => {
    const user = userEvent.setup()
    const row = todo({ executionStatus: 'running', primarySessionId: 'session-1' })
    const api = service([row])
    vi.mocked(api.approve).mockRejectedValueOnce(new Error('停止失败'))
    const center = new PersonalTodoDataCenter(api)
    render(<Card center={center} block={resultBlock({ statuses: ['pending'] }, [row])} />)
    await screen.findByText('同步卡片')

    await user.click(screen.getByRole('button', { name: 'Mark complete' }))
    const stopDialog = screen.getByRole('dialog', { name: '停止 Agent 并继续操作？' })
    expect(api.approve).not.toHaveBeenCalled()
    await user.click(within(stopDialog).getByRole('button', { name: '停止并继续' }))
    expect(await screen.findByText('停止失败')).toBeTruthy()
    expect(center.getEntity(row.id)?.status).toBe('pending')
    await user.click(within(stopDialog).getByRole('button', { name: '关闭停止确认' }))

    await user.click(screen.getByRole('button', { name: '更多待办操作' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete todo' })
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => { expect(api.delete).toHaveBeenCalledOnce() })
    center.dispose()
  })
})

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PersonalTodoCanvas, PersonalTodoTrigger, type PersonalTodoPanelInjected,
} from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoCanvasController } from '../src/client/canvas.ts'
import { en, zh } from '../src/client/locales.ts'
import type {
  CreateTodoInput, ListTodoInput, Todo, TodoCounts, TodoDetail, TodoListResult, TodoSession, UpdateTodoRequest,
} from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const original = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  return {
    MarkdownText: original.MarkdownText,
    Button: ({ icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => <button {...props}>{icon}{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Menu: ({ open, anchor, items, selectedId, onSelect }: {
      open: boolean
      anchor: React.ReactNode
      items: readonly { id: string; label: React.ReactNode }[]
      selectedId?: string
      onSelect: (id: string) => void
    }) => <span>
      {anchor}
      {open && createPortal(<div role="menu">{items.map(item => <button
        type="button"
        role="menuitem"
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
      status: row.status === 'in_review' ? 'submitted' : row.status === 'blocked' ? 'waiting_input' : 'running',
      rootSessionId: row.primarySessionId,
      resultSummary: row.status === 'in_review' ? row.latestSummary : null,
      verification: row.status === 'in_review' ? 'Unit tests passed.' : null,
      risk: null,
      startedAt: row.createdAt,
      finishedAt: row.status === 'in_review' ? row.updatedAt : null,
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
    closeCanvas: vi.fn(),
    rows,
    list: vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const statuses = request.statuses ?? ['pending', 'in_progress', 'blocked', 'in_review']
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
        blocked: rows.filter(row => row.archivedAt === null && row.status === 'blocked').length,
        inReview: rows.filter(row => row.archivedAt === null && row.status === 'in_review').length,
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
      return replace(id, { status: 'in_progress', primarySessionId: `session-${id}`, activeRunId: `run-${id}` })
    }),
    reply: vi.fn(async (request, signal) => {
      signal.throwIfAborted()
      return replace(request.id, { status: 'in_progress', blockedReason: null, latestSummary: request.message })
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
    requestChanges: vi.fn(async (request, signal) => {
      signal.throwIfAborted()
      return replace(request.id, { status: 'in_progress', activeRunId: 'run-2', latestSummary: request.feedback })
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
  const surfaceService: PersonalTodoPanelInjected = {
    ...service,
    openCanvas: () => {
      service.openCanvas()
      service.canvas.open()
    },
    closeCanvas: () => {
      service.closeCanvas()
      service.canvas.close()
    },
  }
  return (
    <>
      <PersonalTodoTrigger {...{ wide, t, ...surfaceService } as ComponentProps<typeof PersonalTodoTrigger>} />
      <div data-testid="frame">
        <div data-shell-overlay>
          <PersonalTodoCanvas {...{ t, ...surfaceService } as ComponentProps<typeof PersonalTodoCanvas>} />
        </div>
      </div>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('PersonalTodoCanvas', () => {
  it('将摘要、验证、风险、备注和活动渲染为安全的 Markdown', async () => {
    const user = userEvent.setup()
    const source = todo({
      status: 'in_review', primarySessionId: 'session-1', activeRunId: 'run-1',
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
    await user.click(await screen.findByRole('tab', { name: 'In review 1' }))
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
      status: state === 'archived' ? 'completed' : state,
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
    if (state === 'completed' || state === 'cancelled' || state === 'archived') {
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('menuitem', { name: state === 'archived' ? 'Archive 1' : state === 'completed' ? 'Completed 1' : 'Cancelled 1' }))
    } else if (state !== 'pending') {
      await user.click(await screen.findByRole('tab', { name: state === 'in_progress' ? 'In progress 1' : state === 'blocked' ? 'Waiting for me 1' : 'In review 1' }))
    }
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(await screen.findByRole('button', { name: 'Duplicate todo' }))
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
    expect((await screen.findAllByRole('button', { name: 'Start' })).length).toBeGreaterThan(0)
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
    await user.click(await screen.findByRole('button', { name: 'Duplicate todo' }))
    expect(await screen.findByText(/复制失败/)).toBeTruthy()
    expect(service.rows).toEqual([source])
    await user.click(screen.getByRole('button', { name: 'Duplicate todo' }))
    await waitFor(() => { expect(service.rows).toHaveLength(2) })
  })

  it('closes on outside clicks and toggles from the sidebar without retaining an open form', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)
    const trigger = screen.getByRole('button', { name: /personal todos/i })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    await user.click(trigger)
    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
    await user.click(trigger)
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Personal Todos' })).toBeTruthy()
    await user.click(screen.getByTestId('frame'))
    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
    expect(service.closeCanvas).toHaveBeenCalledTimes(2)
  })

  it('keeps English and Chinese dictionaries structurally aligned', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
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

  it('shows blocked and review work on the sidebar action while the panel is closed', async () => {
    const service = api([
      todo({ id: 'blocked', status: 'blocked', blockedReason: 'Need input' }),
      todo({ id: 'review', status: 'in_review', latestSummary: 'Ready' }),
      todo({ id: 'pending' }),
    ])
    render(<TodoSurface service={service} />)

    const trigger = await screen.findByRole('button', { name: '2 personal todos require attention' })
    expect(within(trigger).getByText('2')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Personal Todos' })).toBeNull()
  })

  it('switches active statuses with tabs and history statuses from the more menu', async () => {
    const user = userEvent.setup()
    const service = api([
      todo({ id: 'pending-1', title: 'Pending task' }),
      todo({ id: 'pending-2', title: 'Another pending task' }),
      todo({ id: 'running', title: 'Running task', status: 'in_progress' }),
      todo({ id: 'blocked', title: 'Blocked task', status: 'blocked' }),
      todo({ id: 'review', title: 'Review task', status: 'in_review' }),
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
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.queryByRole('tab', { name: /Completed/ })).toBeNull()
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
      ['In progress 1', 'Running task'],
      ['Waiting for me 1', 'Blocked task'],
      ['In review 1', 'Review task'],
    ] as const) {
      await user.click(screen.getByRole('tab', { name: tabName }))
      expect(await screen.findByRole('button', { name: new RegExp(title) })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Pending task/ })).toBeNull()
    }

    for (const [menuName, title] of [
      ['Completed 1', 'Completed task'],
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

  it('opens in the overlay without a details column, clamps card descriptions, and reveals full details', async () => {
    const user = userEvent.setup()
    const notes = 'First line\nSecond line\nThird line with the remaining task detail.'
    const service = api([todo({ notes })])
    render(<TodoSurface service={service} />)

    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /personal todos/i }))

    const canvas = await screen.findByRole('region', { name: 'Personal Todos' })
    expect(canvas.classList.contains('dsh-personal-todo-canvas')).toBe(true)
    expect(service.openCanvas).toHaveBeenCalledOnce()
    expect(canvas.closest('[data-shell-overlay]')).not.toBeNull()
    const card = within(canvas).getByRole('button', { name: /Ship plugin/ })
    expect(card.querySelector('p')?.textContent).toBe(notes)
    expect(document.querySelector('style')?.textContent).toContain('-webkit-line-clamp:2')

    await user.click(card)
    expect([...canvas.querySelectorAll('p')].filter(node => node.textContent === notes)).toHaveLength(2)
    expect(within(canvas).getByRole('button', { name: 'Back to list' })).toBeTruthy()
    await user.click(within(canvas).getByRole('button', { name: 'Back to list' }))
    expect([...canvas.querySelectorAll('p')].filter(node => node.textContent === notes)).toHaveLength(1)

    await user.click(within(canvas).getByRole('button', { name: 'Close todo panel' }))
    expect(service.closeCanvas).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
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
    await user.click(screen.getByRole('tab', { name: 'In review 0' }))
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
    expect(screen.getByText('Add something to do and let an Agent help you move it forward.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Create a todo' }))
    expect(screen.queryByRole('dialog', { name: 'New todo' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New todo' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'New todo' })).toBeTruthy()
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Write tests')
    await user.type(screen.getByPlaceholderText('Optional details'), 'Client behavior')
    await user.type(screen.getByPlaceholderText('Enter an assignee'), 'Alice')
    await user.type(screen.getByPlaceholderText('work, this-week'), 'Work, UI')
    await user.click(screen.getByRole('button', { name: 'Create and start' }))
    expect(await screen.findByText('Write tests')).toBeTruthy()
    await waitFor(() => expect(service.start).toHaveBeenCalledWith('todo-1', expect.any(AbortSignal)))

    await user.click(screen.getByRole('button', { name: /Write tests/ }))
    expect(await screen.findByText('Assignee: Alice')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
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
    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
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
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.type(screen.getByPlaceholderText('Enter an assignee'), 'Alice')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The assignee was not saved. Restart the DSH Web service and try again.',
    )
    expect(screen.getByDisplayValue('Alice')).toBeTruthy()
  })

  it('lists and opens Agent-created related conversations', async () => {
    const user = userEvent.setup()
    const row = todo({ status: 'in_review', primarySessionId: 'session-1', activeRunId: 'run-1', reviewRound: 1 })
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
    await user.click(screen.getByRole('tab', { name: /In review/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText('Primary execution conversation')).toBeTruthy()
    expect(await screen.findByText('Related work conversation 1')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Open conversation' })[2] as HTMLElement)
    expect(service.openSession).toHaveBeenCalledWith('child-1', 'session-1')
  })

  it('surfaces blocked questions and resumes from an inline reply', async () => {
    const user = userEvent.setup()
    const service = api([todo({
      status: 'blocked', primarySessionId: 'session-1', activeRunId: 'run-1',
      blockedReason: 'Which option?', latestSummary: 'Which option?',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /Waiting for me/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect((await screen.findAllByText('Which option?')).length).toBeGreaterThan(0)
    const replyBox = screen.getByRole('textbox', { name: 'Reply to Agent' })
    expect(replyBox.closest('.dsh-personal-todo-commandbar')).toBeTruthy()
    await user.type(replyBox, 'Use option A')
    await user.click(screen.getByRole('button', { name: 'Reply and continue' }))
    await waitFor(() => expect(service.reply).toHaveBeenCalledWith({ id: 'todo-1', message: 'Use option A' }, expect.any(AbortSignal)))
    expect(service.rows[0]).toMatchObject({ status: 'in_progress', blockedReason: null })
  })

  it('approves a review or returns feedback to in-progress', async () => {
    const user = userEvent.setup()
    const review = todo({
      status: 'in_review', primarySessionId: 'session-1', activeRunId: 'run-1',
      latestSummary: 'Implemented the change.', reviewRound: 1,
    })
    const service = api([review])
    const view = render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In review/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText('Unit tests passed.')).toBeTruthy()
    const changeRequest = screen.getByRole('textbox', { name: 'Change request' })
    expect(changeRequest.closest('.dsh-personal-todo-commandbar')).toBeTruthy()
    await user.type(changeRequest, 'Add one edge case.')
    await user.click(screen.getByRole('button', { name: 'Request changes' }))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'in_progress', latestSummary: 'Add one edge case.' }))

    service.rows[0] = { ...review }
    view.rerender(<TodoSurface service={service} />)
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(screen.getByRole('tab', { name: /In review/ }))
    await user.click(screen.getByRole('button', { name: /Ship plugin/ }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'completed' }))
  })

  it('moves a refreshed task out of its previous status tab after the Agent submits review', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const service = api([todo({
      status: 'in_progress', primarySessionId: 'session-1', activeRunId: 'run-1',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))

    service.rows[0] = todo({
      status: 'in_review', primarySessionId: 'session-1', activeRunId: 'run-1',
      latestSummary: 'Ready for review.', reviewRound: 1,
    })
    await vi.advanceTimersByTimeAsync(2_000)

    expect(await screen.findByText('No In progress todos.')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'In review 1' })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'In review 1' }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect((await screen.findAllByText('Ready for review.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Unit tests passed.')).toBeTruthy()
  })

  it('loads completed history without search or tag filters and deletes from task details', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect(screen.queryByRole('textbox', { name: 'Search todos' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Filter by tags' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Completed/ }))
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ statuses: ['completed'], archived: false, offset: 0 }, expect.any(AbortSignal)))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
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
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Completed/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(screen.getByRole('button', { name: 'Archive' }))
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
      status: 'in_progress', primarySessionId: 'session-1', activeRunId: 'run-1',
    })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    await user.click(screen.getByRole('tab', { name: /In progress/ }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(screen.getByRole('button', { name: 'Archive' }))
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
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete todo' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(service.rows).toHaveLength(0))
    expect(await screen.findByText('No archived history yet.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows load failures and aborts an in-flight read when the panel closes', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Close todo panel' }))
    expect(aborted).toBe(true)
    fail = true
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect((await screen.findByRole('alert')).textContent).toContain('database unavailable')
  })
})

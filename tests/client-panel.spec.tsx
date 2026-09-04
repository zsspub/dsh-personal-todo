import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PersonalTodoCanvas, PersonalTodoTrigger, type PersonalTodoPanelInjected,
} from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoCanvasController } from '../src/client/canvas.ts'
import { en, zh } from '../src/client/locales.ts'
import type {
  CreateTodoInput, ListTodoInput, Todo, TodoCounts, TodoDetail, TodoListResult, TodoSession, UpdateTodoRequest,
} from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = () => <span aria-hidden="true" />
  return {
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
      {open && <div role="menu">{items.map(item => <button
        type="button"
        role="menuitem"
        aria-current={item.id === selectedId ? 'true' : undefined}
        key={item.id}
        onClick={() => { onSelect(item.id) }}
      >{item.label}</button>)}</div>}
    </span>,
    Modal: ({ open, onClose, title, closeLabel, description, children, footer }: {
      open: boolean
      onClose: () => void
      title: string
      closeLabel?: string
      description?: string
      children?: React.ReactNode
      footer?: React.ReactNode
    }) => open ? <div role="dialog" aria-label={title}>
      <button type="button" aria-label={closeLabel ?? title} onClick={onClose}>×</button>
      {description === undefined ? null : <p>{description}</p>}
      {children}
      {footer}
    </div> : null,
    IconEditOutline16: Icon,
    IconEllipsisOutline16: Icon,
    IconListPenOutline16: Icon,
    IconPlusOutline16: Icon,
    IconRefreshOutline16: Icon,
    IconTrashOutline16: Icon,
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
  const [open, setOpen] = useState(false)
  const surfaceService: PersonalTodoPanelInjected = {
    ...service,
    openCanvas: () => {
      service.openCanvas()
      service.canvas.open()
      setOpen(true)
    },
    closeCanvas: () => {
      service.closeCanvas()
      service.canvas.close()
      setOpen(false)
    },
  }
  return (
    <>
      <PersonalTodoTrigger {...{ wide, t, ...surfaceService } as ComponentProps<typeof PersonalTodoTrigger>} />
      <div data-testid="frame">
        <div data-testid="details-column" />
        <div data-shell-overlay>
          {open && <PersonalTodoCanvas {...{ t, ...surfaceService } as ComponentProps<typeof PersonalTodoCanvas>} />}
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
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

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
    expect(statusRow?.querySelector('.dsh-personal-todo-more-trigger')).toBeNull()
    expect(within(toolbar as HTMLElement).getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(within(toolbar as HTMLElement).getByRole('button', { name: 'More' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search todos' }).closest('form')).not.toBe(toolbar)

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

  it('opens over the details column, clamps card descriptions to two lines, and reveals full details', async () => {
    const user = userEvent.setup()
    const notes = 'First line\nSecond line\nThird line with the remaining task detail.'
    const service = api([todo({ notes })])
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-shell-overlay')) {
        return { x: 0, y: 0, left: 0, right: 1_440, top: 0, bottom: 900, width: 1_440, height: 900, toJSON: () => ({}) }
      }
      if (this.getAttribute('data-testid') === 'details-column') {
        return { x: 1_080, y: 0, left: 1_080, right: 1_440, top: 0, bottom: 900, width: 360, height: 900, toJSON: () => ({}) }
      }
      return { x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
    })
    render(<TodoSurface service={service} />)

    expect(screen.queryByRole('region', { name: 'Personal Todos' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /personal todos/i }))

    const canvas = await screen.findByRole('region', { name: 'Personal Todos' })
    expect(canvas.classList.contains('dsh-personal-todo-canvas')).toBe(true)
    expect(service.openCanvas).toHaveBeenCalledOnce()
    expect(canvas.closest('[data-shell-overlay]')?.previousElementSibling).toBe(
      screen.getByTestId('details-column'),
    )
    expect(canvas.style.left).toBe('1080px')
    expect(canvas.style.width).toBe('360px')
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

  it('creates, edits, starts, inspects, and opens the root execution conversation', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<TodoSurface service={service} />)

    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect(await screen.findByText('No Pending todos.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    expect(screen.queryByRole('dialog', { name: 'New todo' })).toBeNull()
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

  it('filters, loads completed history, and deletes from task details', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' })])
    render(<TodoSurface service={service} />)
    await user.click(screen.getByRole('button', { name: /personal todos/i }))
    expect(screen.getByRole('textbox', { name: 'Filter by tags' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitem', { name: /Completed/ }))
    await user.type(screen.getByRole('textbox', { name: 'Filter by tags' }), 'work')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(screen.getByRole('textbox', { name: 'Filter by tags' })).toBeTruthy()
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['work'] }), expect.any(AbortSignal)))
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

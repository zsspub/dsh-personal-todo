import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalTodoPanel, type PersonalTodoPanelInjected } from '../src/client/PersonalTodoPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import type {
  CreateTodoInput, ListTodoInput, Todo, TodoCounts, TodoDetail, TodoListResult, TodoSession, UpdateTodoRequest,
} from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = () => <span aria-hidden="true" />
  return {
    Button: ({ icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => <button {...props}>{icon}{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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
    IconListPenOutline16: Icon,
    IconPlusOutline16: Icon,
    IconRefreshOutline16: Icon,
    IconTrashOutline16: Icon,
  }
})

type Translate = ComponentProps<typeof PersonalTodoPanel>['t']

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
    rows,
    list: vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const statuses = request.statuses ?? ['pending', 'in_progress', 'blocked', 'in_review']
      const tags = request.tags ?? []
      const search = request.search?.toLowerCase()
      const matching = rows.filter(row => statuses.includes(row.status)
        && tags.every(tag => row.tags.includes(tag.toLowerCase()))
        && (search === undefined || `${row.title} ${row.notes ?? ''}`.toLowerCase().includes(search)))
      const counts: TodoCounts = {
        pending: rows.filter(row => row.status === 'pending').length,
        inProgress: rows.filter(row => row.status === 'in_progress').length,
        blocked: rows.filter(row => row.status === 'blocked').length,
        inReview: rows.filter(row => row.status === 'in_review').length,
        completed: rows.filter(row => row.status === 'completed').length,
        cancelled: rows.filter(row => row.status === 'cancelled').length,
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

function panelProps(service: PersonalTodoPanelInjected, wide = true): ComponentProps<typeof PersonalTodoPanel> {
  return { wide, t, ...service } as ComponentProps<typeof PersonalTodoPanel>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PersonalTodoPanel', () => {
  it('keeps English and Chinese dictionaries structurally aligned', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('renders a full-width text action in a wide sidebar and an icon in a narrow sidebar', () => {
    const service = api()
    const view = render(<PersonalTodoPanel {...panelProps(service)} />)
    const wideAction = screen.getByRole('button', { name: 'Open personal todos' })
    expect(wideAction.textContent).toContain('Todos')
    expect(wideAction.getAttribute('data-wide')).toBe('true')
    expect(document.querySelector('style')?.textContent).toContain(
      "[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true])",
    )
    view.rerender(<PersonalTodoPanel {...panelProps(service, false)} />)
    expect(screen.getByRole('button', { name: 'Open personal todos' }).textContent).toBe('')
  })

  it('creates, edits, starts, inspects, and opens the root execution conversation', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<PersonalTodoPanel {...panelProps(service)} />)

    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    expect(await screen.findByText('No active todos.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Write tests')
    await user.type(screen.getByPlaceholderText('Optional details'), 'Client behavior')
    await user.type(screen.getByPlaceholderText('work, this-week'), 'Work, UI')
    await user.click(screen.getByRole('button', { name: 'Create and start' }))
    expect(await screen.findByText('Write tests')).toBeTruthy()
    await waitFor(() => expect(service.start).toHaveBeenCalledWith('todo-1', expect.any(AbortSignal)))

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByDisplayValue('Write tests')
    await user.clear(title)
    await user.type(title, 'Write browser tests')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Write browser tests')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Write browser tests/ }))
    expect(await screen.findByText('Primary execution conversation')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Open conversation' })[0] as HTMLElement)
    expect(service.openSession).toHaveBeenCalledWith('session-todo-1', null)
    expect(screen.queryByRole('dialog', { name: 'Personal Todos' })).toBeNull()
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
    render(<PersonalTodoPanel {...panelProps(service)} />)

    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
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
    render(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect((await screen.findAllByText('Which option?')).length).toBeGreaterThan(0)
    await user.type(screen.getByRole('textbox', { name: 'Reply to Agent' }), 'Use option A')
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
    const view = render(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    expect(await screen.findByText('Unit tests passed.')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Add one edge case.')
    await user.click(screen.getByRole('button', { name: 'Request changes' }))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'in_progress', latestSummary: 'Add one edge case.' }))

    service.rows[0] = { ...review }
    view.rerender(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: /Ship plugin/ }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(service.rows[0]).toMatchObject({ status: 'completed' }))
  })

  it('refreshes an active task and its open detail after the Agent submits review', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const service = api([todo({
      status: 'in_progress', primarySessionId: 'session-1', activeRunId: 'run-1',
    })])
    render(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))

    service.rows[0] = todo({
      status: 'in_review', primarySessionId: 'session-1', activeRunId: 'run-1',
      latestSummary: 'Ready for review.', reviewRound: 1,
    })
    await vi.advanceTimersByTimeAsync(2_000)

    expect((await screen.findAllByText('Ready for review.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Unit tests passed.')).toBeTruthy()
  })

  it('filters, loads completed history, and deletes from task details', async () => {
    const user = userEvent.setup()
    const service = api([todo({ status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' })])
    render(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    await user.click(screen.getByRole('button', { name: 'Completed' }))
    await user.type(screen.getByRole('textbox', { name: 'Filter by tags' }), 'work')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['work'] }), expect.any(AbortSignal)))
    await user.click(await screen.findByRole('button', { name: /Ship plugin/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete todo' })
    expect(within(dialog).getByText(/permanently deleted/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(service.rows).toHaveLength(0))
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
    render(<PersonalTodoPanel {...panelProps(service)} />)
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    await user.click(screen.getByRole('button', { name: 'Close todo panel' }))
    expect(aborted).toBe(true)
    fail = true
    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    expect((await screen.findByRole('alert')).textContent).toContain('database unavailable')
  })
})

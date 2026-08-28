import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalTodoPanel, type PersonalTodoPanelInjected } from '../src/client/PersonalTodoPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { CreateTodoInput, ListTodoInput, Todo, TodoCounts, TodoListResult, UpdateTodoRequest } from '../src/types.ts'

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
    IconCheckOutline16: Icon,
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
  for (const [name, value] of Object.entries(parameters ?? {})) {
    message = message.replace(`{${name}}`, String(value))
  }
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function api(initial: Todo[] = []): PersonalTodoPanelInjected & { readonly rows: Todo[] } {
  const rows = initial
  return {
    rows,
    list: vi.fn(async (request: ListTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const statuses = request.statuses ?? ['pending', 'in_progress']
      const tags = request.tags ?? []
      const search = request.search?.toLowerCase()
      const matching = rows.filter(row => statuses.includes(row.status)
        && tags.every(tag => row.tags.includes(tag.toLowerCase()))
        && (search === undefined || `${row.title} ${row.notes ?? ''}`.toLowerCase().includes(search)))
      const counts: TodoCounts = {
        pending: rows.filter(row => row.status === 'pending').length,
        inProgress: rows.filter(row => row.status === 'in_progress').length,
        completed: rows.filter(row => row.status === 'completed').length,
      }
      return { todos: matching.slice(request.offset ?? 0), total: matching.length, counts, hasMore: false }
    }),
    create: vi.fn(async (request: CreateTodoInput, signal: AbortSignal) => {
      signal.throwIfAborted()
      const created = todo({
        id: `todo-${String(rows.length + 1)}`,
        title: request.title.trim(),
        notes: request.notes ?? null,
        status: request.status ?? 'pending',
        priority: request.priority ?? 'none',
        dueAt: request.dueAt ?? null,
        tags: [...(request.tags ?? [])].map(tag => tag.trim().toLowerCase()),
      })
      rows.push(created)
      return created
    }),
    update: vi.fn(async (request: UpdateTodoRequest, signal: AbortSignal) => {
      signal.throwIfAborted()
      const index = rows.findIndex(row => row.id === request.id)
      if (index < 0) throw new Error('not found')
      const current = rows[index] as Todo
      const nextStatus = request.patch.status ?? current.status
      const updated = {
        ...current,
        ...request.patch,
        tags: request.patch.tags === undefined ? current.tags : [...request.patch.tags],
        completedAt: nextStatus === 'completed' ? current.completedAt ?? '2026-01-02T00:00:00.000Z' : null,
      } as Todo
      rows[index] = updated
      return updated
    }),
    delete: vi.fn(async (id: string, signal: AbortSignal) => {
      signal.throwIfAborted()
      const index = rows.findIndex(row => row.id === id)
      if (index < 0) throw new Error('not found')
      rows.splice(index, 1)
      return { id, deleted: true as const }
    }),
  }
}

function panelProps(service: PersonalTodoPanelInjected, wide = true): ComponentProps<typeof PersonalTodoPanel> {
  return { wide, t, ...service } as ComponentProps<typeof PersonalTodoPanel>
}

afterEach(cleanup)

describe('PersonalTodoPanel', () => {
  it('keeps English and Chinese dictionaries structurally aligned', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('renders a text action in a wide sidebar and an icon-only action in a narrow sidebar', () => {
    const service = api()
    const view = render(<PersonalTodoPanel {...panelProps(service)} />)
    expect(screen.getByRole('button', { name: 'Open personal todos' }).textContent).toContain('Todos')

    view.rerender(<PersonalTodoPanel {...panelProps(service, false)} />)
    expect(screen.getByRole('button', { name: 'Open personal todos' }).textContent).toBe('')
  })

  it('loads on open and supports create, edit, complete, reopen, filter, and hard delete', async () => {
    const user = userEvent.setup()
    const service = api()
    render(<PersonalTodoPanel {...panelProps(service)} />)

    await user.click(screen.getByRole('button', { name: 'Open personal todos' }))
    expect(await screen.findByText('No active todos.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'New todo' }))
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Write tests')
    await user.type(screen.getByPlaceholderText('Optional details'), 'Client behavior')
    await user.type(screen.getByPlaceholderText('work, this-week'), 'Work, UI')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Write tests')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByDisplayValue('Write tests')
    await user.clear(title)
    await user.type(title, 'Write browser tests')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Write browser tests')).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'Filter by tags' }), 'ui')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['ui'] }), expect.any(AbortSignal)))

    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(await screen.findByText('No active todos.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Completed' }))
    expect(await screen.findByText('Write browser tests')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(await screen.findByText('No completed history yet.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Active' }))
    expect(await screen.findByText('Write browser tests')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete todo' })
    expect(within(dialog).getByText(/permanently deleted/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No active todos.')).toBeTruthy()
    expect(service.rows).toHaveLength(0)
  })

  it('shows load failures and aborts an in-flight read when the panel closes', async () => {
    const user = userEvent.setup()
    let aborted = false
    let fail = false
    const base = api()
    const service: PersonalTodoPanelInjected = { ...base, list: vi.fn((_request: ListTodoInput, signal: AbortSignal) => fail
      ? Promise.reject(new Error('database unavailable'))
      : new Promise<TodoListResult>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(signal.reason)
      }, { once: true })
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

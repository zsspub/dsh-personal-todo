import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from '../src/host/store.ts'

const openStores: TodoStore[] = []
const CONFIG = {
  databasePath: ':memory:',
  journalMode: 'wal',
  busyTimeoutMs: 1_000,
  defaultListLimit: 2,
  maxListLimit: 5,
} as const

function store(options: {
  readonly databasePath?: string
  readonly times?: number[]
  readonly ids?: string[]
} = {}): TodoStore {
  const times = options.times ?? [Date.parse('2026-01-01T00:00:00Z')]
  const ids = options.ids ?? ['00000000-0000-4000-8000-000000000001']
  let timeIndex = 0
  let idIndex = 0
  const instance = new TodoStore(
    { ...CONFIG, databasePath: options.databasePath ?? CONFIG.databasePath },
    {
      now: () => times[Math.min(timeIndex++, times.length - 1)] as number,
      createId: () => ids[Math.min(idIndex++, ids.length - 1)] as string,
    },
  )
  openStores.push(instance)
  return instance
}

afterEach(() => {
  for (const instance of openStores.splice(0)) instance.close()
})

describe('TodoStore', () => {
  it('creates normalized todos and applies lifecycle defaults', () => {
    const todos = store()
    const todo = todos.create({
      title: '  Ship plugin  ',
      notes: '  finish the README  ',
      dueAt: '2026-03-04T05:06:07+08:00',
      priority: 'high',
      tags: [' Work ', 'work', 'THIS-WEEK'],
    })

    expect(todo).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Ship plugin',
      notes: 'finish the README',
      status: 'pending',
      priority: 'high',
      dueAt: '2026-03-03T21:06:07.000Z',
      tags: ['this-week', 'work'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    })
    expect(todos.list()).toMatchObject({ total: 1, counts: { pending: 1, inProgress: 0, completed: 0 } })
  })

  it('sets completion time, preserves it while completed, and clears it when reopened', () => {
    const todos = store({
      times: [
        Date.parse('2026-01-01T00:00:00Z'),
        Date.parse('2026-01-02T00:00:00Z'),
        Date.parse('2026-01-03T00:00:00Z'),
        Date.parse('2026-01-04T00:00:00Z'),
      ],
    })
    const created = todos.create({ title: 'Lifecycle', notes: 'note', dueAt: '2026-02-01T00:00:00Z', tags: ['one'] })

    const completed = todos.update(created.id, { status: 'completed' })
    expect(completed.completedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(todos.update(created.id, { priority: 'medium' }).completedAt).toBe(completed.completedAt)
    const reopened = todos.update(created.id, { status: 'in_progress', notes: null, dueAt: null, tags: [] })
    expect(reopened).toMatchObject({ status: 'in_progress', completedAt: null, notes: null, dueAt: null, tags: [] })
  })

  it('filters by every tag, search text, priority, status, and due date', () => {
    const todos = store({
      ids: ['a', 'b', 'c', 'd'],
      times: [1000, 2000, 3000, 4000, 5000],
    })
    todos.create({ title: 'Write launch notes', notes: 'SQLite details', priority: 'high', dueAt: '2026-02-01T00:00:00Z', tags: ['work', 'release'] })
    todos.create({ title: 'Buy tea', priority: 'low', dueAt: '2026-03-01T00:00:00Z', tags: ['home'] })
    const progress = todos.create({ title: 'Release package', priority: 'medium', dueAt: '2026-01-15T00:00:00Z', tags: ['work', 'release'] })
    const done = todos.create({ title: 'Old release', notes: 'archived SQLite item', tags: ['work', 'release'] })
    todos.update(progress.id, { status: 'in_progress' })
    todos.update(done.id, { status: 'completed' })

    expect(todos.list({ tags: ['release', 'WORK'], search: 'sqlite', priorities: ['high'], dueBefore: '2026-02-02T00:00:00Z' }).todos.map(todo => todo.id)).toEqual(['a'])
    expect(todos.list({ statuses: ['completed'], search: 'sqlite' }).todos.map(todo => todo.id)).toEqual(['d'])
    expect(todos.list().todos.map(todo => todo.id)).toEqual(['c', 'a'])
  })

  it('orders active and completed records deterministically and paginates', () => {
    const todos = store({
      ids: ['a', 'b', 'c', 'd'],
      times: [1000, 2000, 3000, 4000, 5000, 6000],
    })
    todos.create({ title: 'No due', priority: 'high' })
    todos.create({ title: 'Later', priority: 'low', dueAt: '2026-02-01T00:00:00Z' })
    const sooner = todos.create({ title: 'Sooner', priority: 'none', dueAt: '2026-01-01T00:00:00Z' })
    const olderDone = todos.create({ title: 'Older done' })
    todos.update(sooner.id, { status: 'completed' })
    todos.update(olderDone.id, { status: 'completed' })

    const first = todos.list({ limit: 1 })
    expect(first.todos.map(todo => todo.id)).toEqual(['b'])
    expect(first).toMatchObject({ total: 2, hasMore: true, counts: { pending: 2, inProgress: 0, completed: 2 } })
    expect(todos.list({ limit: 1, offset: 1 }).todos.map(todo => todo.id)).toEqual(['a'])
    expect(todos.list({ statuses: ['completed'] }).todos.map(todo => todo.id)).toEqual(['d', 'c'])
  })

  it('rolls back a failed multi-table create', () => {
    const todos = store({ ids: ['same-id', 'same-id'], times: [1000, 2000] })
    todos.create({ title: 'First', tags: ['kept'] })

    expect(() => todos.create({ title: 'Duplicate', tags: ['must-rollback'] })).toThrow()
    expect(todos.list()).toMatchObject({ total: 1, todos: [{ title: 'First', tags: ['kept'] }] })
    expect(todos.list({ tags: ['must-rollback'] }).total).toBe(0)
  })

  it('persists through reopen with an owner-only database and schema version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-'))
    const databasePath = join(directory, 'nested', 'todos.sqlite3')
    const first = store({ databasePath })
    first.create({ title: 'Persistent', tags: ['disk'] })
    first.close()

    expect(statSync(join(directory, 'nested')).mode & 0o777).toBe(0o700)
    expect(statSync(databasePath).mode & 0o777).toBe(0o600)
    const database = new DatabaseSync(databasePath)
    expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(PERSONAL_TODO_SCHEMA_VERSION)
    database.close()

    const reopened = store({ databasePath })
    expect(reopened.list().todos).toMatchObject([{ title: 'Persistent', tags: ['disk'] }])
  })

  it('rejects invalid inputs, unknown records, empty updates, and newer schemas', () => {
    const todos = store()
    const created = todos.create({ title: 'Valid' })
    const invalidCreates = [
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { title: 'x', notes: 'n'.repeat(10_001) },
      { title: 'x', dueAt: 'tomorrow' },
      { title: 'x', tags: Array.from({ length: 21 }, (_, index) => String(index)) },
      { title: 'x', tags: ['x'.repeat(33)] },
    ]
    for (const input of invalidCreates) expect(() => todos.create(input)).toThrow(PersonalTodoError)
    expect(() => todos.update(created.id, {})).toThrow('at least one mutable field')
    expect(() => todos.update('missing', { title: 'x' })).toThrow('was not found')
    expect(() => todos.delete('missing')).toThrow('was not found')
    expect(() => todos.list({ statuses: [] })).toThrow('must not be empty')
    expect(() => todos.list({ limit: 6 })).toThrow('cannot exceed 5')
    expect(() => todos.list({ offset: -1 })).toThrow('non-negative')

    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-newer-'))
    const databasePath = join(directory, 'todos.sqlite3')
    const database = new DatabaseSync(databasePath)
    database.exec(`PRAGMA user_version = ${String(PERSONAL_TODO_SCHEMA_VERSION + 1)}`)
    database.close()
    expect(() => store({ databasePath })).toThrow('newer than supported')
  })

  it('rejects unsafe configuration and use after close', () => {
    expect(() => new TodoStore({ ...CONFIG, databasePath: 'relative.sqlite3' })).toThrow('absolute')
    expect(() => new TodoStore({ ...CONFIG, defaultListLimit: 6, maxListLimit: 5 })).toThrow('cannot exceed')
    const todos = store()
    todos.close()
    expect(() => todos.list()).toThrow('closed')
  })
})

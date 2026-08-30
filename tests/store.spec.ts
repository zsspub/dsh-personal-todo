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
  defaultListLimit: 10,
  maxListLimit: 20,
} as const

function store(options: {
  readonly databasePath?: string
  readonly times?: number[]
  readonly ids?: string[]
} = {}): TodoStore {
  const times = options.times ?? [Date.parse('2026-01-01T00:00:00Z')]
  const ids = options.ids ?? ['todo-1']
  let timeIndex = 0
  let idIndex = 0
  let eventIndex = 0
  const instance = new TodoStore(
    { ...CONFIG, databasePath: options.databasePath ?? CONFIG.databasePath },
    {
      now: () => times[Math.min(timeIndex++, times.length - 1)] as number,
      createId: () => ids[Math.min(idIndex++, ids.length - 1)] as string,
      createEventId: () => `event-${String(++eventIndex)}`,
    },
  )
  openStores.push(instance)
  return instance
}

afterEach(() => {
  for (const instance of openStores.splice(0)) instance.close()
})

describe('TodoStore', () => {
  it('creates normalized pending todos with an initial activity record', () => {
    const todos = store()
    const todo = todos.create({
      title: '  Ship plugin  ',
      notes: '  finish the README  ',
      dueAt: '2026-03-04T05:06:07+08:00',
      priority: 'high',
      tags: [' Work ', 'work', 'THIS-WEEK'],
    })

    expect(todo).toEqual({
      id: 'todo-1',
      title: 'Ship plugin',
      notes: 'finish the README',
      status: 'pending',
      priority: 'high',
      dueAt: '2026-03-03T21:06:07.000Z',
      tags: ['this-week', 'work'],
      primarySessionId: null,
      activeRunId: null,
      latestSummary: null,
      blockedReason: null,
      reviewRound: 0,
      revision: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    })
    expect(todos.detail(todo.id).events).toMatchObject([{ type: 'created', message: null }])
    expect(todos.list()).toMatchObject({
      total: 1,
      counts: { pending: 1, inProgress: 0, blocked: 0, inReview: 0, completed: 0, cancelled: 0 },
    })
  })

  it('runs the task-driven lifecycle through blocking, review, and user approval', () => {
    const todos = store({ times: Array.from({ length: 10 }, (_, index) => Date.UTC(2026, 0, index + 1)) })
    const created = todos.create({ title: 'Lifecycle' })

    expect(todos.beginRun(created.id, 'run-1', 'session-1')).toMatchObject({
      status: 'in_progress', primarySessionId: 'session-1', activeRunId: 'run-1',
    })
    expect(todos.progress(created.id, 'session-1', 'Implemented storage')).toMatchObject({ latestSummary: 'Implemented storage' })
    expect(todos.block({ id: created.id, question: 'Which behavior should win?' }, 'session-1')).toMatchObject({
      status: 'blocked', blockedReason: 'Which behavior should win?',
    })
    expect(todos.reply({ id: created.id, message: 'Use the task behavior.' })).toMatchObject({
      status: 'in_progress', blockedReason: null,
    })
    expect(todos.submitReview({
      id: created.id,
      summary: 'Implemented the requested behavior.',
      verification: 'Unit tests passed.',
      risk: null,
    }, 'session-1')).toMatchObject({ status: 'in_review', reviewRound: 1 })
    expect(todos.approve(created.id)).toMatchObject({ status: 'completed', completedAt: expect.any(String), activeRunId: null })

    const detail = todos.detail(created.id)
    expect(detail.runs).toMatchObject([{
      id: 'run-1', sequence: 1, status: 'submitted', rootSessionId: 'session-1',
      resultSummary: 'Implemented the requested behavior.', verification: 'Unit tests passed.', risk: null,
    }])
    expect(detail.sessions).toMatchObject([{ sessionId: 'session-1', role: 'primary' }])
    expect(detail.events.map(event => event.type)).toEqual([
      'review_approved', 'review_submitted', 'user_replied', 'blocked', 'progress', 'run_started', 'created',
    ])
  })

  it('returns review feedback to the same Session in a new run', () => {
    const todos = store()
    const created = todos.create({ title: 'Review cycle' })
    todos.beginRun(created.id, 'run-1', 'session-1')
    todos.submitReview({ id: created.id, summary: 'First result' }, 'session-1')

    expect(todos.requestChanges({ id: created.id, feedback: 'Add the missing test.' }, 'run-2')).toMatchObject({
      status: 'in_progress', primarySessionId: 'session-1', activeRunId: 'run-2', reviewRound: 1,
    })
    todos.submitReview({ id: created.id, summary: 'Added the test.' }, 'session-1')
    const detail = todos.detail(created.id)
    expect(detail.runs.map(run => ({ id: run.id, sequence: run.sequence, status: run.status }))).toEqual([
      { id: 'run-2', sequence: 2, status: 'submitted' },
      { id: 'run-1', sequence: 1, status: 'submitted' },
    ])
    expect(detail.todo.reviewRound).toBe(2)
  })

  it('rejects invalid lifecycle transitions and Agent Sessions that do not own the todo', () => {
    const todos = store()
    const created = todos.create({ title: 'Owned task' })
    expect(() => todos.approve(created.id)).toThrow('must be in_review')
    todos.beginRun(created.id, 'run-1', 'session-1')
    expect(() => todos.delete(created.id)).toThrow('cannot be deleted while in_progress')
    expect(() => todos.progress(created.id, 'other-session', 'spoofed')).toThrow('does not own')
    expect(() => todos.submitReview({ id: created.id, summary: 'spoofed' }, 'other-session')).toThrow('does not own')
    expect(() => todos.beginRun(created.id, 'run-2', 'session-1')).toThrow('must be pending')
  })

  it('retains a failed run and allows a pending retry in the same primary Session', () => {
    const todos = store()
    const created = todos.create({ title: 'Retry' })
    todos.beginRun(created.id, 'run-1', 'session-1')
    expect(todos.failRun(created.id, 'run-1', 'provider unavailable')).toMatchObject({
      status: 'pending', activeRunId: null, primarySessionId: 'session-1', latestSummary: 'provider unavailable',
    })
    todos.beginRun(created.id, 'run-2', 'session-1')
    expect(todos.detail(created.id).runs.map(run => [run.sequence, run.status])).toEqual([[2, 'running'], [1, 'failed']])
  })

  it('filters, orders workflow states, paginates, and preserves editable metadata', () => {
    const todos = store({ ids: ['pending', 'working', 'blocked', 'reviewed'], times: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000] })
    todos.create({ title: 'Pending', priority: 'high', tags: ['work'] })
    const working = todos.create({ title: 'Working', tags: ['work'] })
    const blocked = todos.create({ title: 'Blocked', tags: ['work', 'input'] })
    const reviewed = todos.create({ title: 'Reviewed', tags: ['work'] })
    todos.beginRun(working.id, 'run-working', 'session-working')
    todos.beginRun(blocked.id, 'run-blocked', 'session-blocked')
    todos.block({ id: blocked.id, question: 'Need input' }, 'session-blocked')
    todos.beginRun(reviewed.id, 'run-reviewed', 'session-reviewed')
    todos.submitReview({ id: reviewed.id, summary: 'Ready' }, 'session-reviewed')

    expect(todos.list({ tags: ['work'] }).todos.map(todo => todo.id)).toEqual(['reviewed', 'blocked', 'working', 'pending'])
    expect(todos.list({ statuses: ['blocked'], tags: ['INPUT'] }).todos.map(todo => todo.id)).toEqual(['blocked'])
    expect(todos.update(working.id, { notes: '  updated  ', priority: 'medium', tags: [] })).toMatchObject({
      status: 'in_progress', notes: 'updated', priority: 'medium', tags: [], revision: 2,
    })
    expect(todos.list({ limit: 2 })).toMatchObject({ total: 4, hasMore: true })
  })

  it('rolls back a failed multi-table create', () => {
    const todos = store({ ids: ['same-id', 'same-id'], times: [1000, 2000] })
    todos.create({ title: 'First', tags: ['kept'] })
    expect(() => todos.create({ title: 'Duplicate', tags: ['must-rollback'] })).toThrow()
    expect(todos.list()).toMatchObject({ total: 1, todos: [{ title: 'First', tags: ['kept'] }] })
  })

  it('migrates the version-one schema without losing todos or tags', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-v1-'))
    const databasePath = join(directory, 'todos.sqlite3')
    const database = new DatabaseSync(databasePath)
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE todos (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
        priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
        due_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      ) STRICT;
      CREATE TABLE todo_tags (
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        tag TEXT NOT NULL, PRIMARY KEY (todo_id, tag)
      ) STRICT;
      CREATE INDEX todos_status_due_idx ON todos(status, due_at);
      CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
      CREATE INDEX todo_tags_tag_idx ON todo_tags(tag, todo_id);
      INSERT INTO todos VALUES ('old', 'Existing todo', NULL, 'pending', 'high', NULL, 1000, 1000, NULL);
      INSERT INTO todo_tags VALUES ('old', 'legacy');
      PRAGMA user_version = 1;
    `)
    database.close()

    const migrated = store({ databasePath })
    expect(migrated.get('old')).toMatchObject({ title: 'Existing todo', tags: ['legacy'], status: 'pending', revision: 0 })
    expect(migrated.detail('old').events).toMatchObject([{ type: 'created' }])
  })

  it('persists through reopen with an owner-only database and current schema version', () => {
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
    expect(store({ databasePath }).list().todos).toMatchObject([{ title: 'Persistent', tags: ['disk'] }])
  })

  it('rejects invalid inputs, unknown records, empty updates, and newer schemas', () => {
    const todos = store()
    const created = todos.create({ title: 'Valid' })
    for (const input of [
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { title: 'x', notes: 'n'.repeat(10_001) },
      { title: 'x', dueAt: 'tomorrow' },
      { title: 'x', tags: Array.from({ length: 21 }, (_, index) => String(index)) },
      { title: 'x', tags: ['x'.repeat(33)] },
    ]) expect(() => todos.create(input)).toThrow(PersonalTodoError)
    expect(() => todos.update(created.id, {})).toThrow('at least one editable field')
    expect(() => todos.update('missing', { title: 'x' })).toThrow('was not found')
    expect(() => todos.delete('missing')).toThrow('was not found')
    expect(() => todos.list({ statuses: [] })).toThrow('must not be empty')
    expect(() => todos.list({ limit: 21 })).toThrow('cannot exceed 20')
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
    expect(() => new TodoStore({ ...CONFIG, defaultListLimit: 21, maxListLimit: 20 })).toThrow('cannot exceed')
    const todos = store()
    todos.close()
    expect(() => todos.list()).toThrow('closed')
  })
})

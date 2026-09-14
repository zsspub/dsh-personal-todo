import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from '../src/host/store.ts'

const openStores: TodoStore[] = []
const completionDirectories: string[] = []
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
  for (const directory of completionDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('TodoStore', () => {
  it('creates normalized pending todos with an initial activity record', () => {
    const todos = store()
    const todo = todos.create({
      title: '  Ship plugin  ',
      notes: '  finish the README  ',
      assignee: '  Alice  ',
      dueAt: '2026-03-04T05:06:07+08:00',
      priority: 'high',
      tags: [' Work ', 'work', 'THIS-WEEK'],
    })

    expect(todo).toEqual({
      id: 'todo-1',
      title: 'Ship plugin',
      notes: 'finish the README',
      assignee: 'Alice',
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
      archivedAt: null,
    })
    expect(todos.detail(todo.id).events).toMatchObject([{ type: 'created', message: null }])
    expect(todos.list()).toMatchObject({
      total: 1,
      counts: { pending: 1, inProgress: 0, blocked: 0, inReview: 0, completed: 0, cancelled: 0, archived: 0 },
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

  it('archives completed todos outside lifecycle history and restores them', () => {
    const todos = store({ times: Array.from({ length: 8 }, (_, index) => Date.UTC(2026, 0, index + 1)) })
    const created = todos.create({ title: 'Archive me' })
    todos.beginRun(created.id, 'run-1', 'session-1')
    todos.submitReview({ id: created.id, summary: 'Ready' }, 'session-1')
    todos.approve(created.id)

    const archived = todos.archive(created.id)
    expect(archived).toMatchObject({ status: 'completed', archivedAt: expect.any(String) })
    expect(todos.list({ statuses: ['completed'] })).toMatchObject({ total: 0, counts: { completed: 0, archived: 1 } })
    expect(todos.list({ statuses: ['completed'], archived: true })).toMatchObject({
      total: 1,
      todos: [{ id: created.id, archivedAt: archived.archivedAt }],
      counts: { completed: 0, archived: 1 },
    })
    expect(() => todos.archive(created.id)).toThrow('already archived')

    expect(todos.restore(created.id)).toMatchObject({ status: 'completed', archivedAt: null })
    expect(todos.list({ statuses: ['completed'] })).toMatchObject({ total: 1, counts: { completed: 1, archived: 0 } })
    expect(() => todos.restore(created.id)).toThrow('not archived')
    expect(todos.detail(created.id).events.map(event => event.type).slice(0, 2)).toEqual(['restored', 'archived'])
  })

  it('archives in-progress todos without interrupting their Agent lifecycle', () => {
    const todos = store({ times: Array.from({ length: 8 }, (_, index) => Date.UTC(2026, 1, index + 1)) })
    const created = todos.create({ title: 'Still running' })
    todos.beginRun(created.id, 'run-1', 'session-1')

    expect(todos.archive(created.id)).toMatchObject({ status: 'in_progress', archivedAt: expect.any(String) })
    expect(todos.list()).toMatchObject({ total: 0, counts: { inProgress: 0, archived: 1 } })
    expect(todos.list({ archived: true })).toMatchObject({
      total: 1,
      todos: [{ id: created.id, status: 'in_progress' }],
    })
    expect(todos.progress(created.id, 'session-1', 'Work continued while archived')).toMatchObject({
      status: 'in_progress',
      archivedAt: expect.any(String),
      latestSummary: 'Work continued while archived',
    })
    expect(todos.restore(created.id)).toMatchObject({ status: 'in_progress', archivedAt: null })
    expect(todos.list()).toMatchObject({ total: 1, todos: [{ id: created.id }] })
  })

  it('permanently deletes archived todos regardless of lifecycle state', () => {
    const todos = store()
    const created = todos.create({ title: 'Delete from archive' })
    todos.beginRun(created.id, 'run-1', 'session-1')
    todos.archive(created.id)

    expect(todos.delete(created.id)).toEqual({ id: created.id, deleted: true })
    expect(() => todos.get(created.id)).toThrow('was not found')
  })

  it('links direct and nested Agent conversations to the owning todo', () => {
    const todos = store({ ids: ['todo-1', 'todo-2'], times: [1000, 2000, 3000, 4000, 5000, 6000] })
    const first = todos.create({ title: 'Delegated task' })
    const second = todos.create({ title: 'Other task' })
    todos.beginRun(first.id, 'run-1', 'root-1')
    todos.beginRun(second.id, 'run-2', 'root-2')

    expect(todos.linkRelatedSession('missing', 'ignored')).toBeUndefined()
    expect(todos.linkRelatedSession('root-1', 'child-1')).toMatchObject({
      todoId: first.id, sessionId: 'child-1', role: 'related', parentSessionId: 'root-1',
    })
    expect(todos.linkRelatedSession('child-1', 'grandchild-1')).toMatchObject({
      todoId: first.id, sessionId: 'grandchild-1', role: 'related', parentSessionId: 'child-1',
    })
    expect(todos.linkRelatedSession('root-1', 'child-1')).toMatchObject({ sessionId: 'child-1' })
    expect(() => todos.linkRelatedSession('root-2', 'child-1')).toThrow('already linked')
    expect(todos.detail(first.id).sessions.map(session => [session.sessionId, session.role, session.parentSessionId])).toEqual([
      ['root-1', 'primary', null],
      ['child-1', 'related', 'root-1'],
      ['grandchild-1', 'related', 'child-1'],
    ])
  })

  it('selects only durable in-progress runs for service-start recovery', () => {
    const todos = store({ ids: ['running', 'blocked', 'review'] })
    const running = todos.create({ title: 'Running' })
    const blocked = todos.create({ title: 'Blocked' })
    const review = todos.create({ title: 'Review' })
    todos.beginRun(running.id, 'run-running', 'session-running')
    todos.beginRun(blocked.id, 'run-blocked', 'session-blocked')
    todos.block({ id: blocked.id, question: 'Need input' }, 'session-blocked')
    todos.beginRun(review.id, 'run-review', 'session-review')
    todos.submitReview({ id: review.id, summary: 'Ready' }, 'session-review')

    expect(todos.recoverableTodos().map(todo => todo.id)).toEqual(['running'])
  })

  it.each(['pending', 'in_progress', 'blocked', 'in_review'] as const)('从 %s 直接完成并持久化，保留归档和执行历史', (status) => {
    const directory = mkdtempSync(join(tmpdir(), 'todo-complete-'))
    completionDirectories.push(directory)
    const databasePath = join(directory, 'todos.sqlite')
    const todos = store({ databasePath })
    const created = todos.create({ title: '直接完成' })
    if (status !== 'pending') todos.beginRun(created.id, 'run-1', 'session-1')
    if (status === 'blocked') todos.block({ id: created.id, question: '请选择' }, 'session-1')
    if (status === 'in_review') todos.submitReview({ id: created.id, summary: '已验证' }, 'session-1')
    const before = todos.archive(created.id)
    const completed = todos.approve(created.id)
    expect(completed).toMatchObject({
      status: 'completed', completedAt: expect.any(String), blockedReason: null, activeRunId: null,
      archivedAt: before.archivedAt, reviewRound: before.reviewRound, revision: before.revision + 1,
      primarySessionId: before.primarySessionId,
    })
    expect(todos.recoverableTodos()).toEqual([])
    const detail = todos.detail(created.id)
    expect(detail.events[0]).toMatchObject({
      type: status === 'in_review' ? 'review_approved' : 'updated',
      message: status === 'in_review' ? null : '用户标记完成',
    })
    if (status === 'pending') expect(detail.runs).toEqual([])
    else expect(detail.runs[0]).toMatchObject({ status: status === 'in_review' ? 'submitted' : 'cancelled', finishedAt: expect.any(String) })
    expect(() => todos.approve(created.id)).toThrow('cannot be completed while completed')
    expect(() => todos.progress(created.id, 'session-1', '迟到的进度')).toThrow('must be in_progress')
    expect(() => todos.block({ id: created.id, question: '迟到的问题' }, 'session-1')).toThrow('must be in_progress')
    expect(() => todos.submitReview({ id: created.id, summary: '迟到的结果' }, 'session-1')).toThrow('must be in_progress')
    expect(todos.detail(created.id)).toEqual(detail)
    todos.close()
    const reopened = new TodoStore({ ...CONFIG, databasePath })
    openStores.push(reopened)
    expect(reopened.detail(created.id)).toEqual(detail)
    reopened.restore(created.id)
    expect(reopened.list({ statuses: ['completed'] }).todos).toHaveLength(1)
  })

  it('拒绝持久化的 cancelled 状态且不写入完成活动', () => {
    const directory = mkdtempSync(join(tmpdir(), 'todo-complete-'))
    completionDirectories.push(directory)
    const databasePath = join(directory, 'todos.sqlite')
    const todos = store({ databasePath })
    const created = todos.create({ title: '已取消' })
    const database = new DatabaseSync(databasePath)
    try {
      database.prepare("UPDATE todos SET status = 'cancelled' WHERE id = ?").run(created.id)
    } finally {
      database.close()
    }
    const before = todos.detail(created.id)
    expect(() => todos.approve(created.id)).toThrow('cannot be completed while cancelled')
    expect(todos.detail(created.id)).toEqual(before)
  })

  it('rejects invalid lifecycle transitions and Agent Sessions that do not own the todo', () => {
    const todos = store()
    const created = todos.create({ title: 'Owned task' })
    expect(() => todos.requestChanges({ id: created.id, feedback: '调整' }, 'run-2')).toThrow('must be in_review')
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
    todos.create({ title: 'Pending', assignee: 'Alice', priority: 'high', tags: ['work'] })
    const working = todos.create({ title: 'Working', assignee: 'Bob', tags: ['work'] })
    const blocked = todos.create({ title: 'Blocked', assignee: 'Alice', tags: ['work', 'input'] })
    const reviewed = todos.create({ title: 'Reviewed', tags: ['work'] })
    todos.beginRun(working.id, 'run-working', 'session-working')
    todos.beginRun(blocked.id, 'run-blocked', 'session-blocked')
    todos.block({ id: blocked.id, question: 'Need input' }, 'session-blocked')
    todos.beginRun(reviewed.id, 'run-reviewed', 'session-reviewed')
    todos.submitReview({ id: reviewed.id, summary: 'Ready' }, 'session-reviewed')

    expect(todos.list({ tags: ['work'] }).todos.map(todo => todo.id)).toEqual(['reviewed', 'blocked', 'working', 'pending'])
    expect(todos.list({ statuses: ['blocked'], tags: ['INPUT'] }).todos.map(todo => todo.id)).toEqual(['blocked'])
    expect(todos.list({ search: 'alice' }).todos.map(todo => todo.id)).toEqual(['blocked', 'pending'])
    expect(todos.update(working.id, { notes: '  updated  ', assignee: null, priority: 'medium', tags: [] })).toMatchObject({
      status: 'in_progress', notes: 'updated', assignee: null, priority: 'medium', tags: [], revision: 2,
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

  it('migrates version-two Session links to accept related conversations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-v2-'))
    const databasePath = join(directory, 'todos.sqlite3')
    const database = new DatabaseSync(databasePath)
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE todos (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT,
        status TEXT NOT NULL, priority TEXT NOT NULL, due_at INTEGER,
        primary_session_id TEXT, active_run_id TEXT, latest_summary TEXT, blocked_reason TEXT,
        review_round INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      ) STRICT;
      CREATE TABLE todo_tags (
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        tag TEXT NOT NULL, PRIMARY KEY (todo_id, tag)
      ) STRICT;
      CREATE TABLE todo_runs (
        id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, status TEXT NOT NULL, root_session_id TEXT NOT NULL,
        result_summary TEXT, verification TEXT, risk TEXT, started_at INTEGER NOT NULL,
        finished_at INTEGER, UNIQUE (todo_id, sequence)
      ) STRICT;
      CREATE TABLE todo_sessions (
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK (role = 'primary'),
        parent_session_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (todo_id, session_id)
      ) STRICT;
      CREATE TABLE todo_events (
        id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL, message TEXT, created_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO todos VALUES ('old', 'Existing task', NULL, 'in_progress', 'none', NULL, 'root', 'run', NULL, NULL, 0, 1, 1000, 1000, NULL);
      INSERT INTO todo_runs VALUES ('run', 'old', 1, 'running', 'root', NULL, NULL, NULL, 1000, NULL);
      INSERT INTO todo_sessions VALUES ('old', 'root', 'primary', NULL, 1000);
      INSERT INTO todo_events VALUES ('created', 'old', NULL, 'created', NULL, 1000);
      PRAGMA user_version = 2;
    `)
    database.close()

    const migrated = store({ databasePath })
    expect(migrated.linkRelatedSession('root', 'child')).toMatchObject({ role: 'related', parentSessionId: 'root' })
    expect(migrated.get('old')).toMatchObject({ archivedAt: null })
    expect(migrated.detail('old').sessions).toHaveLength(2)
  })

  it('migrates version-four todos with an unassigned owner', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-v4-'))
    const databasePath = join(directory, 'todos.sqlite3')
    const database = new DatabaseSync(databasePath)
    database.exec(`
      CREATE TABLE todos (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT,
        status TEXT NOT NULL, priority TEXT NOT NULL, due_at INTEGER,
        primary_session_id TEXT, active_run_id TEXT, latest_summary TEXT, blocked_reason TEXT,
        review_round INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, archived_at INTEGER
      ) STRICT;
      CREATE TABLE todo_tags (
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        tag TEXT NOT NULL, PRIMARY KEY (todo_id, tag)
      ) STRICT;
      CREATE TABLE todo_runs (
        id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, status TEXT NOT NULL, root_session_id TEXT NOT NULL,
        result_summary TEXT, verification TEXT, risk TEXT, started_at INTEGER NOT NULL,
        finished_at INTEGER, UNIQUE (todo_id, sequence)
      ) STRICT;
      CREATE TABLE todo_events (
        id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL, message TEXT, created_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO todos VALUES ('old', 'Existing task', NULL, 'pending', 'none', NULL, NULL, NULL, NULL, NULL, 0, 0, 1000, 1000, NULL, NULL);
      PRAGMA user_version = 4;
    `)
    database.close()

    const migrated = store({ databasePath })
    expect(migrated.get('old')).toMatchObject({ title: 'Existing task', assignee: null })
    expect(migrated.update('old', { assignee: ' Alice ' })).toMatchObject({ assignee: 'Alice' })
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
      { title: 'x', assignee: 'a'.repeat(101) },
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

/** 负责个人待办校验、排序和持久化写入的 SQLite 存储层。 */

import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { assertBackupSize, parseTodoBackup } from '../backup.ts'
import type {
  BlockTodoRequest, CreateTodoInput, DeleteTodoResult, ExportTodoDataResult, ImportTodoDataResult, ListTodoInput, ReplyTodoRequest,
  RequestTodoChangesRequest, SubmitTodoReviewRequest, Todo, TodoCounts, TodoDetail,
  TodoEvent, TodoEventType, TodoListResult, TodoPriority, TodoRun, TodoRunStatus,
  TodoBackup, TodoSession, TodoStatus, UpdateTodoPatch,
} from '../types.ts'
import { TODO_PRIORITIES, TODO_STATUSES } from '../types.ts'

export const PERSONAL_TODO_SCHEMA_VERSION = 6

export type JournalMode = 'wal' | 'delete' | 'truncate' | 'persist'

export interface TodoStoreConfig {
  readonly databasePath: string
  readonly journalMode: JournalMode
  readonly busyTimeoutMs: number
  readonly defaultListLimit: number
  readonly maxListLimit: number
}

interface TodoStoreDependencies {
  readonly now?: () => number
  readonly createId?: () => string
  readonly createEventId?: () => string
}

interface TodoRow {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  readonly assignee: string | null
  readonly status: TodoStatus
  readonly priority: TodoPriority
  readonly due_at: number | null
  readonly primary_session_id: string | null
  readonly active_run_id: string | null
  readonly latest_summary: string | null
  readonly blocked_reason: string | null
  readonly review_round: number
  readonly revision: number
  readonly created_at: number
  readonly updated_at: number
  readonly completed_at: number | null
  readonly archived_at: number | null
}

interface TodoRunRow {
  readonly id: string
  readonly todo_id: string
  readonly sequence: number
  readonly status: TodoRunStatus
  readonly root_session_id: string
  readonly result_summary: string | null
  readonly verification: string | null
  readonly risk: string | null
  readonly started_at: number
  readonly finished_at: number | null
}

interface TodoSessionRow {
  readonly todo_id: string
  readonly session_id: string
  readonly role: 'primary' | 'related'
  readonly parent_session_id: string | null
  readonly created_at: number
}

interface TodoEventRow {
  readonly id: string
  readonly todo_id: string
  readonly run_id: string | null
  readonly type: TodoEventType
  readonly message: string | null
  readonly created_at: number
}

const STATUS_SET = new Set<string>(TODO_STATUSES)
const PRIORITY_SET = new Set<string>(TODO_PRIORITIES)
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u

/** 通过工具与 Remote 调用返回的统一业务错误。 */
export class PersonalTodoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PersonalTodoError'
  }
}

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PersonalTodoError(`${name} must be a positive safe integer`)
  }
  return value
}

function nonNegativeSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PersonalTodoError(`${name} must be a non-negative safe integer`)
  }
  return value
}

function normalizeRequiredText(name: string, value: string, maxLength = 10_000): string {
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) {
    throw new PersonalTodoError(`${name} must contain 1 to ${String(maxLength)} characters after trimming`)
  }
  return text
}

function normalizeTitle(value: string): string {
  return normalizeRequiredText('title', value, 200)
}

function normalizeNotes(value: string | null | undefined): string | null {
  if (value == null) return null
  const notes = value.trim()
  if (notes.length > 10_000) throw new PersonalTodoError('notes must contain at most 10000 characters')
  return notes.length === 0 ? null : notes
}

function normalizeAssignee(value: string | null | undefined): string | null {
  if (value == null) return null
  const assignee = value.trim()
  if (assignee.length > 100) throw new PersonalTodoError('assignee must contain at most 100 characters')
  return assignee.length === 0 ? null : assignee
}

function normalizeOptionalText(name: string, value: string | null | undefined): string | null {
  if (value == null) return null
  const text = value.trim()
  if (text.length > 10_000) throw new PersonalTodoError(`${name} must contain at most 10000 characters`)
  return text.length === 0 ? null : text
}

function normalizePriority(value: string | undefined): TodoPriority {
  const priority = value ?? 'none'
  if (!PRIORITY_SET.has(priority)) throw new PersonalTodoError(`invalid todo priority ${JSON.stringify(priority)}`)
  return priority as TodoPriority
}

function normalizeTags(values: readonly string[] | undefined): string[] {
  if (values === undefined) return []
  if (values.length > 20) throw new PersonalTodoError('tags must contain at most 20 entries')
  const tags = new Set<string>()
  for (const value of values) {
    const tag = value.trim().toLocaleLowerCase()
    if (tag.length === 0 || tag.length > 32) {
      throw new PersonalTodoError('each tag must contain 1 to 32 characters after trimming')
    }
    tags.add(tag)
  }
  return [...tags].sort()
}

function parseTimestamp(name: string, value: string | null | undefined): number | null {
  if (value == null) return null
  if (!RFC3339.test(value)) throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`)
  return timestamp
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, character => `\\${character}`)
}

function assertDatabasePath(path: string): void {
  if (path !== ':memory:' && !isAbsolute(path)) {
    throw new PersonalTodoError('databasePath must be absolute or :memory:')
  }
}

/** 同步 SQLite 存储库；每个公开写入操作均在一个数据库事务中完成。 */
export class TodoStore {
  private readonly database: DatabaseSync
  private readonly now: () => number
  private readonly createId: () => string
  private readonly createEventId: () => string
  private closed = false

  constructor(private readonly config: TodoStoreConfig, dependencies: TodoStoreDependencies = {}) {
    assertDatabasePath(config.databasePath)
    positiveSafeInteger('busyTimeoutMs', config.busyTimeoutMs)
    positiveSafeInteger('defaultListLimit', config.defaultListLimit)
    positiveSafeInteger('maxListLimit', config.maxListLimit)
    if (config.defaultListLimit > config.maxListLimit) {
      throw new PersonalTodoError('defaultListLimit cannot exceed maxListLimit')
    }
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
    this.createEventId = dependencies.createEventId ?? randomUUID
    const existed = config.databasePath === ':memory:' || existsSync(config.databasePath)
    if (config.databasePath !== ':memory:') {
      mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 })
    }
    this.database = new DatabaseSync(config.databasePath, { timeout: config.busyTimeoutMs })
    try {
      if (!existed && config.databasePath !== ':memory:') chmodSync(config.databasePath, 0o600)
      this.initialize()
    } catch (error) {
      this.database.close()
      this.closed = true
      throw error
    }
  }

  private initialize(): void {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec(`PRAGMA journal_mode = ${this.config.journalMode.toUpperCase()}`)
    this.database.exec(`PRAGMA busy_timeout = ${String(this.config.busyTimeoutMs)}`)
    const row = this.database.prepare('PRAGMA user_version').get() as { user_version: number }
    if (row.user_version > PERSONAL_TODO_SCHEMA_VERSION) {
      throw new PersonalTodoError(
        `personal todo database schema ${String(row.user_version)} is newer than supported version ${String(PERSONAL_TODO_SCHEMA_VERSION)}`,
      )
    }
    if (row.user_version === 0) {
      this.createSchema()
      return
    }
    let version = row.user_version
    if (version === 1) {
      this.migrateV1()
      version = 3
    } else if (version === 2) {
      this.migrateV2()
      version = 3
    }
    if (version === 3) {
      this.migrateV3()
      version = 4
    }
    if (version === 4) {
      this.migrateV4()
      version = 5
    }
    if (version === 5) this.migrateV5()
  }

  private createSchema(): void {
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE todos (
          id                 TEXT PRIMARY KEY,
          title              TEXT NOT NULL,
          notes              TEXT,
          assignee           TEXT,
          status             TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
          priority           TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
          due_at             INTEGER,
          primary_session_id TEXT,
          active_run_id      TEXT,
          latest_summary     TEXT,
          blocked_reason     TEXT,
          review_round       INTEGER NOT NULL DEFAULT 0,
          revision           INTEGER NOT NULL DEFAULT 0,
          created_at         INTEGER NOT NULL,
          updated_at         INTEGER NOT NULL,
          completed_at       INTEGER,
          archived_at        INTEGER
        ) STRICT;
        CREATE TABLE todo_tags (
          todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          tag     TEXT NOT NULL,
          PRIMARY KEY (todo_id, tag)
        ) STRICT;
        CREATE TABLE todo_runs (
          id              TEXT PRIMARY KEY,
          todo_id         TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          sequence        INTEGER NOT NULL,
          status          TEXT NOT NULL CHECK (status IN ('running', 'waiting_input', 'submitted', 'failed', 'cancelled')),
          root_session_id TEXT NOT NULL,
          result_summary  TEXT,
          verification    TEXT,
          risk            TEXT,
          started_at      INTEGER NOT NULL,
          finished_at     INTEGER,
          UNIQUE (todo_id, sequence)
        ) STRICT;
        CREATE TABLE todo_sessions (
          todo_id           TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          session_id        TEXT NOT NULL UNIQUE,
          role              TEXT NOT NULL CHECK (role IN ('primary', 'related')),
          parent_session_id TEXT,
          created_at        INTEGER NOT NULL,
          PRIMARY KEY (todo_id, session_id)
        ) STRICT;
        CREATE TABLE todo_events (
          id         TEXT PRIMARY KEY,
          todo_id    TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          run_id     TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
          type       TEXT NOT NULL CHECK (type IN ('created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied', 'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled', 'archived', 'restored')),
          message    TEXT,
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX todos_status_due_idx ON todos(status, due_at);
        CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
        CREATE INDEX todos_archived_idx ON todos(archived_at DESC);
        CREATE INDEX todo_tags_tag_idx ON todo_tags(tag, todo_id);
        CREATE INDEX todo_runs_todo_idx ON todo_runs(todo_id, sequence DESC);
        CREATE INDEX todo_events_todo_idx ON todo_events(todo_id, created_at DESC);
        PRAGMA user_version = 6;
      `)
    })
  }

  private migrateV1(): void {
    this.database.exec('PRAGMA foreign_keys = OFF')
    try {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE todo_tags RENAME TO todo_tags_v1;
          ALTER TABLE todos RENAME TO todos_v1;
          CREATE TABLE todos (
            id                 TEXT PRIMARY KEY,
            title              TEXT NOT NULL,
            notes              TEXT,
            status             TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled')),
            priority           TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
            due_at             INTEGER,
            primary_session_id TEXT,
            active_run_id      TEXT,
            latest_summary     TEXT,
            blocked_reason     TEXT,
            review_round       INTEGER NOT NULL DEFAULT 0,
            revision           INTEGER NOT NULL DEFAULT 0,
            created_at         INTEGER NOT NULL,
            updated_at         INTEGER NOT NULL,
            completed_at       INTEGER
          ) STRICT;
          INSERT INTO todos (
            id, title, notes, status, priority, due_at, created_at, updated_at, completed_at
          ) SELECT id, title, notes, status, priority, due_at, created_at, updated_at, completed_at FROM todos_v1;
          CREATE TABLE todo_tags (
            todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            tag     TEXT NOT NULL,
            PRIMARY KEY (todo_id, tag)
          ) STRICT;
          INSERT INTO todo_tags SELECT todo_id, tag FROM todo_tags_v1;
          CREATE TABLE todo_runs (
            id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'waiting_input', 'submitted', 'failed', 'cancelled')),
            root_session_id TEXT NOT NULL, result_summary TEXT, verification TEXT, risk TEXT,
            started_at INTEGER NOT NULL, finished_at INTEGER, UNIQUE (todo_id, sequence)
          ) STRICT;
          CREATE TABLE todo_sessions (
            todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE, session_id TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL CHECK (role IN ('primary', 'related')), parent_session_id TEXT, created_at INTEGER NOT NULL,
            PRIMARY KEY (todo_id, session_id)
          ) STRICT;
          CREATE TABLE todo_events (
            id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied', 'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled')),
            message TEXT, created_at INTEGER NOT NULL
          ) STRICT;
          INSERT INTO todo_events (id, todo_id, run_id, type, message, created_at)
            SELECT 'migrated-created-' || id, id, NULL, 'created', NULL, created_at FROM todos_v1;
          DROP TABLE todo_tags_v1;
          DROP TABLE todos_v1;
          CREATE INDEX todos_status_due_idx ON todos(status, due_at);
          CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
          CREATE INDEX todo_tags_tag_idx ON todo_tags(tag, todo_id);
          CREATE INDEX todo_runs_todo_idx ON todo_runs(todo_id, sequence DESC);
          CREATE INDEX todo_events_todo_idx ON todo_events(todo_id, created_at DESC);
          PRAGMA user_version = 3;
        `)
      })
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON')
    }
  }

  private migrateV2(): void {
    this.database.exec('PRAGMA foreign_keys = OFF')
    try {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE todo_sessions RENAME TO todo_sessions_v2;
          CREATE TABLE todo_sessions (
            todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE, session_id TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL CHECK (role IN ('primary', 'related')), parent_session_id TEXT, created_at INTEGER NOT NULL,
            PRIMARY KEY (todo_id, session_id)
          ) STRICT;
          INSERT INTO todo_sessions SELECT todo_id, session_id, role, parent_session_id, created_at FROM todo_sessions_v2;
          DROP TABLE todo_sessions_v2;
          PRAGMA user_version = 3;
        `)
      })
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON')
    }
  }

  private migrateV3(): void {
    this.database.exec('PRAGMA foreign_keys = OFF')
    try {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE todos ADD COLUMN archived_at INTEGER;
          ALTER TABLE todo_events RENAME TO todo_events_v3;
          CREATE TABLE todo_events (
            id TEXT PRIMARY KEY, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied', 'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled', 'archived', 'restored')),
            message TEXT, created_at INTEGER NOT NULL
          ) STRICT;
          INSERT INTO todo_events SELECT id, todo_id, run_id, type, message, created_at FROM todo_events_v3;
          DROP TABLE todo_events_v3;
          CREATE INDEX todos_archived_idx ON todos(archived_at DESC);
          CREATE INDEX todo_events_todo_idx ON todo_events(todo_id, created_at DESC);
          PRAGMA user_version = 4;
        `)
      })
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON')
    }
  }

  private migrateV4(): void {
    this.transaction(() => {
      this.database.exec(`
        ALTER TABLE todos ADD COLUMN assignee TEXT;
        PRAGMA user_version = 5;
      `)
    })
  }

  private assertOpen(): void {
    if (this.closed) throw new PersonalTodoError('personal todo database is closed')
  }

  private migrateV5(): void {
    this.database.exec('PRAGMA foreign_keys = OFF')
    try {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE todos_v6 (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, assignee TEXT,
            status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
            priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
            due_at INTEGER, primary_session_id TEXT, active_run_id TEXT, latest_summary TEXT,
            blocked_reason TEXT, review_round INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, archived_at INTEGER
          ) STRICT;
          INSERT INTO todos_v6
            SELECT id, title, notes, assignee,
              CASE WHEN status IN ('blocked', 'in_review') THEN 'in_progress' ELSE status END,
              priority, due_at, primary_session_id, active_run_id, latest_summary, blocked_reason,
              review_round, revision, created_at, updated_at, completed_at, archived_at FROM todos;
          DROP TABLE todos;
          ALTER TABLE todos_v6 RENAME TO todos;
          CREATE INDEX todos_status_due_idx ON todos(status, due_at);
          CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
          CREATE INDEX todos_archived_idx ON todos(archived_at DESC);
          PRAGMA user_version = 6;
        `)
        if (this.database.prepare('PRAGMA foreign_key_check').all().length !== 0) {
          throw new PersonalTodoError('任务状态迁移失败：关联记录不完整。')
        }
      })
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON')
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const value = operation()
      this.database.exec('COMMIT')
      return value
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'personal todo transaction and rollback failed')
      }
      throw error
    }
  }

  private tagsFor(id: string): string[] {
    const rows = this.database.prepare('SELECT tag FROM todo_tags WHERE todo_id = ? ORDER BY tag').all(id) as { tag: string }[]
    return rows.map(row => row.tag)
  }

  private todoFromRow(row: TodoRow): Todo {
    const run = this.database.prepare(`
      SELECT status FROM todo_runs WHERE todo_id = ? ORDER BY sequence DESC LIMIT 1
    `).get(row.id) as { status: TodoRunStatus } | undefined
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      assignee: row.assignee,
      status: row.status,
      executionStatus: run === undefined ? null : run.status === 'cancelled' ? 'stopped' : run.status,
      priority: row.priority,
      dueAt: iso(row.due_at),
      tags: this.tagsFor(row.id),
      primarySessionId: row.primary_session_id,
      activeRunId: row.active_run_id,
      latestSummary: row.latest_summary,
      blockedReason: row.blocked_reason,
      reviewRound: row.review_round,
      revision: row.revision,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      completedAt: iso(row.completed_at),
      archivedAt: iso(row.archived_at),
    }
  }

  private runFromRow(row: TodoRunRow): TodoRun {
    return {
      id: row.id,
      todoId: row.todo_id,
      sequence: row.sequence,
      status: row.status,
      rootSessionId: row.root_session_id,
      resultSummary: row.result_summary,
      verification: row.verification,
      risk: row.risk,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: iso(row.finished_at),
    }
  }

  private sessionFromRow(row: TodoSessionRow): TodoSession {
    return {
      todoId: row.todo_id,
      sessionId: row.session_id,
      role: row.role,
      parentSessionId: row.parent_session_id,
      createdAt: new Date(row.created_at).toISOString(),
    }
  }

  private eventFromRow(row: TodoEventRow): TodoEvent {
    return {
      id: row.id,
      todoId: row.todo_id,
      runId: row.run_id,
      type: row.type,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    }
  }

  private find(id: string): TodoRow | undefined {
    return this.database.prepare(`
      SELECT id, title, notes, assignee, status, priority, due_at, primary_session_id, active_run_id,
             latest_summary, blocked_reason, review_round, revision, created_at, updated_at, completed_at, archived_at
      FROM todos WHERE id = ?
    `).get(id) as TodoRow | undefined
  }

  private requireRow(id: string): TodoRow {
    const row = this.find(id)
    if (row === undefined) throw new PersonalTodoError(`personal todo ${JSON.stringify(id)} was not found`)
    return row
  }

  private requireStatus(row: TodoRow, expected: TodoStatus): void {
    if (row.status !== expected) {
      throw new PersonalTodoError(`todo ${JSON.stringify(row.id)} must be ${expected}, not ${row.status}`)
    }
  }

  private requireOwnedRun(row: TodoRow, sessionId: string): string {
    if (row.primary_session_id !== sessionId) {
      throw new PersonalTodoError(`session ${JSON.stringify(sessionId)} does not own todo ${JSON.stringify(row.id)}`)
    }
    if (row.active_run_id === null) throw new PersonalTodoError(`todo ${JSON.stringify(row.id)} has no active run`)
    return row.active_run_id
  }

  private requireRunStatus(row: TodoRow, status: TodoRunStatus): string {
    this.requireStatus(row, 'in_progress')
    const run = this.database.prepare('SELECT status FROM todo_runs WHERE id = ?').get(row.active_run_id ?? '') as { status: TodoRunStatus } | undefined
    if (run?.status !== status) throw new PersonalTodoError(`待办 ${row.id} 的 Agent 执行状态必须为 ${status}。`)
    return row.active_run_id as string
  }

  private appendEvent(
    todoId: string,
    runId: string | null,
    type: TodoEventType,
    message: string | null,
    timestamp: number,
  ): void {
    this.database.prepare(`
      INSERT INTO todo_events (id, todo_id, run_id, type, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(this.createEventId(), todoId, runId, type, message, timestamp)
  }

  /** 返回待办快照；标识符不存在时抛出错误。 */
  get(id: string): Todo {
    this.assertOpen()
    return this.todoFromRow(this.requireRow(id))
  }

  /** 返回待办及其持久化执行历史。 */
  detail(id: string): TodoDetail {
    return this.readDetail(id, false)
  }

  private readDetail(id: string, fullHistory: boolean): TodoDetail {
    this.assertOpen()
    const todo = this.todoFromRow(this.requireRow(id))
    const runs = this.database.prepare(`
      SELECT id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
      FROM todo_runs WHERE todo_id = ? ORDER BY sequence DESC
    `).all(id) as unknown as TodoRunRow[]
    const sessions = this.database.prepare(`
      SELECT todo_id, session_id, role, parent_session_id, created_at
      FROM todo_sessions WHERE todo_id = ?
      ORDER BY CASE role WHEN 'primary' THEN 0 ELSE 1 END, created_at ASC, session_id ASC
    `).all(id) as unknown as TodoSessionRow[]
    const events = this.database.prepare(`
      SELECT id, todo_id, run_id, type, message, created_at
      FROM todo_events WHERE todo_id = ? ORDER BY created_at DESC, rowid DESC ${fullHistory ? '' : 'LIMIT 200'}
    `).all(id) as unknown as TodoEventRow[]
    return {
      todo,
      runs: runs.map(row => this.runFromRow(row)),
      sessions: sessions.map(row => this.sessionFromRow(row)),
      events: events.map(row => this.eventFromRow(row)),
    }
  }

  exportData(): ExportTodoDataResult {
    this.assertOpen()
    const backup = this.transaction((): TodoBackup => {
      const rows = this.database.prepare('SELECT id FROM todos ORDER BY created_at, id').all() as { id: string }[]
      return {
        format: 'dsh-personal-todo',
        version: 2,
        exportedAt: new Date(this.now()).toISOString(),
        todos: rows.map(row => this.readDetail(row.id, true)),
      }
    })
    const json = JSON.stringify(backup, null, 2)
    try {
      assertBackupSize(json)
    } catch (error) {
      throw new PersonalTodoError((error as Error).message)
    }
    return { filename: `personal-todo-${backup.exportedAt.replace(/[:.]/gu, '-')}.json`, json }
  }

  importData(json: string): ImportTodoDataResult {
    this.assertOpen()
    try {
      const backup = parseTodoBackup(json)
      return this.transaction(() => {
        let imported = 0
        let skipped = 0
        let resetToPending = 0
        for (const detail of backup.todos) {
          const { todo, runs, sessions, events } = detail
          if (this.find(todo.id) !== undefined) {
            skipped++
            continue
          }
          for (const [table, column, ids] of [
            ['todo_runs', 'id', runs.map(run => run.id)],
            ['todo_events', 'id', events.map(event => event.id)],
            ['todo_sessions', 'session_id', sessions.map(session => session.sessionId)],
          ] as const) {
            const lookup = this.database.prepare(`SELECT todo_id FROM ${table} WHERE ${column} = ?`)
            for (const id of ids) {
              if (lookup.get(id) !== undefined) {
                throw new PersonalTodoError(`导入冲突：${table} 标识 ${id} 已属于其他本地待办。`)
              }
            }
          }
          const reset = todo.executionStatus === 'running'
          const timestamp = this.now()
          const time = (value: string | null): number | null => value === null ? null : Date.parse(value)
          this.database.prepare(`
            INSERT INTO todos (
              id, title, notes, assignee, status, priority, due_at, primary_session_id, active_run_id,
              latest_summary, blocked_reason, review_round, revision, created_at, updated_at, completed_at, archived_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(todo.id, todo.title, todo.notes, todo.assignee, reset ? 'pending' : todo.status,
            todo.priority, time(todo.dueAt), todo.primarySessionId, reset ? null : todo.activeRunId,
            todo.latestSummary, reset ? null : todo.blockedReason, todo.reviewRound, todo.revision + (reset ? 1 : 0),
            time(todo.createdAt), reset ? timestamp : time(todo.updatedAt), time(todo.completedAt), time(todo.archivedAt))
          const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)')
          for (const tag of todo.tags) insertTag.run(todo.id, tag)
          const insertRun = this.database.prepare(`
            INSERT INTO todo_runs (id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          for (const run of runs) {
            const cancel = reset && run.id === todo.activeRunId
            insertRun.run(run.id, todo.id, run.sequence, cancel ? 'cancelled' : run.status, run.rootSessionId,
              run.resultSummary, run.verification, run.risk, time(run.startedAt), cancel ? timestamp : time(run.finishedAt))
          }
          const insertSession = this.database.prepare(`
            INSERT INTO todo_sessions (todo_id, session_id, role, parent_session_id, created_at) VALUES (?, ?, ?, ?, ?)
          `)
          for (const session of sessions) {
            insertSession.run(todo.id, session.sessionId, session.role, session.parentSessionId, time(session.createdAt))
          }
          const insertEvent = this.database.prepare(`
            INSERT INTO todo_events (id, todo_id, run_id, type, message, created_at) VALUES (?, ?, ?, ?, ?, ?)
          `)
          for (const event of [...events].reverse()) {
            insertEvent.run(event.id, todo.id, event.runId, event.type, event.message, time(event.createdAt))
          }
          if (reset) {
            this.appendEvent(todo.id, todo.activeRunId, 'updated', '从备份导入：执行中待办已转为待处理，请手动开始执行。', timestamp)
            resetToPending++
          }
          imported++
        }
        return { imported, skipped, resetToPending }
      })
    } catch (error) {
      if (error instanceof PersonalTodoError) throw error
      throw new PersonalTodoError(`导入失败，未写入任何数据：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 规范化并持久化一条待处理待办，返回保存结果。 */
  create(input: CreateTodoInput): Todo {
    this.assertOpen()
    const timestamp = this.now()
    const row: TodoRow = {
      id: this.createId(),
      title: normalizeTitle(input.title),
      notes: normalizeNotes(input.notes),
      assignee: normalizeAssignee(input.assignee),
      status: 'pending',
      priority: normalizePriority(input.priority),
      due_at: parseTimestamp('dueAt', input.dueAt),
      primary_session_id: null,
      active_run_id: null,
      latest_summary: null,
      blocked_reason: null,
      review_round: 0,
      revision: 0,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
      archived_at: null,
    }
    const tags = normalizeTags(input.tags)
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO todos (
          id, title, notes, assignee, status, priority, due_at, primary_session_id, active_run_id,
          latest_summary, blocked_reason, review_round, revision, created_at, updated_at, completed_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.title, row.notes, row.assignee, row.status, row.priority, row.due_at, null, null,
        null, null, 0, 0, timestamp, timestamp, null, null,
      )
      const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)')
      for (const tag of tags) insertTag.run(row.id, tag)
      this.appendEvent(row.id, null, 'created', null, timestamp)
    })
    return { ...this.todoFromRow(row), tags }
  }

  /** 替换指定的可编辑字段，返回持久化后的待办。 */
  update(id: string, patch: UpdateTodoPatch): Todo {
    this.assertOpen()
    const mutableKeys = ['title', 'notes', 'assignee', 'priority', 'dueAt', 'tags'] as const
    if (!mutableKeys.some(key => Object.hasOwn(patch, key))) {
      throw new PersonalTodoError('todo update must include at least one editable field')
    }
    const current = this.requireRow(id)
    const timestamp = this.now()
    const row: TodoRow = {
      ...current,
      title: Object.hasOwn(patch, 'title') ? normalizeTitle(patch.title as string) : current.title,
      notes: Object.hasOwn(patch, 'notes') ? normalizeNotes(patch.notes) : current.notes,
      assignee: Object.hasOwn(patch, 'assignee') ? normalizeAssignee(patch.assignee) : current.assignee,
      priority: Object.hasOwn(patch, 'priority') ? normalizePriority(patch.priority) : current.priority,
      due_at: Object.hasOwn(patch, 'dueAt') ? parseTimestamp('dueAt', patch.dueAt) : current.due_at,
      revision: current.revision + 1,
      updated_at: timestamp,
    }
    const tags = Object.hasOwn(patch, 'tags') ? normalizeTags(patch.tags) : this.tagsFor(id)
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET title = ?, notes = ?, assignee = ?, priority = ?, due_at = ?, revision = ?, updated_at = ? WHERE id = ?
      `).run(row.title, row.notes, row.assignee, row.priority, row.due_at, row.revision, timestamp, id)
      if (Object.hasOwn(patch, 'tags')) {
        this.database.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(id)
        const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)')
        for (const tag of tags) insertTag.run(id, tag)
      }
      this.appendEvent(id, current.active_run_id, 'updated', null, timestamp)
    })
    return { ...this.todoFromRow(row), tags }
  }

  linkedSessionIds(): string[] {
    this.assertOpen()
    return (this.database.prepare('SELECT primary_session_id FROM todos WHERE primary_session_id IS NOT NULL')
      .all() as { primary_session_id: string }[]).map(row => row.primary_session_id)
  }

  attachSession(id: string, sessionId: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.archived_at !== null || !['pending', 'in_progress'].includes(current.status)) {
      throw new PersonalTodoError('只有未归档的未完成任务可以交给 Agent。')
    }
    if (current.primary_session_id !== null && current.primary_session_id !== sessionId) {
      throw new PersonalTodoError('待办已关联其他主会话。')
    }
    const timestamp = this.now()
    this.transaction(() => {
      if (current.primary_session_id === null) this.database.prepare(`
        INSERT INTO todo_sessions (todo_id, session_id, role, parent_session_id, created_at)
        VALUES (?, ?, 'primary', NULL, ?)
      `).run(id, sessionId, timestamp)
      this.database.prepare(`
        UPDATE todos SET status = 'in_progress', primary_session_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(sessionId, timestamp, id)
      this.appendEvent(id, null, 'updated', '用户将任务交给 Agent，执行情况请查看关联对话。', timestamp)
    })
    return this.get(id)
  }

  /** 认领一条待处理待办，并创建其首轮 Agent 执行周期。 */
  beginRun(id: string, runId: string, sessionId: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.status !== 'pending' && current.status !== 'in_progress') throw new PersonalTodoError('只有未完成任务可以交给 Agent。')
    if (current.archived_at !== null) throw new PersonalTodoError('请先恢复归档任务。')
    if (current.active_run_id !== null) throw new PersonalTodoError('请先处理当前 Agent 执行或结果。')
    const timestamp = this.now()
    const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM todo_runs WHERE todo_id = ?
    `).get(id) as { sequence: number }
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO todo_runs (
          id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
        ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, NULL, ?, NULL)
      `).run(runId, id, sequenceRow.sequence, sessionId, timestamp)
      this.database.prepare(`
        INSERT OR IGNORE INTO todo_sessions (todo_id, session_id, role, parent_session_id, created_at)
        VALUES (?, ?, 'primary', NULL, ?)
      `).run(id, sessionId, timestamp)
      this.database.prepare(`
        UPDATE todos SET status = 'in_progress', primary_session_id = ?, active_run_id = ?,
          latest_summary = NULL, blocked_reason = NULL, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(sessionId, runId, timestamp, id)
      this.appendEvent(id, runId, 'run_started', null, timestamp)
    })
    return this.get(id)
  }

  /** 直接父会话已关联待办时，将子会话关联到同一待办。 */
  linkRelatedSession(parentSessionId: string, sessionId: string): TodoSession | undefined {
    this.assertOpen()
    const parent = this.database.prepare(`
      SELECT todo_id, session_id, role, parent_session_id, created_at
      FROM todo_sessions WHERE session_id = ?
    `).get(parentSessionId) as TodoSessionRow | undefined
    if (parent === undefined) return undefined
    const existing = this.database.prepare(`
      SELECT todo_id, session_id, role, parent_session_id, created_at
      FROM todo_sessions WHERE session_id = ?
    `).get(sessionId) as TodoSessionRow | undefined
    if (existing !== undefined) {
      if (existing.todo_id !== parent.todo_id || existing.parent_session_id !== parentSessionId) {
        throw new PersonalTodoError(`session ${JSON.stringify(sessionId)} is already linked to another todo conversation`)
      }
      return this.sessionFromRow(existing)
    }
    const timestamp = this.now()
    const row: TodoSessionRow = {
      todo_id: parent.todo_id,
      session_id: sessionId,
      role: 'related',
      parent_session_id: parentSessionId,
      created_at: timestamp,
    }
    this.database.prepare(`
      INSERT INTO todo_sessions (todo_id, session_id, role, parent_session_id, created_at)
      VALUES (?, ?, 'related', ?, ?)
    `).run(row.todo_id, row.session_id, row.parent_session_id, row.created_at)
    return this.sessionFromRow(row)
  }

  /** 返回服务启动后需要在原根会话中恢复的执行中待办。 */
  recoverableTodos(): Todo[] {
    this.assertOpen()
    const rows = this.database.prepare(`
      SELECT id, title, notes, assignee, status, priority, due_at, primary_session_id,
             active_run_id, latest_summary, blocked_reason, review_round, revision,
             created_at, updated_at, completed_at, archived_at
      FROM todos
      WHERE status = 'in_progress' AND archived_at IS NULL AND primary_session_id IS NOT NULL
        AND active_run_id IN (SELECT id FROM todo_runs WHERE status = 'running')
      ORDER BY created_at ASC, id ASC
    `).all() as unknown as TodoRow[]
    return rows.map(row => this.todoFromRow(row))
  }

  /** 保留失败轮次与任务进度，允许用户重试或接手。 */
  failRun(id: string, runId: string, message: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    const normalized = normalizeRequiredText('failure message', message)
    if (current.active_run_id !== runId) throw new PersonalTodoError(`run ${JSON.stringify(runId)} is not active`)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`UPDATE todo_runs SET status = 'failed', finished_at = ? WHERE id = ?`).run(timestamp, runId)
      this.database.prepare(`
        UPDATE todos SET active_run_id = NULL, blocked_reason = NULL, latest_summary = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(normalized, timestamp, id)
      this.appendEvent(id, runId, 'run_failed', normalized, timestamp)
    })
    return this.get(id)
  }

  /** 记录待办主 Agent 会话汇报的进度。 */
  progress(id: string, sessionId: string, message: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    this.requireStatus(current, 'in_progress')
    const runId = this.requireOwnedRun(current, sessionId)
    this.requireRunStatus(current, 'running')
    const normalized = normalizeRequiredText('progress message', message, 2_000)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET latest_summary = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(normalized, timestamp, id)
      this.appendEvent(id, runId, 'progress', normalized, timestamp)
    })
    return this.get(id)
  }

  /** 根据 Agent 提出的用户问题暂停执行中的待办。 */
  block(request: BlockTodoRequest, sessionId: string): Todo {
    this.assertOpen()
    const current = this.requireRow(request.id)
    this.requireStatus(current, 'in_progress')
    const runId = this.requireOwnedRun(current, sessionId)
    this.requireRunStatus(current, 'running')
    const question = normalizeRequiredText('question', request.question)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`UPDATE todo_runs SET status = 'waiting_input' WHERE id = ?`).run(runId)
      this.database.prepare(`
        UPDATE todos SET blocked_reason = ?, latest_summary = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(question, question, timestamp, request.id)
      this.appendEvent(request.id, runId, 'blocked', question, timestamp)
    })
    return this.get(request.id)
  }

  /** 用户回复后恢复被阻塞的待办。 */
  reply(request: ReplyTodoRequest): Todo {
    this.assertOpen()
    const current = this.requireRow(request.id)
    this.requireRunStatus(current, 'waiting_input')
    if (current.active_run_id === null) throw new PersonalTodoError(`todo ${JSON.stringify(request.id)} has no active run`)
    const message = normalizeRequiredText('message', request.message)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`UPDATE todo_runs SET status = 'running' WHERE id = ?`).run(current.active_run_id)
      this.database.prepare(`
        UPDATE todos SET status = 'in_progress', blocked_reason = NULL,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(timestamp, request.id)
      this.appendEvent(request.id, current.active_run_id, 'user_replied', message, timestamp)
    })
    return this.get(request.id)
  }

  /** 提交 Agent 结果，等待用户明确审核。 */
  submitReview(request: SubmitTodoReviewRequest, sessionId: string): Todo {
    this.assertOpen()
    const current = this.requireRow(request.id)
    this.requireStatus(current, 'in_progress')
    const runId = this.requireOwnedRun(current, sessionId)
    this.requireRunStatus(current, 'running')
    const summary = normalizeRequiredText('summary', request.summary)
    const verification = normalizeOptionalText('verification', request.verification)
    const risk = normalizeOptionalText('risk', request.risk)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todo_runs SET status = 'submitted', result_summary = ?, verification = ?, risk = ?, finished_at = ?
        WHERE id = ?
      `).run(summary, verification, risk, timestamp, runId)
      this.database.prepare(`
        UPDATE todos SET latest_summary = ?, blocked_reason = NULL,
          review_round = review_round + 1, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(summary, timestamp, request.id)
      this.appendEvent(request.id, runId, 'review_submitted', summary, timestamp)
    })
    return this.get(request.id)
  }

  /** 持久化用户完成操作；调用方须先协调停止实际 Agent。 */
  approve(id: string): Todo {
    return this.setStatus(id, 'completed')
  }

  setStatus(id: string, status: TodoStatus): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (!STATUS_SET.has(status)) throw new PersonalTodoError('无效的任务状态。')
    if (status === current.status) return this.get(id)
    const run = current.active_run_id === null ? undefined : this.database.prepare('SELECT status FROM todo_runs WHERE id = ?').get(current.active_run_id) as { status: TodoRunStatus } | undefined
    if (run?.status === 'running' || run?.status === 'waiting_input') throw new PersonalTodoError('请先停止 Agent 执行，再修改任务状态。')
    const timestamp = this.now()
    const review = status === 'completed' && run?.status === 'submitted'
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET status = ?, active_run_id = NULL, blocked_reason = NULL, completed_at = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(status, status === 'completed' ? timestamp : null, timestamp, id)
      const labels = { pending: '待办', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }
      this.appendEvent(id, current.active_run_id, review ? 'review_approved' : status === 'cancelled' ? 'cancelled' : 'updated',
        review ? null : `用户将任务标为${labels[status]}`, timestamp)
    })
    return this.get(id)
  }

  stopExecution(id: string, message = 'Agent 执行已停止，任务可由用户继续处理。'): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.active_run_id === null) return this.get(id)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare("UPDATE todo_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('running', 'waiting_input')")
        .run(timestamp, current.active_run_id)
      this.database.prepare('UPDATE todos SET active_run_id = NULL, blocked_reason = NULL, revision = revision + 1, updated_at = ? WHERE id = ?')
        .run(timestamp, id)
      this.appendEvent(id, current.active_run_id, 'updated', message, timestamp)
    })
    return this.get(id)
  }

  /** 在原主会话中创建新一轮执行，处理用户修改意见。 */
  requestChanges(request: RequestTodoChangesRequest, runId: string): Todo {
    this.assertOpen()
    const current = this.requireRow(request.id)
    this.requireRunStatus(current, 'submitted')
    if (current.primary_session_id === null) {
      throw new PersonalTodoError(`todo ${JSON.stringify(request.id)} has no primary session`)
    }
    const feedback = normalizeRequiredText('feedback', request.feedback)
    const timestamp = this.now()
    const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM todo_runs WHERE todo_id = ?
    `).get(request.id) as { sequence: number }
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO todo_runs (
          id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
        ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, NULL, ?, NULL)
      `).run(runId, request.id, sequenceRow.sequence, current.primary_session_id, timestamp)
      this.database.prepare(`
        UPDATE todos SET status = 'in_progress', active_run_id = ?, blocked_reason = NULL,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(runId, timestamp, request.id)
      this.appendEvent(request.id, runId, 'changes_requested', feedback, timestamp)
    })
    return this.get(request.id)
  }

  /** 永久删除待办及其关联记录。 */
  delete(id: string): DeleteTodoResult {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.archived_at === null && current.status !== 'pending' && current.status !== 'completed' && current.status !== 'cancelled') {
      throw new PersonalTodoError(`todo ${JSON.stringify(id)} cannot be deleted while ${current.status}`)
    }
    this.transaction(() => {
      this.database.prepare('DELETE FROM todos WHERE id = ?').run(id)
    })
    return { id, deleted: true }
  }

  /** 将待办移出常规生命周期列表，不改变其状态。 */
  archive(id: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.archived_at !== null) throw new PersonalTodoError(`todo ${JSON.stringify(id)} is already archived`)
    if (current.active_run_id !== null) throw new PersonalTodoError('请先停止或处理 Agent 执行，再归档任务。')
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(timestamp, timestamp, id)
      this.appendEvent(id, null, 'archived', null, timestamp)
    })
    return this.get(id)
  }

  /** 将归档待办恢复到其当前生命周期对应的列表。 */
  restore(id: string): Todo {
    this.assertOpen()
    const current = this.requireRow(id)
    if (current.archived_at === null) throw new PersonalTodoError(`todo ${JSON.stringify(id)} is not archived`)
    const timestamp = this.now()
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET archived_at = NULL, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(timestamp, id)
      this.appendEvent(id, null, 'restored', null, timestamp)
    })
    return this.get(id)
  }

  /** 返回有数量上限的筛选结果页，以及不受筛选影响的状态计数。 */
  list(input: ListTodoInput = {}): TodoListResult {
    this.assertOpen()
    const statuses = input.statuses === undefined
      ? ['pending', 'in_progress'] satisfies TodoStatus[]
      : this.normalizeEnumFilter('statuses', input.statuses, STATUS_SET) as TodoStatus[]
    const priorities = input.priorities === undefined
      ? undefined
      : this.normalizeEnumFilter('priorities', input.priorities, PRIORITY_SET) as TodoPriority[]
    const tags = input.tags === undefined ? [] : normalizeTags(input.tags)
    const dueBefore = input.dueBefore === undefined ? undefined : parseTimestamp('dueBefore', input.dueBefore)
    const search = input.search?.trim()
    if (search !== undefined && search.length > 500) {
      throw new PersonalTodoError('search must contain at most 500 characters')
    }
    const limit = input.limit === undefined
      ? this.config.defaultListLimit
      : positiveSafeInteger('limit', input.limit)
    if (limit > this.config.maxListLimit) {
      throw new PersonalTodoError(`limit cannot exceed ${String(this.config.maxListLimit)}`)
    }
    const offset = input.offset === undefined ? 0 : nonNegativeSafeInteger('offset', input.offset)
    const where: string[] = []
    const parameters: Array<string | number> = []
    where.push(input.archived === true ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL')
    where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`)
    parameters.push(...statuses)
    if (priorities !== undefined) {
      where.push(`t.priority IN (${priorities.map(() => '?').join(', ')})`)
      parameters.push(...priorities)
    }
    for (const tag of tags) {
      where.push('EXISTS (SELECT 1 FROM todo_tags tf WHERE tf.todo_id = t.id AND tf.tag = ?)')
      parameters.push(tag)
    }
    if (dueBefore !== undefined && dueBefore !== null) {
      where.push('t.due_at IS NOT NULL AND t.due_at <= ?')
      parameters.push(dueBefore)
    }
    if (search !== undefined && search.length > 0) {
      const pattern = `%${escapeLike(search.toLocaleLowerCase())}%`
      where.push("(lower(t.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.notes, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.assignee, '')) LIKE ? ESCAPE '\\')")
      parameters.push(pattern, pattern, pattern)
    }
    const predicate = where.join(' AND ')
    const totalRow = this.database.prepare(`SELECT COUNT(*) AS total FROM todos t WHERE ${predicate}`).get(...parameters) as { total: number }
    const rows = this.database.prepare(`
      SELECT t.id, t.title, t.notes, t.assignee, t.status, t.priority, t.due_at, t.primary_session_id,
             t.active_run_id, t.latest_summary, t.blocked_reason, t.review_round, t.revision,
             t.created_at, t.updated_at, t.completed_at, t.archived_at
      FROM todos t
      WHERE ${predicate}
      ORDER BY
        CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        CASE WHEN t.status = 'completed' THEN t.completed_at END DESC,
        CASE WHEN t.status NOT IN ('completed', 'cancelled') AND t.due_at IS NULL THEN 1 ELSE 0 END,
        CASE WHEN t.status NOT IN ('completed', 'cancelled') THEN t.due_at END ASC,
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
        t.created_at DESC,
        t.id ASC
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset) as unknown as TodoRow[]
    const todos = rows.map(row => this.todoFromRow(row))
    return {
      todos,
      total: totalRow.total,
      counts: this.counts(),
      hasMore: offset + todos.length < totalRow.total,
    }
  }

  private normalizeEnumFilter(name: string, values: readonly string[], allowed: ReadonlySet<string>): string[] {
    if (values.length === 0) throw new PersonalTodoError(`${name} must not be empty`)
    const normalized = [...new Set(values)]
    for (const value of normalized) {
      if (!allowed.has(value)) throw new PersonalTodoError(`${name} contains invalid value ${JSON.stringify(value)}`)
    }
    return normalized
  }

  private counts(): TodoCounts {
    const counts = { pending: 0, inProgress: 0, completed: 0, cancelled: 0, archived: 0 }
    const rows = this.database.prepare('SELECT status, COUNT(*) AS count FROM todos WHERE archived_at IS NULL GROUP BY status').all() as {
      status: TodoStatus
      count: number
    }[]
    for (const row of rows) {
      if (row.status === 'pending') counts.pending = row.count
      else if (row.status === 'in_progress') counts.inProgress = row.count
      else if (row.status === 'completed') counts.completed = row.count
      else counts.cancelled = row.count
    }
    counts.archived = (this.database.prepare(
      'SELECT COUNT(*) AS count FROM todos WHERE archived_at IS NOT NULL',
    ).get() as { count: number }).count
    return counts
  }

  /** 释放 SQLite 连接；重复调用不会产生影响。 */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.database.close()
  }
}

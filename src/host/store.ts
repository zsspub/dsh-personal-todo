/** SQLite owner for personal todo validation, ordering, and durable writes. */

import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  CreateTodoInput, DeleteTodoResult, ListTodoInput, Todo, TodoCounts, TodoListResult,
  TodoPriority, TodoStatus, UpdateTodoPatch,
} from '../types.ts'
import { TODO_PRIORITIES, TODO_STATUSES } from '../types.ts'

export const PERSONAL_TODO_SCHEMA_VERSION = 1

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
}

interface TodoRow {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  readonly status: TodoStatus
  readonly priority: TodoPriority
  readonly due_at: number | null
  readonly created_at: number
  readonly updated_at: number
  readonly completed_at: number | null
}

const STATUS_SET = new Set<string>(TODO_STATUSES)
const PRIORITY_SET = new Set<string>(TODO_PRIORITIES)
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u

/** Stable domain failure surfaced through tools and Remote calls. */
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

function normalizeTitle(value: string): string {
  const title = value.trim()
  if (title.length === 0 || title.length > 200) {
    throw new PersonalTodoError('title must contain 1 to 200 characters after trimming')
  }
  return title
}

function normalizeNotes(value: string | null | undefined): string | null {
  if (value == null) return null
  const notes = value.trim()
  if (notes.length > 10_000) throw new PersonalTodoError('notes must contain at most 10000 characters')
  return notes.length === 0 ? null : notes
}

function normalizeStatus(value: string | undefined): TodoStatus {
  const status = value ?? 'pending'
  if (!STATUS_SET.has(status)) throw new PersonalTodoError(`invalid todo status ${JSON.stringify(status)}`)
  return status as TodoStatus
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

/** Synchronous SQLite repository. Each public mutation is one database transaction. */
export class TodoStore {
  private readonly database: DatabaseSync
  private readonly now: () => number
  private readonly createId: () => string
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
    if (row.user_version === 0) this.createSchema()
  }

  private createSchema(): void {
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE todos (
          id           TEXT PRIMARY KEY,
          title        TEXT NOT NULL,
          notes        TEXT,
          status       TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
          priority     TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high')),
          due_at       INTEGER,
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL,
          completed_at INTEGER
        ) STRICT;
        CREATE TABLE todo_tags (
          todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          tag     TEXT NOT NULL,
          PRIMARY KEY (todo_id, tag)
        ) STRICT;
        CREATE INDEX todos_status_due_idx ON todos(status, due_at);
        CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
        CREATE INDEX todo_tags_tag_idx ON todo_tags(tag, todo_id);
        PRAGMA user_version = 1;
      `)
    })
  }

  private assertOpen(): void {
    if (this.closed) throw new PersonalTodoError('personal todo database is closed')
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
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      priority: row.priority,
      dueAt: iso(row.due_at),
      tags: this.tagsFor(row.id),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      completedAt: iso(row.completed_at),
    }
  }

  private find(id: string): TodoRow | undefined {
    return this.database.prepare(`
      SELECT id, title, notes, status, priority, due_at, created_at, updated_at, completed_at
      FROM todos WHERE id = ?
    `).get(id) as TodoRow | undefined
  }

  private requireRow(id: string): TodoRow {
    const row = this.find(id)
    if (row === undefined) throw new PersonalTodoError(`personal todo ${JSON.stringify(id)} was not found`)
    return row
  }

  /** Create and durably return one normalized todo. */
  create(input: CreateTodoInput): Todo {
    this.assertOpen()
    const status = normalizeStatus(input.status)
    const timestamp = this.now()
    const row: TodoRow = {
      id: this.createId(),
      title: normalizeTitle(input.title),
      notes: normalizeNotes(input.notes),
      status,
      priority: normalizePriority(input.priority),
      due_at: parseTimestamp('dueAt', input.dueAt),
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: status === 'completed' ? timestamp : null,
    }
    const tags = normalizeTags(input.tags)
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO todos (id, title, notes, status, priority, due_at, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.title, row.notes, row.status, row.priority, row.due_at,
        row.created_at, row.updated_at, row.completed_at,
      )
      const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)')
      for (const tag of tags) insertTag.run(row.id, tag)
    })
    return { ...this.todoFromRow(row), tags }
  }

  /** Replace supplied mutable fields and return the durable todo. */
  update(id: string, patch: UpdateTodoPatch): Todo {
    this.assertOpen()
    const mutableKeys = ['title', 'notes', 'status', 'priority', 'dueAt', 'tags'] as const
    if (!mutableKeys.some(key => Object.hasOwn(patch, key))) {
      throw new PersonalTodoError('todo update must include at least one mutable field')
    }
    const current = this.requireRow(id)
    const status = Object.hasOwn(patch, 'status') ? normalizeStatus(patch.status) : current.status
    const timestamp = this.now()
    const row: TodoRow = {
      ...current,
      title: Object.hasOwn(patch, 'title') ? normalizeTitle(patch.title as string) : current.title,
      notes: Object.hasOwn(patch, 'notes') ? normalizeNotes(patch.notes) : current.notes,
      status,
      priority: Object.hasOwn(patch, 'priority') ? normalizePriority(patch.priority) : current.priority,
      due_at: Object.hasOwn(patch, 'dueAt') ? parseTimestamp('dueAt', patch.dueAt) : current.due_at,
      updated_at: timestamp,
      completed_at: status === 'completed'
        ? current.status === 'completed' ? current.completed_at : timestamp
        : null,
    }
    const tags = Object.hasOwn(patch, 'tags') ? normalizeTags(patch.tags) : this.tagsFor(id)
    this.transaction(() => {
      this.database.prepare(`
        UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, due_at = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).run(row.title, row.notes, row.status, row.priority, row.due_at, row.updated_at, row.completed_at, id)
      if (Object.hasOwn(patch, 'tags')) {
        this.database.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(id)
        const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)')
        for (const tag of tags) insertTag.run(id, tag)
      }
    })
    return { ...this.todoFromRow(row), tags }
  }

  /** Permanently delete one todo; unknown ids fail instead of reporting a false success. */
  delete(id: string): DeleteTodoResult {
    this.assertOpen()
    this.requireRow(id)
    this.transaction(() => {
      this.database.prepare('DELETE FROM todos WHERE id = ?').run(id)
    })
    return { id, deleted: true }
  }

  /** Return a bounded filtered page and unfiltered status counts. */
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
      where.push("(lower(t.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.notes, '')) LIKE ? ESCAPE '\\')")
      parameters.push(pattern, pattern)
    }
    const predicate = where.join(' AND ')
    const totalRow = this.database.prepare(`SELECT COUNT(*) AS total FROM todos t WHERE ${predicate}`).get(...parameters) as { total: number }
    const rows = this.database.prepare(`
      SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at, t.created_at, t.updated_at, t.completed_at
      FROM todos t
      WHERE ${predicate}
      ORDER BY
        CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        CASE WHEN t.status = 'completed' THEN t.completed_at END DESC,
        CASE WHEN t.status <> 'completed' AND t.due_at IS NULL THEN 1 ELSE 0 END,
        CASE WHEN t.status <> 'completed' THEN t.due_at END ASC,
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
    const counts = { pending: 0, inProgress: 0, completed: 0 }
    const rows = this.database.prepare('SELECT status, COUNT(*) AS count FROM todos GROUP BY status').all() as {
      status: TodoStatus
      count: number
    }[]
    for (const row of rows) {
      if (row.status === 'pending') counts.pending = row.count
      else if (row.status === 'in_progress') counts.inProgress = row.count
      else counts.completed = row.count
    }
    return counts
  }

  /** Release the SQLite handle. Repeated calls are harmless. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.database.close()
  }
}

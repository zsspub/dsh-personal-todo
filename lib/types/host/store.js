/** SQLite owner for personal todo validation, ordering, and durable writes. */
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TODO_PRIORITIES, TODO_STATUSES } from "../types.js";
export const PERSONAL_TODO_SCHEMA_VERSION = 2;
const STATUS_SET = new Set(TODO_STATUSES);
const PRIORITY_SET = new Set(TODO_PRIORITIES);
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
/** Stable domain failure surfaced through tools and Remote calls. */
export class PersonalTodoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PersonalTodoError';
    }
}
function positiveSafeInteger(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new PersonalTodoError(`${name} must be a positive safe integer`);
    }
    return value;
}
function nonNegativeSafeInteger(name, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new PersonalTodoError(`${name} must be a non-negative safe integer`);
    }
    return value;
}
function normalizeRequiredText(name, value, maxLength = 10_000) {
    const text = value.trim();
    if (text.length === 0 || text.length > maxLength) {
        throw new PersonalTodoError(`${name} must contain 1 to ${String(maxLength)} characters after trimming`);
    }
    return text;
}
function normalizeTitle(value) {
    return normalizeRequiredText('title', value, 200);
}
function normalizeNotes(value) {
    if (value == null)
        return null;
    const notes = value.trim();
    if (notes.length > 10_000)
        throw new PersonalTodoError('notes must contain at most 10000 characters');
    return notes.length === 0 ? null : notes;
}
function normalizeOptionalText(name, value) {
    if (value == null)
        return null;
    const text = value.trim();
    if (text.length > 10_000)
        throw new PersonalTodoError(`${name} must contain at most 10000 characters`);
    return text.length === 0 ? null : text;
}
function normalizePriority(value) {
    const priority = value ?? 'none';
    if (!PRIORITY_SET.has(priority))
        throw new PersonalTodoError(`invalid todo priority ${JSON.stringify(priority)}`);
    return priority;
}
function normalizeTags(values) {
    if (values === undefined)
        return [];
    if (values.length > 20)
        throw new PersonalTodoError('tags must contain at most 20 entries');
    const tags = new Set();
    for (const value of values) {
        const tag = value.trim().toLocaleLowerCase();
        if (tag.length === 0 || tag.length > 32) {
            throw new PersonalTodoError('each tag must contain 1 to 32 characters after trimming');
        }
        tags.add(tag);
    }
    return [...tags].sort();
}
function parseTimestamp(name, value) {
    if (value == null)
        return null;
    if (!RFC3339.test(value))
        throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`);
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
        throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`);
    return timestamp;
}
function iso(value) {
    return value === null ? null : new Date(value).toISOString();
}
function escapeLike(value) {
    return value.replace(/[\\%_]/gu, character => `\\${character}`);
}
function assertDatabasePath(path) {
    if (path !== ':memory:' && !isAbsolute(path)) {
        throw new PersonalTodoError('databasePath must be absolute or :memory:');
    }
}
/** Synchronous SQLite repository. Each public mutation is one database transaction. */
export class TodoStore {
    config;
    database;
    now;
    createId;
    createEventId;
    closed = false;
    constructor(config, dependencies = {}) {
        this.config = config;
        assertDatabasePath(config.databasePath);
        positiveSafeInteger('busyTimeoutMs', config.busyTimeoutMs);
        positiveSafeInteger('defaultListLimit', config.defaultListLimit);
        positiveSafeInteger('maxListLimit', config.maxListLimit);
        if (config.defaultListLimit > config.maxListLimit) {
            throw new PersonalTodoError('defaultListLimit cannot exceed maxListLimit');
        }
        this.now = dependencies.now ?? Date.now;
        this.createId = dependencies.createId ?? randomUUID;
        this.createEventId = dependencies.createEventId ?? randomUUID;
        const existed = config.databasePath === ':memory:' || existsSync(config.databasePath);
        if (config.databasePath !== ':memory:') {
            mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
        }
        this.database = new DatabaseSync(config.databasePath, { timeout: config.busyTimeoutMs });
        try {
            if (!existed && config.databasePath !== ':memory:')
                chmodSync(config.databasePath, 0o600);
            this.initialize();
        }
        catch (error) {
            this.database.close();
            this.closed = true;
            throw error;
        }
    }
    initialize() {
        this.database.exec('PRAGMA foreign_keys = ON');
        this.database.exec(`PRAGMA journal_mode = ${this.config.journalMode.toUpperCase()}`);
        this.database.exec(`PRAGMA busy_timeout = ${String(this.config.busyTimeoutMs)}`);
        const row = this.database.prepare('PRAGMA user_version').get();
        if (row.user_version > PERSONAL_TODO_SCHEMA_VERSION) {
            throw new PersonalTodoError(`personal todo database schema ${String(row.user_version)} is newer than supported version ${String(PERSONAL_TODO_SCHEMA_VERSION)}`);
        }
        if (row.user_version === 0)
            this.createSchema();
        else if (row.user_version === 1)
            this.migrateV1();
    }
    createSchema() {
        this.transaction(() => {
            this.database.exec(`
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
          role              TEXT NOT NULL CHECK (role = 'primary'),
          parent_session_id TEXT,
          created_at        INTEGER NOT NULL,
          PRIMARY KEY (todo_id, session_id)
        ) STRICT;
        CREATE TABLE todo_events (
          id         TEXT PRIMARY KEY,
          todo_id    TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          run_id     TEXT REFERENCES todo_runs(id) ON DELETE CASCADE,
          type       TEXT NOT NULL CHECK (type IN ('created', 'updated', 'run_started', 'progress', 'blocked', 'user_replied', 'review_submitted', 'review_approved', 'changes_requested', 'run_failed', 'cancelled')),
          message    TEXT,
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX todos_status_due_idx ON todos(status, due_at);
        CREATE INDEX todos_completed_idx ON todos(completed_at DESC);
        CREATE INDEX todo_tags_tag_idx ON todo_tags(tag, todo_id);
        CREATE INDEX todo_runs_todo_idx ON todo_runs(todo_id, sequence DESC);
        CREATE INDEX todo_events_todo_idx ON todo_events(todo_id, created_at DESC);
        PRAGMA user_version = 2;
      `);
        });
    }
    migrateV1() {
        this.database.exec('PRAGMA foreign_keys = OFF');
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
            role TEXT NOT NULL CHECK (role = 'primary'), parent_session_id TEXT, created_at INTEGER NOT NULL,
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
          PRAGMA user_version = 2;
        `);
            });
        }
        finally {
            this.database.exec('PRAGMA foreign_keys = ON');
        }
    }
    assertOpen() {
        if (this.closed)
            throw new PersonalTodoError('personal todo database is closed');
    }
    transaction(operation) {
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const value = operation();
            this.database.exec('COMMIT');
            return value;
        }
        catch (error) {
            try {
                this.database.exec('ROLLBACK');
            }
            catch (rollbackError) {
                throw new AggregateError([error, rollbackError], 'personal todo transaction and rollback failed');
            }
            throw error;
        }
    }
    tagsFor(id) {
        const rows = this.database.prepare('SELECT tag FROM todo_tags WHERE todo_id = ? ORDER BY tag').all(id);
        return rows.map(row => row.tag);
    }
    todoFromRow(row) {
        return {
            id: row.id,
            title: row.title,
            notes: row.notes,
            status: row.status,
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
        };
    }
    runFromRow(row) {
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
        };
    }
    sessionFromRow(row) {
        return {
            todoId: row.todo_id,
            sessionId: row.session_id,
            role: row.role,
            parentSessionId: row.parent_session_id,
            createdAt: new Date(row.created_at).toISOString(),
        };
    }
    eventFromRow(row) {
        return {
            id: row.id,
            todoId: row.todo_id,
            runId: row.run_id,
            type: row.type,
            message: row.message,
            createdAt: new Date(row.created_at).toISOString(),
        };
    }
    find(id) {
        return this.database.prepare(`
      SELECT id, title, notes, status, priority, due_at, primary_session_id, active_run_id,
             latest_summary, blocked_reason, review_round, revision, created_at, updated_at, completed_at
      FROM todos WHERE id = ?
    `).get(id);
    }
    requireRow(id) {
        const row = this.find(id);
        if (row === undefined)
            throw new PersonalTodoError(`personal todo ${JSON.stringify(id)} was not found`);
        return row;
    }
    requireStatus(row, expected) {
        if (row.status !== expected) {
            throw new PersonalTodoError(`todo ${JSON.stringify(row.id)} must be ${expected}, not ${row.status}`);
        }
    }
    requireOwnedRun(row, sessionId) {
        if (row.primary_session_id !== sessionId) {
            throw new PersonalTodoError(`session ${JSON.stringify(sessionId)} does not own todo ${JSON.stringify(row.id)}`);
        }
        if (row.active_run_id === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(row.id)} has no active run`);
        return row.active_run_id;
    }
    appendEvent(todoId, runId, type, message, timestamp) {
        this.database.prepare(`
      INSERT INTO todo_events (id, todo_id, run_id, type, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(this.createEventId(), todoId, runId, type, message, timestamp);
    }
    /** Return one todo snapshot or fail for an unknown id. */
    get(id) {
        this.assertOpen();
        return this.todoFromRow(this.requireRow(id));
    }
    /** Return one todo with its durable execution history. */
    detail(id) {
        this.assertOpen();
        const todo = this.todoFromRow(this.requireRow(id));
        const runs = this.database.prepare(`
      SELECT id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
      FROM todo_runs WHERE todo_id = ? ORDER BY sequence DESC
    `).all(id);
        const sessions = this.database.prepare(`
      SELECT todo_id, session_id, role, parent_session_id, created_at
      FROM todo_sessions WHERE todo_id = ? ORDER BY created_at ASC
    `).all(id);
        const events = this.database.prepare(`
      SELECT id, todo_id, run_id, type, message, created_at
      FROM todo_events WHERE todo_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200
    `).all(id);
        return {
            todo,
            runs: runs.map(row => this.runFromRow(row)),
            sessions: sessions.map(row => this.sessionFromRow(row)),
            events: events.map(row => this.eventFromRow(row)),
        };
    }
    /** Create and durably return one normalized pending todo. */
    create(input) {
        this.assertOpen();
        const timestamp = this.now();
        const row = {
            id: this.createId(),
            title: normalizeTitle(input.title),
            notes: normalizeNotes(input.notes),
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
        };
        const tags = normalizeTags(input.tags);
        this.transaction(() => {
            this.database.prepare(`
        INSERT INTO todos (
          id, title, notes, status, priority, due_at, primary_session_id, active_run_id,
          latest_summary, blocked_reason, review_round, revision, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.title, row.notes, row.status, row.priority, row.due_at, null, null, null, null, 0, 0, timestamp, timestamp, null);
            const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)');
            for (const tag of tags)
                insertTag.run(row.id, tag);
            this.appendEvent(row.id, null, 'created', null, timestamp);
        });
        return { ...this.todoFromRow(row), tags };
    }
    /** Replace supplied editable fields and return the durable todo. */
    update(id, patch) {
        this.assertOpen();
        const mutableKeys = ['title', 'notes', 'priority', 'dueAt', 'tags'];
        if (!mutableKeys.some(key => Object.hasOwn(patch, key))) {
            throw new PersonalTodoError('todo update must include at least one editable field');
        }
        const current = this.requireRow(id);
        const timestamp = this.now();
        const row = {
            ...current,
            title: Object.hasOwn(patch, 'title') ? normalizeTitle(patch.title) : current.title,
            notes: Object.hasOwn(patch, 'notes') ? normalizeNotes(patch.notes) : current.notes,
            priority: Object.hasOwn(patch, 'priority') ? normalizePriority(patch.priority) : current.priority,
            due_at: Object.hasOwn(patch, 'dueAt') ? parseTimestamp('dueAt', patch.dueAt) : current.due_at,
            revision: current.revision + 1,
            updated_at: timestamp,
        };
        const tags = Object.hasOwn(patch, 'tags') ? normalizeTags(patch.tags) : this.tagsFor(id);
        this.transaction(() => {
            this.database.prepare(`
        UPDATE todos SET title = ?, notes = ?, priority = ?, due_at = ?, revision = ?, updated_at = ? WHERE id = ?
      `).run(row.title, row.notes, row.priority, row.due_at, row.revision, timestamp, id);
            if (Object.hasOwn(patch, 'tags')) {
                this.database.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(id);
                const insertTag = this.database.prepare('INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)');
                for (const tag of tags)
                    insertTag.run(id, tag);
            }
            this.appendEvent(id, current.active_run_id, 'updated', null, timestamp);
        });
        return { ...this.todoFromRow(row), tags };
    }
    /** Claim a pending todo and create its first Agent execution cycle. */
    beginRun(id, runId, sessionId) {
        this.assertOpen();
        const current = this.requireRow(id);
        this.requireStatus(current, 'pending');
        const timestamp = this.now();
        const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM todo_runs WHERE todo_id = ?
    `).get(id);
        this.transaction(() => {
            this.database.prepare(`
        INSERT INTO todo_runs (
          id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
        ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, NULL, ?, NULL)
      `).run(runId, id, sequenceRow.sequence, sessionId, timestamp);
            this.database.prepare(`
        INSERT OR IGNORE INTO todo_sessions (todo_id, session_id, role, parent_session_id, created_at)
        VALUES (?, ?, 'primary', NULL, ?)
      `).run(id, sessionId, timestamp);
            this.database.prepare(`
        UPDATE todos SET status = 'in_progress', primary_session_id = ?, active_run_id = ?,
          latest_summary = NULL, blocked_reason = NULL, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(sessionId, runId, timestamp, id);
            this.appendEvent(id, runId, 'run_started', null, timestamp);
        });
        return this.get(id);
    }
    /** Return a failed initial dispatch to pending while retaining its audit record. */
    failRun(id, runId, message) {
        this.assertOpen();
        const current = this.requireRow(id);
        const normalized = normalizeRequiredText('failure message', message);
        if (current.active_run_id !== runId)
            throw new PersonalTodoError(`run ${JSON.stringify(runId)} is not active`);
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`UPDATE todo_runs SET status = 'failed', finished_at = ? WHERE id = ?`).run(timestamp, runId);
            this.database.prepare(`
        UPDATE todos SET status = 'pending', active_run_id = NULL, latest_summary = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(normalized, timestamp, id);
            this.appendEvent(id, runId, 'run_failed', normalized, timestamp);
        });
        return this.get(id);
    }
    /** Record progress from the todo's primary Agent Session. */
    progress(id, sessionId, message) {
        this.assertOpen();
        const current = this.requireRow(id);
        this.requireStatus(current, 'in_progress');
        const runId = this.requireOwnedRun(current, sessionId);
        const normalized = normalizeRequiredText('progress message', message, 2_000);
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`
        UPDATE todos SET latest_summary = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(normalized, timestamp, id);
            this.appendEvent(id, runId, 'progress', normalized, timestamp);
        });
        return this.get(id);
    }
    /** Pause an in-progress todo on an Agent-authored user question. */
    block(request, sessionId) {
        this.assertOpen();
        const current = this.requireRow(request.id);
        this.requireStatus(current, 'in_progress');
        const runId = this.requireOwnedRun(current, sessionId);
        const question = normalizeRequiredText('question', request.question);
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`UPDATE todo_runs SET status = 'waiting_input' WHERE id = ?`).run(runId);
            this.database.prepare(`
        UPDATE todos SET status = 'blocked', blocked_reason = ?, latest_summary = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(question, question, timestamp, request.id);
            this.appendEvent(request.id, runId, 'blocked', question, timestamp);
        });
        return this.get(request.id);
    }
    /** Resume a blocked todo after the user supplies an answer. */
    reply(request) {
        this.assertOpen();
        const current = this.requireRow(request.id);
        this.requireStatus(current, 'blocked');
        if (current.active_run_id === null)
            throw new PersonalTodoError(`todo ${JSON.stringify(request.id)} has no active run`);
        const message = normalizeRequiredText('message', request.message);
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`UPDATE todo_runs SET status = 'running' WHERE id = ?`).run(current.active_run_id);
            this.database.prepare(`
        UPDATE todos SET status = 'in_progress', blocked_reason = NULL,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(timestamp, request.id);
            this.appendEvent(request.id, current.active_run_id, 'user_replied', message, timestamp);
        });
        return this.get(request.id);
    }
    /** Submit Agent results for explicit user review. */
    submitReview(request, sessionId) {
        this.assertOpen();
        const current = this.requireRow(request.id);
        this.requireStatus(current, 'in_progress');
        const runId = this.requireOwnedRun(current, sessionId);
        const summary = normalizeRequiredText('summary', request.summary);
        const verification = normalizeOptionalText('verification', request.verification);
        const risk = normalizeOptionalText('risk', request.risk);
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`
        UPDATE todo_runs SET status = 'submitted', result_summary = ?, verification = ?, risk = ?, finished_at = ?
        WHERE id = ?
      `).run(summary, verification, risk, timestamp, runId);
            this.database.prepare(`
        UPDATE todos SET status = 'in_review', latest_summary = ?, blocked_reason = NULL,
          review_round = review_round + 1, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(summary, timestamp, request.id);
            this.appendEvent(request.id, runId, 'review_submitted', summary, timestamp);
        });
        return this.get(request.id);
    }
    /** Accept the latest Agent submission as complete. */
    approve(id) {
        this.assertOpen();
        const current = this.requireRow(id);
        this.requireStatus(current, 'in_review');
        const timestamp = this.now();
        this.transaction(() => {
            this.database.prepare(`
        UPDATE todos SET status = 'completed', active_run_id = NULL, completed_at = ?,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(timestamp, timestamp, id);
            this.appendEvent(id, current.active_run_id, 'review_approved', null, timestamp);
        });
        return this.get(id);
    }
    /** Return a reviewed todo to its primary Session in a new execution cycle. */
    requestChanges(request, runId) {
        this.assertOpen();
        const current = this.requireRow(request.id);
        this.requireStatus(current, 'in_review');
        if (current.primary_session_id === null) {
            throw new PersonalTodoError(`todo ${JSON.stringify(request.id)} has no primary session`);
        }
        const feedback = normalizeRequiredText('feedback', request.feedback);
        const timestamp = this.now();
        const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM todo_runs WHERE todo_id = ?
    `).get(request.id);
        this.transaction(() => {
            this.database.prepare(`
        INSERT INTO todo_runs (
          id, todo_id, sequence, status, root_session_id, result_summary, verification, risk, started_at, finished_at
        ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, NULL, ?, NULL)
      `).run(runId, request.id, sequenceRow.sequence, current.primary_session_id, timestamp);
            this.database.prepare(`
        UPDATE todos SET status = 'in_progress', active_run_id = ?, blocked_reason = NULL,
          revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(runId, timestamp, request.id);
            this.appendEvent(request.id, runId, 'changes_requested', feedback, timestamp);
        });
        return this.get(request.id);
    }
    /** Permanently delete one todo and its related records. */
    delete(id) {
        this.assertOpen();
        const current = this.requireRow(id);
        if (current.status !== 'pending' && current.status !== 'completed' && current.status !== 'cancelled') {
            throw new PersonalTodoError(`todo ${JSON.stringify(id)} cannot be deleted while ${current.status}`);
        }
        this.transaction(() => {
            this.database.prepare('DELETE FROM todos WHERE id = ?').run(id);
        });
        return { id, deleted: true };
    }
    /** Return a bounded filtered page and unfiltered status counts. */
    list(input = {}) {
        this.assertOpen();
        const statuses = input.statuses === undefined
            ? ['pending', 'in_progress', 'blocked', 'in_review']
            : this.normalizeEnumFilter('statuses', input.statuses, STATUS_SET);
        const priorities = input.priorities === undefined
            ? undefined
            : this.normalizeEnumFilter('priorities', input.priorities, PRIORITY_SET);
        const tags = input.tags === undefined ? [] : normalizeTags(input.tags);
        const dueBefore = input.dueBefore === undefined ? undefined : parseTimestamp('dueBefore', input.dueBefore);
        const search = input.search?.trim();
        if (search !== undefined && search.length > 500) {
            throw new PersonalTodoError('search must contain at most 500 characters');
        }
        const limit = input.limit === undefined
            ? this.config.defaultListLimit
            : positiveSafeInteger('limit', input.limit);
        if (limit > this.config.maxListLimit) {
            throw new PersonalTodoError(`limit cannot exceed ${String(this.config.maxListLimit)}`);
        }
        const offset = input.offset === undefined ? 0 : nonNegativeSafeInteger('offset', input.offset);
        const where = [];
        const parameters = [];
        where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
        parameters.push(...statuses);
        if (priorities !== undefined) {
            where.push(`t.priority IN (${priorities.map(() => '?').join(', ')})`);
            parameters.push(...priorities);
        }
        for (const tag of tags) {
            where.push('EXISTS (SELECT 1 FROM todo_tags tf WHERE tf.todo_id = t.id AND tf.tag = ?)');
            parameters.push(tag);
        }
        if (dueBefore !== undefined && dueBefore !== null) {
            where.push('t.due_at IS NOT NULL AND t.due_at <= ?');
            parameters.push(dueBefore);
        }
        if (search !== undefined && search.length > 0) {
            const pattern = `%${escapeLike(search.toLocaleLowerCase())}%`;
            where.push("(lower(t.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.notes, '')) LIKE ? ESCAPE '\\')");
            parameters.push(pattern, pattern);
        }
        const predicate = where.join(' AND ');
        const totalRow = this.database.prepare(`SELECT COUNT(*) AS total FROM todos t WHERE ${predicate}`).get(...parameters);
        const rows = this.database.prepare(`
      SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at, t.primary_session_id,
             t.active_run_id, t.latest_summary, t.blocked_reason, t.review_round, t.revision,
             t.created_at, t.updated_at, t.completed_at
      FROM todos t
      WHERE ${predicate}
      ORDER BY
        CASE t.status WHEN 'in_review' THEN 0 WHEN 'blocked' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
        CASE WHEN t.status = 'completed' THEN t.completed_at END DESC,
        CASE WHEN t.status NOT IN ('completed', 'cancelled') AND t.due_at IS NULL THEN 1 ELSE 0 END,
        CASE WHEN t.status NOT IN ('completed', 'cancelled') THEN t.due_at END ASC,
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
        t.created_at DESC,
        t.id ASC
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset);
        const todos = rows.map(row => this.todoFromRow(row));
        return {
            todos,
            total: totalRow.total,
            counts: this.counts(),
            hasMore: offset + todos.length < totalRow.total,
        };
    }
    normalizeEnumFilter(name, values, allowed) {
        if (values.length === 0)
            throw new PersonalTodoError(`${name} must not be empty`);
        const normalized = [...new Set(values)];
        for (const value of normalized) {
            if (!allowed.has(value))
                throw new PersonalTodoError(`${name} contains invalid value ${JSON.stringify(value)}`);
        }
        return normalized;
    }
    counts() {
        const counts = { pending: 0, inProgress: 0, blocked: 0, inReview: 0, completed: 0, cancelled: 0 };
        const rows = this.database.prepare('SELECT status, COUNT(*) AS count FROM todos GROUP BY status').all();
        for (const row of rows) {
            if (row.status === 'pending')
                counts.pending = row.count;
            else if (row.status === 'in_progress')
                counts.inProgress = row.count;
            else if (row.status === 'blocked')
                counts.blocked = row.count;
            else if (row.status === 'in_review')
                counts.inReview = row.count;
            else if (row.status === 'completed')
                counts.completed = row.count;
            else
                counts.cancelled = row.count;
        }
        return counts;
    }
    /** Release the SQLite handle. Repeated calls are harmless. */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.database.close();
    }
}
//# sourceMappingURL=store.js.map

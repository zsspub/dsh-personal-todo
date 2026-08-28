import { n as TODO_STATUSES, t as TODO_PRIORITIES } from "./types-DyWAhxRN.js";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
//#region lib/types/host/store.js
/** SQLite owner for personal todo validation, ordering, and durable writes. */
const PERSONAL_TODO_SCHEMA_VERSION = 1;
const STATUS_SET = new Set(TODO_STATUSES);
const PRIORITY_SET = new Set(TODO_PRIORITIES);
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
/** Stable domain failure surfaced through tools and Remote calls. */
var PersonalTodoError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "PersonalTodoError";
	}
};
function positiveSafeInteger(name, value) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new PersonalTodoError(`${name} must be a positive safe integer`);
	return value;
}
function nonNegativeSafeInteger(name, value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new PersonalTodoError(`${name} must be a non-negative safe integer`);
	return value;
}
function normalizeTitle(value) {
	const title = value.trim();
	if (title.length === 0 || title.length > 200) throw new PersonalTodoError("title must contain 1 to 200 characters after trimming");
	return title;
}
function normalizeNotes(value) {
	if (value == null) return null;
	const notes = value.trim();
	if (notes.length > 1e4) throw new PersonalTodoError("notes must contain at most 10000 characters");
	return notes.length === 0 ? null : notes;
}
function normalizeStatus(value) {
	const status = value ?? "pending";
	if (!STATUS_SET.has(status)) throw new PersonalTodoError(`invalid todo status ${JSON.stringify(status)}`);
	return status;
}
function normalizePriority(value) {
	const priority = value ?? "none";
	if (!PRIORITY_SET.has(priority)) throw new PersonalTodoError(`invalid todo priority ${JSON.stringify(priority)}`);
	return priority;
}
function normalizeTags(values) {
	if (values === void 0) return [];
	if (values.length > 20) throw new PersonalTodoError("tags must contain at most 20 entries");
	const tags = /* @__PURE__ */ new Set();
	for (const value of values) {
		const tag = value.trim().toLocaleLowerCase();
		if (tag.length === 0 || tag.length > 32) throw new PersonalTodoError("each tag must contain 1 to 32 characters after trimming");
		tags.add(tag);
	}
	return [...tags].sort();
}
function parseTimestamp(name, value) {
	if (value == null) return null;
	if (!RFC3339.test(value)) throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`);
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) throw new PersonalTodoError(`${name} must be an RFC 3339 timestamp`);
	return timestamp;
}
function iso(value) {
	return value === null ? null : new Date(value).toISOString();
}
function escapeLike(value) {
	return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}
function assertDatabasePath(path) {
	if (path !== ":memory:" && !isAbsolute(path)) throw new PersonalTodoError("databasePath must be absolute or :memory:");
}
/** Synchronous SQLite repository. Each public mutation is one database transaction. */
var TodoStore = class {
	config;
	database;
	now;
	createId;
	closed = false;
	constructor(config, dependencies = {}) {
		this.config = config;
		assertDatabasePath(config.databasePath);
		positiveSafeInteger("busyTimeoutMs", config.busyTimeoutMs);
		positiveSafeInteger("defaultListLimit", config.defaultListLimit);
		positiveSafeInteger("maxListLimit", config.maxListLimit);
		if (config.defaultListLimit > config.maxListLimit) throw new PersonalTodoError("defaultListLimit cannot exceed maxListLimit");
		this.now = dependencies.now ?? Date.now;
		this.createId = dependencies.createId ?? randomUUID;
		const existed = config.databasePath === ":memory:" || existsSync(config.databasePath);
		if (config.databasePath !== ":memory:") mkdirSync(dirname(config.databasePath), {
			recursive: true,
			mode: 448
		});
		this.database = new DatabaseSync(config.databasePath, { timeout: config.busyTimeoutMs });
		try {
			if (!existed && config.databasePath !== ":memory:") chmodSync(config.databasePath, 384);
			this.initialize();
		} catch (error) {
			this.database.close();
			this.closed = true;
			throw error;
		}
	}
	initialize() {
		this.database.exec("PRAGMA foreign_keys = ON");
		this.database.exec(`PRAGMA journal_mode = ${this.config.journalMode.toUpperCase()}`);
		this.database.exec(`PRAGMA busy_timeout = ${String(this.config.busyTimeoutMs)}`);
		const row = this.database.prepare("PRAGMA user_version").get();
		if (row.user_version > 1) throw new PersonalTodoError(`personal todo database schema ${String(row.user_version)} is newer than supported version ${String(1)}`);
		if (row.user_version === 0) this.createSchema();
	}
	createSchema() {
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
      `);
		});
	}
	assertOpen() {
		if (this.closed) throw new PersonalTodoError("personal todo database is closed");
	}
	transaction(operation) {
		this.database.exec("BEGIN IMMEDIATE");
		try {
			const value = operation();
			this.database.exec("COMMIT");
			return value;
		} catch (error) {
			try {
				this.database.exec("ROLLBACK");
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], "personal todo transaction and rollback failed");
			}
			throw error;
		}
	}
	tagsFor(id) {
		return this.database.prepare("SELECT tag FROM todo_tags WHERE todo_id = ? ORDER BY tag").all(id).map((row) => row.tag);
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
			createdAt: new Date(row.created_at).toISOString(),
			updatedAt: new Date(row.updated_at).toISOString(),
			completedAt: iso(row.completed_at)
		};
	}
	find(id) {
		return this.database.prepare(`
      SELECT id, title, notes, status, priority, due_at, created_at, updated_at, completed_at
      FROM todos WHERE id = ?
    `).get(id);
	}
	requireRow(id) {
		const row = this.find(id);
		if (row === void 0) throw new PersonalTodoError(`personal todo ${JSON.stringify(id)} was not found`);
		return row;
	}
	/** Create and durably return one normalized todo. */
	create(input) {
		this.assertOpen();
		const status = normalizeStatus(input.status);
		const timestamp = this.now();
		const row = {
			id: this.createId(),
			title: normalizeTitle(input.title),
			notes: normalizeNotes(input.notes),
			status,
			priority: normalizePriority(input.priority),
			due_at: parseTimestamp("dueAt", input.dueAt),
			created_at: timestamp,
			updated_at: timestamp,
			completed_at: status === "completed" ? timestamp : null
		};
		const tags = normalizeTags(input.tags);
		this.transaction(() => {
			this.database.prepare(`
        INSERT INTO todos (id, title, notes, status, priority, due_at, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.title, row.notes, row.status, row.priority, row.due_at, row.created_at, row.updated_at, row.completed_at);
			const insertTag = this.database.prepare("INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)");
			for (const tag of tags) insertTag.run(row.id, tag);
		});
		return {
			...this.todoFromRow(row),
			tags
		};
	}
	/** Replace supplied mutable fields and return the durable todo. */
	update(id, patch) {
		this.assertOpen();
		if (![
			"title",
			"notes",
			"status",
			"priority",
			"dueAt",
			"tags"
		].some((key) => Object.hasOwn(patch, key))) throw new PersonalTodoError("todo update must include at least one mutable field");
		const current = this.requireRow(id);
		const status = Object.hasOwn(patch, "status") ? normalizeStatus(patch.status) : current.status;
		const timestamp = this.now();
		const row = {
			...current,
			title: Object.hasOwn(patch, "title") ? normalizeTitle(patch.title) : current.title,
			notes: Object.hasOwn(patch, "notes") ? normalizeNotes(patch.notes) : current.notes,
			status,
			priority: Object.hasOwn(patch, "priority") ? normalizePriority(patch.priority) : current.priority,
			due_at: Object.hasOwn(patch, "dueAt") ? parseTimestamp("dueAt", patch.dueAt) : current.due_at,
			updated_at: timestamp,
			completed_at: status === "completed" ? current.status === "completed" ? current.completed_at : timestamp : null
		};
		const tags = Object.hasOwn(patch, "tags") ? normalizeTags(patch.tags) : this.tagsFor(id);
		this.transaction(() => {
			this.database.prepare(`
        UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, due_at = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).run(row.title, row.notes, row.status, row.priority, row.due_at, row.updated_at, row.completed_at, id);
			if (Object.hasOwn(patch, "tags")) {
				this.database.prepare("DELETE FROM todo_tags WHERE todo_id = ?").run(id);
				const insertTag = this.database.prepare("INSERT INTO todo_tags (todo_id, tag) VALUES (?, ?)");
				for (const tag of tags) insertTag.run(id, tag);
			}
		});
		return {
			...this.todoFromRow(row),
			tags
		};
	}
	/** Permanently delete one todo; unknown ids fail instead of reporting a false success. */
	delete(id) {
		this.assertOpen();
		this.requireRow(id);
		this.transaction(() => {
			this.database.prepare("DELETE FROM todos WHERE id = ?").run(id);
		});
		return {
			id,
			deleted: true
		};
	}
	/** Return a bounded filtered page and unfiltered status counts. */
	list(input = {}) {
		this.assertOpen();
		const statuses = input.statuses === void 0 ? ["pending", "in_progress"] : this.normalizeEnumFilter("statuses", input.statuses, STATUS_SET);
		const priorities = input.priorities === void 0 ? void 0 : this.normalizeEnumFilter("priorities", input.priorities, PRIORITY_SET);
		const tags = input.tags === void 0 ? [] : normalizeTags(input.tags);
		const dueBefore = input.dueBefore === void 0 ? void 0 : parseTimestamp("dueBefore", input.dueBefore);
		const search = input.search?.trim();
		if (search !== void 0 && search.length > 500) throw new PersonalTodoError("search must contain at most 500 characters");
		const limit = input.limit === void 0 ? this.config.defaultListLimit : positiveSafeInteger("limit", input.limit);
		if (limit > this.config.maxListLimit) throw new PersonalTodoError(`limit cannot exceed ${String(this.config.maxListLimit)}`);
		const offset = input.offset === void 0 ? 0 : nonNegativeSafeInteger("offset", input.offset);
		const where = [];
		const parameters = [];
		where.push(`t.status IN (${statuses.map(() => "?").join(", ")})`);
		parameters.push(...statuses);
		if (priorities !== void 0) {
			where.push(`t.priority IN (${priorities.map(() => "?").join(", ")})`);
			parameters.push(...priorities);
		}
		for (const tag of tags) {
			where.push("EXISTS (SELECT 1 FROM todo_tags tf WHERE tf.todo_id = t.id AND tf.tag = ?)");
			parameters.push(tag);
		}
		if (dueBefore !== void 0 && dueBefore !== null) {
			where.push("t.due_at IS NOT NULL AND t.due_at <= ?");
			parameters.push(dueBefore);
		}
		if (search !== void 0 && search.length > 0) {
			const pattern = `%${escapeLike(search.toLocaleLowerCase())}%`;
			where.push("(lower(t.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.notes, '')) LIKE ? ESCAPE '\\')");
			parameters.push(pattern, pattern);
		}
		const predicate = where.join(" AND ");
		const totalRow = this.database.prepare(`SELECT COUNT(*) AS total FROM todos t WHERE ${predicate}`).get(...parameters);
		const todos = this.database.prepare(`
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
    `).all(...parameters, limit, offset).map((row) => this.todoFromRow(row));
		return {
			todos,
			total: totalRow.total,
			counts: this.counts(),
			hasMore: offset + todos.length < totalRow.total
		};
	}
	normalizeEnumFilter(name, values, allowed) {
		if (values.length === 0) throw new PersonalTodoError(`${name} must not be empty`);
		const normalized = [...new Set(values)];
		for (const value of normalized) if (!allowed.has(value)) throw new PersonalTodoError(`${name} contains invalid value ${JSON.stringify(value)}`);
		return normalized;
	}
	counts() {
		const counts = {
			pending: 0,
			inProgress: 0,
			completed: 0
		};
		const rows = this.database.prepare("SELECT status, COUNT(*) AS count FROM todos GROUP BY status").all();
		for (const row of rows) if (row.status === "pending") counts.pending = row.count;
		else if (row.status === "in_progress") counts.inProgress = row.count;
		else counts.completed = row.count;
		return counts;
	}
	/** Release the SQLite handle. Repeated calls are harmless. */
	close() {
		if (this.closed) return;
		this.closed = true;
		this.database.close();
	}
};
//#endregion
//#region lib/types/index.js
/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const DEFAULTS = {
	journalMode: "wal",
	busyTimeoutMs: 5e3,
	defaultListLimit: 50,
	maxListLimit: 200
};
function resolveConfig(config) {
	return {
		databasePath: config.databasePath,
		journalMode: config.journalMode ?? DEFAULTS.journalMode,
		busyTimeoutMs: config.busyTimeoutMs ?? DEFAULTS.busyTimeoutMs,
		defaultListLimit: config.defaultListLimit ?? DEFAULTS.defaultListLimit,
		maxListLimit: config.maxListLimit ?? DEFAULTS.maxListLimit
	};
}
/** Authoritative todo service shared by generated Remote methods and Agent tools. */
let PersonalTodoService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _list_decorators;
	let _create_decorators;
	let _update_decorators;
	let _delete_decorators;
	return class PersonalTodoService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_list_decorators = [Remote];
			_create_decorators = [Remote];
			_update_decorators = [Remote];
			_delete_decorators = [Remote];
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _create_decorators, {
				kind: "method",
				name: "create",
				static: false,
				private: false,
				access: {
					has: (obj) => "create" in obj,
					get: (obj) => obj.create
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _update_decorators, {
				kind: "method",
				name: "update",
				static: false,
				private: false,
				access: {
					has: (obj) => "update" in obj,
					get: (obj) => obj.update
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static Config = z.object({
			databasePath: z.string().required(),
			journalMode: z.union([
				"wal",
				"delete",
				"truncate",
				"persist"
			]).default(DEFAULTS.journalMode),
			busyTimeoutMs: z.number().step(1).min(1).default(DEFAULTS.busyTimeoutMs),
			defaultListLimit: z.number().step(1).min(1).default(DEFAULTS.defaultListLimit),
			maxListLimit: z.number().step(1).min(1).default(DEFAULTS.maxListLimit)
		});
		store = __runInitializers(this, _instanceExtraInitializers);
		/** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
		constructor(ctx, config) {
			super(ctx, "personalTodo");
			this.store = new TodoStore(resolveConfig(config));
			ctx.effect(() => () => {
				this.store.close();
			}, "personal-todo: close sqlite");
		}
		/** List one bounded page. Cancellation is checked before synchronous SQLite work begins. */
		list(request, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.list(request));
		}
		/** Create one durable todo. */
		create(request, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.create(request));
		}
		/** Update one durable todo. */
		update(request, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.update(request.id, request.patch));
		}
		/** Permanently delete one todo. */
		delete(request, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.delete(request.id));
		}
	};
})();
//#endregion
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, PersonalTodoService, PersonalTodoService as default, TodoStore };

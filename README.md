---
summary: SQLite-backed personal todo tools and Web panel for DeepSeek Harness.
read_when:
  - You want durable todos shared across DSH sessions and projects.
  - You are installing or configuring the dsh-personal-todo bundle.
---

# dsh-personal-todo

English | [中文](README.zh.md)

`dsh-personal-todo` is an installable DeepSeek Harness bundle that stores personal todos in SQLite. Four Agent tools and a responsive Web sidebar panel use the same Host service and database.

## Features

- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- `personal_todo_add`, `personal_todo_list`, `personal_todo_update`, and `personal_todo_delete` Agent tools.
- `personalTodo.list`, `create`, `update`, and `delete` Typert Remote methods for the Web client.
- Active/completed views, search, all-tag filtering, create/edit, complete/reopen, refresh, pagination, and delete confirmation.
- Typed English and Chinese client dictionaries.

## Requirements

- DeepSeek Harness `0.1.1-rc.2` Web profile.
- Node.js `^22.19.0 || >=24.0.0`.
- pnpm 11 for development.

## Installation

Install a pinned GitHub revision so the committed `lib/` artifacts are used directly:

```sh
pnpm dsh plugin --profile web add github:zsspub/dsh-personal-todo#<commit-sha>
```

For local development:

```sh
pnpm dsh plugin --profile web add /absolute/path/to/dsh-personal-todo
```

The bundle patch mounts the Host service and tools. Its Web manifest loads the client automatically.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `personal_todo_add` | Create a todo with optional notes, status, priority, due time, and tags. |
| `personal_todo_list` | Filter and page todos; returns matching rows, total, global status counts, and `hasMore`. |
| `personal_todo_update` | Replace any supplied mutable fields; `null` clears notes or due time and `[]` clears tags. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |

Lists show pending and in-progress todos by default. Pass `statuses: ["completed"]` to read completed history. Every supplied tag must match.

## Configuration

The included bundle uses these defaults:

| Field | Default | Meaning |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/personal-todo/todos.sqlite3` | Absolute SQLite file path. |
| `journalMode` | `wal` | SQLite journal mode: `wal`, `delete`, `truncate`, or `persist`. |
| `busyTimeoutMs` | `5000` | Time SQLite waits for a busy writer. |
| `defaultListLimit` | `50` | Page size when callers omit `limit`. |
| `maxListLimit` | `200` | Maximum accepted page size. |

Override the generated plugin entry in the profile patch when deployment policy requires different values. The service rejects relative paths, invalid limits, and databases with a schema newer than it supports.

## Data behavior

Titles are trimmed and limited to 200 characters. Notes are trimmed and limited to 10,000 characters. A todo accepts up to 20 unique lowercase tags of at most 32 characters each. Due times must be RFC 3339 timestamps and are returned in canonical UTC form.

Completing a todo sets `completedAt`; reopening it clears `completedAt`. Completed records remain until an explicit delete. Active ordering prefers in-progress status, earlier due times, higher priority, and newer creation time. Completed ordering uses newest completion time first.

## Development

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs coverage; and verifies package contents with `pnpm pack --dry-run`. Built `lib/` files are committed so a GitHub SHA can be installed without a lifecycle build script.

## License

[MIT](LICENSE)

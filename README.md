---
summary: SQLite-backed personal todo tools and Web panel for DeepSeek Harness.
read_when:
  - You want durable todos shared across DSH sessions and projects.
  - You are installing or configuring the dsh-personal-todo bundle.
---

# dsh-personal-todo

English | [中文](README.zh.md)

`dsh-personal-todo` is an installable DeepSeek Harness bundle that uses personal todos to drive ordinary DSH Agent Sessions. The todo remains the user-facing task, while its root Session records the execution transcript and can be opened on demand.

## Features

- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- One durable root Session per started todo, reused for blocked replies and review changes.
- Automatic discovery of delegated child Sessions, including nested children, as related todo conversations.
- Explicit `pending`, `in_progress`, `blocked`, `in_review`, `completed`, and `cancelled` task states; only user approval completes a task.
- Durable run, Session-link, and activity history alongside the current todo snapshot.
- Agent tools for creation, query, editing, progress, blocking questions, review submission, and deletion.
- A two-pane task center with inline blocked replies, review summaries, change requests, activity history, and conversation navigation.
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
| `personal_todo_progress` | Record a meaningful milestone from the todo's primary Agent Session. |
| `personal_todo_block` | Pause execution and surface one question in the task center. |
| `personal_todo_submit_review` | Submit a summary, verification, and remaining risk for user review. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |

Lists show every active workflow state by default. Pass `statuses: ["completed"]` to read completed history. Lifecycle fields are changed only by start, block, reply, review, approval, and change-request commands; generic editing cannot bypass the review gate.

## Task flow

Creating a todo in the Web task center starts it immediately. Starting any pending todo creates or adopts a deterministic ordinary Session and sends the task brief to its Agent. The Agent may use the deployment's `delegate` tool or an equivalent subagent tool for independent workstreams; every delegated child and nested descendant is attached to the todo when DSH publishes its Session. The Agent reports milestones, blocks on an explicit question when user input is required, and submits results to `in_review`. Approving the submission sets `completed`; requesting changes creates another run in the same root Session and returns the todo to `in_progress`.

## Configuration

The included bundle uses these defaults:

| Field | Default | Meaning |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/personal-todo/todos.sqlite3` | Absolute SQLite file path. |
| `journalMode` | `wal` | SQLite journal mode: `wal`, `delete`, `truncate`, or `persist`. |
| `busyTimeoutMs` | `5000` | Time SQLite waits for a busy writer. |
| `defaultListLimit` | `50` | Page size when callers omit `limit`. |
| `maxListLimit` | `200` | Maximum accepted page size. |
| `agentPreset` | unset | Optional Agent preset for todo-created root Sessions. |

Override the generated plugin entry in the profile patch when deployment policy requires different values. The service rejects relative paths, invalid limits, and databases with a schema newer than it supports.

## Data behavior

Titles are trimmed and limited to 200 characters. Notes are trimmed and limited to 10,000 characters. A todo accepts up to 20 unique lowercase tags of at most 32 characters each. Due times must be RFC 3339 timestamps and are returned in canonical UTC form.

Approving a todo sets `completedAt`. Completed records and their run, Session-link, and activity history remain until an explicit delete. Active ordering surfaces review and blocked items before running and pending work. Older databases migrate in place to the current task and related-conversation schema on first load.

## Development

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs coverage; and verifies package contents with `pnpm pack --dry-run`. Built `lib/` files are committed so a GitHub SHA can be installed without a lifecycle build script.

## License

[MIT](LICENSE)

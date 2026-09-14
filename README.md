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

- 支持面板与 Agent 工具的完整 JSON 导入导出：包含全部待办和历史，重复 ID 跳过，新增执行中待办转为待处理，不自动派发。操作、格式与限制见[数据导入导出](README.zh.md#数据导入导出)。
- Type `@` in chat to browse Pending, In progress, Waiting for reply, or In review categories. Press Tab to drill into todos, then select one to insert a reference. Completed, cancelled, and archived items from More are excluded. Type within a category to search titles, notes, or assignees (up to 50 results); sending resolves the latest todo details. Requires DSH `ui-input-trigger >=0.1.2-rc.1`.
- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- One durable root Session per started todo, reused for blocked replies and review changes.
- Automatic discovery of delegated child Sessions, including nested children, as related todo conversations.
- Process-start recovery for durable in-progress runs, without duplicating work already owned by a running Agent.
- A sidebar attention count for pending todos and work waiting on a user reply or review.
- Explicit `pending`, `in_progress`, `blocked`, `in_review`, `completed`, and `cancelled` task states; users can complete any active task directly, without submitting it for review first.
- Durable run, Session-link, and activity history alongside the current todo snapshot.
- Agent tools for creation, query, editing, progress, blocking questions, review submission, and deletion.
- A native Host right-Sidebar tab that reuses the Host's open, close, fullscreen, resizable-width, and multi-tab behavior. Its content keeps the right-aligned New button, counted active-status tabs, icon-only More menu, assignee-grouped cards, two-line summaries, click-through details, blocked replies, review summaries, change requests, activity history, and conversation navigation. The sidebar action is disabled when no Session is current.
- Todos in any lifecycle state can move to a separate archive view, then return to the matching list or be permanently deleted.
- Typed English and Chinese client dictionaries.

## Requirements

- DeepSeek Harness `0.1.5-rc.1` Web profile with the right-Sidebar tab API.
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
| `personal_todo_add` | Create a todo with optional notes, assignee, status, priority, due time, and tags. Priority defaults to medium when omitted. |
| `personal_todo_list` | Filter and page todos; returns matching rows, total, global status counts, and `hasMore`. |
| `personal_todo_update` | Replace any supplied mutable fields; `null` clears notes, assignee, or due time and `[]` clears tags. |
| `personal_todo_progress` | Record a meaningful milestone from the todo's primary Agent Session. |
| `personal_todo_block` | Pause execution and surface one question in the task center. |
| `personal_todo_submit_review` | Submit a summary, verification, and remaining risk for user review. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |

Lists show every active workflow state and exclude archived records by default. Pass `statuses: ["completed"]` to read completed history. Pass `archived: true` to read archived active records, optionally combined with `statuses` to filter the archive. Lifecycle fields are changed only by start, block, reply, review, approval, and change-request commands; archiving preserves the current lifecycle state, does not interrupt a running Agent, and generic editing cannot change lifecycle fields. The existing `approve({ id })` service/API accepts `pending`, `in_progress`, `blocked`, and `in_review`; completed and cancelled tasks reject completion. In task details, choose Mark complete for the first three states, or Approve for a review submission.

## Task flow

In the Web task center, Create saves a pending todo; Create and start also starts execution immediately. Starting any pending todo creates or adopts a deterministic ordinary Session and sends the task brief to its Agent. The Agent chooses the execution approach and tools, and may work directly or delegate as appropriate; every delegated child and nested descendant is attached to the todo when DSH publishes its Session. The Agent reports milestones, blocks on an explicit question when user input is required, and submits results to `in_review`. The sidebar count surfaces blocked and review-ready work without opening the task center. After a DSH process restart, the plugin resumes durable `in_progress` runs whose Agent is not already running. Approving the submission sets `completed`; requesting changes creates another run in the same root Session and returns the todo to `in_progress`.

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

Titles are trimmed and limited to 200 characters. Notes are trimmed and limited to 10,000 characters. Assignees are optional, trimmed, and limited to 100 characters; unassigned todos appear in a dedicated group after named assignees. A todo accepts up to 20 unique lowercase tags of at most 32 characters each. Due times must be RFC 3339 timestamps and are returned in canonical UTC form.

Completing a todo sets `completedAt`, clears its blocked reason and active Run reference, and preserves its review count and history. Direct completion closes a running or waiting Run as `cancelled` and records an `updated` activity with the user completion message; approving a submission preserves the submitted Run and records `review_approved`. Neither action interrupts an existing Agent; subsequent progress, blocking, or review submissions are rejected for the completed todo, and it is excluded from restart recovery. Archived active todos can also be completed and remain archived. Agent tools continue to submit results for user review. Archiving sets `archivedAt` and removes the record from its normal list; restoring clears `archivedAt` and returns it according to its current lifecycle state. Archiving does not interrupt the Agent, and run, Session-link, and activity history remain until an explicit delete. Active ordering surfaces review and blocked items before running and pending work. Older databases migrate in place to the current task, archive, and related-conversation schema on first load.

## Development

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs coverage; and verifies package contents with `pnpm pack --dry-run`. Built `lib/` files are committed so a GitHub SHA can be installed without a lifecycle build script.

## License

[MIT](LICENSE)

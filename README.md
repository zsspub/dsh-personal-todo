---
summary: SQLite-backed personal todo tools and Web panel for DeepSeek Harness.
read_when:
  - You want durable todos shared across DSH sessions and projects.
  - You are installing or configuring the dsh-personal-todo bundle.
---

# dsh-personal-todo

English | [Chinese](README.zh.md)

`dsh-personal-todo` lets users manage todos themselves or dispatch them to a DSH Agent on demand, without choosing a task type in advance. Todo progress is independent of Agent execution state. See the [Chinese documentation](README.zh.md) for the complete guide.

## Features

- Read-only requests such as “show my todos” use `personal_todo_show`. The tool area retains only the host's compact record, while a complete interactive todo card appears at the end of the turn instead of a Markdown table. The card supports all item actions, scrolling through every result within a fixed height, and opening the right sidebar at a specific todo.
- Historical cards in conversations, the right sidebar, the sidebar count, and `@` references share one client-side data store through Nanostores and React `useSyncExternalStore`. A change in any location is reflected immediately everywhere else. Cards refresh when mounted, when the window regains focus, after a manual refresh, and after successful actions; existing data remains visible if a refresh fails.
- The panel and Agent tools support complete JSON import and export. Exports use version 2, while imports accept versions 1 and 2. Duplicate IDs are skipped, and only newly imported todos with legacy running records are reset to pending. Live execution state is not written to backups, and importing never starts an Agent. See the [Chinese documentation](README.zh.md) for more details.
- `@` references in the chat composer show only pending and in-progress todos. Press Tab to enter the todo list, search by keyword, and retrieve the latest details when sending. This requires DSH `ui-input-trigger >=0.1.2-rc.1`.
- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- Each todo dispatched to an Agent is associated with one persistent root Session, and all follow-up communication stays in the original conversation.
- Automatic discovery of delegated child Sessions, including nested children, as related todo conversations.
- After a service restart, Session state is read without activating an Agent or sending a recovery message.
- The sidebar shows the combined number of unarchived pending and in-progress todos; there is no separate “needs my attention” filter.
- Primary progress uses `pending`, `in_progress`, and `completed`; `cancelled` is a secondary state, and archiving is independent. Agent execution information is displayed separately.
- Session associations and user action history are retained, along with legacy Runs and results for compatibility. New executions do not create Runs.
- Agent tools are limited to creating, querying, editing, deleting, importing, and exporting todos. They do not force synchronization of progress, questions, or review results.
- The panel uses the host's native right Sidebar Tab. Its primary tabs are Pending, In Progress, and Completed; More contains cancelled and archived todos, while Data has a separate menu. Todos can be grouped by assignee, moved through states manually, and linked back to their Sessions. The panel no longer includes a reply box or review workflow.
- Todos in any lifecycle state can move to a separate archive view, then return to the matching list or be permanently deleted.
- Typed English and Chinese client dictionaries.

## Requirements

- A DeepSeek Harness Web profile that supports right Sidebar Tabs, `sessionQuery`, and Agent lifecycle notifications; the implementation targets the `0.1.5-rc.2` interfaces.
- `@deepseek-ai/dsh-client-ui-tool >=0.1.5-rc.2 <0.2.0` and `@deepseek-ai/cordis ^4.0.2`.
- Node.js `^22.19.0 || >=24.0.0`.
- pnpm `11.7.0` for development.

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
| `personal_todo_add` | Create and save a todo without executing it. Supports notes, assignee, priority, due time, and tags; the default priority is medium. |
| `personal_todo_show` | Handle read-only display requests by rendering a live card at the end of the turn. The model adds only a brief summary instead of repeating every item or generating a Markdown table. |
| `personal_todo_list` | Return complete JSON for subsequent Agent editing, deletion, or data processing. Older logs also render the same card. |
| `personal_todo_update` | Replace any supplied mutable fields; `null` clears notes, assignee, or due time and `[]` clears tags. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |
| `personal_todo_export` | Return a complete `{ filename, json }` backup for the host's file tools to save. |
| `personal_todo_import` | Accept `{ json }`, import incrementally, and return the numbers of imported, skipped, and execution-reset todos. |

Lists return pending and in-progress todos by default and exclude archived todos. Conversation cards retain bounded historical snapshots and use their original filters to read current data. Cards with identical filters share complete paginated requests, and the cards themselves do not poll. Cards do not offer creation, duplication, or JSON import and export. Deletion always requires confirmation, and dangerous state changes on a running todo first require confirmation that execution should stop. The `needsAttention` filter and count, along with the `personal_todo_progress`, `personal_todo_block`, and `personal_todo_submit_review` tools, have been removed. General editing cannot change todo progress, and Agent tools cannot confirm completion on the user's behalf. The Remote API retains `setStatus({ id, status }, signal)`, `stop({ id }, signal)`, and `approve`, which is equivalent to marking a todo complete; `reply` and `requestChanges` have been removed.

## Task flow

Creating a todo or manually marking it in progress does not create a Session or send a message. Execution starts only when the user chooses “Dispatch to Agent”; questions, replies, permission confirmations, and results remain in the original conversation. `executionStatus` passively observes `agent/status`, `agent/error`, `agent/disposed`, and `session/event`, projecting `running`, `idle`, `failed`, `stopped`, or `unavailable` in memory only. The end of a turn does not mean the todo is complete, and the plugin does not infer that a reply or review is required. Listeners do not use blocking hooks, write progress summaries, or send messages. Cold Sessions are inspected through the read-only `sessionQuery.readSession` API without activating execution. Users can stop and take over a todo, complete it, cancel it, return it to pending, or archive it; reopening a todo or restarting DSH never starts execution automatically. See the [Chinese documentation](README.zh.md) for more details.

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

Before completing, cancelling, returning, or archiving a todo, the plugin cancels its dedicated root Session and related child Agents, then waits until they are actually idle. If it cannot confirm that they have stopped within 15 seconds, it returns an error without changing todo progress. External changes already made are not rolled back, and some Agents may already have stopped. Do not use a todo's dedicated execution Session for unrelated work. Historical Runs, results, and Session associations are retained; restoring an archived todo or reopening a todo does not restart execution.

The database migrates automatically to schema 6: legacy `blocked` and `in_review` states become `in_progress`, while existing Runs and associations are retained. After upgrading, do not open the same database directly with an older plugin version. The JSON backup version is independent of the database schema; imports support versions 1 and 2, with a 20 MiB limit. **Session associations are not Session backups.** If the original DSH Session no longer exists, importing cannot restore pending replies, review changes, or links to historical conversations. Backups do not contain Session messages, attachments, plugin configuration, or credentials.

## Development

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs coverage; and verifies package contents with `pnpm pack --dry-run`. Built `lib/` files are committed so a GitHub SHA can be installed without a lifecycle build script.

## License

[MIT](LICENSE)

---
summary: SQLite-backed personal todo tools and Web panel for DeepSeek Harness.
read_when:
  - You want durable todos shared across DSH sessions and projects.
  - You are installing or configuring the dsh-personal-todo bundle.
---

# dsh-personal-todo

English | [中文](README.zh.md)

`dsh-personal-todo` 支持用户自行推进待办，也支持按需交给 DSH Agent 执行，无需预先区分任务类型。任务进度与 Agent 执行信息独立，完整使用说明见[中文文档](README.zh.md)。

## Features

- 支持面板与 Agent 工具的完整 JSON 导入导出：导出版本 2，兼容导入版本 1/2。重复 ID 跳过，仅新增且 Agent 正在运行的任务转为待办，人工进行中保持不变。见[数据导入导出](README.zh.md#数据导入导出)。
- 聊天输入框的 `@` 引用仅展示待办和进行中分类，支持按 Tab 进入、关键词搜索和发送时读取最新详情。需要 DSH `ui-input-trigger >=0.1.2-rc.1`。
- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- One durable root Session per started todo, reused for blocked replies and review changes.
- Automatic discovery of delegated child Sessions, including nested children, as related todo conversations.
- 服务重启仅恢复未归档且仍为 `running` 的活动 Run；人工进行中和已停止任务不自动执行。
- 侧栏计数与“需要我处理”筛选仅包含等待用户回复或确认结果的任务。
- 主进度为 `pending`、`in_progress`、`completed`，次级状态为 `cancelled`，归档独立；Agent 执行信息单独展示。
- Durable run, Session-link, and activity history alongside the current todo snapshot.
- Agent tools for creation, query, editing, progress, blocking questions, review submission, and deletion.
- 面板复用宿主右侧 Sidebar Tab，主 Tab 为待办、进行中、已完成，“更多”收纳已取消和归档，“数据”菜单独立。支持负责人分组、手动流转、回复问题、确认结果、继续修改与会话跳转。
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
| `personal_todo_add` | 创建待办，只保存不执行；支持备注、负责人、优先级、截止时间和标签，默认中优先级。 |
| `personal_todo_list` | Filter and page todos; returns matching rows, total, global status counts, and `hasMore`. |
| `personal_todo_update` | Replace any supplied mutable fields; `null` clears notes, assignee, or due time and `[]` clears tags. |
| `personal_todo_progress` | Record a meaningful milestone from the todo's primary Agent Session. |
| `personal_todo_block` | Pause execution and surface one question in the task center. |
| `personal_todo_submit_review` | Submit a summary, verification, and remaining risk for user review. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |
| `personal_todo_export` | 返回 `{ filename, json }` 完整备份，由宿主文件工具保存。 |
| `personal_todo_import` | 接收 `{ json }`，增量导入并返回新增、跳过及执行重置数量。 |

列表默认返回待办和进行中，排除归档。`needsAttention: true` 筛选等待用户回复或确认结果的活动 Run。通用编辑不能修改任务进度，Agent 工具不能代替用户确认完成。Remote 新增 `setStatus({ id, status }, signal)` 和 `stop({ id }, signal)`；原 `approve` 保留，等价于用户设置已完成。

## Task flow

默认创建和手动标为进行中均不创建会话、不发送消息。“交给 Agent”才启动执行，回复和继续修改复用专属主会话。Agent 提问或提交结果后，任务仍为进行中，只改变 `executionStatus`。用户可停止后接手、完成、取消、退回或归档；重开只回待办，不自动执行。详见[任务流程](README.zh.md#任务流程)。

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

完成、取消、退回和归档前先取消专属主会话及关联子 Agent，并等待真正空闲；15 秒内不能确认停止则返回错误，不更改任务进度。已产生的外部修改不会撤销，部分 Agent 可能已停止。不要在专属执行会话中进行无关工作。历史 Run、结果和会话关联保留；归档恢复和任务重开不自动执行。

数据库自动迁移到 schema 6：旧 `blocked`、`in_review` 转为 `in_progress`，原 Run 与关联记录保留。升级后不应使用旧插件直接打开同一数据库。JSON 备份版本独立于数据库 schema，兼容导入版本 1/2，限制 20 MiB。**会话关联不是会话备份**：原 DSH 会话不存在时，待回复、审核修改和历史对话跳转不能靠导入恢复；备份不含会话正文、附件、插件配置或凭证。

## Development

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs coverage; and verifies package contents with `pnpm pack --dry-run`. Built `lib/` files are committed so a GitHub SHA can be installed without a lifecycle build script.

## License

[MIT](LICENSE)

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

- “看看我的待办”之类的纯展示请求使用 `personal_todo_show`；工具执行区只保留宿主的紧凑记录，完整的可交互待办卡片在回答结束后的 turn 尾部展示，而不是 Markdown 表格。卡片支持完整单项操作、固定高度内滚动全部结果，以及打开右侧面板并定位任务。
- 对话中的多张历史卡片、右侧面板、侧栏数量和 `@` 引用通过 Nanostores 与 React `useSyncExternalStore` 共享同一份客户端数据；任一位置修改后其他位置立即同步。卡片在挂载、窗口聚焦、手动刷新和操作成功后刷新，失败时保留已有数据。
- 支持面板与 Agent 工具的完整 JSON 导入导出：导出版本 2，兼容导入版本 1/2。重复 ID 跳过，仅新增且含旧版运行记录的任务转为待办。新实时运行状态不写入备份，任何导入都不会启动 Agent。见[数据导入导出](README.zh.md#数据导入导出)。
- 聊天输入框的 `@` 引用仅展示待办和进行中分类，支持按 Tab 进入、关键词搜索和发送时读取最新详情。需要 DSH `ui-input-trigger >=0.1.2-rc.1`。
- Durable SQLite storage with schema versioning, WAL, foreign keys, a busy timeout, and owner-only filesystem permissions.
- 每个交给 Agent 的待办关联一个主会话，后续沟通统一在原对话中进行。
- Automatic discovery of delegated child Sessions, including nested children, as related todo conversations.
- 服务重启只读会话状态，不激活 Agent、不发送恢复消息。
- 侧栏显示未归档的待办和进行中任务总数，移除“需要我处理”筛选。
- 主进度为 `pending`、`in_progress`、`completed`，次级状态为 `cancelled`，归档独立；Agent 执行信息单独展示。
- 保存会话关联和用户操作历史，兼容保留旧 Run 和结果；新执行不增加 Run。
- Agent 工具仅用于创建、查询、编辑、删除和备份，不再强制同步进度、问题和审核结果。
- 面板复用宿主右侧 Sidebar Tab，主 Tab 为待办、进行中、已完成，“更多”收纳已取消和归档，“数据”菜单独立。支持负责人分组、手动流转与会话跳转，不再提供回复框或审核流程。
- Todos in any lifecycle state can move to a separate archive view, then return to the matching list or be permanently deleted.
- Typed English and Chinese client dictionaries.

## Requirements

- 支持右侧 Sidebar Tab、`sessionQuery` 和 Agent 生命周期通知的 DeepSeek Harness Web profile；按 `0.1.5-rc.2` 接口实现。
- `@deepseek-ai/dsh-client-ui-tool >=0.1.5-rc.2 <0.2.0` and `@deepseek-ai/cordis ^4.0.2`.
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
| `personal_todo_show` | 纯展示请求使用；在回答结束后的 turn 尾部展示实时卡片，模型只补充一句摘要，不逐项复述或生成 Markdown 表格。 |
| `personal_todo_list` | Agent 后续编辑、删除或数据处理时使用，返回完整 JSON；旧日志也会渲染同款卡片。 |
| `personal_todo_update` | Replace any supplied mutable fields; `null` clears notes, assignee, or due time and `[]` clears tags. |
| `personal_todo_delete` | Permanently delete one todo by UUID. |
| `personal_todo_export` | 返回 `{ filename, json }` 完整备份，由宿主文件工具保存。 |
| `personal_todo_import` | 接收 `{ json }`，增量导入并返回新增、跳过及执行重置数量。 |

列表默认返回待办和进行中，排除归档。对话卡片保存有界历史快照并按原筛选读取当前数据；相同筛选共享全量分页请求，卡片本身不轮询。卡片不提供新建、复制或 JSON 导入导出；删除始终确认，运行中任务的危险状态操作先确认停止。已移除 `needsAttention` 筛选与计数，以及 `personal_todo_progress`、`personal_todo_block`、`personal_todo_submit_review` 工具。通用编辑不能修改任务进度，Agent 工具不能代替用户确认完成。Remote 保留 `setStatus({ id, status }, signal)`、`stop({ id }, signal)` 和等价于完成的 `approve`；移除 `reply` 和 `requestChanges`。

## Task flow

默认创建和手动标为进行中均不创建会话、不发送消息。“交给 Agent”才启动执行，问题、回复、权限确认和结果留在原对话。`executionStatus` 被动监听 `agent/status`、`agent/error`、`agent/disposed` 与 `session/event`，仅在内存投影为 `running`、`idle`、`failed`、`stopped` 或 `unavailable`。本轮结束不等于任务完成，不推断待回复或待审核。监听器不使用阻塞 hook、不写进度摘要、不发消息；冷会话通过 `sessionQuery.readSession` 只读查询，不激活执行。用户可停止后接手、完成、取消、退回或归档；重开和重启都不自动执行。详见[任务流程](README.zh.md#任务流程)。

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

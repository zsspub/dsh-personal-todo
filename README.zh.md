---
summary: 为 DeepSeek Harness 提供基于 SQLite 的个人待办工具与 Web 面板。
read_when:
  - 你需要跨 DSH 会话和项目共享持久待办。
  - 你正在安装或配置 dsh-personal-todo Bundle。
---

# dsh-personal-todo

[English](README.md) | 中文

`dsh-personal-todo` 是一个可安装的 DeepSeek Harness Bundle，用个人待办驱动普通 DSH Agent Session。待办是面向用户的任务，主会话保存执行记录并可按需打开。

## 功能

- 使用 schema 版本、WAL、foreign keys、busy timeout 和仅限所有者的文件权限实现持久 SQLite 存储。
- 每个启动的待办拥有一个持久主会话，阻塞回复和审核修改复用该会话。
- 自动识别 Agent 委派的子 Session，并将嵌套子会话作为待办的相关对话保存。
- DSH 进程启动时恢复持久化的执行中 Run，同时避免向仍在运行的 Agent 重复派发。
- 在侧栏入口显示等待用户回复或审核的待办数量。
- 使用 `pending`、`in_progress`、`blocked`、`in_review`、`completed` 和 `cancelled` 状态；只有用户审核能完成任务。
- 在当前待办快照之外持久保存 Run、Session 关联和活动记录。
- 提供创建、查询、编辑、进度、阻塞提问、提交审核和删除 Agent 工具。
- 提供双栏任务中心、待办内回复、审核摘要、修改意见、活动记录和会话跳转。
- 提供 typed 中英文 Client 字典。

## 环境要求

- DeepSeek Harness `0.1.1-rc.2` Web profile。
- Node.js `^22.19.0 || >=24.0.0`。
- 开发环境使用 pnpm 11。

## 安装

安装固定的 GitHub revision，直接使用仓库中提交的 `lib/` 构建产物：

```sh
pnpm dsh plugin --profile web add github:zsspub/dsh-personal-todo#<commit-sha>
```

本地开发时使用：

```sh
pnpm dsh plugin --profile web add /absolute/path/to/dsh-personal-todo
```

Bundle patch 会挂载 Host 服务与工具，Web manifest 会自动加载 Client。

## Agent 工具

| 工具 | 用途 |
| --- | --- |
| `personal_todo_add` | 新建待办，并可设置备注、状态、优先级、截止时间和标签。 |
| `personal_todo_list` | 筛选和分页查询待办，返回匹配记录、总数、全局状态计数和 `hasMore`。 |
| `personal_todo_update` | 替换任意已提供的可变字段；`null` 清空备注或截止时间，`[]` 清空标签。 |
| `personal_todo_progress` | 由待办主 Agent Session 记录一项有意义的进度。 |
| `personal_todo_block` | 暂停执行，并在任务中心显示一个待回答问题。 |
| `personal_todo_submit_review` | 提交完成摘要、验证结果和遗留风险供用户审核。 |
| `personal_todo_delete` | 按 UUID 永久删除一条待办。 |

列表默认显示所有活动状态。传入 `statuses: ["completed"]` 可读取完成历史。生命周期只能通过启动、阻塞、回复、提交审核、审核通过和提出修改意见流转；通用编辑不能绕过审核门禁。

## 任务流程

在 Web 任务中心创建待办会立即开始执行。启动任意待处理待办会创建或接管一个确定的普通 Session，并把任务说明发送给 Agent。Agent 可以使用部署提供的 `delegate` 或等价 subagent 工具拆分独立工作；DSH 发布子 Session 时，插件会把该子会话及其嵌套后代关联到待办。Agent 可以记录进度，在缺少输入时提交明确问题，并把结果流转到 `in_review`。侧栏计数会直接提示等待回复和待审核工作，无需先打开任务中心。DSH 进程重启后，插件会恢复 Agent 尚未运行的持久化 `in_progress` Run。审核通过后进入 `completed`；提出修改意见会在同一个主会话中创建新的 Run，并返回 `in_progress`。

## 配置

内置 Bundle 使用以下默认值：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/personal-todo/todos.sqlite3` | SQLite 文件的绝对路径。 |
| `journalMode` | `wal` | SQLite journal mode，可选 `wal`、`delete`、`truncate` 或 `persist`。 |
| `busyTimeoutMs` | `5000` | SQLite 等待写入锁释放的时间。 |
| `defaultListLimit` | `50` | 调用方未提供 `limit` 时的页大小。 |
| `maxListLimit` | `200` | 允许的最大页大小。 |
| `agentPreset` | 未设置 | 待办创建主会话时可选的 Agent preset。 |

部署策略需要其他值时，可覆盖 profile patch 中生成的插件配置。服务会拒绝相对路径、无效限制和高于当前支持版本的数据库 schema。

## 数据行为

标题会去除首尾空白，最多 200 个字符。备注会去除首尾空白，最多 10,000 个字符。每条待办最多包含 20 个唯一的小写标签，每个标签最多 32 个字符。截止时间必须是 RFC 3339 时间，并以规范 UTC 格式返回。

审核通过会设置 `completedAt`。完成记录及其 Run、Session 关联和活动历史会一直保留，直到显式删除。活动列表优先显示待审核和等待回复的任务，再显示执行中和待处理任务。旧数据库会在首次加载时原地迁移到当前的任务及相关对话 schema。

## 开发

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` 会构建 Host、Typert 和 Web 产物，检查源码与测试类型，执行 lint 和覆盖率测试，并通过 `pnpm pack --dry-run` 验证包内容。仓库提交构建后的 `lib/` 文件，因此可以直接从 GitHub SHA 安装，无需 lifecycle 构建脚本。

## 许可证

[MIT](LICENSE)

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

- 在聊天输入框输入 `@`，先选择待处理、进行中、待回复或待审核分类，按 Tab 进入待办列表，再选中待办插入引用；不展示“更多”中的已完成、已取消和归档。分类内可输入关键词搜索标题、备注或负责人，最多显示 50 项；发送时读取最新待办详情。此入口需要 DSH 的 `ui-input-trigger >=0.1.2-rc.1`。
- 使用 schema 版本、WAL、foreign keys、busy timeout 和仅限所有者的文件权限实现持久 SQLite 存储。
- 每个启动的待办拥有一个持久主会话，阻塞回复和审核修改复用该会话。
- 自动识别 Agent 委派的子 Session，并将嵌套子会话作为待办的相关对话保存。
- DSH 进程启动时恢复持久化的执行中 Run，同时避免向仍在运行的 Agent 重复派发。
- 在侧栏入口显示待处理、等待用户回复或审核的待办数量。
- 使用 `pending`、`in_progress`、`blocked`、`in_review`、`completed` 和 `cancelled` 状态；用户可从任意活动状态直接完成任务，无需先提交审核。
- 在当前待办快照之外持久保存 Run、Session 关联和活动记录。
- 提供创建、查询、编辑、进度、阻塞提问、提交审核和删除 Agent 工具。
- 将任务中心注册为宿主右侧 Sidebar 的原生 Tab，复用宿主的打开、关闭、全屏、拖拽宽度和多 Tab 能力：内容区第一行独立放置右对齐的新建按钮，第二行放置带数量的活动状态 Tab 和仅图标的更多按钮，“更多”菜单收纳已完成、已取消和归档待办；当前状态下的卡片按负责人分组，描述最多显示两行，点击卡片查看详情，并支持待办内回复、审核摘要、修改意见、活动记录和会话跳转。没有当前会话时，侧栏入口保持禁用。
- 任意生命周期状态的待办都可移入独立归档视图，并可恢复到对应列表或永久删除。
- 提供 typed 中英文 Client 字典。

## 环境要求

- 支持右侧 Sidebar Tab API 的 DeepSeek Harness `0.1.5-rc.1` Web profile。
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
| `personal_todo_add` | 新建待办，并可设置备注、负责人、状态、优先级、截止时间和标签；未声明优先级时默认为中优先级。 |
| `personal_todo_list` | 筛选和分页查询待办，返回匹配记录、总数、全局状态计数和 `hasMore`。 |
| `personal_todo_update` | 替换任意已提供的可变字段；`null` 清空备注、负责人或截止时间，`[]` 清空标签。 |
| `personal_todo_progress` | 由待办主 Agent Session 记录一项有意义的进度。 |
| `personal_todo_block` | 暂停执行，并在任务中心显示一个待回答问题。 |
| `personal_todo_submit_review` | 提交完成摘要、验证结果和遗留风险供用户审核。 |
| `personal_todo_delete` | 按 UUID 永久删除一条待办。 |
| `personal_todo_export` | 无参数，返回完整备份的 `{ filename, json }`；保存文件时使用宿主文件工具。 |
| `personal_todo_import` | 接收 `{ json }` 备份内容，返回新增、跳过及转为待处理的数量；不直接读取文件。 |

列表默认显示所有活动状态且排除归档记录。传入 `statuses: ["completed"]` 可读取完成历史，传入 `archived: true` 可读取归档中的活动记录，也可配合 `statuses` 筛选归档状态。生命周期只能通过启动、阻塞、回复、提交审核、审核通过和提出修改意见流转；归档不改变待办的生命周期状态，也不会中断正在执行的 Agent，通用编辑不能修改生命周期字段。现有 `approve({ id })` 服务/API 接受 `pending`、`in_progress`、`blocked` 和 `in_review`；已完成和已取消任务拒绝再次完成。在详情页中，前三种状态可选择“标记完成”，待审核状态可选择“审核通过”。

## 任务流程

在 Web 任务中心选择“创建”会保存为待处理，选择“创建并开始”会立即启动执行。启动任意待处理待办会创建或接管一个确定的普通 Session，并把任务说明发送给 Agent。Agent 根据用户需求和可用能力，自主决定执行方式、工具及是否委派；DSH 发布子 Session 时，插件会把该子会话及其嵌套后代关联到待办。Agent 可以记录进度，在缺少输入时提交明确问题，并把结果流转到 `in_review`。侧栏计数会直接提示等待回复和待审核工作，无需先打开任务中心。DSH 进程重启后，插件会恢复 Agent 尚未运行的持久化 `in_progress` Run。审核通过后进入 `completed`；提出修改意见会在同一个主会话中创建新的 Run，并返回 `in_progress`。

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

标题会去除首尾空白，最多 200 个字符。备注会去除首尾空白，最多 10,000 个字符。负责人可选，去除首尾空白后最多 100 个字符；未设置负责人的待办显示在具名负责人分组之后的“未分配”组。每条待办最多包含 20 个唯一的小写标签，每个标签最多 32 个字符。截止时间必须是 RFC 3339 时间，并以规范 UTC 格式返回。

完成待办会设置 `completedAt`，清空阻塞原因和活动 Run 关联，并保留审核轮次及历史。直接完成会将运行中或等待输入的 Run 以 `cancelled` 结束，记录带有用户完成说明的 `updated` 活动；审核通过会保留已提交的 Run，记录 `review_approved`。两种操作均不会中断已有 Agent；已完成待办会拒绝后续进度、阻塞和提交审核，也不会在重启后恢复执行。归档中的活动待办同样可以完成，并保持归档。Agent 工具继续提交结果供用户审核。归档会设置 `archivedAt` 并把记录移出原列表；恢复会清空 `archivedAt`，记录随当前生命周期状态回到对应列表。归档不会中断 Agent，Run、Session 关联和活动历史会一直保留，直到显式删除。活动列表优先显示待审核和等待回复的任务，再显示执行中和待处理任务。旧数据库会在首次加载时原地迁移到当前的任务、归档和相关对话 schema。

## 数据导入导出

在任务面板“新建待办”旁打开“数据”菜单，选择“导出 JSON”下载 UTF-8 备份；选择“导入 JSON”后先查看文件名、待办总数和执行中数量，确认后才写入。导出始终包含全部状态及归档待办，不受当前筛选、分页和详情最近 200 条活动的限制。导入成功后刷新当前列表和侧栏计数，不切换筛选。

备份格式为 `{ format: "dsh-personal-todo", version: 1, exportedAt, todos }`，其中 `todos` 是包含待办、标签、Run、Session 关联和完整活动历史的 `TodoDetail[]`。备份版本独立于 SQLite schema。导入导出均限制为 20 MiB，超限明确失败，不截断数据；支持空备份。

- 导入采用增量合并：本地已有相同待办 ID 时整项跳过，文件不会覆盖本地修改。重复导入不会产生副本。
- 新导入的 `in_progress` 待办转为 `pending`，清空活动 Run 关联和阻塞原因，对应 Run 以 `cancelled` 结束，记录中文活动说明；保留原会话关联、摘要、历史和归档状态，须手动开始执行。其他状态原样保留，已有本地待办不受影响。
- 完整校验文件格式、字段和引用后，全部新增记录在一个事务中写入。文件内部重复标识，或新增 Run、Event、Session 标识与其他本地待办冲突时，整个导入失败且不留下部分数据。
- **会话关联不是会话备份。** 不包含 DSH 会话正文、附件、插件配置或凭证；原 DSH 会话不存在时，待回复、审核修改和历史对话跳转不能靠此次导入恢复。
- 备份可能含个人信息及任务历史，请妥善保管。Agent 工具交换的是 JSON 内容，不是文件路径；大文件优先使用面板，避免模型上下文或工具输出限制。

typed Remote 提供 `exportData({}, signal)` 和 `importData({ json }, signal)`，分别返回 `{ filename, json }` 和 `{ imported, skipped, resetToPending }`。与 Agent 工具共用相同存储校验和事务规则，不在导入时创建会话、发送消息或恢复 Agent 执行。

## 开发

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` 会构建 Host、Typert 和 Web 产物，检查源码与测试类型，执行 lint 和覆盖率测试，并通过 `pnpm pack --dry-run` 验证包内容。仓库提交构建后的 `lib/` 文件，因此可以直接从 GitHub SHA 安装，无需 lifecycle 构建脚本。

## 许可证

[MIT](LICENSE)

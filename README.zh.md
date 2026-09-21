---
summary: 为 DeepSeek Harness 提供基于 SQLite 的个人待办工具与 Web 面板。
read_when:
  - 你需要跨 DSH 会话和项目共享持久待办。
  - 你正在安装或配置 dsh-personal-todo Bundle。
---

# dsh-personal-todo

[English](README.md) | 中文

`dsh-personal-todo` 是一个可安装的 DeepSeek Harness Bundle。待办可以由用户自行推进，也可以按需交给普通 DSH Agent Session 执行；无需预先选择“人工任务”或“Agent 任务”类型。

## 功能

- 用户说“看看我的待办”等纯展示请求时，Agent 优先调用 `personal_todo_show`；工具执行区只保留宿主的紧凑记录，完整的可交互待办卡片在回答结束后的 turn 尾部展示，不再逐项输出 Markdown 表格。卡片在固定高度内滚动展示全部匹配项，可刷新、编辑、流转状态、交给 Agent、停止并接手、查看对话、取消、归档、恢复和删除，也可打开右侧面板并定位到指定任务。
- Web 客户端使用 Nanostores 建立唯一数据中心，并通过 React `useSyncExternalStore` 订阅；对话中的多张历史卡片、右侧面板、侧栏未完成数量和 `@` 待办引用共享同一套实体、详情、查询缓存和操作状态。任一位置操作成功后，其他位置立即同步。
- 在聊天输入框输入 `@`，先选择待办或进行中分类，按 Tab 进入待办列表，再选中待办插入引用；不展示已完成、已取消和归档。分类内可输入关键词搜索标题、备注或负责人，最多显示 50 项；发送时读取最新待办详情。此入口需要 DSH 的 `ui-input-trigger >=0.1.2-rc.1`。
- 使用 schema 版本、WAL、foreign keys、busy timeout 和仅限所有者的文件权限实现持久 SQLite 存储。
- 每个交给 Agent 的待办关联一个持久主会话，后续沟通直接在原对话中进行。
- 自动识别 Agent 委派的子 Session，并将嵌套子会话作为待办的相关对话保存。
- DSH 重启只恢复状态展示，不激活 Agent、不自动发送消息或续跑。
- 侧栏入口显示未归档的待办与进行中任务总数，不再区分待回复或待审核。
- 主进度为待办 `pending`、进行中 `in_progress`、已完成 `completed`，次级状态为已取消 `cancelled`；归档独立。Agent 执行信息单独展示，不增加主状态。
- 保存任务、会话关联和用户操作历史；旧 Run 和结果保留，新执行不再新增 Run 或同步问题、摘要。
- 提供创建、查询、编辑、删除和 JSON 备份工具；不要求 Agent 调用状态同步工具。
- 将任务中心注册为宿主右侧 Sidebar 原生 Tab，复用宿主的打开、关闭、全屏、拖拽宽度和多 Tab 能力。面板显示待办、进行中、已完成三个主 Tab，“更多”仅收纳已取消和归档；“数据”菜单与状态筛选分离。卡片按负责人分组，详情支持手动流转和查看原对话。没有当前会话时，侧栏入口保持禁用。
- 任意生命周期状态的待办都可移入独立归档视图，并可恢复到对应列表或永久删除。
- 提供 typed 中英文 Client 字典。

## 环境要求

- 支持右侧 Sidebar Tab API、`sessionQuery` 和 Agent 生命周期通知的 DeepSeek Harness Web profile；本次按 `0.1.5-rc.2` 接口实现。
- Web profile 需要 `@deepseek-ai/dsh-client-ui-tool >=0.1.5-rc.2 <0.2.0`；项目使用 `@deepseek-ai/cordis ^4.0.2`。
- Node.js `^22.19.0 || >=24.0.0`。
- 开发环境使用 pnpm `11.7.0`。

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
| `personal_todo_add` | 新建待办，只保存不执行；可设置备注、负责人、优先级、截止时间和标签，未声明优先级时默认为中优先级。 |
| `personal_todo_show` | 纯展示请求使用。在回答结束后的 turn 尾部渲染实时可交互卡片，模型只收到数量摘要，并被要求只补充一句简短说明、不逐项复述或生成 Markdown 表格。 |
| `personal_todo_list` | 供 Agent 后续编辑、删除或数据处理时查询完整 JSON；也为旧会话日志提供同款卡片展示。 |
| `personal_todo_update` | 替换任意已提供的可变字段；`null` 清空备注、负责人或截止时间，`[]` 清空标签。 |
| `personal_todo_delete` | 按 UUID 永久删除一条待办。 |
| `personal_todo_export` | 无参数，返回完整备份的 `{ filename, json }`；保存文件时使用宿主文件工具。 |
| `personal_todo_import` | 接收 `{ json }` 备份内容，返回新增、跳过及转为待处理的数量；不直接读取文件。 |

列表默认返回 `pending` 和 `in_progress`，排除归档。传入 `statuses: ["completed"]` 可读取完成历史；查询全部归档时同时传入 `archived: true` 和四种主进度。通用编辑和 Agent 工具不能代替用户改变任务进度或确认完成。已移除 `personal_todo_progress`、`personal_todo_block`、`personal_todo_submit_review`，以及 `needsAttention` 筛选和计数。

对话卡片保存版本化、大小受限的展示快照，历史回放或刷新失败时仍有内容可看；只要原查询条件可恢复，卡片挂载、窗口重新聚焦、手动刷新和操作成功后都会读取当前数据。相同筛选条件的多张卡片共享全量分页请求和缓存，不重复访问 Remote。卡片不自行轮询；右侧面板可见时仍以 2 秒间隔刷新运行状态。刷新失败会保留已有数据并显示错误，不清空列表。

## 任务流程

默认“创建”只保存待办；“标为进行中”也不会创建会话或发送消息。例如“下班去驿站取快递”可以直接标记完成，也可以先标为进行中。只有“交给 Agent”“创建并交给 Agent”才显式派发任务消息。问题、回复、权限确认和结果全部留在原生对话，待办不维护第二套信息同步流程。

详情操作按当前任务情境收敛：普通待办显示“标记完成 / 交给 Agent / 更多”；执行中显示“查看对话 / 停止并接手 / 更多”；关联会话空闲后显示“标记完成 / 查看对话 / 更多”，再次交给 Agent 收进更多菜单。已完成、已取消任务突出“重新打开”，归档任务突出“恢复”。不再显示回复框、审核或继续修改按钮。低频管理操作收进更多菜单，删除仍需二次确认。

对话卡片不提供新建、复制、JSON 导入或导出，避免在历史消息中混入全局管理入口。表单草稿、菜单开关和确认弹窗只属于当前组件；实体、详情、筛选查询、计数和进行中操作由数据中心统一维护。同一待办正在操作时，其他卡片和面板会禁用重复操作。运行中的任务在完成、退回、取消、归档或停止接手前先显示停止确认；删除始终二次确认。Remote 成功前不提前改变生命周期，失败不会留下错误的乐观状态。

“更新插件功能”交给 Agent 后，任务进入进行中，同时展示执行信息：

| `executionStatus` | 展示 | 任务进度 |
| --- | --- | --- |
| `null` | 不展示 Agent 信息 | 由用户手动管理 |
| `running` | Agent · 正在执行 | 保留当前任务进度 |
| `idle` | Agent · 空闲 | 不代表任务完成或等待用户输入 |
| `failed` | Agent · 执行失败 | 保留当前任务进度 |
| `stopped` | Agent · 执行已停止 | 保留当前任务进度 |
| `unavailable` | Agent · 状态暂不可用 | 不影响任务管理和正常对话 |

执行标识来自主会话的 `agent/status`、`agent/error`、`agent/disposed` 与 `session/event` 通知，仅在内存中投影，不写 SQLite，不调用对话工具，也不使用会阻塞执行的 `agent/turn-stopping` hook。`turn/end` 的 error/max-tokens 显示失败，aborted/interrupted 显示停止，其余显示空闲；不推断业务完成、待回复或待审核。子会话结束不会结束主会话的运行标识。

首次查看冷会话时使用 `sessionQuery.readSession`，不会通过 `resolveAgent` 激活执行。并发读去重，成功结果缓存，失败显示暂不可用并至少间隔 30 秒重试。未结束的历史轮次在没有活动 Agent 时显示停止。宿主实时运行状态优先。任务完成仍由用户决定，重开和恢复归档不会自动执行。

typed Remote 保留 `setStatus({ id, status }, signal)` 和 `stop({ id }, signal)`；`approve({ id }, signal)` 等价于用户设置 `completed`，不再表示审核流程。移除 `reply` 和 `requestChanges`。重复设置相同进度不重复写活动记录。

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

用户显式停止、完成、取消、退回待办和归档前，会先取消该任务专属主会话及关联子 Agent 的执行与排队消息，等待它们真正空闲，再写入状态。若取消失败或 15 秒内无法确认全部停止，则返回错误，不修改任务进度或 Run；部分 Agent 可能已经停止，运行标识会如实反映，用户可以重试。停止不撤销已经产生的外部修改。不要把待办专属执行会话用于无关工作。面板发现主会话运行时先要求停止确认；被动通知监听从不取消或干预对话。

新执行仅保存主会话关联和一次用户交付活动，不新增 Run。旧 Run、问题、结果和活动保留兼容；显式停止会结束旧活动 Run，完成设置 `completedAt`，重开清空该时间。归档设置 `archivedAt`，恢复仅清空归档时间，不自动执行。旧结果作为历史只读展示，不再作为当前运行状态来源。

数据库 schema 6 在首次加载时自动迁移：旧 `blocked`、`in_review` 主状态统一映射到 `in_progress`，原 `waiting_input`、`submitted` Run、归档、负责人、标签、会话和活动记录不变。备份版本独立于 SQLite schema；升级后旧插件不支持 schema 6，不应直接降级打开同一个数据库。

## 数据导入导出

在任务面板“新建待办”旁打开“数据”菜单，选择“导出 JSON”下载 UTF-8 备份；选择“导入 JSON”后先查看文件名、待办总数和旧版运行中记录数，确认后才写入。导出始终包含全部状态及归档待办，不受当前筛选、分页和详情最近 200 条活动的限制。导入成功后刷新当前列表和侧栏计数，不切换筛选。

导出格式为 `{ format: "dsh-personal-todo", version: 2, exportedAt, todos }`，其中 `todos` 包含待办、标签、旧 Run、Session 关联和完整活动历史。备份中的 `executionStatus` 仅为旧持久 Run 的兼容派生值，不包含新的实时运行投影；新关联且无 Run 的任务为 `null`，导入保留人工任务进度但绝不启动会话。导入兼容版本 1 和 2；版本 1 的 `blocked`、`in_review` 映射到进行中。导入导出均限制为 20 MiB，超限明确失败，不截断数据；支持空备份，无需新增数据库迁移。

- 导入采用增量合并：本地已有相同待办 ID 时整项跳过，文件不会覆盖本地修改。重复导入不会产生副本。
- 仅含旧版运行记录（备份中 `executionStatus: "running"`）的新增任务转为 `pending`，清空活动 Run 关联和阻塞原因，对应 Run 以 `cancelled` 结束，记录中文活动说明。其他任务保留进度；会话关联、旧摘要、历史和归档保留。已有本地待办不受影响。
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

---
summary: 为 DeepSeek Harness 提供基于 SQLite 的个人待办工具与 Web 面板。
read_when:
  - 你需要跨 DSH 会话和项目共享持久待办。
  - 你正在安装或配置 dsh-personal-todo Bundle。
---

# dsh-personal-todo

[English](README.md) | 中文

`dsh-personal-todo` 是一个可安装的 DeepSeek Harness Bundle，用 SQLite 存储个人待办。四个 Agent 工具和响应式 Web 侧栏面板共用同一个 Host 服务与数据库。

## 功能

- 使用 schema 版本、WAL、foreign keys、busy timeout 和仅限所有者的文件权限实现持久 SQLite 存储。
- 提供 `personal_todo_add`、`personal_todo_list`、`personal_todo_update` 和 `personal_todo_delete` Agent 工具。
- 为 Web Client 提供 `personalTodo.list`、`create`、`update` 和 `delete` Typert Remote 方法。
- 提供活动/已完成视图、搜索、全部标签匹配、新建编辑、完成重开、刷新、分页和删除确认。
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
| `personal_todo_delete` | 按 UUID 永久删除一条待办。 |

列表默认显示待处理和进行中的待办。传入 `statuses: ["completed"]` 可读取完成历史。提供多个标签时，每个标签都必须匹配。

## 配置

内置 Bundle 使用以下默认值：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/personal-todo/todos.sqlite3` | SQLite 文件的绝对路径。 |
| `journalMode` | `wal` | SQLite journal mode，可选 `wal`、`delete`、`truncate` 或 `persist`。 |
| `busyTimeoutMs` | `5000` | SQLite 等待写入锁释放的时间。 |
| `defaultListLimit` | `50` | 调用方未提供 `limit` 时的页大小。 |
| `maxListLimit` | `200` | 允许的最大页大小。 |

部署策略需要其他值时，可覆盖 profile patch 中生成的插件配置。服务会拒绝相对路径、无效限制和高于当前支持版本的数据库 schema。

## 数据行为

标题会去除首尾空白，最多 200 个字符。备注会去除首尾空白，最多 10,000 个字符。每条待办最多包含 20 个唯一的小写标签，每个标签最多 32 个字符。截止时间必须是 RFC 3339 时间，并以规范 UTC 格式返回。

完成待办会设置 `completedAt`，重开会清空 `completedAt`。完成记录会一直保留，直到显式删除。活动待办依次按进行中状态、较早截止时间、较高优先级和较新创建时间排序；已完成待办按完成时间倒序排列。

## 开发

```sh
pnpm install
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` 会构建 Host、Typert 和 Web 产物，检查源码与测试类型，执行 lint 和覆盖率测试，并通过 `pnpm pack --dry-run` 验证包内容。仓库提交构建后的 `lib/` 文件，因此可以直接从 GitHub SHA 安装，无需 lifecycle 构建脚本。

## 许可证

[MIT](LICENSE)

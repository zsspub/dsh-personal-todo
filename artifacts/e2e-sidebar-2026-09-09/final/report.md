# 侧栏入口真实 E2E 验收

2026-09-09，Asia/Shanghai。使用已登录 Chrome，真实 DSH http://127.0.0.1:3080/，宿主版本 0.1.5-alpha.1-5dda764，深色主题。未使用 mock、未替换浏览器 bundle。

日历通过 DSH plugin add 安装本次构建的 tarball；待办使用既有 link 安装读取最新构建。工作区查看器已从 web profile 的依赖、bundle 和 node_modules 中移除。

## 结果

- 通过：展开侧栏打开待办
- 通过：关闭待办
- 通过：键盘 Enter 打开日历
- 通过：Escape 关闭日历
- 通过：收起后纵向排列且尺寸均为 36px
- 通过：收起后键盘打开待办
- 通过：收起后打开日历
- 通过：刷新后待办日历保留且工作区查看器移除

展开时三入口均为 42px 高、14px 字号、8px 图文间距、12px 圆角，左右 padding 为 8px/10px。收起时均为 36×36px、18px 图标，x=9.75，y 分别为 747、801、855，纵向不重叠。

首次截图发现收起后的横向挤压，已修正两个插件的底部插槽为纵向布局。此目录的截图和录屏均来自修正后的最后一次验收。

## 证据

- [完整录屏](sidebar-entry-e2e.mp4)：通过 Chrome CDP Page.startScreencast 连续采集真实浏览器帧，按原始时间戳编码，无合成 UI。
- [展开入口](01-expanded.png)
- [待办打开](02-todo-open.png)
- [日历打开](03-calendar-open.png)
- [收起入口](04-collapsed.png)
- [刷新恢复](05-refreshed.png)

## 自动检查与范围

待办 pnpm run check 通过，64 项测试；日历 pnpm run check 通过，26 项测试。两个仓库 git diff --check 通过。

仅验证本次入口改动与卸载结果，未创建、修改或执行待办和定时任务，未验证浅色主题、移动端或业务全流程。使用空白新会话并收起历史分组避免录入无关对话；未发送消息。未重启 DSH，未提交或推送。

## 构建标识

- dsh-personal-todo/src/client/PersonalTodoPanel.tsx SHA256：`7ea4148a46e92067280767290cfea5678e30c9607af55de0196219ddf63cf5a9`
- dsh-calendar/src/client/styles.ts SHA256：`6d828ce130eb9b837032636e73d02bafbc42b7c4c58cf3b06def0c1543eeecdf`
- dsh-calendar/src/client/CalendarPanel.tsx SHA256：`dda5175a7a1aa76c0050d13178f683ea1ec1aadd860cff2c729b5c8beac3897e`

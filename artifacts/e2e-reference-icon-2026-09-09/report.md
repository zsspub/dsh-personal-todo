# 待办引用图标验收

2026-09-09，真实 DSH Chrome 深色主题。

- 个人待办分类和候选项使用与侧栏一致的 ListTodo 图形。
- 选择实际待办后，输入框引用标签使用同一图标：通过。
- 选择器仅匹配 personal-todo 来源，文件来源仍使用原生文件图标。
- 插入测试引用后清空输入，未发送消息、未修改待办。
- pnpm run check 通过，64 项测试通过。

[录屏](reference-icon-e2e.mp4) · [引用标签截图](chip.png)

宿主目前只支持 file/folder/session，使用限定来源的 CSS mask 适配；未来宿主调整候选项或引用标签 DOM 时需同步核对。

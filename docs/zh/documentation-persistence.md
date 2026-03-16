[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[返回首页](./documentation.md) | [快捷键说明](./documentation-shortcuts.md) | [对话、附件与命令](./documentation-chat.md) | [会话、Agent 与运行模式](./documentation-sessions.md)

# 本地持久化与恢复

## 本地会保存什么

前端会在浏览器中保存以下内容：

- 当前激活的聊天标签和检查器标签
- 各标签页的消息历史
- 各会话的草稿
- Prompt 历史
- 主题和语言
- 检查器宽度
- 聊天字体大小
- 聊天滚动状态
- Pending chat turn

## 附件如何保存

附件分为两层持久化：

- 轻量引用和会话结构保存在 `localStorage`
- 较大的内容，如图片 `data URL` 和文本附件内容，会在可用时保存在 `IndexedDB`

这带来两个重要恢复能力：

- 已发送的附件通常在刷新后仍能恢复
- 进行中的轮次也能连同附件引用一起恢复

## 刷新恢复的边界

恢复逻辑主要覆盖以下情况：

- 页面在回复进行中刷新
- 本地聊天状态先于 runtime snapshot 恢复
- 后端已经完成，但前端仍只持有本地 pending 占位

如果浏览器阻止 `localStorage` 或 `IndexedDB`，恢复质量会下降。

## 使用说明

- 长任务中刷新页面前，通常不需要手动保存 prompt
- 如果刷新后附件丢失，先检查浏览器是否允许 IndexedDB
- 如果你短暂看到 thinking 占位，随后被最终回复替换，这通常是正常同步过程

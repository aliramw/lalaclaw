[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [对话、附件与命令](./documentation-chat.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 检查器、文件预览与追踪

右侧检查器是 LalaClaw 最有辨识度的部分之一。它现在主要分成四个标签：`Files`、`Artifacts`、`Timeline` 和 `Environment`。

## 文件

`Files` 标签现在分成两个区域：

- `本次会话文件`：继续按 `Created`、`Modified`、`Viewed` 分组展示当前会话涉及的文件
- `workspace 文件`：参考 VS Code 的目录树，从当前 workspace 根目录开始浏览

说明：

- workspace 目录树按层懒加载，不会在首屏递归扫描整个 workspace
- 两个区域在折叠时也会保留数量徽标
- 当没有会话文件时，`本次会话文件` 整块会自动隐藏
- 会话文件和 workspace 文件都支持普通文本与简单 glob 过滤
- 如果目录链只有单一路径，会像 VS Code 的 compact folders 那样合并显示

交互：

- 点击文件打开预览
- 右键文件复制绝对路径
- 右键 workspace 目录可只刷新该目录下一层内容

文件数据不仅来自 OpenClaw transcript，也会合并本地附件、乐观状态中的文件线索，以及当前 workspace 根目录快照。

## Artifacts

`Artifacts` 标签会列出当前会话的助手回复摘要。

你可以：

- 点击摘要跳回对应消息
- 在长对话中快速定位关键回答
- 点击 `查看上下文` 打开当前会话发送给模型的上下文列表

## Timeline

`Timeline` 会按执行轮次聚合记录：

- 轮次标题和时间
- Prompt 摘要与执行结果
- 工具输入、输出和状态
- 该轮任务关联的文件变更
- 派发出的协作关系

它最适合回答这些问题：

- Agent 刚才调用了哪些工具？
- 某个结果是在哪一轮里产生的？
- 哪些文件是在这一轮里改动的？

## 环境

`Environment` 现在是一个组合面板，聚合 OpenClaw 诊断、管理动作、配置能力，以及当前会话的运行时信息，例如：

- 顶部 `OpenClaw 诊断` 摘要，按 `概览`、`连接概况`、`OpenClaw Doctor`、`日志` 分组
- OpenClaw 版本、运行档位、配置路径、当前会话 Agent 工作区目录、Gateway 状态、健康检查地址与日志入口
- 一组本机 OpenClaw 安装/更新面板，可查看安装状态、官方安装指引、更新可用性和受控更新入口
- 一组结构化 OpenClaw 配置项编辑，支持备份、校验、修改前后对比，以及可选重启
- 一组本机 OpenClaw 管理动作，可执行 `status`、`start`、`stop`、`restart`、`doctor repair`
- 当前 runtime transport 与 runtime socket 状态
- 当 runtime 不再走 WebSocket 时，对应的重连次数与 fallback 原因
- 下层按 `会话上下文`、`实时同步`、`Gateway 配置`、`应用`、`其他` 分组展示技术细节

说明：

- 已经提升到顶部诊断摘要的字段，会从下层技术分组里去重，避免出现重复信息
- JSON session key 这类长 value 会被强制包裹在容器内，不再横向溢出
- 环境面板中的绝对文件路径，比如日志文件或配置文件，点击后会复用共享文件预览弹层打开
- 环境面板中的目录路径，比如日志目录或工作区目录，不会走文件预览；它们会显示一个独立的灰色文件夹图标，并在点击后直接在 Finder / Explorer / 系统文件管理器中打开
- 如果本机还没安装 OpenClaw，安装/更新面板会给出官方安装文档链接和官方安装命令，而不是伪装成应用已经能自动完成所有引导
- 如果本机已安装 OpenClaw，安装/更新面板会先展示官方 `openclaw update` dry-run 计划动作，再由你决定是否执行真实更新
- 结构化配置应用前会校验 base hash；如果底层 OpenClaw 配置已被别处修改，界面会提示先重新加载
- 配置应用结果会直接展示变更字段、校验结果，以及备份文件路径或回滚点标签
- 改变运行状态的管理动作需要先确认，随后会在面板里展示结构化命令输出、健康检查和后续建议
- 管理动作执行完成后，检查器会自动刷新当前环境快照，让诊断摘要和技术分组尽快反映最新状态
- 当当前 OpenClaw Gateway 目标是远端而不是本机 loopback 时，本机专属的安装、更新、配置修改和管理动作会在原位禁用，并显示明确提示
- `OpenClaw 操作历史` 现在会持久化到 `~/.config/lalaclaw/openclaw-operation-history.json`，后端重启后也会保留
- 本机与远端配置改动的回滚元数据会持久化到 `~/.config/lalaclaw/openclaw-backups.json`
- 远端快照正文会单独写进 `~/.config/lalaclaw/openclaw-backup-snapshots/` 下的受保护文件；本机配置快照文件仍会落在 `~/.openclaw/openclaw.json` 旁边，命名为 `openclaw.json.backup.<timestamp>`
- 被阻止的远端写操作会追加到同一个历史面板里，方便回看具体拦截了什么、发生时间，以及是否关联备份或回滚标记
- 本机配置写入现在会记录可恢复的备份文件，远端配置写入也可以通过显式授权继续执行；这两类成功写入都可以在确认后从同一个历史面板恢复保存的快照
- 回滚点现在会绑定创建它的 OpenClaw 目标，因此检查器不会再把某个本机或远端目标的备份误恢复到另一个目标上
- 同一个远端提示区现在还会提供恢复引导弹窗，里面给出建议下一步以及官方 OpenClaw 安装、Doctor 与 Gateway 排障文档链接
- 顶部灰色提示文案现在固定由前端国际化提供，用来概括“OpenClaw 诊断、管理动作与当前会话环境信息”；后端不会再直接覆盖这句用户文案

如果行为和预期不符，这通常是最值得先看的面板。

## 文件预览能力

从文件列表、Markdown 链接或图片缩略图进入预览时，支持：

- 文本、JSON 和 Markdown 语法高亮
- Markdown、普通文本和代码类文本可直接在预览里用 Monaco 在线编辑，并支持保存 / 取消
- Markdown front matter 单独渲染
- 已完成 Markdown 回复中的 Mermaid 图渲染，并可通过统一图片预览入口查看
- `csv`、`xls`、`xlsx`、`xlsm` 表格预览
- 在预览层中直接渲染 DOCX
- 当系统装有 LibreOffice 时，把 DOC、PPT、PPTX 转成可预览的 PDF
- 在支持的平台上把 HEIC、HEIF 转成图片预览
- 图片缩放、旋转和重置
- 视频、音频和 PDF 内嵌预览
- 在 VS Code 中打开
- 在 Finder / Explorer / 系统文件管理器中定位

文件预览接口要求绝对路径，因此没有绝对路径的条目通常只能显示名称，无法继续打开。

## 什么时候优先打开检查器

- 回复看起来不对，想核对工具链路
- 想审查 Agent 修改了哪些文件
- 想在长对话里跳回某个关键回答
- 想确认当前是 `mock` 还是真实网关
- 想确认 runtime 当前走的是 `ws` 还是已经回退到 `polling`

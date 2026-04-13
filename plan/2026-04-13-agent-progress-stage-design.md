# Agent 动态进度卡设计

## 背景

当前聊天区在用户发出消息后，会先显示一张静态的 `正在思考…` pending 卡片。但在 `hermes` 等 provider 的实际执行过程中，前端会出现两个体验问题：

- pending 卡片可能在正式回复出现前提前消失，造成明显空窗期
- 即使底层 agent 正在持续执行动作，用户也只能看到固定文案，无法感知“当前在做什么”

用户希望聊天区的中间过程更接近命令行终端的反馈节奏，但展示方式要比原始终端输出更人类友好，不直接暴露底层命令和技术细节。

## 目标

- 让 pending assistant 卡片在整条回复完成前持续存在，不再出现中间空窗
- 用统一的人类友好阶段文案替代静态 `正在思考…`
- 让 `hermes` 和 `openclaw` 共用一套进度展示机制，而不是分成两套 UI
- 保持主聊天区简洁，不把 pending 展示做成调试时间线
- 在刷新、切 tab、runtime catch-up 等场景下保持阶段卡连续性

## 非目标

- 不在主聊天区直接展示原始 CLI 日志、命令名、文件路径或工具参数
- 不新增第二张系统消息或独立“执行日志面板”
- 不在这一轮引入完整时间线、可展开步骤树或工具详情流
- 不要求 `openclaw` 拥有与 `hermes` 完全相同的阶段粒度

## 用户已确认的产品决策

- 中间过程展示使用一套统一机制，`hermes` 和 `openclaw` 均可复用
- 展示文案使用“人类友好”版本，而不是直接显示底层原始终端动作
- 推荐方案为“统一阶段卡片”，保留单张 pending bubble，通过动态阶段文案填平空窗期

## 方案概述

在现有 pending assistant turn 上增加统一的进度状态字段，由 provider 或运行态逻辑提供阶段信息，前端继续复用当前 pending bubble 组件，只把卡片文案升级为动态阶段文案。

整体原则：

- 一条用户消息只对应一张 pending assistant 卡片
- 阶段变化只更新同一张卡片的内容，不新增消息、不重排历史
- 只有正式 assistant 回复开始接管当前 turn 后，pending 卡片才可消失

## 统一状态模型

建议在现有 pending assistant turn 上增加以下字段：

- `progressStage`
- `progressLabel`
- `progressUpdatedAt`

其中：

- `progressStage` 是统一阶段枚举
- `progressLabel` 是最终展示给用户的人类友好文案
- `progressUpdatedAt` 用于判断阶段是否陈旧、超时停留或恢复时取最近状态

### 阶段枚举

首轮阶段统一为五类：

- `thinking`
- `inspecting`
- `executing`
- `synthesizing`
- `finishing`

### 默认展示文案

当前端拿不到 provider 提供的更具体 `progressLabel` 时，按以下默认文案回退：

- `thinking` -> `分析请求…`
- `inspecting` -> `检查上下文…`
- `executing` -> `执行操作…`
- `synthesizing` -> `整理结果…`
- `finishing` -> `写入回复…`

## Provider 归一化策略

### Hermes

`hermes` 优先使用真实中间输出或其他可观察运行信号来推导阶段，但后端不把原始终端文本直接透传到前端。

建议映射规则：

- 刚发起请求、尚未进入具体动作：`thinking`
- 查看目录、读取文件、检查环境：`inspecting`
- 运行命令、修改文件、调用工具：`executing`
- 动作完成，开始组织答案：`synthesizing`
- 最终答案已生成，但正式 assistant 消息尚未接管：`finishing`

如果 `hermes` 能提供更具体但仍人类友好的标签，例如 `检查工作区…`、`查看相关文件…`、`执行命令…`，则优先填入 `progressLabel`。

### OpenClaw

`openclaw` 首轮不追求与 `hermes` 相同的细粒度，只需要将现有运行态映射进同一套阶段。

建议映射规则：

- 请求已发出，但没有首段正文：`thinking`
- 明确存在工具运行、任务执行或活跃操作：`executing`
- 工具结束，等待最终文本汇总：`synthesizing`
- 最终消息即将接管：`finishing`

如果 `openclaw` 当前没有更细阶段信号，允许停留在最近一个可信阶段，不强行伪造更多步骤。

### 统一接口边界

后端向前端暴露的统一字段仅限：

- `progressStage`
- `progressLabel`
- `progressUpdatedAt`

前端不应感知 provider 是 `hermes` 还是 `openclaw`，也不应该在聊天组件内直接解析 provider 专属事件。

## 前端展示设计

### 基本形态

继续使用现有 pending assistant bubble，不新增第二种消息布局。

行为要求：

- 用户发出消息后，pending bubble 立即出现
- 默认显示 `分析请求…`
- 当 `progressStage` 或 `progressLabel` 更新时，原位更新卡片文案
- 不新增新的系统消息，不插入第二张中间态卡片

### 文案优先级

显示顺序为：

1. provider 提供的 `progressLabel`
2. 对应 `progressStage` 的默认文案
3. 现有 `正在思考…` 作为最终兜底

### 空窗期处理

只要当前 turn 尚未被正式 assistant 消息接管，pending bubble 就必须持续显示。

这意味着：

- 内部“思考结束”不等于可移除 pending bubble
- 即使正文尚未开始流入，也应保留最近阶段，例如 `整理结果…` 或 `写入回复…`
- pending bubble 的消失条件应与“正式 assistant 回复接管当前 turn”绑定，而不是仅依赖某个忙碌布尔值

### 长时间停留

当某一阶段停留过久时，允许将文案切换为更安抚式版本，例如：

- `仍在执行操作，请稍候…`
- `仍在整理结果，请稍候…`

本轮只做文案退化，不新增 toast、警告条或红黄状态。

### 正式回复接管

一旦正式 assistant 正文开始流入：

- 正式消息立即接管当前 turn
- pending bubble 结束显示

如果后端已进入最终收尾但正文仍未到达，则 pending bubble 继续停留在 `finishing` 或对应文案，直到正式消息出现。

## 刷新、切 tab 与恢复行为

若 pending turn 在刷新、切 tab、runtime catch-up 后仍处于进行中，恢复逻辑应尽量保留最近一次阶段信息。

恢复顺序建议为：

1. 优先恢复存储中的 `progressLabel`
2. 其次恢复 `progressStage`
3. 最后回退到默认 `正在思考…`

恢复后不应因为缺少首段正文而让 pending bubble 直接消失。

## 错误处理与退化

- 如果 provider 没有阶段信号，保留 pending bubble，并回退到默认思考文案
- 如果阶段信号中断，保留最近一次可信阶段，不回退为空白
- 如果请求失败，由现有错误消息接管，pending bubble 立即结束
- 如果正式 assistant 回复已经存在，则以正式回复为准，避免 pending bubble 与正式消息重复展示

## 对现有实现的影响边界

本设计优先影响以下模块：

- pending turn 状态模型与持久化恢复逻辑
- 聊天区 pending bubble 渲染逻辑
- provider 到统一阶段的归一化层

本轮不应顺手改动：

- chat transcript 的整体消息结构
- 工具卡时间线
- inspector 面板
- IM 会话模型或 tab 模型

## 测试策略

### 控制器级

至少补以下回归：

- 在无正文但 provider 仍处理中时，pending bubble 不会提前消失
- 阶段更新时，同一张 pending bubble 的文案会更新，而不是新增消息
- 刷新或切 tab 后恢复 pending turn 时，最近阶段可以继续展示

### 组件级

至少补以下回归：

- pending bubble 能根据 `progressLabel` 渲染人类友好文案
- 无 `progressLabel` 时会回退到 `progressStage` 默认文案
- 阶段停留过久时能显示安抚式退化文案

### Provider / service 级

至少补以下回归：

- `hermes` 的中间信号可映射到统一阶段
- `openclaw` 的运行态可映射到统一阶段
- provider 没有阶段信号时，状态安全回退而不抛错

### App 级

至少补一条完整发送流程回归，验证：

- 用户发出消息后，pending bubble 持续存在
- 阶段文案可以推进
- 正式回复接管前不会出现空窗

## 风险与缓解

- 风险：`hermes` 中间输出不稳定，难以长期维持精细阶段识别
  - 缓解：统一阶段层保持宽泛，具体 label 可退化到默认文案
- 风险：`openclaw` 阶段粒度较粗，和 `hermes` 体验不完全一致
  - 缓解：前端只展示统一阶段，不追求 provider 等粒度
- 风险：pending bubble 结束条件处理不当，造成重复消息或僵尸卡片
  - 缓解：把“正式 assistant 消息接管当前 turn”作为唯一结束基准，并用 `App` 级回归锁住

## 实施建议

推荐分两步落地：

1. 先把统一阶段模型和 pending bubble 连续显示打通，确保空窗消失
2. 再逐步增强 `hermes` 与 `openclaw` 的阶段归一化精度

这样可以先修正最明显的体验问题，再逐步把阶段文案做得更贴近真实动作。

## 建议结论

采用“统一阶段卡片”方案：

- 一套状态模型
- 一张持续存在的 pending bubble
- `hermes/openclaw` 共用
- 文案人类友好
- provider 无信号时安全退化

这条路径能以最小 UI 扰动解决“思考卡片提前消失 + 中间过程不可见”的核心体验问题。

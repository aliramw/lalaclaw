# LalaClaw 激进重构 - 实施计划

**基于规范**: docs/superpowers/specs/refactor-2026-03-27.md
**创建日期**: 2026-03-27
**状态**: 执行中

---

## 阶段 1：修复测试 ✅

### 步骤 1.1：修复 chat-panel 流式动画测试

**文件**: `src/components/command-center/chat-panel.test.jsx:3250`

**问题**: `data-streaming-tail-dots` 属性未找到

**任务**:
- [ ] 检查 chat-panel.tsx 中流式消息渲染逻辑
- [ ] 确认 `data-streaming-tail-dots` 属性是否正确设置
- [ ] 修复或更新测试断言
- [ ] 验证测试通过

### 步骤 1.2：修复消息状态同步测试

**文件**: `src/features/app/storage/app-storage.test.js`

**问题**: `buildDashboardSettledMessages` 行为变更

**任务**:
- [ ] 检查 `chat-dashboard-session.ts` 实现
- [ ] 理解测试期望 vs 实际行为差异
- [ ] 修复逻辑或更新测试
- [ ] 运行 `npm test` 确认全部通过

**验收**: 所有测试绿色

---

## 阶段 2：拆分大文件 🔨

### 步骤 2.1：拆分 chat-panel.tsx (4979行)

**目标**: 拆分为 6 个文件

**任务**:
- [ ] 提取 `chat-message-list.tsx` - 消息列表渲染
- [ ] 提取 `chat-input-area.tsx` - 输入框和工具栏
- [ ] 提取 `chat-message-bubble.tsx` - 单条消息气泡
- [ ] 提取 `chat-streaming-indicator.tsx` - 流式指示器
- [ ] 提取 `chat-attachment-preview.tsx` - 附件预览
- [ ] 重构 `chat-panel.tsx` 为组合层
- [ ] 同步更新测试文件
- [ ] 验证功能无回归

### 步骤 2.2：拆分 session-overview.tsx (2685行)

**任务**:
- [ ] 提取 `session-model-selector.tsx`
- [ ] 提取 `session-agent-selector.tsx`
- [ ] 提取 `session-status-display.tsx`
- [ ] 重构 `session-overview.tsx` 为组合层
- [ ] 更新测试

### 步骤 2.3：拆分 use-command-center.ts (1839行)

**任务**:
- [ ] 提取 `use-chat-state.ts` - 聊天状态管理
- [ ] 提取 `use-session-sync.ts` - 会话同步
- [ ] 提取 `use-inspector-state.ts` - 检查器状态
- [ ] 重构 `use-command-center.ts` 为编排层
- [ ] 更新测试

**验收**: 所有文件 < 1000 行，测试通过

---

## 阶段 3：性能优化 ⚡

### 步骤 3.1：React 优化

**任务**:
- [ ] 为大组件添加 `React.memo`
- [ ] 使用 `useCallback` 包装回调函数
- [ ] 使用 `useMemo` 缓存计算结果
- [ ] 移除匿名函数 props

### 步骤 3.2：虚拟滚动

**任务**:
- [ ] 安装 `@tanstack/react-virtual`
- [ ] 在消息列表中实现虚拟滚动
- [ ] 测试 1000+ 消息性能

### 步骤 3.3：代码分割

**任务**:
- [ ] Inspector 面板懒加载
- [ ] 文件预览组件懒加载
- [ ] 测量首屏加载时间

**验收**: 首屏 < 2s，1000消息流畅

---

## 阶段 4：视觉统一 🎨

### 步骤 4.1：设计审计

**任务**:
- [ ] 审计间距使用
- [ ] 审计颜色使用
- [ ] 检查暗色模式对比度

### 步骤 4.2：创建设计令牌

**任务**:
- [ ] 创建 `src/lib/design-tokens.ts`
- [ ] 替换硬编码值
- [ ] 验证视觉一致性

**验收**: 无硬编码，视觉统一

---

## 执行顺序

1. **立即开始**: 阶段 1（修复测试）
2. **然后**: 阶段 2.1（拆分 chat-panel）
3. **接着**: 阶段 2.2、2.3（其他拆分）
4. **之后**: 阶段 3（性能优化）
5. **最后**: 阶段 4（视觉统一）

每个阶段完成后提交代码。

---

## 当前状态

- [x] 规范已批准
- [ ] 开始实施阶段 1


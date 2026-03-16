[English](../en/documentation-easter-egg.md) | [中文](../zh/documentation-easter-egg.md) | [日本語](../ja/documentation-easter-egg.md) | [Français](../fr/documentation-easter-egg.md) | [Español](../es/documentation-easter-egg.md) | [Português](../pt/documentation-easter-egg.md)

[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [快捷键说明](./documentation-shortcuts.md)

# 彩蛋

## 入口

左上角品牌区域的 `🦞` 龙虾图标不是单纯装饰，它是一个可以点击的彩蛋入口。

你可以在这里找到它：

- 完整头部布局里，位于 `LalaClaw` 品牌文字左侧
- 紧凑标签布局中也保留了这个可点击的龙虾图标

## 效果

点击后会触发一段穿过页面的龙虾巡游动画：

- 龙虾会从品牌区域出发
- 动画播放期间，原位的静态龙虾会暂时隐藏
- 动画结束后，左上角的龙虾会重新出现

这个彩蛋不会影响会话、聊天状态或检查器数据，它只是一个前端交互细节。

## 交互规则

- 同一时间只会播放一轮巡游动画
- 当一轮动画尚未结束时，重复点击不会叠加新的动画
- 动画层使用 `pointer-events: none`，因此不会阻挡正常界面操作

## 相关页面

- 想看整体布局： [界面总览](./documentation-interface.md)
- 想看演示建议： [产品演示指南](./showcase.md)

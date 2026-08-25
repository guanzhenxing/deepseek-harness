# Agent Note: 插件工作区域

Status: proposed

[English](2026-08-24-plugin-work-areas.md) | 中文

## 问题

DeepSeek Harness 允许 client 插件向现有视图添加界面元素、替换已声明的 single slot，或在 `shell.overlay` 中浮动添加内容。它不允许插件打开完整的主工作区域，同时在旁边保留随附的原生对话。`shell.overlay` 无法要求 `AppFrame` 分配列，重新注册 `conversation` 则会替换随附的占用方及其声明的全部子 slot。若提供再次渲染 `conversation` 的通用出口，就会与[单声明者授权模型](../../implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)冲突，并复制有状态的输入、审批、提问、附件、焦点和详情行为。

这个缺口并非知识管理产品特有。编辑器、笔记本、终端仪表盘、产物预览、数据分析工具及其他插件，都可能需要把自己的主内容放在原生对话旁边。若无 shell 所有的组合方式，每个消费方只能用 overlay 覆盖应用、基于服务实现缩减版聊天 client，或复制私有对话 UI。

## 提案

交付一项变更：由 shell 所有的插件工作区域，以及作为其唯一伴随栏的现有原生对话。该变更不包含产品品牌、知识管理行为、下游存储 marker 或产品专属默认值。

### 定义与不变量

**工作区域**是一个根作用域、插件所有、由 shell 选中的主内容区域。它不是 DSH Workspace、Task Surface、模态框或 overlay。**伴随对话**是由 `AppFrame` 在活动工作区域旁渲染的随附 `conversation` slot 占用方。

实现保留以下不变量：

- `conversation` 保持单一声明者，且最多渲染一次。
- `ui-conversation` 仍是其消息、composer、工具、审批、提问、附件和详情子 slot 的唯一所有方。
- 工作区域插件只导入公共约定；不以值导入方式引用 DSH UI 内部实现。
- `AppFrame` 负责列分配、响应式让步、拖拽柄和伴随栏可见性。
- 同一时刻只有一个工作区域 id 活动；激活是临时查看状态，不是会话或 Workspace 状态。
- 关闭或卸载工作区域会返回普通的完整对话，且不改变当前会话。
- `shell.overlay` 保持现有的浮动、可添加语义，并继续位于所有已分配列之上。

### `shell.workArea` 与布局控制

`ui-layout` 在现有子 slot 旁声明一个新的 list slot。list 允许互不相关的插件独立注册，而 `AppFrame` 只渲染选中的 id：

```ts
interface SlotMap {
  'shell.workArea': {
    kind: 'list'
    scope: 'root'
    owner: WorkAreaOwnerProps
  }
}

interface WorkAreaOwnerProps {
  id: string
  conversation: {
    visible: boolean
    setVisible(visible: boolean): void
  }
  sidebar: {
    visible: boolean
    setVisible(visible: boolean): void
  }
}
```

`ctx.layout` 增加供启动按钮、命令和快捷键使用的命令式激活接口：

```ts
interface ILayout {
  openWorkArea(id: string, options?: { conversationVisible?: boolean; sidebarVisible?: boolean }): void
  closeWorkArea(id: string): void
  setWorkAreaConversationVisible(id: string, visible: boolean): void
  setWorkAreaSidebarVisible(id: string, visible: boolean): void
}
```

约定具有以下精确行为：

- `id` 是工作区域的 list entry id。若当前没有该 id 的活动 `shell.workArea` 胜出项，`openWorkArea` 就抛出异常。
- 打开一个 id 会替换此前活动的工作区域。再次打开活动 id 会更新请求的伴随栏与侧边栏可见性。
- `conversationVisible` 和 `sidebarVisible` 均默认为 `true`。两者都是布局状态，不是插件所有的 CSS 惯例。
- 当另一个工作区域随后变为活动项时，`closeWorkArea`、`setWorkAreaConversationVisible` 和 `setWorkAreaSidebarVisible` 是受 id 保护的空操作。这使陈旧回调与卸载清理无法关闭或改变替代项。
- 若活动 id 在下一次注册对账时缺失，布局会关闭该工作区域。已经成为当前胜出项的同 id HMR 替代项可保留激活状态；持续缺失的 id 不能保持活动。
- 活动 id、伴随栏可见性、侧边栏可见性和拖拽后的伴随栏宽度均为临时状态。刷新后从普通对话布局开始。

第三方注册只使用现有公共机制：

```ts
declare const ctx: {
  slots: {
    inject(name: string, effect: () => () => void): () => void
    register(options: { name: string; id: string }, component: unknown): () => void
  }
  layout: { openWorkArea(id: string): void }
}
declare const ExampleEditor: unknown

ctx.slots.inject('shell.workArea', () => ctx.slots.register(
  { name: 'shell.workArea', id: 'example.editor' },
  ExampleEditor,
))

ctx.layout.openWorkArea('example.editor')
```

### 渲染、布局与生命周期

`AppFrame` 将 `shell.workArea` 加入子声明和 `PropsRenderSlots` 授权。当 `activeId` 已定义时，它调用 `renderSlot('shell.workArea', owner, { only: activeId })`；它不会在没有 `only` 的情况下调用 list renderer，因为那会渲染全部已注册工作区域。工作区域子树可随激活挂载和卸载。现有 `renderSlot('conversation', {})` 仍是唯一的对话渲染调用，并在 CSS grid 于普通列和伴随列之间移动它时保持同一 React 树位置。

没有活动工作区域时，当前的 sidebar / conversation / details 布局保持不变。存在活动工作区域且伴随栏可见时，逻辑顺序为 sidebar / work area / conversation / details。details 首先让步并自动关闭，从而保留现有策略。随后伴随对话保持在 `ui-layout` 所有的最小、默认与最大宽度范围内，工作区域获得余下的中心宽度。在更窄的 frame 中，现有 sidebar 自动收起仍会应用，details 保持关闭，工作区域可先于伴随对话被压缩。`sidebarVisible: false` 则使用零宽、`inert` 且 `aria-hidden` 的侧边栏列，不会改变用户保存的侧边栏偏好。shell 提供原生分隔线和调整大小手柄；工作区域 entry 接收可见性回调，但不能选择断点或原始列宽。可选的 `shell.workArea.companionHeader` entry 使用其工作区域 id，并且只会在该 id 活动且伴随栏可见时渲染。frame 不提供内建 header 控件。

伴随栏隐藏时，`AppFrame` 不会在零宽可交互树中渲染 `conversation` 或 `details` 占用方。再次显示时会重新渲染相同的已注册占用方，绝不会生成第二份。只要注册仍存活，会话作用域 store 就继续由 slot runtime 所有并缓存，因此权威对话状态和草稿会保留；组件局部的滚动、焦点、选择或已打开 popover 状态可能重置，且不承诺跨显式隐藏保留。关闭带有可见伴随栏的工作区域只改变 grid 放置，因此会话树保持挂载。

details 列继续与唯一的对话挂载配对。隐藏伴随栏会关闭 details。若伴随栏隐藏时调用 `openDetails()`，布局会以原子方式同时打开伴随栏和 details；它绝不会记录不可见的可交互面板。details 绝不能在工作区域背后或被覆盖的 `shell.overlay` 层中打开。

`LayoutController` 通过现有 slot 注册表观察 `shell.workArea` 注册变化。它依据当前胜出项验证激活、清除对账时仍缺失的 id，并在 dispose 时解除存储 action 与订阅。HMR 替换可保留同 id 胜出项，但不能留下陈旧的活动 id、回调、监听器或列。

### 包与文件所有权

预期实现范围有意保持狭窄：

| 变更 | 所属文件或包 | 必需工作 |
|---|---|---|
| 工作区域 slot 与公共类型 | `packages/client/ui-layout/src/client/index.ts` | 添加 `shell.workArea`、`WorkAreaOwnerProps`、子声明和渲染授权。 |
| 可选伴随栏 header | `packages/client/ui-layout/src/client/index.ts`、`AppFrame.tsx` | 添加 `shell.workArea.companionHeader`；按活动工作区域 id 过滤 entry，并且不提供内建控件。 |
| 激活与清理 | `packages/client/ui-layout/src/client/service.ts`、`stores.ts` | 添加受 id 保护的 action、注册对账、伴随栏可见性和临时宽度状态。 |
| 布局渲染 | `packages/client/ui-layout/src/client/AppFrame.tsx`、`AppFrame.module.css`、`columns.ts` | 渲染选中的工作区域，保持一次对话挂载，增加分栏布局、控制与让步。 |
| 布局验证 | `packages/client/ui-layout/tests/*` | 覆盖注册、服务语义、store action、布局、渲染次数、卸载和 HMR 形态替换。 |
| Shell 约定文档 | `packages/client/ui-layout/README.md` 及对侧文件、runtime slot 注释、生成的 slot 目录 | 记录新座位，不改变 slot 引擎。 |

该变更不要求改变 `ui-slots`、`ui-renderer` 或 `ui-conversation` 的行为。只有仓库工具要求时，这些包才可接收注释、类型图或生成文档更新。若提议的实现增加第二个对话 renderer、导出私有对话组件，或削弱子 slot 授权，就超出范围。

### 下游适配器

下游知识管理插件在 `shell.workArea` 中注册整个工作台，替换原有 `shell.overlay` 注册，并调用 `ctx.layout.openWorkArea('innovation.pkm')`。其 Agent 开关委托给 `setWorkAreaConversationVisible`；现有笔记操作继续由插件所有。只有原生伴随栏通过集成测试后，插件才删除缩减版消息 renderer、模型菜单、命令菜单、审批提示和自定义 composer。品牌 mark、“PKM 工作台”名称、笔记注入和快捷键策略仍留在下游。

由于伴随栏就是普通 `conversation` 占用方，fork rebase 到后续 DSH 版本后，消息卡片、工具树、审批、提问、附件、模型、命令或 composer 的升级会被自动消费。这是源码复用，不是源码复制。它不承诺 rebase 无冲突：`AppFrame`、`conversation` slot 约定或列策略的变化可能需要适配，而组合测试就是兼容性门禁。

### 交付顺序

fork 按以下顺序携带小型、可审查提交：

1. 添加 `shell.workArea` 约定和受 id 保护的布局状态。
2. 在唯一原生对话旁渲染选中的工作区域，并添加布局控制。
3. 添加组合生命周期、对话身份、details 与 HMR 替换测试；更新配对文档。
4. 集成一个不含产品品牌的外部样例插件。

该系列必须能独立构建和发布。

## 考虑过的替代方案

**公开 `ConversationSurface` 或任意 `SlotOutlet`。** 第一版否决。它为当前通过声明授予独占子项所有权的 slot 引入第二个渲染权限，并立即产生两个实时 composer、审批控件、提问控件、附件 hub、document 监听器、滚动 store 和 details 目标的正确性问题。未来的 portable-surface 原语需要自身的跨领域需求与生命周期模型；本提案不会为解决一个布局用例而削弱当前 slot 不变量。

**导出或复制 `ConversationRoot`、消息卡片、工具与 composer 组件。** 否决。它们的 props 由私有插件 store 和注入接口组装，直接值导入违反 client 包纯度，复制则把每次上游 UI 变化变成手工合并。MIT 允许复制，但不会让复制成为合适的维护边界。

**在公共会话服务之上保留缩减版聊天 UI。** 可作为临时下游回退，但作为目标被否决。若不重新实现，它无法继承原生审批、提问、附件、命令、模型、工具详情、无障碍与交互变化。

**把工作台放在 `shell.overlay`，并在原生页面之上可视放置自定义聊天面板。** 作为通用约定被否决。overlay 既不所有空间分配，也不所有原生 details 目标，还可能使被覆盖的可交互 UI 继续挂载在下方。它仍适用于 toast、badge、模态框和真正的浮动表面。

**从下游插件替换整个 `root` 或 `conversation` slot。** 否决。替换会移除随附 AppFrame 或对话子 slot，并把核心 UI 的永久所有权转移给消费方。

**向 fork 添加产品品牌、默认平铺行为或知识管理命令。** 否决。这些属于发行版选择，会降低上游可接受度，并为其他 DSH 消费方制造冲突。

**在 fork 内交付原生会话浏览器 disclosure。** 于 2026-08-24 否决。fork 只交付官方 DSH 缺少的能力，不修改随附 UI；无插件工作区域激活时，client 渲染须与上游逐像素一致。由 fork 在 `ui-workspace` 内持有收起控件破坏了这一边界，且该关切并非官方 DSH 所有；fork 已把该包退回上游。仍需要收起会话区域的下游发行版在 DSH 补丁之外保留自己的适配器；出现等价官方控件时应采用上游实现，而不是并行维护。

**打开第二个浏览器窗口。** 作为主要设计被否决。它不是嵌入式工作区域，会使焦点与生命周期复杂化，也无法解决页内编辑器或仪表盘。第二窗口可继续作为下游选项。

## 验收标准

- 第三方 client 插件可注册根作用域 `shell.workArea` list entry，并通过 `ctx.layout` 打开它，无需导入 DSH 实现文件。
- 未知工作区域 id 会快速失败；替换、陈旧关闭调用、注册移除、插件 dispose 和 HMR 形态重新注册都会留下确定的布局状态。
- 最多渲染一个工作区域 id，随附 `conversation` slot 在所有状态下最多渲染一次。
- 没有活动工作区域时，当前 AppFrame 布局、sidebar 行为、对话行为、details 行为和 `shell.overlay` 顺序保持不变。
- 存在活动工作区域时，当前会话的原生对话消息、流式、工具、审批、提问、附件、模型、命令、composer、取消与错误继续使用随附实现。
- 隐藏和显示伴随栏时，零宽隐藏树不能提交、回答、取消、获取焦点或处理快捷键；会话状态和草稿通过现有作用域 store 恢复。
- details 打开时在已分配布局中可见，且绝不会渲染在工作区域背后；details 与伴随栏让步会在调整大小后恢复。
- 列调整大小、sidebar 自动收起、窄 frame、减少动态效果、浅色/深色主题、无会话 hero 状态和 `shell.overlay` 均保持可用。
- 配对文档、包测试、组合 client 启动、类型检查、lint 与打包产物验证通过，DSH 补丁中不包含下游品牌或本地绝对路径。

## 风险

- `AppFrame` 会成为能力更强的公共组合边界。宽度常量和让步顺序必须继续由 layout 所有，否则插件会产生彼此不兼容的布局。
- 显式隐藏伴随栏可能重置组件局部视图状态。约定承诺会话与作用域 store 连续性，不承诺保留临时 DOM 状态。
- 现有 details API 按始终存在的对话列设计。必须在实现前选择伴随栏隐藏时的行为，并以测试保护。
- 工作区域 entry 可能在 HMR 期间崩溃或消失。现有 slot 错误边界和活动 id 对账必须让用户返回可用的对话布局。
- 上游对根导航的重新设计可能取代 `shell.workArea`。fork 应在出现等价官方路线时删除自身补丁，而不是保留平行概念。

# UI 改造前项目审计报告 (docs/ui-audit.md)

> **审计执行时间：** 2026-11-10  
> **审计执行阶段：** Phase 0 — 项目审计与基准建立  
> **目标：** 明确当前分支真实能力、代码结构、现有功能与技术栈，保护核心玩法与规则逻辑，避免为 UI 改造破坏已有功能。

---

## 1. 仓库基础与技术栈现状

- **框架与运行时：** React 19 (`react@^19.0.1`, `react-dom@^19.0.1`)
- **语言与配置：** TypeScript 7.0 (`tsconfig.json` 配置 `target: ES2022`, `moduleResolution: bundler`, `noEmit: true`)
- **构建工具：** Vite 8.3 (`@vitejs/plugin-react@^6.1.1`)
- **样式方案：** Tailwind CSS v4 (`@tailwindcss/vite@^4.3.3`, `@import "tailwindcss";` 在 `src/index.css`) + `src/client/ui.css` (包含棋盘与战斗样式)
- **图标与动效：** `lucide-react@^0.546.0`，`motion@^12.23.24` (已安装但核心交互由轻量 CSS 控制)
- **服务端/全栈能力：** `express@^4.21.2` (预置，目前前端采用单页 SPA 与本地控制器)
- **测试环境：** `load-demo-data.test.ts`、`combat.test.ts`、`engine.test.ts` 等基于 Vitest 的测试用例。

---

## 2. 第 0.3 节既有功能核实清单

依据 `UI_REDESIGN.md` 第 0.3 节的核实要求，在当前分支中逐项查验并确认状态如下：

| 模块 / 文件线索 | 当前状态 | 现状查验与处理结论 |
|---|---|---|
| `DEMO_CARDS`、`demo-card-pool.json` | **已确认存在且已扩展** | 当前已成功扩充至 88 张全量卡牌（80 张干员，涵盖 8 大职业、3~6 星；6 张战术卡；2 张支援卡）。数据由 `src/data/load-demo-data.ts` 集中加载与校验。严禁另立重复卡池。 |
| `CardDefinition`、`CARD_BY_ID` | **已确认存在** | `src/game/types.ts` 定义严格的 `CardDefinition` 契约，`src/client/demoData.ts` 构建只读 `CARD_BY_ID` 快速索引。所有规则属性完全保留。 |
| `load-demo-data.ts` 加载校验逻辑 | **已确认存在** | 包含卡牌格式校验、触发器枚举白名单、数值合法性校验。卡牌与牌组加载继续走该流程，不绕过校验直接读 JSON。 |
| `DeckDefinition`、`PRESET_DECKS` | **已确认存在** | 包含初始 DECK-A、DECK-B，以及扩展的 3 套新预设卡组（突击先锋组、天灾控场组、磐石防卫组），每套严格遵循 20 张、单卡限 2、同名限 2 规则。 |
| `DeckEditorView.tsx` 卡组编辑界面 | **已确认存在** | 具备卡牌库搜索、职业过滤、星级过滤、卡组增减、费用曲线与合法性实时校验面板。当前仅需按战术终端视觉规范重构 UI，业务规则严禁篡改。 |
| `localStorage` 保存、自定义卡组 JSON 导入 / 导出 | **已确认存在** | `src/client/demoData.ts` 中已实现 `getCustomDecks`、`saveCustomDeck`、`deleteCustomDeck`，并在 DeckEditorView 中支持 JSON 文本导入与导出，改造中必须完全向前兼容。 |
| `MulliganView` 起手换牌流程 | **已确认存在** | `src/views/MulliganView.tsx` 实现了起手 5 张牌的自选调度换牌流程，受 `LocalGameController` 与 `OnlineMatchController` 统一调度。 |
| `CardView`、`UnitView` 展示组件 | **已确认存在** | 位于 `src/client/ui.css` 与 `src/views/BattleView.tsx`，当前呈现为扁平色块或简单文字标签。需渐进升级为由 CSS + SVG 构成的 `CardFrame` 与 `OperatorPortrait` 规范组件。 |
| `BattleView`、游戏控制器、机器人对战模块 | **已确认存在** | `src/views/BattleView.tsx`、`src/client/localGameController.ts`、`src/ai/botPlayer.ts`。UI 只能作为状态展示和通过 action 提交操作，不得在组件中硬编码战斗推导。 |
| 联机模块（RoomLobbyView、onlineMatchController） | **已确认存在** | 包含基础 WebSocket / P2P 信令房间与准备流程。本轮 UI 重构不破坏其网络信令与匹配状态。 |

---

## 3. 页面现状与视觉/布局问题盘点

1. **主菜单 (`StartView.tsx`)**：
   - 现状：简单的居中黑色面板与垂直按钮列表。
   - 问题：缺乏明日方舟工业科技感、终端编号、背景网格质感与品牌识别。

2. **卡组编辑 (`DeckEditorView.tsx`)**：
   - 现状：左右双栏布局，左侧为卡牌库列表，右侧为卡组详情与校验。
   - 问题：卡面显示过简，缺乏原版立绘展示与立绘占位机制；移动端在窄屏下存在横向拥挤；卡框尚未采用 SVG/CSS 科技切角设计。

3. **战斗界面 (`BattleView.tsx`)**：
   - 现状：顶部状态条、中间 3 路棋盘、右侧战斗日志与详情面板、底部手牌。
   - 问题：
     - 棋盘格子色彩偏单调，友方/敌方/可部署/受控状态的提示可以更具终端质感。
     - 战斗日志虽已优化了彩色阵营，但需与整体战术终端 HUD 视觉规范无缝融合。
     - 缺乏响应式移动端 BottomSheet 抽屉，窄屏体验需单独适配。

4. **选牌与换牌 (`DeckSelectView.tsx`, `MulliganView.tsx`)**：
   - 现状：基础卡组选择与卡牌勾选。
   - 问题：视觉样式偏早期原型风格，需要接入统一的 Design Tokens、切角按钮与面板风格。

---

## 4. 数据与素材准备风险点及防护措施

1. **卡牌 ID 稳定性**：
   - 全部 88 张卡牌 ID 严格保持固定（`DEMO-OP-*`, `OP-*`, `DEMO-TAC-*`, `DEMO-SUP-*`），不得在展示层改造中重命名。
2. **规则数据与视觉表现数据混淆**：
   - 坚决不在 `CardDefinition` 中掺杂立绘路径、CSS 样式、坐标等表现层属性。
   - 建立独立的 `src/data/card-presentation.ts` 作为 Presentation Manifest。
3. **缺图雪崩风险**：
   - 目前本地尚未全量存放 72+ 张干员原版 WebP 立绘。
   - **防护底线**：设计 `OperatorPortrait` 组件，内部设置默认 SVG/CSS 工业科技风剪影占位符，图片加载失败 (`onError`) 时自动平滑回退，任何情况下页面与棋盘绝不抛错。
4. **抽卡与库存系统边界**：
   - 严格恪守规范：本轮不引入抽卡经济模型与玩家持有库存，所有 DEMO 卡牌在图鉴与编队中均保持全量可读可用。

# UI 重构验收检查清单 (docs/ui-acceptance-checklist.md)

> 本文件记录各阶段验收门槛的检查状态。所有项必须有明确依据，不可虚构勾选。

---

## Phase 0 — 项目审计与基准建立

- [x] 完成项目结构、框架、样式与现有功能审计 (`docs/ui-audit.md`)
- [x] 核实 0.3 节所有列出的 11 项现有功能模块，标记存在与处理方式
- [x] 确认代码仓库状态正常，无破坏性 Git 变更
- [x] 确认项目可构建，现有逻辑未受破坏

---

## Phase 0.5 — 最低限度数据层准备（UI 前置门槛）

- [x] **Card ID 稳定性**：全部 88 张卡牌（80 干员 + 6 战术 + 2 支援）ID 唯一且无冲突
- [x] **数据契约冻结**：游戏规则层与表现层清晰解耦，规则字段未受污染
- [x] **Card Presentation Manifest**：`src/data/card-presentation.ts` 建立最小可用版本，支持全量卡牌映射
- [x] **缺图与容错 Fallback**：创建 `OperatorPortrait` 规范组件，缺图/加载错误自动渲染终端风格剪影占位，绝不崩溃
- [x] **素材自检与验证脚本**：创建 `src/data/validate-card-assets.ts`，统计可用与缺省素材
- [x] **原有卡组与构筑规则完整保护**：Deck Builder 继续从当前目录读取卡牌，预设及自定义卡组导入导出功能正常
- [x] **零抽卡/库存污染**：未引入 Player Collection 或 Gacha 招募商业化逻辑
- [x] **自动化测试与构建**：数据契约测试通过，`npm run build`、`compile_applet`、`lint_applet` 全部通过

---

## Phase 1 — Design Tokens 与基础 UI 组件

- [x] **设计令牌集中管理**：整合主题变量到 `:root` (`src/client/ui.css`) 及 TypeScript 常量 (`src/components/ui/tokens.ts`)，包含背景层级、主次文字、战术黄强调色、阵营色、稀有度色值及切角路径
- [x] **统一基础组件库 (`src/components/ui/`)**：
  - `Button`：战术风格按钮，支持 primary / secondary / danger / ghost / outline 变体、三种尺寸、切角与 focus-visible
  - `Panel`：工业终端面板，支持 technical header、scanlines 扫描线、grid 网格与切角
  - `Badge`：遵守 Anti-slop zero-pill 规范，支持 class / rarity / status / cost / ally / enemy 语义标签
  - `Modal`：PRTS 战术弹窗，支持 ESC 快捷键与遮罩
  - `Tooltip`：战术悬停信息浮层，高对比度
  - `BottomSheet`：移动端底部抽屉与桌面侧栏复用结构
  - `HealthBar`：等宽血条，支持生命阈值变色与护盾层覆盖
  - `ResourceIndicator`：等宽数字费用 (DP) 与技力 (SP) 指示器
- [x] **CSS + SVG `CardFrame` 规范实现 (`src/components/cards/CardFrame.tsx`)**：
  - 完整 8 层架构：BackgroundLayer、ArtworkLayer (OperatorPortrait)、FrameShapeLayer (SVG 边框与刻度)、RarityAccentLayer、NameAndCostLayer、TypeAndStatsLayer、SkillSummaryLayer、InteractionLayer
  - 支持 hand / deck / preview / compact 四种场景尺寸
  - 3/4/5/6 星级主题自适应，再部署 CD 遮罩与已勾选反馈
- [x] **实际页面复用与样式冲突消除**：
  - `StartView`：全量终端面板与战术模式卡片升级
  - `DeckSelectView`：双列作战编制选择面板升级
  - `SettlementView`：战术推演结算报告面板升级
  - `MulliganView`：调度阶段手牌与确认按钮升级
  - `DeckEditorView`：卡牌目录全量采用 `CardFrame` 渲染与加入按钮控制
  - `BattleView` & `PlayerBar`：头部操作条、状态栏、手牌 `CardView` 统一接入
- [x] **组件自动化测试与构建校验**：`src/components/ui/components.test.tsx` 7 项测试通过，`npm run build`、`compile_applet`、`lint_applet` 全部通过

---

## Phase 2 ~ Phase 7 (待后续阶段逐步验收)

- [ ] Phase 2: 桌面端主要页面与布局（战术 HUD、三路棋盘、侧边详情与折叠日志）
- [ ] Phase 3: 移动端独立布局
- [ ] Phase 4: 卡牌视觉系统、只读图鉴与卡组编辑 UI
- [ ] Phase 5: 桌面与移动交互
- [ ] Phase 6: 战斗动画与视觉反馈
- [ ] Phase 7: 全面回归、视觉验收与清理


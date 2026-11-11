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

## Phase 2 — 桌面端主要页面与布局

- [x] **罗德岛干员档案/只读图鉴 (`src/views/CardLibraryView.tsx`)**：
  - 独立只读浏览页面，支持 88 张全量卡牌（80 干员 + 6 战术 + 2 支援）免构筑条件随意检视
  - 8 大职业筛选（先锋/近卫/重装/狙击/术师/医疗/辅助/特种 + 战术/支援）、稀有度（3~6星）、费用区间与即时中英名称模糊搜索
  - 右侧战术档案详细抽屉（Tactical Dossier Panel），完整显示攻击力、生命值、部署费用、技力恢复、主动技能及词条明细
- [x] **紧凑顶部战术 HUD (`src/components/battle/TacticalBattleHud.tsx`)**：
  - 高度压至 56px 工业终端顶栏，包含 PRTS 战术终端标识、回合轮次、当前行动阶段 Badge（绿色行动中/黄色敌方行动/橙色调度/结算）
  - 双边快速数据栏（我方/敌方生命值进度条、费用 DP、剩余牌库、墓地、击杀数计数）
  - 右侧集成了回合结束指令（TERMINATE PHASE）、折叠战斗日志开关与折叠单位档案开关
- [x] **三栏式桌面战场布局 (`src/views/BattleView.tsx`)**：
  - **左栏**：折叠式战术战斗日志（Collapsible Combat Log），支持一键展开/收起（收起至 48px），全彩标注红蓝方阵营、攻击伤害值、击杀连锁、技能触发与撤离事件
  - **中栏**：战术三路推演棋盘（3-Lane Grid），清晰划分左/中/右三路与前锋/后卫阵位，中央交战分割线带动态呼吸发光（Clash line），可部署阵位带高亮脉冲线框；底部停靠手牌托盘（Docked Hand Tray）并实时计算可用费用
  - **右栏**：独立战术单位/卡牌档案与指令面板 (`TacticalDetailPanel.tsx`)，选中棋盘干员或手牌卡牌时展示详细属性、技能说明、主动发动/快捷撤离按钮及实时待处理抉择状态；无选中时展示 PRTS 待机终端心跳监视
- [x] **棋盘单位棋子 (`src/components/UnitView.tsx`)**：
  - 接入 `HealthBar` 进度条、数字 ATK 与当前 SP 槽、状态指示器以及 `OperatorPortrait` 规范头像

---

## Phase 3 — 移动端独立布局

- [x] **移动端视口检测与无缝响应式 (`src/hooks/useIsMobile.ts`)**：
  - `useViewport` 与 `useIsMobile` 自动感知设备视口与方向旋转（支持窄屏 `<1024px`、手机 `<640px` 与横屏/竖屏检测）
  - 竖屏状态下提供轻量可关闭的横屏建议横幅（“💡 提示：横屏可获得更佳推演视野”）
- [x] **移动端战场布局独立重构 (`src/views/BattleView.tsx`)**：
  - 顶部 HUD 紧凑压至 46px，红蓝双方基地 HP 与 DP 在 360px 宽度下自适应排版，严禁横向溢出
  - 棋盘采用触控友好网格，单格保证最小 44px 点击区域，可部署格子带金色脉冲高光
  - 底部手牌坞支持流畅横向惯性滑动与吸附（`overflow-x-auto snap-x`），选中卡牌向上微抬高亮
  - 底部提供拇指盲操优化的「结束行动」大按钮，回合交替反馈直观
- [x] **移动端抽屉系统 (`BottomSheet.tsx`)**：
  - 战斗日志（`SYS.LOG`）：点击顶部 📜 按钮唤出平滑底部抽屉，不挤占棋盘主战场
  - 干员战术档案与指令（`SYS.DOSSIER`）：点击干员或点击详情唤出底部抽屉，集成【撤离干员】、【发动技能】与【取消】大尺寸触控键，绝不永久遮挡
- [x] **卡组编辑页面移动端双标签重构 (`src/views/DeckEditorView.tsx`)**：
  - 彻底解决窄屏下两栏挤压问题，提供「🗂️ 干员目录」与「📋 编制卡组」两标签自适应切换
  - 编制标签实时显示 20/20 张与合法性红绿指示灯，手机上构筑与调整流畅自如
- [x] **罗德岛干员图鉴移动端抽屉支持 (`src/views/CardLibraryView.tsx`)**：
  - 窄屏双列卡牌网格展示，点击任意卡牌唤起全量战术档案 BottomSheet

---

## Phase 4 ~ Phase 7 (待后续阶段逐步验收)

- [ ] Phase 4: 卡牌视觉系统与卡组编辑深入优化
- [ ] Phase 5: 桌面与移动交互
- [ ] Phase 6: 战斗动画与视觉反馈
- [ ] Phase 7: 全面回归、视觉验收与清理


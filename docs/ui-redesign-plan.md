# Arknights Tactical Terminal UI 重构分阶段实施计划 (docs/ui-redesign-plan.md)

> **基于规范文件：** `UI_REDESIGN.md`  
> **核心原则：** 数据层优先、保留既有规则、CSS+SVG原生卡框、防缺图崩溃、分阶段推进。

---

## 阶段推进概览

| 阶段 | 阶段目标 | 交付物 / 核心改造 | 状态 |
|---|---|---|---|
| **Phase 0** | 项目审计与基准建立 | `docs/ui-audit.md`、核验 0.3 节既有模块、基线测试校验 | **已完成** ✅ |
| **Phase 0.5** | 最低限度数据层准备（UI 前置门槛） | 稳定 Card ID、冻结数据契约、建立 Card Presentation 映射、缺图 fallback、数据契约测试 | **已完成** ✅ |
| **Phase 1** | Design Tokens 与基础 UI 组件 | 统一设计令牌、Button/Panel/Badge/Modal/Tooltip/BottomSheet/HealthBar/ResourceIndicator、CardFrame (CSS+SVG) | **已完成** ✅ |
| **Phase 2** | 桌面端主要页面与布局 | 战术终端主菜单、Card Library 只读图鉴、卡组编辑页面重构 | **待开启** ⏳ |
| **Phase 3** | 移动端独立布局 | 响应式抽屉 BottomSheet、移动端自适应棋盘与触控操作优化 | 待执行 |
| **Phase 4** | 战斗界面与 HUD 重构 | 顶部 HUD、战术棋盘网格、单位卡、手牌扇形/横滑栏、彩色战斗日志 | 待执行 |
| **Phase 5** | 交互与部署体验提升 | 部署拖放/点击高亮预览、攻击范围光标提示、快捷撤离交互 | 待执行 |
| **Phase 6** | 战斗轻量动画与视觉反馈 | 伤害跳字、受击闪烁、技能发动光效、击杀退场动效 | 待执行 |
| **Phase 7** | 全面回归验收与交付 | 全流程冒烟测试、桌面端与移动端兼容性检查、文档归档 | 待执行 |
| **Phase 8** | 抽卡系统与玩家库存 (后续独立项目) | 招募模拟器、抽卡保底、玩家收集率与解锁限制（本轮明确不执行） | 规划延后 |

---

## Phase 0.5 详细实施清单

1. **Card ID 盘点与稳定性确认**：
   - 盘点 88 张卡牌：80 张干员（包含 8 张 DEMO-OP-001~008 原型，72 张 OP-VAN-001 ~ OP-SPE-009 全职业覆盖）、6 张战术卡、2 张支援卡。
   - 经校验，全部卡牌 ID 唯一，无任何重复主键，且被 `PRESET_DECKS` 和对战系统正确引用。
2. **数据契约冻结**：
   - 明确规则层（`CardDefinition`）与展示层（`CardPresentation`）职责边界，规则层只保留数值和效果逻辑，展示层管理立绘与视觉元数据。
3. **Card Presentation Manifest 建立**：
   - 创建 `src/data/card-presentation.ts`，为全部 88 张卡牌建立标准元数据映射（`cardId` -> `operatorId` -> `assets` + `display` + `source`）。
4. **缺图与素材回退机制（Fallback）**：
   - 创建 `src/components/cards/OperatorPortrait.tsx`，具备自动容错与科技剪影占位符，图片 404 或未加载时保持终端风格正常渲染。
5. **素材校验与测试**：
   - 创建 `src/data/validate-card-assets.ts`，提供资产自检功能。
   - 创建数据契约测试 `src/data/data-contract.test.ts`，确保无脏数据、无 ID 漂移。

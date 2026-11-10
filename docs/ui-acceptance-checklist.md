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

## Phase 1 ~ Phase 7 (待后续阶段逐步验收)

- [ ] Phase 1: Design Tokens 与基础 UI 组件
- [ ] Phase 2: 桌面端主要页面与布局
- [ ] Phase 3: 移动端独立布局
- [ ] Phase 4: 卡牌视觉系统、只读图鉴与卡组编辑 UI
- [ ] Phase 5: 桌面与移动交互
- [ ] Phase 6: 战斗动画与视觉反馈
- [ ] Phase 7: 全面回归、视觉验收与清理

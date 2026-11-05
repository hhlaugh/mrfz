# v0.8 规则与 DIY 棋盘 Agent 交付包

本包把目前的讨论整理为可交给 Codex/其他代码 Agent 的规则和实施规范。它是设计与开发指导文件，不代表现有 Demo 已经完成 v0.8 实现。

## 文件

- `GAME_RULES_v0.8.md`：从 v0.7 保留基础规则并增加沉默、永续效果、多卡位、范围目标、非对称棋盘和攻防模式。
- `BOARD_PROFILE_SCHEMA_v0.1.md`：棋盘配置说明与 DIY 约束。
- `BOARD_PROFILE_SCHEMA_v0.1.json`：可供 JSON Schema validator 使用的结构校验文件；路线归属等跨字段约束仍需运行时校验。
- `BOARD_PROFILES_v0.1.json`：四种默认棋盘与一个 4v2 攻防示例。
- `ENGINE_MIGRATION_PLAN_v0.8.md`：Phase 0–7 的工程实施计划与验收标准。
- `AGENT_WORKFLOW_v0.1.md`：给 Codex/Agent 的分阶段指令模板。
- `V08_RULE_TEST_MATRIX.csv`：重点规则测试用例。
- `CARD_POOL_V1.1_ENGINE_COMPATIBILITY.md`：72张干员 v1.1 的真实事件/动作/条件/目标字段扫描与迁移清单。
- `arknights_operator_changelog_v1.1.csv` / `CARD_FIELDS_OPERATOR_v1.1.csv`：逐卡变更和字段说明。

## 与干员卡池 v1.1 的关系

v1.1 仍是待适配/模拟的干员数据。其 `on_attack_declared`、`on_attack_resolved`、`on_friendly_attack_declared`、`continuous`、`if_else` 等依赖已纳入 v0.8 规则和迁移计划。JSON 可解析不代表效果已经由引擎实现，也不代表数值平衡已经验证。

## 推荐开始方式

1. 把本包内文件放入项目 `docs/` 目录。
2. 把单独的干员卡池 v1.1 包解压到项目约定的数据目录（不要覆盖原始144卡备份）。
3. 先向 Agent 发送 `AGENT_WORKFLOW_v0.1.md` 的通用提示词，再执行 Phase 0 只读审计。
4. 审计结果确认后，逐阶段执行 Phase 1–7；每个 Phase 验收、提交 Git 后再继续。

## 尚未进行的工作

- 尚未审计你的当前代码仓库，所以没有声称实际工程模块、API 或测试命令。
- 尚未完成 TypeScript 运行时实现、完整技能动作实现、机器人联调、UI 编辑器或网络同步。
- 尚未完成 1000 局机器人模拟，任何新棋盘和 v1.1 卡牌仍需进行数值平衡验证。

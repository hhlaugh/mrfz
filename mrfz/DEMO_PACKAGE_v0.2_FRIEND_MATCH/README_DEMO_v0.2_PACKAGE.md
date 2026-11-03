# 三路攻防 Demo v0.2 文件包

本包新增好友对战（房主权威制 + Socket.IO 中继），保留单人机器人模式。

## 文件

- `GAME_RULES_v0.7.md`：唯一玩法规则依据。
- `DEMO_SCOPE_v0.2.md`：更新后的 Demo 范围，含单机与好友房间。
- `MULTIPLAYER_DESIGN_v0.1.md`：房主主机、房间码、消息协议、隐私和断线策略。
- `CODEX_RUNBOOK_v0.1.md`：按顺序交给 Codex 的阶段提示词和验收办法。
- `RULE_AUDIT_v0.7.md`：此前规则漏洞审查。
- `CARD_FIELDS_v0.7.csv`、`GAME_TERMINOLOGY_v0.7.csv`：字段与术语规范。
- `DEMO_CARD_POOL_v0.3.csv/json`：修正快速撤离配置后的 16 张测试卡。
- `DEMO_DECKS_v0.1.csv`：两套 20 张预设牌组。

## 重要说明

Demo 与正式版共用 `GAME_RULES_v0.7.md` 中的玩法规则。卡牌池数量、测试牌组张数和 UI 范围可以不同；不得复制或另写 Demo 规则引擎。

好友联机采用房主浏览器权威计算，Node.js + Socket.IO 仅作中继。该方案适合熟人间测试，不提供竞技级防作弊，也不支持主机迁移。

## Codex 开发顺序

先将全部文档放入项目 `docs/`，按照 `CODEX_RUNBOOK_v0.1.md` 阶段 0 至阶段 11 逐次执行。不要一次让 Codex 完成所有阶段。

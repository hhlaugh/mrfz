# v0.8 引擎迁移与验收计划

## 0. 重要边界

当前项目已有浏览器 Demo、机器人对战和房间码好友联机。此次升级是增量改造，不是重写项目。所有规则仍由纯 TypeScript 游戏引擎执行；React/UI、机器人和 Socket.IO 只能调用规则引擎的公开接口，不得复制一套伤害、目标、费用或状态判断。

本计划不声称目前代码已经支持 v0.8。Agent 必须先审计真实代码，再按阶段实施。

## 1. 需要新增/规范化的引擎数据

### 1.1 BoardProfile / BoardState

- `BoardProfile`：只读配置；包含两侧 lane、slot 数、route_groups、mode、基地 HP 与 victory config。
- `BoardState`：运行中占用情况；用 `side_id + lane_id + row + slot_index` 定位卡位。
- 推荐提供 `getSlotOccupant`、`getLegalDeploySlots`、`getRouteGroupForLane`、`getEnemyLanesInRouteGroup` 等纯查询 API。
- 不允许在业务代码里直接拼接 `left/front/1` 等假定固定路名。

### 1.2 永续效果与状态派生

- 卡牌源数据：`persistent_effects_json`。
- 运行时状态：silence/freeze/stun/grounded 等状态集合。
- 运行时有效属性：`getEffectiveEffects(instance, state)`、`hasEffectiveKeyword(instance, keyword, state)`。
- 沉默压制所有 `suppressed_by` 含 `silence` 的目标自身效果；冻结按 `suppressed_by` 显式压制，嘲讽/浮空默认含 `freeze`。
- 不通过改写 card definition 来实现沉默；移除沉默后必须可恢复。

### 1.3 效果事件与 DSL

补齐事件：`on_attack_declared`、`on_attack_resolved`、`on_friendly_attack_declared`。
`continuous` 作为动态查询，不加入事件队列。
补齐条件/动作：`if_else`、`moved_target`、`target_is_floating`、`enemy_front_exists`、`back_slot_empty`、`active_skill_used_this_owner_turn`。
所有事件、条件、动作、target selector 都必须有 schema 白名单；未知值在加载期报错并指向 card_id/skill_id。

## 2. 分阶段开发

### Phase 0 — 只读审计（不改代码）

交付：
- 当前工程目录/模块图；
- 规则引擎、AI、UI、联机层入口文件；
- 当前棋盘固定假设清单（lane 数、前后排槽、硬编码 target selectors）；
- 当前已有测试、运行命令、构建命令；
- v0.7 功能对照表及 v0.8 差异表；
- 风险、兼容层和建议实施顺序。

验收：不修改任何项目文件；不得凭印象声称支持功能。

### Phase 1 — 规则数据模型与验证器

交付：
- BoardProfile TypeScript 类型和运行时 validator；
- 四种默认棋盘 JSON + 4v2 siege 示例；
- `persistent_effects_json` 类型与加载校验；
- 事件/动作/目标选择器白名单；
- legacy `taunt_scope` / `floating` 到永续效果对象的适配器（若实际代码有这些旧字段）。

验收：合法配置通过；缺路、重复 lane_id、重复 lane_order、空 route group、未分配 lane、重复分配 lane、超上限、无效胜负配置均拒绝并给出可读错误。此阶段不改变现有对局 UI。

### Phase 2 — 战斗引擎多卡位化

交付：
- 固定三路数组改为 BoardProfile 驱动的 slot 查询/更新；
- 动态部署位置合法性检查；
- lane_order → front/back → slot_index 的行动队列；
- 嘲讽、拦截、浮空与多卡位目标排序；
- RouteGroup 目标收集；
- 保持现有经济、撤离、CD、SP 算法不变。

验收：标准 3x1x1 的旧对局回归；compact/wide/extended/4v2 自动化测试；同一单位一个 combat phase 不重复攻击；非法卡位不会部分扣费/移牌。

### Phase 3 — 沉默、永续效果与技能 DSL

交付：
- `persistent_effects_json` 与运行时效果派生；
- silence/freeze/stun 对技能和关键词的压制；
- 三个新增攻击事件；
- continuous、if_else、moved_target 等 DSL 扩展；
- AOE snapshot、治疗目标选择统一逻辑。

验收：沉默不阻止 SP、不阻止普攻；嘲讽/浮空/光环恢复正确；冰冻继续封锁 SP；攻击事件顺序明确；无效目标不支付 SP；未知 DSL 值拒绝加载。

### Phase 4 — 干员卡池 v1.1 适配

交付：
- 72 张干员导入；
- v1.1 新事件/动作/目标选择器全部有实现或在 playable_enabled=false 时明确不允许进入正式对局；
- 不改变原 card_id；
- 生成 schema 校验报告和字段迁移报告。

注意：结构可解析不等于效果正确；每张可玩卡必须至少有一个针对核心技能的规则测试或回归用例。不要自动重做数值。

### Phase 5 — AI 与 UI 多棋盘支持

交付：
- UI 按 BoardProfile 动态渲染，不假定固定三路；
- 部署界面仅显示合法空位；
- combat log 显示路、排、卡位编号；
- bot 通过规则引擎的 legal action API 获取合法部署/技能/撤离动作；
- bot 在多卡位、route group、非对称布局下不会崩溃或无限思考。

验收：所有默认棋盘可完整打完一局；至少有一套自动化 AI smoke test。

### Phase 6 — DIY 棋盘编辑器与 siege 模式

交付：
- 双方独立路数/前后排卡位编辑；
- route group 分配器；
- 双方基地 HP；
- siege 角色、先手和完整轮次上限；
- 创建时校验并冻结 BoardProfile。

验收：可创建 4v2 示例；10 个完整轮次后守方基地存活则守方胜；基地提前归零按规则结算；无法配置孤立路或非法路线分组。

### Phase 7 — 联机协议、回归与平衡

交付：
- 房间状态同步 `rules_version`、`board_schema_version`、`card_pool_version`、BoardProfile hash；
- 服务端/房主验证规范化后的 board profile；
- 访客不能提交另一个棋盘配置或覆盖主机快照；
- 固定随机种子的 1000 局自动模拟；
- 关键指标：胜率、平均回合数、平均剩余基地 HP、各干员出场/胜率、技能触发次数、每回合费用曲线、撤离循环净费用、状态命中率。

验收：房主与访客显示同一棋盘且状态 hash 一致；构建、规则、AI、协议测试通过；性能在最大 DIY 限制内可接受。

## 3. 每个 Phase 的强制交付格式

Agent 每完成一个 Phase，必须汇报：

1. 修改文件清单及每个文件修改原因；
2. 新增/修改的测试清单；
3. 实际执行的命令（原样给出）；
4. 测试结果摘要（通过/失败数量）；
5. 未解决问题和风险；
6. 与规则文档不一致之处（如无也要明确写“未发现”）；
7. 下一 Phase 前是否需要用户决策。

未实际执行的测试必须标为“未运行”，不得写“应该通过”。任何规则歧义先列出冲突位置与备选解释，不得擅自选择会改变卡牌强度/胜负的答案。

## 4. 全局完成定义

- 原 Demo 功能不退化：单机、机器人、创建/加入房间、换牌、完整对局、重开。
- `src/game`（或同等规则引擎目录）保持纯逻辑，不依赖 React、DOM、Socket.IO。
- 默认棋盘和 DIY 棋盘都使用同一套战斗代码。
- 规则关键分支可通过自动化测试复现。
- 72 张干员数据结构校验通过，playable 卡牌的技能均有实际执行路径。
- 不能以 UI 展示正确代替规则引擎判定正确。

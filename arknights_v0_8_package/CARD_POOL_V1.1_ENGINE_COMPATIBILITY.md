# 干员卡池 v1.1 — v0.8 引擎兼容清单

> 依据当前 72 张 `arknights_operator_pool_v1.1.json` 递归扫描生成。此清单是工程适配清单，不表示这些功能已经在 Demo 中实现。

## 1. 迁移原则

- 原始 v1.1 CSV/JSON 保持为卡池数据源，不要让 Agent 直接覆盖或手动分叉两份文件。
- 导入时生成规范化运行时对象；运行时统一按 v0.8 schema 执行。
- 保留全部 72 个 `card_id`。不得在“兼容”名义下修改 cost、ATK、HP、SP、CD、退款和技能效果数值。
- 不认识的事件、动作、条件、目标选择器或持续时间必须报错，不能静默忽略。
- `playable_enabled=true` 只表示设计上准备作为可玩卡；如果任一必需事件/动作/目标选择器尚未实现，加载器应阻止该卡进入正式对局并给出明确原因。

## 2. 当前卡池递归扫描到的枚举

### Skill trigger

`active`, `combat_end`, `continuous`, `on_ally_death`, `on_attack_declared`, `on_attack_resolved`, `on_attacked`, `on_damage_survive`, `on_deploy`, `on_friendly_attack_declared`, `on_kill`, `on_lethal`, `turn_start`

### Action type

`apply_status`, `bonus_damage`, `buff_attack`, `damage`, `debuff_attack`, `gain_cost`, `gain_sp`, `heal`, `if_else`, `move`, `prevent_lethal`, `reduce_damage`, `shield`, `summon`

### Condition key

`active_skill_used_this_owner_turn`, `another_friendly_same_lane_class`, `any_ally_damaged`, `any_ally_exists`, `attacker_same_lane_as_self`, `back_slot_empty`, `enemy_front_exists`, `no_other_friendly_same_lane`, `self_attacked`, `self_health_full`, `self_position`, `self_survived_combat`, `target_current_hp_gte`, `target_current_hp_lte`, `target_exists`, `target_has_status`, `target_is_damaged`, `target_is_floating`, `target_max_hp_gte`, `target_position`, `target_shield_gte`

### Action target

`all_enemies_same_lane`, `all_friendly_same_lane`, `attack_target`, `back_slot_same_lane`, `chosen_enemy_same_lane`, `chosen_friendly`, `enemy_front_same_lane`, `friendly_ranged_same_lane`, `front_friendly_same_lane`, `last_attacker`, `lowest_health_friendly_same_lane`, `moved_target`, `owner`, `random_friendly_same_lane`, `second_enemy_same_lane`, `self`

### Skill-level target_scope

`any_friendly`, `same_lane`, `same_lane_all_enemies`, `same_lane_enemy`, `same_lane_friendly`, `same_lane_friendly_attack`, `self`

### Applied status

`grounded`, `silence`, `slow`, `stun`

### Duration token

`next_owner_combat`, `target_owner_turns`, `this_combat`, `until_combat_end`, `until_end_of_target_next_turn`, `until_leave_field`, `while_full_health`, `while_in_back`

**注意：** `if_else` 的 `move`、`apply_status` 等嵌套动作必须递归校验；仅扫描顶层 `actions` 会漏掉暗索、阿消、温蒂等卡牌的分支动作。条件 `all` / `any` 是组合逻辑运算符，不是普通字段条件。

## 3. 旧字段迁移

| v1.1 字段 | 运行时规范 | 迁移要求 |
|---|---|---|
| `taunt_scope=same_lane` | `persistent_effects_json` 中 `keyword=taunt` | 默认 `suppressed_by=[silence, freeze]`；保留 `scope=same_lane` |
| `floating=true` | `persistent_effects_json` 中 `keyword=floating` | 默认 `suppressed_by=[silence, freeze]`；`deploy_rule` 仍需 back_only |
| `floating=false` | 无浮空效果 | 不生成 persistent effect |
| token `floating=true` | token 自身的 persistent effect | 不能误写到召唤者本体；token 独立计算状态 |
| `target_scope=same_lane` / `same_lane_enemy` / `same_lane_friendly` | v0.8 目标范围 | 按技能目标阵营分别映射到物理路或 route group，禁止简单字符串替换后不做行为测试 |
| `target_scope=any_friendly` | 全体友方候选集合 | 若 action target 为 `chosen_friendly`，真人手选，AI 按优先级选 |
| `target_scope=self` | 自身 | 直接绑定 source instance |
| `target_scope=same_lane_friendly_attack` | `on_friendly_attack_declared` 的同路友方攻击筛选 | 事件载荷需提供 attacker、attack_target、lane_id 和 route_group_id |

## 4. v1.1 中几个关键卡牌的适配要求

| 干员 | 依赖 | 引擎要求 |
|---|---|---|
| 泡泡 | `taunt_scope=same_lane` + `on_attacked` reaction | 嘲讽可沉默/冰冻压制；受击反应先付 SP |
| 拉普兰德 | `on_attack_resolved` + `apply_status(silence)` | 主攻击伤害/死亡结算后施加沉默；沉默不封 SP |
| 麦哲伦 | `on_deploy` + `summon` + floating token | token 独立 card_instance_id，单独占后排槽，浮空可沉默 |
| 铃兰 | `on_friendly_attack_declared` + 条件光环 | 攻击前能查同路友方、慢速状态；来源被沉默时光环失效 |
| 苏苏洛 | `active` + `chosen_friendly` + heal | 合法目标筛选；真人选择，AI 默认最低 HP 比例；无目标不付 SP |
| 暗索/阿消/温蒂 | `if_else` + `move` + `moved_target` + `grounded` | 同一分支快照；移动后用同一实例 ID 追加 grounded |
| 史尔特尔 | `active_skill_used_this_owner_turn` + `combat_end` | 回合标记在撤离后保留到本回合结束结算 |

## 5. 建议生成的导入报告

每次从 CSV/JSON 导入时输出：

1. 总卡数、唯一 card_id 数、职业/稀有度分布；
2. 每个 skill_type、trigger、action、condition、target selector 的计数；
3. 未知/缺失/不兼容字段及对应 card_id、skill_id、JSON 路径；
4. 每张 playable_enabled 卡的 `fully_supported` 状态；
5. token 数据的独立校验结果；
6. 原始字段到规范化字段的转换摘要。

不要仅以“72 张卡 JSON parse 成功”作为卡池导入验收。

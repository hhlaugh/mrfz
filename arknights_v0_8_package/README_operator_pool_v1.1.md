# 明日方舟同人三路攻防：干员卡池修订版 v1.1

> 状态：规则 v0.7 兼容修订稿；待接入规则引擎、自动模拟与数值平衡测试  
> 来源：`arknights_card_pool_v1.csv` 中的 72 张干员卡  
> 本文件只修订干员卡，不包含 48 张战术卡和 24 张支援卡。

## 文件说明

- `arknights_operator_pool_v1.1.csv`：72 张干员卡的可编辑主表，UTF-8 BOM，适合 Excel / Google Sheets。
- `arknights_operator_pool_v1.1.json`：同一批卡牌的程序导入版本，`skills_json` 和 `summon_tokens_json` 已解析为真正的 JSON 数组。
- `arknights_operator_changelog_v1.1.csv`：逐卡旧版与修订版对照，包括费用、属性、技能、CD、退款、SP 字段及修改原因。
- `OPERATOR_POOL_AUDIT_v1.1.md`：本次修改摘要、沉默定义、兼容问题和后续规则依赖。

## 保留内容

- 72 张干员卡及原 `card_id` 全部保留，未更换角色名单。
- 八个职业仍各 9 张。
- 原作稀有度分布仍为：3 星 12 张、4 星 24 张、5 星 18 张、6 星 18 张。
- 本轮不主动调整大部分基础 `cost`、`atk`、`hp` 数值；主要改造技能定位、SP、目标规则和数据结构。
- `pack_enabled` 仍保留旧版值；新增 `playable_enabled`，把是否可抽取与是否已实装玩法分开。

## 核心字段

| 字段 | 含义 |
|---|---|
| `card_id` | 稳定卡牌 ID，不得随意更换 |
| `class` | 英文职业枚举：`vanguard/guard/defender/sniper/caster/medic/supporter/specialist` |
| `cost` | 卡面印刷费用 |
| `atk` / `hp` | 干员基础攻击力与生命值 |
| `attack_type` | `melee` 或 `ranged` |
| `deploy_rule` | `front_only` / `front_or_back` |
| `redeploy_cd_cost_baseline` | 按 cost 档位得到的基础 CD |
| `redeploy_cd_class_modifier` | 本版试算的职业修正：先锋 -1、特种 -1、重装 +1，其余 0 |
| `redeploy_cd_base` | 最终写入卡牌、供运行时直接读取的 CD；**程序不得再次叠加职业修正** |
| `normal_withdrawal_refund_ratio` | 普通撤离退款比例，基于最近一次实际部署支付费用向下取整 |
| `max_sp` / `starting_sp` | SP 上限与初始 SP |
| `sp_regen_per_turn` | 每个己方回合开始的自然回复；特殊角色可为 0 |
| `sp_gain_on_attacked` | 有效攻击命中时回复 SP，护盾完全吸收也算受击 |
| `sp_gain_on_damaged` | HP 实际下降后回复 SP |
| `sp_gain_on_kill` | 由该干员造成击杀时回复 SP |
| `taunt_scope` | `none` 或 `same_lane` |
| `floating` | 干员原生浮空属性；本轮 72 张本体无浮空，浮空放在麦哲伦支援无人机 token 上 |
| `target_scope` | 普攻目标集合范围 |
| `target_priority` | 合法目标内的选择优先级 |
| `can_target_floating` | 是否能攻击浮空单位；远程默认 true，近战 false |
| `ignore_taunt` | 是否忽略嘲讽 |
| `ignore_front_interception` | 是否允许越过前排选择后排 |
| `skills_json` | 技能数组，支持主动、条件被动、SP 被动和 SP 反应 |
| `summon_tokens_json` | 该干员可召唤的单位数据 |
| `playable_enabled` | 当前是否作为可实装对战卡；与抽卡开关分离 |

## CD 与退款配置

本版按 v0.7 建议表填充基础值：

| cost | CD cost baseline | 普通撤离退款 |
|---:|---:|---:|
| 1–2 | 1 | 0.50 |
| 3–4 | 2 | 0.333333 |
| 5–6 | 3 | 0.25 |
| 7+ | 4 | 0.20 |

再部署职业修正暂按候选方案：
- 先锋：-1
- 特种：-1
- 重装：+1
- 其他职业：0

最终 CD 最低为 1。`redeploy_cd_base` 是已经应用职业修正后的最终值。以上是卡牌数据的初始平衡值，不代表经过对局验证。

## 技能数据结构

`skills_json` 是 JSON 数组。每项包含：
- `skill_id`
- `skill_name`
- `skill_type`：`active`、`passive_free`、`passive_sp`、`reaction_sp`
- `trigger`
- `sp_cost`
- `skill_priority`
- `actions`
- 可选 `condition`、`limit`、`duration`、`target_scope`

技能共用干员自己的 SP 池。`active` 由玩家在行动阶段发动；`passive_sp` / `reaction_sp` 在条件满足且 SP 足够时自动扣费发动；`passive_free` 不消耗 SP。

## 沉默（`silence`）的本卡池定义

根据用户最新要求，本版卡牌采用以下设计语义：

1. 目标在沉默持续时间内不能触发任何技能效果：主动技能、条件被动、SP 被动、反应技能、部署触发、攻击触发及持续技能均被压制。
2. 沉默期间仍可正常进行普通攻击。
3. 沉默不会阻止任何 SP 获取：自然回复、受击、受伤、击杀或未被沉默来源抑制的外部 SP 回复均正常结算。
4. 沉默不清空现有 SP，不阻止 SP 上限变化，也不自动消耗 SP。
5. 沉默不移除已经结算并存在的状态效果；它阻止目标的新技能触发。
6. 卡牌基础属性及静态关键词（例如原生 `taunt_scope`、`floating`、`attack_type`）不因沉默而消失。若某词条是技能临时授予，则按该词条原有持续时间处理。
7. 本版持续时间统一按“持续至目标下一个己方回合结束”设计。
8. 冰冻仍然比沉默更强：冰冻除封锁技能外，还封锁所有 SP 获取，并按 v0.7 限制攻击、反应和拦截。

注意：v0.7 尚未正式定义 `silence`，因此此处是卡牌数据采用的拟定语义，下一轮需要写入规则正文。

## 本版新增的规则/引擎依赖

卡牌已使用下列较精确的触发名，避免把攻击前、攻击后混在一起：

- `on_attack_declared`：攻击目标已确定、伤害尚未结算；适用于攻击加伤等效果。
- `on_attack_resolved`：主攻击伤害和伤亡结算后；适用于溅射、施加状态等效果。
- `on_friendly_attack_declared`：同路友方攻击声明时，供铃兰协同光环使用。
- `continuous`：条件持续效果，需在数值计算时动态检查，不进入普通触发队列。

另外需要规则/DSL 支持：
- `if_else`：条件分支必须基于同一动作开始时的状态快照判定，只执行第一个满足条件的分支。
- `moved_target`：引用刚刚被移动的同一目标。
- `target_is_floating`、`back_slot_empty`、`enemy_front_exists` 等条件。
- 对浮空单位实施拉/推位移时，可在同一原子分支追加 `grounded` 两个目标所属玩家回合。
- `active_skill_used_this_owner_turn`：用于史尔特尔主动技能结束后的代价触发。
- `all_friendly_same_lane`、`all_enemies_same_lane`、`second_enemy_same_lane`、`lowest_health_friendly_same_lane` 等目标选择器必须统一定义。

以上是卡池依赖清单，不代表规则引擎已经实现这些动作。

## 平衡注意事项

- 桃金娘继续保留重复部署产费，是本卡池刻意保留的资源循环测试样本。快速撤离、退款和部署产费叠加时须统计循环净费用。
- 泡泡负责嘲讽+蓄能减伤；雷蛇负责不自然回复、受击蓄能反击；星熊负责自然回复SP后的反伤。三者需要分别测试触发频率。
- 麦哲伦的浮空无人机不占额外卡位，只使用本路后位；它不能拦截基本分攻击，远程敌人优先攻击。
- 史尔特尔、银灰、艾雅法拉等主动技能的 SP 成本和伤害尚未经过模拟验证。
- 目前保持原有大部分 ATK/HP/cost，技能重做后可能改变强度；不能据此认为数值已经平衡。

## 导入建议

1. 运行时导入 JSON，不要从 `rules_text_zh` 反向解析规则。
2. `skills_json` 必须通过 schema 校验；未知技能类型、触发器、动作或条件应拒绝加载并报告卡牌 ID。
3. 保留 `card_id`，每个实体副本在对局内另建 `card_instance_id`。
4. CSV 适合人工平衡修改；JSON 是程序运行时的数据格式。修改 CSV 后应由导入脚本生成 JSON，不要手动让两份数据各自漂移。
5. 这份文件只包含 72 张干员卡；原 48 张战术卡和 24 张支援卡仍在旧版 144 张总表中，尚未迁移到此 schema。

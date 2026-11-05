# 棋盘配置与 DIY 规范 v0.1

> 配套规则：`GAME_RULES_v0.8.md`  
> 状态：第一版实现规范；数值上限为 UI/性能护栏，不是平衡规则。

## 1. 核心原则

1. 棋盘是开局时加载的配置，不写死在规则引擎、AI、UI 或网络协议中。
2. 默认预设与 DIY 棋盘使用完全相同的引擎和经济规则。
3. 双方可以拥有不同路数、每路前排/后排格数和基地 HP。
4. 非对称路数通过 `route_groups` 连接；每个物理路恰好属于一个路线分组。
5. 第一版不做动态分叉、移动路线、任意几何距离或一条物理路加入多个路线分组。
6. BoardProfile 在创建对局后冻结；中途不能由客户端随意改写。

## 2. 对象模型

### BoardProfile

- `schema_version`: 固定为 `0.1`。
- `board_id`: 稳定唯一标识。
- `mode`: `duel` 或 `siege`。
- `sides.p1` / `sides.p2`: 双方布局、基地 HP、路列表。
- `route_groups`: 双方物理路的映射集合。
- `victory`: 先手、轮次上限和模式胜负参数。
- `ui`: 可选展示名、说明、是否可编辑等元数据。

### Side

`base_hp` 是该玩家基地开局 HP；`lanes` 数组按 `lane_order` 排序。每路包含：

- `lane_id`: 本方唯一标识，例如 `A1`、`D2`。
- `lane_order`: 从 1 起始，连续且唯一；UI 左到右展示。
- `front_slots`: 前排卡位数，0–4。
- `back_slots`: 后排卡位数，0–4。

### RouteGroup

`side_lanes.p1` 和 `side_lanes.p2` 分别列出本路线分组包含的物理路 ID。两侧数组都必须非空。一个分组可连接 1:N、N:1 或 N:M 的物理路。每个 Side 中的每条物理路必须且只能出现于一个 RouteGroup。

同一分组内的敌方单位构成普通攻击的路线目标集合。目标优先级先按类别（嘲讽、地面前排、地面后排、合法浮空、基地）判断，再按目标路 `lane_order`、前/后排、卡位号排序。一个攻击者仍只有一次普通攻击。

### Victory

- `duel`: `round_limit` 必须为 `null`；基地归零即胜负。
- `siege`: `attacker_side`、`defender_side` 必须分别为 `p1`、`p2` 其中之一且不能相同；`round_limit` 为正整数；到达完整轮次上限后，守方基地仍存活则守方获胜。
- `first_player`: `p1`、`p2` 或 `random`。

## 3. 默认棋盘预设

所有预设均为对称一一对应路线，双方基地 HP 均为 20，不设置额外费用或 CD 补偿。

| ID | 双方路数 | 前排/路 | 后排/路 | 总卡位/方 |
|---|---:|---:|---:|---:|
| `compact_2x1x1` | 2 | 1 | 1 | 4 |
| `standard_3x1x1` | 3 | 1 | 1 | 6 |
| `wide_3x2x1` | 3 | 2 | 1 | 9 |
| `extended_4x2x1` | 4 | 2 | 1 | 12 |

## 4. DIY 编辑器第一版限制

| 项目 | 限制 |
|---|---|
| 每方路数 | 1–6 |
| 每路前排格数 | 0–4 |
| 每路后排格数 | 0–4 |
| 每路总卡位 | 至少 1 |
| 每方总卡位 | 不超过 24 |
| 路线分组 | 每组双方至少各 1 路 |
| 路线归属 | 每条物理路必须恰好属于一个分组 |
| 对局开始后 | BoardProfile 不可修改 |

## 5. 4 路对 2 路攻防示例

```json
{
  "schema_version": "0.1",
  "board_id": "custom_siege_4v2",
  "mode": "siege",
  "sides": {
    "p1": {
      "side_label": "攻方",
      "base_hp": 20,
      "lanes": [
        {"lane_id": "A1", "lane_order": 1, "front_slots": 2, "back_slots": 1},
        {"lane_id": "A2", "lane_order": 2, "front_slots": 2, "back_slots": 1},
        {"lane_id": "A3", "lane_order": 3, "front_slots": 2, "back_slots": 1},
        {"lane_id": "A4", "lane_order": 4, "front_slots": 2, "back_slots": 1}
      ]
    },
    "p2": {
      "side_label": "守方",
      "base_hp": 30,
      "lanes": [
        {"lane_id": "D1", "lane_order": 1, "front_slots": 3, "back_slots": 2},
        {"lane_id": "D2", "lane_order": 2, "front_slots": 3, "back_slots": 2}
      ]
    }
  },
  "route_groups": [
    {"route_group_id": "north", "side_lanes": {"p1": ["A1", "A2"], "p2": ["D1"]}},
    {"route_group_id": "south", "side_lanes": {"p1": ["A3", "A4"], "p2": ["D2"]}}
  ],
  "victory": {
    "first_player": "p1",
    "attacker_side": "p1",
    "defender_side": "p2",
    "round_limit": 10
  }
}
```

这是结构示例，不代表 20/30 基地 HP、10 轮已经经过平衡测试。`p1`、`p2` 只是数据侧 ID；实际房间可随机分配给玩家。

## 6. 预设 JSON 与验证器

- `BOARD_PROFILES_v0.1.json` 提供四种默认预设与一个非对称攻防示例。
- `BOARD_PROFILE_SCHEMA_v0.1.json` 提供 JSON Schema 结构校验。
- Schema 校验后仍需运行时语义检查：lane_id 唯一、lane_order 连续唯一、路线分组双边非空、所有 lane 恰好出现一次、总卡位不超限、模式胜负参数完整。
- 不能信任客户端提交的 BoardProfile；房主/服务器创建房间时校验并生成规范化对象及 hash，访客只接收已校验配置。

## 7. 版本与网络同步

房间/开局快照至少包含：`board_schema_version`、`board_profile_id`、规范化后的完整 `board_profile`、`board_profile_hash`、`rules_version`、`card_pool_version`。所有玩家对同一个 hash 开局。旧客户端不认识 schema version 时应拒绝加入或提示升级，不能静默降级成标准棋盘。

# Codex 开发执行手册 v0.1

> 目标：按顺序完成三路攻防卡牌游戏 Demo，包含单人机器人和房主创建房间码的 1v1 好友对战。
>
> 唯一游戏规则依据：`GAME_RULES_v0.7.md`。
> Demo 内容与验收范围：`DEMO_SCOPE_v0.2.md`。
> 联机协议：`MULTIPLAYER_DESIGN_v0.1.md`。

## 使用方法

不要一次把所有阶段交给 Codex 让它“全部做完”。建议每次只发送一个阶段的提示词：

1. 先在 Codex 中打开项目根目录。
2. 确保上面三个文档、卡牌 CSV/JSON 和牌组 CSV 都在项目 `docs/` 或根目录。
3. 先发送“全局约束”，再发送阶段 0。
4. 每个阶段通过验收、Git commit 后，才发送下一阶段。
5. Codex 如果要求你一次允许大量文件修改，先检查 diff，不要盲目接受。

---

## 全局约束（第一次发送一次即可）

```text
你是这个项目的资深 TypeScript 游戏工程师。请遵守以下项目文档：
- GAME_RULES_v0.7.md：唯一的游戏规则依据，不得擅自改变规则。
- DEMO_SCOPE_v0.2.md：Demo 内容、单机/联机范围和验收标准。
- MULTIPLAYER_DESIGN_v0.1.md：好友房间和房主权威联机架构。

技术路线：React + TypeScript + Vite + Vitest；好友联机使用 Node.js + TypeScript + Socket.IO 中继服务。游戏规则引擎必须是纯 TypeScript，不依赖 React、浏览器 API、Socket.IO 或 Node 服务。

开发约束：
1. 一次只完成我指定的当前阶段，不要提前实现后续阶段。
2. 不得复制一套 Demo 专属规则；单机、机器人和好友对战必须共用同一个规则引擎。
3. 所有卡牌效果使用白名单数据结构，禁止从 JSON 执行任意代码。
4. 所有动作必须先校验再原子提交；非法动作不得部分扣费、移牌或改状态。
5. 不信任客户端提交的费用、伤害、胜负、玩家身份或完整 GameState。
6. 每阶段结束运行相关测试、TypeScript 检查和构建（如当前阶段适用），如实报告命令与结果；不要声称执行过未执行的命令。
7. 修改前先阅读现有代码和 Git 状态；不要覆盖无关文件。
8. 遇到规则歧义时先指出冲突、提出最小修正建议并停止该歧义部分，不要自行发明规则。
9. 每个阶段完成后列出改动文件、测试结果、已知问题、下一阶段前置条件，并等待我确认。
10. 不要为了赶进度删除测试、吞掉错误或把失败测试改成通过。
```

## 阶段 0：检查项目与制定落地计划（只读，不写代码）

```text
请先只读检查当前仓库和项目文档。不要修改任何文件。

请完成：
1. 确认 GAME_RULES_v0.7.md、DEMO_SCOPE_v0.2.md、MULTIPLAYER_DESIGN_v0.1.md、16 张 Demo 卡牌数据、两套预设牌组是否存在。
2. 检查当前技术栈、目录结构、package.json、已有测试和 Git 状态。
3. 标记卡牌数据与 v0.7 规则的字段或效果冲突，尤其是快速撤离的 control/half 豁免、redeploy_cd_base、退款、SP 和状态字段。
4. 提出最小工程结构与分阶段文件清单。
5. 列出不能在首版实现的功能，避免范围膨胀。

输出审查报告和开发顺序。不要写代码，等待我确认。
```

## 阶段 1：项目骨架、类型和卡牌数据校验

```text
按已确认计划建立或整理 React + TypeScript + Vite + Vitest 项目骨架。当前只做类型、数据加载和校验，不实现战斗逻辑、不做 UI。

要求：
1. 建立纯 TypeScript 游戏类型：GameState、PlayerState、CardDefinition、CardInstance、OperatorState、StatusEffect、GameAction、PlayerId、LaneId、Position、GamePhase。
2. 严格区分 card_id（卡牌定义 ID）与 card_instance_id（牌组中每一张实体卡 ID）。
3. 区分 cost、paid_deploy_cost、current_sp、sp_cost、base_points、hp。
4. 将 redeploy CD、has_deployed_before、owner/controller、board_half 等生命周期数据与 HP/SP/护盾/状态等战斗数据分离。
5. 建立卡牌 JSON schema / runtime validator；加载 16 种卡牌和两套牌组，校验唯一 ID、字段枚举、引用存在、牌组 20 张、同名最多 2 张。
6. 校验 effect_json 只能使用白名单 effect type 和 trigger。
7. 对冲突数据给出报错，不要静默修正。
8. 生成数据加载单元测试。

完成后运行 typecheck 和 tests，报告所有数据问题。不要实现 UI、AI 或联机。
```

## 阶段 2：规则引擎基础与回合流程

```text
在现有类型上实现纯 TypeScript 规则引擎基础：
- createInitialGameState / shuffleDeck / drawCards / mulligan。
- 起手 5 张、双方各一次等量换牌、暂存牌洗回牌库，换牌不触发疲劳。
- 随机决定先手；回合严格 A/B 交替。
- turn_start → action → combat → turn_end。
- 每个己方回合开始 +3 cost，上限 10，未用保留。
- 每回合开始抽 1 张；空抽疲劳按 1、2、3……递增扣基本分。
- 手牌上限只影响抽牌；撤离返回手牌不丢弃。
- 20 基本分、胜负检查。

要求纯函数或明确的不可变状态更新；随机数来源可注入 seed，以便测试复现。实现阶段边界和动作 reducer，但暂时不实现所有卡牌效果、战斗、AI、UI、网络。为每个规则写测试。
```

## 阶段 3：部署、撤离、CD、支援和费用原子性

```text
实现 GAME_RULES_v0.7 的行动阶段动作与卡实例生命周期：
- 首次部署、费用校验、近战/远程位置限制、浮空后位限制、空位和同名规则。
- normal withdrawal：只允许己方控制、己方半区、未处于 blocks_normal_withdrawal 状态的干员；退款按 floor(paid_deploy_cost × ratio)，Demo 数据 ratio=0.5。
- rapid withdrawal：作为 0 cost tactic，消耗手牌；按 v0.7 明确豁免控制状态和半区限制；全额返还实际支付费用；CD 减少 1，最低 0。
- 撤离恢复卡牌初始战斗属性：HP、ATK 修正、SP、护盾和临时状态；装备按规则进入弃牌堆。
- card_instance_id、has_deployed_before、redeploy_cd_remaining 等生命周期字段保留。
- CD 设置、递减和同一行动阶段内再部署必须严格符合 v0.7。
- on_deploy 每次成功进入战场均触发；失败动作不能触发。
- 支援设施、装备位、支援上限。

所有动作先 validate 再 commit；失败不得部分扣费、移卡或触发效果。重点写普通撤离不合法、冻结/眩晕快速撤离、退款、连续快速撤离再部署、部署产费套利测试。不要添加全局再部署次数限制。
```

## 阶段 4：战斗、目标算法、SP 和控制状态

```text
实现 v0.7 的自动战斗系统和状态处理：
- 只有当前行动玩家的干员进行普通攻击；防守方仅触发合法被动/反应。
- 左→中→右；每路前位→后位。
- 统一目标选择：嘲讽、有效地面拦截前排/后排、浮空目标（远程可攻击且按规则优先）、基本分。
- 每次攻击立即结算伤害/护盾/死亡/触发；下一名攻击者重新选择目标；过量伤害不溢出。
- melee/ranged 对 floating 的合法性；grounded 临时落地 2 个目标方己方回合。
- stun、freeze 的攻击/技能/拦截/撤离/SP 获取区别。
- SP 自然恢复、受击、受伤、击杀、技能消耗；冻结期间所有 SP 来源封锁。
- 反应技能先扣 SP，不能用同一次受击稍后产生的 SP 倒付本次反应费用。
- 触发队列、优先级、循环安全阀。

按规则建立可读的 combat log event，而不是在 UI 中直接改 HP。每个边界写单元测试和集成测试。不要实现机器人和 UI。
```

## 阶段 5：规则回归、确定性模拟和漏洞检查（闸门）

```text
本阶段只做测试、自动模拟和修复规则引擎缺陷，不新增玩法。

1. 覆盖 DEMO_SCOPE_v0.2 中全部规则验收项目。
2. 加入 property-based 或随机状态测试，检查 cost/SP/HP 不越界、部署位不重复占用、同一实例不重复存在等不变量。
3. 固定 seed 可复现同一发牌结果和对局状态。
4. 使用脚本进行至少 1000 局随机合法动作模拟；如果机器人尚未实现，可用随机合法动作代理，不要称为 AI 平衡测试。
5. 输出崩溃、非法状态、无限触发、疲劳、抽牌、撤离、refund、on_deploy、SP、控制状态统计。
6. 逐项报告已通过/失败/未覆盖，不要通过修改预期值掩盖 bug。

只有规则回归测试全部通过，才进入 UI 阶段。
```

## 阶段 6：实现 React 本地对战 UI

```text
基于通过测试的规则引擎制作本地网页 UI。当前只做不联网的本地界面，不做 Socket.IO。

页面：开始页、牌组选择、起手换牌、对战页、结算页。
对战页显示：双方基本分、cost、牌库/弃牌堆数量、左中右三路、双方前后位、手牌、干员 HP/ATK/SP/状态、支援区、阶段提示、战斗日志。

交互：选卡后高亮合法部署位/目标；普通撤离只对合法目标可用；快速撤离按战术卡使用；技能显示 SP 成本；非法操作展示原因。

UI 只能发 GameAction 给 GameController，不能自己计算伤害、费用、SP、退款或 CD。先用占位图标，不做完整立绘和复杂动画。保证桌面浏览器优先可用，手机宽度可以基本操作。

验收：使用固定牌组可以从起手换牌完整玩到胜负；所有 UI 状态来自规则引擎。
```

## 阶段 7：机器人 AI 与单人模式

```text
为规则引擎增加本地机器人。机器人只读取合法动作列表和允许 AI 读取的公开/自身状态，不得绕过 validateAction。

最低策略：补空路/关键路线；评估部署 cost；有击杀机会时考虑伤害卡；考虑嘲讽、浮空、控制；SP 足够且技能有价值目标时发动；只在确有收益时普通/快速撤离；无正收益动作时结束行动阶段。

先实现普通难度启发式评分。加入重复状态检测、AI 决策步数 watchdog（仅 AI 内部安全措施，不是玩家规则限制）和日志。自动运行 A/B 两套牌互换先手的模拟，统计胜率、平均回合、撤离率、技能频率。不要使用在线大模型 API。
```

## 阶段 8：为联机抽离 GameController 与 PlayerView

```text
在单机版稳定后，为好友联机准备架构，但暂时不创建网络连接。

1. 将 GameController 抽象为 host-authoritative controller：持有完整 GameState、接收 actor + GameAction、validate、apply、增加 stateVersion。
2. 本地单机仍可使用同一 controller；AI 作为一个普通 action provider。
3. 实现 toPlayerView(state, viewerPlayerId)，只返回 viewer 自己手牌和公共信息；隐藏对手手牌内容、牌库顺序、随机数 seed、内部字段。
4. 实现 ActionRequest/ActionAck/PlayerView 类型及 schema。
5. host 本地动作和 guest 远程动作最终调用完全相同的规则引擎入口。
6. 测试不同 viewer 得到不同私有视图；确保 guest view 不包含 opponent hand card IDs、deck order 或 RNG state。

不要在本阶段实现 Socket.IO、房间码或 UI。
```

## 阶段 9：实现 Node.js + Socket.IO 中继服务

```text
按 MULTIPLAYER_DESIGN_v0.1.md 建立独立 relay-server。它只负责房间和网络消息转发，不负责游戏规则。

实现：
- createRoom：安全随机 8 位房间码、host seat、房间过期时间。
- joinRoom：最多一个 guest，拒绝错误/过期/已开始/已满房间。
- room state、ready、deck selection、start signal。
- guest ActionRequest 路由给 host；host PlayerView 只路由给指定玩家。
- reconnect token、guest 120 秒重连、连接状态。
- host 断线/离开导致对局中断，无主机迁移。
- 消息 schema、大小限制、频率限制、CORS、错误码和日志。

不要把完整 GameState 存在服务器，不要在服务端实现扣费、伤害或胜负。为房间满员、过期、重复加入、伪造角色、消息超限和重连写服务端测试。
```

## 阶段 10：整合好友对战 UI 与状态同步

```text
将 Socket.IO relay 和 React 客户端整合。

新增：好友对战入口、创建房间、复制房间码、输入房间码、房间大厅、牌组选择、准备状态、双方换牌、连接状态、断线提示、返回大厅。

实现：
- host 浏览器持有完整 GameState 并执行规则。
- guest 发送 ActionRequest，host 验证并回传 guest 专属 PlayerView。
- host 自己操作仍走同一个 GameController。
- expectedStateVersion 不匹配则拒绝并同步最新视图。
- requestId 去重，避免网络重试导致同一动作重复执行。
- 不同 rulesVersion/protocolVersion 不兼容时禁止开始。
- 访客断线暂停、重连后恢复快照；host 退出显示对局中断。
- 单机模式不能依赖 relay-server，relay 不可用时单机仍可玩。

不要增加聊天、观战、匹配、账号、排位或主机迁移。
```

## 阶段 11：端到端测试、部署和最终验收

```text
请进行 Demo 发布前验收。先修复已知问题，不新增功能。

本地测试：
1. 启动前端和 relay-server。
2. 使用两个独立浏览器配置文件或一个普通窗口+无痕窗口分别作为 host/guest。
3. 创建房间、复制码、加入、选牌组、准备、换牌、开始。
4. 轮流操作，验证费用、手牌、目标、伤害、SP、撤离和胜负两边一致。
5. 尝试伪造 playerId、非当前玩家动作、重复 requestId、旧 stateVersion、错误目标和非法费用。
6. Guest 断网后重连，确认恢复最新视图且动作没有重复。
7. Host 离开，确认对局中断且提示正确。
8. 单机机器人模式在 relay-server 停止时仍然可玩。

部署：静态前端部署到可托管 SPA 的服务；relay-server 部署到支持 Node.js 长连接/Socket.IO 的服务。生产必须使用 HTTPS/WSS、正确 CORS、环境变量配置和健康检查。

最终汇报：构建命令、实际测试结果、尚存问题、部署配置、如何本地启动两个服务、如何邀请朋友联机。不得声称未测试的网络场景已通过。
```

---

## 建议的 Git 检查点

建议至少在以下节点提交：

- `checkpoint-0-project-audit`
- `checkpoint-1-types-and-data`
- `checkpoint-2-core-engine`
- `checkpoint-3-withdrawal-and-cards`
- `checkpoint-4-combat-and-status`
- `checkpoint-5-rule-tests-pass`
- `checkpoint-6-local-ui`
- `checkpoint-7-bot-playable`
- `checkpoint-8-player-view-controller`
- `checkpoint-9-relay-server`
- `checkpoint-10-friend-match`
- `checkpoint-11-demo-release`

每个检查点都能回退，避免 Codex 一次大改破坏此前已经通过的规则。

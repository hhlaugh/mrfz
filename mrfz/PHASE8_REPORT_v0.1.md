# 阶段 8 收尾报告（Phase 8 Report）v0.1

> 日期：2026-11-03
> 范围：为联机抽离 GameController 与 PlayerView（纯架构准备，**不实现 Socket.IO、房间码或 UI**）。依据 `CODEX_RUNBOOK_v0.1.md` 阶段 8 与 `DEMO_SCOPE_v0.2.md` §6。
> 引擎边界：`src/game/` 依旧零改动；UI 与机器人代码路径未变（本地单机继续使用同一控制器）。

---

## 1. 结论

**阶段 8 完成。** host-authoritative 控制器、信息过滤的 PlayerView、ActionRequest/ActionAck 协议与运行时 schema 校验全部落地并有测试保证；bot 与本地 UI 走同一规则引擎入口的架构得到协议路径整局对局测试验证。**满足进入阶段 9（Node.js + Socket.IO 中继服务）的前置条件。**

## 2. 改动文件清单

**新增（3 个）**

| 文件 | 作用 |
|---|---|
| `src/client/protocol.ts` | `ActionRequest` / `ActionAck` 类型 + 轻量运行时 schema 校验（`isActionRequest` / `isActionAck`）；只查结构，规则合法性仍由引擎 validate 路径负责 |
| `src/client/playerView.ts` | `PlayerView`（含 Unit/Side/设施/待处理选择子类型）+ `toPlayerView(state, viewerId, options)` + `isPlayerView` schema 校验 |
| `src/client/protocol.test.ts` | 12 项测试（协议行为、信息边界、schema、AI 提供方整局） |

**修改（1 个）**

- `src/client/localGameController.ts`：控制器增加
  - `submitAction(actorId, request): ActionAck` —— **requestId 去重 + expectedStateVersion 校验**，随后调用与 `dispatch` 完全相同的 `reduceGameAction` 入口并同样自动推进阶段；
  - `toPlayerView(viewerId)` —— 基于 state + 控制器公开日志历史生成信息过滤视图；
  - 已处理 requestId 记录（上限 512，超出滚动淘汰）。

## 3. RUNBOOK 阶段 8 六项要求逐项对照

| # | 要求 | 状态 | 实现/证据 |
|---|---|---|---|
| 1 | GameController 抽象为 host-authoritative：持有完整 GameState、接收 actor + GameAction、validate、apply、增加 stateVersion | ✅ | 阶段 6 的控制器即 host 权威（持有完整状态），本阶段补齐协议入口 `submitAction`；引擎 `state_version` 随每次成功动作单调递增，ack 回传最新版本 |
| 2 | 本地单机仍可使用同一 controller；AI 作为普通 action provider | ✅ | UI/机器人路径零改动（`dispatch`）；`protocol.test.ts` 中**bot 双方以 ActionRequest 走 `submitAction` 完整打完整局**，证明 AI 与本地动作在同一入口汇合 |
| 3 | `toPlayerView(state, viewerPlayerId)` 只含 viewer 自己手牌与公共信息 | ✅ | 见 §4 信息边界清单；纯函数实现，返回全新对象 |
| 4 | ActionRequest/ActionAck/PlayerView 类型及 schema | ✅ | 类型 + 三个运行时校验函数；schema 拒绝测试（坏 lane、空 requestId、负版本号、未知动作类型等） |
| 5 | host 本地动作与 guest 远程动作最终调用完全相同的规则引擎入口 | ✅ | `dispatch` 与 `submitAction` 都收敛到 `reduceGameAction + applyStep + autoAdvance`；阶段 9/10 的 relay 只需转发 `submitAction` |
| 6 | 测试不同 viewer 得到不同私有视图；guest view 不含对手手牌 ID、牌库顺序、RNG state | ✅ | 专项测试：对手手牌/牌库实例 ID 逐一断言不出现在序列化 JSON 中；`random_state`/seed 字符串不存在；两个 viewer 公共部分相等、私有部分不同 |

## 4. PlayerView 信息边界清单

**包含**：规则版本、stateVersion、阶段/回合/当前行动玩家/胜负、mulligan 完成标记、双方公共数据（基本分、费用、牌库数量、弃牌数量、疲劳、设施及触发次数）、全部在场单位（位置/HP/ATK 及修正/SP/护盾/状态/装备，均为公开棋盘信息）、**viewer 自己**的手牌（含顺序）、自己的牌库顺序（DEMO_SCOPE §6.1 允许）、自己的弃牌内容、战斗日志（公开）、当前行动玩家本人的回合开始支援选择、公共卡池定义。

**排除**：对手手牌内容与顺序（连字段都不存在）、对手牌库顺序、对手弃牌内容、`random_state`、seed、`turn_start_prepared` 等引擎内部标志、非行动玩家的待处理选择。

**实现保证**：`toPlayerView` 全部新构造对象（`combatLog` 也拷贝），测试验证 JSON round-trip 稳定、篡改视图不影响控制器状态。

## 5. 协议行为细节（如实记录）

- **requestId 去重**：请求通过版本检查后即登记（无论后续验证是否通过）——重复提交同一 requestId 一律拒绝且不改变状态；网络重试场景（ack 丢失后重发）由此保证不会重复执行。版本过期（stale）的请求**不消费** requestId，客户端同步最新 PlayerView 后可重新提交。
- **expectedStateVersion**：不匹配当前 `state_version` 即拒绝并附当前版本号，客户端据此触发视图同步。
- **拒绝原子性**：格式不合法 / 重复 / 过期 / 引擎验证失败四种拒绝路径都保证状态零变化（测试断言快照引用不变）。
- **AI 提供方**：机器人每次决策生成独立 requestId + 当时的 state_version，整局 100+ 动作全部经协议路径执行成功（测试内置）。

## 6. 实际执行的验证

| 命令 | 结果 |
|---|---|
| `npx vitest run src/client/protocol.test.ts`（迭代） | ✅ 12/12 |
| `npm run typecheck` | ✅ 退出码 0 |
| `npm run test` | ✅ **11 个测试文件 / 82 个测试全部通过**（阶段 7 的 70 项 + 本阶段 12 项；200 局规则回归与 120 局 bot 模拟不变） |
| `npm run build` | ✅ 应用构建通过 |

## 7. 已知事项

1. 本地 UI 仍走 `dispatch`（信任本地输入），阶段 10 整合好友对战时访客侧 UI 将改走 `submitAction`；两者已验证同入口。
2. `PlayerView.cardDefinitions` 为公共卡池数据的浅拷贝，随视图传输体积较大（约十几 KB）；阶段 10 若有带宽顾虑可改为版本号 + 客户端自带卡池，本 Demo 不做。
3. `submitAction` 的 actor 参数由调用方显式传入；真实座位认证（连接上下文决定身份）按 DEMO_SCOPE 属于阶段 9/10 的 relay/客户端职责，本阶段不实现。
4. PlayerView 的 schema 校验是结构级（key/类型），信息边界由 `toPlayerView` 构造函数 + 泄露专项测试共同保证。

## 8. 阶段 9 前置条件确认

| 前置条件 | 状态 |
|---|---|
| host-authoritative 控制器 + ActionRequest/Ack 协议就绪（relay 只需转发） | ✅ |
| toPlayerView 信息边界完成并有泄露测试（guest 永远拿不到对手手牌/牌库顺序/RNG） | ✅ |
| 82 项测试全绿、typecheck/build 通过 | ✅ |
| 阶段 9 需新建独立 `relay-server/`（Node.js + Socket.IO，只管房间与转发，不碰规则） | 待开始 |

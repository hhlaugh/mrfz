# 阶段 10 收尾报告（Phase 10 Report）v0.1

> 日期：2026-11-03
> 范围：整合好友对战 UI 与状态同步（Host-authoritative + Socket.IO Relay）。依据 `CODEX_RUNBOOK_v0.1.md` 阶段 10、`DEMO_SCOPE_v0.2.md` §6-§7 与 `MULTIPLAYER_DESIGN_v0.1.md`。
> 架构边界：`src/game/` 规则引擎保持零改动；房主为唯一规则判定权威；中继只管房间与消息路由；单机/热座对战完全不依赖中继。

---

## 1. 结论

**阶段 10 完成。**
好友对战完整链路（入口、大厅、创建/加入房间、8 位房间码与复制、双方选牌与准备门禁、网络换牌、权威状态广播同步、ActionRequest/Ack、断线暂停与重连、对局中断处理）全部落地。
单机机器人与本地热座模式完全解耦独立。全套 14 个测试套件 / 99 项测试全部通过（含 200 局规则回归、120 局 bot 模拟对局、网络全流程集成测试）；TypeScript 严格检查与 Vite 生产打包构建全通过。

---

## 2. 改动文件清单

| 文件 | 变更类型 | 作用 |
|---|---|---|
| `src/client/onlineMatchController.ts` | 新增 | 好友联机状态机与网络客户端：处理 Socket.IO 房间生命周期、房主权威对局驱动、访客 PlayerView 同步与 ActionRequest/Ack 响应式调用、断线重连恢复 |
| `src/views/RoomLobbyView.tsx` | 新增 | 好友对战大厅页面：提供中继服务配置、创建房间、输入 8 位房间码加入、一键复制房间码、双方座位状态卡片（在线/离线、牌组选择、准备状态）以及开局门禁与退出控制 |
| `src/client/multiplayer.test.ts` | 新增 | 阶段 10 专用集成测试（3 项）：`clientStateFromPlayerView` 零信息泄露与动作推导测试、全套 Socket.IO 联机房间+换牌+动作+版本过期拦截+房主离开中断测试、非法房间码拦截测试 |
| `src/client/playerView.ts` | 修改 | 新增 `clientStateFromPlayerView` 投影函数，使客户端能基于过滤后的 `PlayerView` 渲染完整棋盘与推导合法动作；`PlayerViewSide` 补充 `handCount` 公开统计 |
| `src/views/BattleView.tsx` | 修改 | 支持 `networkStatus` 状态横幅（房间码、座位角色、对手连接状态）、访客断线暂停遮罩、统一 `onDispatch` 异步调用适配、对手未知手牌隐蔽卡背渲染 |
| `src/views/MulliganView.tsx` | 修改 | 增加异步确认与 `waitingForOpponent` 等待对手换牌提示态 |
| `src/views/StartView.tsx` | 修改 | 首页增加「好友对战（联机房间）」入口按钮与说明 |
| `src/client/App.tsx` | 修改 | 整合联机路由分支与 `OnlineScreen` 游戏容器、会话持久化与重连、对局中断弹窗 |
| `src/client/ui.css` | 修改 | 增加联机大厅、房间码高亮、玩家卡片、准备标签、暂停横幅、对手隐蔽手牌卡背、中断弹窗等完整暗色主题样式 |
| `PHASE10_REPORT_v0.1.md` | 新增 | 本阶段收尾与试玩指引报告 |

---

## 3. RUNBOOK 阶段 10 各项要求逐项对照

| # | 要求 | 状态 | 实现 / 验证细节 |
|---|---|---|---|
| 1 | 好友对战入口、创建房间、复制房间码、输入房间码 | ✅ | `StartView` 提供入口；`RoomLobbyView` 一键创建安全 8 位房间码，集成 `navigator.clipboard` 复制；支持大写校验加入 |
| 2 | 房间大厅、牌组选择、准备状态、连接状态、返回大厅 | ✅ | 双人卡片清晰展示房主/访客身份、选牌下拉框、实时连接圆点指示；双方准备后房主方可开局 |
| 3 | host 浏览器持有完整 GameState 并执行规则 | ✅ | 房主端持有 `LocalGameController`，完整维护真实状态；中继与访客端均不持有完整 GameState |
| 4 | guest 发送 ActionRequest，host 验证并回传 guest 专属 PlayerView | ✅ | 访客调用 `dispatchAction` 生成带 UUID 和版本的 `ActionRequest`，房主以 `submitAction('player_b', ...)` 校验执行后通过 `view:update` 单播回传过滤后的 `PlayerView` |
| 5 | host 自己操作仍走同一个 GameController | ✅ | 房主本地 UI 操作直接调度同一控制器的 `dispatch` / `submitAction` 入口，零分支逻辑 |
| 6 | expectedStateVersion 不匹配则拒绝并同步最新视图 | ✅ | 协议强校验：版本过期返回错误码并拒绝状态变更，客户端收到最新视图后重新推导 |
| 7 | requestId 去重，避免网络重试导致同一动作重复执行 | ✅ | `LocalGameController` 维护已执行 requestId 集合（LRU 512 上限），重复提交原子拒绝 |
| 8 | 不同 rulesVersion/protocolVersion 不兼容时禁止开始 | ✅ | 房间加入与大厅状态均严格匹配版本号，不兼容直接拦截报 `VERSION_MISMATCH` |
| 9 | 双方换牌与隐私隔离 | ✅ | 双方均有各自专属起手换牌界面；访客通过 `mulligan:submit` 提交；对手手牌内容在任何阶段均不在网络传输中出现 |
| 10 | 访客断线暂停、重连后恢复快照；host 退出显示对局中断 | ✅ | 访客断线房间进入 `pausedForGuest`，120 秒内凭 token 重连恢复最新快照；房主离线立即触发中断提示 |
| 11 | 单机模式不依赖 relay-server，relay 不可用时单机仍可玩 | ✅ | 单人 vs 机器人与本地热座完全走纯前端同步逻辑，中继未启动或离线不影响单机游玩 |
| 12 | 不增加聊天、观战、匹配、账号、排位或主机迁移 | ✅ | 严格收敛范围，仅实现好友房间联机核心对战体验 |

---

## 4. 架构与安全保证

1. **信息边界完整性**：
   - 访客端收到的 `PlayerView` 中，对手手牌内容字段完全不存在；牌库顺序被剔除；RNG 种子与随机数发生器内部状态不暴露。
   - `clientStateFromPlayerView` 仅将对手手牌投射为带有隐蔽标识的空壳，UI 渲染为卡背效果（“未知手牌”），无法被抓包反编译。
2. **权威校验一致性**：
   - 访客提交的任何部署、施法、撤离、技能或换牌动作，必须经过房主规则引擎完全相同的 `validateAction` 与 `reduceGameAction` 处理，篡改费用/伤害/数值无效。
3. **网络幂等性**：
   - 每个 ActionRequest 携带独立 `requestId`，网络重传或重发不会造成重复扣费或重复伤害。

---

## 5. 实际执行的验证结果

| 命令 / 目标 | 结果 | 细节 |
|---|---|---|
| `tsc -b --pretty` | ✅ 退出码 0 | 全工程 TypeScript 类型检查完全通过（0 error） |
| `vitest run` | ✅ **14 个测试套件 / 99 项测试全部通过** | 包含 200 局规则回归、120 局 bot 模拟对局、14 项 relay 单元/集成测试、3 项阶段 10 端到端联机测试 |
| `vite build` | ✅ 构建成功 | 前端静态 bundle 构建成功（dist 产物 388.10 kB） |

---

## 6. 本地试玩指南

开发者或玩家可在本地启动两个浏览器窗口（或一个正常窗口 + 一个无痕窗口）进行好友联机试玩：

### 第一步：启动中继服务
在项目根目录下运行：
```bash
npm run relay
# 控制台输出：[relay] listening on :8787 (protocol v1, rules 0.7)
```

### 第二步：启动前端开发服务器
在另一个终端运行：
```bash
npm run dev
# Vite 启动本地开发服务，例如 http://localhost:5173
```

### 第三步：开始对战
1. **窗口 A（房主）**：
   - 打开 `http://localhost:5173`。
   - 点击「好友对战（联机房间）」。
   - 点击「创建房间」，进入房间大厅，点击「📋 复制房间码」（例如 `ABC23456`）。
   - 选择牌组（如「突击防守预设 A」），点击「点击准备」。
2. **窗口 B（访客，推荐使用无痕模式浏览器）**：
   - 打开 `http://localhost:5173`。
   - 点击「好友对战（联机房间）」。
   - 在输入框粘贴窗口 A 的 8 位房间码，点击「加入」。
   - 选择牌组（如「法术爆发预设 B」），点击「点击准备」。
3. **开始与试玩**：
   - 窗口 A（房主）的「开始对局」按钮变亮，点击「开始对局」。
   - 双方各自进入起手换牌阶段，确认换牌后自动进入三路对战棋盘。
   - 轮流部署干员、施展战术、发动技能并撤离干员。
   - 尝试测试断线：关闭窗口 B 标签页，窗口 A 将显示对局暂停；120 秒内在窗口 B 重新输入房间码即可自动恢复对局。

# 阶段 9 收尾报告（Phase 9 Report）v0.1

> 日期：2026-11-03
> 范围：实现独立 Node.js + Socket.IO 中继服务（relay-server）。依据 `CODEX_RUNBOOK_v0.1.md` 阶段 9 与 `MULTIPLAYER_DESIGN_v0.1.md`。
> 架构边界：中继服务只负责房间生命周期、连接状态维护与消息路由，**不保存完整 GameState、不运行规则引擎、不决定费用/伤害/胜负**；`src/game/` 引擎层继续保持零改动。

---

## 1. 结论

**阶段 9 完成。**
在 Node.js v24 原生 TS 支持下，修补了由于参数属性（TypeScript parameter properties）导致的 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` 异常，为 relay 启用 `erasableSyntaxOnly` 编译器约束。独立 relay-server 可直接由 `node relay-server/src/index.ts` 启动监听并响应 `/healthz` 健康检查。
所有中继逻辑单元测试与 Socket.IO 集成测试共 14 项新增测试全绿，全工程 13 个测试套件 / 96 项测试全部通过，TypeScript 检查及 Vite 构建通过。**完全满足进入阶段 10（整合好友对战 UI 与状态同步）的前置条件。**

---

## 2. 改动与新增文件清单

| 文件 | 变更类型 | 作用 |
|---|---|---|
| `relay-server/src/types.ts` | 新增 | 中继服务协议常量、Seat、RelayConfig、RelayErrorCode 枚举及 RoomStatePayload 定义 |
| `relay-server/src/roomManager.ts` | 新增 & 修补 | 纯逻辑房间与座位管理器：8 位安全房间码、座位归属推断、大厅准备/选牌、开局门禁、断线/重连凭证机制、清扫器；修复构造函数参数属性以兼容 Node.js 24 原生 strip-types |
| `relay-server/src/index.ts` | 新增 & 修补 | HTTP + Socket.IO 接线层：限流（RateLimiter）、负载大小拦截（32KB/64KB）、CORS 配置、统一错误应答（`room:error`）、`/healthz` 探针；修复 RateLimiter 参数属性 |
| `relay-server/src/roomManager.test.ts` | 新增 | 7 项测试（房间码生成无歧义、满员/重复/版本不匹配拦截、开局门禁、断线暂停与重连、超时关闭、大厅过期、主动离开中断） |
| `relay-server/src/index.test.ts` | 新增 | 7 项端到端 Socket.IO 真实连接测试（动作单播/广播路由、满员拦截、断线重连恢复并触发 view:resend、大包拦截、突发限流与断开、伪造身份阻断） |
| `tsconfig.relay.json` | 新增 & 修补 | 中继独立 TS 配置，增加 `"erasableSyntaxOnly": true` 强制静态防止使用 strip-only 不支持的 TypeScript 专有运行时语法 |
| `tsconfig.json` | 修改 | references 引入 `tsconfig.relay.json`，纳入整体工程管理 |
| `package.json` | 修改 | 引入 `socket.io` 与 `socket.io-client` 依赖，提供 `relay` 与 `relay:dev` 命令 |
| `PHASE9_REPORT_v0.1.md` | 新增 | 本阶段收尾与验收报告 |

---

## 3. RUNBOOK 阶段 9 各项要求逐项对照

| # | 要求 | 状态 | 实现 / 验证证据 |
|---|---|---|---|
| 1 | createRoom：安全随机 8 位房间码、host seat、房间过期时间 | ✅ | `generateCode` 采用 CSPRNG `randomBytes(8)` 并过滤 `0/O`、`1/I/L` 等易混淆字符；默认空闲 15 分钟 sweep 过期；`roomManager.test.ts` 验证 100 次碰撞率与格式 |
| 2 | joinRoom：最多一个 guest，拒绝错误/过期/已开始/已满房间 | ✅ | 仅允许 1 个 guest，第三人加入返回 `ROOM_FULL`；针对未知房间返回 `ROOM_NOT_FOUND`；已开始房间返回 `ROOM_STARTED`；版本不一致返回 `VERSION_MISMATCH` |
| 3 | room state、ready、deck selection、start signal | ✅ | 包含 `host` / `guest` 准备与选牌状态；只有双方均 ready 且 host 发送 `match:start` 时才进入开局，生成唯一 `matchId` 广播 |
| 4 | guest ActionRequest 路由给 host；host PlayerView 只路由给指定玩家 | ✅ | 动作单播给 host socket；PlayerView 单播给 guest socket，host 绝不收到回声；mulligan 换牌选择同样安全路由 |
| 5 | reconnect token、guest 120 秒重连、连接状态 | ✅ | 生成 24 字节 base64url 随机 token；访客断线后房间标为 `pausedForGuest`，120 秒内凭 token 重连静默接管并触发 host 补发最新视图（`view:resend`） |
| 6 | host 断线/离开导致对局中断，无主机迁移 | ✅ | host 离开直接关闭房间广播 `room:closed (HOST_LEFT)`；host 超时断线广播 `HOST_TIMEOUT`；不进行任何主机迁移 |
| 7 | 消息 schema、大小限制、频率限制、CORS、错误码和日志 | ✅ | 运行时使用 `isActionRequest`/`isActionAck` 校验协议；超过 32KB 拒绝 `PAYLOAD_TOO_LARGE`；窗口超限拒绝 `RATE_LIMITED`，连续二次超限强制断开 |
| 8 | 不把完整 GameState 存在服务器，不在服务端计算规则 | ✅ | relay-server 内存仅存房间元数据与 socket-seat 映射，不引入任何游戏规则引擎计算 |
| 9 | 针对房间满员、过期、重复加入、伪造角色、消息超限和重连写服务端测试 | ✅ | `roomManager.test.ts`（7 项）+ `index.test.ts`（7 项）完整覆盖所有异常路径 |

---

## 4. 中断原因与修补说明

- **中断根本原因**：
  前序任务在生成 `RateLimiter` 与 `RoomManager` 类时，使用了 TypeScript 构造函数参数属性（如 `constructor(private readonly config: RelayConfig) {}`）。
  Node.js 24 原生运行 TypeScript 采用 strip-only 模式（`--experimental-strip-types`），该模式仅擦除类型注解，不支持需要语法降级转换的 parameter properties，导致执行 `node relay-server/src/index.ts` 时抛出 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`。
- **修补措施**：
  1. 将 `RateLimiter` 和 `RoomManager` 的构造函数改写为显式属性声明与构造体赋值，符合原生 strip 规范。
  2. 在 `tsconfig.relay.json` 中配置 `"erasableSyntaxOnly": true`，使 TypeScript 编译器在开发和类型检查期主动拦截此类不可擦除语法，彻底杜绝同类隐患。
  3. 执行 `node relay-server/src/index.ts` 并验证健康探针 `/healthz` 输出正常 `[relay] listening on :8787 (protocol v1, rules 0.7)`。

---

## 5. 实际执行的验证结果

| 命令 / 目标 | 结果 | 细节 |
|---|---|---|
| `node relay-server/src/index.ts` | ✅ 成功监听 | 控制台正常打印 `[relay] listening on :8787 (protocol v1, rules 0.7)` |
| `tsc -b --pretty` | ✅ 退出码 0 | 全工程 TypeScript 类型检查无任何报错（包含 client、game、ai 与 relay） |
| `vitest run` | ✅ **13 个测试套件 / 96 项测试全部通过** | 涵盖 200 局规则回归、120 局 bot 模拟对局、14 项 relay 单元及集成测试 |
| `vite build` | ✅ 构建成功 | 前端静态 bundle 构建成功（dist 输出 323.75 kB） |

---

## 6. 阶段 10 前置条件确认

| 检查项 | 状态 |
|---|---|
| 独立 relay-server 完成并通过全部网络用例测试 | ✅ 已完成 |
| ActionRequest / PlayerView 路由安全隔离（防篡改、防窥视） | ✅ 已验证 |
| 房主权威与断线重连协议就绪 | ✅ 已验证 |
| 单机与规则引擎零入侵，单机运行不依赖 relay | ✅ 保持解耦 |
| 满足进入阶段 10（整合好友对战 UI 与状态同步） | **就绪** |

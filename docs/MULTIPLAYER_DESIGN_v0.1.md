# 好友房间联机技术设计 v0.1

## 1. 架构决定

采用 **Host-authoritative + Socket.IO relay**：房主浏览器是对局权威，Node.js 中继服务只负责房间和消息转发。

```text
房主浏览器（完整 GameState + 规则引擎）
        │                         ▲
        │ Socket.IO messages       │ PlayerView / action result
        ▼                         │
  Node.js + Socket.IO 中继服务（房间码、座位、转发）
        ▲                         │
        │ ActionRequest            │ PlayerView
        │                         ▼
访客浏览器（自己的 PlayerView + 发送动作请求）
```

中继服务不保存完整 GameState、不运行战斗规则、不决定费用、伤害或胜负。房主对所有操作进行权威校验。

## 2. 为什么不用浏览器直连作为第一版

浏览器 P2P WebRTC 也需要交换连接信息；在常见 NAT/防火墙环境下，还可能需要 STUN/TURN 服务。首版为了减少连接失败和排错成本，使用双方主动连接的 WSS 中继。房主仍然是“主机”，因为完整状态和规则执行都在房主浏览器，而不是中继服务。

## 3. 服务端最小职责

- `createRoom`: 生成随机房间码，分配 `host` 座位。
- `joinRoom`: 校验房间存在、guest 空位、房间未开始、版本兼容。
- `setReady` / `selectDeck`: 转发大厅状态；房主可决定何时开始。
- `relayToHost`: 将 guest ActionRequest 转发给 host。
- `relayPlayerView`: 将 host 为 guest 生成的 PlayerView 转发给 guest。
- `reconnect`: 校验座位重连凭证，恢复原座位。
- `closeRoom`: 房主关闭或房间过期时清理资源。

服务器必须从已认证的 socket-room membership 推断座位，不信任客户端自己传来的 `role` 或 `playerId`。

## 4. 最小协议

建议所有事件都携带 `protocolVersion` 和 `roomCode`；开始对局后再携带 `matchId`。

| 事件 | 方向 | 作用 |
|---|---|---|
| `room:create` | client → relay | 创建房间；返回房间码和 host reconnect token |
| `room:join` | client → relay | 使用房间码加入；返回 guest reconnect token |
| `room:state` | relay → clients | 广播房间座位、准备和连接状态，不包含游戏私密信息 |
| `room:selectDeck` | client → relay/host | 选择预设牌组 |
| `room:ready` | client → relay/host | 准备/取消准备 |
| `match:start` | host → relay → guest | 通知对局初始化；不传未过滤的完整状态 |
| `mulligan:submit` | guest → host via relay | 提交自己的换牌选择 |
| `action:request` | guest → host via relay | 提交一个 GameAction 意图 |
| `action:ack` | host → guest via relay | 接受/拒绝及 stateVersion |
| `view:update` | host → relay → guest | 发送访客专属 PlayerView |
| `connection:status` | relay → clients | 对方连接/断线/重连状态 |
| `room:leave` | client → relay | 主动离开 |

### ActionRequest

```ts
interface ActionRequest {
  requestId: string;              // UUID，幂等去重
  expectedStateVersion: number;   // 客户端基于哪个状态发起
  action: GameAction;             // 仅动作意图，不包含计算结果
}
```

### PlayerView

```ts
interface PlayerView {
  protocolVersion: number;
  rulesVersion: string;
  matchId: string;
  stateVersion: number;
  viewerPlayerId: "A" | "B";
  activePlayerId: "A" | "B";
  phase: "turn_start" | "action" | "combat" | "turn_end" | "finished";
  publicState: PublicGameState;
  privateState: {
    hand: CardInstanceView[];
    deckCount: number;
    mulliganOptions?: CardInstanceView[];
  };
}
```

`PublicGameState` 不得包含任何玩家的手牌完整内容、牌库顺序、随机数种子或隐藏选择。`privateState` 只含 `viewerPlayerId` 自己的信息。

## 5. 权威动作处理

1. Guest 点击操作时，前端只生成 `GameAction` 和 requestId。
2. 中继把请求路由到 host，不改写动作含义。
3. Host 核对发送 socket 是否为 guest seat、当前 activePlayer 是否为 guest、`expectedStateVersion` 是否等于当前版本、requestId 是否处理过。
4. Host 调用同一规则引擎 `validateAction`。
5. 合法：执行 `applyAction`，stateVersion +1，保存最近 requestId，生成双方各自 PlayerView。
6. 非法：不修改状态，向 guest 返回错误码和当前 stateVersion。
7. Host 对本人的操作也走统一 action controller，区别只在输入来源，不在规则判定。

## 6. 断线策略

- Guest 短暂断线：房间进入 `paused_for_guest_reconnect`，禁止新的对局动作；120 秒内使用 guest reconnect token 重连，host 重新发送最新 PlayerView。
- Guest 超时未回来：本版将对局标为 interrupted，释放房间；不自动判定胜负。
- Host 断线：host 是唯一权威状态持有者；若无法恢复原页面内存状态，则不能迁移主机。本版将对局标为 interrupted，释放房间，不自动判胜负。
- Host 页面应在离开/刷新时显示警告。网络断开后仍在原页面的短暂自动重连可以继续使用内存中的 GameState。

## 7. 风险与限制

- 房主可访问完整状态并可能篡改本地状态；仅用于熟人休闲对战。
- Relay server 不保存比赛状态，因此不能在 host 关闭页面后恢复对局。
- 同一房间两名用户必须运行兼容的 `rulesVersion` 和 `protocolVersion`。
- 生产环境需要 WSS、来源限制、房间加入频率限制、消息大小限制和随机房间码。
- 不把房间码当成长期身份凭证；重连使用独立随机 token。

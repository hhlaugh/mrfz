/** 阶段 9 中继服务共享类型与配置。中继只管房间与转发，不含任何游戏规则。 */

export const PROTOCOL_VERSION = 1;
export const RULES_VERSION = '0.7';

export type Seat = 'host' | 'guest';

export interface RoomVersions {
  readonly protocolVersion: number;
  readonly rulesVersion: string;
}

export interface RelayConfig {
  /** 访客断线后保留座位等待重连的窗口。 */
  readonly guestReconnectWindowMs: number;
  /** 房主断线后的宽限窗口（短暂网络闪断可原页面恢复）。 */
  readonly hostReconnectWindowMs: number;
  /** 未开局房间的空闲过期时间。 */
  readonly lobbyTtlMs: number;
  /** 清扫器扫描间隔。 */
  readonly sweepIntervalMs: number;
  /** 单条事件负载上限（字节，JSON 序列化后）。 */
  readonly maxPayloadBytes: number;
  /** 限流：窗口内最大消息数。 */
  readonly maxMessagesPerWindow: number;
  /** 限流窗口长度。 */
  readonly rateWindowMs: number;
  /** 允许的 CORS 来源；true 表示开发环境全放行。 */
  readonly origins: readonly string[] | true;
  readonly log?: (message: string) => void;
}

export const DEFAULT_RELAY_CONFIG: RelayConfig = {
  guestReconnectWindowMs: 120_000,
  hostReconnectWindowMs: 15_000,
  lobbyTtlMs: 15 * 60_000,
  sweepIntervalMs: 30_000,
  maxPayloadBytes: 32_768,
  maxMessagesPerWindow: 40,
  rateWindowMs: 5_000,
  origins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
};

export type RelayErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_STARTED'
  | 'ROOM_FULL'
  | 'ALREADY_SEATED'
  | 'TOKEN_INVALID'
  | 'VERSION_MISMATCH'
  | 'HOST_ONLY'
  | 'GUEST_ONLY'
  | 'GUEST_ABSENT'
  | 'NOT_ALL_READY'
  | 'NOT_STARTED'
  | 'MATCH_STARTED'
  | 'ROOM_PAUSED'
  | 'INVALID_PAYLOAD'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'ROOM_CLOSED'
  | 'INTERNAL';

export interface RelayErrorPayload {
  readonly code: RelayErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

/** 房间大厅/连接状态的公开快照（不含任何 token 与游戏私密信息）。 */
export interface RoomStatePayload {
  readonly code: string;
  readonly started: boolean;
  readonly pausedForGuest: boolean;
  readonly host: { readonly connected: boolean; readonly deckId: string | null; readonly ready: boolean };
  readonly guest: { readonly connected: boolean; readonly deckId: string | null; readonly ready: boolean } | null;
}

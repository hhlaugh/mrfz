import { randomBytes, randomUUID } from 'node:crypto';
import type { RelayConfig, RelayErrorCode, RoomStatePayload, RoomVersions, Seat } from './types.ts';

/** 房间码字符表：排除 0/O、1/I/L 等易混淆字符。 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface SeatInfo {
  token: string;
  occupied: boolean;
  connected: boolean;
  connId: string | null;
  deckId: string | null;
  ready: boolean;
  disconnectedAt: number | null;
}

export interface Room {
  readonly code: string;
  readonly versions: RoomVersions;
  matchId: string | null;
  started: boolean;
  closed: boolean;
  closeReason: string | null;
  pausedForGuest: boolean;
  readonly host: SeatInfo;
  guest: SeatInfo | null;
  createdAt: number;
  lastActivityAt: number;
}

/** 管理器产生的待发送消息；接线层负责映射到 socket。 */
export interface Envelope {
  readonly roomCode: string;
  readonly seat: Seat | 'all';
  readonly event: string;
  readonly payload: unknown;
}

export type Emit = (envelope: Envelope) => void;

export type Result<T> = { ok: true; value: T } | { ok: false; error: RelayErrorCode; message: string };

function fail<T>(error: RelayErrorCode, message: string): Result<T> {
  return { ok: false, error, message };
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function generateCode(rooms: Map<string, Room>): string {
  let code = '';
  do {
    const bytes = randomBytes(8);
    code = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  } while (rooms.has(code));
  return code;
}

function seatInfo(token: string, connId: string | null): SeatInfo {
  return { token, occupied: connId !== null, connected: connId !== null, connId, deckId: null, ready: false, disconnectedAt: null };
}

export function roomStatePayload(room: Room): RoomStatePayload {
  return {
    code: room.code,
    started: room.started,
    pausedForGuest: room.pausedForGuest,
    host: { connected: room.host.connected, deckId: room.host.deckId, ready: room.host.ready },
    guest: room.guest ? { connected: room.guest.connected, deckId: room.guest.deckId, ready: room.guest.ready } : null,
  };
}

function isRoomVersions(value: unknown): value is RoomVersions {
  if (typeof value !== 'object' || value === null) return false;
  const versions = value as Record<string, unknown>;
  return typeof versions.protocolVersion === 'number' && Number.isInteger(versions.protocolVersion) && versions.protocolVersion > 0 && typeof versions.rulesVersion === 'string' && versions.rulesVersion.length > 0;
}

/**
 * 纯逻辑房间管理器：不依赖 Socket.IO；emit 回调由接线层注入。
 * 座位永远由连接关系（connId）推断，绝不信任客户端自报的角色。
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly seats = new Map<string, { code: string; seat: Seat }>();
  private readonly config: RelayConfig;
  private readonly emit: Emit;
  private readonly now: () => number;

  constructor(
    config: RelayConfig,
    emit: Emit,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.emit = emit;
    this.now = now;
  }

  roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  seatOf(connId: string): { code: string; seat: Seat } | undefined {
    return this.seats.get(connId);
  }

  connIdFor(roomCode: string, seat: Seat): string | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const info = seat === 'host' ? room.host : room.guest;
    return info && info.connected ? info.connId : null;
  }

  createRoom(connId: string, versions: unknown): Result<{ code: string; token: string }> {
    if (this.seats.has(connId)) return fail('ALREADY_SEATED', '该连接已有座位。');
    if (!isRoomVersions(versions)) return fail('INVALID_PAYLOAD', '版本信息不合法。');
    const now = this.now();
    const room: Room = {
      code: generateCode(this.rooms),
      versions: { ...versions },
      matchId: null,
      started: false,
      closed: false,
      closeReason: null,
      pausedForGuest: false,
      host: seatInfo(newToken(), connId),
      guest: null,
      createdAt: now,
      lastActivityAt: now,
    };
    this.rooms.set(room.code, room);
    this.seats.set(connId, { code: room.code, seat: 'host' });
    return { ok: true, value: { code: room.code, token: room.host.token } };
  }

  joinRoom(connId: string, code: string, versions: unknown): Result<{ room: Room; token: string }> {
    if (this.seats.has(connId)) return fail('ALREADY_SEATED', '该连接已有座位。');
    const room = this.rooms.get(code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '房间不存在或已过期。');
    if (room.started) return fail('ROOM_STARTED', '对局已开始，无法再加入。');
    if (room.guest?.occupied) return fail('ROOM_FULL', '房间已满（1 个房主 + 1 个访客）。');
    if (!isRoomVersions(versions)) return fail('INVALID_PAYLOAD', '版本信息不合法。');
    if (room.versions.protocolVersion !== versions.protocolVersion || room.versions.rulesVersion !== versions.rulesVersion) {
      return fail('VERSION_MISMATCH', '协议或规则版本不兼容，请刷新到相同版本。');
    }
    room.guest = seatInfo(newToken(), connId);
    this.seats.set(connId, { code: room.code, seat: 'guest' });
    room.lastActivityAt = this.now();
    this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
    return { ok: true, value: { room, token: room.guest.token } };
  }

  /** 使用座位重连凭证恢复原座位；同座位旧连接被静默接管（旧 socket 稍后断开时按 stale 忽略）。 */
  rejoin(connId: string, code: string, token: unknown): Result<{ room: Room; seat: Seat; reconnected: boolean }> {
    const room = this.rooms.get(code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '房间不存在或已结束。');
    if (typeof token !== 'string' || token.length === 0) return fail('INVALID_PAYLOAD', '缺少重连凭证。');
    const seat: Seat = room.host.token === token ? 'host' : room.guest && room.guest.token === token ? 'guest' : 'host';
    const info = room.host.token === token ? room.host : room.guest && room.guest.token === token ? room.guest : null;
    if (!info) return fail('TOKEN_INVALID', '重连凭证无效。');
    const reconnected = !info.connected;
    const staleConnId = info.connId !== connId ? info.connId : null;
    if (staleConnId) this.seats.delete(staleConnId);
    info.occupied = true;
    info.connected = true;
    info.connId = connId;
    info.disconnectedAt = null;
    this.seats.set(connId, { code: room.code, seat });
    room.lastActivityAt = this.now();
    if (seat === 'guest' && room.pausedForGuest) {
      room.pausedForGuest = false;
    }
    this.emit({ roomCode: room.code, seat: 'all', event: 'connection:status', payload: { seat, connected: true, reconnected } });
    if (room.started && seat === 'guest' && reconnected) {
      // 通知房主向访客补发最新 PlayerView（视图由房主生成，中继不缓存）。
      this.emit({ roomCode: room.code, seat: 'host', event: 'view:resend', payload: { matchId: room.matchId } });
    }
    return { ok: true, value: { room, seat, reconnected } };
  }

  selectDeck(connId: string, deckId: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    const room = seatRef ? this.rooms.get(seatRef.code) : undefined;
    if (!seatRef || !room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (room.started) return fail('MATCH_STARTED', '对局已开始，不能更换牌组。');
    if (typeof deckId !== 'string' || deckId.length === 0 || deckId.length > 32) return fail('INVALID_PAYLOAD', 'deckId 不合法。');
    const info = seatRef.seat === 'host' ? room.host : room.guest;
    if (!info) return fail('ROOM_NOT_FOUND', '座位不存在。');
    info.deckId = deckId;
    room.lastActivityAt = this.now();
    this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
    return { ok: true, value: { room } };
  }

  setReady(connId: string, ready: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    const room = seatRef ? this.rooms.get(seatRef.code) : undefined;
    if (!seatRef || !room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (room.started) return fail('MATCH_STARTED', '对局已开始。');
    if (typeof ready !== 'boolean') return fail('INVALID_PAYLOAD', 'ready 必须是布尔值。');
    const info = seatRef.seat === 'host' ? room.host : room.guest;
    if (!info) return fail('ROOM_NOT_FOUND', '座位不存在。');
    info.ready = ready;
    room.lastActivityAt = this.now();
    this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
    return { ok: true, value: { room } };
  }

  startMatch(connId: string): Result<{ room: Room; matchId: string }> {
    const seatRef = this.seats.get(connId);
    const room = seatRef ? this.rooms.get(seatRef.code) : undefined;
    if (!seatRef || !room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (seatRef.seat !== 'host') return fail('HOST_ONLY', '只有房主可以开始对局。');
    if (room.started) return fail('MATCH_STARTED', '对局已经开始。');
    if (!room.guest?.occupied) return fail('GUEST_ABSENT', '访客尚未加入。');
    if (!room.host.ready || !room.guest.ready) return fail('NOT_ALL_READY', '双方都准备后才能开始。');
    room.started = true;
    room.matchId = randomUUID();
    room.lastActivityAt = this.now();
    this.emit({
      roomCode: room.code,
      seat: 'all',
      event: 'match:start',
      payload: { matchId: room.matchId, hostDeckId: room.host.deckId, guestDeckId: room.guest.deckId },
    });
    return { ok: true, value: { room, matchId: room.matchId } };
  }

  /** 访客动作意图 → 房主。中继不改写动作含义，只做来源座位归属。 */
  guestAction(connId: string, request: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    if (!seatRef || seatRef.seat !== 'guest') return fail('GUEST_ONLY', '只有访客通过中继提交动作。');
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (!room.started) return fail('NOT_STARTED', '对局尚未开始。');
    if (room.pausedForGuest) return fail('ROOM_PAUSED', '访客断线重连中，动作暂不受理。');
    this.emit({ roomCode: room.code, seat: 'host', event: 'action:request', payload: { matchId: room.matchId, request } });
    return { ok: true, value: { room } };
  }

  /** 房主生成的访客专属视图 → 访客。 */
  hostView(connId: string, view: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    if (!seatRef || seatRef.seat !== 'host') return fail('HOST_ONLY', '只有房主可以发布视图。');
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (!room.started) return fail('NOT_STARTED', '对局尚未开始。');
    this.emit({ roomCode: room.code, seat: 'guest', event: 'view:update', payload: { matchId: room.matchId, view } });
    return { ok: true, value: { room } };
  }

  hostAck(connId: string, ack: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    if (!seatRef || seatRef.seat !== 'host') return fail('HOST_ONLY', '只有房主可以回执动作结果。');
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    this.emit({ roomCode: room.code, seat: 'guest', event: 'action:ack', payload: { matchId: room.matchId, ack } });
    return { ok: true, value: { room } };
  }

  guestMulligan(connId: string, selections: unknown): Result<{ room: Room }> {
    const seatRef = this.seats.get(connId);
    if (!seatRef || seatRef.seat !== 'guest') return fail('GUEST_ONLY', '只有访客通过中继提交换牌。');
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (!room.started) return fail('NOT_STARTED', '对局尚未开始。');
    this.emit({ roomCode: room.code, seat: 'host', event: 'mulligan:submit', payload: { matchId: room.matchId, selections } });
    return { ok: true, value: { room } };
  }

  /** 主动离开：开局后视为放弃对局，立即中断；大厅内按座位处理。 */
  leave(connId: string): Result<{ closed: boolean }> {
    const seatRef = this.seats.get(connId);
    if (!seatRef) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) return fail('ROOM_NOT_FOUND', '不在任何房间中。');
    if (!room.started) {
      if (seatRef.seat === 'host') {
        this.closeRoom(room, 'HOST_LEFT');
        return { ok: true, value: { closed: true } };
      }
      this.seats.delete(connId);
      room.guest = null;
      room.lastActivityAt = this.now();
      this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
      return { ok: true, value: { closed: false } };
    }
    this.closeRoom(room, seatRef.seat === 'host' ? 'HOST_LEFT' : 'GUEST_LEFT');
    return { ok: true, value: { closed: true } };
  }

  /** 网络断开（非主动离开）：大厅按座位即时处理；开局后进入重连宽限窗口。 */
  handleDisconnect(connId: string): void {
    const seatRef = this.seats.get(connId);
    if (!seatRef) return;
    const room = this.rooms.get(seatRef.code);
    if (!room || room.closed) {
      this.seats.delete(connId);
      return;
    }
    const info = seatRef.seat === 'host' ? room.host : room.guest;
    if (!info || info.connId !== connId) return; // stale 连接（已被新连接接管）
    this.seats.delete(connId);
    const now = this.now();
    info.connected = false;
    info.connId = null;
    info.disconnectedAt = now;
    const windowMs = seatRef.seat === 'host' ? this.config.hostReconnectWindowMs : this.config.guestReconnectWindowMs;
    this.emit({ roomCode: room.code, seat: 'all', event: 'connection:status', payload: { seat: seatRef.seat, connected: false, reconnectWindowMs: windowMs } });
    if (!room.started) {
      if (seatRef.seat === 'host') {
        this.closeRoom(room, 'HOST_LEFT');
        return;
      }
      // 大厅内访客断线：立即释放座位，旧 token 作废。
      room.guest = null;
      this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
      return;
    }
    if (seatRef.seat === 'guest') {
      room.pausedForGuest = true;
      this.emit({ roomCode: room.code, seat: 'all', event: 'room:state', payload: roomStatePayload(room) });
    }
  }

  /** 清扫器：大厅过期与开局后重连窗口超时。返回被关闭的房间。 */
  sweep(now: number = this.now()): readonly { code: string; reason: string }[] {
    const closed: { code: string; reason: string }[] = [];
    for (const room of [...this.rooms.values()]) {
      if (room.closed) continue;
      if (!room.started && now - room.lastActivityAt > this.config.lobbyTtlMs) {
        this.closeRoom(room, 'EXPIRED');
        closed.push({ code: room.code, reason: 'EXPIRED' });
        continue;
      }
      if (room.started) {
        const hostGone = !room.host.connected && room.host.disconnectedAt !== null && now - room.host.disconnectedAt > this.config.hostReconnectWindowMs;
        const guestGone = room.guest?.occupied && !room.guest.connected && room.guest.disconnectedAt !== null && now - room.guest.disconnectedAt > this.config.guestReconnectWindowMs;
        if (hostGone) {
          this.closeRoom(room, 'HOST_TIMEOUT');
          closed.push({ code: room.code, reason: 'HOST_TIMEOUT' });
          continue;
        }
        if (guestGone) {
          this.closeRoom(room, 'GUEST_TIMEOUT');
          closed.push({ code: room.code, reason: 'GUEST_TIMEOUT' });
        }
      }
    }
    return closed;
  }

  closeRoom(room: Room, reason: string): void {
    if (room.closed) return;
    room.closed = true;
    room.closeReason = reason;
    this.emit({ roomCode: room.code, seat: 'all', event: 'room:closed', payload: { reason } });
    if (room.host.connId) this.seats.delete(room.host.connId);
    if (room.guest?.connId) this.seats.delete(room.guest.connId);
    this.rooms.delete(room.code);
  }
}

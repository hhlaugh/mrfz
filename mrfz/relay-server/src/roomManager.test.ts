import { describe, expect, it } from 'vitest';
import type { RelayConfig } from './types.ts';
import type { Envelope } from './roomManager.ts';
import { CODE_ALPHABET, RoomManager } from './roomManager.ts';

const BASE_NOW = 1_000_000;

function testConfig(): RelayConfig {
  return {
    guestReconnectWindowMs: 100,
    hostReconnectWindowMs: 50,
    lobbyTtlMs: 200,
    sweepIntervalMs: 1000,
    maxPayloadBytes: 1024,
    maxMessagesPerWindow: 10,
    rateWindowMs: 1000,
    origins: true,
  };
}

interface Harness {
  manager: RoomManager;
  sent: Envelope[];
  now: () => number;
  advance: (ms: number) => void;
  create: (connId: string) => { code: string; token: string };
  join: (connId: string, code: string) => { token: string };
  start: (hostConnId: string) => string;
}

function makeHarness(): Harness {
  let current = BASE_NOW;
  const sent: Envelope[] = [];
  const manager = new RoomManager(testConfig(), (envelope) => sent.push(envelope), () => current);
  const versions = { protocolVersion: 1, rulesVersion: '0.7' };
  return {
    manager,
    sent,
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    create: (connId) => {
      const result = manager.createRoom(connId, versions);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    join: (connId, code) => {
      const result = manager.joinRoom(connId, code, versions);
      if (!result.ok) throw new Error(`${result.error}: ${result.message}`);
      return result.value;
    },
    start: (hostConnId) => {
      const result = manager.startMatch(hostConnId);
      if (!result.ok) throw new Error(`${result.error}: ${result.message}`);
      return result.value.matchId;
    },
  };
}

describe('RoomManager', () => {
  it('generates unambiguous 8-character room codes', () => {
    const harness = makeHarness();
    const codes = new Set<string>();
    for (let index = 0; index < 100; index += 1) {
      const { code } = harness.create(`conn-${index}`);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(100);
    expect(CODE_ALPHABET).not.toContain('0');
    expect(CODE_ALPHABET).not.toContain('O');
    expect(CODE_ALPHABET).not.toContain('1');
    expect(CODE_ALPHABET).not.toContain('I');
    expect(CODE_ALPHABET).not.toContain('L');
  });

  it('accepts one guest, rejects third joiner / duplicate seats / unknown code / version mismatch', () => {
    const harness = makeHarness();
    const { code } = harness.create('host');
    // 版本不兼容在满员判断之前无法触达满员房间，用空房间先验证：
    const fresh = harness.create('host-v');
    expect(harness.manager.joinRoom('wanderer', fresh.code, { protocolVersion: 2, rulesVersion: '0.7' })).toMatchObject({ ok: false, error: 'VERSION_MISMATCH' });
    expect(harness.manager.joinRoom('wanderer', fresh.code, { protocolVersion: 1, rulesVersion: '0.6' })).toMatchObject({ ok: false, error: 'VERSION_MISMATCH' });
    expect(harness.join('guest', code).token).toBeTruthy();
    const third = harness.manager.joinRoom('third', code, { protocolVersion: 1, rulesVersion: '0.7' });
    expect(third).toMatchObject({ ok: false, error: 'ROOM_FULL' });
    expect(harness.manager.joinRoom('host', code, { protocolVersion: 1, rulesVersion: '0.7' })).toMatchObject({ ok: false, error: 'ALREADY_SEATED' });
    expect(harness.manager.joinRoom('wanderer', 'ZZZZ9999', { protocolVersion: 1, rulesVersion: '0.7' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('gates match start (host only, guest present, both ready) and forwards guest actions/views', () => {
    const harness = makeHarness();
    const { code } = harness.create('host');
    expect(harness.manager.startMatch('host')).toMatchObject({ ok: false, error: 'GUEST_ABSENT' });
    harness.join('guest', code);
    expect(harness.manager.startMatch('guest')).toMatchObject({ ok: false, error: 'HOST_ONLY' });
    // 开局前访客动作被拒：
    expect(harness.manager.guestAction('guest', { requestId: 'early', expectedStateVersion: 1, action: { type: 'end_action_phase' } })).toMatchObject({ ok: false, error: 'NOT_STARTED' });
    expect(harness.manager.startMatch('host')).toMatchObject({ ok: false, error: 'NOT_ALL_READY' });
    harness.manager.setReady('host', true);
    harness.manager.setReady('guest', true);
    const started = harness.manager.startMatch('host');
    expect(started.ok).toBe(true);
    if (started.ok) expect(started.value.matchId).toBeTruthy();
    expect(harness.manager.joinRoom('late', code, { protocolVersion: 1, rulesVersion: '0.7' })).toMatchObject({ ok: false, error: 'ROOM_STARTED' });

    const before = harness.sent.length;
    expect(harness.manager.guestAction('host', { requestId: 'x', expectedStateVersion: 1, action: { type: 'end_action_phase' } })).toMatchObject({ ok: false, error: 'GUEST_ONLY' });
    expect(harness.manager.guestAction('guest', { requestId: 'r1', expectedStateVersion: 1, action: { type: 'end_action_phase' } })).toMatchObject({ ok: true });
    const forwarded = harness.sent.slice(before);
    expect(forwarded.some((envelope) => envelope.event === 'action:request' && envelope.seat === 'host')).toBe(true);

    expect(harness.manager.hostView('guest', { any: 'view' })).toMatchObject({ ok: false, error: 'HOST_ONLY' });
    const viewBefore = harness.sent.length;
    expect(harness.manager.hostView('host', { any: 'view' })).toMatchObject({ ok: true });
    expect(harness.sent.slice(viewBefore).some((envelope) => envelope.event === 'view:update' && envelope.seat === 'guest')).toBe(true);
  });

  it('pauses on guest disconnect, resumes on token rejoin, asks host to resend view', () => {
    const harness = makeHarness();
    const { code } = harness.create('host');
    harness.join('guest', code);
    harness.manager.setReady('host', true);
    harness.manager.setReady('guest', true);
    harness.start('host');
    harness.manager.handleDisconnect('guest');
    const room = harness.manager.getRoom(code)!;
    expect(room.pausedForGuest).toBe(true);
    expect(harness.sent.some((envelope) => envelope.event === 'connection:status' && (envelope.payload as { seat: string }).seat === 'guest' && (envelope.payload as { connected: boolean }).connected === false)).toBe(true);

    const bad = harness.manager.rejoin('guest-new', code, 'wrong-token');
    expect(bad).toMatchObject({ ok: false, error: 'TOKEN_INVALID' });

    const rejoin = harness.manager.rejoin('guest-new', code, harness.manager.getRoom(code)!.guest!.token);
    expect(rejoin).toMatchObject({ ok: true });
    if (rejoin.ok) expect(rejoin.value.reconnected).toBe(true);
    const resumed = harness.manager.getRoom(code)!;
    expect(resumed.pausedForGuest).toBe(false);
    expect(resumed.guest!.connected).toBe(true);
    expect(harness.sent.some((envelope) => envelope.event === 'view:resend' && envelope.seat === 'host')).toBe(true);
  });

  it('closes started rooms when host or guest exceeds the reconnect window', () => {
    const harness = makeHarness();
    const { code } = harness.create('host-a');
    harness.join('guest-a', code);
    harness.manager.setReady('host-a', true);
    harness.manager.setReady('guest-a', true);
    harness.start('host-a');
    harness.manager.handleDisconnect('host-a');
    harness.advance(51);
    expect(harness.manager.sweep(harness.now()).map((entry) => entry.reason)).toEqual(['HOST_TIMEOUT']);
    expect(harness.manager.getRoom(code)).toBeUndefined();

    const second = harness.create('host-b');
    harness.join('guest-b', second.code);
    harness.manager.setReady('host-b', true);
    harness.manager.setReady('guest-b', true);
    harness.start('host-b');
    harness.manager.handleDisconnect('guest-b');
    harness.advance(101);
    expect(harness.manager.sweep(harness.now()).map((entry) => entry.reason)).toEqual(['GUEST_TIMEOUT']);
    expect(harness.manager.getRoom(second.code)).toBeUndefined();
  });

  it('expires idle lobbies and handles lobby host/guest departure', () => {
    const harness = makeHarness();
    const { code } = harness.create('host');
    harness.join('guest', code);
    harness.advance(201);
    expect(harness.manager.sweep(harness.now()).map((entry) => entry.reason)).toEqual(['EXPIRED']);
    expect(harness.manager.joinRoom('late', code, { protocolVersion: 1, rulesVersion: '0.7' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });

    const hostLeft = harness.create('host-2');
    harness.manager.leave('host-2');
    expect(harness.manager.getRoom(hostLeft.code)).toBeUndefined();

    const guestLeft = harness.create('host-3');
    const joined = harness.join('guest-3', guestLeft.code);
    harness.manager.leave('guest-3');
    const room = harness.manager.getRoom(guestLeft.code)!;
    expect(room.guest).toBeNull();
    expect(harness.manager.rejoin('guest-3', guestLeft.code, joined.token)).toMatchObject({ ok: false, error: 'TOKEN_INVALID' });
    expect(harness.join('guest-4', guestLeft.code).token).toBeTruthy();
  });

  it('interrupts a started match immediately on explicit leave', () => {
    const harness = makeHarness();
    const { code } = harness.create('host');
    harness.join('guest', code);
    harness.manager.setReady('host', true);
    harness.manager.setReady('guest', true);
    harness.start('host');
    harness.manager.leave('guest');
    expect(harness.manager.getRoom(code)).toBeUndefined();
    expect(harness.sent.some((envelope) => envelope.event === 'room:closed' && (envelope.payload as { reason: string }).reason === 'GUEST_LEFT')).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { RelayConfig } from './types.ts';
import { createRelayServer, type RelayRuntime } from './index.ts';

let runtime: RelayRuntime;
let port = 0;

const testConfig: Partial<RelayConfig> = {
  guestReconnectWindowMs: 100,
  hostReconnectWindowMs: 50,
  lobbyTtlMs: 60_000,
  sweepIntervalMs: 60_000,
  maxPayloadBytes: 1024,
  maxMessagesPerWindow: 20,
  rateWindowMs: 500,
  origins: true,
};

beforeAll(async () => {
  runtime = createRelayServer(undefined, testConfig);
  await new Promise<void>((resolve) => runtime.httpServer.listen(0, '127.0.0.1', resolve));
  const address = runtime.httpServer.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await runtime.close();
});

function connect(): Socket {
  return io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 2500, predicate?: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      reject(new Error(`等待 ${event} 超时`));
    }, timeoutMs);
    const on = (payload: T) => {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, on);
      resolve(payload);
    };
    socket.on(event, on);
  });
}

function nextDisconnect(socket: Socket, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待断开超时')), timeoutMs);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const VERSIONS = { protocolVersion: 1, rulesVersion: '0.7' };

async function createHost(): Promise<{ socket: Socket; code: string; token: string }> {
  const socket = connect();
  const created = waitFor<{ code: string; token: string }>(socket, 'room:created');
  socket.emit('room:create', { ...VERSIONS });
  const payload = await created;
  return { socket, code: payload.code, token: payload.token };
}

async function joinGuest(code: string): Promise<{ socket: Socket; token: string }> {
  const socket = connect();
  const joined = waitFor<{ token: string }>(socket, 'room:joined');
  socket.emit('room:join', { roomCode: code, ...VERSIONS });
  const payload = await joined;
  return { socket, token: payload.token };
}

async function startReadyMatch(): Promise<{ host: Socket; guest: Socket; code: string; guestToken: string }> {
  const host = await createHost();
  const guest = await joinGuest(host.code);
  await readyBothAndStart(host.socket, guest.socket, host.code);
  return { host: host.socket, guest: guest.socket, code: host.code, guestToken: guest.token };
}

/** 跨 socket 消息无顺序保证：先挂上“双方 ready”的状态广播监听，再发送选牌/准备，最后开局。 */
async function readyBothAndStart(host: Socket, guest: Socket, code: string): Promise<{ matchId: string }> {
  const bothReady = waitFor<{ host: { ready: boolean }; guest: { ready: boolean } | null }>(host, 'room:state', 2500, (payload) => {
    const state = payload as { host: { ready: boolean }; guest: { ready: boolean } | null };
    return state.host.ready === true && state.guest !== null && state.guest.ready === true;
  });
  host.emit('room:selectDeck', { roomCode: code, deckId: 'DEMO-DECK-A' });
  guest.emit('room:selectDeck', { roomCode: code, deckId: 'DEMO-DECK-B' });
  host.emit('room:ready', { roomCode: code, ready: true });
  guest.emit('room:ready', { roomCode: code, ready: true });
  await bothReady;
  const startedHost = waitFor<{ matchId: string }>(host, 'match:start');
  const startedGuest = waitFor<{ matchId: string }>(guest, 'match:start');
  host.emit('match:start', { roomCode: code });
  const [a, b] = await Promise.all([startedHost, startedGuest]);
  expect(a.matchId).toBe(b.matchId);
  return { matchId: a.matchId };
}

describe('relay server (socket.io integration)', () => {
  it('routes guest actions to the host and host view/ack only to the guest; forwards mulligan', async () => {
    const { host, guest, code } = await startReadyMatch();
    guest.emit('mulligan:submit', { roomCode: code, selections: [] });
    const mulligan = await waitFor<{ selections: string[] }>(host, 'mulligan:submit');
    expect(mulligan.selections).toEqual([]);

    guest.emit('action:request', { roomCode: code, request: { requestId: 'req-1', expectedStateVersion: 1, action: { type: 'end_action_phase' } } });
    const forwarded = await waitFor<{ matchId: string; request: { requestId: string } }>(host, 'action:request');
    expect(forwarded.request.requestId).toBe('req-1');
    expect(forwarded.matchId).toBeTruthy();

    let hostGotView = false;
    host.on('view:update', () => {
      hostGotView = true;
    });
    host.emit('action:ack', { roomCode: code, ack: { requestId: 'req-1', ok: true, stateVersion: 2 } });
    const ack = await waitFor<{ ack: { requestId: string } }>(guest, 'action:ack');
    expect(ack.ack.requestId).toBe('req-1');
    host.emit('view:update', { roomCode: code, view: { stateVersion: 2, hand: ['secret'] } });
    const view = await waitFor<{ view: { stateVersion: number } }>(guest, 'view:update');
    expect(view.view.stateVersion).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(hostGotView).toBe(false);
    host.off('view:update');
  }, 10_000);

  it('rejects a third joiner with ROOM_FULL', async () => {
    const { code } = await createHost();
    await joinGuest(code);
    const third = connect();
    const error = waitFor<{ code: string }>(third, 'room:error');
    third.emit('room:join', { roomCode: code, ...VERSIONS });
    expect((await error).code).toBe('ROOM_FULL');
    third.close();
  }, 10_000);

  it('rejects unknown code, duplicate seat, started room, and version mismatch', async () => {
    const wanderer = connect();
    const notFound = waitFor<{ code: string }>(wanderer, 'room:error');
    wanderer.emit('room:join', { roomCode: 'ZZZZ9999', ...VERSIONS });
    expect((await notFound).code).toBe('ROOM_NOT_FOUND');
    wanderer.close();

    const { socket, code } = await createHost();
    const duplicate = waitFor<{ code: string }>(socket, 'room:error');
    socket.emit('room:join', { roomCode: code, ...VERSIONS });
    expect((await duplicate).code).toBe('ALREADY_SEATED');

    const mismatched = connect();
    const mismatch = waitFor<{ code: string }>(mismatched, 'room:error');
    mismatched.emit('room:join', { roomCode: code, protocolVersion: 1, rulesVersion: '0.6' });
    expect((await mismatch).code).toBe('VERSION_MISMATCH');
    mismatched.close();

    const guest = await joinGuest(code);
    const late = connect();
    await readyBothAndStart(socket, guest.socket, code);
    const started = waitFor<{ code: string }>(late, 'room:error');
    late.emit('room:join', { roomCode: code, ...VERSIONS });
    expect((await started).code).toBe('ROOM_STARTED');
    late.close();
  }, 15_000);

  it('pauses on guest disconnect, rejects forged tokens, and resumes with the real token (view resend requested)', async () => {
    const { host, guest, code, guestToken } = await startReadyMatch();
    guest.disconnect();
    await waitFor<{ connected: boolean; seat: string }>(host, 'connection:status', 2500, (payload) => payload.seat === 'guest' && payload.connected === false);

    const forged = connect();
    const forgedError = waitFor<{ code: string }>(forged, 'room:error');
    forged.emit('room:rejoin', { roomCode: code, token: 'forged-token' });
    expect((await forgedError).code).toBe('TOKEN_INVALID');
    forged.close();

    const resumed = waitFor<{ connected: boolean; seat: string }>(host, 'connection:status', 2500, (payload) => payload.seat === 'guest' && payload.connected === true);
    const viewResend = waitFor<{ matchId: string | null }>(host, 'view:resend');
    const legit = connect();
    const rejoined = waitFor<{ seat: string; reconnected: boolean }>(legit, 'room:joined');
    legit.emit('room:rejoin', { roomCode: code, token: guestToken });
    const rejoinedPayload = await rejoined;
    expect(rejoinedPayload.seat).toBe('guest');
    expect(rejoinedPayload.reconnected).toBe(true);
    expect((await resumed).connected).toBe(true);
    expect(await viewResend).toBeTruthy();
    legit.close();
  }, 15_000);

  it('rejects oversized payloads with PAYLOAD_TOO_LARGE', async () => {
    const { socket, code } = await createHost();
    const error = waitFor<{ code: string }>(socket, 'room:error');
    socket.emit('room:selectDeck', { roomCode: code, deckId: 'x'.repeat(2000) });
    expect((await error).code).toBe('PAYLOAD_TOO_LARGE');
  }, 10_000);

  it('rate limits bursting clients and disconnects repeat offenders', async () => {
    const { socket, code } = await createHost();
    const disconnected = nextDisconnect(socket);
    const limited = waitFor<{ code: string }>(socket, 'room:error', 4000, (payload) => payload.code === 'RATE_LIMITED');
    for (let index = 0; index < 60; index += 1) {
      socket.emit('room:ready', { roomCode: code, ready: index % 2 === 0 });
    }
    await limited;
    await disconnected;
  }, 15_000);

  it('rejects guest attempts to start the match (seat inferred server-side)', async () => {
    const host = await createHost();
    const guest = await joinGuest(host.code);
    const error = waitFor<{ code: string }>(guest.socket, 'room:error');
    guest.socket.emit('match:start', { roomCode: host.code });
    expect((await error).code).toBe('HOST_ONLY');
    guest.socket.close();
  }, 10_000);
});

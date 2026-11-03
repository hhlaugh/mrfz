import { createServer, type Server as HttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { isActionRequest, isActionAck } from '../../src/client/protocol.ts';
import { RoomManager } from './roomManager.ts';
import { DEFAULT_RELAY_CONFIG, PROTOCOL_VERSION, RULES_VERSION } from './types.ts';
import type { RelayConfig, RelayErrorPayload } from './types.ts';

const MAX_SOCKET_IO_PAYLOAD = 65_536;

class RateLimiter {
  private hits: number[] = [];
  private violations = 0;
  private readonly config: RelayConfig;

  constructor(config: RelayConfig) {
    this.config = config;
  }

  /** 返回 true 表示允许；超限时记录违规并返回 false（连续第二次违规将被断开）。 */
  allow(now: number = Date.now()): boolean {
    this.hits = this.hits.filter((timestamp) => now - timestamp < this.config.rateWindowMs);
    if (this.hits.length >= this.config.maxMessagesPerWindow) {
      this.violations += 1;
      return false;
    }
    this.hits.push(now);
    return true;
  }

  shouldDisconnect(): boolean {
    return this.violations >= 2;
  }
}

export interface RelayRuntime {
  readonly httpServer: HttpServer;
  readonly manager: RoomManager;
  close(): Promise<void>;
}

export function createRelayServer(httpServer?: HttpServer, overrides: Partial<RelayConfig> = {}): RelayRuntime {
  const config: RelayConfig = { ...DEFAULT_RELAY_CONFIG, ...overrides };
  const ownHttpServer = httpServer ?? createServer();
  const io = new Server(ownHttpServer, {
    cors: { origin: config.origins === true ? true : [...config.origins], methods: ['GET', 'POST'] },
    maxHttpBufferSize: MAX_SOCKET_IO_PAYLOAD,
  });
  const log = (message: string) => config.log?.(`[relay] ${message}`);

  const manager = new RoomManager(config, (envelope) => {
    if (envelope.seat === 'all') {
      io.to(envelope.roomCode).emit(envelope.event, envelope.payload);
      return;
    }
    const connId = manager.connIdFor(envelope.roomCode, envelope.seat);
    if (connId) io.to(connId).emit(envelope.event, envelope.payload);
  });

  const sendError = (socket: Socket, code: RelayErrorPayload['code'], message: string, requestId?: string) => {
    socket.emit('room:error', { code, message, ...(requestId !== undefined ? { requestId } : {}) } satisfies RelayErrorPayload);
  };

  const payloadSize = (payload: unknown): number => {
    try {
      return JSON.stringify(payload ?? null).length;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  };

  io.on('connection', (socket) => {
    const limiter = new RateLimiter(config);
    log(`connected ${socket.id}`);

    const reject = (code: RelayErrorPayload['code'], message: string, requestId?: string) => {
      sendError(socket, code, message, requestId);
      log(`error ${socket.id} ${code}${requestId ? ` requestId=${requestId}` : ''}`);
    };

    /** 统一入口：限流 → 大小限制 → 交给处理函数。 */
    const handle = (event: string, handler: (payload: unknown) => void) => {
      socket.on(event, (payload: unknown) => {
        if (!limiter.allow()) {
          reject('RATE_LIMITED', '消息频率超限。');
          if (limiter.shouldDisconnect()) socket.disconnect(true);
          return;
        }
        if (payloadSize(payload) > config.maxPayloadBytes) {
          reject('PAYLOAD_TOO_LARGE', `单条消息超过 ${config.maxPayloadBytes} 字节上限。`);
          return;
        }
        try {
          handler(payload);
        } catch (error) {
          reject('INTERNAL', error instanceof Error ? error.message : '内部错误。');
        }
      });
    };

    const requireRoom = (payload: unknown): { code: string; body: Record<string, unknown> } | null => {
      if (typeof payload !== 'object' || payload === null) {
        reject('INVALID_PAYLOAD', '负载必须是对象。');
        return null;
      }
      const body = payload as Record<string, unknown>;
      if (typeof body.roomCode !== 'string' || body.roomCode.length === 0) {
        reject('INVALID_PAYLOAD', '缺少 roomCode。');
        return null;
      }
      return { code: body.roomCode, body };
    };

    handle('room:create', (payload) => {
      const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
      const result = manager.createRoom(socket.id, { protocolVersion: body.protocolVersion ?? PROTOCOL_VERSION, rulesVersion: body.rulesVersion ?? RULES_VERSION });
      if (!result.ok) {
        reject(result.error, result.message);
        return;
      }
      socket.join(result.value.code);
      log(`room created ${result.value.code}`);
      socket.emit('room:created', { code: result.value.code, seat: 'host', token: result.value.token, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION });
    });

    handle('room:join', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.joinRoom(socket.id, scoped.code, { protocolVersion: scoped.body.protocolVersion ?? PROTOCOL_VERSION, rulesVersion: scoped.body.rulesVersion ?? RULES_VERSION });
      if (!result.ok) {
        reject(result.error, result.message);
        return;
      }
      socket.join(result.value.room.code);
      log(`room joined ${result.value.room.code}`);
      socket.emit('room:joined', { code: result.value.room.code, seat: 'guest', token: result.value.token, reconnected: false });
    });

    handle('room:rejoin', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.rejoin(socket.id, scoped.code, scoped.body.token);
      if (!result.ok) {
        reject(result.error, result.message);
        return;
      }
      socket.join(result.value.room.code);
      log(`room rejoined ${result.value.room.code} seat=${result.value.seat}`);
      socket.emit('room:joined', { code: result.value.room.code, seat: result.value.seat, reconnected: result.value.reconnected, token: scoped.body.token });
    });

    handle('room:selectDeck', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.selectDeck(socket.id, scoped.body.deckId);
      if (!result.ok) reject(result.error, result.message);
    });

    handle('room:ready', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.setReady(socket.id, scoped.body.ready);
      if (!result.ok) reject(result.error, result.message);
    });

    handle('match:start', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.startMatch(socket.id);
      if (!result.ok) {
        reject(result.error, result.message);
        return;
      }
      log(`match started ${result.value.matchId}`);
    });

    handle('mulligan:submit', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      if (!Array.isArray(scoped.body.selections) || scoped.body.selections.some((item) => typeof item !== 'string')) {
        reject('INVALID_PAYLOAD', 'selections 必须是字符串数组。');
        return;
      }
      const result = manager.guestMulligan(socket.id, scoped.body.selections);
      if (!result.ok) reject(result.error, result.message);
    });

    handle('action:request', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const request = scoped.body.request;
      if (!isActionRequest(request)) {
        reject('INVALID_PAYLOAD', 'ActionRequest 结构不合法。', typeof (request as { requestId?: unknown })?.requestId === 'string' ? (request as { requestId: string }).requestId : undefined);
        return;
      }
      const result = manager.guestAction(socket.id, request);
      if (!result.ok) reject(result.error, result.message, request.requestId);
    });

    handle('action:ack', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      if (!isActionAck(scoped.body.ack)) {
        reject('INVALID_PAYLOAD', 'ActionAck 结构不合法。');
        return;
      }
      const result = manager.hostAck(socket.id, scoped.body.ack);
      if (!result.ok) reject(result.error, result.message);
    });

    handle('view:update', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      if (typeof scoped.body.view !== 'object' || scoped.body.view === null) {
        reject('INVALID_PAYLOAD', '缺少 view。');
        return;
      }
      const result = manager.hostView(socket.id, scoped.body.view);
      if (!result.ok) reject(result.error, result.message);
    });

    handle('room:leave', (payload) => {
      const scoped = requireRoom(payload);
      if (!scoped) return;
      const result = manager.leave(socket.id);
      if (!result.ok) {
        reject(result.error, result.message);
        return;
      }
      socket.leave(scoped.code);
    });

    socket.on('disconnect', () => {
      log(`disconnected ${socket.id}`);
      manager.handleDisconnect(socket.id);
    });
  });

  const sweeper = setInterval(() => {
    for (const closed of manager.sweep()) log(`room closed ${closed.code} reason=${closed.reason}`);
  }, config.sweepIntervalMs);
  sweeper.unref?.();

  return {
    httpServer: ownHttpServer,
    manager,
    async close(): Promise<void> {
      clearInterval(sweeper);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (!httpServer) await new Promise<void>((resolve) => ownHttpServer.close(() => resolve()));
    },
  };
}

// 命令行直接运行：node relay-server/src/index.ts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.RELAY_PORT ?? '8787', 10);
  const origins = process.env.RELAY_ORIGINS ? process.env.RELAY_ORIGINS.split(',').map((origin) => origin.trim()) : undefined;
  const httpServer = createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  createRelayServer(httpServer, { ...(origins ? { origins } : {}) });
  httpServer.listen(port, () => {
    console.log(`[relay] listening on :${port} (protocol v${PROTOCOL_VERSION}, rules ${RULES_VERSION})`);
  });
}

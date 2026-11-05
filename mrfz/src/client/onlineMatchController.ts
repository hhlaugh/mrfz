import { io, type Socket } from 'socket.io-client';
import { Peer, type DataConnection } from 'peerjs';
import { LocalGameController, type ActionResult, type LocalGameSnapshot } from './localGameController';
import { clientStateFromPlayerView, type PlayerView } from './playerView';
import type { ActionAck, ActionRequest } from './protocol';
import { DEMO_CARDS, DEMO_DECKS } from './demoData';
import type { CardInstanceId, DeckDefinition, GameAction, PlayerId } from '../game/types';
import type { RoomStatePayload } from '../../relay-server/src/types';

export function getInitialRelayUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
    if (window.location.hostname.endsWith('github.io')) {
      return 'http://localhost:8787';
    }
    return window.location.origin;
  }
  return 'http://localhost:8787';
}

export type OnlineMode = 'p2p' | 'relay';

export function getInitialOnlineMode(): OnlineMode {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'relay') return 'relay';
    if (params.get('mode') === 'p2p') return 'p2p';
  }
  // 默认为 P2P 直连：无需任何后端中继即可跨手机/电脑网页联机
  return 'p2p';
}

export const DEFAULT_RELAY_URL = getInitialRelayUrl();
export const PROTOCOL_VERSION = 1;
export const RULES_VERSION = '0.7';

export type OnlineRole = 'host' | 'guest';

export interface OnlineMatchSnapshot {
  readonly mode: OnlineMode;
  readonly connected: boolean;
  readonly serverUrl: string;
  readonly roomCode: string | null;
  readonly seat: OnlineRole | null;
  readonly token: string | null;
  readonly roomState: RoomStatePayload | null;
  readonly inGame: boolean;
  readonly matchId: string | null;
  readonly opponentConnected: boolean;
  readonly pausedForGuest: boolean;
  readonly closedReason: string | null;
  readonly errorMessage: string | null;
  readonly gameSnapshot: LocalGameSnapshot | null;
  readonly latestPlayerView: PlayerView | null;
  readonly hostDeckId: string | null;
  readonly guestDeckId: string | null;
}

type Listener = () => void;

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function randomCode(length = 8): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

const STORAGE_KEY = 'mrfz_online_session';

interface SavedSession {
  roomCode: string;
  token: string;
  seat: OnlineRole;
  serverUrl: string;
}

function loadSavedSession(): SavedSession | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: SavedSession | null): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export class OnlineMatchController {
  private mode: OnlineMode = getInitialOnlineMode();
  private socket: Socket | null = null;
  private peer: Peer | null = null;
  private p2pConn: DataConnection | null = null;

  private serverUrl: string;
  private connected = false;
  private roomCode: string | null = null;
  private seat: OnlineRole | null = null;
  private token: string | null = null;
  private roomState: RoomStatePayload | null = null;
  private inGame = false;
  private matchId: string | null = null;
  private hostDeckId: string | null = null;
  private guestDeckId: string | null = null;
  private opponentConnected = false;
  private pausedForGuest = false;
  private closedReason: string | null = null;
  private errorMessage: string | null = null;

  // Host authoritative runtime
  private hostController: LocalGameController | null = null;
  private hostUnsubscribe: (() => void) | null = null;

  // Guest synced runtime
  private latestPlayerView: PlayerView | null = null;
  private guestSnapshot: LocalGameSnapshot | null = null;
  private pendingAcks = new Map<string, (ack: ActionAck) => void>();

  private readonly listeners = new Set<Listener>();
  private cachedSnapshot: OnlineMatchSnapshot;

  constructor(serverUrl: string = DEFAULT_RELAY_URL) {
    this.serverUrl = serverUrl;
    this.connected = this.mode === 'p2p';
    this.cachedSnapshot = this.computeSnapshot();
  }

  getMode(): OnlineMode {
    return this.mode;
  }

  setMode(mode: OnlineMode): void {
    if (this.mode === mode) return;
    this.disconnect();
    this.mode = mode;
    this.connected = mode === 'p2p';
    this.errorMessage = null;
    this.publish();
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  setServerUrl(url: string): void {
    if (this.serverUrl === url) return;
    this.disconnect();
    this.serverUrl = url;
    this.publish();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private computeSnapshot(): OnlineMatchSnapshot {
    return {
      mode: this.mode,
      connected: this.connected,
      serverUrl: this.serverUrl,
      roomCode: this.roomCode,
      seat: this.seat,
      token: this.token,
      roomState: this.roomState,
      inGame: this.inGame,
      matchId: this.matchId,
      opponentConnected: this.opponentConnected,
      pausedForGuest: this.pausedForGuest,
      closedReason: this.closedReason,
      errorMessage: this.errorMessage,
      gameSnapshot: this.seat === 'host' ? (this.hostController?.getSnapshot() ?? null) : this.guestSnapshot,
      latestPlayerView: this.latestPlayerView,
      hostDeckId: this.hostDeckId,
      guestDeckId: this.guestDeckId,
    };
  }

  getSnapshot = (): OnlineMatchSnapshot => this.cachedSnapshot;

  clearError(): void {
    this.errorMessage = null;
    this.publish();
  }

  setError(message: string): void {
    this.errorMessage = message;
    this.publish();
  }

  private publish(): void {
    this.cachedSnapshot = this.computeSnapshot();
    for (const listener of this.listeners) listener();
  }

  // -------------------------------------------------------------
  // Socket.IO Relay Connection (中继服务模式)
  // -------------------------------------------------------------
  connect(): Socket {
    if (this.mode === 'p2p') {
      this.connected = true;
      this.publish();
      return null as unknown as Socket;
    }

    if (this.socket && this.socket.connected) return this.socket;
    if (this.socket) {
      this.socket.connect();
      return this.socket;
    }

    const socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      this.errorMessage = null;
      this.publish();

      if (this.roomCode && this.token) {
        socket.emit('room:rejoin', { roomCode: this.roomCode, token: this.token });
      }
    });

    socket.on('disconnect', () => {
      this.connected = false;
      this.publish();
    });

    socket.on('connect_error', (error) => {
      this.connected = false;
      this.errorMessage = `连接中继服务器失败（${error.message}）。若使用 GitHub Pages 或跨网联机，请切换为上方的「P2P 直连模式」。`;
      this.publish();
    });

    socket.on('room:created', (payload: { code: string; token: string; seat: OnlineRole; roomState?: RoomStatePayload }) => {
      this.roomCode = payload.code;
      this.token = payload.token;
      this.seat = 'host';
      if (payload.roomState) {
        this.roomState = payload.roomState;
      }
      this.closedReason = null;
      this.errorMessage = null;
      saveSession({ roomCode: payload.code, token: payload.token, seat: 'host', serverUrl: this.serverUrl });
      this.publish();
    });

    socket.on('room:joined', (payload: { code: string; token: string; seat: OnlineRole; reconnected: boolean; roomState?: RoomStatePayload }) => {
      this.roomCode = payload.code;
      this.token = payload.token;
      this.seat = payload.seat;
      if (payload.roomState) {
        this.roomState = payload.roomState;
        this.pausedForGuest = payload.roomState.pausedForGuest;
        if (this.seat === 'host') {
          this.opponentConnected = payload.roomState.guest?.connected ?? false;
        } else if (this.seat === 'guest') {
          this.opponentConnected = payload.roomState.host.connected;
        }
      }
      this.closedReason = null;
      this.errorMessage = null;
      saveSession({ roomCode: payload.code, token: payload.token, seat: payload.seat, serverUrl: this.serverUrl });
      this.publish();
    });

    socket.on('room:state', (state: RoomStatePayload) => {
      this.roomState = state;
      this.pausedForGuest = state.pausedForGuest;
      if (this.seat === 'host') {
        this.opponentConnected = state.guest?.connected ?? false;
      } else if (this.seat === 'guest') {
        this.opponentConnected = state.host.connected;
      }
      this.publish();
    });

    socket.on('connection:status', (payload: { seat: OnlineRole; connected: boolean; reconnected?: boolean }) => {
      if (this.seat && payload.seat !== this.seat) {
        this.opponentConnected = payload.connected;
        this.publish();
      }
    });

    socket.on('room:error', (payload: { code: string; message: string; requestId?: string }) => {
      this.errorMessage = `[${payload.code}] ${payload.message}`;
      if (payload.requestId && this.pendingAcks.has(payload.requestId)) {
        const resolve = this.pendingAcks.get(payload.requestId)!;
        this.pendingAcks.delete(payload.requestId);
        resolve({
          requestId: payload.requestId,
          ok: false,
          reason: payload.message,
          stateVersion: this.latestPlayerView?.stateVersion ?? 0,
        });
      }
      this.publish();
    });

    socket.on('room:closed', (payload: { reason: string }) => {
      this.closedReason = payload.reason;
      this.inGame = false;
      saveSession(null);
      this.publish();
    });

    // Match Start
    socket.on('match:start', (payload: { matchId: string; hostDeckId: string | null; guestDeckId: string | null }) => {
      this.matchId = payload.matchId;
      this.hostDeckId = payload.hostDeckId;
      this.guestDeckId = payload.guestDeckId;
      this.inGame = true;
      this.closedReason = null;

      if (this.seat === 'host') {
        this.initHostGame(payload.hostDeckId, payload.guestDeckId);
      }
      this.publish();
    });

    // Host handlers
    socket.on('mulligan:submit', (payload: { matchId: string; selections: readonly CardInstanceId[] }) => {
      if (this.seat === 'host' && this.hostController) {
        this.hostController.submitMulligan('player_b', payload.selections);
      }
    });

    socket.on('action:request', (payload: { matchId: string; request: ActionRequest }) => {
      if (this.seat === 'host' && this.hostController) {
        const ack = this.hostController.submitAction('player_b', payload.request);
        this.socket?.emit('action:ack', { roomCode: this.roomCode, ack });
      }
    });

    socket.on('view:resend', () => {
      if (this.seat === 'host' && this.hostController && this.roomCode) {
        const view = this.hostController.toPlayerView('player_b');
        this.socket?.emit('view:update', { roomCode: this.roomCode, view });
      }
    });

    // Guest handlers
    socket.on('view:update', (payload: { matchId: string; view: PlayerView }) => {
      if (this.seat === 'guest') {
        this.latestPlayerView = payload.view;
        const clientState = clientStateFromPlayerView(payload.view);
        this.guestSnapshot = {
          state: clientState,
          logHistory: payload.view.combatLog,
        };
        this.publish();
      }
    });

    socket.on('action:ack', (payload: { matchId: string; ack: ActionAck }) => {
      if (this.pendingAcks.has(payload.ack.requestId)) {
        const resolve = this.pendingAcks.get(payload.ack.requestId)!;
        this.pendingAcks.delete(payload.ack.requestId);
        resolve(payload.ack);
      }
    });

    return socket;
  }

  // -------------------------------------------------------------
  // WebRTC P2P Connection (免服务器模式)
  // -------------------------------------------------------------
  private sendP2P(event: string, payload: unknown): void {
    if (this.p2pConn && this.p2pConn.open) {
      try {
        this.p2pConn.send({ event, payload });
      } catch (err) {
        console.warn('P2P send error:', err);
      }
    }
  }

  private handleP2PMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const { event, payload } = data as { event: string; payload: any };

    if (this.seat === 'host') {
      if (event === 'room:selectDeck') {
        if (this.roomState?.guest) {
          this.roomState = {
            ...this.roomState,
            guest: { ...this.roomState.guest, deckId: payload.deckId },
          };
          this.sendP2P('room:state', this.roomState);
          this.publish();
        }
      } else if (event === 'room:ready') {
        if (this.roomState?.guest) {
          this.roomState = {
            ...this.roomState,
            guest: { ...this.roomState.guest, ready: Boolean(payload.ready) },
          };
          this.sendP2P('room:state', this.roomState);
          this.publish();
        }
      } else if (event === 'mulligan:submit') {
        if (this.hostController) {
          this.hostController.submitMulligan('player_b', payload.selections);
        }
      } else if (event === 'action:request') {
        if (this.hostController) {
          const ack = this.hostController.submitAction('player_b', payload.request);
          this.sendP2P('action:ack', { ack });
        }
      } else if (event === 'room:leave') {
        if (this.roomState?.guest) {
          this.roomState = {
            ...this.roomState,
            guest: { ...this.roomState.guest, connected: false },
          };
          this.opponentConnected = false;
          this.publish();
        }
      }
    } else if (this.seat === 'guest') {
      if (event === 'room:joined') {
        this.roomCode = payload.code;
        this.seat = 'guest';
        this.roomState = payload.roomState;
        this.opponentConnected = true;
        this.connected = true;
        this.errorMessage = null;
        this.publish();
      } else if (event === 'room:state') {
        this.roomState = payload;
        this.opponentConnected = payload.host.connected;
        this.publish();
      } else if (event === 'match:start') {
        this.matchId = payload.matchId;
        this.hostDeckId = payload.hostDeckId;
        this.guestDeckId = payload.guestDeckId;
        this.inGame = true;
        this.publish();
      } else if (event === 'view:update') {
        this.latestPlayerView = payload.view;
        const clientState = clientStateFromPlayerView(payload.view);
        this.guestSnapshot = {
          state: clientState,
          logHistory: payload.view.combatLog,
        };
        this.publish();
      } else if (event === 'action:ack') {
        if (this.pendingAcks.has(payload.ack.requestId)) {
          const resolve = this.pendingAcks.get(payload.ack.requestId)!;
          this.pendingAcks.delete(payload.ack.requestId);
          resolve(payload.ack);
        }
      } else if (event === 'room:closed') {
        this.closedReason = payload.reason;
        this.inGame = false;
        this.publish();
      }
    }
  }

  private createRoomP2P(): void {
    this.cleanupPeer();
    const code = randomCode(8);
    const peerId = 'mrfz7-' + code.toLowerCase();

    try {
      const peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;

      peer.on('open', () => {
        this.roomCode = code;
        this.seat = 'host';
        this.connected = true;
        this.errorMessage = null;
        this.roomState = {
          code,
          started: false,
          pausedForGuest: false,
          host: { connected: true, deckId: DEMO_DECKS[0]?.deck_id ?? 'demo-control', ready: false },
          guest: null,
        };
        this.publish();
      });

      peer.on('connection', (conn) => {
        this.p2pConn = conn;

        conn.on('open', () => {
          this.opponentConnected = true;
          if (this.roomState) {
            this.roomState = {
              ...this.roomState,
              guest: { connected: true, deckId: DEMO_DECKS[1]?.deck_id ?? 'demo-aggro', ready: false },
            };
          }
          this.publish();

          conn.send({
            event: 'room:joined',
            payload: {
              code,
              seat: 'guest',
              token: 'p2p-token',
              reconnected: false,
              roomState: this.roomState,
            },
          });
        });

        conn.on('data', (data) => {
          this.handleP2PMessage(data);
        });

        conn.on('close', () => {
          this.opponentConnected = false;
          if (this.roomState?.guest) {
            this.roomState = {
              ...this.roomState,
              guest: { ...this.roomState.guest, connected: false },
            };
          }
          this.publish();
        });

        conn.on('error', (err) => {
          console.warn('P2P connection error:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          // 极小概率 ID 冲突时重新生成
          this.createRoomP2P();
        } else {
          this.errorMessage = `P2P 信号服务异常（${err.type}）。可稍后重试，或切换为中继模式。`;
          this.publish();
        }
      });
    } catch (err) {
      this.errorMessage = `初始化 P2P 失败：${err instanceof Error ? err.message : String(err)}`;
      this.publish();
    }
  }

  private joinRoomP2P(code: string): void {
    this.cleanupPeer();
    const targetPeerId = 'mrfz7-' + code.toLowerCase();

    try {
      const peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      this.peer = peer;

      peer.on('open', () => {
        const conn = peer.connect(targetPeerId, { reliable: true });
        this.p2pConn = conn;

        conn.on('open', () => {
          this.connected = true;
          this.errorMessage = null;
          this.publish();
        });

        conn.on('data', (data) => {
          this.handleP2PMessage(data);
        });

        conn.on('close', () => {
          this.opponentConnected = false;
          this.closedReason = 'HOST_LEFT';
          this.publish();
        });

        conn.on('error', (err) => {
          console.warn('P2P conn error:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('Peer error on join:', err);
        if (err.type === 'peer-unavailable') {
          this.errorMessage = `未找到房间「${code}」。请确认房主已创建房间且仍在等待大厅中。`;
        } else {
          this.errorMessage = `P2P 直连失败（${err.type}）。`;
        }
        this.publish();
      });
    } catch (err) {
      this.errorMessage = `连接 P2P 失败：${err instanceof Error ? err.message : String(err)}`;
      this.publish();
    }
  }

  // -------------------------------------------------------------
  // Game Actions & Lifecycle
  // -------------------------------------------------------------
  private initHostGame(hostDeckId: string | null, guestDeckId: string | null): void {
    const deckA: DeckDefinition = DEMO_DECKS.find((d) => d.deck_id === hostDeckId) ?? DEMO_DECKS[0]!;
    const deckB: DeckDefinition = DEMO_DECKS.find((d) => d.deck_id === guestDeckId) ?? DEMO_DECKS[1] ?? deckA;
    const seed = randomSeed();

    if (this.hostUnsubscribe) {
      this.hostUnsubscribe();
      this.hostUnsubscribe = null;
    }

    const controller = LocalGameController.create({
      decks: { player_a: deckA, player_b: deckB },
      cards: DEMO_CARDS,
      seed,
    });
    this.hostController = controller;

    this.hostUnsubscribe = controller.subscribe(() => {
      const guestView = controller.toPlayerView('player_b');
      if (this.mode === 'p2p') {
        this.sendP2P('view:update', { view: guestView });
      } else if (this.roomCode && this.socket) {
        this.socket.emit('view:update', { roomCode: this.roomCode, view: guestView });
      }
      this.publish();
    });

    // Send initial view to guest
    const initialGuestView = controller.toPlayerView('player_b');
    if (this.mode === 'p2p') {
      this.sendP2P('view:update', { view: initialGuestView });
    } else {
      this.socket?.emit('view:update', { roomCode: this.roomCode, view: initialGuestView });
    }
  }

  createRoom(): void {
    this.errorMessage = null;
    this.publish();

    if (this.mode === 'p2p') {
      this.createRoomP2P();
      return;
    }

    const socket = this.connect();
    socket.emit('room:create', { protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION });
  }

  joinRoom(code: string): void {
    this.errorMessage = null;
    this.publish();

    const formatted = code.trim().toUpperCase();
    if (formatted.length !== 8) {
      this.errorMessage = '房间码必须是 8 位字符。';
      this.publish();
      return;
    }

    if (this.mode === 'p2p') {
      this.joinRoomP2P(formatted);
      return;
    }

    const socket = this.connect();
    socket.emit('room:join', { roomCode: formatted, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION });

    // 超时兜底：若 6 秒内既未进入房间也未收到错误，主动提示
    setTimeout(() => {
      if (!this.roomCode && !this.errorMessage) {
        this.errorMessage = '加入房间无响应（请求超时）。请确认中继服务运行正常，且双方网络可互通。';
        this.publish();
      }
    }, 6000);
  }

  restoreSessionIfAny(): boolean {
    if (this.mode === 'p2p') return false;
    const saved = loadSavedSession();
    if (!saved || !saved.roomCode || !saved.token) return false;
    this.serverUrl = saved.serverUrl;
    this.roomCode = saved.roomCode;
    this.seat = saved.seat;
    this.token = saved.token;
    const socket = this.connect();
    socket.emit('room:rejoin', { roomCode: saved.roomCode, token: saved.token });
    return true;
  }

  selectDeck(deckId: string): void {
    if (this.mode === 'p2p') {
      if (!this.roomState) return;
      if (this.seat === 'host') {
        this.roomState = { ...this.roomState, host: { ...this.roomState.host, deckId } };
        this.sendP2P('room:state', this.roomState);
        this.publish();
      } else if (this.seat === 'guest') {
        this.roomState = { ...this.roomState, guest: this.roomState.guest ? { ...this.roomState.guest, deckId } : null };
        this.sendP2P('room:selectDeck', { deckId });
        this.publish();
      }
      return;
    }

    if (!this.roomCode || !this.socket) return;
    this.socket.emit('room:selectDeck', { roomCode: this.roomCode, deckId });
  }

  setReady(ready: boolean): void {
    if (this.mode === 'p2p') {
      if (!this.roomState) return;
      if (this.seat === 'host') {
        this.roomState = { ...this.roomState, host: { ...this.roomState.host, ready } };
        this.sendP2P('room:state', this.roomState);
        this.publish();
      } else if (this.seat === 'guest') {
        this.roomState = { ...this.roomState, guest: this.roomState.guest ? { ...this.roomState.guest, ready } : null };
        this.sendP2P('room:ready', { ready });
        this.publish();
      }
      return;
    }

    if (!this.roomCode || !this.socket) return;
    this.socket.emit('room:ready', { roomCode: this.roomCode, ready });
  }

  startMatch(): void {
    if (this.seat !== 'host') return;

    if (this.mode === 'p2p') {
      const matchId = randomUUID();
      this.matchId = matchId;
      this.hostDeckId = this.roomState?.host.deckId ?? DEMO_DECKS[0]?.deck_id ?? null;
      this.guestDeckId = this.roomState?.guest?.deckId ?? DEMO_DECKS[1]?.deck_id ?? null;
      this.inGame = true;
      this.initHostGame(this.hostDeckId, this.guestDeckId);
      this.sendP2P('match:start', { matchId, hostDeckId: this.hostDeckId, guestDeckId: this.guestDeckId });
      this.publish();
      return;
    }

    if (!this.roomCode || !this.socket) return;
    this.socket.emit('match:start', { roomCode: this.roomCode });
  }

  submitMulligan(selections: readonly CardInstanceId[]): ActionResult {
    if (this.seat === 'host') {
      if (!this.hostController) return { ok: false, reason: '房主对局未就绪。' };
      return this.hostController.submitMulligan('player_a', selections);
    }

    if (this.mode === 'p2p') {
      this.sendP2P('mulligan:submit', { selections });
      return { ok: true };
    }

    if (!this.roomCode || !this.socket) return { ok: false, reason: '未连接到房间。' };
    this.socket.emit('mulligan:submit', { roomCode: this.roomCode, selections });
    return { ok: true };
  }

  async dispatchAction(action: GameAction): Promise<ActionResult> {
    if (this.seat === 'host') {
      if (!this.hostController) return { ok: false, reason: '房主对局未就绪。' };
      const actor: PlayerId = 'player_a';
      return this.hostController.dispatch(actor, action);
    }

    if (!this.latestPlayerView) return { ok: false, reason: '尚未接收到有效视图。' };

    const requestId = randomUUID();
    const request: ActionRequest = {
      requestId,
      expectedStateVersion: this.latestPlayerView.stateVersion,
      action,
    };

    return new Promise<ActionResult>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingAcks.has(requestId)) {
          this.pendingAcks.delete(requestId);
          resolve({ ok: false, reason: '等待房主确认操作超时。' });
        }
      }, 5000);

      this.pendingAcks.set(requestId, (ack) => {
        clearTimeout(timer);
        resolve({ ok: ack.ok, reason: ack.reason });
      });

      if (this.mode === 'p2p') {
        this.sendP2P('action:request', { request });
      } else {
        if (!this.roomCode || !this.socket) {
          clearTimeout(timer);
          this.pendingAcks.delete(requestId);
          resolve({ ok: false, reason: '未连接到房间。' });
          return;
        }
        this.socket.emit('action:request', { roomCode: this.roomCode, request });
      }
    });
  }

  private cleanupPeer(): void {
    if (this.p2pConn) {
      try {
        this.p2pConn.close();
      } catch {}
      this.p2pConn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }

  leaveRoom(): void {
    if (this.mode === 'p2p') {
      this.sendP2P('room:leave', {});
    } else {
      if (this.roomCode && this.socket) {
        this.socket.emit('room:leave', { roomCode: this.roomCode });
      }
    }
    this.resetRoom();
  }

  private resetRoom(): void {
    if (this.hostUnsubscribe) {
      this.hostUnsubscribe();
      this.hostUnsubscribe = null;
    }
    this.hostController = null;
    this.latestPlayerView = null;
    this.guestSnapshot = null;
    this.roomCode = null;
    this.seat = null;
    this.token = null;
    this.roomState = null;
    this.inGame = false;
    this.matchId = null;
    this.opponentConnected = false;
    this.closedReason = null;
    this.errorMessage = null;
    this.pendingAcks.clear();
    this.cleanupPeer();
    saveSession(null);
    this.publish();
  }

  disconnect(): void {
    this.resetRoom();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.cleanupPeer();
    this.connected = this.mode === 'p2p';
    this.publish();
  }
}

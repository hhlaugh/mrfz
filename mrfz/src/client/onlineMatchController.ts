import { io, type Socket } from 'socket.io-client';
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

export const DEFAULT_RELAY_URL = getInitialRelayUrl();
export const PROTOCOL_VERSION = 1;
export const RULES_VERSION = '0.7';

export type OnlineRole = 'host' | 'guest';

export interface OnlineMatchSnapshot {
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
  private socket: Socket | null = null;
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
  private opponentConnected = true;
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
    this.cachedSnapshot = this.computeSnapshot();
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

  connect(): Socket {
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

      // If we have an active session, attempt rejoin on reconnect
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
      this.errorMessage = `连接中继服务器失败（${error.message}）。请确认中继服务已启动（npm run relay）。`;
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
      if (this.roomCode && this.socket) {
        const guestView = controller.toPlayerView('player_b');
        this.socket.emit('view:update', { roomCode: this.roomCode, view: guestView });
      }
      this.publish();
    });

    // Send initial view to guest
    const initialGuestView = controller.toPlayerView('player_b');
    this.socket?.emit('view:update', { roomCode: this.roomCode, view: initialGuestView });
  }

  createRoom(): void {
    this.errorMessage = null;
    this.publish();
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
    const socket = this.connect();
    socket.emit('room:join', { roomCode: formatted, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION });

    // 超时兜底：若 6 秒内既未进入房间也未收到错误（如网络丢包或连接阻塞），主动提示
    setTimeout(() => {
      if (!this.roomCode && !this.errorMessage) {
        this.errorMessage = '加入房间无响应（请求超时）。请确认中继服务运行正常，且双方网络可互通。';
        this.publish();
      }
    }, 6000);
  }

  restoreSessionIfAny(): boolean {
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
    if (!this.roomCode || !this.socket) return;
    this.socket.emit('room:selectDeck', { roomCode: this.roomCode, deckId });
  }

  setReady(ready: boolean): void {
    if (!this.roomCode || !this.socket) return;
    this.socket.emit('room:ready', { roomCode: this.roomCode, ready });
  }

  startMatch(): void {
    if (!this.roomCode || !this.socket || this.seat !== 'host') return;
    this.socket.emit('match:start', { roomCode: this.roomCode });
  }

  submitMulligan(selections: readonly CardInstanceId[]): ActionResult {
    if (!this.roomCode || !this.socket) return { ok: false, reason: '未连接到房间。' };

    if (this.seat === 'host') {
      if (!this.hostController) return { ok: false, reason: '房主对局未就绪。' };
      return this.hostController.submitMulligan('player_a', selections);
    }

    // Guest sends over socket
    this.socket.emit('mulligan:submit', { roomCode: this.roomCode, selections });
    return { ok: true };
  }

  async dispatchAction(action: GameAction): Promise<ActionResult> {
    if (!this.roomCode || !this.socket) return { ok: false, reason: '未连接到房间。' };

    if (this.seat === 'host') {
      if (!this.hostController) return { ok: false, reason: '房主对局未就绪。' };
      const actor: PlayerId = 'player_a';
      return this.hostController.dispatch(actor, action);
    }

    // Guest sends ActionRequest and awaits ActionAck
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

      this.socket?.emit('action:request', { roomCode: this.roomCode, request });
    });
  }

  leaveRoom(): void {
    if (this.roomCode && this.socket) {
      this.socket.emit('room:leave', { roomCode: this.roomCode });
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
    this.closedReason = null;
    this.errorMessage = null;
    this.pendingAcks.clear();
    saveSession(null);
    this.publish();
  }

  disconnect(): void {
    this.resetRoom();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.publish();
  }
}

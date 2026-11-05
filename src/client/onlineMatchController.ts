import { Peer, type DataConnection } from 'peerjs';
import { LocalGameController, type ActionResult, type LocalGameSnapshot } from './localGameController';
import { clientStateFromPlayerView, type PlayerView } from './playerView';
import type { ActionAck, ActionRequest, OnlineRole, RoomStatePayload } from './protocol';
import { DEMO_CARDS, DEMO_DECKS } from './demoData';
import type { CardInstanceId, DeckDefinition, GameAction, PlayerId } from '../game/types';

export const PROTOCOL_VERSION = 1;
export const RULES_VERSION = '0.7';

export type { OnlineRole, RoomStatePayload };

export interface OnlineMatchSnapshot {
  readonly connected: boolean;
  readonly roomCode: string | null;
  readonly seat: OnlineRole | null;
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

const PEER_PREFIX = 'mrfz7-';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export class OnlineMatchController {
  private peer: Peer | null = null;
  private p2pConn: DataConnection | null = null;

  private connected = true;
  private roomCode: string | null = null;
  private seat: OnlineRole | null = null;
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

  constructor() {
    this.cachedSnapshot = this.computeSnapshot();
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
      roomCode: this.roomCode,
      seat: this.seat,
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
    for (const listener of this.listeners) {
      listener();
    }
  }

  // -------------------------------------------------------------
  // WebRTC P2P Direct Connection (免服务器端)
  // -------------------------------------------------------------
  private sendP2P(event: string, payload: unknown): void {
    if (this.p2pConn && this.p2pConn.open) {
      try {
        this.p2pConn.send({ event, payload });
      } catch (err) {
        console.warn('P2P 发送失败:', err);
      }
    }
  }

  private handleP2PMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const { event, payload } = data as { event: string; payload: any };

    if (this.seat === 'host') {
      if (event === 'room:join_request') {
        if (this.roomState) {
          this.roomState = {
            ...this.roomState,
            guest: {
              connected: true,
              deckId: this.roomState.guest?.deckId ?? DEMO_DECKS[1]?.deck_id ?? 'demo-aggro',
              ready: this.roomState.guest?.ready ?? false,
            },
          };
          this.opponentConnected = true;
          this.publish();
          this.sendP2P('room:joined', {
            code: this.roomCode,
            seat: 'guest',
            token: 'p2p-token',
            reconnected: false,
            roomState: this.roomState,
          });
        }
      } else if (event === 'room:selectDeck') {
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
    } else {
      // 访客端处理消息
      if (event === 'room:joined') {
        this.roomCode = payload.code;
        this.seat = 'guest';
        this.roomState = payload.roomState;
        this.opponentConnected = true;
        this.connected = true;
        this.closedReason = null;
        this.errorMessage = null;
        this.publish();
      } else if (event === 'room:state') {
        this.roomState = payload;
        this.opponentConnected = Boolean(payload?.host?.connected ?? true);
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

  createRoom(): void {
    this.cleanupPeer();
    this.errorMessage = null;
    this.publish();

    const code = randomCode(8);
    const peerId = PEER_PREFIX + code.toLowerCase();

    try {
      const peer = new Peer(peerId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS },
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

        const onConnected = () => {
          this.opponentConnected = true;
          if (this.roomState) {
            this.roomState = {
              ...this.roomState,
              guest: {
                connected: true,
                deckId: this.roomState.guest?.deckId ?? DEMO_DECKS[1]?.deck_id ?? 'demo-aggro',
                ready: false,
              },
            };
          }
          this.publish();

          try {
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
          } catch (e) {
            console.warn('向访客同步房间信息失败:', e);
          }
        };

        if (conn.open) {
          onConnected();
        } else {
          conn.on('open', onConnected);
        }

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
          console.warn('P2P 连接异常:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('PeerJS 错误:', err);
        if (err.type === 'unavailable-id') {
          this.createRoom();
        } else {
          this.errorMessage = `P2P 信号服务异常（${err.type}）。请稍后重试。`;
          this.publish();
        }
      });
    } catch (err) {
      this.errorMessage = `创建 P2P 房间失败：${err instanceof Error ? err.message : String(err)}`;
      this.publish();
    }
  }

  joinRoom(code: string): void {
    this.cleanupPeer();
    this.closedReason = null;
    this.errorMessage = null;
    this.publish();

    const formatted = code.trim().toUpperCase();
    if (formatted.length !== 8) {
      this.errorMessage = '房间码必须是 8 位字符。';
      this.publish();
      return;
    }

    const targetPeerId = PEER_PREFIX + formatted.toLowerCase();

    try {
      const peer = new Peer({
        debug: 1,
        config: { iceServers: ICE_SERVERS },
      });
      this.peer = peer;

      peer.on('open', () => {
        const conn = peer.connect(targetPeerId, { reliable: true });
        this.p2pConn = conn;

        const onConnOpen = () => {
          this.connected = true;
          this.errorMessage = null;
          this.publish();
          try {
            conn.send({
              event: 'room:join_request',
              payload: { code: formatted },
            });
          } catch (e) {
            console.warn('向房主发送加入请求失败:', e);
          }
        };

        if (conn.open) {
          onConnOpen();
        } else {
          conn.on('open', onConnOpen);
        }

        conn.on('data', (data) => {
          this.handleP2PMessage(data);
        });

        conn.on('close', () => {
          this.opponentConnected = false;
          if (this.seat === 'guest' && this.roomCode) {
            this.closedReason = 'HOST_LEFT';
            this.inGame = false;
          }
          this.publish();
        });

        conn.on('error', (err) => {
          console.warn('P2P 访客连接异常:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('Peer 加入房间错误:', err);
        if (err.type === 'peer-unavailable') {
          this.errorMessage = `未找到房间「${formatted}」。请确认房主已创建房间并在等待大厅中。`;
        } else {
          this.errorMessage = `P2P 直连失败（${err.type}）。请检查网络连接后重试。`;
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
      this.sendP2P('view:update', { view: guestView });
      this.publish();
    });

    const initialGuestView = controller.toPlayerView('player_b');
    this.sendP2P('view:update', { view: initialGuestView });
  }

  selectDeck(deckId: string): void {
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
  }

  setReady(ready: boolean): void {
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
  }

  startMatch(): void {
    if (this.seat !== 'host') return;
    const matchId = randomUUID();
    this.matchId = matchId;
    this.hostDeckId = this.roomState?.host.deckId ?? DEMO_DECKS[0]?.deck_id ?? null;
    this.guestDeckId = this.roomState?.guest?.deckId ?? DEMO_DECKS[1]?.deck_id ?? null;
    this.inGame = true;
    this.initHostGame(this.hostDeckId, this.guestDeckId);
    this.sendP2P('match:start', { matchId, hostDeckId: this.hostDeckId, guestDeckId: this.guestDeckId });
    this.publish();
  }

  submitMulligan(selections: readonly CardInstanceId[]): ActionResult {
    if (this.seat === 'host') {
      if (!this.hostController) return { ok: false, reason: '房主对局未就绪。' };
      return this.hostController.submitMulligan('player_a', selections);
    }
    this.sendP2P('mulligan:submit', { selections });
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

      this.sendP2P('action:request', { request });
    });
  }

  private cleanupPeer(): void {
    if (this.p2pConn) {
      try {
        (this.p2pConn as any).removeAllListeners?.();
        this.p2pConn.close();
      } catch {}
      this.p2pConn = null;
    }
    if (this.peer) {
      try {
        (this.peer as any).removeAllListeners?.();
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }

  leaveRoom(): void {
    this.sendP2P('room:leave', {});
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
    this.roomState = null;
    this.inGame = false;
    this.matchId = null;
    this.opponentConnected = false;
    this.closedReason = null;
    this.errorMessage = null;
    this.pendingAcks.clear();
    this.cleanupPeer();
    this.publish();
  }

  disconnect(): void {
    this.resetRoom();
    this.cleanupPeer();
    this.publish();
  }
}

import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from '../game/engine';
import type { CardDefinition, CardInstanceId, CombatLogEvent, DeckDefinition, GameAction, GameState, PlayerId } from '../game/types';
import { isActionRequest } from './protocol';
import type { ActionAck, ActionRequest } from './protocol';
import { toPlayerView } from './playerView';
import type { PlayerView } from './playerView';

export interface LocalGameSetup {
  readonly decks: Readonly<Record<PlayerId, DeckDefinition>>;
  readonly cards: readonly CardDefinition[];
  readonly seed: number;
}

export interface LocalGameSnapshot {
  readonly state: GameState;
  /** 跨战斗阶段累积的展示用日志（sequence 由控制器重新编号，仅供 UI 展示，不影响规则状态）。 */
  readonly logHistory: readonly CombatLogEvent[];
}

export interface ActionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

type Listener = () => void;

const AUTO_ADVANCE_GUARD = 10_000;

/**
 * 本地（热座）游戏控制器：UI 只能通过 submitMulligan / dispatch 提交意图，
 * 所有校验、结算、阶段推进都由规则引擎完成。控制器自身不计算任何游戏数值，
 * 只负责驱动引擎的 advancePhase 自动走过无人决策的阶段，并累积展示用日志。
 */
export class LocalGameController {
  private state: GameState;
  private readonly setup: LocalGameSetup;
  private logHistory: CombatLogEvent[] = [];
  private snapshot: LocalGameSnapshot;
  private readonly listeners: Set<Listener> = new Set();
  private readonly processedRequestIds = new Set<string>();
  private readonly processedRequestOrder: string[] = [];

  private constructor(setup: LocalGameSetup, state: GameState) {
    this.setup = setup;
    this.state = state;
    this.snapshot = { state, logHistory: this.logHistory };
  }

  static create(setup: LocalGameSetup): LocalGameController {
    return new LocalGameController(setup, createInitialGameState({ decks: setup.decks, cards: setup.cards, seed: setup.seed }));
  }

  getSetup(): LocalGameSetup {
    return this.setup;
  }

  getSnapshot = (): LocalGameSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  submitMulligan(playerId: PlayerId, selectedCardInstanceIds: readonly CardInstanceId[]): ActionResult {
    const result = mulligan(this.state, playerId, selectedCardInstanceIds);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.applyStep(this.state, result.value);
    this.autoAdvance();
    this.publish();
    return { ok: true };
  }

  dispatch(actorId: PlayerId, action: GameAction): ActionResult {
    const result = reduceGameAction(this.state, actorId, action);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.applyStep(this.state, result.value);
    this.autoAdvance();
    this.publish();
    return { ok: true };
  }

  /**
   * 阶段 8 协议入口：访客（或本地 UI / AI 提供方）以 ActionRequest 提交动作。
   * requestId 去重 + expectedStateVersion 校验后，走与 dispatch 完全相同的规则引擎入口；
   * 本地动作与远程动作在此汇合，后续阶段 9/10 的 relay 只转发此调用。
   */
  submitAction(actorId: PlayerId, request: ActionRequest): ActionAck {
    const stateVersion = this.state.state_version;
    if (!isActionRequest(request)) {
      const requestId = typeof (request as { requestId?: unknown } | null)?.requestId === 'string' ? (request as unknown as ActionRequest).requestId : '';
      return { requestId, ok: false, reason: 'ActionRequest 格式不合法。', stateVersion };
    }
    if (this.processedRequestIds.has(request.requestId)) {
      return { requestId: request.requestId, ok: false, reason: '重复的 requestId，已拒绝重复执行。', stateVersion };
    }
    if (request.expectedStateVersion !== stateVersion) {
      return {
        requestId: request.requestId,
        ok: false,
        reason: `状态版本过期：期望 ${request.expectedStateVersion}，当前 ${stateVersion}。请先同步最新 PlayerView。`,
        stateVersion,
      };
    }
    this.processedRequestIds.add(request.requestId);
    this.processedRequestOrder.push(request.requestId);
    while (this.processedRequestOrder.length > 512) {
      const oldest = this.processedRequestOrder.shift() as string;
      this.processedRequestIds.delete(oldest);
    }
    const result = reduceGameAction(this.state, actorId, request.action);
    if (!result.ok) return { requestId: request.requestId, ok: false, reason: result.reason, stateVersion };
    this.applyStep(this.state, result.value);
    this.autoAdvance();
    this.publish();
    return { requestId: request.requestId, ok: true, stateVersion: this.state.state_version };
  }

  /** viewer 视角的信息过滤视图（含控制器累积的公开日志历史）。 */
  toPlayerView(viewerId: PlayerId): PlayerView {
    return toPlayerView(this.state, viewerId, { logHistory: this.logHistory });
  }

  private applyStep(previous: GameState, next: GameState): void {
    this.appendLogDiff(previous, next);
    this.state = next;
  }

  private autoAdvance(): void {
    for (let guard = 0; guard < AUTO_ADVANCE_GUARD; guard += 1) {
      const { phase } = this.state;
      if (phase === 'mulligan' || phase === 'action' || phase === 'finished') return;
      if (phase === 'turn_start' && this.state.turn_start_prepared && this.state.pending_effect_choices.length > 0) return;
      const result = advancePhase(this.state);
      if (!result.ok) return;
      this.applyStep(this.state, result.value);
    }
  }

  private appendLogDiff(previous: GameState, next: GameState): void {
    if (next.combat_log === previous.combat_log) return;
    let fresh: readonly CombatLogEvent[];
    if (previous.phase === 'combat' && next.phase !== 'combat') {
      // resolveCombat 清空并重建了 combat_log：全部事件都是新的。
      fresh = next.combat_log;
    } else if (next.combat_log.length >= previous.combat_log.length) {
      fresh = next.combat_log.slice(previous.combat_log.length);
    } else {
      fresh = next.combat_log;
    }
    if (fresh.length === 0) return;
    const appended = fresh.map((event, index) => ({ ...event, sequence: this.logHistory.length + index }));
    this.logHistory = [...this.logHistory, ...appended];
  }

  private publish(): void {
    this.snapshot = { state: this.state, logHistory: this.logHistory };
    for (const listener of this.listeners) listener();
  }
}

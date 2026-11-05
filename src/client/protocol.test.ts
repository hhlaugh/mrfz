import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { BotPlayer, botMulliganChoice } from '../ai/botPlayer';
import type { ActionAck, ActionRequest } from './protocol';
import { isActionAck, isActionRequest } from './protocol';
import { isPlayerView } from './playerView';
import { toPlayerView } from './playerView';
import { LocalGameController } from './localGameController';
import type { GameState, PlayerId } from '../game/types';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');

const PLAYERS: readonly PlayerId[] = ['player_a', 'player_b'];
const SEED = 424242;

function createControllerAtActionPhase(): LocalGameController {
  const controller = LocalGameController.create({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed: SEED });
  for (const playerId of PLAYERS) {
    const result = controller.submitMulligan(playerId, []);
    if (!result.ok) throw new Error(result.reason);
  }
  return controller;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('submitAction (host-authoritative protocol path)', () => {
  it('executes a valid ActionRequest through the same engine entry and returns the new state version', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const actor = state.active_player_id;
    const request: ActionRequest = { requestId: 'r1', expectedStateVersion: state.state_version, action: { type: 'end_action_phase' } };
    const ack: ActionAck = controller.submitAction(actor, request);
    expect(ack.ok).toBe(true);
    expect(ack.requestId).toBe('r1');
    expect(ack.stateVersion).toBeGreaterThan(state.state_version);
    const next = controller.getSnapshot().state;
    expect(next.phase === 'action' || next.phase === 'finished').toBe(true);
    expect(next.state_version).toBe(ack.stateVersion);
  });

  it('rejects duplicate requestId without re-executing', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const actor = state.active_player_id;
    const request: ActionRequest = { requestId: 'dup-1', expectedStateVersion: state.state_version, action: { type: 'end_action_phase' } };
    const first = controller.submitAction(actor, request);
    expect(first.ok).toBe(true);
    const before = controller.getSnapshot();
    const second = controller.submitAction(actor, { ...request, expectedStateVersion: controller.getSnapshot().state.state_version });
    expect(second.ok).toBe(false);
    expect(second.reason).toContain('重复');
    expect(controller.getSnapshot()).toBe(before);
  });

  it('rejects stale expectedStateVersion and keeps the state untouched', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const actor = state.active_player_id;
    const before = controller.getSnapshot();
    const stale: ActionRequest = { requestId: 'stale-1', expectedStateVersion: state.state_version + 5, action: { type: 'end_action_phase' } };
    const ack = controller.submitAction(actor, stale);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toContain('状态版本过期');
    expect(controller.getSnapshot()).toBe(before);
    // 过期被拒后，同批新请求使用当前版本仍可正常执行。
    const fresh: ActionRequest = { requestId: 'fresh-1', expectedStateVersion: state.state_version, action: { type: 'end_action_phase' } };
    expect(controller.submitAction(actor, fresh).ok).toBe(true);
  });

  it('rejects malformed requests via the runtime schema', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const actor = state.active_player_id;
    const ack = controller.submitAction(actor, {
      requestId: 'bad-1',
      expectedStateVersion: state.state_version,
      action: { type: 'deploy_operator', card_instance_id: 'x', lane: 'up' as never, position: 'front' },
    } as unknown as ActionRequest);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toContain('格式不合法');
  });
});

describe('toPlayerView information boundary', () => {
  it('shows the viewer own hand (with order) and only counts for the opponent', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const viewA = controller.toPlayerView('player_a');
    expect(viewA.hand.map((card) => card.instanceId)).toEqual([...state.players.player_a.hand]);
    expect(viewA.ownDeck).toEqual([...state.players.player_a.deck]);
    expect(viewA.players.player_b.deckCount).toBe(state.players.player_b.deck.length);
    expect(viewA.players.player_b.basePoints).toBe(state.players.player_b.base_points);
    // 类型层面就不存在对手手牌字段；运行时用 JSON 序列化做泄露检查（见下一条测试）。
    expect(Object.keys(viewA.players.player_b)).not.toContain('hand');
  });

  it('serializes without opponent hand ids, opponent deck order, or RNG state', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const viewA = JSON.stringify(controller.toPlayerView('player_a'));
    for (const id of state.players.player_b.hand) expect(viewA).not.toContain(id);
    for (const id of state.players.player_b.deck) expect(viewA).not.toContain(id);
    expect(viewA).not.toContain('random_state');
    expect(viewA).not.toContain('turn_start_prepared');
    expect(viewA).not.toContain(String(SEED));
  });

  it('gives different viewers different private views over the same public parts', () => {
    const controller = createControllerAtActionPhase();
    const state = controller.getSnapshot().state;
    const viewA = controller.toPlayerView('player_a');
    const viewB = controller.toPlayerView('player_b');
    expect(viewA.hand.map((card) => card.instanceId)).toEqual([...state.players.player_a.hand]);
    expect(viewB.hand.map((card) => card.instanceId)).toEqual([...state.players.player_b.hand]);
    expect(viewA.hand).not.toEqual(viewB.hand);
    expect(JSON.stringify(viewA)).not.toBe(JSON.stringify(viewB));
    expect(viewA.players).toEqual(viewB.players);
    expect(viewA.units).toEqual(viewB.units);
  });

  it('returns fresh objects: JSON round-trip is stable and mutating a view does not touch the controller', () => {
    const controller = createControllerAtActionPhase();
    const viewA = controller.toPlayerView('player_a');
    const roundTrip = JSON.parse(JSON.stringify(viewA)) as typeof viewA;
    expect(roundTrip).toEqual(viewA);
    const historyLength = controller.getSnapshot().logHistory.length;
    (roundTrip.combatLog as unknown as unknown[]).push({ sequence: 999, type: 'damage_resolved', detail: '伪造' });
    (roundTrip.hand as unknown as unknown[]).pop();
    expect(controller.getSnapshot().logHistory.length).toBe(historyLength);
    expect(controller.getSnapshot().state.players.player_a.hand.length).toBe(viewA.hand.length);
  });

  it('exposes pending facility choices only to the acting viewer', () => {
    let state = createControllerAtActionPhase().getSnapshot().state;
    const facilityRecord = Object.values(state.card_instances).find(
      (candidate) => candidate.card_id === 'DEMO-SUP-002' && (candidate.zone === 'deck' || candidate.zone === 'hand'),
    );
    if (!facilityRecord) throw new Error('测试前置失败：卡池里没有可用的 DEMO-SUP-002。');
    const facility = facilityRecord.card_instance_id;
    const ownerPlayer = state.players.player_a;
    state = {
      ...state,
      players: { ...state.players, player_a: { ...ownerPlayer, facility_ids: [facility] } },
      card_instances: {
        ...state.card_instances,
        [facility]: {
          ...state.card_instances[facility],
          zone: 'support',
          owner_id: 'player_a',
          controller_id: 'player_a',
          support_lifecycle: { turn_start_triggers: 0 },
        },
      },
      phase: 'turn_start',
      active_player_id: 'player_a',
      turn_start_prepared: true,
      pending_effect_choices: [{ source_instance_id: facility, effect: 'gain_sp', amount: 1 }],
    };
    const viewA = toPlayerView(state, 'player_a');
    const viewB = toPlayerView(state, 'player_b');
    expect(viewA.pendingEffectChoices).toEqual([{ sourceInstanceId: facility, amount: 1 }]);
    expect(viewB.pendingEffectChoices).toEqual([]);
  });

  it('passes the runtime PlayerView schema', () => {
    const controller = createControllerAtActionPhase();
    expect(isPlayerView(controller.toPlayerView('player_a'))).toBe(true);
    expect(isPlayerView(controller.toPlayerView('player_b'))).toBe(true);
    expect(isPlayerView({})).toBe(false);
    expect(isPlayerView(null)).toBe(false);
  });
});

describe('protocol schema validators', () => {
  it('accepts well-formed ActionRequest/Ack and rejects malformed ones', () => {
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: 0, action: { type: 'end_action_phase' } })).toBe(true);
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: 3, action: { type: 'deploy_operator', card_instance_id: 'x', lane: 'left', position: 'front' } })).toBe(true);
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: 3, action: { type: 'play_card', card_instance_id: 'x' } })).toBe(true);
    expect(isActionRequest({ requestId: '', expectedStateVersion: 0, action: { type: 'end_action_phase' } })).toBe(false);
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: -1, action: { type: 'end_action_phase' } })).toBe(false);
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: 0, action: { type: 'unknown_action' } })).toBe(false);
    expect(isActionRequest({ requestId: 'r', expectedStateVersion: 0, action: { type: 'deploy_operator', card_instance_id: 'x', lane: 'middle', position: 'front' } })).toBe(false);
    expect(isActionRequest(null)).toBe(false);

    const ack = { requestId: 'r', ok: true, stateVersion: 5 };
    expect(isActionAck(ack)).toBe(true);
    expect(isActionAck({ ...ack, ok: false, reason: '原因' })).toBe(true);
    expect(isActionAck({ ...ack, requestId: '' })).toBe(false);
    expect(isActionAck({ ...ack, stateVersion: 1.5 })).toBe(false);
  });
});

describe('AI as an ordinary action provider through the protocol path', () => {
  it('completes a full bot match via submitAction only (same engine entry as local play)', { timeout: 120_000 }, () => {
    const controller = LocalGameController.create({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed: 987654 });
    const bots: Record<PlayerId, BotPlayer> = {
      player_a: new BotPlayer({ player: 'player_a', rng: lcg(11) }),
      player_b: new BotPlayer({ player: 'player_b', rng: lcg(22) }),
    };
    let state: GameState = controller.getSnapshot().state;
    for (const playerId of PLAYERS) {
      const mulligan = controller.submitMulligan(playerId, botMulliganChoice(state, playerId));
      if (!mulligan.ok) throw new Error(`机器人换牌被拒绝：${mulligan.reason}`);
      state = controller.getSnapshot().state;
    }
    let counter = 0;
    let guard = 0;
    while (controller.getSnapshot().state.phase !== 'finished') {
      guard += 1;
      if (guard > 30_000) throw new Error('超过保护上限');
      state = controller.getSnapshot().state;
      const actor = state.active_player_id;
      const action = bots[actor].decide(state);
      const request: ActionRequest = { requestId: `bot-${counter}`, expectedStateVersion: state.state_version, action };
      counter += 1;
      const ack = controller.submitAction(actor, request);
      if (!ack.ok) throw new Error(`协议路径拒绝机器人动作：${ack.reason}`);
      expect(isActionAck(ack)).toBe(true);
    }
    const final = controller.getSnapshot().state;
    expect(final.phase).toBe('finished');
    expect(final.winner).not.toBeNull();
    expect(counter).toBeGreaterThan(20);
  });
});

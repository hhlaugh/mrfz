import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { enumerateLegalActions } from '../game/legal-actions';
import type { PlayerId } from '../game/types';
import { LocalGameController } from './localGameController';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');

const PLAYERS: readonly PlayerId[] = ['player_a', 'player_b'];

function createController(seed: number): LocalGameController {
  return LocalGameController.create({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed });
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function playFullMatch(seed: number): ReturnType<LocalGameController['getSnapshot']> {
  const controller = createController(seed);
  const rng = deterministicRandom(seed ^ 0x9e3779b9);
  const initial = controller.getSnapshot();
  expect(initial.state.phase).toBe('mulligan');
  for (const playerId of PLAYERS) {
    const hand = initial.state.players[playerId].hand;
    const selected = hand.slice(0, Math.floor(rng() * 4));
    const result = controller.submitMulligan(playerId, selected);
    expect(result.ok).toBe(true);
  }

  let guard = 0;
  let lastVersion = initial.state.state_version;
  while (controller.getSnapshot().state.phase !== 'finished' && guard < 60_000) {
    guard += 1;
    const { state } = controller.getSnapshot();
    expect(state.state_version).toBeGreaterThanOrEqual(lastVersion);
    lastVersion = state.state_version;

    const actor = state.active_player_id;
    const legal = enumerateLegalActions(state, actor);
    expect(legal.length).toBeGreaterThan(0);
    if (state.pending_effect_choices.length > 0) {
      expect(legal.every((action) => action.type === 'resolve_pending_choice')).toBe(true);
    }
    const action = legal[Math.floor(rng() * legal.length)];
    const result = controller.dispatch(actor, action);
    expect(result.ok).toBe(true);
  }
  expect(guard).toBeLessThan(60_000);

  const final = controller.getSnapshot();
  expect(final.state.phase).toBe('finished');
  expect(final.state.winner).not.toBeNull();
  return final;
}

describe('LocalGameController', () => {
  it('plays a full hotseat match through submitMulligan/dispatch only and reaches a terminal state', () => {
    const final = playFullMatch(2026);
    expect(final.logHistory.length).toBeGreaterThan(0);
  });

  it('keeps presentation log history strictly monotonic and contiguous', () => {
    const final = playFullMatch(77);
    for (let index = 1; index < final.logHistory.length; index += 1) {
      expect(final.logHistory[index].sequence).toBe(final.logHistory[index - 1].sequence + 1);
    }
  });

  it('auto-advances into the next decision point after end_action_phase', () => {
    const controller = createController(5);
    for (const playerId of PLAYERS) expect(controller.submitMulligan(playerId, []).ok).toBe(true);
    const afterMulligans = controller.getSnapshot().state;
    expect(afterMulligans.phase === 'action' || (afterMulligans.phase === 'turn_start' && afterMulligans.pending_effect_choices.length > 0)).toBe(true);

    const actor = afterMulligans.active_player_id;
    const result = controller.dispatch(actor, { type: 'end_action_phase' });
    expect(result.ok).toBe(true);
    const next = controller.getSnapshot().state;
    expect(next.phase === 'action' || next.phase === 'finished' || (next.phase === 'turn_start' && next.pending_effect_choices.length > 0)).toBe(true);
    if (next.phase === 'action') expect(next.active_player_id).not.toBe(actor);
  });

  it('rejects out-of-turn and illegal dispatches atomically without changing the snapshot', () => {
    const controller = createController(9);
    for (const playerId of PLAYERS) expect(controller.submitMulligan(playerId, []).ok).toBe(true);
    const before = controller.getSnapshot();
    const actor = before.state.active_player_id;
    const opponent: PlayerId = actor === 'player_a' ? 'player_b' : 'player_a';

    const outOfTurn = controller.dispatch(opponent, { type: 'end_action_phase' });
    expect(outOfTurn.ok).toBe(false);
    expect(outOfTurn.reason).toBeTruthy();
    expect(controller.getSnapshot()).toBe(before);

    const illegal = controller.dispatch(actor, { type: 'deploy_operator', card_instance_id: 'no:such:instance' as never, lane: 'left', position: 'front' });
    expect(illegal.ok).toBe(false);
    expect(illegal.reason).toBeTruthy();
    expect(controller.getSnapshot()).toBe(before);
  });
});

import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from './engine';
import { enumerateLegalActions } from './legal-actions';
import type { CardInstanceId, Cost, GameAction, GameState, PlayerId } from './types';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');

const PLAYERS: readonly PlayerId[] = ['player_a', 'player_b'];

function createMulliganState(seed: number): GameState {
  return createInitialGameState({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed });
}

function reachFirstActionPhase(seed: number): GameState {
  let state = createMulliganState(seed);
  for (const playerId of PLAYERS) {
    const result = mulligan(state, playerId, []);
    if (!result.ok) throw new Error(result.reason);
    state = result.value;
  }
  const advanced = advancePhase(state);
  if (!advanced.ok) throw new Error(advanced.reason);
  return advanced.value;
}

function withPlayerCost(state: GameState, playerId: PlayerId, cost: number): GameState {
  const player = state.players[playerId];
  return { ...state, players: { ...state.players, [playerId]: { ...player, cost: cost as Cost } } };
}

function withForcedHand(state: GameState, playerId: PlayerId, cardInstanceId: CardInstanceId): GameState {
  const player = state.players[playerId];
  const instance = state.card_instances[cardInstanceId];
  if (!instance) throw new Error('测试前置失败：实例不存在。');
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, hand: [cardInstanceId], deck: player.deck.filter((id) => id !== cardInstanceId) } },
    card_instances: { ...state.card_instances, [cardInstanceId]: { ...instance, zone: 'hand' } },
  };
}

describe('enumerateLegalActions', () => {
  it('returns no GameActions during the mulligan phase (mulligan is controller-driven)', () => {
    const state = createMulliganState(1);
    expect(enumerateLegalActions(state, 'player_a')).toHaveLength(0);
  });

  it('only offers engine-legal actions and always includes end_action_phase in the action phase', () => {
    const state = reachFirstActionPhase(11);
    const actions = enumerateLegalActions(state, state.active_player_id);
    expect(actions.some((action) => action.type === 'end_action_phase')).toBe(true);
    for (const action of actions) expect(reduceGameAction(state, state.active_player_id, action).ok).toBe(true);
  });

  it('hides unaffordable actions at zero cost but keeps end_action_phase reachable', () => {
    const base = reachFirstActionPhase(23);
    const actor = base.active_player_id;
    const actions = enumerateLegalActions(withPlayerCost(base, actor, 0), actor);
    expect(actions.some((action) => action.type === 'end_action_phase')).toBe(true);
    expect(actions.some((action) => action.type === 'deploy_operator')).toBe(false);
    for (const action of actions) {
      if (action.type === 'play_card') {
        const definition = base.card_definitions[base.card_instances[action.card_instance_id].card_id];
        expect(definition.cost).toBe(0);
      }
      if (action.type === 'deploy_operator') {
        const definition = base.card_definitions[base.card_instances[action.card_instance_id].card_id];
        expect(definition.cost).toBe(0);
      }
    }
    for (const action of actions) expect(reduceGameAction(withPlayerCost(base, actor, 0), actor, action).ok).toBe(true);
  });

  it('respects deploy_rule and floating position restrictions for a forced operator', () => {
    const base = reachFirstActionPhase(35);
    const actor = base.active_player_id;
    const operatorInDeck = Object.values(base.card_instances).find(
      (instance) => instance.owner_id === actor && instance.zone === 'deck' && base.card_definitions[instance.card_id].card_type === 'operator',
    );
    if (!operatorInDeck) throw new Error('测试前置失败：牌库中没有干员。');
    const state = withPlayerCost(withForcedHand(base, actor, operatorInDeck.card_instance_id), actor, 10);
    const deploys = enumerateLegalActions(state, actor).filter(
      (action): action is Extract<GameAction, { type: 'deploy_operator' }> =>
        action.type === 'deploy_operator' && action.card_instance_id === operatorInDeck.card_instance_id,
    );
    expect(deploys.length).toBeGreaterThan(0);
    const definition = state.card_definitions[operatorInDeck.card_id];
    for (const action of deploys) {
      if (definition.floating) expect(action.position).toBe('back');
      if (definition.deploy_rule === 'front_only') expect(action.position).toBe('front');
      if (definition.deploy_rule === 'back_only') expect(action.position).toBe('back');
      if (definition.attack_type === 'melee' && !definition.deploy_rule) expect(action.position).toBe('front');
    }
    expect(new Set(deploys.map((action) => `${action.lane}:${action.position}`)).size).toBe(deploys.length);
  });
});

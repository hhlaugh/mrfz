import { describe, expect, it } from 'vitest';
import { advancePhase, createInitialGameState, drawCards, mulligan, reduceGameAction } from './engine';
import type { RandomSource } from './random';
import type { BasePoints, CardDefinition, CardId, Cost, DeckDefinition, GameState, HpValue, PlayerId } from './types';

const testCards: CardDefinition[] = Array.from({ length: 10 }, (_, index) => ({
  card_id: `TEST-OP-${String(index + 1).padStart(3, '0')}` as CardId,
  card_name_zh: `测试干员${index + 1}`,
  card_type: 'operator',
  rarity: 1,
  cost: 1 as Cost,
  hp: 1 as HpValue,
  atk: 1,
  class: 'vanguard',
  attack_type: 'melee',
  deploy_rule: 'front_only',
  floating: false,
  max_sp: 5,
  starting_sp: 0,
  effect_trigger: 'none',
  effect_json: { trigger: 'none', actions: [] },
}));
const testCardId = testCards[0].card_id;
const testDeck: DeckDefinition = {
  deck_id: 'TEST-DECK',
  deck_name_zh: '测试牌组',
  cards: testCards.map((card) => ({ card_id: card.card_id, quantity: 2 })),
};
const fixedRandom: RandomSource = (state) => ({ value: 0.25, state: (state + 1) >>> 0 || 1 });

function createState(seed = 123): GameState {
  return createInitialGameState({
    decks: { player_a: testDeck, player_b: testDeck },
    cards: testCards,
    seed,
  });
}

function completeMulligans(state: GameState): GameState {
  const first = mulligan(state, 'player_a', []);
  if (!first.ok) throw new Error(first.reason);
  const second = mulligan(first.value, 'player_b', []);
  if (!second.ok) throw new Error(second.reason);
  return second.value;
}

function finishActionAndCombat(state: GameState): GameState {
  const ended = reduceGameAction(state, state.active_player_id, { type: 'end_action_phase' });
  if (!ended.ok) throw new Error(ended.reason);
  const combatDone = advancePhase(ended.value);
  if (!combatDone.ok) throw new Error(combatDone.reason);
  return combatDone.value;
}

describe('seeded initial state, shuffle, and mulligan', () => {
  it('creates two 20-card decks, deals five cards each, and starts at 20 base points / 0 cost', () => {
    const state = createState();
    expect(state.phase).toBe('mulligan');
    expect(state.turn_number).toBe(0);
    for (const playerId of ['player_a', 'player_b'] as const) {
      expect(state.players[playerId].base_points).toBe(20);
      expect(state.players[playerId].cost).toBe(0);
      expect(state.players[playerId].hand).toHaveLength(5);
      expect(state.players[playerId].deck).toHaveLength(15);
      expect(state.players[playerId].fatigue_count).toBe(0);
    }
    expect(new Set(Object.keys(state.card_instances)).size).toBe(40);
  });

  it('replays the same shuffle and opening deal for the same seed without mutating inputs', () => {
    const first = createState(77);
    const second = createState(77);
    expect(first).toEqual(second);
    expect(testDeck.cards).toHaveLength(10);
  });

  it('exchanges exactly the selected number, shuffles returns into the deck, and applies no fatigue', () => {
    const state = createState();
    const player = state.players.player_a;
    const selected = player.hand.slice(0, 2);
    const result = mulligan(state, 'player_a', selected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.value.players.player_a;
    expect(after.hand).toHaveLength(5);
    expect(after.hand.some((id) => selected.includes(id))).toBe(false);
    expect(after.deck).toHaveLength(15);
    expect(selected.every((id) => after.deck.includes(id))).toBe(true);
    expect(after.fatigue_count).toBe(0);
    expect(after.base_points).toBe(20);
    expect(result.value.mulligan_completed.player_a).toBe(true);
    expect(result.value.mulligan_completed.player_b).toBe(false);
    expect(result.value.phase).toBe('mulligan');
  });

  it('rejects foreign, duplicate, or repeated mulligan choices atomically', () => {
    const state = createState();
    const foreign = mulligan(state, 'player_a', [state.players.player_b.hand[0]]);
    expect(foreign).toMatchObject({ ok: false, value: state });
    const duplicate = mulligan(state, 'player_a', [state.players.player_a.hand[0], state.players.player_a.hand[0]]);
    expect(duplicate).toMatchObject({ ok: false, value: state });

    const done = mulligan(state, 'player_a', []);
    if (!done.ok) throw new Error(done.reason);
    expect(mulligan(done.value, 'player_a', [])).toMatchObject({ ok: false, value: done.value });
  });

  it('rejects a preset deck that exceeds the two-copy same-name rule', () => {
    const invalidDeck: DeckDefinition = {
      ...testDeck,
      deck_id: 'TOO-MANY-COPIES',
      cards: [{ card_id: testCardId, quantity: 3 }, ...testDeck.cards.slice(1)],
    };
    expect(() => createInitialGameState({
      decks: { player_a: invalidDeck, player_b: testDeck },
      cards: testCards,
      seed: 1,
    })).toThrow('同名卡');
  });

  it('chooses the first player only after both players finish mulligan and supports injected randomness', () => {
    const state = createState();
    const afterA = mulligan(state, 'player_a', [], fixedRandom);
    if (!afterA.ok) throw new Error(afterA.reason);
    expect(afterA.value.phase).toBe('mulligan');
    const afterB = mulligan(afterA.value, 'player_b', [], fixedRandom);
    if (!afterB.ok) throw new Error(afterB.reason);
    expect(afterB.value.phase).toBe('turn_start');
    expect(afterB.value.turn_number).toBe(1);
    expect(afterB.value.active_player_id).toBe('player_a');
  });
});

describe('draws, fatigue, hand limit, and victory', () => {
  it('applies fatigue as 1 + 2 + 3 and keeps each player counter independent', () => {
    const state = createState();
    const emptyA = { ...state.players.player_a, deck: [] };
    const prepared = { ...state, players: { ...state.players, player_a: emptyA } };
    const result = drawCards(prepared, 'player_a', 3);
    expect(result.fatigueDamage).toBe(6);
    expect(result.state.players.player_a.base_points).toBe(14);
    expect(result.state.players.player_a.fatigue_count).toBe(3);
    expect(result.state.players.player_b.fatigue_count).toBe(0);
    expect(result.state.players.player_a).not.toBe(emptyA);
  });

  it('discards a drawn card at the hand limit without fatigue', () => {
    const state = createState();
    const player = state.players.player_a;
    const addedToHand = player.deck.slice(0, 5);
    const fullPlayer = { ...player, hand: [...player.hand, ...addedToHand], deck: player.deck.slice(5) };
    const prepared = { ...state, players: { ...state.players, player_a: fullPlayer } };
    const result = drawCards(prepared, 'player_a', 1);
    expect(result.state.players.player_a.hand).toHaveLength(10);
    expect(result.discardedAtHandLimit).toHaveLength(1);
    expect(result.state.players.player_a.discard).toEqual(result.discardedAtHandLimit);
    expect(result.state.players.player_a.fatigue_count).toBe(0);
    expect(result.fatigueDamage).toBe(0);
  });

  it('sets a winner when fatigue reduces a base to zero', () => {
    const state = createState();
    const player = { ...state.players.player_a, deck: [], base_points: 1 as BasePoints };
    const prepared = { ...state, players: { ...state.players, player_a: player } };
    const result = drawCards(prepared, 'player_a', 1);
    expect(result.state.players.player_a.base_points).toBe(0);
    expect(result.state.phase).toBe('finished');
    expect(result.state.winner).toBe('player_b');
  });

  it('ends in a draw when both bases are at zero', () => {
    const state = createState();
    const prepared = {
      ...state,
      players: {
        player_a: { ...state.players.player_a, base_points: 0 as BasePoints },
        player_b: { ...state.players.player_b, base_points: 0 as BasePoints },
      },
    };
    const result = drawCards(prepared, 'player_a', 0);
    expect(result.state.phase).toBe('finished');
    expect(result.state.winner).toBe('draw');
  });
});

describe('turn phases, cost gain, and action reducer', () => {
  it('applies +3 cost at turn start, caps at 10, and preserves unspent cost', () => {
    const ready = completeMulligans(createState());
    const firstStart = advancePhase(ready);
    if (!firstStart.ok) throw new Error(firstStart.reason);
    expect(firstStart.value.phase).toBe('action');
    expect(firstStart.value.players[firstStart.value.active_player_id].cost).toBe(3);

    const active = firstStart.value.active_player_id;
    const withNine = {
      ...firstStart.value,
      players: { ...firstStart.value.players, [active]: { ...firstStart.value.players[active], cost: 9 as Cost } },
    } as GameState;
    const endedAction = finishActionAndCombat(withNine);
    const nextTurn = advancePhase(endedAction);
    if (!nextTurn.ok) throw new Error(nextTurn.reason);
    expect(nextTurn.value.phase).toBe('turn_start');
    expect(nextTurn.value.active_player_id).not.toBe(active);
    const secondStart = advancePhase(nextTurn.value);
    if (!secondStart.ok) throw new Error(secondStart.reason);
    const secondPlayer = nextTurn.value.active_player_id;
    expect(secondStart.value.players[secondPlayer].cost).toBe(3);
    expect(secondStart.value.players[active].cost).toBe(9);

    const secondEnded = finishActionAndCombat(secondStart.value);
    const backToFirst = advancePhase(secondEnded);
    if (!backToFirst.ok) throw new Error(backToFirst.reason);
    const firstPlayerTurn = advancePhase(backToFirst.value);
    if (!firstPlayerTurn.ok) throw new Error(firstPlayerTurn.reason);
    expect(firstPlayerTurn.value.active_player_id).toBe(active);
    expect(firstPlayerTurn.value.players[active].cost).toBe(10);
  });

  it('draws one card at each turn start and follows turn_start → action → combat → turn_end → other player', () => {
    const ready = completeMulligans(createState());
    const start = advancePhase(ready);
    if (!start.ok) throw new Error(start.reason);
    const active = start.value.active_player_id;
    expect(start.value.players[active].hand).toHaveLength(6);
    expect(start.value.players[active].deck).toHaveLength(14);
    expect(start.value.phase).toBe('action');

    const actionEnd = reduceGameAction(start.value, active, { type: 'end_action_phase' });
    expect(actionEnd.ok).toBe(true);
    if (!actionEnd.ok) return;
    expect(actionEnd.value.phase).toBe('combat');
    const combatEnd = advancePhase(actionEnd.value);
    if (!combatEnd.ok) throw new Error(combatEnd.reason);
    expect(combatEnd.value.phase).toBe('turn_end');
    const nextTurn = advancePhase(combatEnd.value);
    if (!nextTurn.ok) throw new Error(nextTurn.reason);
    expect(nextTurn.value.phase).toBe('turn_start');
    expect(nextTurn.value.active_player_id).not.toBe(active);
  });

  it('rejects out-of-turn and unimplemented actions without modifying state', () => {
    const ready = completeMulligans(createState());
    const start = advancePhase(ready);
    if (!start.ok) throw new Error(start.reason);
    const other: PlayerId = start.value.active_player_id === 'player_a' ? 'player_b' : 'player_a';
    const wrongActor = reduceGameAction(start.value, other, { type: 'end_action_phase' });
    expect(wrongActor).toMatchObject({ ok: false, value: start.value });
    const unavailable = reduceGameAction(start.value, start.value.active_player_id, {
      type: 'deploy_operator', card_instance_id: start.value.players.player_a.hand[0], lane: 'left', position: 'front',
    });
    expect(unavailable).toMatchObject({ ok: false, value: start.value });
  });
});

import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from '../game/engine';
import { BotPlayer, botMulliganChoice, stateHashForRepetition } from './botPlayer';
import type { CardInstanceId, Cost, GameState, HpValue, LaneId, PaidDeployCost, PlayerId, Position, SpValue } from '../game/types';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');

const PLAYERS: readonly PlayerId[] = ['player_a', 'player_b'];

function reachActionPhaseAs(seed: number, actor: PlayerId): GameState {
  let state = createInitialGameState({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed });
  for (const playerId of PLAYERS) {
    const result = mulligan(state, playerId, []);
    if (!result.ok) throw new Error(result.reason);
    state = result.value;
  }
  const advanced = advancePhase(state);
  if (!advanced.ok) throw new Error(advanced.reason);
  return { ...advanced.value, active_player_id: actor };
}

function findDeckInstance(state: GameState, owner: PlayerId, cardId: string): CardInstanceId {
  const instance = Object.values(state.card_instances).find(
    (candidate) => candidate.owner_id === owner && (candidate.zone === 'deck' || candidate.zone === 'hand') && candidate.card_id === cardId,
  );
  if (!instance) throw new Error(`测试前置失败：${owner} 的牌库/手牌里没有 ${cardId}。`);
  return instance.card_instance_id;
}

function withPlayerCost(state: GameState, playerId: PlayerId, cost: number): GameState {
  const player = state.players[playerId];
  return { ...state, players: { ...state.players, [playerId]: { ...player, cost: cost as Cost } } };
}

function withHand(state: GameState, playerId: PlayerId, hand: readonly CardInstanceId[]): GameState {
  const player = state.players[playerId];
  const updates: Record<CardInstanceId, GameState['card_instances'][CardInstanceId]> = {};
  for (const id of hand) {
    const instance = state.card_instances[id];
    if (instance && instance.zone !== 'hand') updates[id] = { ...instance, zone: 'hand' };
  }
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, hand: [...hand] } },
    card_instances: { ...state.card_instances, ...updates },
  };
}

function placeUnit(
  state: GameState,
  instanceId: CardInstanceId,
  options: { lane: LaneId; position: Position; hp?: number; sp?: number },
): GameState {
  const instance = state.card_instances[instanceId];
  if (!instance) throw new Error('测试前置失败：实例不存在。');
  const definition = state.card_definitions[instance.card_id];
  const owner = instance.owner_id;
  const player = state.players[owner];
  return {
    ...state,
    players: { ...state.players, [owner]: { ...player, deck: player.deck.filter((id) => id !== instanceId), hand: player.hand.filter((id) => id !== instanceId) } },
    card_instances: {
      ...state.card_instances,
      [instanceId]: {
        ...instance,
        zone: 'board',
        board_half: owner,
        lane: options.lane,
        position: options.position,
        operator_combat: {
          current_hp: (options.hp ?? definition.hp ?? 1) as HpValue,
          current_atk_modifiers: [],
          current_sp: (options.sp ?? definition.starting_sp ?? 0) as SpValue,
          shield: 0,
          statuses: [],
          equipment_ids: [],
        },
        operator_lifecycle: {
          redeploy_cd_remaining: 0,
          redeploy_cd_applied_owner_turn_index: null,
          has_deployed_before: true,
          entered_battle_this_owner_turn: false,
          paid_deploy_cost: definition.cost as unknown as PaidDeployCost,
          once_per_game_flags: {},
        },
      },
    },
  };
}

describe('BotPlayer (normal difficulty)', () => {
  it('deploys only on engine-legal slots with melee staying in front rows', () => {
    let state = withPlayerCost(reachActionPhaseAs(101, 'player_a'), 'player_a', 10);
    const fen = findDeckInstance(state, 'player_a', 'DEMO-OP-001');
    state = withHand(state, 'player_a', [fen]);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    const action = bot.decide(state);
    expect(action.type).toBe('deploy_operator');
    expect(reduceGameAction(state, 'player_a', action).ok).toBe(true);
    if (action.type === 'deploy_operator') expect(action.position).toBe('front');
  });

  it('prefers empty lanes over a lane it already occupies', () => {
    let state = withPlayerCost(reachActionPhaseAs(202, 'player_a'), 'player_a', 10);
    const fen = findDeckInstance(state, 'player_a', 'DEMO-OP-001');
    state = placeUnit(state, fen, { lane: 'left', position: 'front' });
    const sniper = findDeckInstance(state, 'player_a', 'DEMO-OP-005');
    state = withHand(state, 'player_a', [sniper]);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    const action = bot.decide(state);
    expect(action.type).toBe('deploy_operator');
    if (action.type === 'deploy_operator') expect(action.lane).not.toBe('left');
  });

  it('withdraws a dying unit but ends the phase when the unit is healthy', () => {
    let state = reachActionPhaseAs(303, 'player_a');
    const fen = findDeckInstance(state, 'player_a', 'DEMO-OP-001');
    state = placeUnit(state, fen, { lane: 'left', position: 'front', hp: 1 });
    const enemyCaster = findDeckInstance(state, 'player_b', 'DEMO-OP-006');
    state = placeUnit(state, enemyCaster, { lane: 'left', position: 'front' });
    state = withHand(state, 'player_a', []);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    const dying = bot.decide(state);
    expect(dying.type).toBe('withdraw_operator');
    expect(reduceGameAction(state, 'player_a', dying).ok).toBe(true);

    const healthyState = placeUnit(reachActionPhaseAs(303, 'player_a'), fen, { lane: 'left', position: 'front', hp: 3 });
    const withEnemy = placeUnit(healthyState, findDeckInstance(healthyState, 'player_b', 'DEMO-OP-004'), { lane: 'left', position: 'front' });
    const healthy = bot.decide(withHand(withEnemy, 'player_a', []));
    expect(healthy.type).toBe('end_action_phase');
  });

  it('fires the active skill at a killable same-lane enemy', () => {
    let state = reachActionPhaseAs(404, 'player_a');
    const caster = findDeckInstance(state, 'player_a', 'DEMO-OP-006');
    state = placeUnit(state, caster, { lane: 'left', position: 'front', sp: 5 });
    const enemyDefender = findDeckInstance(state, 'player_b', 'DEMO-OP-004');
    state = placeUnit(state, enemyDefender, { lane: 'left', position: 'front', hp: 2 });
    state = withHand(state, 'player_a', []);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    const action = bot.decide(state);
    expect(action.type).toBe('activate_skill');
    expect(reduceGameAction(state, 'player_a', action).ok).toBe(true);
    if (action.type === 'activate_skill') expect(action.target_instance_id).toBe(enemyDefender);
  });

  it('detects repeated states and restricts itself to advancing actions', () => {
    let state = reachActionPhaseAs(303, 'player_a');
    const fen = findDeckInstance(state, 'player_a', 'DEMO-OP-001');
    state = placeUnit(state, fen, { lane: 'left', position: 'front', hp: 1 });
    const enemyCaster = findDeckInstance(state, 'player_b', 'DEMO-OP-006');
    state = placeUnit(state, enemyCaster, { lane: 'left', position: 'front' });
    state = withHand(state, 'player_a', []);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    expect(bot.decide(state).type).toBe('withdraw_operator');
    expect(bot.decide(state).type).toBe('withdraw_operator');
    const third = bot.decide(state);
    expect(third.type).toBe('end_action_phase');
    expect(bot.getTelemetry().repetitionStops).toBe(1);
  });

  it('watchdog caps decisions per match as an AI-internal safety valve', () => {
    const state = withPlayerCost(reachActionPhaseAs(505, 'player_a'), 'player_a', 10);
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5, watchdog: { maxDecisionsPerMatch: 2 } });
    bot.decide(state);
    bot.decide(state);
    const third = bot.decide(state);
    expect(third.type).toBe('end_action_phase');
    const telemetry = bot.getTelemetry();
    expect(telemetry.watchdogStops).toBe(1);
    expect(telemetry.fallbacks).toBe(1);
  });

  it('builds a repetition hash that hides opponent hand contents', () => {
    const state = reachActionPhaseAs(606, 'player_a');
    const hash = stateHashForRepetition(state, 'player_a');
    expect(hash).not.toContain(state.players.player_b.hand.join(','));
    const withDifferentOpponentHand = {
      ...state,
      players: { ...state.players, player_b: { ...state.players.player_b, hand: [...state.players.player_b.hand].reverse() } },
    };
    expect(stateHashForRepetition(withDifferentOpponentHand, 'player_a')).toBe(hash);
  });

  it('mulligan choice only swaps expensive non-operator cards from its own hand', () => {
    const state = reachActionPhaseAs(707, 'player_a');
    const swaps = botMulliganChoice(state, 'player_a');
    const hand = new Set(state.players.player_a.hand);
    for (const id of swaps) {
      expect(hand.has(id)).toBe(true);
      const definition = state.card_definitions[state.card_instances[id].card_id];
      expect(definition.card_type).not.toBe('operator');
      expect(definition.cost).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('BotPlayer integration through the controller path', () => {
  it('first decision always resolves pending facility choices when present', () => {
    let state = reachActionPhaseAs(808, 'player_a');
    // 技力中继器在 B 牌组中，测试借用其定义实例并归到 player_a 名下构造设施选择场景。
    const facilityRecord = Object.values(state.card_instances).find(
      (candidate) => candidate.card_id === 'DEMO-SUP-002' && (candidate.zone === 'deck' || candidate.zone === 'hand'),
    );
    if (!facilityRecord) throw new Error('测试前置失败：卡池里没有可用的 DEMO-SUP-002。');
    const facility = facilityRecord.card_instance_id;
    // 直接把设施放到支援区并构造回合开始选择（绕过部署只为了快速构造场景，机器人仍走合法动作接口）。
    state = withHand(state, 'player_a', []);
    state = {
      ...state,
      players: { ...state.players, player_a: { ...state.players.player_a, facility_ids: [facility] } },
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
      turn_start_prepared: true,
      pending_effect_choices: [{ source_instance_id: facility, effect: 'gain_sp', amount: 1 }],
    };
    const bot = new BotPlayer({ player: 'player_a', rng: () => 0.5 });
    const action = bot.decide(state);
    expect(action.type).toBe('resolve_pending_choice');
    expect(reduceGameAction(state, 'player_a', action).ok).toBe(true);
  });
});

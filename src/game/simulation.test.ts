import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from './engine';
import { seededRandomSource } from './random';
import type { CardInstance, CardInstanceId, GameAction, GameState, PlayerId } from './types';

const loaded = loadDemoData();
if (loaded.issues.length) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');
const PLAYERS: readonly PlayerId[] = ['player_a', 'player_b'];
const LANES = ['left', 'center', 'right'] as const;
const POSITIONS = ['front', 'back'] as const;

export interface SimulationStats {
  games: number;
  completed: number;
  crashes: number;
  illegalStates: number;
  triggerSafetyStops: number;
  turnStartDraws: number;
  cardsDrawn: number;
  fatigueEvents: number;
  fatigueDamage: number;
  normalWithdrawals: number;
  rapidWithdrawals: number;
  normalRefund: number;
  rapidRefund: number;
  onDeployTriggers: number;
  spGained: number;
  statusApplications: number;
  supportTriggers: number;
  actionCount: number;
  maxTurnLimit: number;
}

class GameInvariantError extends Error {
  constructor(readonly violations: readonly string[]) { super(violations.join('; ')); }
}

export function validateGameStateInvariants(state: GameState): string[] {
  const issues: string[] = [];
  const occurrences = new Map<CardInstanceId, string[]>();
  const add = (id: CardInstanceId, place: string) => occurrences.set(id, [...(occurrences.get(id) ?? []), place]);
  const occupied = new Set<string>();
  for (const playerId of PLAYERS) {
    const player = state.players[playerId];
    if (player.cost < 0 || player.cost > 10 || !Number.isInteger(player.cost)) issues.push(`${playerId}: cost 越界 ${player.cost}`);
    if (!Number.isInteger(player.base_points)) issues.push(`${playerId}: base_points 非整数`);
    if (!Number.isInteger(player.fatigue_count) || player.fatigue_count < 0) issues.push(`${playerId}: fatigue_count 非法`);
    if (player.facility_ids.length > 2) issues.push(`${playerId}: 设施数量超过上限`);
    for (const id of player.deck) add(id, `${playerId}.deck`);
    for (const id of player.hand) add(id, `${playerId}.hand`);
    for (const id of player.discard) add(id, `${playerId}.discard`);
    for (const id of player.facility_ids) add(id, `${playerId}.facility`);
  }
  for (const [key, instance] of Object.entries(state.card_instances) as [CardInstanceId, CardInstance][]) {
    if (key !== instance.card_instance_id) issues.push(`${key}: map key 与 card_instance_id 不一致`);
    if (!state.card_definitions[instance.card_id]) issues.push(`${key}: 引用不存在 card_id ${instance.card_id}`);
    if (instance.zone === 'board') {
      add(instance.card_instance_id, 'board');
      if (!instance.board_half || !instance.lane || !instance.position) issues.push(`${key}: board 坐标不完整`);
      else {
        const slot = `${instance.board_half}:${instance.lane}:${instance.position}`;
        if (occupied.has(slot)) issues.push(`${slot}: 部署位重复占用`);
        occupied.add(slot);
      }
      if (!instance.operator_combat || !instance.operator_lifecycle) issues.push(`${key}: 在场干员缺少 combat/lifecycle 状态`);
      if (instance.operator_combat) {
        const definition = state.card_definitions[instance.card_id];
        if (!Number.isInteger(instance.operator_combat.current_hp) || instance.operator_combat.current_hp <= 0 || instance.operator_combat.current_hp > (definition.hp ?? 0)) issues.push(`${key}: HP 越界 ${instance.operator_combat.current_hp}`);
        if (!Number.isInteger(instance.operator_combat.current_sp) || instance.operator_combat.current_sp < 0 || instance.operator_combat.current_sp > (definition.max_sp ?? 5)) issues.push(`${key}: SP 越界 ${instance.operator_combat.current_sp}`);
        if (!Number.isInteger(instance.operator_combat.shield) || instance.operator_combat.shield < 0) issues.push(`${key}: 护盾非法`);
        for (const status of instance.operator_combat.statuses) if (!Number.isInteger(status.remaining_owner_turns) || status.remaining_owner_turns < 1) issues.push(`${key}: 状态持续时间非法 ${status.kind}`);
        if (new Set(instance.operator_combat.statuses.map(status => status.kind)).size !== instance.operator_combat.statuses.length) issues.push(`${key}: 同类状态重复`);
      }
    } else if (instance.zone === 'deck' || instance.zone === 'hand' || instance.zone === 'discard') {
      if (!occurrences.get(instance.card_instance_id)?.some(place => place.endsWith(`.${instance.zone}`))) issues.push(`${key}: zone=${instance.zone} 但未出现在对应玩家牌堆`);
    } else if (instance.zone === 'support') {
      const attached = Object.values(state.card_instances).some(host => host.operator_combat?.equipment_ids.includes(key));
      if (!occurrences.has(key) && !attached) issues.push(`${key}: 支援卡没有设施或装备宿主引用`);
      if (state.card_definitions[instance.card_id]?.support_subtype === 'facility') {
        const used = instance.support_lifecycle?.turn_start_triggers ?? 0;
        const limit = Number(state.card_definitions[instance.card_id].effect_json.max_triggers_per_match ?? Number.MAX_SAFE_INTEGER);
        if (!Number.isInteger(used) || used < 0 || used > limit) issues.push(`${key}: 设施触发次数超过规则限制`);
      }
    }
  }
  for (const host of Object.values(state.card_instances)) if (host.zone === 'board' && host.operator_combat) {
    if (host.operator_combat.equipment_ids.length > 1) issues.push(`${host.card_instance_id}: 装备数量超过上限`);
    for (const equipmentId of host.operator_combat.equipment_ids) {
      const equipment = state.card_instances[equipmentId];
      if (!equipment || equipment.zone !== 'support' || state.card_definitions[equipment.card_id]?.support_subtype !== 'equipment') issues.push(`${host.card_instance_id}: 装备引用无效 ${equipmentId}`);
      add(equipmentId, `${host.card_instance_id}.equipment`);
    }
  }
  for (const [id, places] of occurrences) if (places.length !== 1) issues.push(`${id}: 实例同时出现于 ${places.join(', ')}`);
  for (const playerId of PLAYERS) for (const id of [...state.players[playerId].deck, ...state.players[playerId].hand, ...state.players[playerId].discard, ...state.players[playerId].facility_ids]) {
    const instance = state.card_instances[id];
    if (!instance) issues.push(`${playerId}: 牌堆引用不存在实例 ${id}`);
    else if (instance.owner_id !== playerId) issues.push(`${playerId}: 列表包含另一所有者实例 ${id}`);
  }
  return issues;
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { const next = seededRandomSource(state); state = next.state; return next.value; };
}
function actionsFor(state: GameState, player: PlayerId): GameAction[] {
  const candidates: GameAction[] = [{ type: 'end_action_phase' }];
  const ownBoard = Object.values(state.card_instances).filter(i => i.zone === 'board' && i.controller_id === player);
  const enemyBoard = Object.values(state.card_instances).filter(i => i.zone === 'board' && i.controller_id !== player);
  for (const id of state.players[player].hand) {
    const instance = state.card_instances[id]; const definition = state.card_definitions[instance.card_id];
    if (definition.card_type === 'operator') for (const lane of LANES) for (const position of POSITIONS) candidates.push({ type: 'deploy_operator', card_instance_id: id, lane, position });
    else if (definition.card_type === 'tactic') {
      for (const target of [...ownBoard, ...enemyBoard]) candidates.push({ type: 'play_card', card_instance_id: id, target_instance_id: target.card_instance_id });
      if (definition.effect_json.actions.length === 1 && definition.effect_json.actions[0].type !== 'withdraw_operator') candidates.push({ type: 'play_card', card_instance_id: id });
    } else {
      candidates.push({ type: 'play_card', card_instance_id: id });
      for (const target of ownBoard) candidates.push({ type: 'play_card', card_instance_id: id, target_instance_id: target.card_instance_id });
    }
  }
  for (const unit of ownBoard) {
    candidates.push({ type: 'withdraw_operator', card_instance_id: unit.card_instance_id });
    candidates.push({ type: 'activate_skill', card_instance_id: unit.card_instance_id });
    for (const target of enemyBoard) candidates.push({ type: 'activate_skill', card_instance_id: unit.card_instance_id, target_instance_id: target.card_instance_id });
  }
  return candidates.filter(action => reduceGameAction(state, player, action).ok);
}

function assertInvariants(state: GameState): void {
  const issues = validateGameStateInvariants(state);
  if (issues.length) throw new GameInvariantError(issues);
}

export function simulateMatch(seed: number, stats?: SimulationStats): GameState {
  const rng = random(seed ^ 0x9e3779b9);
  let state = createInitialGameState({ decks: { player_a: deckA, player_b: deckB }, cards: loaded.validCards, seed });
  assertInvariants(state);
  for (const player of PLAYERS) {
    const count = Math.floor(rng() * 6);
    const selected = state.players[player].hand.slice(0, count);
    const result = mulligan(state, player, selected);
    if (!result.ok) throw new Error(`起手换牌失败：${result.reason}`);
    state = result.value; assertInvariants(state);
  }
  let actionGuard = 0;
  while (state.phase !== 'finished' && state.turn_number < 300 && actionGuard < 30_000) {
    if (state.phase === 'turn_start' && state.turn_start_prepared && state.pending_effect_choices.length > 0) {
      const choice = state.pending_effect_choices[0];
      const candidates = Object.values(state.card_instances).filter(unit => unit.zone === 'board' && unit.controller_id === state.active_player_id && unit.operator_combat && !unit.operator_combat.statuses.some(status => status.kind === 'freeze') && unit.operator_combat.current_sp < (state.card_definitions[unit.card_id].max_sp ?? 5));
      const target = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : undefined;
      const before = state;
      const result = reduceGameAction(state, state.active_player_id, { type: 'resolve_pending_choice', source_instance_id: choice.source_instance_id, ...(target ? { target_instance_id: target.card_instance_id } : {}) });
      if (!result.ok) throw new Error(`回合开始支援选择失败：${result.reason}`);
      state = result.value;
      if (stats) {
        stats.supportTriggers += target ? 1 : 0;
        stats.spGained += state.combat_log.slice(before.combat_log.length).filter(event => event.type === 'sp_gained').reduce((sum, event) => sum + (event.amount ?? 0), 0);
      }
      assertInvariants(state); continue;
    }
    if (state.phase === 'turn_start' || state.phase === 'combat' || state.phase === 'turn_end') {
      const before = state;
      const result = advancePhase(state);
      if (!result.ok) throw new Error(`阶段推进失败：${result.reason}`);
      state = result.value;
      if (before.phase === 'turn_start' && stats) {
        stats.turnStartDraws += 1;
        for (const player of PLAYERS) {
          stats.cardsDrawn += Math.max(0, before.players[player].deck.length - state.players[player].deck.length);
          const fatigue = state.players[player].fatigue_count - before.players[player].fatigue_count;
          stats.fatigueEvents += fatigue;
          if (fatigue) stats.fatigueDamage += Math.max(0, before.players[player].base_points - state.players[player].base_points);
        }
      }
      const phaseEvents = before.phase === 'combat' ? state.combat_log : state.combat_log.slice(before.combat_log.length);
      if (stats) stats.triggerSafetyStops += phaseEvents.filter(event => event.type === 'trigger_limit').length;
      if (stats) stats.spGained += phaseEvents.filter(event => event.type === 'sp_gained').reduce((sum, event) => sum + (event.amount ?? 0), 0);
      assertInvariants(state); continue;
    }
    if (state.phase !== 'action') throw new Error(`模拟遇到无法处理阶段 ${state.phase}`);
    const player = state.active_player_id;
    const legal = actionsFor(state, player);
    if (!legal.length) throw new Error('行动阶段没有可用合法动作（应至少能结束阶段）。');
    const action = legal[Math.floor(rng() * legal.length)];
    const previous = state;
    const result = reduceGameAction(state, player, action);
    if (!result.ok) throw new Error(`合法动作代理生成了非法动作：${result.reason}`);
    state = result.value; actionGuard += 1;
    if (stats) {
      stats.actionCount += 1;
      if (action.type === 'withdraw_operator') { stats.normalWithdrawals += 1; stats.normalRefund += Math.max(0, state.players[player].cost - previous.players[player].cost); }
      if (action.type === 'play_card') {
        const card = previous.card_instances[action.card_instance_id]; const definition = previous.card_definitions[card.card_id];
        if (definition.effect_json.actions.some(effect => effect.type === 'withdraw_operator')) {
          stats.rapidWithdrawals += 1; stats.rapidRefund += Math.max(0, state.players[player].cost - previous.players[player].cost);
        }
        if (definition.effect_json.actions.some(effect => effect.type === 'apply_status')) stats.statusApplications += 1;
      }
      if (action.type === 'deploy_operator' && previous.card_definitions[previous.card_instances[action.card_instance_id].card_id].effect_trigger === 'on_deploy') stats.onDeployTriggers += 1;
      const actionEvents = state.combat_log.slice(previous.combat_log.length);
      stats.spGained += actionEvents.filter(event => event.type === 'sp_gained').reduce((sum, event) => sum + (event.amount ?? 0), 0);
    }
    if (state.phase === 'action' && action.type !== 'end_action_phase') {
      // Keep action phases finite without imposing any gameplay redeploy cap.
      if (actionGuard % 120 === 0) {
        const end = reduceGameAction(state, player, { type: 'end_action_phase' });
        if (!end.ok) throw new Error(end.reason);
        state = end.value;
      }
    }
    assertInvariants(state);
  }
  if (state.phase !== 'finished') throw new Error(`模拟超过保护上限（turn=${state.turn_number}, actions=${actionGuard}）。`);
  if (stats) stats.completed += 1;
  return state;
}

function blankStats(games: number): SimulationStats {
  return { games, completed: 0, crashes: 0, illegalStates: 0, triggerSafetyStops: 0, turnStartDraws: 0, cardsDrawn: 0, fatigueEvents: 0, fatigueDamage: 0, normalWithdrawals: 0, rapidWithdrawals: 0, normalRefund: 0, rapidRefund: 0, onDeployTriggers: 0, spGained: 0, statusApplications: 0, supportTriggers: 0, actionCount: 0, maxTurnLimit: 0 };
}

describe('random legal-action simulation and state properties', () => {
  it('replays the same seed and action stream to the identical terminal state', () => {
    expect(simulateMatch(0x1234)).toEqual(simulateMatch(0x1234));
  });

  it('simulates 200 matches with invariant checks after every action', { timeout: 90_000 }, () => {
    const stats = blankStats(200);
    for (let seed = 1; seed <= stats.games; seed += 1) {
      try { simulateMatch(seed, stats); }
      catch (error) {
        stats.crashes += 1;
        if (error instanceof GameInvariantError) stats.illegalStates += 1;
        const message = error instanceof Error ? error.message : String(error);
        if (/超过保护上限/.test(message)) stats.maxTurnLimit += 1;
        throw new Error(`seed=${seed} 模拟失败：${message}`);
      }
    }
    console.log('200 局随机合法动作代理统计', stats);
    expect(stats.crashes).toBe(0);
    expect(stats.illegalStates).toBe(0);
    expect(stats.completed).toBe(stats.games);
    expect(stats.triggerSafetyStops).toBe(0);
    expect(stats.turnStartDraws).toBeGreaterThan(0);
    expect(stats.fatigueEvents).toBeGreaterThan(0);
  });
});

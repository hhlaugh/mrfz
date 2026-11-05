import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { advancePhase, createInitialGameState, mulligan, reduceGameAction } from './engine';
import type { CardId, CardInstance, CardInstanceId, Cost, GameState, PlayerId, StatusKind } from './types';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo data has validation issues: ${JSON.stringify(loaded.issues)}`);
const cards = loaded.validCards;
const cardIds = Object.fromEntries(cards.map((card) => [card.card_id, card.card_id])) as Record<string, CardId>;
const repeatedCardIds = ['DEMO-OP-001', 'DEMO-TAC-005', 'DEMO-SUP-001', 'DEMO-SUP-002'];
const deckCards = [
  ...cards.map((card) => ({ card_id: card.card_id, quantity: 1 })),
  ...repeatedCardIds.map((id) => ({ card_id: cardIds[id], quantity: 1 })),
];

function freshActionState(seed = 101): GameState {
  const state = createInitialGameState({
    decks: {
      player_a: { deck_id: 'LIFECYCLE-A', deck_name_zh: 'A', cards: deckCards },
      player_b: { deck_id: 'LIFECYCLE-B', deck_name_zh: 'B', cards: deckCards },
    },
    cards,
    seed,
  });
  const firstMulligan = applyMulligan(state, 'player_a');
  const secondMulligan = applyMulligan(firstMulligan, 'player_b');
  const start = advancePhase(secondMulligan);
  if (!start.ok) throw new Error(start.reason);
  return start.value;
}

function applyMulligan(state: GameState, playerId: PlayerId): GameState {
  const result = mulligan(state, playerId, []);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function giveCard(state: GameState, playerId: PlayerId, cardId: CardId): { state: GameState; cardInstanceId: CardInstanceId } {
  const candidates = Object.values(state.card_instances).filter((candidate) => candidate.owner_id === playerId && candidate.card_id === cardId && (candidate.zone === 'deck' || candidate.zone === 'hand'));
  candidates.sort((left, right) => Number(left.zone !== 'deck') - Number(right.zone !== 'deck'));
  const instance = candidates[0];
  if (!instance) throw new Error(`Missing ${cardId} for ${playerId}`);
  const player = state.players[playerId];
  const without = (ids: readonly CardInstanceId[]) => ids.filter((id) => id !== instance.card_instance_id);
  const nextPlayer = {
    ...player,
    hand: [...without(player.hand), instance.card_instance_id],
    deck: without(player.deck),
    discard: without(player.discard),
    facility_ids: without(player.facility_ids),
  };
  return {
    state: {
      ...state,
      players: { ...state.players, [playerId]: nextPlayer },
      card_instances: { ...state.card_instances, [instance.card_instance_id]: { ...instance, zone: 'hand' } },
    },
    cardInstanceId: instance.card_instance_id,
  };
}

function injectHandCopy(state: GameState, playerId: PlayerId, sourceId: CardInstanceId): { state: GameState; cardInstanceId: CardInstanceId } {
  const source = state.card_instances[sourceId];
  const id = `fixture-copy:${playerId}:${sourceId}` as CardInstanceId;
  const copy: CardInstance = { ...source, card_instance_id: id, owner_id: playerId, controller_id: playerId, zone: 'hand' };
  return {
    state: {
      ...state,
      players: { ...state.players, [playerId]: { ...state.players[playerId], hand: [...state.players[playerId].hand, id] } },
      card_instances: { ...state.card_instances, [id]: copy },
    },
    cardInstanceId: id,
  };
}

function setCost(state: GameState, playerId: PlayerId, cost: number): GameState {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], cost: cost as Cost } } };
}

function editInstance(state: GameState, id: CardInstanceId, update: (instance: CardInstance) => CardInstance): GameState {
  return { ...state, card_instances: { ...state.card_instances, [id]: update(state.card_instances[id]) } };
}

function dispatch(state: GameState, playerId: PlayerId, action: Parameters<typeof reduceGameAction>[2]): GameState {
  const result = reduceGameAction(state, playerId, action);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function deploy(state: GameState, playerId: PlayerId, cardInstanceId: CardInstanceId, lane: 'left' | 'center' | 'right' = 'left', position: 'front' | 'back' = 'front'): GameState {
  return dispatch(state, playerId, { type: 'deploy_operator', card_instance_id: cardInstanceId, lane, position });
}

function status(kind: StatusKind) {
  return { kind, remaining_owner_turns: 1, applied_on_owner_turn_index: 1, blocks_normal_withdrawal: kind === 'stun' || kind === 'freeze' } as const;
}

describe('deployment validation and atomicity', () => {
  it('enforces melee/ranged deployment rules and floating back-row restriction', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const melee = giveCard(state, actor, cardIds['DEMO-OP-001']);
    const illegalMelee = reduceGameAction(melee.state, actor, { type: 'deploy_operator', card_instance_id: melee.cardInstanceId, lane: 'left', position: 'back' });
    expect(illegalMelee).toMatchObject({ ok: false, value: melee.state });

    const ranged = giveCard(state, actor, cardIds['DEMO-OP-005']);
    expect(dispatch(ranged.state, actor, { type: 'deploy_operator', card_instance_id: ranged.cardInstanceId, lane: 'center', position: 'back' }).card_instances[ranged.cardInstanceId].zone).toBe('board');
    const illegalRangedFront = reduceGameAction(ranged.state, actor, { type: 'deploy_operator', card_instance_id: ranged.cardInstanceId, lane: 'center', position: 'front' });
    expect(illegalRangedFront).toMatchObject({ ok: false, value: ranged.state });

    const floating = giveCard(state, actor, cardIds['DEMO-OP-008']);
    const illegalFloating = reduceGameAction(floating.state, actor, { type: 'deploy_operator', card_instance_id: floating.cardInstanceId, lane: 'right', position: 'front' });
    expect(illegalFloating).toMatchObject({ ok: false, value: floating.state });
    expect(deploy(floating.state, actor, floating.cardInstanceId, 'right', 'back').card_instances[floating.cardInstanceId].position).toBe('back');
  });

  it('rejects insufficient cost and occupied slots without partial payment or hand movement', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const one = giveCard(state, actor, cardIds['DEMO-OP-001']);
    const lowCost = setCost(one.state, actor, 0);
    const noFunds = reduceGameAction(lowCost, actor, { type: 'deploy_operator', card_instance_id: one.cardInstanceId, lane: 'left', position: 'front' });
    expect(noFunds).toMatchObject({ ok: false, value: lowCost });
    expect(noFunds.value.players[actor].cost).toBe(0);
    expect(noFunds.value.players[actor].hand).toContain(one.cardInstanceId);

    const second = giveCard(one.state, actor, cardIds['DEMO-OP-003']);
    const board = deploy(second.state, actor, one.cardInstanceId);
    const occupied = reduceGameAction(board, actor, { type: 'deploy_operator', card_instance_id: second.cardInstanceId, lane: 'left', position: 'front' });
    expect(occupied).toMatchObject({ ok: false, value: board });
    expect(occupied.value.players[actor].hand).toContain(second.cardInstanceId);
  });

  it('allows separate same-name instances in separate slots and records lifecycle/payment independently', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const first = giveCard(state, actor, cardIds['DEMO-OP-001']);
    const second = giveCard(first.state, actor, cardIds['DEMO-OP-001']);
    const withFunds = setCost(second.state, actor, 8);
    const deployed = deploy(withFunds, actor, first.cardInstanceId, 'left', 'front');
    const deployedAgain = deploy(deployed, actor, second.cardInstanceId, 'right', 'front');
    const firstState = deployedAgain.card_instances[first.cardInstanceId].operator_lifecycle;
    const secondState = deployedAgain.card_instances[second.cardInstanceId].operator_lifecycle;
    expect(firstState?.has_deployed_before).toBe(true);
    expect(firstState?.paid_deploy_cost).toBe(1);
    expect(secondState?.has_deployed_before).toBe(true);
    expect(secondState?.paid_deploy_cost).toBe(1);
    expect(deployedAgain.players[actor].cost).toBe(6);
  });
});

describe('normal and rapid withdrawal', () => {
  it.each([
    ['stun', 'status'],
    ['freeze', 'status'],
    ['slow', 'none'],
    ['grounded', 'none'],
    ['taunt', 'none'],
  ] as const)('normal withdrawal status rule for %s', (kind, expected) => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-004']);
    const deployed = deploy(setCost(operator.state, actor, 10), actor, operator.cardInstanceId);
    const controlled = editInstance(deployed, operator.cardInstanceId, (instance) => ({
      ...instance,
      operator_combat: { ...instance.operator_combat!, statuses: [status(kind)] },
    }));
    const result = reduceGameAction(controlled, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId });
    if (expected === 'status') {
      expect(result).toMatchObject({ ok: false, value: controlled });
      expect(result.value.players[actor].cost).toBe(7);
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it('normal withdrawal requires control and own half, refunds floor(paid cost × ratio), resets combat, and preserves lifecycle', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-004']);
    const deployed = deploy(setCost(operator.state, actor, 10), actor, operator.cardInstanceId);
    const dirty = editInstance(deployed, operator.cardInstanceId, (instance) => ({
      ...instance,
      operator_combat: { ...instance.operator_combat!, current_hp: 1 as never, current_atk_modifiers: [2], current_sp: 3 as never, shield: 4, statuses: [status('slow')] },
    }));
    const enemyHalf = editInstance(dirty, operator.cardInstanceId, (instance) => ({ ...instance, board_half: actor === 'player_a' ? 'player_b' : 'player_a' }));
    const wrongHalf = reduceGameAction(enemyHalf, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId });
    expect(wrongHalf).toMatchObject({ ok: false, value: enemyHalf });
    const wrongController = editInstance(dirty, operator.cardInstanceId, (instance) => ({ ...instance, controller_id: actor === 'player_a' ? 'player_b' : 'player_a' }));
    expect(reduceGameAction(wrongController, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId })).toMatchObject({ ok: false, value: wrongController });

    const valid = setCost(dirty, actor, 0);
    const withdrawn = dispatch(valid, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId });
    const instance = withdrawn.card_instances[operator.cardInstanceId];
    const definition = withdrawn.card_definitions[instance.card_id];
    expect(withdrawn.players[actor].cost).toBe(1);
    expect(withdrawn.players[actor].hand).toContain(operator.cardInstanceId);
    expect(instance.zone).toBe('hand');
    expect(instance.operator_combat?.current_hp).toBe(definition.hp);
    expect(instance.operator_combat?.current_atk_modifiers).toEqual([]);
    expect(instance.operator_combat?.current_sp).toBe(definition.starting_sp);
    expect(instance.operator_combat?.shield).toBe(0);
    expect(instance.operator_combat?.statuses).toEqual([]);
    expect(instance.operator_lifecycle).toMatchObject({ has_deployed_before: true, entered_battle_this_owner_turn: true, paid_deploy_cost: null, redeploy_cd_remaining: 1 });
    expect(instance.operator_lifecycle?.redeploy_cd_applied_owner_turn_index).toBe(withdrawn.players[actor].turns_taken);
  });

  it.each(['stun', 'freeze'] as const)('rapid withdrawal bypasses %s and opposite-half restriction, refunds actual paid cost, and clears state', (kind) => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-005']);
    const tactic = giveCard(operator.state, actor, cardIds['DEMO-TAC-005']);
    const deployed = deploy(setCost(tactic.state, actor, 10), actor, operator.cardInstanceId, 'left', 'back');
    const controlled = editInstance(deployed, operator.cardInstanceId, (instance) => ({
      ...instance,
      board_half: actor === 'player_a' ? 'player_b' : 'player_a',
      operator_combat: { ...instance.operator_combat!, current_hp: 1 as never, current_sp: 4 as never, shield: 9, statuses: [status(kind)] },
    }));
    const withCost = setCost(controlled, actor, 7);
    const result = dispatch(withCost, actor, { type: 'play_card', card_instance_id: tactic.cardInstanceId, target_instance_id: operator.cardInstanceId });
    const unit = result.card_instances[operator.cardInstanceId];
    expect(result.players[actor].cost).toBe(9);
    expect(result.players[actor].hand).toContain(operator.cardInstanceId);
    expect(result.players[actor].hand).not.toContain(tactic.cardInstanceId);
    expect(result.players[actor].discard).toContain(tactic.cardInstanceId);
    expect(unit.zone).toBe('hand');
    expect(unit.board_half).toBeNull();
    expect(unit.operator_combat?.current_hp).toBe(result.card_definitions[unit.card_id].hp);
    expect(unit.operator_combat?.current_sp).toBe(result.card_definitions[unit.card_id].starting_sp);
    expect(unit.operator_combat?.shield).toBe(0);
    expect(unit.operator_combat?.statuses).toEqual([]);
    expect(unit.operator_lifecycle).toMatchObject({ has_deployed_before: true, entered_battle_this_owner_turn: true, paid_deploy_cost: null, redeploy_cd_remaining: 0 });
    const secondRequest = reduceGameAction(result, actor, { type: 'play_card', card_instance_id: tactic.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(secondRequest).toMatchObject({ ok: false, value: result });
  });

  it('a forced-withdraw action without explicit exemptions cannot bypass control or half restrictions', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-005']);
    const tactic = giveCard(operator.state, actor, cardIds['DEMO-TAC-005']);
    const deployed = deploy(setCost(tactic.state, actor, 10), actor, operator.cardInstanceId, 'left', 'back');
    const restricted = editInstance(deployed, operator.cardInstanceId, instance => ({
      ...instance,
      board_half: actor === 'player_a' ? 'player_b' : 'player_a',
      operator_combat: { ...instance.operator_combat!, statuses: [status('freeze')] },
    }));
    const card = restricted.card_instances[tactic.cardInstanceId];
    const definition = restricted.card_definitions[card.card_id];
    const effect = definition.effect_json.actions[0];
    const noExemptions = { ...restricted, card_definitions: { ...restricted.card_definitions, [card.card_id]: { ...definition, effect_json: { ...definition.effect_json, actions: [{ ...effect, ignore_control_restriction: false, ignore_half_restriction: false }] } } } };
    const rejected = reduceGameAction(noExemptions, actor, { type: 'play_card', card_instance_id: tactic.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(rejected).toMatchObject({ ok: false, value: noExemptions });
    expect(rejected.value.players[actor].hand).toContain(tactic.cardInstanceId);
    expect(rejected.value.players[actor].cost).toBe(noExemptions.players[actor].cost);
  });

  it('rapid withdrawal still rejects a unit controlled by the opponent atomically', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-005']);
    const tactic = giveCard(operator.state, actor, cardIds['DEMO-TAC-005']);
    const deployed = deploy(setCost(tactic.state, actor, 10), actor, operator.cardInstanceId, 'left', 'back');
    const enemyControlled = editInstance(deployed, operator.cardInstanceId, (instance) => ({ ...instance, controller_id: actor === 'player_a' ? 'player_b' : 'player_a' }));
    const result = reduceGameAction(enemyControlled, actor, { type: 'play_card', card_instance_id: tactic.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(result).toMatchObject({ ok: false, value: enemyControlled });
    expect(result.value.players[actor].hand).toContain(tactic.cardInstanceId);
  });

  it('permits immediate redeployment after rapid withdrawal and re-triggers deployment cost gains each time', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-002']);
    const quickOne = giveCard(operator.state, actor, cardIds['DEMO-TAC-005']);
    const quickTwo = giveCard(quickOne.state, actor, cardIds['DEMO-TAC-005']);
    const noFunds = setCost(quickTwo.state, actor, 0);
    const rejectedDeploy = reduceGameAction(noFunds, actor, { type: 'deploy_operator', card_instance_id: operator.cardInstanceId, lane: 'left', position: 'front' });
    expect(rejectedDeploy).toMatchObject({ ok: false, value: noFunds });
    expect(rejectedDeploy.value.players[actor].cost).toBe(0);
    expect(rejectedDeploy.value.players[actor].hand).toContain(operator.cardInstanceId);
    const start = setCost(quickTwo.state, actor, 6);
    const firstDeploy = deploy(start, actor, operator.cardInstanceId);
    expect(firstDeploy.players[actor].cost).toBe(5); // cost 2, then on_deploy +1
    const firstWithdraw = dispatch(firstDeploy, actor, { type: 'play_card', card_instance_id: quickOne.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(firstWithdraw.players[actor].cost).toBe(7); // full refund of actual paid cost 2
    const secondDeploy = deploy(firstWithdraw, actor, operator.cardInstanceId, 'center');
    expect(secondDeploy.players[actor].cost).toBe(6); // same instance's on_deploy fires again
    const secondWithdraw = dispatch(secondDeploy, actor, { type: 'play_card', card_instance_id: quickTwo.cardInstanceId, target_instance_id: operator.cardInstanceId });
    const thirdDeploy = deploy(secondWithdraw, actor, operator.cardInstanceId, 'right');
    expect(thirdDeploy.players[actor].cost).toBe(7);
    expect(thirdDeploy.card_instances[operator.cardInstanceId].operator_lifecycle?.has_deployed_before).toBe(true);
    expect(thirdDeploy.card_instances[operator.cardInstanceId].operator_lifecycle?.redeploy_cd_remaining).toBe(0);
  });
});

describe('support, equipment and redeploy cooldown', () => {
  it('resolves the relay facility target choice at turn start before natural SP; frozen-only boards do not consume its limit', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-006']);
    const facility = giveCard(operator.state, actor, cardIds['DEMO-SUP-002']);
    const deployed = deploy(setCost(facility.state, actor, 10), actor, operator.cardInstanceId, 'left', 'back');
    const installed = dispatch(deployed, actor, { type: 'play_card', card_instance_id: facility.cardInstanceId });
    const turnStart = advancePhase({ ...installed, phase: 'turn_start' });
    if (!turnStart.ok) throw new Error(turnStart.reason);
    expect(turnStart.value.phase).toBe('turn_start');
    expect(turnStart.value.pending_effect_choices).toHaveLength(1);
    const wrongTarget = reduceGameAction(turnStart.value, actor, { type: 'resolve_pending_choice', source_instance_id: facility.cardInstanceId, target_instance_id: facility.cardInstanceId });
    expect(wrongTarget).toMatchObject({ ok: false, value: turnStart.value });
    const selected = reduceGameAction(turnStart.value, actor, { type: 'resolve_pending_choice', source_instance_id: facility.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.value.phase).toBe('action');
      expect(selected.value.card_instances[operator.cardInstanceId].operator_combat?.current_sp).toBe(2); // facility + natural turn-start SP
      expect(selected.value.card_instances[facility.cardInstanceId].support_lifecycle?.turn_start_triggers).toBe(1);
      let repeated = selected.value;
      for (let trigger = 1; trigger < 3; trigger += 1) {
        const nextStart = advancePhase({ ...repeated, phase: 'turn_start', turn_start_prepared: false });
        if (!nextStart.ok) throw new Error(nextStart.reason);
        expect(nextStart.value.pending_effect_choices).toHaveLength(1);
        const nextChoice = reduceGameAction(nextStart.value, actor, { type: 'resolve_pending_choice', source_instance_id: facility.cardInstanceId, target_instance_id: operator.cardInstanceId });
        if (!nextChoice.ok) throw new Error(nextChoice.reason);
        repeated = nextChoice.value;
      }
      expect(repeated.card_instances[facility.cardInstanceId].support_lifecycle?.turn_start_triggers).toBe(3);
      const capped = advancePhase({ ...repeated, phase: 'turn_start', turn_start_prepared: false });
      if (!capped.ok) throw new Error(capped.reason);
      expect(capped.value.phase).toBe('action');
      expect(capped.value.pending_effect_choices).toHaveLength(0);
      expect(capped.value.card_instances[facility.cardInstanceId].support_lifecycle?.turn_start_triggers).toBe(3);
    }

    const frozenOperator = editInstance(deployed, operator.cardInstanceId, instance => ({ ...instance, operator_combat: { ...instance.operator_combat!, statuses: [status('freeze')] } }));
    const frozenFacility = dispatch(frozenOperator, actor, { type: 'play_card', card_instance_id: facility.cardInstanceId });
    const frozenStart = advancePhase({ ...frozenFacility, phase: 'turn_start' });
    if (!frozenStart.ok) throw new Error(frozenStart.reason);
    expect(frozenStart.value.phase).toBe('action');
    expect(frozenStart.value.card_instances[operator.cardInstanceId].operator_combat?.current_sp).toBe(0);
    expect(frozenStart.value.card_instances[facility.cardInstanceId].support_lifecycle?.turn_start_triggers).toBe(0);
  });

  it('enforces two active facilities and one equipment per operator; equipment is discarded when host withdraws', () => {
    const state = freshActionState();
    const actor = state.active_player_id;
    const facilityOne = giveCard(state, actor, cardIds['DEMO-SUP-002']);
    const facilityTwo = giveCard(facilityOne.state, actor, cardIds['DEMO-SUP-002']);
    const facilityThree = injectHandCopy(facilityTwo.state, actor, facilityTwo.cardInstanceId);
    const enough = setCost(facilityThree.state, actor, 10);
    const first = dispatch(enough, actor, { type: 'play_card', card_instance_id: facilityOne.cardInstanceId });
    const second = dispatch(first, actor, { type: 'play_card', card_instance_id: facilityTwo.cardInstanceId });
    expect(second.players[actor].facility_ids).toHaveLength(2);
    const overLimit = reduceGameAction(second, actor, { type: 'play_card', card_instance_id: facilityThree.cardInstanceId });
    expect(overLimit).toMatchObject({ ok: false, value: second });

    const operator = giveCard(second, actor, cardIds['DEMO-OP-005']);
    const equipmentOne = giveCard(operator.state, actor, cardIds['DEMO-SUP-001']);
    const equipmentTwo = giveCard(equipmentOne.state, actor, cardIds['DEMO-SUP-001']);
    const deployed = deploy(setCost(equipmentTwo.state, actor, 10), actor, operator.cardInstanceId, 'left', 'back');
    const equipped = dispatch(deployed, actor, { type: 'play_card', card_instance_id: equipmentOne.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(equipped.card_instances[operator.cardInstanceId].operator_combat?.shield).toBe(2);
    expect(equipped.card_instances[operator.cardInstanceId].operator_combat?.equipment_ids).toEqual([equipmentOne.cardInstanceId]);
    const duplicate = reduceGameAction(equipped, actor, { type: 'play_card', card_instance_id: equipmentTwo.cardInstanceId, target_instance_id: operator.cardInstanceId });
    expect(duplicate).toMatchObject({ ok: false, value: equipped });

    const withdrawn = dispatch(equipped, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId });
    expect(withdrawn.players[actor].discard).toContain(equipmentOne.cardInstanceId);
    expect(withdrawn.card_instances[equipmentOne.cardInstanceId].zone).toBe('discard');
    expect(withdrawn.card_instances[operator.cardInstanceId].operator_combat?.equipment_ids).toEqual([]);
    expect(withdrawn.card_instances[operator.cardInstanceId].operator_combat?.shield).toBe(0);
  });

  it('does not decrement CD at the withdrawal turn end; skips the next own action phase then permits redeploy', () => {
    let state = freshActionState();
    const actor = state.active_player_id;
    const operator = giveCard(state, actor, cardIds['DEMO-OP-001']);
    state = deploy(setCost(operator.state, actor, 10), actor, operator.cardInstanceId);
    state = dispatch(state, actor, { type: 'withdraw_operator', card_instance_id: operator.cardInstanceId });
    expect(state.card_instances[operator.cardInstanceId].operator_lifecycle?.redeploy_cd_remaining).toBe(1);
    state = dispatch(state, actor, { type: 'end_action_phase' });
    expect(state.card_instances[operator.cardInstanceId].operator_lifecycle?.redeploy_cd_remaining).toBe(1);
    let phase = advancePhase(state); // combat → turn_end
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value); // opponent turn_start
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value); // opponent action
    if (!phase.ok) throw new Error(phase.reason);
    state = dispatch(phase.value, phase.value.active_player_id, { type: 'end_action_phase' });
    phase = advancePhase(state); // combat → turn_end
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value); // owner's turn_start
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value); // owner's action
    if (!phase.ok) throw new Error(phase.reason);
    const cannotYet = reduceGameAction(phase.value, actor, { type: 'deploy_operator', card_instance_id: operator.cardInstanceId, lane: 'right', position: 'front' });
    expect(cannotYet).toMatchObject({ ok: false, value: phase.value });
    state = dispatch(phase.value, actor, { type: 'end_action_phase' });
    expect(state.card_instances[operator.cardInstanceId].operator_lifecycle?.redeploy_cd_remaining).toBe(0);
    let otherTurn = advancePhase(state);
    if (!otherTurn.ok) throw new Error(otherTurn.reason);
    otherTurn = advancePhase(otherTurn.value);
    if (!otherTurn.ok) throw new Error(otherTurn.reason);
    otherTurn = advancePhase(otherTurn.value);
    if (!otherTurn.ok) throw new Error(otherTurn.reason);
    state = dispatch(otherTurn.value, otherTurn.value.active_player_id, { type: 'end_action_phase' });
    phase = advancePhase(state);
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value);
    if (!phase.ok) throw new Error(phase.reason);
    phase = advancePhase(phase.value);
    if (!phase.ok) throw new Error(phase.reason);
    const redeployed = reduceGameAction(phase.value, actor, { type: 'deploy_operator', card_instance_id: operator.cardInstanceId, lane: 'right', position: 'front' });
    expect(redeployed.ok).toBe(true);
  });
});

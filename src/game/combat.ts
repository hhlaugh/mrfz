import type { BasePoints, CardDefinition, CardInstance, CardInstanceId, CombatLogEvent, GameState, HpValue, LaneId, PlayerId, SpValue, StatusEffect } from './types';
import { drainTriggerQueue, MAX_TRIGGER_DEPTH } from './trigger-queue';

const LANES: readonly LaneId[] = ['left', 'center', 'right'];
type MutableState = GameState;
type Trigger = { source: CardInstanceId; trigger: 'on_attacked' | 'on_damaged' | 'on_death' | 'on_kill' | 'combat_end'; target?: CardInstanceId };

export function addCombatLog(state: MutableState, event: Omit<CombatLogEvent, 'sequence'>): MutableState {
  return { ...state, combat_log: [...state.combat_log, { ...event, sequence: state.combat_log.length }] };
}
function log(state: MutableState, event: Omit<CombatLogEvent, 'sequence'>): MutableState {
  return addCombatLog(state, event);
}
function def(state: GameState, instance: CardInstance): CardDefinition | undefined { return state.card_definitions[instance.card_id]; }
function updateInstance(state: MutableState, id: CardInstanceId, update: (i: CardInstance) => CardInstance): MutableState {
  const i = state.card_instances[id]; return i ? { ...state, card_instances: { ...state.card_instances, [id]: update(i) } } : state;
}
function hasStatus(i: CardInstance, kind: string): boolean { return Boolean(i.operator_combat?.statuses.some(s => s.kind === kind)); }
function frozen(i: CardInstance): boolean { return hasStatus(i, 'freeze'); }
function disabled(i: CardInstance): boolean { return frozen(i) || hasStatus(i, 'stun'); }
function nativeFloating(state: GameState, i: CardInstance): boolean { return def(state, i)?.floating === true; }
function isGrounded(state: GameState, i: CardInstance): boolean {
  if (hasStatus(i, 'grounded')) return true;
  return !nativeFloating(state, i) || disabled(i);
}
function legalCombatTarget(state: GameState, i: CardInstance, attacker: CardInstance): boolean {
  const d = def(state, i); if (!d || d.card_type !== 'operator' || !i.operator_combat || disabled(i)) return false;
  return !nativeFloating(state, i) || isGrounded(state, i) || def(state, attacker)?.attack_type === 'ranged';
}
function canIntercept(state: GameState, i: CardInstance): boolean {
  return Boolean(i.zone === 'board' && i.operator_combat && !disabled(i) && isGrounded(state, i));
}
function chooseTarget(state: GameState, attacker: CardInstance): CardInstance | undefined {
  if (!attacker.lane) return undefined;
  const enemyBoard = Object.values(state.card_instances).filter(i => i.zone === 'board' && i.controller_id !== attacker.controller_id && legalCombatTarget(state, i, attacker));
  const taunts = enemyBoard.filter(i => !frozen(i) && (def(state, i)?.taunt_scope === 'all_lanes' || (i.lane === attacker.lane && def(state, i)?.taunt_scope === 'same_lane')));
  const position = (i: CardInstance) => i.position === 'front' ? 0 : 1;
  const stable = (a: CardInstance, b: CardInstance) => position(a) - position(b) || a.card_instance_id.localeCompare(b.card_instance_id);
  if (taunts.length) return taunts.sort(stable)[0];
  const enemy = enemyBoard.filter(i => i.lane === attacker.lane);
  const ground = enemy.filter(i => canIntercept(state, i));
  const front = ground.filter(i => i.position === 'front').sort(stable)[0]; if (front) return front;
  const back = ground.filter(i => i.position === 'back').sort(stable)[0]; if (back) return back;
  if (def(state, attacker)?.attack_type === 'ranged') return enemy.filter(i => nativeFloating(state, i) && !isGrounded(state, i)).sort(stable)[0];
  return undefined;
}
function gainSp(state: MutableState, id: CardInstanceId, amount: number, reason: string, shouldLog = true): MutableState {
  const i = state.card_instances[id]; if (!i?.operator_combat || frozen(i) || amount <= 0) return state;
  const d = def(state, i); const before = i.operator_combat.current_sp;
  const after = Math.min(d?.max_sp ?? 5, before + amount); const gained = after - before;
  if (!gained) return state;
  let next = updateInstance(state, id, x => ({ ...x, operator_combat: { ...x.operator_combat!, current_sp: after as SpValue } }));
  if (!shouldLog || reason === '回合开始自然回复' || reason.includes('自然回复')) return next;
  const pName = i.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
  const detail = reason.includes('击杀')
    ? `${pName}【${d?.card_name_zh ?? id}】触发击杀效果，获得 ${gained} SP。`
    : `${reason}：${pName}【${d?.card_name_zh ?? id}】获得 ${gained} SP。`;
  return log(next, {
    type: 'sp_gained',
    source_instance_id: id,
    target_instance_id: id,
    source_player_id: i.controller_id,
    target_player_id: i.controller_id,
    source_name: d?.card_name_zh,
    target_name: d?.card_name_zh,
    amount: gained,
    detail,
  });
}
export function grantSp(state: GameState, id: CardInstanceId, amount: number, reason: string): GameState { return gainSp(state, id, amount, reason); }
function spendSp(state: MutableState, id: CardInstanceId, cost: number): MutableState {
  return updateInstance(state, id, i => ({ ...i, operator_combat: { ...i.operator_combat!, current_sp: (i.operator_combat!.current_sp - cost) as SpValue } }));
}
function markDead(state: MutableState, id: CardInstanceId, killerId?: CardInstanceId): MutableState {
  const i = state.card_instances[id]; if (!i) return state;
  const owner = state.players[i.owner_id];
  const equipment = i.operator_combat?.equipment_ids ?? [];
  let next: MutableState = { ...state, players: { ...state.players, [i.owner_id]: { ...owner, discard: [...owner.discard, id, ...equipment] } } };
  const updates: Record<CardInstanceId, CardInstance> = { [id]: { ...i, zone: 'discard', board_half: null, lane: null, position: null, operator_combat: undefined } };
  for (const equipmentId of equipment) {
    const attached = state.card_instances[equipmentId];
    if (attached) updates[equipmentId] = { ...attached, zone: 'discard', board_half: null, lane: null, position: null };
  }
  next = { ...next, card_instances: { ...next.card_instances, ...updates } };

  const killer = killerId ? state.card_instances[killerId] : undefined;
  const killerDef = killer ? def(state, killer) : undefined;
  const killerPlayer = killer ? (killer.controller_id === 'player_a' ? '玩家 A' : '玩家 B') : '';
  const killerLabel = killerDef
    ? `${killerPlayer}【${killerDef.card_name_zh}】`
    : '';
  const victimPlayer = i.owner_id === 'player_a' ? '玩家 A' : '玩家 B';
  const victimName = def(state, i)?.card_name_zh ?? id;
  const victimLabel = `${victimPlayer}【${victimName}】`;
  const detail = killerLabel ? `${killerLabel} 击杀了 ${victimLabel}！` : `${victimLabel} 阵亡并进入弃牌堆。`;

  return log(next, {
    type: 'unit_defeated',
    source_instance_id: killerId,
    target_instance_id: id,
    source_player_id: killer?.controller_id,
    target_player_id: i.owner_id,
    source_name: killerDef?.card_name_zh,
    target_name: victimName,
    action_type: 'kill',
    detail,
  });
}

export function applyStatusToInstance(state: GameState, targetId: CardInstanceId, kind: StatusEffect['kind'], duration: number): GameState {
  const target = state.card_instances[targetId];
  if (!target?.operator_combat || target.zone !== 'board' || !Number.isInteger(duration) || duration < 1) return state;
  if (kind === 'grounded' && !nativeFloating(state, target)) return state;
  const current = target.operator_combat.statuses;
  if (kind === 'stun' && current.some(s => s.kind === 'freeze')) return state;
  const incoming: StatusEffect = { kind, remaining_owner_turns: duration, applied_on_owner_turn_index: state.players[target.owner_id].turns_taken, blocks_normal_withdrawal: kind === 'stun' || kind === 'freeze' };
  let statuses = current.filter(s => s.kind !== kind);
  if (kind === 'freeze') statuses = statuses.filter(s => s.kind !== 'stun');
  if (kind === 'stun') statuses = statuses.filter(s => s.kind !== 'freeze');
  const prior = current.find(s => s.kind === kind);
  statuses = [...statuses, prior && prior.remaining_owner_turns > duration ? prior : incoming];
  return updateInstance(state, targetId, i => ({ ...i, operator_combat: { ...i.operator_combat!, statuses } }));
}

export function applyEffectDamage(state: GameState, sourceId: CardInstanceId, targetId: CardInstanceId, amount: number): GameState {
  const target = state.card_instances[targetId];
  if (!target?.operator_combat || target.zone !== 'board' || !Number.isInteger(amount) || amount < 0) return state;
  const shieldDamage = Math.min(target.operator_combat.shield, amount);
  const hpDamage = Math.min(target.operator_combat.current_hp, amount - shieldDamage);
  let next = updateInstance(state, targetId, i => ({ ...i, operator_combat: { ...i.operator_combat!, shield: i.operator_combat!.shield - shieldDamage, current_hp: (i.operator_combat!.current_hp - hpDamage) as HpValue } }));
  const source = next.card_instances[sourceId];
  const sourceDef = source ? def(next, source) : undefined;
  const targetDef = def(next, target);
  const srcPlayer = source ? (source.controller_id === 'player_a' ? '玩家 A' : '玩家 B') : '';
  const srcName = sourceDef ? `${srcPlayer}【${sourceDef.card_name_zh}】` : '效果';
  const tgtPlayer = target.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
  const tgtName = `${tgtPlayer}【${targetDef?.card_name_zh ?? targetId}】`;

  if (shieldDamage) {
    next = log(next, {
      type: 'shield_absorbed',
      source_instance_id: sourceId,
      target_instance_id: targetId,
      source_player_id: source?.controller_id,
      target_player_id: target.controller_id,
      source_name: sourceDef?.card_name_zh,
      target_name: targetDef?.card_name_zh,
      amount: shieldDamage,
      detail: `${tgtName} 的护盾吸收了 ${shieldDamage} 点伤害。`,
    });
  }
  next = log(next, {
    type: 'damage_resolved',
    source_instance_id: sourceId,
    target_instance_id: targetId,
    source_player_id: source?.controller_id,
    target_player_id: target.controller_id,
    source_name: sourceDef?.card_name_zh,
    target_name: targetDef?.card_name_zh,
    amount: hpDamage,
    absorbed: shieldDamage,
    action_type: 'skill_damage',
    detail: `${srcName} 触发技能效果，对 ${tgtName} 造成 ${hpDamage} 点 HP 伤害！`,
  });

  if (hpDamage > 0 && next.card_instances[targetId].operator_combat) {
    next = gainSp(next, targetId, def(next, next.card_instances[targetId])?.sp_gain_on_damaged ?? 0, '受到伤害');
  }
  if ((next.card_instances[targetId].operator_combat?.current_hp ?? 1) <= 0) {
    next = markDead(next, targetId, sourceId);
    if (sourceDef?.card_type === 'operator') next = resolveTriggerQueue(next, [{ source: sourceId, trigger: 'on_kill', target: targetId }], 0).state;
  }
  return next;
}
function resolveTriggerQueue(state: MutableState, initial: readonly Trigger[], damage: number): { state: MutableState; damage: number } {
  let next = state; let currentDamage = damage;
  const entries = initial.map(payload => ({ payload, depth: 0 }));
  const queueResult = drainTriggerQueue(entries, task => {
    const source = next.card_instances[task.source]; const target = task.target ? next.card_instances[task.target] : undefined;
    if (!source?.operator_combat || !target || source.zone !== 'board' || frozen(source)) return [];
    if (task.trigger === 'on_kill') {
      const spGain = def(next, source)?.sp_gain_on_kill ?? 0;
      if (spGain > 0) {
        next = gainSp(next, source.card_instance_id, spGain, '击杀回复');
      }
      return [];
    }
    if (task.trigger !== 'on_attacked') return [];
    const sourceDefinition = def(next, source); const action = sourceDefinition?.effect_json.actions?.find(x => x.type === 'reduce_incoming_damage' && typeof x.sp_cost === 'number');
    if (!sourceDefinition || !action || source.operator_combat.current_sp < (action.sp_cost as number)) return [];
    next = spendSp(next, source.card_instance_id, action.sp_cost as number);
    const sourcePlayer = source.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
    next = log(next, {
      type: 'sp_spent',
      source_instance_id: source.card_instance_id,
      target_instance_id: source.card_instance_id,
      source_player_id: source.controller_id,
      target_player_id: source.controller_id,
      source_name: sourceDefinition.card_name_zh,
      amount: action.sp_cost as number,
      detail: `${sourcePlayer}【${sourceDefinition.card_name_zh}】支付 ${action.sp_cost} SP 反应技能费用。`,
    });
    const reactionValue = typeof action.value === 'number' ? action.value : 0;
    next = log(next, {
      type: 'reaction_triggered',
      source_instance_id: source.card_instance_id,
      target_instance_id: target.card_instance_id,
      source_player_id: source.controller_id,
      target_player_id: target.controller_id,
      source_name: sourceDefinition.card_name_zh,
      target_name: def(next, target)?.card_name_zh,
      skill_name: '受击减伤反应',
      amount: reactionValue,
      action_type: 'reaction',
      detail: `${sourcePlayer}【${sourceDefinition.card_name_zh}】触发技能【受击减伤反应】，减免 ${reactionValue} 点受击伤害！`,
    });
    currentDamage = Math.max(0, currentDamage - (typeof action.value === 'number' ? action.value : 0));
    return [];
  }, task => {
    const definition = def(next, next.card_instances[task.source]);
    return Number(definition?.effect_json.skill_priority ?? definition?.effect_json.actions?.[0]?.skill_priority ?? 0);
  }, task => task.source);
  if (queueResult.exceededDepthLimit) next = log(next, { type: 'trigger_limit', detail: `触发队列达到安全阀 ${MAX_TRIGGER_DEPTH}，余下效果停止。` });
  return { state: next, damage: currentDamage };
}
function resolveAttack(state: MutableState, attackerId: CardInstanceId): MutableState {
  const attacker = state.card_instances[attackerId]; if (!attacker?.operator_combat || attacker.zone !== 'board' || disabled(attacker) || attacker.operator_lifecycle?.entered_battle_this_owner_turn) return state;
  const ad = def(state, attacker); if (!ad || ad.card_type !== 'operator') return state;
  let attack = Math.max(0, (ad.atk ?? 0) + attacker.operator_combat.current_atk_modifiers.reduce((sum, x) => sum + x, 0));
  if (hasStatus(attacker, 'slow')) {
    attack = Math.max(0, attack - 1);
    const statuses = attacker.operator_combat.statuses.filter(s => s.kind !== 'slow');
    state = updateInstance(state, attackerId, i => ({ ...i, operator_combat: { ...i.operator_combat!, statuses } }));
  }
  let target = chooseTarget(state, state.card_instances[attackerId]);
  const attackerPlayer = attacker.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
  const attackerLaneZh = attacker.lane === 'left' ? '左路' : attacker.lane === 'center' ? '中路' : '右路';
  const attackerPosZh = attacker.position === 'front' ? '前排' : '后排';

  if (!target) {
    state = log(state, {
      type: 'attack_declared',
      source_instance_id: attackerId,
      source_player_id: attacker.controller_id,
      source_name: ad.card_name_zh,
      lane: attacker.lane ?? undefined,
      position: attacker.position ?? undefined,
      amount: attack,
      action_type: 'attack',
      detail: `${attackerPlayer}【${ad.card_name_zh}】[${attackerLaneZh}·${attackerPosZh}] 发起普通攻击（攻击力 ${attack}）。`,
    });
    const defender = attacker.controller_id === 'player_a' ? 'player_b' : 'player_a';
    const defenderPlayer = defender === 'player_a' ? '玩家 A' : '玩家 B';
    state = { ...state, players: { ...state.players, [defender]: { ...state.players[defender], base_points: (state.players[defender].base_points - attack) as BasePoints } } };
    return log(state, {
      type: 'base_damaged',
      source_instance_id: attackerId,
      player_id: defender,
      source_player_id: attacker.controller_id,
      target_player_id: defender,
      source_name: ad.card_name_zh,
      lane: attacker.lane ?? undefined,
      position: attacker.position ?? undefined,
      amount: attack,
      action_type: 'attack',
      detail: `${attackerPlayer}【${ad.card_name_zh}】[${attackerLaneZh}·${attackerPosZh}] 直击 ${defenderPlayer} 基地，造成 ${attack} 点基本分伤害！`,
    });
  }

  const td = def(state, target);
  const targetPlayer = target.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
  const targetName = td?.card_name_zh ?? target.card_instance_id;
  const targetLaneZh = target.lane === 'left' ? '左路' : target.lane === 'center' ? '中路' : '右路';
  const targetPosZh = target.position === 'front' ? '前排' : '后排';

  state = log(state, {
    type: 'attack_declared',
    source_instance_id: attackerId,
    target_instance_id: target.card_instance_id,
    source_player_id: attacker.controller_id,
    target_player_id: target.controller_id,
    source_name: ad.card_name_zh,
    target_name: targetName,
    lane: attacker.lane ?? undefined,
    position: attacker.position ?? undefined,
    amount: attack,
    action_type: 'attack',
    detail: `${attackerPlayer}【${ad.card_name_zh}】[${attackerLaneZh}·${attackerPosZh}] 发起攻击，目标为 ${targetPlayer}【${targetName}】[${targetLaneZh}·${targetPosZh}]（攻击力 ${attack}）。`,
  });

  state = log(state, {
    type: 'target_selected',
    source_instance_id: attackerId,
    target_instance_id: target.card_instance_id,
    source_player_id: attacker.controller_id,
    target_player_id: target.controller_id,
    source_name: ad.card_name_zh,
    target_name: targetName,
    lane: attacker.lane ?? undefined,
    position: attacker.position ?? undefined,
    detail: `${attackerPlayer}【${ad.card_name_zh}】锁定攻击目标 ${targetPlayer}【${targetName}】。`,
  });

  const reaction = resolveTriggerQueue(state, [{ source: target.card_instance_id, trigger: 'on_attacked', target: attackerId }], attack);
  state = reaction.state;
  attack = reaction.damage;
  target = state.card_instances[target.card_instance_id];
  // A reaction may have removed the target. A committed attack does not retarget.
  if (!target || target.zone !== 'board' || !target.operator_combat) return state;

  const combat = target.operator_combat;
  const absorbed = Math.min(combat.shield, attack);
  const hpDamage = Math.min(combat.current_hp, attack - absorbed);
  state = updateInstance(state, target.card_instance_id, i => ({ ...i, operator_combat: { ...i.operator_combat!, shield: i.operator_combat!.shield - absorbed, current_hp: (i.operator_combat!.current_hp - hpDamage) as HpValue } }));
  if (absorbed) {
    state = log(state, {
      type: 'shield_absorbed',
      source_instance_id: attackerId,
      target_instance_id: target.card_instance_id,
      source_player_id: attacker.controller_id,
      target_player_id: target.controller_id,
      source_name: ad.card_name_zh,
      target_name: targetName,
      amount: absorbed,
      detail: `${targetPlayer}【${targetName}】的护盾吸收了 ${absorbed} 点伤害。`,
    });
  }

  const absorbedText = absorbed > 0 ? `（护盾吸收 ${absorbed} 点）` : '';
  state = log(state, {
    type: 'damage_resolved',
    source_instance_id: attackerId,
    target_instance_id: target.card_instance_id,
    source_player_id: attacker.controller_id,
    target_player_id: target.controller_id,
    source_name: ad.card_name_zh,
    target_name: targetName,
    lane: attacker.lane ?? undefined,
    position: attacker.position ?? undefined,
    amount: hpDamage,
    absorbed,
    action_type: 'attack',
    detail: `${attackerPlayer}【${ad.card_name_zh}】攻击 ${targetPlayer}【${targetName}】，造成 ${hpDamage} 点 HP 伤害${absorbedText}！`,
  });

  const updatedTarget = state.card_instances[target.card_instance_id];
  if ((updatedTarget.operator_combat?.current_hp ?? 0) > 0) {
    const updatedTd = def(state, updatedTarget);
    if ((updatedTd?.sp_gain_on_attacked ?? 0) > 0) {
      state = gainSp(state, target.card_instance_id, updatedTd?.sp_gain_on_attacked ?? 0, '受到攻击');
    }
    if (hpDamage > 0 && (updatedTd?.sp_gain_on_damaged ?? 0) > 0) {
      state = gainSp(state, target.card_instance_id, updatedTd?.sp_gain_on_damaged ?? 0, '受到伤害');
    }
  } else {
    state = markDead(state, target.card_instance_id, attackerId);
    state = resolveTriggerQueue(state, [{ source: attackerId, trigger: 'on_kill', target: target.card_instance_id }], 0).state;
  }
  return state;
}

function combatEndHealing(state: MutableState, actor: PlayerId): MutableState {
  const healers = Object.values(state.card_instances).filter(i => i.zone === 'board' && i.controller_id === actor && def(state, i)?.effect_trigger === 'combat_end' && !frozen(i));
  for (const healer of healers) {
    const action = def(state, healer)?.effect_json.actions.find(a => a.type === 'heal'); if (!action || typeof action.value !== 'number') continue;
    const target = Object.values(state.card_instances).find(i => i.zone === 'board' && i.controller_id === actor && i.lane === healer.lane && i.position === 'front' && i.operator_combat && i.operator_combat.current_hp < (def(state, i)?.hp ?? 0));
    if (!target?.operator_combat) continue;
    const value = Math.min(action.value, (def(state, target)?.hp ?? target.operator_combat.current_hp) - target.operator_combat.current_hp);
    state = updateInstance(state, target.card_instance_id, i => ({ ...i, operator_combat: { ...i.operator_combat!, current_hp: (i.operator_combat!.current_hp + value) as HpValue } }));
    const healerPlayer = actor === 'player_a' ? '玩家 A' : '玩家 B';
    const targetPlayer = target.controller_id === 'player_a' ? '玩家 A' : '玩家 B';
    const healerDef = def(state, healer);
    const targetDef = def(state, target);
    state = log(state, {
      type: 'healed',
      source_instance_id: healer.card_instance_id,
      target_instance_id: target.card_instance_id,
      source_player_id: actor,
      target_player_id: target.controller_id,
      source_name: healerDef?.card_name_zh,
      target_name: targetDef?.card_name_zh,
      skill_name: '战场急救',
      amount: value,
      action_type: 'combat_end_heal',
      detail: `${healerPlayer}【${healerDef?.card_name_zh}】触发战斗结束技能【战场急救】，治疗 ${targetPlayer}【${targetDef?.card_name_zh}】${value} 点 HP！`,
    });
  }
  return state;
}

export function resolveCombat(state: GameState): GameState {
  const actor = state.active_player_id;
  let next: MutableState = { ...state, combat_log: [] };
  const queue: CardInstanceId[] = [];
  for (const lane of LANES) for (const position of ['front', 'back'] as const) {
    const unit = Object.values(next.card_instances).filter(i => i.zone === 'board' && i.controller_id === actor && i.lane === lane && i.position === position).sort((a,b)=>a.card_instance_id.localeCompare(b.card_instance_id))[0];
    if (unit) queue.push(unit.card_instance_id);
  }
  for (const id of queue) {
    next = resolveAttack(next, id);
    if (next.players.player_a.base_points <= 0 || next.players.player_b.base_points <= 0) break;
  }
  next = combatEndHealing(next, actor);
  const aLost = next.players.player_a.base_points <= 0; const bLost = next.players.player_b.base_points <= 0;
  const winner: GameState['winner'] = !aLost && !bLost ? null : aLost && bLost ? 'draw' : aLost ? 'player_b' : 'player_a';
  next = { ...next, phase: winner ? 'finished' : 'turn_end', winner, state_version: next.state_version + 1 };
  return next;
}

export function naturalSpAtTurnStart(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  for (const i of Object.values(state.card_instances)) {
    if (i.zone !== 'board' || i.controller_id !== playerId || !i.operator_combat) continue;
    const amount = def(state, i)?.sp_regen_per_turn ?? 1;
    next = gainSp(next, i.card_instance_id, amount, '回合开始自然回复', false);
  }
  return next;
}

export function expireOwnerTurnStatuses(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  for (const i of Object.values(state.card_instances)) {
    if (i.zone !== 'board' || i.owner_id !== playerId || !i.operator_combat) continue;
    const statuses = i.operator_combat.statuses.flatMap((status: StatusEffect) => {
      if (status.applied_on_owner_turn_index >= state.players[playerId].turns_taken) return [status];
      const remaining = status.remaining_owner_turns - 1;
      if (remaining <= 0) {
        next = log(next, { type: 'status_expired', target_instance_id: i.card_instance_id, detail: `${status.kind} 状态到期。` });
        return [];
      }
      return [{ ...status, remaining_owner_turns: remaining }];
    });
    next = updateInstance(next, i.card_instance_id, x => ({ ...x, operator_combat: { ...x.operator_combat!, statuses } }));
  }
  return next;
}

import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { createInitialGameState, mulligan, reduceGameAction } from './engine';
import { applyEffectDamage, expireOwnerTurnStatuses, grantSp, naturalSpAtTurnStart, resolveCombat } from './combat';
import type { CardId, CardInstance, CardInstanceId, GameState, HpValue, PlayerId } from './types';

const data = loadDemoData();
if (data.issues.length) throw new Error(JSON.stringify(data.issues));
const cards = data.validCards;
const id = (s: string) => s as CardId;
function emptyFight(): GameState {
  const deck = { deck_id: 'FIGHT', deck_name_zh: '测试', cards: [...cards.map(c => ({ card_id: c.card_id, quantity: 1 })), { card_id: id('DEMO-OP-003'), quantity: 1 }] };
  let state = createInitialGameState({ decks: { player_a: deck, player_b: { ...deck, deck_id: 'FIGHT-B' } }, cards, seed: 4 });
  const a = mulligan(state, 'player_a', []); if (!a.ok) throw new Error(a.reason);
  const b = mulligan(a.value, 'player_b', []); if (!b.ok) throw new Error(b.reason);
  state = b.value;
  return { ...state, phase: 'combat', active_player_id: 'player_a', players: { ...state.players, player_a: { ...state.players.player_a, turns_taken: 1 }, player_b: { ...state.players.player_b, turns_taken: 1 } }, card_instances: { ...state.card_instances } };
}
function put(state: GameState, player: PlayerId, cardId: string, lane: 'left'|'center'|'right', position: 'front'|'back', options: { hp?: number; sp?: number; shield?: number; statuses?: CardInstance['operator_combat'] extends infer C ? C extends { statuses: infer S } ? S : never : never } = {}): [GameState, CardInstanceId] {
  const instance = Object.values(state.card_instances).find(i => i.owner_id === player && i.card_id === id(cardId) && (i.zone === 'deck' || i.zone === 'hand'));
  if (!instance) throw new Error(`missing ${player}:${cardId}`);
  const definition = state.card_definitions[instance.card_id];
  const placed = { ...instance, zone: 'board' as const, board_half: player, lane, position,
    operator_combat: { current_hp: (options.hp ?? definition.hp ?? 1) as HpValue, current_atk_modifiers: [], current_sp: (options.sp ?? 0) as never, shield: options.shield ?? 0, statuses: options.statuses ?? [], equipment_ids: [] },
    operator_lifecycle: { redeploy_cd_remaining: 0, redeploy_cd_applied_owner_turn_index: null, has_deployed_before: true, entered_battle_this_owner_turn: false, paid_deploy_cost: 1 as never, once_per_game_flags: {} } };
  const playerState = state.players[player];
  return [{ ...state, players: { ...state.players, [player]: { ...playerState, hand: playerState.hand.filter(x => x !== instance.card_instance_id), deck: playerState.deck.filter(x => x !== instance.card_instance_id) } }, card_instances: { ...state.card_instances, [instance.card_instance_id]: placed } }, instance.card_instance_id];
}
function handCard(state: GameState, player: PlayerId, cardId: string, cost = 10): [GameState, CardInstanceId] {
  const instance=Object.values(state.card_instances).find(i=>i.owner_id===player && i.card_id===id(cardId) && (i.zone==='deck'||i.zone==='hand'));
  if(!instance) throw new Error(`missing hand fixture ${cardId}`);
  const p=state.players[player];
  return [{...state,players:{...state.players,[player]:{...p,cost:cost as never,deck:p.deck.filter(x=>x!==instance.card_instance_id),hand:[...p.hand.filter(x=>x!==instance.card_instance_id),instance.card_instance_id]}},card_instances:{...state.card_instances,[instance.card_instance_id]:{...instance,zone:'hand'}}},instance.card_instance_id];
}
const status = (kind: 'stun'|'freeze'|'grounded'|'slow'|'taunt', turns = 1) => [{ kind, remaining_owner_turns: turns, applied_on_owner_turn_index: 0, blocks_normal_withdrawal: kind === 'stun' || kind === 'freeze' }] as const;

describe('automatic combat target selection and settlement', () => {
  it('runs only active player attacks in lane/front-back order and retargets after each death', () => {
    let s = emptyFight();
    let aFront: CardInstanceId; let aBack: CardInstanceId; let bFront: CardInstanceId; let bBack: CardInstanceId;
    [s,aFront]=put(s,'player_a','DEMO-OP-003','left','front');
    [s,aBack]=put(s,'player_a','DEMO-OP-003','left','back');
    [s,bFront]=put(s,'player_b','DEMO-OP-003','left','front',{hp:3});
    [s,bBack]=put(s,'player_b','DEMO-OP-003','left','back',{hp:4});
    s=resolveCombat(s);
    expect(s.combat_log.filter(e=>e.type==='target_selected').map(e=>e.target_instance_id)).toEqual([bFront,bBack]);
    expect(s.combat_log.filter(e=>e.type==='attack_declared').map(e=>e.source_instance_id)).toEqual([aFront,aBack]);
    expect(s.players.player_b.discard).toContain(bFront);
    expect(s.card_instances[bBack].operator_combat?.current_hp).toBe(1);
  });
  it('attacks base if only a stunned defender is present; stunned units are not interceptors', () => {
    let s=emptyFight(); let attacker: CardInstanceId;
    [s,attacker]=put(s,'player_a','DEMO-OP-003','center','front');
    [s]=put(s,'player_b','DEMO-OP-004','center','front',{statuses:status('stun')});
    s=resolveCombat(s);
    expect(s.players.player_b.base_points).toBe(17);
    expect(s.combat_log.some(e=>e.type==='target_selected' && e.target_instance_id!==attacker)).toBe(false);
  });
  it('uses taunt, then valid ground front/back, and ranged floating priority', () => {
    let s=emptyFight(); let taunt:CardInstanceId;
    [s]=put(s,'player_a','DEMO-OP-005','left','front');
    [s]=put(s,'player_b','DEMO-OP-003','left','front');
    [s,taunt]=put(s,'player_b','DEMO-OP-004','left','back');
    s=resolveCombat(s);
    expect(s.combat_log.find(e=>e.type==='target_selected')?.target_instance_id).toBe(taunt);
    s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-005','left','front');
    const float=put(s,'player_b','DEMO-OP-008','left','back'); s=float[0];
    s=resolveCombat(s);
    expect(s.combat_log.find(e=>e.type==='target_selected')?.target_instance_id).toBe(float[1]);
    s=emptyFight();
    [s]=put(s,'player_a','DEMO-OP-005','center','front');
    const groundFront=put(s,'player_b','DEMO-OP-003','center','front'); s=groundFront[0];
    [s]=put(s,'player_b','DEMO-OP-003','center','back');
    s=resolveCombat(s);
    expect(s.combat_log.find(e=>e.type==='target_selected')?.target_instance_id).toBe(groundFront[1]);
    s=emptyFight();
    [s]=put(s,'player_a','DEMO-OP-003','left','front');
    const allLaneTaunt=put(s,'player_b','DEMO-OP-004','right','front'); s=allLaneTaunt[0];
    s={...s,card_definitions:{...s.card_definitions,[id('DEMO-OP-004')]:{...s.card_definitions[id('DEMO-OP-004')],taunt_scope:'all_lanes'}}};
    s=resolveCombat(s);
    expect(s.combat_log.find(e=>e.type==='target_selected')?.target_instance_id).toBe(allLaneTaunt[1]);
  });
  it('allows melee to attack grounded floating units but not native floating units', () => {
    let s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-003','right','front');
    const [placed, target]=put(s,'player_b','DEMO-OP-008','right','back',{statuses:status('grounded',2)}); s=resolveCombat(placed);
    expect(s.combat_log.find(e=>e.type==='target_selected')?.target_instance_id).toBe(target);
    s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-003','right','front');
    [s]=put(s,'player_b','DEMO-OP-008','right','back');
    s=resolveCombat(s);
    expect(s.combat_log.some(e=>e.type==='target_selected')).toBe(false);
    expect(s.players.player_b.base_points).toBe(17);
  });
  it('applies slow to the next attack only and freeze disables taunt targeting', () => {
    let s=emptyFight();
    [s]=put(s,'player_a','DEMO-OP-003','left','front',{statuses:status('slow')});
    s=resolveCombat(s);
    expect(s.players.player_b.base_points).toBe(18);
    expect(Object.values(s.card_instances).find(i=>i.owner_id==='player_a' && i.zone==='board')?.operator_combat?.statuses).toEqual([]);
    s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-005','center','front');
    [s]=put(s,'player_b','DEMO-OP-004','center','front',{statuses:status('freeze')});
    s=resolveCombat(s);
    expect(s.players.player_b.base_points).toBe(18);
    expect(s.combat_log.some(e=>e.type==='target_selected')).toBe(false);
  });
  it('absorbs shield before HP and ends immediately when base reaches zero', () => {
    let s=emptyFight();
    [s]=put(s,'player_a','DEMO-OP-003','left','front');
    const target=put(s,'player_b','DEMO-OP-003','left','front',{hp:2,shield:1}); s=resolveCombat(target[0]);
    expect(s.combat_log.some(e=>e.type==='shield_absorbed' && e.amount===1)).toBe(true);
    expect(s.players.player_b.discard).toContain(target[1]);
    s=emptyFight(); s={...s,players:{...s.players,player_b:{...s.players.player_b,base_points:3 as never}}};
    [s]=put(s,'player_a','DEMO-OP-003','left','front');
    [s]=put(s,'player_a','DEMO-OP-005','center','front');
    s=resolveCombat(s);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('player_a');
    expect(s.combat_log.filter(e=>e.type==='attack_declared')).toHaveLength(1);
  });
});

describe('combat SP and control boundaries', () => {
  it('pays a reaction before this hit can grant attacked SP', () => {
    let s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-003','left','front');
    let bubble:CardInstanceId; [s,bubble]=put(s,'player_b','DEMO-OP-004','left','front',{sp:0,shield:3});
    s={...s,card_definitions:{...s.card_definitions,[id('DEMO-OP-004')]:{...s.card_definitions[id('DEMO-OP-004')],sp_gain_on_damaged:1}}};
    s=resolveCombat(s);
    expect(s.card_instances[bubble].operator_combat?.current_sp).toBe(1);
    expect(s.card_instances[bubble].operator_combat?.current_hp).toBe(6);
    expect(s.card_instances[bubble].operator_combat?.shield).toBe(0);
    expect(s.combat_log.some(e=>e.type==='reaction_triggered')).toBe(false);
  });
  it('uses existing SP for reaction and gains attacked SP only after the attack', () => {
    let s=emptyFight(); [s]=put(s,'player_a','DEMO-OP-003','left','front');
    let bubble:CardInstanceId; [s,bubble]=put(s,'player_b','DEMO-OP-004','left','front',{sp:1});
    s={...s,card_definitions:{...s.card_definitions,[id('DEMO-OP-004')]:{...s.card_definitions[id('DEMO-OP-004')],sp_gain_on_damaged:1}}};
    s=resolveCombat(s);
    expect(s.card_instances[bubble].operator_combat?.current_sp).toBe(2);
    expect(s.combat_log.findIndex(e=>e.type==='sp_spent')).toBeLessThan(s.combat_log.findIndex(e=>e.type==='sp_gained'));
  });
  it('grants kill SP to the operator that caused a defeat', () => {
    let s=emptyFight(); let attacker:CardInstanceId;
    [s,attacker]=put(s,'player_a','DEMO-OP-001','center','front',{sp:0});
    [s]=put(s,'player_b','DEMO-OP-003','center','front',{hp:1});
    s=resolveCombat(s);
    expect(s.card_instances[attacker].operator_combat?.current_sp).toBe(1);
    expect(s.combat_log.some(e=>e.type==='sp_gained' && e.detail.includes('击杀'))).toBe(true);
  });
  it('freeze blocks natural SP and stun does not', () => {
    let s=emptyFight(); let frozenId:CardInstanceId; let stunnedId:CardInstanceId;
    [s,frozenId]=put(s,'player_a','DEMO-OP-001','left','front',{statuses:status('freeze')});
    [s,stunnedId]=put(s,'player_a','DEMO-OP-003','right','front',{statuses:status('stun')});
    s={...s,card_definitions:{...s.card_definitions,[id('DEMO-OP-001')]:{...s.card_definitions[id('DEMO-OP-001')],sp_gain_on_damaged:1}}};
    s=naturalSpAtTurnStart(s,'player_a');
    expect(s.card_instances[frozenId].operator_combat?.current_sp).toBe(0);
    expect(s.card_instances[stunnedId].operator_combat?.current_sp).toBe(1);
    expect(grantSp(s,frozenId,2,'test').card_instances[frozenId].operator_combat?.current_sp).toBe(0);
    const damaged = applyEffectDamage(s, Object.values(s.card_instances).find(i=>i.owner_id==='player_a' && i.zone==='hand')!.card_instance_id, frozenId, 1);
    expect(damaged.card_instances[frozenId].operator_combat?.current_hp).toBe((s.card_definitions[id('DEMO-OP-001')].hp ?? 0)-1);
    expect(damaged.card_instances[frozenId].operator_combat?.current_sp).toBe(0);
  });
  it('expires grounded after two target owner turns, independently of control', () => {
    let s=emptyFight(); let target:CardInstanceId;
    [s,target]=put(s,'player_b','DEMO-OP-008','right','back',{statuses:[...status('grounded',2),...status('freeze',1)] as never});
    s={...s,card_instances:{...s.card_instances,[target]:{...s.card_instances[target],controller_id:'player_a'}}};
    s={...s,players:{...s.players,player_b:{...s.players.player_b,turns_taken:1}}};
    s=expireOwnerTurnStatuses(s,'player_b');
    expect(s.card_instances[target].operator_combat?.statuses.map(x=>[x.kind,x.remaining_owner_turns])).toEqual([['grounded',1]]);
  });
  it('plays stun and freeze tactics through validated actions; frozen units get no natural SP', () => {
    let s=emptyFight(); s={...s,phase:'action'};
    let target:CardInstanceId; [s,target]=put(s,'player_b','DEMO-OP-004','center','front',{sp:0});
    let stunCard:CardInstanceId; [s,stunCard]=handCard(s,'player_a','DEMO-TAC-002');
    const applied=reduceGameAction(s,'player_a',{type:'play_card',card_instance_id:stunCard,target_instance_id:target});
    expect(applied.ok).toBe(true);
    if(!applied.ok) return;
    expect(applied.value.card_instances[target].operator_combat?.statuses.some(x=>x.kind==='stun')).toBe(true);
    let freezeCard:CardInstanceId; [s,freezeCard]=handCard(applied.value,'player_a','DEMO-TAC-003');
    const frozen=reduceGameAction(s,'player_a',{type:'play_card',card_instance_id:freezeCard,target_instance_id:target});
    expect(frozen.ok).toBe(true);
    if(!frozen.ok) return;
    const duringFreeze=naturalSpAtTurnStart(frozen.value,'player_b');
    expect(duringFreeze.card_instances[target].operator_combat?.current_sp).toBe(0);
    expect(duringFreeze.card_instances[target].operator_combat?.statuses.some(x=>x.kind==='freeze')).toBe(true);
    expect(duringFreeze.card_instances[target].operator_combat?.statuses.some(x=>x.kind==='stun')).toBe(false);
  });
  it('active skill atomically spends SP, damages same-lane enemy, and rejects stun/freeze', () => {
    let s=emptyFight(); s={...s,phase:'action'};
    let caster:CardInstanceId; [s,caster]=put(s,'player_a','DEMO-OP-006','right','back',{sp:3});
    let target:CardInstanceId; [s,target]=put(s,'player_b','DEMO-OP-003','right','front',{hp:4});
    const used=reduceGameAction(s,'player_a',{type:'activate_skill',card_instance_id:caster,target_instance_id:target});
    expect(used.ok).toBe(true);
    if(!used.ok) return;
    expect(used.value.card_instances[caster].operator_combat?.current_sp).toBe(0);
    expect(used.value.card_instances[target].operator_combat?.current_hp).toBe(1);
    const stunned={...s,card_instances:{...s.card_instances,[caster]:{...s.card_instances[caster],operator_combat:{...s.card_instances[caster].operator_combat!,statuses:status('stun')}}}};
    const denied=reduceGameAction(stunned,'player_a',{type:'activate_skill',card_instance_id:caster,target_instance_id:target});
    expect(denied.ok).toBe(false);
    if(!denied.ok) expect(denied.value).toBe(stunned);
  });
});

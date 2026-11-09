export type PlayerId = 'player_a' | 'player_b';
export type LaneId = 'left' | 'center' | 'right';
export type Position = 'front' | 'back';
export type GamePhase = 'mulligan' | 'turn_start' | 'action' | 'combat' | 'turn_end' | 'finished';
declare const identifierBrand: unique symbol;
export type CardId = string & { readonly [identifierBrand]: 'CardId' };
export type CardInstanceId = string & { readonly [identifierBrand]: 'CardInstanceId' };
export type Cost = number & { readonly [identifierBrand]: 'Cost' };
export type PaidDeployCost = number & { readonly [identifierBrand]: 'PaidDeployCost' };
export type SpValue = number & { readonly [identifierBrand]: 'SpValue' };
export type SpCost = number & { readonly [identifierBrand]: 'SpCost' };
export type BasePoints = number & { readonly [identifierBrand]: 'BasePoints' };
export type HpValue = number & { readonly [identifierBrand]: 'HpValue' };
export type CardType = 'operator' | 'tactic' | 'support';
export type AttackType = 'melee' | 'ranged';
export type OperatorClass = 'vanguard' | 'guard' | 'defender' | 'sniper' | 'caster' | 'medic' | 'supporter' | 'specialist';
export type DeployRule = 'front_only' | 'front_or_back' | 'back_only';
export type StatusKind = 'stun' | 'freeze' | 'grounded' | 'slow' | 'taunt' | 'silence';
export type EffectTrigger =
  | 'turn_start' | 'turn_end' | 'on_play' | 'on_deploy' | 'on_attacked' | 'on_damaged'
  | 'on_damage_survive' | 'on_lethal' | 'on_death' | 'on_ally_death' | 'on_kill'
  | 'on_heal' | 'on_leave_field' | 'combat_end' | 'active' | 'passive_free' | 'passive_sp'
  | 'reaction_sp' | 'none'
  | 'on_attack_declared' | 'on_attack_resolved' | 'continuous' | 'on_friendly_attack_declared';
export type EffectActionType =
  | 'gain_cost' | 'reduce_incoming_damage' | 'damage' | 'heal' | 'apply_status'
  | 'withdraw_operator' | 'attach_equipment' | 'choose_friendly_operator_gain_sp' | 'gain_shield'
  | 'reduce_damage' | 'buff_attack' | 'debuff_attack' | 'bonus_damage' | 'shield' | 'prevent_lethal'
  | 'summon' | 'if_else' | 'gain_sp';

export interface EffectAction {
  readonly type: EffectActionType;
  readonly sp_cost?: SpCost;
  readonly [key: string]: unknown;
}
export interface EffectDefinition {
  readonly trigger: EffectTrigger;
  readonly actions: readonly EffectAction[];
  readonly [key: string]: unknown;
}
export interface CardDefinition {
  readonly card_id: CardId;
  readonly card_name_zh: string;
  readonly card_type: CardType;
  readonly support_subtype?: 'facility' | 'equipment' | '';
  readonly rarity: number;
  readonly cost: Cost;
  readonly hp?: HpValue;
  readonly atk?: number;
  readonly class?: OperatorClass;
  readonly attack_type?: AttackType;
  readonly deploy_rule?: DeployRule;
  readonly floating?: boolean;
  readonly taunt_scope?: 'none' | 'same_lane' | 'all_lanes';
  readonly max_sp?: number;
  readonly starting_sp?: number;
  readonly sp_regen_per_turn?: number;
  readonly sp_gain_on_attacked?: number;
  readonly sp_gain_on_damaged?: number;
  readonly sp_gain_on_kill?: number;
  readonly active_skill_sp_cost?: SpCost | null;
  readonly normal_withdrawal_refund_ratio?: number;
  readonly redeploy_cd_base?: number;
  readonly effect_trigger: EffectTrigger;
  readonly effect_json: EffectDefinition;
}
export interface StatusEffect {
  readonly kind: StatusKind;
  readonly remaining_owner_turns: number;
  readonly applied_on_owner_turn_index: number;
  readonly blocks_normal_withdrawal: boolean;
}
export interface OperatorCombatState {
  current_hp: HpValue;
  current_atk_modifiers: readonly number[];
  current_sp: SpValue;
  shield: number;
  statuses: readonly StatusEffect[];
  equipment_ids: readonly CardInstanceId[];
}
export interface OperatorLifecycleState {
  redeploy_cd_remaining: number;
  redeploy_cd_applied_owner_turn_index: number | null;
  has_deployed_before: boolean;
  entered_battle_this_owner_turn: boolean;
  /** Rules file name: current_deployment_paid_cost. This is a paid cost snapshot, not printed cost. */
  paid_deploy_cost: PaidDeployCost | null;
  once_per_game_flags: Readonly<Record<string, boolean>>;
}
export interface SupportLifecycleState {
  readonly turn_start_triggers: number;
}
export interface CardInstance {
  readonly card_instance_id: CardInstanceId;
  readonly card_id: CardId;
  readonly owner_id: PlayerId;
  controller_id: PlayerId;
  board_half: PlayerId | null;
  lane: LaneId | null;
  position: Position | null;
  zone: 'deck' | 'hand' | 'board' | 'discard' | 'support';
  operator_combat?: OperatorCombatState;
  operator_lifecycle?: OperatorLifecycleState;
  support_lifecycle?: SupportLifecycleState;
}
export interface OperatorState {
  readonly instance: CardInstance;
  readonly combat: OperatorCombatState;
  readonly lifecycle: OperatorLifecycleState;
}
export interface PlayerState {
  readonly player_id: PlayerId;
  base_points: BasePoints;
  cost: Cost;
  readonly hand: readonly CardInstanceId[];
  readonly deck: readonly CardInstanceId[];
  readonly discard: readonly CardInstanceId[];
  readonly facility_ids: readonly CardInstanceId[];
  fatigue_count: number;
  turns_taken: number;
}
export type GameAction =
  | { readonly type: 'end_action_phase' }
  | { readonly type: 'play_card'; readonly card_instance_id: CardInstanceId; readonly target_instance_id?: CardInstanceId }
  | { readonly type: 'deploy_operator'; readonly card_instance_id: CardInstanceId; readonly lane: LaneId; readonly position: Position }
  | { readonly type: 'withdraw_operator'; readonly card_instance_id: CardInstanceId }
  | { readonly type: 'activate_skill'; readonly card_instance_id: CardInstanceId; readonly target_instance_id?: CardInstanceId }
  | { readonly type: 'resolve_pending_choice'; readonly source_instance_id: CardInstanceId; readonly target_instance_id?: CardInstanceId };
export interface PendingEffectChoice {
  readonly source_instance_id: CardInstanceId;
  readonly effect: 'gain_sp';
  readonly amount: number;
}
export interface GameState {
  readonly rules_version: '0.7';
  readonly card_definitions: Readonly<Record<CardId, CardDefinition>>;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly card_instances: Readonly<Record<CardInstanceId, CardInstance>>;
  readonly mulligan_completed: Readonly<Record<PlayerId, boolean>>;
  random_state: number;
  active_player_id: PlayerId;
  phase: GamePhase;
  turn_number: number;
  state_version: number;
  winner: PlayerId | 'draw' | null;
  readonly combat_log: readonly CombatLogEvent[];
  readonly pending_effect_choices: readonly PendingEffectChoice[];
  readonly turn_start_prepared: boolean;
}

export type CombatLogEventType =
  | 'attack_declared' | 'target_selected' | 'reaction_triggered' | 'sp_spent'
  | 'damage_resolved' | 'shield_absorbed' | 'base_damaged' | 'unit_defeated'
  | 'sp_gained' | 'status_expired' | 'healed' | 'trigger_limit'
  | 'skill_activated' | 'effect_triggered' | 'unit_deployed' | 'unit_withdrawn' | 'status_applied';

export interface CombatLogEvent {
  readonly sequence: number;
  readonly type: CombatLogEventType;
  readonly source_instance_id?: CardInstanceId;
  readonly target_instance_id?: CardInstanceId;
  readonly player_id?: PlayerId;
  readonly source_player_id?: PlayerId;
  readonly target_player_id?: PlayerId;
  readonly source_name?: string;
  readonly target_name?: string;
  readonly skill_name?: string;
  readonly action_type?: string;
  readonly lane?: LaneId;
  readonly position?: Position;
  readonly amount?: number;
  readonly absorbed?: number;
  readonly detail: string;
}
export interface DeckDefinition {
  readonly deck_id: string;
  readonly deck_name_zh: string;
  readonly cards: readonly { readonly card_id: CardId; readonly quantity: number }[];
}

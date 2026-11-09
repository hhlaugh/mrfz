import type { EffectActionType, EffectTrigger } from '../game/types';

export const CARD_TYPES = ['operator', 'tactic', 'support'] as const;
export const LANES = ['left', 'center', 'right'] as const;
export const POSITIONS = ['front', 'back'] as const;
export const GAME_PHASES = ['mulligan', 'turn_start', 'action', 'combat', 'turn_end', 'finished'] as const;
export const EFFECT_TRIGGERS: readonly EffectTrigger[] = [
  'turn_start', 'turn_end', 'on_play', 'on_deploy', 'on_attacked', 'on_damaged',
  'on_damage_survive', 'on_lethal', 'on_death', 'on_ally_death', 'on_kill', 'on_heal',
  'on_leave_field', 'combat_end', 'active', 'passive_free', 'passive_sp', 'reaction_sp', 'none',
  'on_attack_declared', 'on_attack_resolved', 'continuous', 'on_friendly_attack_declared',
];
export const EFFECT_ACTION_TYPES: readonly EffectActionType[] = [
  'gain_cost', 'reduce_incoming_damage', 'damage', 'heal', 'apply_status',
  'withdraw_operator', 'attach_equipment', 'choose_friendly_operator_gain_sp', 'gain_shield',
  'reduce_damage', 'buff_attack', 'debuff_attack', 'bonus_damage', 'shield', 'prevent_lethal',
  'summon', 'if_else', 'gain_sp',
];
export const STATUS_KINDS = ['stun', 'freeze', 'grounded', 'slow', 'taunt', 'silence'] as const;

/** JSON Schema subset for the data contract; cross-record invariants are runtime-validated below. */
export const cardPoolJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'array',
  items: {
    type: 'object',
    required: ['card_id', 'card_name_zh', 'card_type', 'rarity', 'cost', 'effect_trigger', 'effect_json'],
    properties: {
      card_id: { type: 'string', minLength: 1 },
      card_name_zh: { type: 'string', minLength: 1 },
      card_type: { enum: CARD_TYPES },
      support_subtype: { enum: ['', 'facility', 'equipment'] },
      rarity: { type: 'integer', minimum: 1, maximum: 6 },
      cost: { type: 'integer', minimum: 0 },
      floating: { type: 'boolean' },
      active_skill_sp_cost: { type: ['integer', 'null'], minimum: 0 },
      effect_trigger: { enum: EFFECT_TRIGGERS },
      effect_json: {
        type: 'object',
        properties: {
          trigger: { enum: EFFECT_TRIGGERS },
          actions: {
            type: 'array',
            items: { type: 'object', required: ['type'], properties: { type: { enum: EFFECT_ACTION_TYPES } } },
          },
        },
      },
    },
  },
} as const;

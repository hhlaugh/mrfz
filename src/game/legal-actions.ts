import type { GameAction, GameState, LaneId, PlayerId, Position } from './types';
import { reduceGameAction } from './engine';

export const LANES: readonly LaneId[] = ['left', 'center', 'right'];
export const POSITIONS: readonly Position[] = ['front', 'back'];

function isLegal(state: GameState, actorId: PlayerId, action: GameAction): boolean {
  return reduceGameAction(state, actorId, action).ok;
}

/**
 * 引擎层的合法动作查询：UI 只允许从这里（或 reduceGameAction 的验证结果）得知"什么是合法的"，
 * 不得自行推导费用、伤害、退款、CD 等任何游戏数值。
 * 起手换牌不经过 GameAction（由控制器直接调用引擎 mulligan），因此 mulligan 阶段返回空列表。
 */
export function enumerateLegalActions(state: GameState, playerId: PlayerId): readonly GameAction[] {
  if (state.phase === 'turn_start' && state.turn_start_prepared && state.pending_effect_choices.length > 0) {
    const candidates: GameAction[] = [];
    for (const choice of state.pending_effect_choices) {
      candidates.push({ type: 'resolve_pending_choice', source_instance_id: choice.source_instance_id });
      for (const unit of Object.values(state.card_instances)) {
        if (unit.zone !== 'board' || unit.controller_id !== playerId) continue;
        candidates.push({ type: 'resolve_pending_choice', source_instance_id: choice.source_instance_id, target_instance_id: unit.card_instance_id });
      }
    }
    return candidates.filter((action) => isLegal(state, playerId, action));
  }
  if (state.phase !== 'action') return [];

  const candidates: GameAction[] = [{ type: 'end_action_phase' }];
  const boardUnits = Object.values(state.card_instances).filter((instance) => instance.zone === 'board');
  for (const id of state.players[playerId].hand) {
    const instance = state.card_instances[id];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    if (!definition) continue;
    if (definition.card_type === 'operator') {
      for (const lane of LANES) {
        for (const position of POSITIONS) candidates.push({ type: 'deploy_operator', card_instance_id: id, lane, position });
      }
    } else {
      candidates.push({ type: 'play_card', card_instance_id: id });
      for (const unit of boardUnits) candidates.push({ type: 'play_card', card_instance_id: id, target_instance_id: unit.card_instance_id });
    }
  }
  for (const unit of boardUnits) {
    if (unit.controller_id !== playerId) continue;
    candidates.push({ type: 'withdraw_operator', card_instance_id: unit.card_instance_id });
    for (const target of boardUnits) candidates.push({ type: 'activate_skill', card_instance_id: unit.card_instance_id, target_instance_id: target.card_instance_id });
  }
  return candidates.filter((action) => isLegal(state, playerId, action));
}

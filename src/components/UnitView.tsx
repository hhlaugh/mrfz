import type { CardInstance, GameState } from '../game/types';
import { STATUS_LABEL } from '../client/demoData';
import { cardDefinitionOf } from './CardView';

export type UnitHighlight = 'none' | 'target' | 'selected';

interface UnitViewProps {
  readonly state: GameState;
  readonly instance: CardInstance;
  readonly highlight: UnitHighlight;
  readonly onClick?: () => void;
}

/** 场上干员：HP/ATK/SP/护盾/状态全部来自引擎状态；ATK 仅做展示汇总，不参与任何结算。 */
export function UnitView({ state, instance, highlight, onClick }: UnitViewProps) {
  const definition = cardDefinitionOf(state, instance.card_instance_id);
  const combat = instance.operator_combat;
  if (!definition || !combat) return null;
  const atk = Math.max(0, (definition.atk ?? 0) + combat.current_atk_modifiers.reduce((sum, modifier) => sum + modifier, 0));
  return (
    <div className={`unit highlight-${highlight}`} onClick={onClick}>
      <div className="unit-icon">{definition.card_name_zh.slice(0, 1)}</div>
      <div className="unit-name">
        {definition.card_name_zh}
        {definition.floating && <span className="unit-floating">浮空</span>}
      </div>
      <div className="unit-stats">
        <span className="stat hp">HP {combat.current_hp}/{definition.hp ?? 0}</span>
        <span className="stat atk">ATK {atk}</span>
        <span className="stat sp">SP {combat.current_sp}/{definition.max_sp ?? 5}</span>
        {combat.shield > 0 && <span className="stat shield">盾 {combat.shield}</span>}
      </div>
      {(combat.statuses.length > 0 || combat.equipment_ids.length > 0) && (
        <div className="unit-statuses">
          {combat.statuses.map((status) => (
            <span key={status.kind} className={`status status-${status.kind}`}>
              {STATUS_LABEL[status.kind] ?? status.kind} {status.remaining_owner_turns}
            </span>
          ))}
          {combat.equipment_ids.map((equipmentId) => {
            const equipment = state.card_instances[equipmentId];
            const equipmentDefinition = equipment ? state.card_definitions[equipment.card_id] : undefined;
            return (
              <span key={equipmentId} className="status status-equipment">
                {equipmentDefinition?.card_name_zh ?? '装备'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

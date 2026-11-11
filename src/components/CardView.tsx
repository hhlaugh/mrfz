import type { CardInstanceId, GameState } from '../game/types';
import type { UiCardDefinition } from '../client/demoData';
import { CardFrame } from './cards/CardFrame';

export function cardDefinitionOf(state: GameState, instanceId: CardInstanceId): UiCardDefinition | undefined {
  const instance = state.card_instances[instanceId];
  return instance ? (state.card_definitions[instance.card_id] as UiCardDefinition) : undefined;
}

/** 展示用的效果摘要：优先使用数据中的规则文字，缺失时按白名单效果类型兜底生成。 */
export function effectSummary(definition: UiCardDefinition): string {
  if (definition.rules_text_zh) return definition.rules_text_zh;
  const actions = definition.effect_json?.actions ?? [];
  if (actions.length === 0) return '无效果';
  return actions
    .map((action) => {
      switch (action.type) {
        case 'damage':
          return `造成 ${String(action.value)} 点伤害`;
        case 'heal':
          return `治疗 ${String(action.value)} 点 HP`;
        case 'apply_status':
          return `施加 ${String(action.status)} 状态`;
        case 'gain_cost':
          return `获得 ${String(action.value)} 费用`;
        case 'gain_shield':
          return `获得 ${String(action.value)} 点护盾`;
        case 'withdraw_operator':
          return '撤离一名干员';
        case 'attach_equipment':
          return '附着装备';
        case 'choose_friendly_operator_gain_sp':
          return `选择友方干员获得 ${String(action.value)} SP`;
        case 'reduce_incoming_damage':
          return `受击减伤（SP ${String(action.sp_cost ?? 0)}）`;
        default:
          return String(action.type);
      }
    })
    .join('；');
}

interface CardViewProps {
  readonly state: GameState;
  readonly instanceId: CardInstanceId;
  readonly selected?: boolean;
  readonly interactive?: boolean;
  readonly selectable?: boolean;
  readonly checked?: boolean;
  readonly onClick?: () => void;
}

export function CardView({ state, instanceId, selected = false, interactive = false, selectable = false, checked = false, onClick }: CardViewProps) {
  const instance = state.card_instances[instanceId];
  const definition = cardDefinitionOf(state, instanceId);
  if (!instance || !definition) return null;
  const cd = instance.operator_lifecycle?.redeploy_cd_remaining ?? 0;

  return (
    <CardFrame
      cardId={instance.card_id}
      definition={definition}
      variant="hand"
      selected={selected}
      interactive={interactive}
      checked={checked}
      redeployCd={cd}
      onClick={onClick}
      className={`card card-${definition.card_type}${selected ? ' selected' : ''}${interactive ? ' interactive' : ''}${checked ? ' checked' : ''}${cd > 0 ? ' card-dimmed' : ''}`}
    />
  );
}

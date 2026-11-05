import type { CardInstanceId, GameState } from '../game/types';
import type { UiCardDefinition } from '../client/demoData';

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

const CARD_TYPE_LABEL: Readonly<Record<string, string>> = {
  operator: '干员', tactic: '战术', support: '支援',
};

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
  const isOperator = definition.card_type === 'operator';
  const typeLabel =
    definition.card_type === 'operator'
      ? definition.attack_type === 'ranged'
        ? '干员 · 远程'
        : '干员 · 近战'
      : definition.card_type === 'support'
        ? definition.support_subtype === 'facility'
          ? '支援 · 设施'
          : '支援 · 装备'
        : CARD_TYPE_LABEL[definition.card_type] ?? definition.card_type;
  const cd = instance.operator_lifecycle?.redeploy_cd_remaining ?? 0;
  return (
    <div
      className={`card card-${definition.card_type}${selected ? ' selected' : ''}${interactive ? ' interactive' : ''}${checked ? ' checked' : ''}${cd > 0 ? ' card-dimmed' : ''}`}
      onClick={onClick}
    >
      <div className="card-top">
        <span className="card-cost">{definition.cost}</span>
        <span className="card-name">{definition.card_name_zh}</span>
        <span className="card-type">{typeLabel}</span>
      </div>
      {isOperator && (
        <div className="card-stats">
          <span>ATK {definition.atk ?? 0}</span>
          <span>HP {definition.hp ?? 0}</span>
          <span>SP {definition.max_sp ?? 5}</span>
          {definition.floating && <span className="card-floating">浮空</span>}
        </div>
      )}
      <div className="card-effect">{effectSummary(definition)}</div>
      {definition.card_type !== 'operator' && definition.effect_trigger === 'active' && (
        <div className="card-skill">主动技能（SP {String(definition.active_skill_sp_cost ?? '—')}）</div>
      )}
      {cd > 0 && <div className="card-cd">再部署 CD：{cd}</div>}
      {selectable && <div className={`card-check${checked ? ' on' : ''}`}>{checked ? '✓' : ''}</div>}
    </div>
  );
}

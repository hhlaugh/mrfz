import React from 'react';
import type {
  CardInstance,
  CardInstanceId,
  GameAction,
  GameState,
  PlayerId,
} from '../../game/types';
import { cardDefinitionOf } from '../CardView';
import { getCardPresentation } from '../../data/card-presentation';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CardFrame } from '../cards/CardFrame';
import { HealthBar } from '../ui/HealthBar';
import { ResourceIndicator } from '../ui/ResourceIndicator';
import { STATUS_LABEL, PLAYER_LABEL } from '../../client/demoData';

interface TacticalDetailPanelProps {
  readonly state: GameState;
  readonly selection: CardInstanceId | null;
  readonly onDeselect: () => void;
  readonly canAct: boolean;
  readonly isActionPhase: boolean;
  readonly hasPending: boolean;
  readonly legalActions: readonly GameAction[];
  readonly onDispatch: (action: GameAction) => void;
  readonly className?: string;
}

type SkillAction = Extract<GameAction, { type: 'activate_skill' }>;
type PlayCardAction = Extract<GameAction, { type: 'play_card' }>;
type WithdrawAction = Extract<GameAction, { type: 'withdraw_operator' }>;

export function TacticalDetailPanel({
  state,
  selection,
  onDeselect,
  canAct,
  isActionPhase,
  hasPending,
  legalActions,
  onDispatch,
  className = '',
}: TacticalDetailPanelProps) {
  const selectedInstance: CardInstance | undefined = selection ? state.card_instances[selection] : undefined;
  const selectedDefinition = selection ? cardDefinitionOf(state, selection) : undefined;
  const selectedPresentation = selectedInstance ? getCardPresentation(selectedInstance.card_id) : undefined;

  const actor = state.active_player_id;
  const isOwnUnit = selectedInstance?.owner_id === actor;
  const isBoardUnit = selectedInstance?.zone === 'board';
  const isHandCard = selectedInstance?.zone === 'hand';

  // Actions for selected unit
  const canWithdraw = isBoardUnit && legalActions.some(
    (action): action is WithdrawAction => action.type === 'withdraw_operator' && action.card_instance_id === selection,
  );

  const skillActions = isBoardUnit
    ? legalActions.filter(
        (action): action is SkillAction => action.type === 'activate_skill' && action.card_instance_id === selection,
      )
    : [];
  const canSkillDirect = skillActions.some((action) => action.target_instance_id === undefined);
  const hasSkillTargets = skillActions.some((action) => action.target_instance_id !== undefined);

  // Actions for selected hand card
  const playCardActions = isHandCard
    ? legalActions.filter(
        (action): action is PlayCardAction => action.type === 'play_card' && action.card_instance_id === selection,
      )
    : [];
  const canPlayDirect = playCardActions.some((action) => action.target_instance_id === undefined);
  const hasPlayTargets = playCardActions.some((action) => action.target_instance_id !== undefined);

  // Deploy actions for selected hand operator
  const canDeploy = isHandCard && legalActions.some(
    (action) => action.type === 'deploy_operator' && action.card_instance_id === selection,
  );

  return (
    <Panel
      variant="raised"
      title="战术参数与指令 // TACTICAL DOSSIER"
      codeName={selectedInstance ? selectedInstance.card_instance_id : 'MONITOR.IDLE'}
      scanlines
      grid
      className={`flex flex-col h-full bg-[#161a22] border-[#2f3b4a] shadow-xl overflow-hidden ${className}`}
    >
      {selectedInstance && selectedDefinition && selectedPresentation ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header Bar with quick deselect button */}
          <div className="flex items-center justify-between px-3.5 py-2 bg-[#13171e] border-b border-[#283240] shrink-0">
            <div className="flex items-center gap-1.5">
              <Badge variant={isBoardUnit ? 'status' : 'cost'} value={isBoardUnit ? '在场单位' : `${selectedDefinition.cost} DP`}>
                {isBoardUnit ? '在场单位' : '手牌'}
              </Badge>
              <span className="text-xs font-bold text-white truncate max-w-[140px]">
                {selectedDefinition.card_name_zh}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={onDeselect} className="text-slate-400 hover:text-white px-2 py-0.5 text-xs">
              ✕ 取消
            </Button>
          </div>

          {/* Scrollable Detail Body */}
          <div className="p-3.5 flex-1 overflow-y-auto space-y-3.5 text-xs">
            {/* Card Frame Preview Component */}
            <div className="flex justify-center">
              <CardFrame
                cardId={selectedInstance.card_id}
                definition={selectedDefinition}
                presentation={selectedPresentation}
                variant="compact"
                className="w-full max-w-[200px] shadow-lg"
              />
            </div>

            {/* Live Combat Status for Board Unit */}
            {isBoardUnit && selectedInstance.operator_combat && (
              <div className="bg-[#0f131a] p-3 border border-[#2b3644] space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  实时作战参数 (LIVE STATUS)
                </span>

                <HealthBar
                  currentHp={selectedInstance.operator_combat.current_hp}
                  maxHp={selectedDefinition.hp ?? 1}
                  shield={selectedInstance.operator_combat.shield}
                  size="md"
                  showNumbers
                />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <ResourceIndicator
                    type="atk"
                    current={
                      Math.max(
                        0,
                        (selectedDefinition.atk ?? 0) +
                          selectedInstance.operator_combat.current_atk_modifiers.reduce((sum, m) => sum + m, 0),
                      )
                    }
                    size="sm"
                  />
                  <ResourceIndicator
                    type="sp"
                    current={selectedInstance.operator_combat.current_sp}
                    max={selectedDefinition.max_sp ?? 5}
                    size="sm"
                  />
                </div>

                {/* Status effects */}
                {selectedInstance.operator_combat.statuses.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-[#232c38]">
                    {selectedInstance.operator_combat.statuses.map((s) => (
                      <Badge key={s.kind} variant="status" className="bg-rose-950/80 text-rose-300 border-rose-600">
                        {STATUS_LABEL[s.kind] ?? s.kind} ({s.remaining_owner_turns}回合)
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Rules Text & Active Skill */}
            <div className="space-y-2">
              {selectedDefinition.rules_text_zh && (
                <div className="bg-[#12161d] p-2.5 border border-[#263140] space-y-1">
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wide block">
                    被动特性 / 战术效果
                  </span>
                  <p className="text-slate-300 leading-relaxed m-0">
                    {selectedDefinition.rules_text_zh}
                  </p>
                </div>
              )}

              {selectedDefinition.active_skill_text_zh && (
                <div className="bg-[#12161d] p-2.5 border border-[#263140] space-y-1">
                  <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wide block">
                    主动技能 (消耗 {selectedDefinition.active_skill_sp_cost ?? 0} SP)
                  </span>
                  <p className="text-slate-300 leading-relaxed m-0">
                    {selectedDefinition.active_skill_text_zh}
                  </p>
                </div>
              )}
            </div>

            {/* Action Guidance & Execution Strip */}
            <div className="pt-2 border-t border-[#283442] space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                指令下发 (TACTICAL COMMANDS)
              </span>

              {/* Hand Operator Deploy Hint */}
              {isHandCard && selectedDefinition.card_type === 'operator' && (
                <div className="p-2.5 bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] leading-relaxed">
                  {canDeploy ? (
                    <span>💡 点击棋盘上的<strong>高亮黄色格子</strong>以部署该干员（消耗 {selectedDefinition.cost} DP）。</span>
                  ) : (
                    <span>⚠️ 当前无法部署：费用不足或无可用合法槽位。</span>
                  )}
                </div>
              )}

              {/* Hand Tactic Card Direct Play */}
              {isHandCard && canPlayDirect && canAct && isActionPhase && (
                <Button
                  variant="primary"
                  size="md"
                  cornerCut
                  onClick={() => {
                    const action = playCardActions.find((a) => a.target_instance_id === undefined);
                    if (action) onDispatch(action);
                  }}
                  className="w-full font-bold shadow-md"
                >
                  ⚡ 直接使用此战术卡
                </Button>
              )}

              {isHandCard && hasPlayTargets && (
                <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2 border border-amber-500/30">
                  🎯 请在棋盘上点击高亮目标以发动此战术法术。
                </div>
              )}

              {/* Board Unit Active Skill */}
              {isBoardUnit && isOwnUnit && canAct && isActionPhase && !hasPending && (
                <div className="space-y-1.5">
                  <Button
                    variant="primary"
                    size="md"
                    cornerCut
                    disabled={!canSkillDirect && !hasSkillTargets}
                    onClick={() => {
                      const direct = skillActions.find((a) => a.target_instance_id === undefined);
                      if (direct) onDispatch(direct);
                    }}
                    className="w-full font-bold"
                  >
                    ⚡ 发动主动技能 {selectedDefinition.active_skill_sp_cost ? `(SP ${selectedDefinition.active_skill_sp_cost})` : ''}
                  </Button>
                  {!canSkillDirect && hasSkillTargets && (
                    <span className="text-[10px] text-sky-300 block text-center">
                      点击棋盘高亮目标发动技能
                    </span>
                  )}

                  {/* Board Unit Withdrawal */}
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canWithdraw}
                    onClick={() => {
                      const action = legalActions.find(
                        (a): a is WithdrawAction => a.type === 'withdraw_operator' && a.card_instance_id === selection,
                      );
                      if (action) onDispatch(action);
                    }}
                    className="w-full mt-2"
                  >
                    普通撤离（退费并进入冷却）
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Idle State */
        <div className="flex flex-col items-center justify-center p-6 h-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full border border-slate-700/60 bg-[#12161c] flex items-center justify-center text-slate-500 text-2xl shadow-inner">
            🔍
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider m-0">
              战术监视器在线
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
              点击棋盘上的任意干员或己方手牌，查看完整数值档案、技能描述与可下发指令。
            </p>
          </div>

          {/* Quick Battlefield Overview */}
          <div className="w-full bg-[#10141a] p-3 border border-[#263140] text-left space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>当前阶段:</span>
              <span className="text-[#e5a52b] font-bold">
                {state.phase === 'action' ? `行动阶段 (${PLAYER_LABEL[actor]})` : state.phase}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>推演回合:</span>
              <span className="text-white font-bold">第 {state.turn_number} 回合</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>在场单位:</span>
              <span className="text-emerald-400 font-bold">
                {Object.values(state.card_instances).filter((i) => i.zone === 'board').length} 个
              </span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

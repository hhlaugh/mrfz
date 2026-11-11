import React from 'react';
import type { CardInstance, GameState } from '../game/types';
import { STATUS_LABEL } from '../client/demoData';
import { cardDefinitionOf } from './CardView';
import { OperatorPortrait } from './cards/OperatorPortrait';
import { HealthBar } from './ui/HealthBar';

export type UnitHighlight = 'none' | 'target' | 'selected';

interface UnitViewProps {
  readonly state: GameState;
  readonly instance: CardInstance;
  readonly highlight: UnitHighlight;
  readonly onClick?: () => void;
}

/**
 * 战场棋盘单位组件 (BoardUnit)
 * 严格遵照《UI_REDESIGN.md》Section 4.5 & 5.1-C 规范：
 * - 紧凑 82px 高度，保证电脑端整个 4 行三路棋盘 100% 完整显示且零滚动条
 * - 集中展示头像、等宽双色血条（带数值与护盾）、ATK/SP、状态徽章与阵营高亮
 * - 详细技能、词条与撤离指令由右侧 TacticalDetailPanel 承载
 */
export function UnitView({ state, instance, highlight, onClick }: UnitViewProps) {
  const definition = cardDefinitionOf(state, instance.card_instance_id);
  const combat = instance.operator_combat;
  if (!definition || !combat) return null;

  const atk = Math.max(
    0,
    (definition.atk ?? 0) + combat.current_atk_modifiers.reduce((sum, modifier) => sum + modifier, 0),
  );

  const maxHp = definition.hp ?? 1;
  const isSelected = highlight === 'selected';
  const isTarget = highlight === 'target';

  // 状态与装备数量
  const hasStatuses = combat.statuses.length > 0 || combat.equipment_ids.length > 0;

  return (
    <div
      onClick={onClick}
      className={`group relative flex flex-col justify-between p-1.5 rounded-sm bg-[#181d24] select-none transition-all duration-150 cursor-pointer overflow-hidden border ${
        isSelected
          ? 'border-[#e5a52b] ring-2 ring-[#e5a52b]/50 shadow-[0_0_14px_rgba(229,165,43,0.4)] z-20 scale-[1.01]'
          : isTarget
          ? 'border-[#f59e0b] ring-2 ring-[#f59e0b]/60 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse z-20'
          : 'border-[#36424e] hover:border-[#526475] hover:bg-[#1e252e]'
      } w-full h-[82px]`}
    >
      {/* 顶部：干员头像、名称与状态标 */}
      <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <OperatorPortrait
            cardId={instance.card_id}
            variant="avatar"
            className="w-5.5 h-5.5 shrink-0 rounded-xs border border-slate-700/80 shadow-xs"
          />
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="font-bold text-xs text-white truncate">
              {definition.card_name_zh}
            </span>
            {definition.floating && (
              <span className="text-[8px] px-0.5 bg-amber-950/80 text-amber-300 border border-amber-500/40 shrink-0">
                浮空
              </span>
            )}
          </div>
        </div>

        {/* 右上：状态/装备指示或射程类型 */}
        {hasStatuses ? (
          <div className="flex items-center gap-0.5 shrink-0">
            {combat.statuses.map((status) => (
              <span
                key={status.kind}
                title={`${STATUS_LABEL[status.kind] ?? status.kind}${status.remaining_owner_turns > 0 ? ` (${status.remaining_owner_turns}回合)` : ''}`}
                className="text-[8px] px-1 py-0.2 bg-rose-950 text-rose-300 border border-rose-500/60 font-mono"
              >
                {STATUS_LABEL[status.kind] ?? status.kind}
              </span>
            ))}
            {combat.equipment_ids.length > 0 && (
              <span className="text-[8px] px-1 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-500/60 font-mono">
                装
              </span>
            )}
          </div>
        ) : (
          <span className="text-[9px] font-mono text-slate-400 shrink-0">
            {definition.attack_type === 'melee' ? '近战' : '远程'}
          </span>
        )}
      </div>

      {/* 中部：等宽生命条与护盾 */}
      <div className="w-full my-0.5">
        <HealthBar
          currentHp={combat.current_hp}
          maxHp={maxHp}
          shield={combat.shield}
          size="sm"
          showNumbers
        />
      </div>

      {/* 底部：ATK 与 SP 数值条 */}
      <div className="flex items-center justify-between text-[11px] font-mono px-1.5 py-0.5 bg-[#12161b] border border-[#2b353f] leading-none">
        <span className="text-rose-400 font-bold flex items-center gap-0.5">
          <span className="text-[9px]">⚔</span>
          <span>{atk}</span>
        </span>
        <span className="text-sky-400 font-bold flex items-center gap-0.5">
          <span className="text-[9px]">⚡</span>
          <span>{combat.current_sp}/{definition.max_sp ?? 5}</span>
        </span>
      </div>

      {/* 目标准星角落装饰 */}
      {isTarget && (
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-amber-400 pointer-events-none" />
      )}
    </div>
  );
}

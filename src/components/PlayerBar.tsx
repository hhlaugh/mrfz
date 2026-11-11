import React from 'react';
import type { GameState, PlayerId } from '../game/types';
import { PLAYER_LABEL } from '../client/demoData';
import { cardDefinitionOf } from './CardView';
import { ResourceIndicator } from './ui/ResourceIndicator';
import { Badge } from './ui/Badge';

interface PlayerBarProps {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly isActive: boolean;
  readonly roleLabel?: string;
}

export function PlayerBar({ state, playerId, isActive, roleLabel }: PlayerBarProps) {
  const player = state.players[playerId];
  const isSelf = roleLabel?.includes('己方');

  return (
    <div className={`player-bar${isActive ? ' active' : ''}${isSelf ? ' player-bar-self' : ''} flex items-center justify-between px-3 py-1.5`}>
      <div className="flex items-center gap-2">
        <span className="player-name font-bold flex items-center gap-1.5">
          {PLAYER_LABEL[playerId]}
          {roleLabel && (
            <Badge variant={isSelf ? 'ally' : 'enemy'}>
              {roleLabel}
            </Badge>
          )}
          {isActive && (
            <span className="active-mark text-[11px] font-mono text-[#e5a52b] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e5a52b] animate-ping" />
              ◀ 行动中
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* 基本分 (HP) */}
        <ResourceIndicator type="hp" current={player.base_points} max={10} size="sm" label="基本分" />

        {/* 费用 (DP) */}
        <ResourceIndicator type="dp" current={player.cost} max={10} size="sm" label="费用" />

        {/* 牌库与弃牌 */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
          <span className="px-1.5 py-0.5 bg-slate-900/80 border border-slate-700/60">
            牌库 <strong className="text-white">{player.deck.length}</strong>
          </span>
          <span className="px-1.5 py-0.5 bg-slate-900/80 border border-slate-700/60">
            弃牌 <strong className="text-slate-400">{player.discard.length}</strong>
          </span>
        </div>

        {player.fatigue_count > 0 && (
          <Badge variant="status" className="bg-rose-950/80 border-rose-500 text-rose-300 font-mono">
            疲劳 {player.fatigue_count}
          </Badge>
        )}
      </div>

      {/* 设施列表 */}
      <div className="player-facilities flex items-center gap-1">
        {player.facility_ids.map((facilityId) => {
          const definition = cardDefinitionOf(state, facilityId);
          const instance = state.card_instances[facilityId];
          return (
            <span key={facilityId} className="facility-chip text-[10px] font-mono">
              {definition?.card_name_zh ?? '设施'}·{instance?.support_lifecycle?.turn_start_triggers ?? 0}
            </span>
          );
        })}
      </div>
    </div>
  );
}

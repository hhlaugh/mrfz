import React from 'react';
import type { GameState, PlayerId } from '../../game/types';
import { PLAYER_LABEL } from '../../client/demoData';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ResourceIndicator } from '../ui/ResourceIndicator';
import type { NetworkStatus } from '../../views/BattleView';

interface TacticalBattleHudProps {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly bottomPlayer: PlayerId;
  readonly topPlayer: PlayerId;
  readonly canAct: boolean;
  readonly isActionPhase: boolean;
  readonly hasPending: boolean;
  readonly networkStatus?: NetworkStatus | null;
  readonly seed?: number;
  readonly showLog: boolean;
  readonly onToggleLog: () => void;
  readonly showDetail: boolean;
  readonly onToggleDetail: () => void;
  readonly onEndActionPhase: () => void;
}

export function TacticalBattleHud({
  state,
  actor,
  bottomPlayer,
  topPlayer,
  canAct,
  isActionPhase,
  hasPending,
  networkStatus,
  seed,
  showLog,
  onToggleLog,
  showDetail,
  onToggleDetail,
  onEndActionPhase,
}: TacticalBattleHudProps) {
  const playerA = state.players[bottomPlayer];
  const playerB = state.players[topPlayer];

  const phaseLabel = hasPending
    ? '回合开始选择'
    : state.phase === 'action'
    ? `行动阶段 · ${PLAYER_LABEL[actor]}`
    : '回合进行中';

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-[#14171d] border-b border-[#2b3542] text-[#e8e9e6] shadow-md z-30 shrink-0 select-none">
      {/* 1. Left: Turn Info, Phase & Network Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="w-1.5 h-4 bg-[#e5a52b]" />
          <span className="font-black text-sm tracking-widest text-white">
            TURN {String(state.turn_number).padStart(2, '0')}
          </span>
        </div>

        <Badge variant={hasPending ? 'status' : 'class'} value="phase" className="text-xs font-bold font-sans">
          {phaseLabel}
        </Badge>

        {networkStatus?.isOnline ? (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700">
              房间 <strong>{networkStatus.roomCode}</strong>
            </span>
            <span className={`text-[10px] flex items-center gap-1 ${networkStatus.opponentConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${networkStatus.opponentConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {networkStatus.opponentConnected ? '对手在线' : '对手离线'}
            </span>
          </div>
        ) : (
          seed !== undefined && (
            <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
              SEED // {seed}
            </span>
          )
        )}
      </div>

      {/* 2. Center: Compact Tactical Status for Both Players */}
      <div className="flex items-center gap-4 bg-[#0e1116] px-4 py-1 border border-[#232c37] rounded-sm">
        {/* Bottom Player (Self / Ally) */}
        <div className="flex items-center gap-2">
          <Badge variant="ally" className="text-[10px]">
            {PLAYER_LABEL[bottomPlayer]}
          </Badge>
          <ResourceIndicator type="hp" current={playerA.base_points} max={10} size="sm" />
          <ResourceIndicator type="dp" current={playerA.cost} max={10} size="sm" />
          <span className="text-[10px] font-mono text-slate-400">
            手牌:{playerA.hand.length} 库:{playerA.deck.length}
          </span>
          {bottomPlayer === actor && (
            <span className="w-2 h-2 rounded-full bg-[#e5a52b] animate-ping" title="行动中" />
          )}
        </div>

        <span className="text-[10px] font-mono text-slate-600 font-bold">VS</span>

        {/* Top Player (Opponent / Enemy) */}
        <div className="flex items-center gap-2">
          <Badge variant="enemy" className="text-[10px]">
            {PLAYER_LABEL[topPlayer]}
          </Badge>
          <ResourceIndicator type="hp" current={playerB.base_points} max={10} size="sm" />
          <ResourceIndicator type="dp" current={playerB.cost} max={10} size="sm" />
          <span className="text-[10px] font-mono text-slate-400">
            手牌:{playerB.hand.length} 库:{playerB.deck.length}
          </span>
          {topPlayer === actor && (
            <span className="w-2 h-2 rounded-full bg-[#e5a52b] animate-ping" title="行动中" />
          )}
        </div>
      </div>

      {/* 3. Right: View Toggles & End Action Phase Button */}
      <div className="flex items-center gap-2">
        <Button
          variant={showLog ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleLog}
          title={showLog ? '收起战斗日志' : '展开战斗日志'}
          className="text-xs px-2.5"
        >
          {showLog ? '◀ 收起日志' : '📜 展开日志'}
        </Button>

        <Button
          variant={showDetail ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleDetail}
          title={showDetail ? '收起详情侧栏' : '展开详情侧栏'}
          className="text-xs px-2.5"
        >
          {showDetail ? '▶ 收起详情' : '🔍 单位详情'}
        </Button>

        {networkStatus?.isOnline && networkStatus.onLeaveRoom && (
          <Button variant="danger" size="sm" onClick={networkStatus.onLeaveRoom}>
            离开对局
          </Button>
        )}

        <Button
          variant="primary"
          size="md"
          cornerCut
          disabled={!isActionPhase || !canAct || Boolean(networkStatus?.pausedForGuest)}
          onClick={onEndActionPhase}
          className="font-bold tracking-wider px-4"
        >
          结束行动阶段 ▶
        </Button>
      </div>
    </header>
  );
}

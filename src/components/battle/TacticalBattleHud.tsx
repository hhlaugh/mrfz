import React from 'react';
import type { GameState, PlayerId } from '../../game/types';
import { PLAYER_LABEL } from '../../client/demoData';
import { Button } from '../ui/Button';
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

/**
 * 战术核心顶部 HUD (TacticalBattleHud)
 * 依照《UI_REDESIGN.md》Section 4.1 与电脑端零滚动方案：
 * - 左右双翼对峙设计：左侧【我方基地 / 罗德岛青蓝】 vs 右侧【敌方基地 / 整合运动绯红】
 * - 核心基本分（基地 HP）以大号等宽字体高光突出显示，胜负关键一目了然
 * - 居中集成当前行动方强脉冲指示、回合轮次、阶段标徽与一键结束行动按钮
 */
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
  const playerAlly = state.players[bottomPlayer];
  const playerEnemy = state.players[topPlayer];

  const isAllyTurn = actor === bottomPlayer;
  const isEnemyTurn = actor === topPlayer;

  const phaseBadge = hasPending ? (
    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold text-xs tracking-wider">
      ⚠️ 待定支援抉择
    </span>
  ) : state.phase === 'action' ? (
    isAllyTurn ? (
      <span className="px-2 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 font-bold text-xs tracking-wider flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
        <span>我方行动中</span>
      </span>
    ) : (
      <span className="px-2 py-0.5 bg-rose-500/25 text-rose-300 border border-rose-500/60 font-bold text-xs tracking-wider flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
        <span>敌方行动中</span>
      </span>
    )
  ) : (
    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs tracking-wider">
      ⚪ 战术结算中
    </span>
  );

  return (
    <header className="flex items-center justify-between px-3 py-1 bg-[#0d1016] border-b border-[#232d3d] text-[#e8e9e6] shadow-md z-30 shrink-0 select-none min-h-[52px]">
      {/* 1. 左翼：我方基地状态 (ALLY BASE - 罗德岛青蓝) */}
      <div
        className={`flex items-center gap-2.5 px-3 py-1 bg-gradient-to-r from-sky-950/80 via-[#101926] to-[#0d1016] border transition-all duration-200 ${
          isAllyTurn
            ? 'border-sky-400 ring-2 ring-sky-400/40 shadow-[0_0_14px_rgba(56,189,248,0.35)]'
            : 'border-sky-700/50'
        }`}
        style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)' }}
      >
        <span className="px-1.5 py-0.5 bg-sky-500 text-slate-950 font-black text-xs tracking-wider shrink-0 uppercase shadow-xs">
          我方基地
        </span>

        {/* 基地核心生命值 (Base Points) */}
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-[10px] text-sky-400 font-bold">HP</span>
          <strong className="text-2xl font-black text-sky-300 leading-none drop-shadow-sm">
            {playerAlly.base_points}
          </strong>
          <span className="text-[10px] text-slate-500">/10</span>
        </div>

        {/* 可用费用 DP */}
        <div className="flex items-baseline gap-1 font-mono bg-[#1c221a] border border-amber-500/50 px-2 py-0.5 shadow-xs">
          <span className="text-[10px] text-amber-400 font-bold">DP</span>
          <strong className="text-sm font-black text-amber-300 leading-none">
            {playerAlly.cost}
          </strong>
          <span className="text-[10px] text-amber-500/80">/10</span>
        </div>

        {/* 手牌/牌库信息 */}
        <div className="text-[10px] font-mono text-slate-400 hidden xl:flex flex-col leading-tight">
          <span>手牌: <strong className="text-slate-200">{playerAlly.hand.length}</strong></span>
          <span>牌库: <strong className="text-slate-200">{playerAlly.deck.length}</strong></span>
        </div>

        {isAllyTurn && (
          <span className="px-1.5 py-0.5 bg-sky-400 text-slate-950 font-bold text-[10px] tracking-wider shrink-0 animate-pulse hidden sm:inline">
            YOUR TURN
          </span>
        )}
      </div>

      {/* 2. 中央中枢：回合轮次、阶段标徽与全局指令 */}
      <div className="flex items-center gap-3">
        {/* 回合数 */}
        <div className="flex items-center gap-1.5 font-mono">
          <span className="w-1.5 h-4 bg-[#e5a52b]" />
          <span className="font-black text-sm tracking-widest text-white">
            TURN {String(state.turn_number).padStart(2, '0')}
          </span>
        </div>

        {/* 阶段徽章 */}
        {phaseBadge}

        {/* 结束行动阶段按钮 (高对比操作) */}
        <Button
          variant={canAct && isActionPhase && isAllyTurn ? 'primary' : 'ghost'}
          size="sm"
          disabled={!canAct || !isActionPhase || hasPending || !isAllyTurn}
          onClick={onEndActionPhase}
          className={`text-xs px-3 font-bold transition-all ${
            canAct && isActionPhase && isAllyTurn
              ? 'animate-pulse ring-2 ring-amber-400/50 shadow-[0_0_12px_rgba(229,165,43,0.4)]'
              : 'opacity-50'
          }`}
        >
          结束行动
        </Button>

        {/* 网络状态 / 随机种子 */}
        {networkStatus?.isOnline ? (
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${networkStatus.opponentConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-slate-400">房号 {networkStatus.roomCode}</span>
          </div>
        ) : (
          seed !== undefined && (
            <span className="text-[10px] font-mono text-slate-500 hidden 2xl:inline">
              SEED:{seed}
            </span>
          )
        )}

        {/* 日志与详情折叠按钮 */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={showLog ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleLog}
            title={showLog ? '收起战斗日志' : '展开战斗日志'}
            className="text-xs px-2 py-1"
          >
            {showLog ? '◀ 日志' : '📜 日志'}
          </Button>

          <Button
            variant={showDetail ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleDetail}
            title={showDetail ? '收起详情侧栏' : '展开详情侧栏'}
            className="text-xs px-2 py-1"
          >
            {showDetail ? '档案 ▶' : '🔍 档案'}
          </Button>
        </div>
      </div>

      {/* 3. 右翼：敌方基地状态 (ENEMY BASE - 整合运动绯红) */}
      <div
        className={`flex items-center gap-2.5 px-3 py-1 bg-gradient-to-l from-rose-950/80 via-[#221217] to-[#0d1016] border transition-all duration-200 ${
          isEnemyTurn
            ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-[0_0_14px_rgba(244,63,94,0.4)]'
            : 'border-rose-700/50'
        }`}
        style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}
      >
        {isEnemyTurn && (
          <span className="px-1.5 py-0.5 bg-rose-500 text-white font-bold text-[10px] tracking-wider shrink-0 animate-pulse hidden sm:inline">
            ENEMY TURN
          </span>
        )}

        {/* 手牌/牌库信息 */}
        <div className="text-[10px] font-mono text-slate-400 hidden xl:flex flex-col text-right leading-tight">
          <span>手牌: <strong className="text-slate-200">{playerEnemy.hand.length}</strong></span>
          <span>牌库: <strong className="text-slate-200">{playerEnemy.deck.length}</strong></span>
        </div>

        {/* 可用费用 DP */}
        <div className="flex items-baseline gap-1 font-mono bg-[#241418] border border-rose-500/40 px-2 py-0.5 shadow-xs">
          <span className="text-[10px] text-rose-300 font-bold">DP</span>
          <strong className="text-sm font-black text-rose-300 leading-none">
            {playerEnemy.cost}
          </strong>
          <span className="text-[10px] text-rose-500/80">/10</span>
        </div>

        {/* 基地核心生命值 (Base Points) */}
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-[10px] text-rose-400 font-bold">HP</span>
          <strong className="text-2xl font-black text-rose-400 leading-none drop-shadow-sm">
            {playerEnemy.base_points}
          </strong>
          <span className="text-[10px] text-slate-500">/10</span>
        </div>

        <span className="px-1.5 py-0.5 bg-rose-600 text-white font-black text-xs tracking-wider shrink-0 uppercase shadow-xs">
          敌方基地
        </span>
      </div>
    </header>
  );
}

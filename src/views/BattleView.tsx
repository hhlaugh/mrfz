import React, { useEffect, useMemo, useState } from 'react';
import type { ActionResult, LocalGameController, LocalGameSnapshot } from '../client/localGameController';
import { LANE_LABEL, PLAYER_LABEL } from '../client/demoData';
import { CardView, cardDefinitionOf } from '../components/CardView';
import { UnitView } from '../components/UnitView';
import type { UnitHighlight } from '../components/UnitView';
import { LogView } from '../components/LogView';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TacticalBattleHud } from '../components/battle/TacticalBattleHud';
import { TacticalDetailPanel } from '../components/battle/TacticalDetailPanel';
import { enumerateLegalActions } from '../game/legal-actions';
import type { CardInstance, CardInstanceId, GameAction, LaneId, PlayerId, Position } from '../game/types';

const LANES: readonly LaneId[] = ['left', 'center', 'right'];

type DeployAction = Extract<GameAction, { type: 'deploy_operator' }>;
type PlayCardAction = Extract<GameAction, { type: 'play_card' }>;
type SkillAction = Extract<GameAction, { type: 'activate_skill' }>;
type PendingResolveAction = Extract<GameAction, { type: 'resolve_pending_choice' }>;

export interface NetworkStatus {
  readonly isOnline: boolean;
  readonly roomCode?: string;
  readonly seat?: 'host' | 'guest';
  readonly opponentConnected: boolean;
  readonly pausedForGuest?: boolean;
  readonly onLeaveRoom?: () => void;
}

interface BattleViewProps {
  readonly snapshot: LocalGameSnapshot;
  readonly controller?: LocalGameController;
  readonly onDispatch?: (action: GameAction) => ActionResult | Promise<ActionResult>;
  /** 单人模式下由人类操作的玩家座位；null 表示本地热座（双方都是人）。 */
  readonly humanPlayer?: PlayerId | null;
  readonly networkStatus?: NetworkStatus | null;
}

export function BattleView({ snapshot, controller, onDispatch, humanPlayer = null, networkStatus = null }: BattleViewProps) {
  const state = snapshot.state;
  const actor = state.active_player_id;
  const canAct = !humanPlayer || actor === humanPlayer;
  const isActionPhase = state.phase === 'action';
  const hasPending = state.phase === 'turn_start' && state.turn_start_prepared && state.pending_effect_choices.length > 0;

  // 视角决定：玩家视角下自己始终是下方的玩家，对手在上方
  const bottomPlayer: PlayerId = humanPlayer ?? 'player_a';
  const topPlayer: PlayerId = bottomPlayer === 'player_a' ? 'player_b' : 'player_a';

  const [selection, setSelection] = useState<CardInstanceId | null>(null);
  const [showLog, setShowLog] = useState(true);
  const [showDetail, setShowDetail] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const legal = useMemo(() => enumerateLegalActions(state, actor), [state, actor]);

  const selectedDeployActions = useMemo(
    () => (selection ? legal.filter((action): action is DeployAction => action.type === 'deploy_operator' && action.card_instance_id === selection) : []),
    [legal, selection],
  );
  const selectedPlayActions = useMemo(
    () => (selection ? legal.filter((action): action is PlayCardAction => action.type === 'play_card' && action.card_instance_id === selection) : []),
    [legal, selection],
  );
  const playTargets = useMemo(
    () => new Set(selectedPlayActions.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
    [selectedPlayActions],
  );

  const selectedUnitActions = useMemo(() => {
    if (!selection) return { canWithdraw: false, canSkillDirect: false, skillTargets: new Set<CardInstanceId>(), skillCost: null as number | null };
    const canWithdraw = legal.some((action) => action.type === 'withdraw_operator' && action.card_instance_id === selection);
    const skills = legal.filter((action): action is SkillAction => action.type === 'activate_skill' && action.card_instance_id === selection);
    const instance = state.card_instances[selection];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    return {
      canWithdraw,
      canSkillDirect: skills.some((action) => action.target_instance_id === undefined),
      skillTargets: new Set(skills.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
      skillCost: definition?.active_skill_sp_cost ?? null,
    };
  }, [legal, selection, state]);

  const pendingResolves = useMemo(
    () => (hasPending ? legal.filter((action): action is PendingResolveAction => action.type === 'resolve_pending_choice') : []),
    [legal, hasPending],
  );
  const pendingTargets = useMemo(
    () => new Set(pendingResolves.map((action) => action.target_instance_id).filter((id): id is CardInstanceId => id !== undefined)),
    [pendingResolves],
  );
  const canSkipPending = pendingResolves.some((action) => action.target_instance_id === undefined);

  const boardMap = useMemo(() => {
    const map = new Map<string, CardInstance>();
    for (const instance of Object.values(state.card_instances)) {
      if (instance.zone === 'board' && instance.board_half && instance.lane && instance.position) {
        map.set(`${instance.board_half}:${instance.lane}:${instance.position}`, instance);
      }
    }
    return map;
  }, [state.card_instances]);

  const dispatch = async (action: GameAction) => {
    try {
      const result = onDispatch ? await onDispatch(action) : controller?.dispatch(actor, action);
      if (result && !result.ok) {
        setError(result.reason ?? '操作不合法');
      } else {
        setSelection(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行操作异常');
    }
  };

  const onSlotClick = (half: PlayerId, lane: LaneId, position: Position) => {
    if (!isActionPhase || !canAct || hasPending) return;
    const action = selectedDeployActions.find((candidate) => candidate.lane === lane && candidate.position === position);
    if (action) {
      dispatch(action);
    }
  };

  const onUnitClick = (instance: CardInstance) => {
    if (!canAct) return;
    const targetId = instance.card_instance_id;

    // 1. 回合开始选择目标 (Pending Choice)
    if (hasPending) {
      const pendingAction = pendingResolves.find((candidate) => candidate.target_instance_id === targetId);
      if (pendingAction) {
        dispatch(pendingAction);
        return;
      }
    }

    // 2. 手牌战术卡目标
    if (playTargets.has(targetId)) {
      const action = selectedPlayActions.find((candidate) => candidate.target_instance_id === targetId);
      if (action) {
        dispatch(action);
        return;
      }
    }

    // 3. 干员主动技能目标
    if (selectedUnitActions.skillTargets.has(targetId)) {
      const action = legal.find(
        (candidate): candidate is SkillAction =>
          candidate.type === 'activate_skill' && candidate.card_instance_id === selection && candidate.target_instance_id === targetId,
      );
      if (action) {
        dispatch(action);
        return;
      }
    }

    // 4. 普通检视选中
    setSelection(selection === targetId ? null : targetId);
  };

  const onHandCardClick = (id: CardInstanceId) => {
    if (!isActionPhase || hasPending || !canAct) return;
    setSelection(selection === id ? null : id);
  };

  const selectedInstance = selection ? state.card_instances[selection] : undefined;
  const selectedDefinition = selection ? cardDefinitionOf(state, selection) : undefined;

  const renderSlot = (half: PlayerId, lane: LaneId, position: Position) => {
    const key = `${half}:${lane}:${position}`;
    const instance = boardMap.get(key);
    const isDeployTarget = half === actor && selectedDeployActions.some((action) => action.lane === lane && action.position === position);
    const posName = position === 'front' ? '前排' : '后排';

    if (!instance) {
      return (
        <div
          key={key}
          onClick={() => onSlotClick(half, lane, position)}
          className={`relative flex items-center justify-center h-[116px] border transition-all duration-150 select-none ${
            isDeployTarget
              ? 'border-[#e5a52b] bg-amber-500/15 ring-2 ring-[#e5a52b]/50 shadow-[0_0_12px_rgba(229,165,43,0.35)] cursor-pointer animate-pulse'
              : 'border-dashed border-[#2d3744] bg-[#12161e]/60 hover:border-[#415063] hover:bg-[#161c26]'
          }`}
          style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
        >
          {isDeployTarget ? (
            <div className="flex flex-col items-center gap-0.5 text-[#e5a52b] font-bold text-xs tracking-wider">
              <span>+ 可部署</span>
              <span className="text-[10px] font-mono">({posName})</span>
            </div>
          ) : (
            <span className="text-[11px] font-mono text-slate-500 tracking-wider">
              {posName}
            </span>
          )}
        </div>
      );
    }

    let highlight: UnitHighlight = 'none';
    if (
      pendingTargets.has(instance.card_instance_id) ||
      playTargets.has(instance.card_instance_id) ||
      selectedUnitActions.skillTargets.has(instance.card_instance_id)
    ) {
      highlight = 'target';
    } else if (selection === instance.card_instance_id) {
      highlight = 'selected';
    }

    return (
      <UnitView
        key={instance.card_instance_id}
        state={state}
        instance={instance}
        highlight={highlight}
        onClick={() => onUnitClick(instance)}
      />
    );
  };

  const isOpponentHand = (playerId: PlayerId) => {
    return humanPlayer !== null ? playerId !== humanPlayer : playerId !== bottomPlayer;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#11141a] text-[#e8e9e6] font-sans overflow-hidden select-none">
      {/* 1. 顶部紧凑 HUD (Tactical Terminal Header) */}
      <TacticalBattleHud
        state={state}
        actor={actor}
        bottomPlayer={bottomPlayer}
        topPlayer={topPlayer}
        canAct={canAct}
        isActionPhase={isActionPhase}
        hasPending={hasPending}
        networkStatus={networkStatus}
        seed={controller?.getSetup().seed}
        showLog={showLog}
        onToggleLog={() => setShowLog((prev) => !prev)}
        showDetail={showDetail}
        onToggleDetail={() => setShowDetail((prev) => !prev)}
        onEndActionPhase={() => dispatch({ type: 'end_action_phase' })}
      />

      {/* 2. 网络中断或回合前待决提示条 */}
      {networkStatus?.pausedForGuest && (
        <div className="px-4 py-2 bg-amber-950/90 border-b border-amber-500/60 text-amber-300 text-xs flex items-center justify-center gap-2">
          <span>⏸️ 访客网络已断开，对局已自动暂停，等待重连（宽限期 120 秒）…</span>
        </div>
      )}

      {hasPending && (
        <div className="px-4 py-2 bg-[#1a2332] border-b border-[#3b4c66] flex items-center justify-between text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>回合开始支援触发：请选择友方干员充能 SP</span>
          </div>
          {canSkipPending && canAct && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch({ type: 'resolve_pending_choice', source_instance_id: state.pending_effect_choices[0]?.source_instance_id ?? '' })}
            >
              跳过充能
            </Button>
          )}
        </div>
      )}

      {/* 3. 核心三栏桌面工作区 (Desktop 3-Column Layout) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左栏：可折叠战术日志 (Collapsible Combat Log) */}
        {showLog && (
          <aside className="w-80 border-r border-[#242e3d] bg-[#141821] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
            <Panel
              variant="default"
              title={`战斗日志 (${snapshot.logHistory.length})`}
              codeName="SYS.LOG"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setShowLog(false)} className="px-1.5 py-0 text-[10px]">
                  ◀ 收起
                </Button>
              }
              className="flex-1 border-0 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto p-2">
                <LogView history={snapshot.logHistory} state={snapshot.state} />
              </div>
            </Panel>
          </aside>
        )}

        {/* 中栏：战术棋盘主战场 + 手牌区 */}
        <main className="flex-1 flex flex-col bg-[#0e1117] overflow-hidden min-w-[560px]">
          {/* 对手简要状态条 (顶栏紧贴敌方战线) */}
          <div className="px-4 py-1.5 bg-[#141822] border-b border-[#252f3f] flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2 font-mono">
              <Badge variant="enemy">{PLAYER_LABEL[topPlayer]}</Badge>
              <span className="text-slate-400">
                敌方战线 · 手牌: <strong>{state.players[topPlayer].hand.length}</strong> 张
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">基本分: <strong className="text-rose-400">{state.players[topPlayer].base_points}</strong></span>
              <span className="text-slate-400">可用费用: <strong className="text-amber-400">{state.players[topPlayer].cost} DP</strong></span>
            </div>
          </div>

          {/* 中央三路交锋战场 (3-Lanes Combat Battlefield) */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center items-center">
            <div className="grid grid-cols-3 gap-3 w-full max-w-4xl">
              {LANES.map((lane) => (
                <div
                  key={lane}
                  className="flex flex-col bg-[#141820] border border-[#2b3543] overflow-hidden shadow-md"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                >
                  {/* 路口标头 */}
                  <div className="px-3 py-1.5 bg-[#181d28] border-b border-[#2b3543] flex items-center justify-between text-xs">
                    <span className="font-bold text-white tracking-wide">{LANE_LABEL[lane]}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      LANE // {lane.toUpperCase()}
                    </span>
                  </div>

                  {/* 敌方半场 (上方后排 + 前排) */}
                  <div className={`p-2 space-y-2 bg-[#1a1215]/40 border-b border-[#3b242a]/60 ${actor === topPlayer ? 'bg-rose-950/20' : ''}`}>
                    <div className="space-y-1.5">
                      {renderSlot(topPlayer, lane, 'back')}
                      {renderSlot(topPlayer, lane, 'front')}
                    </div>
                  </div>

                  {/* ⚔️ 三路阻挡与交锋核心线 */}
                  <div className="relative py-2 px-3 bg-[#11141c] border-y border-[#323d4e] flex items-center justify-center gap-2 select-none">
                    <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-[#4a5a73] to-transparent" />
                    <span className="text-[11px] font-mono font-bold text-[#e5a52b] tracking-wider flex items-center gap-1">
                      <span>⚔</span>
                      <span>交锋线</span>
                    </span>
                    <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-[#4a5a73] to-transparent" />
                  </div>

                  {/* 己方半场 (下方前排 + 后排) */}
                  <div className={`p-2 space-y-2 bg-[#111924]/40 ${actor === bottomPlayer ? 'bg-sky-950/20' : ''}`}>
                    <div className="space-y-1.5">
                      {renderSlot(bottomPlayer, lane, 'front')}
                      {renderSlot(bottomPlayer, lane, 'back')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 操作指引横条 (Action Hint Strip) */}
          {selectedInstance && (
            <div className="px-4 py-1.5 bg-[#1b222d] border-t border-[#313f52] flex items-center justify-between text-xs text-amber-300 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3 bg-[#e5a52b]" />
                <span>
                  当前选中: <strong>{selectedDefinition?.card_name_zh}</strong>
                  {selectedInstance.zone === 'hand'
                    ? selectedDeployActions.length > 0
                      ? ' · 请点击棋盘上黄色高亮格子部署'
                      : ' · 费用不足或暂无可部署格子'
                    : ' · 战场在编单位'}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelection(null)} className="text-slate-400 hover:text-white px-2 py-0 text-xs">
                取消选择
              </Button>
            </div>
          )}

          {/* 底部手牌卡牌托盘 (Bottom Hand Dock) */}
          <div className="bg-[#131720] border-t border-[#293444] p-3 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono">
                <Badge variant="ally">{PLAYER_LABEL[bottomPlayer]}</Badge>
                <span className="text-slate-300">
                  己方手牌 (<strong>{state.players[bottomPlayer].hand.length}</strong>)
                </span>
                <span className="text-amber-400 font-bold ml-2">
                  可用费用: {state.players[bottomPlayer].cost} / 10 DP
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                牌库余量: {state.players[bottomPlayer].deck.length} · 弃牌: {state.players[bottomPlayer].discard.length}
              </span>
            </div>

            {/* Hand Cards Horizontal Scroll Container */}
            <div className="flex items-center gap-3 overflow-x-auto py-1 px-1 min-h-[196px] content-start">
              {state.players[bottomPlayer].hand.length === 0 ? (
                <div className="w-full text-center py-10 text-xs text-slate-500 font-mono">
                  （暂无手牌）
                </div>
              ) : (
                state.players[bottomPlayer].hand.map((id) => (
                  <CardView
                    key={id}
                    state={state}
                    instanceId={id}
                    selected={selection === id}
                    interactive={isActionPhase && !hasPending && bottomPlayer === actor && canAct}
                    onClick={() => onHandCardClick(id)}
                  />
                ))
              )}
            </div>
          </div>
        </main>

        {/* 右栏：单位战术详情与指令操作面板 (Tactical Detail Panel) */}
        {showDetail && (
          <aside className="w-80 border-l border-[#242e3d] bg-[#141821] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
            <TacticalDetailPanel
              state={state}
              selection={selection}
              onDeselect={() => setSelection(null)}
              canAct={canAct}
              isActionPhase={isActionPhase}
              hasPending={hasPending}
              legalActions={legal}
              onDispatch={dispatch}
              className="flex-1"
            />
          </aside>
        )}
      </div>

      {/* 4. 浮动错误提示 */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-rose-950/90 border border-rose-500 text-rose-200 text-xs shadow-2xl animate-fade-in flex items-center gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-rose-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

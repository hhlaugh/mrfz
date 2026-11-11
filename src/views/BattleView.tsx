import React, { useEffect, useMemo, useState } from 'react';
import type { ActionResult, LocalGameController, LocalGameSnapshot } from '../client/localGameController';
import { LANE_LABEL, PLAYER_LABEL } from '../client/demoData';
import { CardView, cardDefinitionOf } from '../components/CardView';
import { UnitView } from '../components/UnitView';
import type { UnitHighlight } from '../components/UnitView';
import { LogView } from '../components/LogView';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { TacticalBattleHud } from '../components/battle/TacticalBattleHud';
import { TacticalDetailPanel } from '../components/battle/TacticalDetailPanel';
import { enumerateLegalActions } from '../game/legal-actions';
import { useViewport } from '../hooks/useIsMobile';
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

  const { isMobile, isLandscape } = useViewport();
  const [dismissedOrientationTip, setDismissedOrientationTip] = useState(false);

  // 视角决定：玩家视角下自己始终是下方的玩家，对手在上方
  const bottomPlayer: PlayerId = humanPlayer ?? 'player_a';
  const topPlayer: PlayerId = bottomPlayer === 'player_a' ? 'player_b' : 'player_a';

  const [selection, setSelection] = useState<CardInstanceId | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 桌面端默认展开侧边面板，移动端默认收起改用抽屉
  useEffect(() => {
    if (!isMobile) {
      setShowLog(true);
      setShowDetail(true);
    } else {
      setShowLog(false);
      setShowDetail(false);
    }
  }, [isMobile]);

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
        if (isMobile) setShowDetail(false);
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

    // 1. 优先判定是否处于回合开始前抉择模式
    if (hasPending) {
      const pendingAction = pendingResolves.find((candidate) => candidate.target_instance_id === targetId);
      if (pendingAction) {
        dispatch(pendingAction);
      }
      return;
    }

    // 2. 判定是否有战术卡或直接效果指向该单位
    if (selection && playTargets.has(targetId)) {
      const action = selectedPlayActions.find((candidate) => candidate.target_instance_id === targetId);
      if (action) {
        dispatch(action);
        return;
      }
    }

    // 3. 判定主动技能释放目标
    if (selection && selectedUnitActions.skillTargets.has(targetId)) {
      const action = legal.find(
        (candidate): candidate is SkillAction =>
          candidate.type === 'activate_skill' && candidate.card_instance_id === selection && candidate.target_instance_id === targetId,
      );
      if (action) {
        dispatch(action);
        return;
      }
    }

    // 4. 普通选中逻辑（移动端点击己方单位时同时提供展开详情抽屉）
    if (selection === targetId) {
      setSelection(null);
      if (isMobile) setShowDetail(false);
    } else {
      setSelection(targetId);
      if (isMobile && instance.owner_id === actor) {
        // 己方干员被选中，提示或可开抽屉
      }
    }
  };

  const onHandCardClick = (id: CardInstanceId) => {
    if (!isActionPhase || hasPending || !canAct) return;
    if (selection === id) {
      setSelection(null);
      if (isMobile) setShowDetail(false);
    } else {
      setSelection(id);
    }
  };

  const selectedInstance = selection ? state.card_instances[selection] : undefined;
  const selectedDefinition = selection ? cardDefinitionOf(state, selection) : undefined;

  const renderSlot = (half: PlayerId, lane: LaneId, position: Position) => {
    const key = `${half}:${lane}:${position}`;
    const instance = boardMap.get(key);
    const isDeployTarget = half === actor && selectedDeployActions.some((action) => action.lane === lane && action.position === position);
    const isEnemy = half === topPlayer;
    const posName = isEnemy
      ? position === 'front' ? '敌前锋' : '敌后排'
      : position === 'front' ? '我前锋' : '我后卫';

    if (!instance) {
      return (
        <div
          key={key}
          onClick={() => onSlotClick(half, lane, position)}
          className={`relative flex items-center justify-center h-[76px] sm:h-[82px] border transition-all duration-150 select-none ${
            isDeployTarget
              ? 'border-[#e5a52b] bg-amber-500/20 ring-2 ring-[#e5a52b]/60 shadow-[0_0_12px_rgba(229,165,43,0.4)] cursor-pointer animate-pulse'
              : isEnemy
              ? 'border-dashed border-rose-900/40 bg-[#160f12]/50 hover:border-rose-700/60 hover:bg-[#1f1418]'
              : 'border-dashed border-sky-900/40 bg-[#0d141d]/50 hover:border-sky-700/60 hover:bg-[#131e2b]'
          }`}
          style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
        >
          {isDeployTarget ? (
            <div className="flex flex-col items-center gap-0.5 text-[#e5a52b] font-bold text-[11px] sm:text-xs tracking-wider">
              <span>+ 部署</span>
              <span className="text-[9px] sm:text-[10px] font-mono">({posName})</span>
            </div>
          ) : (
            <span className={`text-[9px] sm:text-[10px] font-mono tracking-wider ${isEnemy ? 'text-rose-400/60' : 'text-sky-400/60'}`}>
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

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d1016] text-[#e8e9e6] font-sans overflow-hidden select-none">
      {/* 1. 顶部紧凑双翼 HUD (Tactical Terminal Header) */}
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

      {/* 2. 移动端竖屏建议横屏轻量提示条 (Dismissable) */}
      {isMobile && !isLandscape && !dismissedOrientationTip && (
        <div className="px-3 py-1 bg-sky-950/90 border-b border-sky-500/40 text-sky-300 text-[11px] flex items-center justify-between shrink-0 z-20">
          <span>💡 提示：将手机横屏可获得更宽阔的战术交锋视野</span>
          <button
            onClick={() => setDismissedOrientationTip(true)}
            className="text-slate-400 hover:text-white px-1.5 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. 网络中断或回合前待决提示条 */}
      {networkStatus?.pausedForGuest && (
        <div className="px-4 py-1.5 bg-amber-950/90 border-b border-amber-500/60 text-amber-300 text-xs flex items-center justify-center gap-2 shrink-0">
          <span>⏸️ 访客网络已断开，对局已自动暂停，等待重连（宽限期 120 秒）…</span>
        </div>
      )}

      {hasPending && (
        <div className="px-3 sm:px-4 py-1.5 bg-[#1a2332] border-b border-[#3b4c66] flex items-center justify-between text-xs text-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] sm:text-xs">回合开始支援：点击友方干员充能 SP</span>
          </div>
          {canSkipPending && canAct && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch({ type: 'resolve_pending_choice', source_instance_id: state.pending_effect_choices[0]?.source_instance_id ?? '' })}
              className="text-[11px] px-2 py-0.5"
            >
              跳过充能
            </Button>
          )}
        </div>
      )}

      {/* 4. 核心三栏桌面工作区 / 移动端自适应战场 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左栏：桌面端固定展示，移动端由 BottomSheet 承载 */}
        {!isMobile && showLog && (
          <aside className="w-80 border-r border-[#242e3d] bg-[#121620] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
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

        {/* 中栏：战术棋盘主战场 + 紧凑手牌区 (完全锁定一屏，绝无上下滚动) */}
        <main className="flex-1 flex flex-col justify-between bg-[#0a0d12] overflow-hidden min-w-[320px]">
          {/* 中央三路交锋推演棋盘 */}
          <div className="flex-1 flex flex-col justify-center items-center px-1.5 sm:px-4 py-1 overflow-hidden">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 w-full max-w-4xl">
              {LANES.map((lane) => (
                <div
                  key={lane}
                  className="flex flex-col bg-[#11161f] border border-[#263140] overflow-hidden shadow-md"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
                >
                  {/* 航道路口标头 */}
                  <div className="px-2 py-0.5 sm:py-1 bg-[#151b24] border-b border-[#242f3d] flex items-center justify-between text-xs">
                    <span className="font-bold text-white tracking-wide text-[11px] sm:text-xs">{LANE_LABEL[lane]}</span>
                    <span className="text-[9px] sm:text-[10px] font-mono text-slate-400">
                      // {lane.toUpperCase()}
                    </span>
                  </div>

                  {/* 🔴 敌方战区 (上方后排 + 前排) */}
                  <div className="px-1.5 py-0.2 sm:py-0.5 bg-rose-950/40 border-b border-rose-900/40 flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-rose-300">
                    <span>🔴 敌方战区</span>
                    <span className="text-[8px] sm:text-[9px] text-rose-400/80">后排/前锋</span>
                  </div>
                  <div className={`p-1 sm:p-1.5 space-y-1 bg-[#180e12]/60 border-b border-rose-900/30 ${actor === topPlayer ? 'bg-rose-950/20' : ''}`}>
                    {renderSlot(topPlayer, lane, 'back')}
                    {renderSlot(topPlayer, lane, 'front')}
                  </div>

                  {/* ⚔️ 三路阻挡与交锋核心线 */}
                  <div className="relative py-0.5 sm:py-1 px-2 bg-[#0f131a] border-y border-[#2d3848] flex items-center justify-center gap-1.5 select-none">
                    <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[#e5a52b] tracking-wider flex items-center gap-1">
                      <span>⚔</span>
                      <span>交锋阻挡</span>
                    </span>
                    <div className="flex-1 h-[1px] sm:h-[1.5px] bg-gradient-to-r from-transparent via-[#45556d] to-transparent" />
                  </div>

                  {/* 🔵 己方战区 (下方前排 + 后排) */}
                  <div className={`p-1 sm:p-1.5 space-y-1 bg-[#0b131d]/60 ${actor === bottomPlayer ? 'bg-sky-950/20' : ''}`}>
                    {renderSlot(bottomPlayer, lane, 'front')}
                    {renderSlot(bottomPlayer, lane, 'back')}
                  </div>
                  <div className="px-1.5 py-0.2 sm:py-0.5 bg-sky-950/40 border-t border-sky-900/40 flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-sky-300">
                    <span>🔵 我方防线</span>
                    <span className="text-[8px] sm:text-[9px] text-sky-400/80">前锋/后卫</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 操作提示栏 (若有选中项) */}
          {selectedInstance && (
            <div className="px-2.5 sm:px-3 py-1 bg-[#17202b] border-t border-[#293748] flex items-center justify-between text-xs text-amber-300 shrink-0">
              <div className="flex items-center gap-1.5 truncate mr-2">
                <span className="w-1.5 h-3 bg-[#e5a52b] shrink-0" />
                <span className="truncate text-[11px] sm:text-xs">
                  <strong>{selectedDefinition?.card_name_zh}</strong>:
                  {selectedInstance.zone === 'hand'
                    ? selectedDeployActions.length > 0
                      ? ' 点击高亮黄色格子部署'
                      : ' 费用不足或无可部署位置'
                    : ' 战场编队干员'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isMobile && (
                  <Button variant="secondary" size="sm" onClick={() => setShowDetail(true)} className="px-2 py-0 text-[10px]">
                    详情档案
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelection(null)} className="text-slate-400 hover:text-white px-1.5 py-0 text-[10px]">
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* 底部紧凑手牌卡牌托盘 (Bottom Compact Hand Dock) */}
          <div className="bg-[#11151e] border-t border-[#252f3e] p-1.5 sm:p-2 shrink-0 flex flex-col gap-1 pb-safe">
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="px-1.5 py-0.2 bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold text-[10px]">
                  手牌 ({state.players[bottomPlayer].hand.length})
                </span>
                <span className="text-amber-400 font-bold text-xs ml-1">
                  {state.players[bottomPlayer].cost} / 10 DP
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400">
                  余量: {state.players[bottomPlayer].deck.length}
                </span>
                {/* 移动端快捷指令按钮 */}
                {isMobile && isActionPhase && actor === bottomPlayer && canAct && !hasPending && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => dispatch({ type: 'end_action_phase' })}
                    className="text-[11px] px-2 py-0.5 font-bold shadow-xs animate-pulse"
                  >
                    结束行动
                  </Button>
                )}
              </div>
            </div>

            {/* Hand Cards Horizontal Scroll Container (平滑横滑手牌) */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 min-h-[144px] max-h-[154px] content-start snap-x">
              {state.players[bottomPlayer].hand.length === 0 ? (
                <div className="w-full text-center py-6 text-xs text-slate-500 font-mono">
                  （暂无手牌）
                </div>
              ) : (
                state.players[bottomPlayer].hand.map((id) => (
                  <div key={id} className="snap-start shrink-0">
                    <CardView
                      state={state}
                      instanceId={id}
                      selected={selection === id}
                      interactive={isActionPhase && !hasPending && bottomPlayer === actor && canAct}
                      onClick={() => onHandCardClick(id)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        {/* 右栏：桌面端固定展示，移动端由 BottomSheet 承载 */}
        {!isMobile && showDetail && (
          <aside className="w-80 border-l border-[#242e3d] bg-[#121620] flex flex-col shrink-0 overflow-hidden shadow-lg z-20">
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

      {/* 5. 移动端独立底部抽屉：战斗日志 (Mobile Combat Log BottomSheet) */}
      {isMobile && (
        <BottomSheet
          isOpen={showLog}
          onClose={() => setShowLog(false)}
          title={`战斗日志 (${snapshot.logHistory.length})`}
          codeName="SYS.LOG"
          maxHeight="max-h-[85vh]"
        >
          <div className="p-3 overflow-y-auto max-h-[70vh]">
            <LogView history={snapshot.logHistory} state={snapshot.state} />
          </div>
        </BottomSheet>
      )}

      {/* 6. 移动端独立底部抽屉：干员战术详情与指令操作 (Mobile Tactical Detail BottomSheet) */}
      {isMobile && (
        <BottomSheet
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          title="战术单位指令与档案"
          codeName={selectedInstance?.card_id ?? 'SYS.DOSSIER'}
          maxHeight="max-h-[85vh]"
        >
          <div className="p-2 overflow-y-auto max-h-[70vh]">
            <TacticalDetailPanel
              state={state}
              selection={selection}
              onDeselect={() => {
                setSelection(null);
                setShowDetail(false);
              }}
              canAct={canAct}
              isActionPhase={isActionPhase}
              hasPending={hasPending}
              legalActions={legal}
              onDispatch={dispatch}
            />
          </div>
        </BottomSheet>
      )}

      {/* 7. 浮动错误提示 */}
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

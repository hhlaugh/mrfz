import { useEffect, useMemo, useState } from 'react';
import type { ActionResult, LocalGameController, LocalGameSnapshot } from '../client/localGameController';
import { LANE_LABEL, PLAYER_LABEL } from '../client/demoData';
import { CardView, cardDefinitionOf } from '../components/CardView';
import { UnitView } from '../components/UnitView';
import type { UnitHighlight } from '../components/UnitView';
import { PlayerBar } from '../components/PlayerBar';
import { LogView } from '../components/LogView';
import { enumerateLegalActions } from '../game/legal-actions';
import type { CardInstance, CardInstanceId, GameAction, LaneId, PlayerId, Position } from '../game/types';

const LANES: readonly LaneId[] = ['left', 'center', 'right'];
const HALVES: readonly PlayerId[] = ['player_a', 'player_b'];

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
  const directPlay = selectedPlayActions.some((action) => action.target_instance_id === undefined);
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
  }, [state]);

  const dispatch = async (action: GameAction) => {
    if (onDispatch) {
      const result = await onDispatch(action);
      if (!result.ok) {
        setError(result.reason ?? '非法操作');
        return;
      }
      setSelection(null);
      return;
    }
    if (controller) {
      const result = controller.dispatch(actor, action);
      if (!result.ok) {
        setError(result.reason ?? '非法操作');
        return;
      }
      setSelection(null);
    }
  };

  const onHandCardClick = (instanceId: CardInstanceId) => {
    if (!canAct) {
      setError('现在是对方（机器人）的回合，请等待。');
      return;
    }
    if (hasPending) {
      setError('请先完成回合开始的支援效果选择。');
      return;
    }
    const instance = state.card_instances[instanceId];
    if (!isActionPhase || !instance || instance.owner_id !== actor) {
      setError('当前不能操作这张手牌。');
      return;
    }
    const cooldown = instance.operator_lifecycle?.redeploy_cd_remaining ?? 0;
    if (cooldown > 0) {
      setError(`再部署冷却中：还需跳过 ${cooldown} 个己方行动阶段才能重新部署。`);
      return;
    }
    setSelection((prev) => (prev === instanceId ? null : instanceId));
  };

  const onSlotClick = (half: PlayerId, lane: LaneId, position: Position) => {
    if (half !== actor || !selection) return;
    const deploy = selectedDeployActions.find((action) => action.lane === lane && action.position === position);
    if (!deploy) return;
    dispatch(deploy);
  };

  const onUnitClick = (instance: CardInstance) => {
    const id = instance.card_instance_id;
    if (!canAct) {
      setError('现在是对方（机器人）的回合，请等待。');
      return;
    }
    if (hasPending) {
      const resolve = pendingResolves.find((action) => action.target_instance_id === id);
      if (resolve) dispatch(resolve);
      else setError('该干员不能作为本次选择的目标。');
      return;
    }
    if (selection) {
      const play = selectedPlayActions.find((action) => action.target_instance_id === id);
      if (play) {
        dispatch(play);
        return;
      }
      const skill = legal.find(
        (action): action is SkillAction =>
          action.type === 'activate_skill' && action.card_instance_id === selection && action.target_instance_id === id,
      );
      if (skill) {
        dispatch(skill);
        return;
      }
    }
    setSelection((prev) => (prev === id ? null : id));
  };

  const selectedInstance = selection ? state.card_instances[selection] : undefined;
  const selectedDefinition = selectedInstance ? cardDefinitionOf(state, selectedInstance.card_instance_id) : undefined;
  const selectedIsOwnBoardUnit = Boolean(
    selectedInstance && selectedInstance.zone === 'board' && selectedInstance.controller_id === actor,
  );
  const showHandDirectUse = Boolean(selectedInstance && selectedInstance.zone === 'hand');

  const renderSlot = (half: PlayerId, lane: LaneId, position: Position) => {
    const key = `${half}:${lane}:${position}`;
    const instance = boardMap.get(key);
    const isDeployTarget = half === actor && selectedDeployActions.some((action) => action.lane === lane && action.position === position);
    const posName = position === 'front' ? '前排' : '后排';
    if (!instance) {
      return (
        <div key={key} className={`slot${isDeployTarget ? ' highlight-slot' : ''}`} onClick={() => onSlotClick(half, lane, position)}>
          {isDeployTarget ? (
            <span className="slot-label">可部署 ({posName})</span>
          ) : (
            <span className="slot-hint">{posName}</span>
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
    return <UnitView key={instance.card_instance_id} state={state} instance={instance} highlight={highlight} onClick={() => onUnitClick(instance)} />;
  };

  const phaseText = hasPending
    ? '回合开始选择'
    : state.phase === 'action'
      ? `行动阶段 · ${PLAYER_LABEL[actor]}`
      : '回合进行中';

  return (
    <div className="battle">
      <header className="battle-header">
        <div className="turn-info">
          <span className="turn-number">回合 {state.turn_number}</span>
          <span className="phase-badge">{phaseText}</span>
          {networkStatus?.isOnline ? (
            <>
              <span className="network-room-badge">房间码：<b>{networkStatus.roomCode}</b></span>
              <span className="network-seat-badge">{networkStatus.seat === 'host' ? '房主（玩家 A）' : '访客（玩家 B）'}</span>
              <span className={`network-conn-badge ${networkStatus.opponentConnected ? 'online' : 'offline'}`}>
                {networkStatus.opponentConnected ? '🟢 对手在线' : '🔴 对手离线'}
              </span>
            </>
          ) : (
            <span className="seed-info">seed {controller?.getSetup().seed ?? 0} · 规则 v{state.rules_version}</span>
          )}
        </div>
        <div className="battle-header-actions">
          {networkStatus?.isOnline && networkStatus.onLeaveRoom && (
            <button className="btn" onClick={networkStatus.onLeaveRoom}>
              离开对局
            </button>
          )}
          <button className="btn primary" disabled={!isActionPhase || !canAct || networkStatus?.pausedForGuest} onClick={() => dispatch({ type: 'end_action_phase' })}>
            结束行动阶段
          </button>
        </div>
      </header>

      {networkStatus?.pausedForGuest && (
        <div className="pause-banner">
          <span className="pause-icon">⏸️</span>
          <div className="pause-text">
            <b>访客网络已断开，对局已自动暂停</b>
            <p>等待访客重连恢复（宽限窗口 120 秒）…</p>
          </div>
        </div>
      )}

      {hasPending && (
        <div className="pending-banner">
          {state.pending_effect_choices.map((choice) => {
            const source = state.card_instances[choice.source_instance_id];
            const sourceDefinition = source ? state.card_definitions[source.card_id] : undefined;
            return (
              <div key={choice.source_instance_id} className="pending-item">
                <span>
                  「{sourceDefinition?.card_name_zh ?? '支援设施'}」：点击一名高亮干员获得 {choice.amount} SP
                </span>
                {canSkipPending && canAct && (
                  <button
                    className="btn"
                    onClick={() => dispatch({ type: 'resolve_pending_choice', source_instance_id: choice.source_instance_id })}
                  >
                    跳过
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 辅助渲染独立手牌区 */}
      {(() => {
        const renderHandArea = (playerId: PlayerId) => {
          const isOpponent = humanPlayer !== null ? playerId !== humanPlayer : playerId !== bottomPlayer;
          const isSelf = playerId === bottomPlayer;
          return (
            <div key={playerId} className={`hand-area${playerId === actor ? ' active' : ''}${isSelf ? ' hand-self' : ' hand-opponent'}`}>
              <div className="hand-label">
                <span className="hand-player-title">
                  {PLAYER_LABEL[playerId]}
                  <span className={`player-role-badge ${isSelf ? 'self' : 'opponent'}`}>
                    {isSelf ? '己方（你）' : '对手'}
                  </span>
                </span>
                <span className="hand-count">手牌（{state.players[playerId].hand.length}）</span>
                {playerId === actor && <span className="hand-active-status"> · 行动中</span>}
              </div>
              <div className="hand-cards">
                {isOpponent ? (
                  state.players[playerId].hand.map((id, index) => (
                    <div key={id || index} className="card card-hidden">
                      <div className="card-top">
                        <span className="card-cost">?</span>
                        <span className="card-name">未知手牌</span>
                      </div>
                      <div className="card-effect">对手手牌内容已对客户端隐蔽</div>
                    </div>
                  ))
                ) : (
                  state.players[playerId].hand.map((id) => (
                    <CardView
                      key={id}
                      state={state}
                      instanceId={id}
                      selected={selection === id}
                      interactive={isActionPhase && !hasPending && playerId === actor && canAct}
                      onClick={() => onHandCardClick(id)}
                    />
                  ))
                )}
                {state.players[playerId].hand.length === 0 && <span className="empty-hint">（无手牌）</span>}
              </div>
            </div>
          );
        };

        return (
          <div className="battle-main">
            <div className="board-wrap">
              {/* 1. 敌方玩家区域（棋盘上方）：敌方状态条 + 敌方手牌 */}
              <div className="player-zone enemy-zone">
                <PlayerBar
                  state={state}
                  playerId={topPlayer}
                  isActive={topPlayer === actor}
                  roleLabel="对手 · 上方"
                />
                {renderHandArea(topPlayer)}
              </div>

              {/* 2. 居中三路交锋棋盘 */}
              <div className="board">
                {LANES.map((lane) => (
                  <div key={lane} className="lane">
                    <div className="lane-header">
                      <span className="lane-name">{LANE_LABEL[lane]}</span>
                      <span className="lane-side-badge enemy">敌方战线 (上方)</span>
                    </div>
                    <div className={`half half-top${actor === topPlayer ? ' active-half' : ''}`}>
                      {renderSlot(topPlayer, lane, 'back')}
                      {renderSlot(topPlayer, lane, 'front')}
                    </div>
                    <div className="lane-divider">
                      <span className="divider-line" />
                      <span className="divider-label">⚔️ {LANE_LABEL[lane]}交锋线</span>
                      <span className="divider-line" />
                    </div>
                    <div className={`half half-bottom${actor === bottomPlayer ? ' active-half' : ''}`}>
                      {renderSlot(bottomPlayer, lane, 'front')}
                      {renderSlot(bottomPlayer, lane, 'back')}
                    </div>
                    <div className="lane-footer">
                      <span className="lane-side-badge ally">己方战线 (下方)</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 3. 选定单位与直接使用战术操作条 */}
              {selectedInstance && selectedIsOwnBoardUnit && isActionPhase && !hasPending && canAct && (
                <div className="action-strip">
                  <span className="action-strip-title">{selectedDefinition?.card_name_zh ?? '干员'}</span>
                  <button
                    className="btn"
                    disabled={!selectedUnitActions.canWithdraw}
                    onClick={() => {
                      const action = legal.find(
                        (candidate): candidate is Extract<GameAction, { type: 'withdraw_operator' }> =>
                          candidate.type === 'withdraw_operator' && candidate.card_instance_id === selection,
                      );
                      if (action) dispatch(action);
                    }}
                  >
                    普通撤离
                  </button>
                  <button
                    className="btn"
                    disabled={!selectedUnitActions.canSkillDirect && selectedUnitActions.skillTargets.size === 0}
                    onClick={() => {
                      const direct = legal.find(
                        (candidate): candidate is SkillAction =>
                          candidate.type === 'activate_skill' && candidate.card_instance_id === selection && candidate.target_instance_id === undefined,
                      );
                      if (direct) dispatch(direct);
                    }}
                  >
                    主动技能{selectedUnitActions.skillCost !== null ? `（SP ${selectedUnitActions.skillCost}）` : ''}
                  </button>
                  {!selectedUnitActions.canSkillDirect && selectedUnitActions.skillTargets.size > 0 && (
                    <span className="hint">点击高亮目标发动技能</span>
                  )}
                  {selectedUnitActions.canWithdraw && <span className="hint">普通撤离将按规则退款并进入再部署 CD</span>}
                </div>
              )}

              {selectedInstance && showHandDirectUse && directPlay && canAct && (
                <div className="action-strip">
                  <span className="action-strip-title">{selectedDefinition?.card_name_zh ?? '卡牌'}</span>
                  <button
                    className="btn primary"
                    onClick={() => {
                      const action = selectedPlayActions.find((candidate) => candidate.target_instance_id === undefined);
                      if (action) dispatch(action);
                    }}
                  >
                    直接使用
                  </button>
                  {playTargets.size > 0 && <span className="hint">或点击高亮目标使用</span>}
                </div>
              )}
              {selectedInstance && showHandDirectUse && !directPlay && playTargets.size > 0 && canAct && (
                <div className="action-strip">
                  <span className="action-strip-title">{selectedDefinition?.card_name_zh ?? '卡牌'}</span>
                  <span className="hint">点击高亮目标使用</span>
                </div>
              )}

              {/* 4. 己方玩家专属区域（棋盘下方，紧贴己方战线）：己方手牌 + 己方状态条 */}
              <div className="player-zone ally-zone">
                {renderHandArea(bottomPlayer)}
                <PlayerBar
                  state={state}
                  playerId={bottomPlayer}
                  isActive={bottomPlayer === actor}
                  roleLabel="己方 · 下方"
                />
              </div>
            </div>

            <aside className="log-side">
              <details open className="log-details">
                <summary>战斗日志（{snapshot.logHistory.length}）</summary>
                <LogView history={snapshot.logHistory} />
              </details>
            </aside>
          </div>
        );
      })()}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}


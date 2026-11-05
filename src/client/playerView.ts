import type {
  BasePoints, CardDefinition, CardId, CardInstance, CardInstanceId, CombatLogEvent, Cost, GamePhase, GameState,
  HpValue, LaneId, PaidDeployCost, PlayerId, PlayerState, Position, SpValue, StatusEffect, StatusKind,
} from '../game/types';

/**
 * 阶段 8 核心信息边界：PlayerView 只包含 viewer 自己的私有信息 + 双方公共信息。
 * 绝不出现：对手手牌内容（ID/名称/顺序）、对手牌库顺序、对手弃牌内容、host 的 random_state/seed、引擎内部调试字段。
 * 返回值全部为新构造对象，与 GameState 无共享可变引用（combatLog 也做拷贝）。
 */

export interface PlayerViewStatus {
  readonly kind: StatusKind;
  readonly remainingOwnerTurns: number;
}

export interface PlayerViewUnit {
  readonly cardInstanceId: CardInstanceId;
  readonly ownerId: PlayerId;
  readonly controllerId: PlayerId;
  readonly boardHalf: PlayerId;
  readonly lane: LaneId;
  readonly position: Position;
  readonly cardId: CardId;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly atkModifiers: readonly number[];
  readonly sp: number;
  readonly maxSp: number;
  readonly shield: number;
  readonly statuses: readonly PlayerViewStatus[];
  readonly equipmentIds: readonly CardInstanceId[];
}

export interface PlayerViewFacility {
  readonly instanceId: CardInstanceId;
  readonly cardId: CardId;
  readonly turnStartTriggers: number;
}

export interface PlayerViewSide {
  readonly playerId: PlayerId;
  readonly basePoints: number;
  readonly cost: number;
  readonly handCount?: number;
  readonly deckCount: number;
  readonly discardCount: number;
  readonly fatigueCount: number;
  readonly facilities: readonly PlayerViewFacility[];
}

export interface PlayerViewHandCard {
  readonly instanceId: CardInstanceId;
  readonly cardId: CardId;
}

export interface PlayerViewPendingChoice {
  readonly sourceInstanceId: CardInstanceId;
  readonly amount: number;
}

export interface PlayerView {
  readonly rulesVersion: '0.7';
  readonly stateVersion: number;
  readonly phase: GamePhase;
  readonly turnNumber: number;
  readonly activePlayerId: PlayerId;
  readonly winner: PlayerId | 'draw' | null;
  readonly viewerId: PlayerId;
  readonly mulliganCompleted: Readonly<Record<PlayerId, boolean>>;
  readonly players: Readonly<Record<PlayerId, PlayerViewSide>>;
  /** viewer 自己的手牌（含顺序）。对手手牌只出现在 players[x].deckCount/hand 之外的公共字段中，绝无内容。 */
  readonly hand: readonly PlayerViewHandCard[];
  /** viewer 自己的牌库顺序（DEMO_SCOPE §6.1 允许；UI 通常只显示数量）。 */
  readonly ownDeck: readonly CardInstanceId[];
  readonly ownDiscard: readonly CardInstanceId[];
  readonly units: readonly PlayerViewUnit[];
  readonly combatLog: readonly CombatLogEvent[];
  /** 回合开始支援选择是当前行动玩家的私有决策：仅 viewer 为行动玩家时可见。 */
  readonly pendingEffectChoices: readonly PlayerViewPendingChoice[];
  /** 公共卡池定义（名称/费用等展示数据），不含隐藏信息。 */
  readonly cardDefinitions: Readonly<Record<CardId, CardDefinition>>;
}

export interface PlayerViewOptions {
  /** 传入控制器累积的公开日志历史；缺省使用 state.combat_log（当前战斗的事件）。 */
  readonly logHistory?: readonly CombatLogEvent[];
}

export function toPlayerView(state: GameState, viewerId: PlayerId, options: PlayerViewOptions = {}): PlayerView {
  const viewer = state.players[viewerId];
  if (!viewer) throw new Error(`toPlayerView：未知 viewer ${viewerId}。`);
  const players = {} as Record<PlayerId, PlayerViewSide>;
  for (const playerId of ['player_a', 'player_b'] as const) {
    const player = state.players[playerId];
    players[playerId] = {
      playerId,
      basePoints: player.base_points,
      cost: player.cost,
      handCount: player.hand.length,
      deckCount: player.deck.length,
      discardCount: player.discard.length,
      fatigueCount: player.fatigue_count,
      facilities: player.facility_ids.map((facilityId) => {
        const instance = state.card_instances[facilityId];
        return {
          instanceId: facilityId,
          cardId: instance?.card_id ?? ('' as CardId),
          turnStartTriggers: instance?.support_lifecycle?.turn_start_triggers ?? 0,
        };
      }),
    };
  }
  const units = Object.values(state.card_instances)
    .filter((instance) => instance.zone === 'board' && instance.operator_combat && instance.board_half && instance.lane && instance.position)
    .map((instance) => {
      const combat = instance.operator_combat!;
      const definition = state.card_definitions[instance.card_id];
      return {
        cardInstanceId: instance.card_instance_id,
        ownerId: instance.owner_id,
        controllerId: instance.controller_id,
        boardHalf: instance.board_half as PlayerId,
        lane: instance.lane as LaneId,
        position: instance.position as Position,
        cardId: instance.card_id,
        hp: combat.current_hp,
        maxHp: definition?.hp ?? 0,
        atk: definition?.atk ?? 0,
        atkModifiers: [...combat.current_atk_modifiers],
        sp: combat.current_sp,
        maxSp: definition?.max_sp ?? 5,
        shield: combat.shield,
        statuses: combat.statuses.map((status) => ({ kind: status.kind, remainingOwnerTurns: status.remaining_owner_turns })),
        equipmentIds: [...combat.equipment_ids],
      } satisfies PlayerViewUnit;
    });
  const isActing = state.active_player_id === viewerId;
  return {
    rulesVersion: state.rules_version,
    stateVersion: state.state_version,
    phase: state.phase,
    turnNumber: state.turn_number,
    activePlayerId: state.active_player_id,
    winner: state.winner,
    viewerId,
    mulliganCompleted: { ...state.mulligan_completed },
    players,
    hand: viewer.hand.map((id) => ({ instanceId: id, cardId: state.card_instances[id]?.card_id ?? ('' as CardId) })),
    ownDeck: [...viewer.deck],
    ownDiscard: [...viewer.discard],
    units,
    combatLog: [...(options.logHistory ?? state.combat_log)],
    pendingEffectChoices: isActing
      ? state.pending_effect_choices.map((choice) => ({ sourceInstanceId: choice.source_instance_id, amount: choice.amount }))
      : [],
    cardDefinitions: { ...state.card_definitions },
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPlayerViewSide(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const side = value as Record<string, unknown>;
  return (
    isNonEmptyString(side.playerId) &&
    isNonNegativeInteger(side.basePoints) &&
    isNonNegativeInteger(side.cost) &&
    (side.handCount === undefined || isNonNegativeInteger(side.handCount)) &&
    isNonNegativeInteger(side.deckCount) &&
    isNonNegativeInteger(side.discardCount) &&
    isNonNegativeInteger(side.fatigueCount) &&
    Array.isArray(side.facilities)
  );
}

/** PlayerView 的轻量运行时 schema 校验（结构层面；信息边界由 toPlayerView 构造 + 测试保证）。 */
export function isPlayerView(value: unknown): value is PlayerView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  if (!isNonEmptyString(view.viewerId) || !isNonEmptyString(view.activePlayerId)) return false;
  if (!isNonEmptyString(view.rulesVersion) || typeof view.phase !== 'string') return false;
  if (!isNonNegativeInteger(view.stateVersion) || !isNonNegativeInteger(view.turnNumber)) return false;
  if (!Array.isArray(view.hand) || !Array.isArray(view.units) || !Array.isArray(view.combatLog) || !Array.isArray(view.pendingEffectChoices)) return false;
  if (typeof view.players !== 'object' || view.players === null) return false;
  const players = view.players as Record<string, unknown>;
  if (!isPlayerViewSide(players.player_a) || !isPlayerViewSide(players.player_b)) return false;
  if (typeof view.cardDefinitions !== 'object' || view.cardDefinitions === null) return false;
  return view.winner === null || isNonEmptyString(view.winner);
}

/**
 * 将 PlayerView 转回客户端可渲染与校验合法动作的只读 GameState 投影。
 * 绝不伪造对手手牌内容或 RNG，仅还原公开棋盘与 viewer 本人的手牌/状态。
 */
export function clientStateFromPlayerView(view: PlayerView): GameState {
  const card_instances: Record<string, CardInstance> = {};

  for (const unit of view.units) {
    card_instances[unit.cardInstanceId] = {
      card_instance_id: unit.cardInstanceId,
      card_id: unit.cardId,
      owner_id: unit.ownerId,
      controller_id: unit.controllerId,
      zone: 'board',
      board_half: unit.boardHalf,
      lane: unit.lane,
      position: unit.position,
      operator_lifecycle: {
        redeploy_cd_remaining: 0,
        redeploy_cd_applied_owner_turn_index: null,
        has_deployed_before: true,
        entered_battle_this_owner_turn: false,
        paid_deploy_cost: 0 as PaidDeployCost,
        once_per_game_flags: {},
      },
      operator_combat: {
        current_hp: unit.hp as HpValue,
        current_atk_modifiers: [...unit.atkModifiers],
        current_sp: unit.sp as SpValue,
        shield: unit.shield,
        statuses: unit.statuses.map((status): StatusEffect => ({
          kind: status.kind,
          remaining_owner_turns: status.remainingOwnerTurns,
          applied_on_owner_turn_index: 0,
          blocks_normal_withdrawal: status.kind === 'freeze' || status.kind === 'stun',
        })),
        equipment_ids: [...unit.equipmentIds],
      },
    };
    for (const equipmentId of unit.equipmentIds) {
      if (!card_instances[equipmentId]) {
        card_instances[equipmentId] = {
          card_instance_id: equipmentId,
          card_id: '' as CardId,
          owner_id: unit.ownerId,
          controller_id: unit.controllerId,
          board_half: null,
          lane: null,
          position: null,
          zone: 'support',
        };
      }
    }
  }

  for (const handCard of view.hand) {
    card_instances[handCard.instanceId] = {
      card_instance_id: handCard.instanceId,
      card_id: handCard.cardId,
      owner_id: view.viewerId,
      controller_id: view.viewerId,
      board_half: null,
      lane: null,
      position: null,
      zone: 'hand',
      operator_lifecycle: {
        redeploy_cd_remaining: 0,
        redeploy_cd_applied_owner_turn_index: null,
        has_deployed_before: false,
        entered_battle_this_owner_turn: false,
        paid_deploy_cost: 0 as PaidDeployCost,
        once_per_game_flags: {},
      },
    };
  }

  for (const playerId of ['player_a', 'player_b'] as const) {
    for (const facility of view.players[playerId].facilities) {
      card_instances[facility.instanceId] = {
        card_instance_id: facility.instanceId,
        card_id: facility.cardId,
        owner_id: playerId,
        controller_id: playerId,
        board_half: null,
        lane: null,
        position: null,
        zone: 'support',
        support_lifecycle: {
          turn_start_triggers: facility.turnStartTriggers,
        },
      };
    }
  }

  const buildPlayer = (playerId: PlayerId): PlayerState => {
    const side = view.players[playerId];
    const isViewer = view.viewerId === playerId;
    return {
      player_id: playerId,
      base_points: side.basePoints as BasePoints,
      cost: side.cost as Cost,
      hand: isViewer ? view.hand.map((card) => card.instanceId) : [],
      deck: isViewer ? view.ownDeck : Array.from({ length: side.deckCount }, (_, index) => `__hidden_deck_${playerId}_${index}` as CardInstanceId),
      discard: isViewer ? view.ownDiscard : Array.from({ length: side.discardCount }, (_, index) => `__hidden_discard_${playerId}_${index}` as CardInstanceId),
      fatigue_count: side.fatigueCount,
      turns_taken: 0,
      facility_ids: side.facilities.map((facility) => facility.instanceId),
    };
  };

  return {
    rules_version: view.rulesVersion,
    state_version: view.stateVersion,
    turn_number: view.turnNumber,
    phase: view.phase,
    active_player_id: view.activePlayerId,
    turn_start_prepared: view.phase === 'turn_start',
    random_state: 0,
    players: {
      player_a: buildPlayer('player_a'),
      player_b: buildPlayer('player_b'),
    },
    card_instances,
    card_definitions: { ...view.cardDefinitions },
    mulligan_completed: { ...view.mulliganCompleted },
    combat_log: [...view.combatLog],
    pending_effect_choices: view.pendingEffectChoices.map((choice) => ({
      source_instance_id: choice.sourceInstanceId,
      effect: 'gain_sp' as const,
      amount: choice.amount,
    })),
    winner: view.winner,
  };
}

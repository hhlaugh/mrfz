import type {
  BasePoints, CardDefinition, CardId, CardInstance, CardInstanceId, Cost, DeckDefinition,
  GameAction, GamePhase, GameState, HpValue, OperatorCombatState, OperatorLifecycleState,
  PaidDeployCost, PlayerId, SpValue,
} from './types';
import { normalizeSeed, seededRandomSource, shuffleDeck } from './random';
import type { RandomSource } from './random';
import { applyEffectDamage, applyStatusToInstance, expireOwnerTurnStatuses, grantSp, naturalSpAtTurnStart, resolveCombat } from './combat';

export const OPENING_HAND_SIZE = 5;
export const HAND_LIMIT = 10;
export const STARTING_BASE_POINTS = 20;
export const STARTING_COST = 0;
export const COST_PER_TURN = 3;
export const MAX_COST = 10;
export const MAX_ACTIVE_FACILITIES = 2;
export const MAX_EQUIPMENT_PER_OPERATOR = 1;

const PLAYER_IDS: readonly PlayerId[] = ['player_a', 'player_b'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type EngineResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly value: T; readonly reason: string };

export interface DrawResult {
  readonly state: GameState;
  readonly drawn: readonly CardInstanceId[];
  readonly discardedAtHandLimit: readonly CardInstanceId[];
  readonly fatigueDamage: number;
}

export interface InitialGameOptions {
  readonly decks: Readonly<Record<PlayerId, DeckDefinition>>;
  readonly cards: readonly CardDefinition[];
  readonly seed: number;
  readonly randomSource?: RandomSource;
}

function makeInstanceId(playerId: PlayerId, deckId: string, cardId: CardId, copy: number): CardInstanceId {
  return `${playerId}:${deckId}:${cardId}:${copy}` as CardInstanceId;
}

function setPlayer(state: GameState, playerId: PlayerId, player: GameState['players'][PlayerId]): GameState {
  return { ...state, players: { ...state.players, [playerId]: player } };
}

function setInstances(state: GameState, updates: Readonly<Record<CardInstanceId, CardInstance>>): GameState {
  return { ...state, card_instances: { ...state.card_instances, ...updates } };
}

function evaluateWinner(state: GameState): GameState {
  const aLost = state.players.player_a.base_points <= 0;
  const bLost = state.players.player_b.base_points <= 0;
  if (!aLost && !bLost) return state;
  const winner: GameState['winner'] = aLost && bLost ? 'draw' : aLost ? 'player_b' : 'player_a';
  return { ...state, phase: 'finished', winner, state_version: state.state_version + 1 };
}

function makePlayer(playerId: PlayerId, deck: readonly CardInstanceId[]): GameState['players'][PlayerId] {
  return {
    player_id: playerId,
    base_points: STARTING_BASE_POINTS as BasePoints,
    cost: STARTING_COST as Cost,
    hand: [],
    deck,
    discard: [],
    facility_ids: [],
    fatigue_count: 0,
    turns_taken: 0,
  };
}

function expandDeck(playerId: PlayerId, deck: DeckDefinition, cardsById: ReadonlyMap<CardId, CardDefinition>): CardInstance[] {
  const instances: CardInstance[] = [];
  const copiesByCard = new Map<CardId, number>();
  const copiesByName = new Map<string, number>();
  for (const entry of deck.cards) {
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) throw new RangeError(`牌组 ${deck.deck_id} 中 ${entry.card_id} 的数量必须是正整数。`);
    const definition = cardsById.get(entry.card_id);
    if (!definition) throw new Error(`牌组 ${deck.deck_id} 引用了不存在的卡牌 ${entry.card_id}。`);
    const sameNameTotal = (copiesByName.get(definition.card_name_zh) ?? 0) + entry.quantity;
    if (sameNameTotal > 2) throw new Error(`牌组 ${deck.deck_id} 中同名卡「${definition.card_name_zh}」超过 2 张。`);
    copiesByName.set(definition.card_name_zh, sameNameTotal);
    for (let copy = 0; copy < entry.quantity; copy += 1) {
      const serial = (copiesByCard.get(entry.card_id) ?? 0) + 1;
      copiesByCard.set(entry.card_id, serial);
      const cardInstanceId = makeInstanceId(playerId, deck.deck_id, entry.card_id, serial);
      instances.push({
        card_instance_id: cardInstanceId,
        card_id: entry.card_id,
        owner_id: playerId,
        controller_id: playerId,
        board_half: null,
        lane: null,
        position: null,
        zone: 'deck',
      });
    }
  }
  if (instances.length < OPENING_HAND_SIZE) throw new RangeError(`牌组 ${deck.deck_id} 至少需要 ${OPENING_HAND_SIZE} 张才能发起手牌。`);
  return instances;
}

export function drawCards(state: GameState, playerId: PlayerId, count: number): DrawResult {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('抽牌数量必须是非负整数。');
  const initialPlayer = state.players[playerId];
  if (!initialPlayer) throw new Error(`找不到玩家 ${playerId}。`);
  let player = initialPlayer;
  let nextState = state;
  const drawn: CardInstanceId[] = [];
  const discardedAtHandLimit: CardInstanceId[] = [];
  let fatigueDamage = 0;
  const instanceUpdates: Record<CardInstanceId, CardInstance> = {};

  for (let drawIndex = 0; drawIndex < count; drawIndex += 1) {
    if (player.deck.length === 0) {
      const nextFatigue = player.fatigue_count + 1;
      fatigueDamage += nextFatigue;
      player = {
        ...player,
        base_points: (player.base_points - nextFatigue) as BasePoints,
        fatigue_count: nextFatigue,
      };
      continue;
    }

    const [cardInstanceId, ...remainingDeck] = player.deck;
    if (player.hand.length >= HAND_LIMIT) {
      player = { ...player, deck: remainingDeck, discard: [...player.discard, cardInstanceId] };
      discardedAtHandLimit.push(cardInstanceId);
      const instance = state.card_instances[cardInstanceId];
      if (instance) instanceUpdates[cardInstanceId] = { ...instance, zone: 'discard' };
    } else {
      player = { ...player, deck: remainingDeck, hand: [...player.hand, cardInstanceId] };
      drawn.push(cardInstanceId);
      const instance = state.card_instances[cardInstanceId];
      if (instance) instanceUpdates[cardInstanceId] = { ...instance, zone: 'hand' };
    }
  }

  nextState = setPlayer(nextState, playerId, player);
  if (Object.keys(instanceUpdates).length > 0) nextState = setInstances(nextState, instanceUpdates);
  nextState = evaluateWinner(nextState);
  return { state: nextState, drawn, discardedAtHandLimit, fatigueDamage };
}

export function createInitialGameState(options: InitialGameOptions): GameState {
  const { decks, cards } = options;
  const randomSource = options.randomSource ?? seededRandomSource;
  const seed = normalizeSeed(options.seed);
  const cardsById = new Map<CardId, CardDefinition>();
  for (const card of cards) {
    if (cardsById.has(card.card_id)) throw new Error(`卡牌定义 ID 重复：${card.card_id}。`);
    cardsById.set(card.card_id, card);
  }

  const cardInstances: Record<CardInstanceId, CardInstance> = {};
  const playerDeckIds = {} as Record<PlayerId, CardInstanceId[]>;
  let randomState = seed;
  for (const playerId of PLAYER_IDS) {
    const expanded = expandDeck(playerId, decks[playerId], cardsById);
    for (const instance of expanded) cardInstances[instance.card_instance_id] = instance;
    const shuffled = shuffleDeck(expanded.map((instance) => instance.card_instance_id), randomState, randomSource);
    randomState = shuffled.randomState;
    playerDeckIds[playerId] = shuffled.deck;
  }

  let state: GameState = {
    rules_version: '0.7',
    card_definitions: Object.fromEntries(cardsById) as Record<CardId, CardDefinition>,
    players: {
      player_a: makePlayer('player_a', playerDeckIds.player_a),
      player_b: makePlayer('player_b', playerDeckIds.player_b),
    },
    card_instances: cardInstances,
    mulligan_completed: { player_a: false, player_b: false },
    random_state: randomState,
    active_player_id: 'player_a',
    phase: 'mulligan',
    turn_number: 0,
    state_version: 0,
    winner: null,
    combat_log: [],
    pending_effect_choices: [],
    turn_start_prepared: false,
  };

  for (const playerId of PLAYER_IDS) state = drawCards(state, playerId, OPENING_HAND_SIZE).state;
  return state;
}

export function mulligan(
  state: GameState,
  playerId: PlayerId,
  selectedCardInstanceIds: readonly CardInstanceId[],
  randomSource: RandomSource = seededRandomSource,
): EngineResult<GameState> {
  const player = state.players[playerId];
  if (state.phase !== 'mulligan') return { ok: false, value: state, reason: '当前不在起手换牌阶段。' };
  if (!player) return { ok: false, value: state, reason: `找不到玩家 ${playerId}。` };
  if (state.mulligan_completed[playerId]) return { ok: false, value: state, reason: '该玩家已经完成起手换牌。' };
  if (selectedCardInstanceIds.length > OPENING_HAND_SIZE) return { ok: false, value: state, reason: `最多选择 ${OPENING_HAND_SIZE} 张起手牌。` };
  if (new Set(selectedCardInstanceIds).size !== selectedCardInstanceIds.length) return { ok: false, value: state, reason: '换牌选择中有重复卡实例。' };
  if (selectedCardInstanceIds.some((id) => !player.hand.includes(id))) return { ok: false, value: state, reason: '换牌只能选择自己的起手手牌。' };
  if (player.deck.length < selectedCardInstanceIds.length) return { ok: false, value: state, reason: '牌库剩余张数不足，无法等量补牌。' };

  const selected = new Set(selectedCardInstanceIds);
  const remainingHand = player.hand.filter((id) => !selected.has(id));
  const basePlayer = { ...player, hand: remainingHand };
  let nextState = setPlayer(state, playerId, basePlayer);
  const replacementDraw = drawCards(nextState, playerId, selectedCardInstanceIds.length);
  nextState = replacementDraw.state;
  const updatedPlayer = nextState.players[playerId];
  const shuffled = shuffleDeck([...updatedPlayer.deck, ...selectedCardInstanceIds], nextState.random_state, randomSource);
  const instanceUpdates: Record<CardInstanceId, CardInstance> = {};
  for (const id of selectedCardInstanceIds) {
    const instance = state.card_instances[id];
    if (instance) instanceUpdates[id] = { ...instance, zone: 'deck' };
  }
  nextState = setPlayer(nextState, playerId, { ...updatedPlayer, deck: shuffled.deck });
  nextState = setInstances(nextState, instanceUpdates);
  nextState = {
    ...nextState,
    random_state: shuffled.randomState,
    mulligan_completed: { ...nextState.mulligan_completed, [playerId]: true },
    state_version: nextState.state_version + 1,
  };

  if (PLAYER_IDS.every((id) => nextState.mulligan_completed[id])) {
    const firstPlayerRoll = randomSource(nextState.random_state);
    if (!Number.isFinite(firstPlayerRoll.value) || firstPlayerRoll.value < 0 || firstPlayerRoll.value >= 1 || !Number.isInteger(firstPlayerRoll.state)) {
      return { ok: false, value: state, reason: 'randomSource 返回了无效随机值。' };
    }
    nextState = {
      ...nextState,
      active_player_id: firstPlayerRoll.value < 0.5 ? 'player_a' : 'player_b',
      phase: 'turn_start',
      turn_number: 1,
      random_state: normalizeSeed(firstPlayerRoll.state),
    };
  }
  return { ok: true, value: nextState };
}

function findCardDefinition(state: GameState, cardId: CardId): CardDefinition | undefined {
  return state.card_definitions[cardId];
}

function initialOperatorCombat(definition: CardDefinition): OperatorCombatState {
  return {
    current_hp: definition.hp as HpValue,
    current_atk_modifiers: [],
    current_sp: (definition.starting_sp ?? 0) as SpValue,
    shield: 0,
    statuses: [],
    equipment_ids: [],
  };
}

function hasCardInHand(state: GameState, playerId: PlayerId, cardInstanceId: CardInstanceId): boolean {
  const instance = state.card_instances[cardInstanceId];
  return Boolean(instance && instance.owner_id === playerId && instance.zone === 'hand' && state.players[playerId].hand.includes(cardInstanceId));
}

function boardOperatorAt(state: GameState, playerId: PlayerId, lane: GameState['card_instances'][CardInstanceId]['lane'], position: GameState['card_instances'][CardInstanceId]['position']): boolean {
  return Object.values(state.card_instances).some((instance) =>
    instance.zone === 'board' && instance.controller_id === playerId && instance.board_half === playerId
    && instance.lane === lane && instance.position === position,
  );
}

function deploymentPositionAllowed(definition: CardDefinition, position: 'front' | 'back'): boolean {
  if (definition.floating && position !== 'back') return false;
  // 2026-11-03 规则修订：远程干员默认只能部署后位；特种/特殊技能干员通过卡面 deploy_rule=front_or_back 获得前排资格。
  const rule = definition.deploy_rule ?? (definition.attack_type === 'melee' ? 'front_only' : 'back_only');
  if (rule === 'front_only') return position === 'front';
  if (rule === 'back_only') return position === 'back';
  return true;
}

function validateOnDeployEffects(definition: CardDefinition): { readonly gainCost: number; readonly error?: string } {
  if (definition.effect_trigger !== 'on_deploy') return { gainCost: 0 };
  let gainCost = 0;
  for (const effect of definition.effect_json.actions) {
    if (effect.type !== 'gain_cost' || effect.target !== 'owner' || !Number.isInteger(effect.value) || (effect.value as number) < 0) {
      return { gainCost: 0, error: `on_deploy 效果 ${effect.type} 尚未由阶段 3 reducer 实现。` };
    }
    gainCost += effect.value as number;
  }
  return { gainCost };
}

function deployOperator(state: GameState, actorId: PlayerId, cardInstanceId: CardInstanceId, lane: 'left' | 'center' | 'right', position: 'front' | 'back'): EngineResult<GameState> {
  if (!hasCardInHand(state, actorId, cardInstanceId)) return { ok: false, value: state, reason: '只能部署自己手牌中的卡实例。' };
  if (!['left', 'center', 'right'].includes(lane)) return { ok: false, value: state, reason: '部署路线无效。' };
  if (!['front', 'back'].includes(position)) return { ok: false, value: state, reason: '部署位置无效。' };
  const instance = state.card_instances[cardInstanceId];
  const definition = findCardDefinition(state, instance.card_id);
  if (!definition || definition.card_type !== 'operator') return { ok: false, value: state, reason: '目标卡实例不是有效干员卡。' };
  const lifecycle = instance.operator_lifecycle;
  if (lifecycle && lifecycle.redeploy_cd_remaining > 0) return { ok: false, value: state, reason: `再部署冷却尚未归零：${lifecycle.redeploy_cd_remaining}。` };
  if (!deploymentPositionAllowed(definition, position)) return { ok: false, value: state, reason: '干员不能部署在所选位置。' };
  if (boardOperatorAt(state, actorId, lane, position)) return { ok: false, value: state, reason: '所选部署位已被占用。' };
  const player = state.players[actorId];
  if (player.cost < definition.cost) return { ok: false, value: state, reason: '费用不足。' };
  const onDeploy = validateOnDeployEffects(definition);
  if (onDeploy.error) return { ok: false, value: state, reason: onDeploy.error };

  const nextLifecycle: OperatorLifecycleState = {
    redeploy_cd_remaining: 0,
    redeploy_cd_applied_owner_turn_index: null,
    has_deployed_before: lifecycle?.has_deployed_before ?? false,
    entered_battle_this_owner_turn: true,
    paid_deploy_cost: definition.cost as unknown as PaidDeployCost,
    once_per_game_flags: lifecycle?.once_per_game_flags ?? {},
  };
  const deployed: CardInstance = {
    ...instance,
    zone: 'board',
    board_half: actorId,
    lane,
    position,
    operator_combat: initialOperatorCombat(definition),
    operator_lifecycle: { ...nextLifecycle, has_deployed_before: true },
  };
  const remainingHand = player.hand.filter((id) => id !== cardInstanceId);
  const nextCost = Math.min(MAX_COST, player.cost - definition.cost + onDeploy.gainCost) as Cost;
  const nextPlayer = { ...player, hand: remainingHand, cost: nextCost };
  let nextState = setPlayer(state, actorId, nextPlayer);
  nextState = setInstances(nextState, { [cardInstanceId]: deployed });
  return {
    ok: true,
    value: { ...nextState, state_version: state.state_version + 1 },
  };
}

type WithdrawalMode = {
  readonly ignoreControlRestriction: boolean;
  readonly ignoreHalfRestriction: boolean;
  readonly refundPolicy: 'none' | 'normal_ratio' | 'full_paid_cost';
  readonly cdReduction: number;
};

function validateWithdrawal(state: GameState, actorId: PlayerId, targetId: CardInstanceId, mode: WithdrawalMode): { readonly instance?: CardInstance; readonly definition?: CardDefinition; readonly reason?: string } {
  const instance = state.card_instances[targetId];
  if (!instance || instance.zone !== 'board') return { reason: '撤离目标不在战场上。' };
  const definition = findCardDefinition(state, instance.card_id);
  if (!definition || definition.card_type !== 'operator' || !instance.operator_lifecycle || !instance.operator_combat) return { reason: '撤离目标不是有效的在场干员。' };
  if (instance.controller_id !== actorId) return { reason: '只能撤离当前由自己控制的干员。' };
  if (!mode.ignoreHalfRestriction && instance.board_half !== instance.controller_id) return { reason: '普通撤离要求干员位于控制者自己的半区。' };
  if (!mode.ignoreControlRestriction && instance.operator_combat.statuses.some((status) => status.blocks_normal_withdrawal)) return { reason: '该干员当前受到禁止普通撤离的控制状态。' };
  return { instance, definition };
}

function normalRefundRatio(definition: CardDefinition): number {
  if (definition.normal_withdrawal_refund_ratio !== undefined) return definition.normal_withdrawal_refund_ratio;
  if (definition.cost <= 2) return 0.5;
  if (definition.cost <= 4) return 1 / 3;
  if (definition.cost <= 6) return 0.25;
  return 0.2;
}

function commitWithdrawal(state: GameState, actorId: PlayerId, targetId: CardInstanceId, mode: WithdrawalMode): GameState {
  const instance = state.card_instances[targetId];
  const definition = findCardDefinition(state, instance.card_id) as CardDefinition;
  const lifecycle = instance.operator_lifecycle as OperatorLifecycleState;
  const paid = lifecycle.paid_deploy_cost ?? 0;
  const refund = mode.refundPolicy === 'full_paid_cost'
    ? paid
    : mode.refundPolicy === 'normal_ratio'
      ? Math.floor(paid * normalRefundRatio(definition))
      : 0;
  const baseCd = Math.max(1, definition.redeploy_cd_base ?? 1);
  const cd = Math.max(0, baseCd - mode.cdReduction);
  const nextLifecycle: OperatorLifecycleState = {
    ...lifecycle,
    redeploy_cd_remaining: cd,
    redeploy_cd_applied_owner_turn_index: state.players[actorId].turns_taken,
    paid_deploy_cost: null,
  };
  const returned: CardInstance = {
    ...instance,
    zone: 'hand',
    board_half: null,
    lane: null,
    position: null,
    operator_combat: initialOperatorCombat(definition),
    operator_lifecycle: nextLifecycle,
  };
  const updatedPlayers: Partial<Record<PlayerId, GameState['players'][PlayerId]>> = {};
  let actor = state.players[actorId];
  actor = { ...actor, cost: Math.min(MAX_COST, actor.cost + refund) as Cost };
  updatedPlayers[actorId] = actor;
  const owner = instance.owner_id;
  const returnPlayer = updatedPlayers[owner] ?? state.players[owner];
  updatedPlayers[owner] = { ...returnPlayer, hand: [...returnPlayer.hand, targetId] };

  const instanceUpdates: Record<CardInstanceId, CardInstance> = { [targetId]: returned };
  const equipmentIds = instance.operator_combat?.equipment_ids ?? [];
  for (const equipmentId of equipmentIds) {
    const equipment = state.card_instances[equipmentId];
    if (!equipment) continue;
    instanceUpdates[equipmentId] = { ...equipment, zone: 'discard', board_half: null, lane: null, position: null };
    const equipmentOwner = equipment.owner_id;
    const prior = updatedPlayers[equipmentOwner] ?? state.players[equipmentOwner];
    updatedPlayers[equipmentOwner] = { ...prior, discard: [...prior.discard, equipmentId] };
  }
  return {
    ...state,
    players: { ...state.players, ...updatedPlayers },
    card_instances: { ...state.card_instances, ...instanceUpdates },
  };
}

function withdrawNormally(state: GameState, actorId: PlayerId, targetId: CardInstanceId): EngineResult<GameState> {
  const mode: WithdrawalMode = { ignoreControlRestriction: false, ignoreHalfRestriction: false, refundPolicy: 'normal_ratio', cdReduction: 0 };
  const validation = validateWithdrawal(state, actorId, targetId, mode);
  if (validation.reason) return { ok: false, value: state, reason: validation.reason };
  const nextState = commitWithdrawal(state, actorId, targetId, mode);
  return { ok: true, value: { ...nextState, state_version: state.state_version + 1 } };
}

function discardPlayedCard(state: GameState, actorId: PlayerId, cardInstanceId: CardInstanceId, nextPlayer: GameState['players'][PlayerId]): GameState {
  const instance = state.card_instances[cardInstanceId];
  const owner = instance.owner_id;
  const priorOwner = owner === actorId ? nextPlayer : state.players[owner];
  const ownerState = { ...priorOwner, discard: [...priorOwner.discard, cardInstanceId] };
  return {
    ...state,
    players: { ...state.players, [actorId]: nextPlayer, [owner]: ownerState },
    card_instances: { ...state.card_instances, [cardInstanceId]: { ...instance, zone: 'discard' } },
  };
}

function playRapidWithdrawal(state: GameState, actorId: PlayerId, cardInstanceId: CardInstanceId, targetId?: CardInstanceId): EngineResult<GameState> {
  const cardInstance = state.card_instances[cardInstanceId];
  const definition = findCardDefinition(state, cardInstance.card_id);
  const actions = definition?.effect_json.actions;
  const effect = actions?.length === 1 ? actions[0] : undefined;
  if (!definition || definition.card_type !== 'tactic' || definition.cost !== 0 || definition.effect_trigger !== 'on_play' || !effect || effect.type !== 'withdraw_operator') {
    return { ok: false, value: state, reason: '当前阶段只实现快速撤离战术卡。' };
  }
  if (!targetId) return { ok: false, value: state, reason: '快速撤离必须指定一名己方干员。' };
  if (effect.withdrawal_refund_policy !== 'full_paid_cost') return { ok: false, value: state, reason: '快速撤离必须配置 full_paid_cost 退款策略。' };
  if (!Number.isInteger(effect.redeploy_cd_reduction) || (effect.redeploy_cd_reduction as number) < 0) return { ok: false, value: state, reason: '快速撤离 CD 修正无效。' };
  const mode: WithdrawalMode = {
    ignoreControlRestriction: effect.ignore_control_restriction === true,
    ignoreHalfRestriction: effect.ignore_half_restriction === true,
    refundPolicy: 'full_paid_cost',
    cdReduction: effect.redeploy_cd_reduction as number,
  };
  const validation = validateWithdrawal(state, actorId, targetId, mode);
  if (validation.reason) return { ok: false, value: state, reason: validation.reason };
  const afterWithdrawal = commitWithdrawal(state, actorId, targetId, mode);
  const updatedPlayer = afterWithdrawal.players[actorId];
  const nextPlayer = { ...updatedPlayer, hand: updatedPlayer.hand.filter((id) => id !== cardInstanceId) };
  const withTacticDiscarded = discardPlayedCard(afterWithdrawal, actorId, cardInstanceId, nextPlayer);
  return { ok: true, value: { ...withTacticDiscarded, state_version: state.state_version + 1 } };
}

function playSupport(state: GameState, actorId: PlayerId, cardInstanceId: CardInstanceId, targetId?: CardInstanceId): EngineResult<GameState> {
  const instance = state.card_instances[cardInstanceId];
  const definition = findCardDefinition(state, instance.card_id);
  if (!definition || definition.card_type !== 'support') return { ok: false, value: state, reason: '当前只支持打出支援卡。' };
  const player = state.players[actorId];
  if (player.cost < definition.cost) return { ok: false, value: state, reason: '费用不足。' };

  if (definition.support_subtype === 'facility') {
    if (player.facility_ids.length >= MAX_ACTIVE_FACILITIES) return { ok: false, value: state, reason: `每方最多存在 ${MAX_ACTIVE_FACILITIES} 个设施。` };
    const nextPlayer = {
      ...player,
      cost: (player.cost - definition.cost) as Cost,
      hand: player.hand.filter((id) => id !== cardInstanceId),
      facility_ids: [...player.facility_ids, cardInstanceId],
    };
    const nextState = setPlayer(state, actorId, nextPlayer);
    const withFacility = setInstances(nextState, { [cardInstanceId]: { ...instance, zone: 'support', support_lifecycle: { turn_start_triggers: 0 } } });
    return { ok: true, value: { ...withFacility, state_version: state.state_version + 1 } };
  }

  if (definition.support_subtype !== 'equipment') return { ok: false, value: state, reason: '支援卡缺少有效的 support_subtype。' };
  if (!targetId) return { ok: false, value: state, reason: '装备必须指定一名己方干员。' };
  const target = state.card_instances[targetId];
  const targetDefinition = target ? findCardDefinition(state, target.card_id) : undefined;
  if (!target || target.zone !== 'board' || target.controller_id !== actorId || targetDefinition?.card_type !== 'operator' || !target.operator_combat) {
    return { ok: false, value: state, reason: '装备目标必须是自己控制的在场干员。' };
  }
  if (target.operator_combat.equipment_ids.length >= MAX_EQUIPMENT_PER_OPERATOR) return { ok: false, value: state, reason: `每名干员最多附着 ${MAX_EQUIPMENT_PER_OPERATOR} 件装备。` };
  const attachAction = definition.effect_json.actions.length === 1 && definition.effect_json.actions[0].type === 'attach_equipment'
    ? definition.effect_json.actions[0]
    : undefined;
  const equipmentEffect = attachAction?.equipment_effect;
  if (!attachAction || !isRecord(equipmentEffect) || equipmentEffect.type !== 'gain_shield' || !Number.isInteger(equipmentEffect.value) || (equipmentEffect.value as number) < 0) {
    return { ok: false, value: state, reason: '当前阶段只实现白名单护盾装备效果。' };
  }
  const nextPlayer = { ...player, cost: (player.cost - definition.cost) as Cost, hand: player.hand.filter((id) => id !== cardInstanceId) };
  let nextState = setPlayer(state, actorId, nextPlayer);
  nextState = setInstances(nextState, {
    [cardInstanceId]: { ...instance, zone: 'support' },
    [targetId]: {
      ...target,
      operator_combat: {
        ...target.operator_combat,
        equipment_ids: [...target.operator_combat.equipment_ids, cardInstanceId],
        shield: target.operator_combat.shield + (equipmentEffect.value as number),
      },
    },
  });
  return { ok: true, value: { ...nextState, state_version: state.state_version + 1 } };
}

function playCard(state: GameState, actorId: PlayerId, cardInstanceId: CardInstanceId, targetId?: CardInstanceId): EngineResult<GameState> {
  if (!hasCardInHand(state, actorId, cardInstanceId)) return { ok: false, value: state, reason: '只能使用自己手牌中的卡实例。' };
  const instance = state.card_instances[cardInstanceId];
  const definition = findCardDefinition(state, instance.card_id);
  if (!definition) return { ok: false, value: state, reason: '找不到卡牌定义。' };
  if (definition.card_type === 'support') return playSupport(state, actorId, cardInstanceId, targetId);
  if (definition.card_type === 'tactic') {
    if (state.players[actorId].cost < definition.cost) return { ok: false, value: state, reason: '费用不足。' };
    const onlyAction = definition.effect_json.actions.length === 1 ? definition.effect_json.actions[0] : undefined;
    if (onlyAction?.type === 'withdraw_operator') {
      const rapid = playRapidWithdrawal(state, actorId, cardInstanceId, targetId);
      if (!rapid.ok) return rapid;
      const player = rapid.value.players[actorId];
      return { ok: true, value: setPlayer(rapid.value, actorId, { ...player, cost: (player.cost - definition.cost) as Cost }) };
    }
    if (!onlyAction || !targetId) return { ok: false, value: state, reason: '战术卡必须有一个已实现的白名单效果并指定目标。' };
    const target = state.card_instances[targetId]; const targetDefinition = target ? findCardDefinition(state, target.card_id) : undefined;
    if (!target || target.zone !== 'board' || targetDefinition?.card_type !== 'operator' || !target.operator_combat) return { ok: false, value: state, reason: '战术卡目标必须是在场干员。' };
    if (onlyAction.type === 'damage') {
      if (target.controller_id === actorId || onlyAction.target !== 'chosen_enemy_operator' || (targetDefinition.floating && onlyAction.can_target_floating !== true) || !Number.isInteger(onlyAction.value) || (onlyAction.value as number) < 0) return { ok: false, value: state, reason: '伤害战术目标或效果参数不合法。' };
    } else if (onlyAction.type === 'apply_status') {
      const permitted = onlyAction.target === 'chosen_enemy_operator' || onlyAction.target === 'chosen_floating_enemy';
      if (!permitted || target.controller_id === actorId || !['stun', 'freeze', 'grounded'].includes(String(onlyAction.status)) || !Number.isInteger(onlyAction.duration_owner_turns) || (onlyAction.duration_owner_turns as number) < 1 || (onlyAction.target === 'chosen_floating_enemy' && !targetDefinition.floating) || (onlyAction.status === 'grounded' && !targetDefinition.floating)) return { ok: false, value: state, reason: '状态战术目标或效果参数不合法。' };
    } else if (onlyAction.type === 'heal') {
      if (target.controller_id !== actorId || onlyAction.target !== 'chosen_friendly_operator' || !Number.isInteger(onlyAction.value) || (onlyAction.value as number) < 0 || target.operator_combat.current_hp >= (targetDefinition.hp ?? 0)) return { ok: false, value: state, reason: '治疗目标或效果参数不合法。' };
    } else return { ok: false, value: state, reason: `战术效果 ${onlyAction.type} 尚未实现。` };

    let effected = state;
    if (onlyAction.type === 'damage') effected = applyEffectDamage(effected, cardInstanceId, targetId, onlyAction.value as number);
    if (onlyAction.type === 'apply_status') {
      effected = applyStatusToInstance(effected, targetId, onlyAction.status as import('./types').StatusKind, onlyAction.duration_owner_turns as number);
      const statusTarget = effected.card_instances[targetId];
      if (!statusTarget.operator_combat?.statuses.some(status => status.kind === onlyAction.status)) return { ok: false, value: state, reason: '目标未能获得该状态。' };
    }
    if (onlyAction.type === 'heal') {
      const actual = Math.min(onlyAction.value as number, (targetDefinition.hp ?? 0) - target.operator_combat.current_hp);
      effected = setInstances(effected, { [targetId]: { ...effected.card_instances[targetId], operator_combat: { ...target.operator_combat, current_hp: (target.operator_combat.current_hp + actual) as HpValue } } });
    }
    const afterEffectPlayer = effected.players[actorId];
    const spent = { ...afterEffectPlayer, cost: (afterEffectPlayer.cost - definition.cost) as Cost, hand: afterEffectPlayer.hand.filter(id => id !== cardInstanceId), discard: [...afterEffectPlayer.discard, cardInstanceId] };
    effected = setPlayer(effected, actorId, spent);
    effected = setInstances(effected, { [cardInstanceId]: { ...effected.card_instances[cardInstanceId], zone: 'discard' } });
    return { ok: true, value: { ...effected, state_version: state.state_version + 1 } };
  }
  return { ok: false, value: state, reason: '阶段 3 尚未实现该干员卡的打出效果。' };
}

function activateActiveSkill(state: GameState, actorId: PlayerId, sourceId: CardInstanceId, targetId?: CardInstanceId): EngineResult<GameState> {
  const source = state.card_instances[sourceId];
  const definition = source ? findCardDefinition(state, source.card_id) : undefined;
  if (!source || source.zone !== 'board' || source.controller_id !== actorId || !source.operator_combat || !source.operator_lifecycle || definition?.effect_trigger !== 'active') return { ok: false, value: state, reason: '主动技能来源必须是自己控制的在场干员。' };
  if (source.operator_combat.statuses.some(status => status.kind === 'stun' || status.kind === 'freeze')) return { ok: false, value: state, reason: '眩晕或冰冻中的干员不能发动主动技能。' };
  const cost = definition.active_skill_sp_cost;
  if (typeof cost !== 'number' || source.operator_combat.current_sp < cost) return { ok: false, value: state, reason: '主动技能 SP 不足或未配置。' };
  const action = definition.effect_json.actions.length === 1 ? definition.effect_json.actions[0] : undefined;
  const target = targetId ? state.card_instances[targetId] : undefined;
  const targetDefinition = target ? findCardDefinition(state, target.card_id) : undefined;
  if (!action || action.type !== 'damage' || action.target !== 'chosen_enemy_same_lane' || typeof source.lane !== 'string' || !targetId || !target || target.zone !== 'board' || target.controller_id === actorId || target.lane !== source.lane || targetDefinition?.card_type !== 'operator' || !target.operator_combat || !Number.isInteger(action.value) || (action.value as number) < 0) return { ok: false, value: state, reason: '主动技能目标或白名单效果不合法。' };
  const maxUses = Number(definition.effect_json.uses_per_owner_turn ?? 1);
  const flag = `active_skill_used_turn_${state.players[actorId].turns_taken}`;
  if (source.operator_lifecycle.once_per_game_flags[flag] || !Number.isInteger(maxUses) || maxUses < 1) return { ok: false, value: state, reason: '主动技能本回合使用次数已达上限。' };
  const afterCost = setInstances(state, { [sourceId]: { ...source, operator_combat: { ...source.operator_combat, current_sp: (source.operator_combat.current_sp - cost) as SpValue }, operator_lifecycle: { ...source.operator_lifecycle, once_per_game_flags: { ...source.operator_lifecycle.once_per_game_flags, [flag]: true } } } });
  const afterEffect = applyEffectDamage(afterCost, sourceId, targetId, action.value as number);
  return { ok: true, value: { ...afterEffect, state_version: state.state_version + 1 } };
}

function finishActionPhase(state: GameState): GameState {
  const playerId = state.active_player_id;
  const turnIndex = state.players[playerId].turns_taken;
  const updates: Record<CardInstanceId, CardInstance> = {};
  for (const [instanceId, instance] of Object.entries(state.card_instances) as [CardInstanceId, CardInstance][]) {
    const lifecycle = instance.operator_lifecycle;
    if (instance.controller_id !== playerId || !lifecycle || lifecycle.redeploy_cd_remaining <= 0) continue;
    if (lifecycle.redeploy_cd_applied_owner_turn_index === null || turnIndex <= lifecycle.redeploy_cd_applied_owner_turn_index) continue;
    updates[instanceId] = {
      ...instance,
      operator_lifecycle: { ...lifecycle, redeploy_cd_remaining: lifecycle.redeploy_cd_remaining - 1 },
    };
  }
  return {
    ...state,
    phase: 'combat',
    card_instances: { ...state.card_instances, ...updates },
    state_version: state.state_version + 1,
  };
}

function finishPreparedTurnStart(state: GameState): GameState {
  const playerId = state.active_player_id;
  const withNaturalSp = naturalSpAtTurnStart(state, playerId);
  const checked = evaluateWinner(withNaturalSp);
  return { ...checked, phase: checked.winner ? 'finished' : 'action', turn_start_prepared: false, state_version: checked.state_version + 1 };
}

function resolveTurnStart(state: GameState): GameState {
  const playerId = state.active_player_id;
  const player = state.players[playerId];
  const cost = Math.min(MAX_COST, player.cost + COST_PER_TURN) as Cost;
  const resetFlags: Record<CardInstanceId, CardInstance> = {};
  for (const [instanceId, instance] of Object.entries(state.card_instances) as [CardInstanceId, CardInstance][]) {
    if (instance.controller_id === playerId && instance.operator_lifecycle?.entered_battle_this_owner_turn) {
      resetFlags[instanceId] = { ...instance, operator_lifecycle: { ...instance.operator_lifecycle, entered_battle_this_owner_turn: false } };
    }
  }
  let nextState = setPlayer(state, playerId, { ...player, cost, turns_taken: player.turns_taken + 1 });
  nextState = setInstances(nextState, resetFlags);
  nextState = { ...nextState, phase: 'turn_start', turn_start_prepared: true, state_version: state.state_version + 1 };
  nextState = drawCards(nextState, playerId, 1).state;
  nextState = { ...nextState, phase: 'turn_start', turn_start_prepared: true };
  const pending: GameState['pending_effect_choices'][number][] = [];
  for (const facilityId of nextState.players[playerId].facility_ids) {
    const facility = nextState.card_instances[facilityId];
    const definition = facility ? findCardDefinition(nextState, facility.card_id) : undefined;
    const effect = definition?.effect_json.actions.find(action => action.type === 'choose_friendly_operator_gain_sp');
    const maxTriggers = Number(definition?.effect_json.max_triggers_per_match ?? Number.MAX_SAFE_INTEGER);
    if (!facility || !definition || definition.effect_trigger !== 'turn_start' || !effect || (facility.support_lifecycle?.turn_start_triggers ?? 0) >= maxTriggers) continue;
    const hasTarget = Object.values(nextState.card_instances).some(unit => unit.zone === 'board' && unit.controller_id === playerId && unit.operator_combat && !unit.operator_combat.statuses.some(status => status.kind === 'freeze') && unit.operator_combat.current_sp < (nextState.card_definitions[unit.card_id].max_sp ?? 5));
    if (hasTarget && Number.isInteger(effect.value) && (effect.value as number) > 0) pending.push({ source_instance_id: facilityId, effect: 'gain_sp', amount: effect.value as number });
  }
  nextState = { ...nextState, pending_effect_choices: pending };
  return pending.length > 0 ? nextState : finishPreparedTurnStart(nextState);
}

function resolvePendingChoice(state: GameState, actorId: PlayerId, sourceId: CardInstanceId, targetId?: CardInstanceId): EngineResult<GameState> {
  const pending = state.pending_effect_choices.find(choice => choice.source_instance_id === sourceId);
  const source = state.card_instances[sourceId]; const target = targetId ? state.card_instances[targetId] : undefined;
  if (!pending || !source || source.zone !== 'support' || source.owner_id !== actorId) return { ok: false, value: state, reason: '找不到该玩家待处理的支援效果选择。' };
  const eligible = Object.values(state.card_instances).some(unit => unit.zone === 'board' && unit.controller_id === actorId && unit.operator_combat && !unit.operator_combat.statuses.some(status => status.kind === 'freeze') && unit.operator_combat.current_sp < (state.card_definitions[unit.card_id].max_sp ?? 5));
  if (!targetId) {
    if (eligible) return { ok: false, value: state, reason: '仍有可获得 SP 的干员，必须选择目标。' };
    let skipped: GameState = { ...state, pending_effect_choices: state.pending_effect_choices.filter(choice => choice !== pending), state_version: state.state_version + 1 };
    if (skipped.pending_effect_choices.length === 0) skipped = finishPreparedTurnStart(skipped);
    return { ok: true, value: skipped };
  }
  const targetDefinition = target ? findCardDefinition(state, target.card_id) : undefined;
  if (!target || target.zone !== 'board' || target.controller_id !== actorId || targetDefinition?.card_type !== 'operator' || !target.operator_combat) return { ok: false, value: state, reason: 'SP 支援目标必须是自己控制的在场干员。' };
  if (target.operator_combat.statuses.some(status => status.kind === 'freeze')) return { ok: false, value: state, reason: '被冻结的干员不能获得 SP。' };
  if (target.operator_combat.current_sp >= (targetDefinition.max_sp ?? 5)) return { ok: false, value: state, reason: '目标 SP 已满。' };
  let nextState = grantSp(state, targetId, pending.amount, '技力中继器');
  nextState = setInstances(nextState, { [sourceId]: { ...source, support_lifecycle: { turn_start_triggers: (source.support_lifecycle?.turn_start_triggers ?? 0) + 1 } } });
  nextState = { ...nextState, pending_effect_choices: nextState.pending_effect_choices.filter(choice => choice !== pending), state_version: state.state_version + 1 };
  if (nextState.pending_effect_choices.length === 0) nextState = finishPreparedTurnStart(nextState);
  return { ok: true, value: nextState };
}

export function advancePhase(state: GameState): EngineResult<GameState> {
  if (state.phase === 'finished') return { ok: false, value: state, reason: '对局已经结束。' };
  if (state.phase === 'mulligan') return { ok: false, value: state, reason: '双方完成起手换牌后才能开始回合。' };
  let nextState: GameState;
  switch (state.phase) {
    case 'turn_start':
      if (state.turn_start_prepared) {
        if (state.pending_effect_choices.length > 0) return { ok: false, value: state, reason: '必须先完成回合开始的支援效果选择。' };
        nextState = finishPreparedTurnStart(state);
      } else nextState = resolveTurnStart(state);
      break;
    case 'action':
      nextState = finishActionPhase(state);
      break;
    case 'combat':
      nextState = resolveCombat(state);
      break;
    case 'turn_end': {
      state = expireOwnerTurnStatuses(state, state.active_player_id);
      const nextPlayer: PlayerId = state.active_player_id === 'player_a' ? 'player_b' : 'player_a';
      nextState = {
        ...state,
        active_player_id: nextPlayer,
        phase: 'turn_start',
        turn_number: state.turn_number + 1,
        state_version: state.state_version + 1,
      };
      break;
    }
    default:
      return { ok: false, value: state, reason: `不支持从阶段 ${state.phase as GamePhase} 前进。` };
  }
  return { ok: true, value: nextState };
}

export function reduceGameAction(state: GameState, actorId: PlayerId, action: GameAction): EngineResult<GameState> {
  if (state.phase === 'turn_start' && state.turn_start_prepared) {
    if (actorId !== state.active_player_id) return { ok: false, value: state, reason: '只有当前回合玩家可以处理回合开始选择。' };
    if (action.type !== 'resolve_pending_choice') return { ok: false, value: state, reason: '必须先完成回合开始的支援效果选择。' };
    return resolvePendingChoice(state, actorId, action.source_instance_id, action.target_instance_id);
  }
  if (state.phase !== 'action') return { ok: false, value: state, reason: '只有行动阶段可以提交玩家动作。' };
  if (actorId !== state.active_player_id) return { ok: false, value: state, reason: '当前不是该玩家的行动回合。' };
  switch (action.type) {
    case 'end_action_phase':
      return { ok: true, value: finishActionPhase(state) };
    case 'deploy_operator':
      return deployOperator(state, actorId, action.card_instance_id, action.lane, action.position);
    case 'withdraw_operator':
      return withdrawNormally(state, actorId, action.card_instance_id);
    case 'play_card':
      return playCard(state, actorId, action.card_instance_id, action.target_instance_id);
    case 'activate_skill':
      return activateActiveSkill(state, actorId, action.card_instance_id, action.target_instance_id);
    default:
      return { ok: false, value: state, reason: '未知动作类型。' };
  }
}

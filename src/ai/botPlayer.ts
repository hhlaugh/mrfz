import { enumerateLegalActions } from '../game/legal-actions';
import type { CardDefinition, CardInstanceId, GameAction, GameState, LaneId, PlayerId } from '../game/types';

/**
 * 本地机器人（普通难度启发式评分）。
 *
 * 信息边界（阶段 7 要求）：
 * - 动作候选只来自 enumerateLegalActions（每一步都经过引擎 reduceGameAction 验证），不绕过 validateAction；
 * - 只读取公开/自身状态：自己的手牌、公开棋盘（双方在场单位）、双方基本分/费用/设施/待处理选择；
 * - 不读取对手手牌内容、牌库顺序、random_state；
 * - 评分是启发式估计，不执行任何引擎结算；所有效果由引擎在 dispatch 时计算。
 */

const OTHER_PLAYER: Readonly<Record<PlayerId, PlayerId>> = { player_a: 'player_b', player_b: 'player_a' };

export type BotDifficulty = 'normal';

export interface BotWatchdogOptions {
  /** 单次决策最多评分的动作数（AI 内部安全措施，不是玩家规则限制）。 */
  readonly maxScoredActions?: number;
  /** 每局最多决策次数。 */
  readonly maxDecisionsPerMatch?: number;
  /** 单次决策时间预算（毫秒）。 */
  readonly maxMsPerDecision?: number;
}

export interface BotOptions {
  readonly player: PlayerId;
  readonly difficulty?: BotDifficulty;
  readonly rng?: () => number;
  readonly log?: (message: string) => void;
  readonly watchdog?: BotWatchdogOptions;
}

export interface BotTelemetry {
  readonly decisions: number;
  readonly watchdogStops: number;
  readonly repetitionStops: number;
  readonly fallbacks: number;
}

const DEFAULT_WATCHDOG: Required<BotWatchdogOptions> = {
  maxScoredActions: 800,
  maxDecisionsPerMatch: 3000,
  maxMsPerDecision: 50,
};

interface ScoredAction {
  readonly action: GameAction;
  readonly score: number;
}

function boardUnits(state: GameState) {
  return Object.values(state.card_instances).filter((instance) => instance.zone === 'board' && instance.operator_combat);
}

function hasStatusKind(instance: { operator_combat?: { statuses: readonly { kind: string }[] } }, kind: string): boolean {
  return Boolean(instance.operator_combat?.statuses.some((status) => status.kind === kind));
}

function isDisabled(instance: ReturnType<typeof boardUnits>[number]): boolean {
  return hasStatusKind(instance, 'stun') || hasStatusKind(instance, 'freeze');
}

function effectiveAttack(state: GameState, instance: ReturnType<typeof boardUnits>[number]): number {
  const definition = state.card_definitions[instance.card_id];
  const modifiers = instance.operator_combat?.current_atk_modifiers ?? [];
  return Math.max(0, (definition?.atk ?? 0) + modifiers.reduce((sum, modifier) => sum + modifier, 0));
}

function definitionWorth(definition: CardDefinition): number {
  let worth = (definition.hp ?? 0) * 0.7 + (definition.atk ?? 0) * 1.2;
  if (definition.floating) worth += 0.8;
  if (definition.taunt_scope === 'all_lanes') worth += 1.2;
  else if (definition.taunt_scope === 'same_lane') worth += 0.9;
  if (definition.effect_trigger === 'active' || definition.effect_trigger === 'combat_end' || definition.effect_trigger === 'on_attacked') worth += 0.6;
  return worth;
}

function laneThreat(state: GameState, defender: PlayerId, lane: LaneId): number {
  const attacker = OTHER_PLAYER[defender];
  let threat = 0;
  for (const unit of boardUnits(state)) {
    if (unit.controller_id !== attacker || unit.lane !== lane) continue;
    if (isDisabled(unit)) continue;
    threat = Math.max(threat, effectiveAttack(state, unit));
  }
  return threat;
}

/** 重复状态检测哈希：只含公开/自身信息（对手手牌只计数量）。 */
export function stateHashForRepetition(state: GameState, player: PlayerId): string {
  const parts: string[] = [`t${state.turn_number}`, `a${state.active_player_id}`];
  for (const playerId of ['player_a', 'player_b'] as const) {
    const p = state.players[playerId];
    parts.push(`${playerId}|bp${p.base_points}|c${p.cost}|f${p.fatigue_count}|fac[${p.facility_ids.join(',')}]`);
  }
  parts.push(`hand[${state.players[player].hand.join(',')}]`);
  parts.push(`oppHandN${state.players[OTHER_PLAYER[player]].hand.length}`);
  const units = boardUnits(state)
    .map((unit) =>
      `${unit.card_instance_id}@${unit.board_half}:${unit.lane}:${unit.position}`
      + `|hp${unit.operator_combat?.current_hp}|sp${unit.operator_combat?.current_sp}|sh${unit.operator_combat?.shield}`
      + `|st[${unit.operator_combat?.statuses.map((status) => `${status.kind}:${status.remaining_owner_turns}`).join(',')}]`,
    )
    .sort();
  parts.push(`units[${units.join(';')}]`);
  parts.push(`pend[${state.pending_effect_choices.map((choice) => `${choice.source_instance_id}:${choice.amount}`).join(',')}]`);
  return parts.join('#');
}

function describeAction(action: GameAction): string {
  switch (action.type) {
    case 'deploy_operator':
      return `deploy ${action.card_instance_id} → ${action.lane}/${action.position}`;
    case 'play_card':
      return `play ${action.card_instance_id}${action.target_instance_id ? ` → ${action.target_instance_id}` : ''}`;
    case 'withdraw_operator':
      return `withdraw ${action.card_instance_id}`;
    case 'activate_skill':
      return `skill ${action.card_instance_id}${action.target_instance_id ? ` → ${action.target_instance_id}` : ''}`;
    case 'resolve_pending_choice':
      return `resolve ${action.source_instance_id}${action.target_instance_id ? ` → ${action.target_instance_id}` : ''}`;
    case 'end_action_phase':
      return 'end action phase';
  }
}

export class BotPlayer {
  readonly player: PlayerId;
  readonly difficulty: BotDifficulty;

  private readonly rng: () => number;
  private readonly log?: (message: string) => void;
  private readonly watchdog: Required<BotWatchdogOptions>;
  private readonly memory = new Map<string, number>();
  private readonly memoryOrder: string[] = [];
  private readonly telemetryInternal = { decisions: 0, watchdogStops: 0, repetitionStops: 0, fallbacks: 0 };

  constructor(options: BotOptions) {
    this.player = options.player;
    this.difficulty = options.difficulty ?? 'normal';
    this.rng = options.rng ?? Math.random;
    this.log = options.log;
    this.watchdog = { ...DEFAULT_WATCHDOG, ...options.watchdog };
  }

  getTelemetry(): BotTelemetry {
    return { ...this.telemetryInternal };
  }

  noteFallback(reason: string): void {
    this.telemetryInternal.fallbacks += 1;
    this.log?.(`[bot:${this.player}] 回退动作（${reason}）。`);
  }

  /** 在当前决策点选择一个动作。返回的动作仍必须经 dispatch（引擎 validate）执行。 */
  decide(state: GameState): GameAction {
    this.telemetryInternal.decisions += 1;
    if (this.telemetryInternal.decisions > this.watchdog.maxDecisionsPerMatch) {
      this.telemetryInternal.watchdogStops += 1;
      this.log?.(`[bot:${this.player}] watchdog：本局决策次数超过 ${this.watchdog.maxDecisionsPerMatch}，强制保守动作。`);
      return this.safeFallback(state, 'max-decisions');
    }
    const legal = enumerateLegalActions(state, this.player);
    if (legal.length === 0) throw new Error(`[bot:${this.player}] 决策点没有任何合法动作。`);
    const hash = stateHashForRepetition(state, this.player);
    const seenCount = this.memory.get(hash) ?? 0;
    let candidates = legal;
    let mode = 'normal';
    if (seenCount >= 2) {
      const advancing = legal.filter(
        (action) => action.type === 'deploy_operator' || action.type === 'play_card' || action.type === 'resolve_pending_choice' || action.type === 'end_action_phase',
      );
      if (advancing.length > 0) {
        candidates = advancing;
        mode = 'repetition-guard';
        this.telemetryInternal.repetitionStops += 1;
        this.log?.(`[bot:${this.player}] 重复状态检测：同一局面第 ${seenCount + 1} 次出现，限制为推进型动作。`);
      }
    }
    const scored = this.scoreAll(state, candidates, Date.now() + this.watchdog.maxMsPerDecision);
    scored.sort((a, b) => b.score - a.score);
    this.recordHash(hash);
    const best = scored[0];
    this.log?.(`[bot:${this.player}] turn${state.turn_number} ${mode} → ${describeAction(best.action)} score=${best.score.toFixed(2)} considered=${scored.length}`);
    return best.action;
  }

  private recordHash(hash: string): void {
    this.memory.set(hash, (this.memory.get(hash) ?? 0) + 1);
    this.memoryOrder.push(hash);
    while (this.memoryOrder.length > 32) {
      const oldest = this.memoryOrder.shift() as string;
      const count = (this.memory.get(oldest) ?? 1) - 1;
      if (count <= 0) this.memory.delete(oldest);
      else this.memory.set(oldest, count);
    }
  }

  private safeFallback(state: GameState, reason: string): GameAction {
    this.telemetryInternal.fallbacks += 1;
    const legal = enumerateLegalActions(state, this.player);
    const end = legal.find((action) => action.type === 'end_action_phase');
    if (end) return end;
    const skip = legal.find((action) => action.type === 'resolve_pending_choice' && action.target_instance_id === undefined);
    if (skip) return skip;
    const first = legal[0];
    this.log?.(`[bot:${this.player}] watchdog(${reason})：使用兜底动作 ${describeAction(first)}。`);
    return first;
  }

  private scoreAll(state: GameState, candidates: readonly GameAction[], deadline: number): ScoredAction[] {
    const out: ScoredAction[] = [];
    let scored = 0;
    for (const action of candidates) {
      if (scored >= this.watchdog.maxScoredActions || (scored % 64 === 0 && Date.now() > deadline)) {
        this.telemetryInternal.watchdogStops += 1;
        this.log?.(`[bot:${this.player}] watchdog：单次决策预算用尽（已评分 ${scored} 个动作）。`);
        break;
      }
      out.push({ action, score: this.scoreAction(state, action) + this.rng() * 0.05 });
      scored += 1;
    }
    return out;
  }

  private scoreAction(state: GameState, action: GameAction): number {
    switch (action.type) {
      case 'end_action_phase':
        return 0;
      case 'resolve_pending_choice':
        return this.scorePendingChoice(state, action);
      case 'deploy_operator':
        return this.scoreDeploy(state, action);
      case 'play_card':
        return this.scorePlayCard(state, action);
      case 'withdraw_operator':
        return this.scoreNormalWithdrawal(state, action);
      case 'activate_skill':
        return this.scoreSkill(state, action);
      default:
        return -1;
    }
  }

  private scoreDeploy(state: GameState, action: Extract<GameAction, { type: 'deploy_operator' }>): number {
    const instance = state.card_instances[action.card_instance_id];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    if (!definition) return -1;
    const own = state.players[this.player];
    const enemy = state.players[OTHER_PLAYER[this.player]];
    let score = definitionWorth(definition) - definition.cost * 0.9;
    const ownUnits = boardUnits(state).filter((unit) => unit.controller_id === this.player);
    const enemyUnits = boardUnits(state).filter((unit) => unit.controller_id !== this.player && !isDisabled(unit));
    const ownInLane = ownUnits.filter((unit) => unit.lane === action.lane).length;
    const enemyInLane = enemyUnits.filter((unit) => unit.lane === action.lane).length;
    if (ownInLane === 0) score += 1.0; // 补空路
    if (enemyInLane > 0 && ownInLane === 0) score += 0.9; // 关键受威胁路线
    if (enemyInLane === 0) score += 1.1; // 空路推进
    if (enemy.base_points <= 8 && enemyInLane === 0) score += 0.8; // 斩杀推进
    if (own.base_points <= 8 && enemyInLane > 0) score += 0.8; // 落后时防守优先
    if (definition.attack_type === 'ranged' && action.position === 'back') score += 0.4;
    if (definition.attack_type === 'melee' && action.position === 'front') score += 0.4;
    if (definition.effect_trigger === 'on_deploy') {
      for (const effect of definition.effect_json.actions ?? []) {
        if (effect.type === 'gain_cost' && typeof effect.value === 'number') score += effect.value * 0.45;
      }
    }
    return score;
  }

  private scorePlayCard(state: GameState, action: Extract<GameAction, { type: 'play_card' }>): number {
    const instance = state.card_instances[action.card_instance_id];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    if (!definition) return -1;
    if (definition.card_type === 'support') return this.scoreSupport(state, action, definition);
    const only = definition.effect_json.actions?.length === 1 ? definition.effect_json.actions[0] : undefined;
    if (!only) return -1;
    if (only.type === 'withdraw_operator') return this.scoreRapidWithdrawal(state, action);
    const target = action.target_instance_id ? state.card_instances[action.target_instance_id] : undefined;
    const targetDefinition = target ? state.card_definitions[target.card_id] : undefined;
    if (!target?.operator_combat || !targetDefinition) return -1;
    if (only.type === 'damage' && typeof only.value === 'number') {
      const total = target.operator_combat.current_hp + target.operator_combat.shield;
      const effective = Math.min(only.value, total);
      let score = effective * 0.55 + (targetDefinition.atk ?? 0) * 0.12 - definition.cost * 0.9;
      if (only.value >= total) score += definitionWorth(targetDefinition) * 0.55; // 击杀机会
      return score;
    }
    if (only.type === 'apply_status') {
      const statusKind = String(only.status);
      const isControl = statusKind === 'stun' || statusKind === 'freeze';
      let score = (isControl ? 1.5 : 1.1) + (targetDefinition.atk ?? 0) * 0.18 - definition.cost * 0.9;
      if (isControl && (targetDefinition.atk ?? 0) >= 3) score += 0.5; // 优先控高威胁单位
      return score;
    }
    if (only.type === 'heal' && typeof only.value === 'number') {
      const missing = Math.max(0, (targetDefinition.hp ?? 0) - target.operator_combat.current_hp);
      return Math.min(only.value, missing) * 0.5 - definition.cost * 0.9;
    }
    return -1;
  }

  private scoreSupport(state: GameState, action: Extract<GameAction, { type: 'play_card' }>, definition: CardDefinition): number {
    if (definition.support_subtype === 'facility') return 1.4 - definition.cost * 0.7; // 长期 SP 引擎
    if (definition.support_subtype === 'equipment') {
      const target = action.target_instance_id ? state.card_instances[action.target_instance_id] : undefined;
      if (!target?.operator_combat) return -1;
      const frontBonus = target.position === 'front' ? 0.3 : 0;
      return 0.6 + 0.5 + frontBonus - definition.cost * 0.7;
    }
    return -1;
  }

  private scoreRapidWithdrawal(state: GameState, action: Extract<GameAction, { type: 'play_card' }>): number {
    const target = action.target_instance_id ? state.card_instances[action.target_instance_id] : undefined;
    if (!target?.operator_combat || !target.lane || target.controller_id !== this.player) return -1;
    const targetDefinition = state.card_definitions[target.card_id];
    const dying = laneThreat(state, this.player, target.lane) >= target.operator_combat.current_hp + target.operator_combat.shield;
    const badStatus = target.operator_combat.statuses.some((status) => status.kind === 'stun' || status.kind === 'freeze' || status.kind === 'slow');
    let score = -0.8; // 消耗一张手牌的基准成本
    if (dying) score += definitionWorth(targetDefinition) * 0.5;
    if (badStatus) score += 1.3; // 解控/清除减速价值
    score += 0.2; // 全额退款与 CD-1 的粗略价值
    if (score <= 0.5) return -1; // 只在确有收益时使用
    return score;
  }

  private scoreNormalWithdrawal(state: GameState, action: Extract<GameAction, { type: 'withdraw_operator' }>): number {
    const target = state.card_instances[action.card_instance_id];
    if (!target?.operator_combat || !target.lane || target.controller_id !== this.player) return -1;
    const targetDefinition = state.card_definitions[target.card_id];
    const dying = laneThreat(state, this.player, target.lane) >= target.operator_combat.current_hp + target.operator_combat.shield;
    if (!dying) return -1.5; // 只在确有收益（即将被击杀）时撤离
    return definitionWorth(targetDefinition) * 0.5 + 0.4;
  }

  private scoreSkill(state: GameState, action: Extract<GameAction, { type: 'activate_skill' }>): number {
    const source = state.card_instances[action.card_instance_id];
    const target = action.target_instance_id ? state.card_instances[action.target_instance_id] : undefined;
    if (!source?.operator_combat || !target?.operator_combat) return -1;
    const sourceDefinition = state.card_definitions[source.card_id];
    const targetDefinition = state.card_definitions[target.card_id];
    const spCost = sourceDefinition.active_skill_sp_cost;
    const only = sourceDefinition.effect_json.actions?.length === 1 ? sourceDefinition.effect_json.actions[0] : undefined;
    if (typeof spCost !== 'number' || !only || only.type !== 'damage' || typeof only.value !== 'number') return -1;
    const total = target.operator_combat.current_hp + target.operator_combat.shield;
    const effective = Math.min(only.value, total);
    let score = effective * 0.55 + (targetDefinition.atk ?? 0) * 0.1 - spCost * 0.15;
    if (only.value >= total) score += definitionWorth(targetDefinition) * 0.55; // 击杀机会
    if (effective < 2 && only.value < total) return -1; // 没有价值目标就不发动
    return score;
  }

  private scorePendingChoice(state: GameState, action: Extract<GameAction, { type: 'resolve_pending_choice' }>): number {
    if (!action.target_instance_id) return 0.3; // 没有可用目标时跳过
    const target = state.card_instances[action.target_instance_id];
    const targetDefinition = target ? state.card_definitions[target.card_id] : undefined;
    if (!target?.operator_combat || !targetDefinition) return -1;
    const maxSp = targetDefinition.max_sp ?? 5;
    return 1.6 + (maxSp - target.operator_combat.current_sp) * 0.15 + (target.position === 'front' ? 0.3 : 0);
  }
}

/** 起手换牌策略：只换掉高费非干员卡，其余保留。 */
export function botMulliganChoice(state: GameState, player: PlayerId): readonly CardInstanceId[] {
  const swaps: CardInstanceId[] = [];
  for (const id of state.players[player].hand) {
    const instance = state.card_instances[id];
    const definition = instance ? state.card_definitions[instance.card_id] : undefined;
    if (!definition) continue;
    if (definition.card_type !== 'operator' && definition.cost >= 4) swaps.push(id);
  }
  return swaps;
}

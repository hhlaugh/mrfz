import cardPoolJson from './demo-card-pool.json';
import deckCsv from './demo-decks.csv?raw';
import { CARD_TYPES, EFFECT_ACTION_TYPES, EFFECT_TRIGGERS, STATUS_KINDS } from './card-schema';
import type { CardDefinition, CardId, DeckDefinition } from '../game/types';

export type ValidationSeverity = 'error' | 'warning';
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly recordId?: string;
}
export interface DemoDataLoadResult {
  /** Raw source records are kept intact; invalid records are never silently coerced. */
  readonly cards: readonly unknown[];
  readonly decks: readonly DeckDefinition[];
  readonly issues: readonly ValidationIssue[];
  readonly validCards: readonly CardDefinition[];
}

const DOCUMENTED_TRIGGER_ENUM = new Set<string>([
  ...EFFECT_TRIGGERS,
]);
const allowedStatuses = new Set<string>(STATUS_KINDS);
const allowedActionTypes = new Set<string>(EFFECT_ACTION_TYPES);
const allowedTriggers = new Set<string>(EFFECT_TRIGGERS);
const allowedCardTypes = new Set<string>(CARD_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}
function issue(issues: ValidationIssue[], code: string, message: string, recordId?: string, severity: ValidationSeverity = 'error'): void {
  issues.push({ severity, code, message, ...(recordId ? { recordId } : {}) });
}

function validateEffect(value: unknown, issues: ValidationIssue[], recordId: string, path: string): boolean {
  if (!isRecord(value)) {
    issue(issues, 'INVALID_EFFECT', `${path} 必须是 JSON object。`, recordId);
    return false;
  }
  let valid = true;
  if (value.trigger !== undefined && (typeof value.trigger !== 'string' || !allowedTriggers.has(value.trigger))) {
    issue(issues, 'UNKNOWN_EFFECT_TRIGGER', `${path}.trigger 不在白名单中：${String(value.trigger)}。`, recordId);
    valid = false;
  }
  if (value.actions !== undefined && !Array.isArray(value.actions)) {
    issue(issues, 'INVALID_EFFECT_ACTIONS', `${path}.actions 必须是数组。`, recordId);
    valid = false;
  }
  if (Array.isArray(value.actions)) {
    value.actions.forEach((action, index) => {
      if (!isRecord(action) || typeof action.type !== 'string' || !allowedActionTypes.has(action.type)) {
        issue(issues, 'UNKNOWN_EFFECT_ACTION', `${path}.actions[${index}].type 不在白名单中：${String(isRecord(action) ? action.type : undefined)}。`, recordId);
        valid = false;
        return;
      }
      if (action.status !== undefined && (typeof action.status !== 'string' || !allowedStatuses.has(action.status))) {
        issue(issues, 'UNKNOWN_STATUS', `${path}.actions[${index}].status 未定义：${String(action.status)}。`, recordId);
        valid = false;
      }
      if (action.type === 'withdraw_operator') {
        for (const field of ['ignore_control_restriction', 'ignore_half_restriction', 'reset_combat_state']) {
          if (action[field] !== undefined && typeof action[field] !== 'boolean') {
            issue(issues, 'INVALID_WITHDRAWAL_FLAG', `${path}.actions[${index}].${field} 必须是 boolean。`, recordId);
            valid = false;
          }
        }
        if (action.redeploy_cd_reduction !== undefined && !isIntegerAtLeast(action.redeploy_cd_reduction, 0)) {
          issue(issues, 'INVALID_WITHDRAWAL_CD_REDUCTION', `${path}.actions[${index}].redeploy_cd_reduction 必须是非负整数。`, recordId);
          valid = false;
        }
        if (action.refund !== undefined) {
          issue(issues, 'REFUND_POLICY_FIELD_MISMATCH', '强制撤离退款必须使用 withdrawal_refund_policy 字段；未自动映射旧 refund 字段。', recordId);
          valid = false;
        }
        if (action.withdrawal_refund_policy !== undefined && !['none', 'normal_ratio', 'full_paid_cost', 'fixed'].includes(String(action.withdrawal_refund_policy))) {
          issue(issues, 'INVALID_WITHDRAWAL_REFUND_POLICY', 'withdrawal_refund_policy 必须是 none、normal_ratio、full_paid_cost 或 fixed。', recordId);
          valid = false;
        }
        if (action.withdrawal_refund_policy === 'fixed' && !isIntegerAtLeast(action.refund_amount, 0)) {
          issue(issues, 'INVALID_FIXED_REFUND', 'fixed 退款策略必须提供非负整数 refund_amount。', recordId);
          valid = false;
        }
      }
      if (action.equipment_effect !== undefined) {
        const nested = action.equipment_effect;
        if (!isRecord(nested) || typeof nested.type !== 'string' || !allowedActionTypes.has(nested.type)) {
          issue(issues, 'UNKNOWN_EFFECT_ACTION', `${path}.actions[${index}].equipment_effect.type 不在白名单中。`, recordId);
          valid = false;
        }
      }
      if (action.trigger !== undefined && (typeof action.trigger !== 'string' || !allowedTriggers.has(action.trigger))) {
        issue(issues, 'UNKNOWN_EFFECT_TRIGGER', `${path}.actions[${index}].trigger 不在白名单中。`, recordId);
        valid = false;
      }
    });
  }
  return valid;
}

function validateCardPool(raw: unknown): { issues: ValidationIssue[]; validCards: CardDefinition[] } {
  const issues: ValidationIssue[] = [];
  const validCards: CardDefinition[] = [];
  if (!Array.isArray(raw)) {
    issue(issues, 'INVALID_CARD_POOL', '卡池根节点必须是数组。');
    return { issues, validCards };
  }
  const seenIds = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      issue(issues, 'INVALID_CARD', `cards[${index}] 必须是对象。`);
      continue;
    }
    const before = issues.length;
    const id = typeof entry.card_id === 'string' ? entry.card_id : `cards[${index}]`;
    for (const field of ['card_id', 'card_name_zh']) {
      if (typeof entry[field] !== 'string' || entry[field] === '') issue(issues, 'REQUIRED_FIELD', `${field} 必须是非空字符串。`, id);
    }
    if (typeof entry.card_id === 'string') {
      if (seenIds.has(entry.card_id)) issue(issues, 'DUPLICATE_CARD_ID', `重复 card_id：${entry.card_id}。`, id);
      seenIds.add(entry.card_id);
    }
    if (typeof entry.card_type !== 'string' || !allowedCardTypes.has(entry.card_type)) issue(issues, 'INVALID_CARD_TYPE', `card_type 无效：${String(entry.card_type)}。`, id);
    if (entry.support_subtype !== undefined && !['', 'facility', 'equipment'].includes(String(entry.support_subtype))) issue(issues, 'INVALID_SUPPORT_SUBTYPE', `support_subtype 无效：${String(entry.support_subtype)}。`, id);
    if (!isIntegerAtLeast(entry.rarity, 1) || entry.rarity > 6) issue(issues, 'INVALID_RARITY', 'rarity 必须是 1 到 6 的整数。', id);
    if (!isIntegerAtLeast(entry.cost, 0)) issue(issues, 'INVALID_COST', 'cost 必须是非负整数；不可与 SP 或基地分混用。', id);
    if (typeof entry.effect_trigger !== 'string' || !allowedTriggers.has(entry.effect_trigger)) issue(issues, 'UNKNOWN_EFFECT_TRIGGER', `effect_trigger 不在规则白名单中：${String(entry.effect_trigger)}。`, id);
    const effectValid = validateEffect(entry.effect_json, issues, id, 'effect_json');
    if (isRecord(entry.effect_json) && entry.effect_json.trigger !== undefined && entry.effect_json.trigger !== entry.effect_trigger) {
      issue(issues, 'TRIGGER_MISMATCH', 'effect_json.trigger 必须与 effect_trigger 一致。', id);
    }
    if (entry.card_type === 'operator') {
      for (const field of ['hp', 'atk', 'max_sp', 'starting_sp', 'redeploy_cd_base']) {
        if (!isIntegerAtLeast(entry[field], field === 'hp' ? 1 : 0)) issue(issues, 'OPERATOR_FIELD_REQUIRED', `干员 ${field} 必须是合法非负整数。`, id);
      }
      if (entry.redeploy_cd_base !== undefined && !isIntegerAtLeast(entry.redeploy_cd_base, 1)) issue(issues, 'INVALID_REDEPLOY_CD', 'redeploy_cd_base 必须至少为 1。', id);
      if (typeof entry.starting_sp === 'number' && typeof entry.max_sp === 'number' && entry.starting_sp > entry.max_sp) issue(issues, 'INVALID_STARTING_SP', 'starting_sp 不能超过 max_sp。', id);
      if (typeof entry.class !== 'string' || !['vanguard', 'guard', 'defender', 'sniper', 'caster', 'medic', 'supporter', 'specialist'].includes(entry.class)) issue(issues, 'INVALID_OPERATOR_CLASS', `class 无效：${String(entry.class)}。`, id);
      if (typeof entry.attack_type !== 'string' || !['melee', 'ranged'].includes(entry.attack_type)) issue(issues, 'INVALID_ATTACK_TYPE', `attack_type 无效：${String(entry.attack_type)}。`, id);
      if (typeof entry.deploy_rule !== 'string' || !['front_only', 'front_or_back', 'back_only'].includes(entry.deploy_rule)) issue(issues, 'INVALID_DEPLOY_RULE', `deploy_rule 无效：${String(entry.deploy_rule)}。`, id);
      if (typeof entry.floating !== 'boolean') issue(issues, 'FIELD_NAME_MISMATCH', '干员要求 floating 布尔字段；当前数据使用 movement_type，未自动转换。', id);
      if (entry.taunt_scope !== undefined && !['', 'none', 'same_lane', 'all_lanes'].includes(String(entry.taunt_scope))) issue(issues, 'INVALID_TAUNT_SCOPE', `taunt_scope 无效：${String(entry.taunt_scope)}。`, id);
      if (entry.active_skill_sp_cost !== null && entry.active_skill_sp_cost !== undefined && !isIntegerAtLeast(entry.active_skill_sp_cost, 0)) issue(issues, 'INVALID_ACTIVE_SKILL_SP_COST', 'active_skill_sp_cost 必须是非负整数或 null。', id);
      if (typeof entry.normal_withdrawal_refund_ratio === 'number' && (entry.normal_withdrawal_refund_ratio < 0.2 || entry.normal_withdrawal_refund_ratio > 0.5)) {
        issue(issues, 'INVALID_REFUND_RATIO', 'normal_withdrawal_refund_ratio 必须在 0.20–0.50。', id);
      }
    }
    if (typeof entry.effect_trigger === 'string' && !DOCUMENTED_TRIGGER_ENUM.has(entry.effect_trigger)) {
      issue(issues, 'TRIGGER_ENUM_SPEC_DRIFT', `规则/卡牌数据使用 ${entry.effect_trigger}，未在预定义触发器枚举中列出。`, id, 'warning');
    }
    const hasError = issues.slice(before).some((item) => item.severity === 'error');
    if (!hasError && effectValid) validCards.push(entry as unknown as CardDefinition);
  }
  return { issues, validCards };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"' && quoted && line[i + 1] === '"') { current += '"'; i += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(current); current = ''; }
    else current += character;
  }
  cells.push(current);
  return cells;
}

function parseDeckCsv(csv: string, cardRecords: readonly unknown[]): { decks: DeckDefinition[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const header = rows.shift() ?? [];
  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  const grouped = new Map<string, { name: string; cards: Map<string, number> }>();
  const knownCards = new Map<string, string>();
  for (const card of cardRecords) if (isRecord(card) && typeof card.card_id === 'string' && typeof card.card_name_zh === 'string') knownCards.set(card.card_id, card.card_name_zh);
  for (const row of rows) {
    const deckId = row[columns.deck_id] ?? '';
    const deckName = row[columns.deck_name_zh] ?? '';
    const cardId = row[columns.card_id] ?? '';
    const quantity = Number(row[columns.quantity]);
    if (!deckId || !cardId || !Number.isInteger(quantity) || quantity < 1) {
      issue(issues, 'INVALID_DECK_ROW', `牌组 CSV 行无效：${row.join(',')}`);
      continue;
    }
    if (!knownCards.has(cardId)) issue(issues, 'UNKNOWN_DECK_CARD', `牌组 ${deckId} 引用了不存在的卡牌 ${cardId}。`, deckId);
    const deck = grouped.get(deckId) ?? { name: deckName, cards: new Map<string, number>() };
    if (deck.cards.has(cardId)) issue(issues, 'DUPLICATE_DECK_ROW', `牌组 ${deckId} 中卡牌 ${cardId} 出现多行。`, deckId);
    deck.cards.set(cardId, (deck.cards.get(cardId) ?? 0) + quantity);
    grouped.set(deckId, deck);
  }
  const decks: DeckDefinition[] = [];
  for (const [deckId, deck] of grouped) {
    let total = 0;
    const nameCopies = new Map<string, number>();
    for (const [cardId, quantity] of deck.cards) {
      total += quantity;
      if (quantity > 2) issue(issues, 'COPY_LIMIT_EXCEEDED', `牌组 ${deckId} 中 ${cardId} 数量为 ${quantity}，同名上限为 2。`, deckId);
      const name = knownCards.get(cardId) ?? cardId;
      nameCopies.set(name, (nameCopies.get(name) ?? 0) + quantity);
      if ((nameCopies.get(name) ?? 0) > 2) issue(issues, 'COPY_LIMIT_EXCEEDED', `牌组 ${deckId} 中同名卡「${name}」超过 2 张。`, deckId);
    }
    if (total !== 20) issue(issues, 'INVALID_DECK_SIZE', `牌组 ${deckId} 共 ${total} 张，应为 20 张。`, deckId);
    decks.push({ deck_id: deckId, deck_name_zh: deck.name, cards: [...deck.cards].map(([card_id, quantity]) => ({ card_id: card_id as CardId, quantity })) });
  }
  return { decks, issues };
}

export function loadDemoData(cardRecords: unknown = cardPoolJson, csv: string = deckCsv): DemoDataLoadResult {
  const cardResult = validateCardPool(cardRecords);
  const deckResult = parseDeckCsv(csv, Array.isArray(cardRecords) ? cardRecords : []);
  return {
    cards: Array.isArray(cardRecords) ? cardRecords : [],
    decks: deckResult.decks,
    issues: [...cardResult.issues, ...deckResult.issues],
    validCards: cardResult.validCards,
  };
}

export function summarizeValidation(issues: readonly ValidationIssue[]): { errors: number; warnings: number } {
  return issues.reduce((summary, item) => {
    summary[item.severity === 'error' ? 'errors' : 'warnings'] += 1;
    return summary;
  }, { errors: 0, warnings: 0 });
}

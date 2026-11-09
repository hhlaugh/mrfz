import { loadDemoData } from '../data/load-demo-data';
import type { CardDefinition, CardId, DeckDefinition, LaneId, PlayerId } from '../game/types';

/** UI 侧使用的卡牌定义视图：在引擎类型上补充数据里实际存在、但引擎类型未声明的展示字段。 */
export type UiCardDefinition = CardDefinition & {
  readonly rules_text_zh?: string;
  readonly active_skill_text_zh?: string;
  readonly synergy_tags?: string;
};

const loaded = loadDemoData();
const errors = loaded.issues.filter((issue) => issue.severity === 'error');
if (errors.length > 0) throw new Error(`Demo 数据校验失败：${errors.map((issue) => `${issue.code} ${issue.message}`).join('；')}`);

export const DEMO_CARDS: readonly CardDefinition[] = loaded.validCards;
export const DEMO_DECKS: readonly DeckDefinition[] = loaded.decks;

export const PRESET_DECKS: readonly DeckDefinition[] = [
  ...DEMO_DECKS,
  {
    deck_id: 'DECK-ASSAULT',
    deck_name_zh: '突击先锋组（德克萨斯/风笛/银灰）',
    cards: [
      { card_id: 'OP-VAN-006' as CardId, quantity: 2 },
      { card_id: 'OP-VAN-005' as CardId, quantity: 2 },
      { card_id: 'OP-VAN-009' as CardId, quantity: 2 },
      { card_id: 'OP-GUA-005' as CardId, quantity: 2 },
      { card_id: 'OP-GUA-007' as CardId, quantity: 2 },
      { card_id: 'OP-SNI-001' as CardId, quantity: 2 },
      { card_id: 'OP-SNI-008' as CardId, quantity: 2 },
      { card_id: 'OP-MED-008' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-001' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-005' as CardId, quantity: 2 },
    ],
  },
  {
    deck_id: 'DECK-CONTROL',
    deck_name_zh: '天灾信使控场组（艾雅法拉/伊芙利特/初雪）',
    cards: [
      { card_id: 'OP-VAN-007' as CardId, quantity: 2 },
      { card_id: 'OP-CAS-008' as CardId, quantity: 2 },
      { card_id: 'OP-CAS-009' as CardId, quantity: 2 },
      { card_id: 'OP-SNI-006' as CardId, quantity: 2 },
      { card_id: 'OP-SUP-005' as CardId, quantity: 2 },
      { card_id: 'OP-DEF-003' as CardId, quantity: 2 },
      { card_id: 'OP-MED-001' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-002' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-003' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-004' as CardId, quantity: 2 },
    ],
  },
  {
    deck_id: 'DECK-DEFENSE',
    deck_name_zh: '重装磐石防卫组（塞雷娅/星熊/夜莺）',
    cards: [
      { card_id: 'OP-VAN-003' as CardId, quantity: 2 },
      { card_id: 'OP-DEF-006' as CardId, quantity: 2 },
      { card_id: 'OP-DEF-008' as CardId, quantity: 2 },
      { card_id: 'OP-DEF-009' as CardId, quantity: 2 },
      { card_id: 'OP-MED-009' as CardId, quantity: 2 },
      { card_id: 'OP-MED-007' as CardId, quantity: 2 },
      { card_id: 'OP-SNI-009' as CardId, quantity: 2 },
      { card_id: 'OP-CAS-006' as CardId, quantity: 2 },
      { card_id: 'DEMO-SUP-001' as CardId, quantity: 2 },
      { card_id: 'DEMO-TAC-006' as CardId, quantity: 2 },
    ],
  },
];

export const CARD_BY_ID: ReadonlyMap<CardId, UiCardDefinition> = new Map(
  DEMO_CARDS.map((card) => [card.card_id, card as UiCardDefinition]),
);

export const PLAYER_LABEL: Readonly<Record<PlayerId, string>> = { player_a: '玩家 A', player_b: '玩家 B' };
export const LANE_LABEL: Readonly<Record<LaneId, string>> = { left: '左路', center: '中路', right: '右路' };
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  stun: '眩晕', freeze: '冻结', grounded: '落地', slow: '减速', taunt: '嘲讽', silence: '沉默',
};

export const CLASS_LABEL: Readonly<Record<string, string>> = {
  vanguard: '先锋',
  guard: '近卫',
  defender: '重装',
  sniper: '狙击',
  caster: '术师',
  medic: '医疗',
  supporter: '辅助',
  specialist: '特种',
  tactic: '战术',
  support: '支援',
};

export const CLASS_COLOR: Readonly<Record<string, string>> = {
  vanguard: '#10b981', // emerald
  guard: '#f97316',    // orange
  defender: '#3b82f6', // blue
  sniper: '#06b6d4',   // cyan
  caster: '#8b5cf6',   // violet
  medic: '#14b8a6',    // teal
  supporter: '#eab308',// yellow/gold
  specialist: '#ec4899',// pink
  tactic: '#a855f7',   // purple
  support: '#64748b',  // slate
};

const CUSTOM_DECKS_STORAGE_KEY = 'mrfz_custom_decks';

let inMemoryCustomDecks: DeckDefinition[] = [];

export function getCustomDecks(): DeckDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DECKS_STORAGE_KEY);
    if (!raw) return inMemoryCustomDecks;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DeckDefinition[];
  } catch {
    // fallback if localStorage not accessible
  }
  return inMemoryCustomDecks;
}

export function saveCustomDeck(deck: DeckDefinition): void {
  const current = getCustomDecks();
  const existingIndex = current.findIndex((d) => d.deck_id === deck.deck_id);
  let updated: DeckDefinition[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = deck;
  } else {
    updated = [deck, ...current];
  }
  inMemoryCustomDecks = updated;
  try {
    localStorage.setItem(CUSTOM_DECKS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore quota/security errors
  }
}

export function deleteCustomDeck(deckId: string): void {
  const current = getCustomDecks().filter((d) => d.deck_id !== deckId);
  inMemoryCustomDecks = current;
  try {
    localStorage.setItem(CUSTOM_DECKS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function getAllAvailableDecks(): readonly DeckDefinition[] {
  const custom = getCustomDecks();
  return [...custom, ...PRESET_DECKS];
}

export interface DeckValidationResult {
  readonly valid: boolean;
  readonly totalCards: number;
  readonly uniqueCards: number;
  readonly errors: string[];
  readonly warnings: string[];
}

export function validateDeck(deck: DeckDefinition, cardPool: readonly CardDefinition[] = DEMO_CARDS): DeckValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const poolMap = new Map(cardPool.map((c) => [c.card_id, c]));

  let totalCards = 0;
  const nameCounts = new Map<string, number>();

  for (const item of deck.cards) {
    totalCards += item.quantity;
    const def = poolMap.get(item.card_id);
    if (!def) {
      errors.push(`卡牌 ${item.card_id} 不在当前可用卡池中。`);
      continue;
    }
    if (item.quantity > 2) {
      errors.push(`卡牌「${def.card_name_zh}」超出单卡上限（最多 2 张，当前 ${item.quantity} 张）。`);
    }
    const currentNameCount = (nameCounts.get(def.card_name_zh) ?? 0) + item.quantity;
    nameCounts.set(def.card_name_zh, currentNameCount);
    if (currentNameCount > 2) {
      errors.push(`同名干员「${def.card_name_zh}」总数超出上限（最多 2 张，当前 ${currentNameCount} 张）。`);
    }
  }

  if (totalCards !== 20) {
    errors.push(`卡组必须恰好包含 20 张卡牌（当前 ${totalCards}/20）。`);
  }

  return {
    valid: errors.length === 0,
    totalCards,
    uniqueCards: deck.cards.length,
    errors,
    warnings,
  };
}

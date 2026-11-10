import { CARD_PRESENTATION_MAP, getCardPresentation } from './card-presentation';
import cardPoolJson from './demo-card-pool.json';
import { loadDemoData } from './load-demo-data';
import type { CardId } from '../game/types';

export interface AssetValidationIssue {
  readonly cardId: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
}

export interface AssetValidationReport {
  readonly totalCardsInPool: number;
  readonly totalMappedPresentations: number;
  readonly unmappedCardIds: readonly string[];
  readonly missingAssetCardIds: readonly string[];
  readonly issues: readonly AssetValidationIssue[];
  readonly isValid: boolean;
}

/**
 * 校验卡牌表现层映射 (Card Presentation Manifest) 的完整性与一致性
 */
export function validateCardPresentationIntegrity(): AssetValidationReport {
  const issues: AssetValidationIssue[] = [];
  const cardIdsInPool = new Set<string>();

  for (const rawCard of cardPoolJson as Array<{ card_id?: unknown; name_zh?: unknown }>) {
    if (typeof rawCard.card_id === 'string') {
      cardIdsInPool.add(rawCard.card_id);
    }
  }

  const unmappedCardIds: string[] = [];
  const missingAssetCardIds: string[] = [];

  for (const id of cardIdsInPool) {
    const cardId = id as CardId;
    const presentation = CARD_PRESENTATION_MAP.get(cardId);
    if (!presentation) {
      unmappedCardIds.push(id);
      issues.push({
        cardId: id,
        severity: 'error',
        code: 'MISSING_PRESENTATION_ENTRY',
        message: `卡牌 ${id} 在 CARD_PRESENTATION_MAP 中缺少显式登记项。`,
      });
      continue;
    }

    if (!presentation.operatorId) {
      issues.push({
        cardId: id,
        severity: 'error',
        code: 'MISSING_OPERATOR_ID',
        message: `卡牌 ${id} 缺少 operatorId 映射。`,
      });
    }

    if (!presentation.assets.portrait || !presentation.assets.avatar) {
      missingAssetCardIds.push(id);
      issues.push({
        cardId: id,
        severity: 'warning',
        code: 'EMPTY_ASSET_PATH',
        message: `卡牌 ${id} 未指定完整的 portrait 或 avatar 资源路径。`,
      });
    }
  }

  return {
    totalCardsInPool: cardIdsInPool.size,
    totalMappedPresentations: CARD_PRESENTATION_MAP.size,
    unmappedCardIds,
    missingAssetCardIds,
    issues,
    isValid: issues.filter((i) => i.severity === 'error').length === 0,
  };
}

export interface DataContractBaselineReport {
  readonly cardCount: number;
  readonly uniqueCardIds: boolean;
  readonly presetDeckCount: number;
  readonly deckCardsCountValid: boolean;
  readonly issues: readonly string[];
  readonly passed: boolean;
}

/**
 * 校验 Phase 0.5 数据契约基线
 */
export function verifyDataContractBaseline(): DataContractBaselineReport {
  const issues: string[] = [];
  const demoResult = loadDemoData();

  if (demoResult.validCards.length !== 88) {
    issues.push(`期望 88 张有效卡牌，实际加载到 ${demoResult.validCards.length} 张。`);
  }

  const idSet = new Set<string>();
  for (const card of demoResult.validCards) {
    if (idSet.has(card.card_id)) {
      issues.push(`检测到重复的 Card ID: ${card.card_id}`);
    }
    idSet.add(card.card_id);
  }

  for (const deck of demoResult.decks) {
    const totalCount = deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
    if (totalCount !== 20) {
      issues.push(`预设卡组 ${deck.deck_id} (${deck.deck_name_zh}) 卡牌总数为 ${totalCount}，非标准 20 张。`);
    }
  }

  // 验证每个有效卡牌均能安全获取 CardPresentation，且 fallback 机制完好
  for (const card of demoResult.validCards) {
    const p = getCardPresentation(card.card_id);
    if (!p || !p.operatorId || !p.codeNameZh) {
      issues.push(`卡牌 ${card.card_id} 无法生成有效的 Presentation 或 Fallback。`);
    }
  }

  return {
    cardCount: demoResult.validCards.length,
    uniqueCardIds: idSet.size === demoResult.validCards.length,
    presetDeckCount: demoResult.decks.length,
    deckCardsCountValid: issues.length === 0,
    issues,
    passed: issues.length === 0,
  };
}

import { describe, it, expect } from 'vitest';
import { validateCardPresentationIntegrity, verifyDataContractBaseline } from './validate-card-assets';
import { CARD_PRESENTATION_MAP, getCardPresentation } from './card-presentation';
import cardPoolJson from './demo-card-pool.json';
import type { CardId } from '../game/types';

describe('Phase 0.5: 最低限度数据层与表现层契约校验', () => {
  it('所有 88 张卡牌均已在 CARD_PRESENTATION_MAP 建立表现映射', () => {
    const report = validateCardPresentationIntegrity();
    expect(report.totalCardsInPool).toBe(88);
    expect(report.unmappedCardIds).toHaveLength(0);
    expect(report.isValid).toBe(true);
  });

  it('验证 Card ID 稳定性与唯一性，预设卡组均为 20 张', () => {
    const baseline = verifyDataContractBaseline();
    expect(baseline.cardCount).toBe(88);
    expect(baseline.uniqueCardIds).toBe(true);
    expect(baseline.presetDeckCount).toBeGreaterThanOrEqual(2);
    expect(baseline.deckCardsCountValid).toBe(true);
    expect(baseline.passed).toBe(true);
  });

  it('未登记或动态 Card ID 可通过 getCardPresentation 获得完备 fallback', () => {
    const fallback = getCardPresentation('UNKNOWN-CARD-999' as CardId);
    expect(fallback).toBeDefined();
    expect(fallback.cardId).toBe('UNKNOWN-CARD-999');
    expect(fallback.operatorId).toContain('unknown');
    expect(fallback.assets.portrait).toBeDefined();
    expect(fallback.assets.avatar).toBeDefined();
  });

  it('规则层字段与展示层字段解耦，CardDefinition 不含 presentation 冗余', () => {
    // 检查 pool 中每张卡牌，确认无 presentation / display 混入规则 json
    for (const rawCard of cardPoolJson as Array<Record<string, unknown>>) {
      expect(rawCard).not.toHaveProperty('portrait');
      expect(rawCard).not.toHaveProperty('avatar');
      expect(rawCard).not.toHaveProperty('alternatePortraits');
      expect(rawCard).not.toHaveProperty('portraitFit');
    }
  });
});

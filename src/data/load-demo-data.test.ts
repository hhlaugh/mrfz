import { describe, expect, it } from 'vitest';
import { loadDemoData, summarizeValidation } from './load-demo-data';

describe('loadDemoData', () => {
  it('loads all source cards and two complete preset decks without changing source records', () => {
    const result = loadDemoData();
    expect(result.cards).toHaveLength(88);
    expect(result.decks).toHaveLength(2);
    expect(result.decks.map((deck) => deck.cards.reduce((sum, item) => sum + item.quantity, 0))).toEqual([20, 20]);
    expect(result.issues.some((item) => item.code === 'UNKNOWN_EFFECT_ACTION' || item.code === 'UNKNOWN_EFFECT_TRIGGER')).toBe(false);
  });

  it('accepts corrected fields and keeps rapid withdrawal exemptions explicit', () => {
    const result = loadDemoData();
    expect(result.issues).toEqual([]);
    expect(result.validCards).toHaveLength(88);
    const rapid = result.validCards.find((card) => card.card_id === 'DEMO-TAC-005');
    expect(rapid?.effect_json.actions[0]).toMatchObject({
      ignore_control_restriction: true,
      ignore_half_restriction: true,
      withdrawal_refund_policy: 'full_paid_cost',
    });
  });

  it('validates data whitelist values and deck references, size, and copy limits', () => {
    const badCards = [
      { card_id: 'BAD', card_name_zh: '坏卡', card_type: 'operator', rarity: 1, cost: 0,
        effect_trigger: 'execute_js', effect_json: { trigger: 'execute_js', actions: [{ type: 'run_code' }] } },
    ];
    const badCsv = [
      'deck_id,deck_name_zh,card_id,card_name_zh,quantity,total_deck_size,notes',
      'BAD-DECK,坏牌组,NO-SUCH-CARD,不存在,3,20,test',
    ].join('\n');
    const result = loadDemoData(badCards, badCsv);
    const codes = result.issues.map((item) => item.code);
    expect(codes).toContain('UNKNOWN_EFFECT_TRIGGER');
    expect(codes).toContain('UNKNOWN_EFFECT_ACTION');
    expect(codes).toContain('UNKNOWN_DECK_CARD');
    expect(codes).toContain('COPY_LIMIT_EXCEEDED');
    expect(codes).toContain('INVALID_DECK_SIZE');
  });

  it('rejects duplicate card IDs and confirms rapid withdrawal keeps both v0.7 exemptions explicit', () => {
    const duplicate = [...loadDemoData().cards];
    const firstCardId = (duplicate[0] as { card_id: string }).card_id;
    duplicate.push(duplicate[0]);
    const result = loadDemoData(duplicate);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_CARD_ID', recordId: firstCardId }));

    const rapid = result.cards.find((card) => typeof card === 'object' && card !== null && 'card_id' in card && card.card_id === 'DEMO-TAC-005') as {
      effect_json: { actions: Array<Record<string, unknown>> };
    };
    expect(rapid.effect_json.actions[0]).toMatchObject({ ignore_control_restriction: true, ignore_half_restriction: true });
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'REFUND_POLICY_FIELD_MISMATCH', recordId: 'DEMO-TAC-005' }));
  });

  it('reports a clean card pool after aligning fields with the v0.7 data contract', () => {
    const result = loadDemoData();
    expect(summarizeValidation(result.issues)).toEqual({ errors: 0, warnings: 0 });
  });
});

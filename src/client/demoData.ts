import { loadDemoData } from '../data/load-demo-data';
import type { CardDefinition, CardId, DeckDefinition, LaneId, PlayerId } from '../game/types';

/** UI 侧使用的卡牌定义视图：在引擎类型上补充数据里实际存在、但引擎类型未声明的展示字段。 */
export type UiCardDefinition = CardDefinition & {
  readonly rules_text_zh?: string;
  readonly active_skill_text_zh?: string;
};

const loaded = loadDemoData();
const errors = loaded.issues.filter((issue) => issue.severity === 'error');
if (errors.length > 0) throw new Error(`Demo 数据校验失败：${errors.map((issue) => `${issue.code} ${issue.message}`).join('；')}`);

export const DEMO_CARDS: readonly CardDefinition[] = loaded.validCards;
export const DEMO_DECKS: readonly DeckDefinition[] = loaded.decks;

export const CARD_BY_ID: ReadonlyMap<CardId, UiCardDefinition> = new Map(
  DEMO_CARDS.map((card) => [card.card_id, card as UiCardDefinition]),
);

export const PLAYER_LABEL: Readonly<Record<PlayerId, string>> = { player_a: '玩家 A', player_b: '玩家 B' };
export const LANE_LABEL: Readonly<Record<LaneId, string>> = { left: '左路', center: '中路', right: '右路' };
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  stun: '眩晕', freeze: '冻结', grounded: '落地', slow: '减速', taunt: '嘲讽',
};

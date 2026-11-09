import { useMemo, useState } from 'react';
import { CARD_BY_ID, DEMO_CARDS, getAllAvailableDecks, PLAYER_LABEL } from '../client/demoData';
import type { LocalGameSetup } from '../client/localGameController';
import type { DeckDefinition, PlayerId } from '../game/types';

interface DeckSelectViewProps {
  readonly mode: 'hotseat' | 'vs-bot';
  readonly onStart: (setup: LocalGameSetup) => void;
  readonly onCancel: () => void;
  readonly onOpenDeckEditor?: () => void;
}

function deckComposition(deck: DeckDefinition): string {
  return deck.cards
    .map((entry) => `${CARD_BY_ID.get(entry.card_id)?.card_name_zh ?? entry.card_id}×${entry.quantity}`)
    .join('、');
}

export function DeckSelectView({ mode, onStart, onCancel, onOpenDeckEditor }: DeckSelectViewProps) {
  const availableDecks = useMemo(() => getAllAvailableDecks(), []);

  const [deckIds, setDeckIds] = useState<Record<PlayerId, string>>({
    player_a: availableDecks[0]?.deck_id ?? '',
    player_b: availableDecks[1]?.deck_id ?? availableDecks[0]?.deck_id ?? '',
  });
  const [seedText, setSeedText] = useState('');

  const start = () => {
    const deckA = availableDecks.find((deck) => deck.deck_id === deckIds.player_a);
    const deckB = availableDecks.find((deck) => deck.deck_id === deckIds.player_b);
    if (!deckA || !deckB) return;
    const parsed = Number.parseInt(seedText, 10);
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 2 ** 31);
    onStart({ decks: { player_a: deckA, player_b: deckB }, cards: DEMO_CARDS, seed });
  };

  const renderColumn = (playerId: PlayerId) => (
    <div className="deck-column">
      <h2>{PLAYER_LABEL[playerId]} 牌组</h2>
      {availableDecks.map((deck) => (
        <label key={deck.deck_id} className={`deck-option${deckIds[playerId] === deck.deck_id ? ' selected' : ''}`}>
          <input
            type="radio"
            name={`deck-${playerId}`}
            checked={deckIds[playerId] === deck.deck_id}
            onChange={() => setDeckIds((prev) => ({ ...prev, [playerId]: deck.deck_id }))}
          />
          <span className="deck-option-name">{deck.deck_name_zh}</span>
          <span className="deck-option-cards">{deckComposition(deck)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="deck-select">
      <div className="deck-select-header flex items-center justify-between mb-4">
        <div>
          <h1>选择牌组</h1>
          <p className="note">
            {mode === 'vs-bot' ? '单人模式：你执玩家 A，玩家 B 由本地机器人（普通难度）执牌。' : '本地热座：双人同屏轮流操作。'}
            双方可以选择同一套牌组；也可以使用构筑器创建的自定义卡组。
          </p>
        </div>
        {onOpenDeckEditor && (
          <button className="btn" style={{ borderColor: '#06b6d4', color: '#67e8f9' }} onClick={onOpenDeckEditor}>
            🎴 构筑 / 自定义卡组
          </button>
        )}
      </div>
      <div className="deck-columns">
        {renderColumn('player_a')}
        {renderColumn('player_b')}
      </div>
      <div className="deck-select-actions">
        <label className="seed-input">
          随机种子：
          <input
            type="number"
            value={seedText}
            placeholder="留空＝随机"
            onChange={(event) => setSeedText(event.target.value)}
          />
        </label>
        <button className="btn primary big" onClick={start}>
          开始对局
        </button>
        {onOpenDeckEditor && (
          <button className="btn" onClick={onOpenDeckEditor}>
            构筑卡组
          </button>
        )}
        <button className="btn" onClick={onCancel}>
          返回
        </button>
      </div>
    </div>
  );
}

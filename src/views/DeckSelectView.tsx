import React, { useMemo, useState } from 'react';
import { CARD_BY_ID, DEMO_CARDS, getAllAvailableDecks, PLAYER_LABEL } from '../client/demoData';
import type { LocalGameSetup } from '../client/localGameController';
import type { DeckDefinition, PlayerId } from '../game/types';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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

  const renderColumn = (playerId: PlayerId) => {
    const isPlayerA = playerId === 'player_a';
    return (
      <Panel
        variant="default"
        title={`${PLAYER_LABEL[playerId]} 作战编制`}
        codeName={isPlayerA ? 'OPERATOR.ALPHA' : 'OPERATOR.BETA'}
        className="flex-1 flex flex-col min-w-[280px]"
      >
        <div className="p-3 space-y-2 max-h-[55vh] overflow-y-auto">
          {availableDecks.map((deck) => {
            const isSelected = deckIds[playerId] === deck.deck_id;
            const isCustom = deck.deck_id.startsWith('CUSTOM-');
            return (
              <div
                key={deck.deck_id}
                onClick={() => setDeckIds((prev) => ({ ...prev, [playerId]: deck.deck_id }))}
                className={`p-3 border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[#29323d] border-[#e5a52b] ring-1 ring-[#e5a52b]/40 shadow-md'
                    : 'bg-[#181d22] border-[#313b43] hover:border-[#4b5a66] hover:bg-[#1d232a]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">{deck.deck_name_zh}</span>
                    <Badge variant={isCustom ? 'rarity' : 'neutral'} value={isCustom ? 5 : undefined}>
                      {isCustom ? '自定义' : '官方预设'}
                    </Badge>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-mono text-[#e5a52b] font-bold">
                      ✓ 已选择
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {deckComposition(deck)}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-5xl border border-[#4a555b] shadow-2xl flex flex-col"
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                作战出击配置 // DECK DEPLOYMENT
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                {mode === 'vs-bot' ? '单人人机推演模式' : '本地热座双人推演模式'}
              </span>
            </div>
          </div>
          {onOpenDeckEditor && (
            <Button variant="outline" size="sm" cornerCut onClick={onOpenDeckEditor}>
              🎴 打开卡组构筑器
            </Button>
          )}
        </div>

        {/* Dual Deck Selection Columns */}
        <div className="p-5 flex flex-col md:flex-row gap-4 bg-gradient-to-b from-[#1b2025] to-[#14181c]">
          {renderColumn('player_a')}
          {renderColumn('player_b')}
        </div>

        {/* Action Controls & Seed Input */}
        <div className="px-5 py-3.5 bg-[#121518] border-t border-[#313b43] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">随机种子:</span>
            <input
              type="number"
              value={seedText}
              placeholder="留空 = 随机真随机数"
              onChange={(e) => setSeedText(e.target.value)}
              className="bg-[#1b2127] border border-[#3c4750] px-2.5 py-1 text-xs text-amber-300 font-mono focus:border-amber-400 focus:outline-none w-44"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="md" onClick={onCancel}>
              ◀ 返回主菜单
            </Button>
            <Button variant="primary" size="md" cornerCut onClick={start} className="font-bold px-6">
              确认出击 ▶
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  CARD_BY_ID,
  CLASS_COLOR,
  CLASS_LABEL,
  DEMO_CARDS,
  PRESET_DECKS,
  deleteCustomDeck,
  getCustomDecks,
  saveCustomDeck,
  validateDeck,
  type UiCardDefinition,
} from '../client/demoData';
import type { CardId, DeckDefinition } from '../game/types';
import { OperatorPortrait } from '../components/cards/OperatorPortrait';

interface DeckEditorViewProps {
  readonly onBack: () => void;
  readonly initialDeckId?: string;
}

function getCardClassInfo(card: UiCardDefinition | { card_type: string; class?: string }) {
  const c = (card.card_type === 'operator' && card.class ? card.class : card.card_type) || 'tactic';
  return {
    label: CLASS_LABEL[c] ?? c,
    color: CLASS_COLOR[c] ?? '#94a3b8',
  };
}

export function DeckEditorView({ onBack, initialDeckId }: DeckEditorViewProps) {
  // Load all custom decks
  const [customDecks, setCustomDecks] = useState<DeckDefinition[]>(() => getCustomDecks());

  // Current editing deck
  const [currentDeck, setCurrentDeck] = useState<DeckDefinition>(() => {
    const all = [...getCustomDecks(), ...PRESET_DECKS];
    if (initialDeckId) {
      const match = all.find((d) => d.deck_id === initialDeckId);
      if (match) return JSON.parse(JSON.stringify(match));
    }
    // Default to first preset as template or empty custom
    return {
      deck_id: `CUSTOM-${Date.now().toString(36)}`,
      deck_name_zh: '我的自定义卡组',
      cards: PRESET_DECKS[0]?.cards ? JSON.parse(JSON.stringify(PRESET_DECKS[0].cards)) : [],
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedCost, setSelectedCost] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [inspectCard, setInspectCard] = useState<UiCardDefinition | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  // Validation
  const validation = useMemo(() => validateDeck(currentDeck, DEMO_CARDS), [currentDeck]);

  // Map of in-deck counts by card_id
  const inDeckCardCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of currentDeck.cards) {
      map.set(item.card_id, item.quantity);
    }
    return map;
  }, [currentDeck.cards]);

  // Map of in-deck counts by card name
  const inDeckNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of currentDeck.cards) {
      const def = CARD_BY_ID.get(item.card_id);
      if (def) {
        map.set(def.card_name_zh, (map.get(def.card_name_zh) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [currentDeck.cards]);

  // Filtered card pool
  const filteredCards = useMemo(() => {
    return DEMO_CARDS.filter((card) => {
      const uiCard = card as UiCardDefinition;
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = uiCard.card_name_zh.toLowerCase().includes(query);
        const matchesId = uiCard.card_id.toLowerCase().includes(query);
        const matchesRules = (uiCard.rules_text_zh ?? '').toLowerCase().includes(query);
        const matchesSkill = (uiCard.active_skill_text_zh ?? '').toLowerCase().includes(query);
        const matchesTags = (uiCard.synergy_tags ?? '').toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesRules && !matchesSkill && !matchesTags) {
          return false;
        }
      }

      // Class
      if (selectedClass !== 'all') {
        const cClass = uiCard.card_type === 'operator' ? uiCard.class : uiCard.card_type;
        if (cClass !== selectedClass) return false;
      }

      // Cost
      if (selectedCost !== 'all') {
        const cost = uiCard.cost;
        if (selectedCost === '1' && cost !== 1) return false;
        if (selectedCost === '2' && cost !== 2) return false;
        if (selectedCost === '3' && cost !== 3) return false;
        if (selectedCost === '4' && cost !== 4) return false;
        if (selectedCost === '5+' && cost < 5) return false;
      }

      // Rarity
      if (selectedRarity !== 'all') {
        const rarity = uiCard.rarity;
        if (selectedRarity === '6' && rarity !== 6) return false;
        if (selectedRarity === '5' && rarity !== 5) return false;
        if (selectedRarity === '4' && rarity !== 4) return false;
        if (selectedRarity === '3' && rarity !== 3) return false;
        if (selectedRarity === '1-2' && rarity > 2) return false;
      }

      return true;
    });
  }, [searchQuery, selectedClass, selectedCost, selectedRarity]);

  // Cost curve analysis
  const costDistribution = useMemo(() => {
    const buckets: Record<string, number> = { '1费': 0, '2费': 0, '3费': 0, '4费': 0, '5+费': 0 };
    for (const item of currentDeck.cards) {
      const def = CARD_BY_ID.get(item.card_id);
      if (!def) continue;
      const c = def.cost;
      if (c <= 1) buckets['1费'] += item.quantity;
      else if (c === 2) buckets['2费'] += item.quantity;
      else if (c === 3) buckets['3费'] += item.quantity;
      else if (c === 4) buckets['4费'] += item.quantity;
      else buckets['5+费'] += item.quantity;
    }
    return buckets;
  }, [currentDeck.cards]);

  // Add card to deck
  const addCard = (cardId: CardId) => {
    const def = CARD_BY_ID.get(cardId);
    if (!def) return;

    if (validation.totalCards >= 20) {
      showNotice('卡组已达 20 张上限，请先移出其他卡牌');
      return;
    }

    const currentCardCount = inDeckCardCounts.get(cardId) ?? 0;
    if (currentCardCount >= 2) {
      showNotice(`卡牌「${def.card_name_zh}」最多加入 2 张`);
      return;
    }

    const currentNameCount = inDeckNameCounts.get(def.card_name_zh) ?? 0;
    if (currentNameCount >= 2) {
      showNotice(`同名干员「${def.card_name_zh}」已达 2 张上限`);
      return;
    }

    setCurrentDeck((prev) => {
      const existing = prev.cards.find((c) => c.card_id === cardId);
      if (existing) {
        return {
          ...prev,
          cards: prev.cards.map((c) => (c.card_id === cardId ? { ...c, quantity: c.quantity + 1 } : c)),
        };
      }
      return {
        ...prev,
        cards: [...prev.cards, { card_id: cardId, quantity: 1 }],
      };
    });
  };

  // Remove card from deck
  const removeCard = (cardId: CardId) => {
    setCurrentDeck((prev) => {
      const existing = prev.cards.find((c) => c.card_id === cardId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        return {
          ...prev,
          cards: prev.cards.map((c) => (c.card_id === cardId ? { ...c, quantity: c.quantity - 1 } : c)),
        };
      }
      return {
        ...prev,
        cards: prev.cards.filter((c) => c.card_id !== cardId),
      };
    });
  };

  // Save current deck
  const handleSave = () => {
    if (!currentDeck.deck_name_zh.trim()) {
      showNotice('请输入卡组名称');
      return;
    }
    saveCustomDeck(currentDeck);
    setCustomDecks(getCustomDecks());
    showNotice(validation.valid ? '卡组已成功保存！' : `已保存（提示：当前 ${validation.totalCards}/20 张）`);
  };

  // Create new deck
  const handleCreateNew = () => {
    const newId = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
    setCurrentDeck({
      deck_id: newId,
      deck_name_zh: `新卡组 ${customDecks.length + 1}`,
      cards: [],
    });
    showNotice('已创建空白卡组，请从左侧卡池添加卡牌');
  };

  // Load preset deck
  const handleLoadPreset = (deckId: string) => {
    const target = PRESET_DECKS.find((d) => d.deck_id === deckId);
    if (!target) return;
    setCurrentDeck({
      deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      deck_name_zh: `${target.deck_name_zh} (副本)`,
      cards: JSON.parse(JSON.stringify(target.cards)),
    });
    showNotice(`已载入「${target.deck_name_zh}」模版`);
  };

  // Switch deck
  const handleSelectCustomDeck = (deck: DeckDefinition) => {
    setCurrentDeck(JSON.parse(JSON.stringify(deck)));
  };

  // Delete current deck
  const handleDeleteCurrent = () => {
    if (PRESET_DECKS.some((d) => d.deck_id === currentDeck.deck_id)) {
      showNotice('预设卡组不可删除');
      return;
    }
    if (confirm(`确定要删除卡组「${currentDeck.deck_name_zh}」吗？`)) {
      deleteCustomDeck(currentDeck.deck_id);
      const remaining = getCustomDecks();
      setCustomDecks(remaining);
      if (remaining.length > 0) {
        setCurrentDeck(JSON.parse(JSON.stringify(remaining[0])));
      } else {
        handleLoadPreset(PRESET_DECKS[0]!.deck_id);
      }
      showNotice('卡组已删除');
    }
  };

  // Export JSON
  const handleExport = () => {
    const jsonStr = JSON.stringify(currentDeck, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      showNotice('卡组配置已复制到剪贴板！');
    }).catch(() => {
      setImportJsonText(jsonStr);
      setShowImportModal(true);
    });
  };

  // Import JSON
  const handleImportSubmit = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (parsed && Array.isArray(parsed.cards)) {
        const imported: DeckDefinition = {
          deck_id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
          deck_name_zh: parsed.deck_name_zh || '导入卡组',
          cards: parsed.cards.map((c: { card_id: string; quantity: number }) => ({
            card_id: c.card_id as CardId,
            quantity: Math.min(2, Math.max(1, Number(c.quantity) || 1)),
          })),
        };
        saveCustomDeck(imported);
        setCustomDecks(getCustomDecks());
        setCurrentDeck(imported);
        setShowImportModal(false);
        showNotice('卡组导入成功！');
      } else {
        showNotice('卡组 JSON 格式错误');
      }
    } catch {
      showNotice('解析 JSON 失败，请检查格式');
    }
  };

  // Sorted cards in deck by cost then name
  const sortedDeckCards = useMemo(() => {
    return [...currentDeck.cards].sort((a, b) => {
      const defA = CARD_BY_ID.get(a.card_id);
      const defB = CARD_BY_ID.get(b.card_id);
      if (!defA || !defB) return 0;
      if (defA.cost !== defB.cost) return defA.cost - defB.cost;
      return defA.card_name_zh.localeCompare(defB.card_name_zh, 'zh-CN');
    });
  }, [currentDeck.cards]);

  return (
    <div className="deck-editor-view flex flex-col h-screen w-full bg-[#11141a] text-[#e2e8f0] font-sans select-none overflow-hidden">
      {/* Top Navigation & Status Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-[#181d26] border-b border-[#283242] shadow-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1.5 rounded bg-[#242d3d] hover:bg-[#323e54] text-xs font-semibold text-slate-200 cursor-pointer transition border border-[#3b485e]"
            onClick={onBack}
          >
            ◀ 返回对战菜单
          </button>
          <div className="h-5 w-px bg-[#2d3748]" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">卡组名称:</span>
            <input
              type="text"
              className="bg-[#0f131a] text-sm text-amber-300 font-bold px-2 py-1 rounded border border-[#3b485e] focus:border-amber-400 focus:outline-none w-52"
              value={currentDeck.deck_name_zh}
              onChange={(e) => setCurrentDeck((prev) => ({ ...prev, deck_name_zh: e.target.value }))}
              placeholder="输入卡组名称..."
            />
          </div>
          {/* Validation count indicator */}
          <div
            className={`px-2.5 py-0.5 rounded text-xs font-bold flex items-center gap-1.5 border ${
              validation.valid
                ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
                : 'bg-rose-950/70 border-rose-500 text-rose-300'
            }`}
          >
            <span>{validation.valid ? '✓ 卡组合法' : '✕ 卡组未就绪'}</span>
            <span className="font-mono text-sm">
              ({validation.totalCards} / 20)
            </span>
          </div>
        </div>

        {/* Global Deck Actions */}
        <div className="flex items-center gap-2">
          {/* Preset templates selector */}
          <select
            className="bg-[#242d3d] text-xs text-slate-200 px-2 py-1.5 rounded border border-[#3b485e] cursor-pointer"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleLoadPreset(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="" disabled>
              📋 载入官方预设模版...
            </option>
            {PRESET_DECKS.map((preset) => (
              <option key={preset.deck_id} value={preset.deck_id}>
                {preset.deck_name_zh}
              </option>
            ))}
          </select>

          <button
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer shadow transition"
            onClick={handleSave}
          >
            💾 保存卡组
          </button>
          <button
            className="px-2.5 py-1.5 rounded bg-[#242d3d] hover:bg-[#323e54] text-xs text-slate-300 cursor-pointer border border-[#3b485e]"
            onClick={handleCreateNew}
          >
            ➕ 新建
          </button>
          <button
            className="px-2.5 py-1.5 rounded bg-[#242d3d] hover:bg-[#323e54] text-xs text-slate-300 cursor-pointer border border-[#3b485e]"
            onClick={handleExport}
            title="导出卡组代码"
          >
            📤 导出
          </button>
          <button
            className="px-2.5 py-1.5 rounded bg-[#242d3d] hover:bg-[#323e54] text-xs text-slate-300 cursor-pointer border border-[#3b485e]"
            onClick={() => {
              setImportJsonText('');
              setShowImportModal(true);
            }}
            title="导入卡组代码"
          >
            📥 导入
          </button>
          <button
            className="px-2.5 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 text-xs text-rose-300 cursor-pointer border border-rose-800"
            onClick={handleDeleteCurrent}
            title="删除此卡组"
          >
            🗑️
          </button>
        </div>
      </header>

      {/* Floating Status Notification */}
      {statusNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-amber-400 text-amber-300 px-4 py-2 rounded-lg text-sm shadow-xl animate-fade-in">
          {statusNotice}
        </div>
      )}

      {/* Main Content Area: Split 2/3 Library, 1/3 Current Deck */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left 2/3: Card Pool & Filters */}
        <section className="flex-[3] flex flex-col border-r border-[#242d3d] bg-[#11141a] overflow-hidden">
          {/* Filter Bar */}
          <div className="p-3 bg-[#151a23] border-b border-[#242d3d] flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索干员/卡牌名称、技能、战术标签 (如 银灰 / 冻结 / 减速 / 先锋)..."
                  className="w-full bg-[#0d1017] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-white"
                    onClick={() => setSearchQuery('')}
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                匹配: <strong className="text-cyan-400">{filteredCards.length}</strong> / {DEMO_CARDS.length} 张
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 mr-1">职业:</span>
              {[
                { id: 'all', label: '全部' },
                { id: 'vanguard', label: '先锋' },
                { id: 'guard', label: '近卫' },
                { id: 'defender', label: '重装' },
                { id: 'sniper', label: '狙击' },
                { id: 'caster', label: '术师' },
                { id: 'medic', label: '医疗' },
                { id: 'supporter', label: '辅助' },
                { id: 'specialist', label: '特种' },
                { id: 'tactic', label: '战术' },
                { id: 'support', label: '支援' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition border ${
                    selectedClass === opt.id
                      ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                      : 'bg-[#1e2533] text-slate-400 border-transparent hover:text-slate-200 hover:bg-[#283244]'
                  }`}
                  onClick={() => setSelectedClass(opt.id)}
                >
                  {opt.label}
                </button>
              ))}

              <div className="h-4 w-px bg-[#2d3748] mx-1" />

              <span className="text-slate-400 mr-1">费用:</span>
              {['all', '1', '2', '3', '4', '5+'].map((c) => (
                <button
                  key={c}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition border ${
                    selectedCost === c
                      ? 'bg-amber-600 text-white border-amber-400'
                      : 'bg-[#1e2533] text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                  onClick={() => setSelectedCost(c)}
                >
                  {c === 'all' ? '全部' : `${c}费`}
                </button>
              ))}

              <div className="h-4 w-px bg-[#2d3748] mx-1" />

              <span className="text-slate-400 mr-1">星级:</span>
              {['all', '6', '5', '4', '3', '1-2'].map((r) => (
                <button
                  key={r}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition border ${
                    selectedRarity === r
                      ? 'bg-amber-500 text-black font-bold border-amber-300'
                      : 'bg-[#1e2533] text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                  onClick={() => setSelectedRarity(r)}
                >
                  {r === 'all' ? '全部' : `${r}★`}
                </button>
              ))}
            </div>
          </div>

          {/* Card Grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 content-start">
            {filteredCards.map((card) => {
              const uiCard = card as UiCardDefinition;
              const inDeckCount = inDeckCardCounts.get(card.card_id) ?? 0;
              const nameCount = inDeckNameCounts.get(uiCard.card_name_zh) ?? 0;
              const isMaxed = inDeckCount >= 2 || nameCount >= 2 || validation.totalCards >= 20;
              const cardInfo = getCardClassInfo(uiCard);

              return (
                <div
                  key={card.card_id}
                  className={`relative flex flex-col p-2.5 rounded-lg border transition cursor-pointer select-none ${
                    inDeckCount > 0
                      ? 'bg-[#1b2331] border-cyan-500/80 shadow-md ring-1 ring-cyan-500/40'
                      : 'bg-[#141821] border-[#242e3f] hover:border-[#3d4d68] hover:bg-[#181d28]'
                  }`}
                  onClick={() => addCard(card.card_id)}
                  onMouseEnter={() => setInspectCard(uiCard)}
                >
                  {/* Card Header: Rarity & Cost */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-1"
                      style={{ backgroundColor: cardInfo.color }}
                    >
                      {cardInfo.label}
                    </span>
                    <span className="text-[11px] text-amber-400 font-bold">
                      {'★'.repeat(uiCard.rarity)}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      ⚡ {uiCard.cost}
                    </span>
                  </div>

                  {/* Card Name */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-100 truncate">
                      {uiCard.card_name_zh}
                    </span>
                    {/* In Deck Badge */}
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        inDeckCount === 2
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                          : inDeckCount === 1
                          ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500'
                      }`}
                    >
                      {inDeckCount} / 2
                    </span>
                  </div>

                  {/* Operator Stats */}
                  {uiCard.card_type === 'operator' ? (
                    <div className="flex items-center gap-2 text-[11px] text-slate-300 font-mono mb-1.5 bg-[#0e121a] px-1.5 py-0.5 rounded border border-[#202735]">
                      <span className="text-rose-400 font-bold">⚔ {uiCard.atk}</span>
                      <span className="text-emerald-400 font-bold">♥ {uiCard.hp}</span>
                      <span className="text-cyan-400 font-bold">⚡ {uiCard.starting_sp}/{uiCard.max_sp}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-purple-300 font-medium mb-1.5 bg-[#181224] px-1.5 py-0.5 rounded border border-purple-900/40">
                      {uiCard.card_type === 'tactic' ? '战术法术卡' : '后勤支援卡'}
                    </div>
                  )}

                  {/* Brief Rules Description */}
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed flex-1">
                    {uiCard.rules_text_zh || uiCard.active_skill_text_zh || '基础单位'}
                  </p>

                  {/* Quick Add Button */}
                  <div className="mt-2 flex items-center justify-between pt-1 border-t border-[#20293a]">
                    <span className="text-[9px] text-slate-500 font-mono">
                      {uiCard.card_id}
                    </span>
                    <button
                      className={`px-2 py-0.5 text-xs font-bold rounded transition cursor-pointer ${
                        isMaxed
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-cyan-700 hover:bg-cyan-600 text-white shadow'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        addCard(card.card_id);
                      }}
                      disabled={isMaxed}
                    >
                      {inDeckCount === 2 ? '已满' : '+ 加入'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Card Detail Inspector Bar */}
          {inspectCard && (
            <div className="bg-[#141923] border-t border-[#283244] p-3 flex items-start gap-4 shrink-0">
              <OperatorPortrait
                cardId={inspectCard.card_id}
                variant="avatar"
                className="w-14 h-16 rounded shrink-0 shadow-md border border-[#2b374a]"
              />
              <div className="flex flex-col gap-1 w-44 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-xs">
                    {'★'.repeat(inspectCard.rarity)}
                  </span>
                  <span className="text-slate-100 font-bold text-sm">
                    {inspectCard.card_name_zh}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{
                      backgroundColor: getCardClassInfo(inspectCard).color,
                    }}
                  >
                    {getCardClassInfo(inspectCard).label}
                  </span>
                  <span className="text-amber-300 font-bold">费用: {inspectCard.cost}</span>
                  {inspectCard.card_type === 'operator' && (
                    <span className="text-slate-400 text-[11px]">
                      {inspectCard.attack_type === 'melee' ? '近战' : '远程'} · {inspectCard.deploy_rule === 'front_only' ? '仅前排' : inspectCard.deploy_rule === 'back_only' ? '仅后排' : '前后皆可'}
                    </span>
                  )}
                </div>
                {inspectCard.card_type === 'operator' && (
                  <div className="flex gap-2 text-xs font-mono">
                    <span className="text-rose-400">攻击: {inspectCard.atk}</span>
                    <span className="text-emerald-400">生命: {inspectCard.hp}</span>
                    <span className="text-cyan-400">SP: {inspectCard.starting_sp}/{inspectCard.max_sp}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 text-xs text-slate-300 leading-relaxed">
                <strong className="text-amber-300 block mb-0.5">规则与技能效果:</strong>
                <div>{inspectCard.rules_text_zh || '无特殊被动效果'}</div>
                {inspectCard.active_skill_text_zh && (
                  <div className="mt-1 text-cyan-300">
                    ⚡ <strong>主动技能 ({inspectCard.active_skill_sp_cost ?? 0} SP):</strong> {inspectCard.active_skill_text_zh}
                  </div>
                )}
                {inspectCard.synergy_tags && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    战术标签: {inspectCard.synergy_tags}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right 1/3: Current Deck Structure & Management */}
        <section className="flex-[2] flex flex-col bg-[#141822] overflow-hidden">
          {/* Deck Header & Analytics */}
          <div className="p-3 bg-[#181d28] border-b border-[#283244] flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200">
                当前构筑 ({validation.totalCards} / 20)
              </span>
              <button
                className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                onClick={() => {
                  if (confirm('确认清空当前卡组中的所有卡牌吗？')) {
                    setCurrentDeck((prev) => ({ ...prev, cards: [] }));
                  }
                }}
              >
                清空卡组
              </button>
            </div>

            {/* Validation Message Box */}
            <div
              className={`p-2 rounded text-xs leading-relaxed border ${
                validation.valid
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/60 text-rose-300'
              }`}
            >
              {validation.valid ? (
                <div>✅ 卡组合法！包含 20 张卡牌，无超限卡牌，可直接投入对战。</div>
              ) : (
                <div className="space-y-0.5">
                  {validation.errors.map((err, i) => (
                    <div key={i}>⚠️ {err}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost Curve Visualization */}
            <div className="bg-[#0f131a] p-2 rounded border border-[#242d3d]">
              <div className="text-[10px] text-slate-400 font-semibold mb-1 flex justify-between">
                <span>费用曲线</span>
                <span className="text-cyan-400">
                  共 {validation.uniqueCards} 种不同卡牌
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-10 px-1 pt-1">
                {Object.entries(costDistribution).map(([label, count]) => {
                  const heightPercent = Math.min(100, (count / 8) * 100);
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center h-full justify-end">
                      <span className="text-[9px] font-mono text-amber-300 font-bold mb-0.5">
                        {count > 0 ? count : ''}
                      </span>
                      <div
                        className="w-full bg-cyan-600 rounded-t transition-all min-h-[2px]"
                        style={{ height: `${Math.max(4, heightPercent)}%` }}
                      />
                      <span className="text-[9px] text-slate-500 mt-0.5">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cards in Deck List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sortedDeckCards.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                卡组暂无卡牌，请点击左侧卡牌或「+ 加入」按钮添加。
              </div>
            ) : (
              sortedDeckCards.map((item) => {
                const def = CARD_BY_ID.get(item.card_id);
                if (!def) return null;
                const cardInfo = getCardClassInfo(def);

                return (
                  <div
                    key={item.card_id}
                    className="flex items-center justify-between p-2 rounded bg-[#181e2b] border border-[#242f42] hover:border-[#384863] text-xs transition"
                    onMouseEnter={() => setInspectCard(def)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-5 text-center font-bold text-amber-400 text-xs shrink-0">
                        {def.cost}
                      </span>
                      <span
                        className="text-[9px] font-bold px-1 py-0.5 rounded text-white shrink-0"
                        style={{ backgroundColor: cardInfo.color }}
                      >
                        {cardInfo.label}
                      </span>
                      <span className="font-semibold text-slate-200 truncate">
                        {def.card_name_zh}
                      </span>
                      {def.card_type === 'operator' && (
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          ⚔{def.atk} ♥{def.hp}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        className="w-5 h-5 rounded bg-[#252f40] hover:bg-[#344158] text-slate-200 font-bold flex items-center justify-center cursor-pointer border border-[#3b4b66]"
                        onClick={() => removeCard(item.card_id)}
                        title="减少一张"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold font-mono text-cyan-300">
                        {item.quantity}
                      </span>
                      <button
                        className={`w-5 h-5 rounded font-bold flex items-center justify-center border ${
                          item.quantity >= 2 || validation.totalCards >= 20
                            ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                            : 'bg-[#252f40] hover:bg-[#344158] text-slate-200 border-[#3b4b66] cursor-pointer'
                        }`}
                        onClick={() => addCard(item.card_id)}
                        disabled={item.quantity >= 2 || validation.totalCards >= 20}
                        title="增加一张"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Saved Decks Drawer / Quick Switcher */}
          <div className="p-2.5 bg-[#10141d] border-t border-[#283244] shrink-0">
            <div className="text-[11px] text-slate-400 font-semibold mb-1.5 flex justify-between">
              <span>已保存的自定义卡组 ({customDecks.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {customDecks.length === 0 ? (
                <span className="text-[11px] text-slate-600">暂无自定义卡组，保存后将显示在此</span>
              ) : (
                customDecks.map((deck) => (
                  <button
                    key={deck.deck_id}
                    className={`px-2 py-1 rounded text-xs text-left truncate max-w-[140px] cursor-pointer border transition ${
                      currentDeck.deck_id === deck.deck_id
                        ? 'bg-amber-600/30 border-amber-400 text-amber-200 font-bold'
                        : 'bg-[#1b2230] border-[#293548] text-slate-300 hover:bg-[#252f42]'
                    }`}
                    onClick={() => handleSelectCustomDeck(deck)}
                  >
                    {deck.deck_name_zh}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {/* JSON Import/Export Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#181e2b] border border-[#37455d] rounded-xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-3">
            <h3 className="font-bold text-base text-slate-100">卡组配置导入 / 导出</h3>
            <p className="text-xs text-slate-400">
              请粘贴或复制卡组 JSON 配置代码（包含 20 张卡牌与对应数量）：
            </p>
            <textarea
              className="w-full h-48 bg-[#0e121a] border border-[#2b374a] rounded p-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"deck_name_zh": "突击卡组", "cards": [{"card_id": "OP-VAN-006", "quantity": 2}, ...]}'
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                className="px-3 py-1.5 rounded bg-[#242d3d] hover:bg-[#323e54] text-xs text-slate-300 cursor-pointer"
                onClick={() => setShowImportModal(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                onClick={handleImportSubmit}
              >
                确认导入卡组
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

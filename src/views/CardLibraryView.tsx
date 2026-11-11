import React, { useMemo, useState } from 'react';
import {
  DEMO_CARDS,
  CLASS_LABEL,
  CLASS_COLOR,
  type UiCardDefinition,
} from '../client/demoData';
import { getCardPresentation, type CardPresentation } from '../data/card-presentation';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { CardFrame } from '../components/cards/CardFrame';
import { OperatorPortrait } from '../components/cards/OperatorPortrait';

interface CardLibraryViewProps {
  readonly onBack: () => void;
  readonly onOpenDeckEditor?: () => void;
}

export function CardLibraryView({ onBack, onOpenDeckEditor }: CardLibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedCost, setSelectedCost] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'cost-asc' | 'cost-desc' | 'rarity-desc' | 'name'>('rarity-desc');

  // Currently inspected card (defaults to the first card)
  const [inspectCard, setInspectCard] = useState<UiCardDefinition>(() => DEMO_CARDS[0] as UiCardDefinition);

  // Filtered and sorted card list
  const filteredCards = useMemo(() => {
    return DEMO_CARDS.filter((card) => {
      const uiCard = card as UiCardDefinition;
      const p = getCardPresentation(card.card_id);

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesNameZh = uiCard.card_name_zh.toLowerCase().includes(q);
        const matchesNameEn = p.codeNameEn.toLowerCase().includes(q);
        const matchesId = uiCard.card_id.toLowerCase().includes(q);
        const matchesRules = (uiCard.rules_text_zh ?? '').toLowerCase().includes(q);
        const matchesSkill = (uiCard.active_skill_text_zh ?? '').toLowerCase().includes(q);
        const matchesTags = (uiCard.synergy_tags ?? '').toLowerCase().includes(q);
        if (!matchesNameZh && !matchesNameEn && !matchesId && !matchesRules && !matchesSkill && !matchesTags) {
          return false;
        }
      }

      // Class Filter
      if (selectedClass !== 'all') {
        const c = (uiCard.card_type === 'operator' && uiCard.class ? uiCard.class : uiCard.card_type) || 'tactic';
        if (c !== selectedClass) return false;
      }

      // Rarity Filter
      if (selectedRarity !== 'all') {
        if (String(uiCard.rarity) !== selectedRarity) return false;
      }

      // Cost Filter
      if (selectedCost !== 'all') {
        if (selectedCost === '1-2' && (uiCard.cost < 1 || uiCard.cost > 2)) return false;
        if (selectedCost === '3-4' && (uiCard.cost < 3 || uiCard.cost > 4)) return false;
        if (selectedCost === '5-6' && (uiCard.cost < 5 || uiCard.cost > 6)) return false;
        if (selectedCost === '7+' && uiCard.cost < 7) return false;
      }

      return true;
    }).sort((a, b) => {
      const pA = getCardPresentation(a.card_id);
      const pB = getCardPresentation(b.card_id);
      if (sortBy === 'cost-asc') return a.cost - b.cost || (b.rarity ?? 0) - (a.rarity ?? 0);
      if (sortBy === 'cost-desc') return b.cost - a.cost || (b.rarity ?? 0) - (a.rarity ?? 0);
      if (sortBy === 'rarity-desc') return (b.rarity ?? 0) - (a.rarity ?? 0) || a.cost - b.cost;
      return a.card_name_zh.localeCompare(b.card_name_zh, 'zh-CN');
    });
  }, [searchQuery, selectedClass, selectedRarity, selectedCost, sortBy]);

  const inspectPresentation: CardPresentation = useMemo(() => {
    return getCardPresentation(inspectCard.card_id);
  }, [inspectCard]);

  const classColor = CLASS_COLOR[inspectPresentation.profession] ?? '#94a3b8';
  const classLabelZh = CLASS_LABEL[inspectPresentation.profession] ?? inspectPresentation.profession;

  return (
    <div className="flex flex-col h-screen w-full bg-[#11141a] text-[#e8e9e6] font-sans select-none overflow-hidden">
      {/* Top PRTS Command Header */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-[#161a22] border-b border-[#2a3442] shadow-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ◀ 返回主终端
          </Button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-4 bg-[#e5a52b]" />
            <h1 className="text-sm font-bold tracking-wider text-slate-100 uppercase m-0">
              PRTS // 罗德岛干员与战术资料库 (ARCHIVE)
            </h1>
            <span className="text-[10px] font-mono text-slate-400">
              全量收录 88 张卡牌 · 只读图鉴
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="rarity" value={6}>全图鉴开放</Badge>
          {onOpenDeckEditor && (
            <Button variant="primary" size="sm" cornerCut onClick={onOpenDeckEditor}>
              🎴 前往卡组构筑器
            </Button>
          )}
        </div>
      </header>

      {/* Main Split Body: Left 2/3 Search & Catalog, Right 1/3 Detailed Inspection */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Filter Bar & Card Grid */}
        <section className="flex-[3] flex flex-col border-r border-[#242d3d] bg-[#13171f] overflow-hidden">
          {/* Tactical Filter Toolbar */}
          <div className="p-3 bg-[#181d26] border-b border-[#293344] flex flex-col gap-2 shrink-0">
            {/* Search Input Row */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索干员代号 (如 银灰 / SilverAsh / 艾雅法拉)、技能、标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0e1218] border border-[#2d3848] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#e5a52b] transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <span className="text-slate-400 font-mono text-[11px]">排序:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="bg-[#0e1218] border border-[#2d3848] text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-[#e5a52b]"
                >
                  <option value="rarity-desc">星级从高到低</option>
                  <option value="cost-asc">费用从低到高</option>
                  <option value="cost-desc">费用从高到低</option>
                  <option value="name">名称排序</option>
                </select>
              </div>

              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                收录: <strong className="text-amber-400">{filteredCards.length}</strong> / {DEMO_CARDS.length}
              </span>
            </div>

            {/* Filter Chips: Profession */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-slate-400 text-[11px] mr-1">职业:</span>
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
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClass(c.id)}
                  className={`px-2 py-0.5 text-[11px] font-medium transition cursor-pointer border ${
                    selectedClass === c.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold'
                      : 'bg-[#12161d] text-slate-400 border-[#263140] hover:text-white hover:border-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Filter Chips: Rarity & Cost */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px] mr-1">星级:</span>
                {['all', '6', '5', '4', '3'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRarity(r)}
                    className={`px-2 py-0.5 text-[11px] font-mono transition cursor-pointer border ${
                      selectedRarity === r
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold'
                        : 'bg-[#12161d] text-slate-400 border-[#263140] hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {r === 'all' ? '全部' : `${r}★`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px] mr-1">费用:</span>
                {[
                  { id: 'all', label: '全部' },
                  { id: '1-2', label: '1~2' },
                  { id: '3-4', label: '3~4' },
                  { id: '5-6', label: '5~6' },
                  { id: '7+', label: '7+' },
                ].map((cost) => (
                  <button
                    key={cost.id}
                    onClick={() => setSelectedCost(cost.id)}
                    className={`px-2 py-0.5 text-[11px] font-mono transition cursor-pointer border ${
                      selectedCost === cost.id
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold'
                        : 'bg-[#12161d] text-slate-400 border-[#263140] hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {cost.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start">
            {filteredCards.length === 0 ? (
              <div className="col-span-full py-20 text-center text-slate-500 font-mono text-xs">
                没有找到匹配的干员或卡牌档案
              </div>
            ) : (
              filteredCards.map((card) => {
                const uiCard = card as UiCardDefinition;
                const isSelected = inspectCard.card_id === card.card_id;
                return (
                  <div
                    key={card.card_id}
                    onClick={() => setInspectCard(uiCard)}
                    className="h-full flex flex-col"
                  >
                    <CardFrame
                      cardId={card.card_id}
                      definition={uiCard}
                      variant="deck"
                      selected={isSelected}
                      onClick={() => setInspectCard(uiCard)}
                      actionLabel="检视档案"
                      className="flex-1"
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: High-Res Archive Dossier & Param Inspection */}
        <section className="flex-[2] max-w-md w-full flex flex-col bg-[#161a22] overflow-hidden border-l border-[#263040]">
          <Panel
            variant="raised"
            title="干员战术档案 // DOSSIER"
            codeName={inspectCard.card_id}
            scanlines
            grid
            className="flex-1 border-0 flex flex-col overflow-hidden"
          >
            {/* Operator Portrait Showcase */}
            <div className="relative w-full h-64 bg-[#0d1015] border-b border-[#2d3848] overflow-hidden flex items-center justify-center">
              <OperatorPortrait
                cardId={inspectCard.card_id}
                presentation={inspectPresentation}
                variant="portrait"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161a22] via-transparent to-transparent pointer-events-none" />

              {/* Rarity & Class Overlay */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <Badge variant="class" value={inspectPresentation.profession}>
                  {classLabelZh}
                </Badge>
                <Badge variant="rarity" value={inspectPresentation.rarity} />
              </div>

              {/* Deployment Cost Badge */}
              <div className="absolute top-3 right-3">
                <Badge variant="cost" value={inspectCard.cost} />
              </div>
            </div>

            {/* Dossier Information Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
              {/* Names & ID */}
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-black text-white tracking-wider m-0">
                    {inspectCard.card_name_zh}
                  </h2>
                  <span className="font-mono text-slate-400 text-xs">
                    {inspectPresentation.operatorId}
                  </span>
                </div>
                <div className="text-xs font-mono text-[#e5a52b] tracking-widest uppercase">
                  {inspectPresentation.codeNameEn}
                </div>
              </div>

              {/* Combat Stats Grid (Operators Only) */}
              {inspectCard.card_type === 'operator' && (
                <div className="grid grid-cols-3 gap-2 bg-[#0e1218] p-2.5 border border-[#2b3644] text-center font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase block">ATK 攻击</span>
                    <span className="text-sm font-bold text-rose-400">{inspectCard.atk ?? 0}</span>
                  </div>
                  <div className="space-y-0.5 border-x border-[#232c38]">
                    <span className="text-[10px] text-slate-500 uppercase block">HP 生命</span>
                    <span className="text-sm font-bold text-emerald-400">{inspectCard.hp ?? 0}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase block">SP 技力</span>
                    <span className="text-sm font-bold text-sky-400">
                      {inspectCard.starting_sp ?? 0} / {inspectCard.max_sp ?? 5}
                    </span>
                  </div>
                </div>
              )}

              {/* Deployment Rules & Attack Type */}
              {inspectCard.card_type === 'operator' && (
                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <span className="px-2 py-0.5 bg-[#1f2631] border border-[#344052]">
                    攻击方式: <strong>{inspectCard.attack_type === 'melee' ? '近战攻击' : '远程攻击'}</strong>
                  </span>
                  <span className="px-2 py-0.5 bg-[#1f2631] border border-[#344052]">
                    部署站位: <strong>{inspectCard.deploy_rule === 'front_only' ? '仅前排' : inspectCard.deploy_rule === 'back_only' ? '仅后排' : '前后排皆可'}</strong>
                  </span>
                  {inspectCard.floating && (
                    <span className="px-2 py-0.5 bg-amber-950/60 text-amber-300 border border-amber-600/50">
                      浮空状态
                    </span>
                  )}
                </div>
              )}

              {/* Passive Traits & Rules */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-amber-400" />
                  被动特性 / 战术效果
                </span>
                <p className="text-slate-300 leading-relaxed bg-[#11151c] p-2.5 border border-[#273240]">
                  {inspectCard.rules_text_zh || '基础通用单位，无特殊常驻被动效果。'}
                </p>
              </div>

              {/* Active Skill */}
              {inspectCard.active_skill_text_zh && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-sky-300 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-sky-400" />
                    主动技能 (消耗 {inspectCard.active_skill_sp_cost ?? 0} SP)
                  </span>
                  <p className="text-slate-300 leading-relaxed bg-[#11151c] p-2.5 border border-[#273240]">
                    {inspectCard.active_skill_text_zh}
                  </p>
                </div>
              )}

              {/* Synergy Tags & Lore Notes */}
              {(inspectCard.synergy_tags || inspectPresentation.source.notes) && (
                <div className="pt-2 border-t border-[#263140] space-y-1 text-[11px] text-slate-400 font-mono">
                  {inspectCard.synergy_tags && (
                    <div>战术标签: {inspectCard.synergy_tags}</div>
                  )}
                  {inspectPresentation.source.notes && (
                    <div>档案备注: {inspectPresentation.source.notes}</div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

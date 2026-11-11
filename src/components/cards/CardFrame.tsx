import React from 'react';
import type { CardDefinition, CardId } from '../../game/types';
import { getCardPresentation, type CardPresentation } from '../../data/card-presentation';
import { OperatorPortrait } from './OperatorPortrait';
import { RARITY_THEMES, CORNER_CUTS } from '../ui/tokens';
import { CLASS_COLOR, CLASS_LABEL, type UiCardDefinition } from '../../client/demoData';

export type CardFrameVariant = 'hand' | 'deck' | 'preview' | 'compact';

export interface CardFrameProps {
  readonly cardId: CardId;
  readonly definition?: CardDefinition | UiCardDefinition;
  readonly presentation?: CardPresentation;
  readonly variant?: CardFrameVariant;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly dimmed?: boolean;
  readonly redeployCd?: number;
  readonly checked?: boolean;
  readonly interactive?: boolean;
  readonly inDeckCount?: number;
  readonly maxInDeckCount?: number;
  readonly onClick?: () => void;
  readonly onActionClick?: () => void;
  readonly actionLabel?: string;
  readonly className?: string;
}

/**
 * 战术卡框 SVG 几何边框与工业刻度层
 */
function FrameSvgBorder({
  rarityColor,
  variant,
}: {
  readonly rarityColor: string;
  readonly variant: CardFrameVariant;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 160 220"
      preserveAspectRatio="none"
    >
      {/* 外部工业线框 */}
      <polygon
        points="0 0, 148 0, 160 12, 160 220, 12 220, 0 208"
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1.5"
      />
      {/* 顶部战术右上角切角强调 */}
      <polyline
        points="136 0, 148 0, 160 12, 160 24"
        fill="none"
        stroke={rarityColor}
        strokeWidth="2.5"
      />
      {/* 底部左下角切角强调 */}
      <polyline
        points="0 196, 0 208, 12 220, 24 220"
        fill="none"
        stroke={rarityColor}
        strokeWidth="2"
      />
      {/* 顶部技术刻度线条 */}
      <line x1="28" y1="3" x2="80" y2="3" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 2" />
      {/* 侧面罗德岛刻度标尺 */}
      {variant !== 'compact' && (
        <>
          <line x1="157" y1="40" x2="157" y2="44" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <line x1="157" y1="48" x2="157" y2="52" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <line x1="157" y1="56" x2="157" y2="60" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/**
 * PRTS Tactical Terminal 卡框系统 (CardFrame)
 * 严格按照《UI_REDESIGN.md》Section 5.2 规范分层实现：
 * 1. 背景层 (Background)
 * 2. 立绘/头像层 (Artwork)
 * 3. 几何边框与刻度 (FrameShape & SvgBorder)
 * 4. 稀有度强调 (RarityAccent)
 * 5. 名称与费用 (Name & Cost)
 * 6. 职业与属性 (Class & Stats)
 * 7. 技能摘要 (SkillSummary)
 * 8. 交互状态覆层 (InteractionLayer)
 */
export function CardFrame({
  cardId,
  definition,
  presentation,
  variant = 'deck',
  selected = false,
  disabled = false,
  dimmed = false,
  redeployCd = 0,
  checked = false,
  interactive = true,
  inDeckCount,
  maxInDeckCount = 2,
  onClick,
  onActionClick,
  actionLabel,
  className = '',
}: CardFrameProps) {
  const p = presentation ?? getCardPresentation(cardId);
  const rarity = p.rarity;
  const rarityTheme = RARITY_THEMES[rarity as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];
  const classColor = CLASS_COLOR[p.profession] ?? '#94a3b8';
  const classLabelZh = CLASS_LABEL[p.profession] ?? p.profession;

  const cost = definition?.cost ?? 0;
  const isOperator = (definition?.card_type ?? (p.profession !== 'tactic' && p.profession !== 'support')) === 'operator';
  const nameZh = definition?.card_name_zh ?? p.codeNameZh;

  // 技能与规则文字提取
  const uiDef = definition as UiCardDefinition | undefined;
  const rulesSummary = uiDef?.rules_text_zh || uiDef?.active_skill_text_zh || '';

  // 尺寸设定
  const sizeClasses = {
    compact: 'w-24 h-36',
    hand: 'w-26 h-36 sm:w-28 sm:h-38 shrink-0',
    deck: 'w-full min-h-[160px] p-2.5',
    preview: 'w-64 min-h-[340px] p-4',
  }[variant];

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`group relative flex flex-col justify-between bg-[#191e24] text-slate-100 select-none overflow-hidden transition-all duration-200 border ${
        interactive && !disabled ? 'cursor-pointer hover:border-amber-400/80 hover:-translate-y-1' : ''
      } ${selected ? 'border-[#e5a52b] ring-2 ring-[#e5a52b]/50 shadow-[0_0_16px_rgba(229,165,43,0.35)]' : 'border-[#38424b]'} ${
        dimmed || disabled || redeployCd > 0 ? 'opacity-40 grayscale-30' : ''
      } ${sizeClasses} ${className}`}
      style={{
        clipPath: CORNER_CUTS.md,
      }}
    >
      {/* 1. 背景层：碳纤维纹理与暗灰底色 */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 100% 0%, ${rarityTheme.glow} 0%, transparent 60%),
            linear-gradient(135deg, rgba(255,255,255,0.03) 25%, transparent 25%),
            linear-gradient(225deg, rgba(255,255,255,0.03) 25%, transparent 25%)
          `,
          backgroundSize: '100% 100%, 8px 8px, 8px 8px',
        }}
      />

      {/* 2. 立绘/头像层 */}
      <div className="absolute inset-0 z-1 pointer-events-none opacity-40 group-hover:opacity-55 transition-opacity">
        <OperatorPortrait
          cardId={cardId}
          presentation={p}
          variant="portrait"
          className="w-full h-full object-cover"
        />
        {/* 立绘与文字之间的渐变暗场 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#14171c] via-[#14171c]/60 to-transparent" />
      </div>

      {/* 3. 几何框体 SVG 装饰层 */}
      <FrameSvgBorder rarityColor={rarityTheme.color} variant={variant} />

      {/* 4. 稀有度与顶部信息层 */}
      <div className="relative z-10 flex items-start justify-between gap-1 w-full">
        {/* 费用徽章 (PRTS 战术切角标记) */}
        <div
          className="flex items-center gap-0.5 px-2 py-0.5 bg-[#e5a52b] text-slate-950 font-black font-mono text-xs shadow-md"
          style={{ clipPath: 'polygon(0 0, 100% 0, 85% 100%, 0 100%)' }}
        >
          <span className="text-[9px] font-sans">DP</span>
          <span className="text-sm leading-none font-bold">{cost}</span>
        </div>

        {/* 职业与星级标 */}
        <div className="flex flex-col items-end gap-0.5">
          <span
            className="text-[9px] font-bold px-1.5 py-0.2 tracking-wider uppercase border-r-2"
            style={{
              color: classColor,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRightColor: classColor,
            }}
          >
            {classLabelZh}
          </span>
          <div className="flex items-center gap-0.5 text-[9px] leading-none" style={{ color: rarityTheme.color }}>
            {'★'.repeat(rarity)}
          </div>
        </div>
      </div>

      {/* 5. 核心名称与代号层 */}
      <div className="relative z-10 my-auto py-1">
        <h4 className="font-black text-sm text-white tracking-wider truncate drop-shadow-md">
          {nameZh}
        </h4>
        <div className="text-[10px] font-mono text-slate-400 tracking-wider uppercase truncate">
          {p.codeNameEn}
        </div>
      </div>

      {/* 6. 属性与状态栏 */}
      <div className="relative z-10 flex flex-col gap-1 w-full pt-1 border-t border-slate-700/60 bg-[#14181d]/80">
        {isOperator && definition && (
          <div className="flex items-center justify-between text-[11px] font-mono px-1">
            <span className="text-rose-400 font-bold">ATK {definition.atk ?? 0}</span>
            <span className="text-emerald-400 font-bold">HP {definition.hp ?? 0}</span>
            <span className="text-sky-400 font-bold">SP {definition.starting_sp ?? 0}/{definition.max_sp ?? 5}</span>
          </div>
        )}

        {/* 规则与技能摘要 (非 compact 模式显示) */}
        {variant !== 'compact' && rulesSummary && (
          <p className={`text-[10px] text-slate-300 px-1 leading-tight opacity-90 ${variant === 'hand' ? 'line-clamp-1' : 'line-clamp-2'}`}>
            {rulesSummary}
          </p>
        )}

        {/* 卡组编辑数量限制栏 (仅在 deck 视图显示) */}
        {variant === 'deck' && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 px-1">
            {inDeckCount !== undefined && (
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 border ${
                  inDeckCount === maxInDeckCount
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                    : inDeckCount > 0
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
              >
                {inDeckCount} / {maxInDeckCount}
              </span>
            )}
            {onActionClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActionClick();
                }}
                disabled={inDeckCount !== undefined && inDeckCount >= maxInDeckCount}
                className="px-2 py-0.5 text-xs font-bold bg-[#e5a52b] hover:bg-amber-400 text-slate-950 disabled:bg-slate-800 disabled:text-slate-600 cursor-pointer disabled:cursor-not-allowed transition"
              >
                {actionLabel ?? (inDeckCount !== undefined && inDeckCount >= maxInDeckCount ? '已满' : '+ 加入')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 7. 再部署 CD 遮罩覆层 */}
      {redeployCd > 0 && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 text-center p-2">
          <span className="text-xs text-amber-400 font-bold">再部署冷却</span>
          <span className="text-2xl font-black font-mono text-white mt-1">{redeployCd}</span>
        </div>
      )}

      {/* 8. 选中勾选标记 */}
      {checked && (
        <div className="absolute top-1.5 right-1.5 z-30 w-5 h-5 bg-[#e5a52b] text-slate-950 flex items-center justify-center font-bold text-xs shadow-md">
          ✓
        </div>
      )}
    </div>
  );
}

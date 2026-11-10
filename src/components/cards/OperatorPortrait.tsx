import React, { useState } from 'react';
import type { CardId } from '../../game/types';
import { getCardPresentation, type CardPresentation } from '../../data/card-presentation';
import { CLASS_COLOR, CLASS_LABEL } from '../../client/demoData';

export type PortraitVariant = 'portrait' | 'avatar' | 'mini';

interface OperatorPortraitProps {
  readonly cardId: CardId;
  readonly presentation?: CardPresentation;
  readonly variant?: PortraitVariant;
  readonly className?: string;
  readonly alt?: string;
}

/**
 * 职业专属几何战术标志（SVG）
 */
function ProfessionIcon({ profession, color }: { readonly profession: string; readonly color: string }) {
  switch (profession) {
    case 'vanguard': // 先锋：冲锋双三角
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M4 12l8-8v16L4 12z" fill={color} fillOpacity="0.25" />
          <path d="M12 12l8-8v16l-8-8z" fill={color} fillOpacity="0.5" />
        </svg>
      );
    case 'guard': // 近卫：利刃对剑
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M6 19L19 6M19 6v7M19 6h-7" />
          <path d="M5 5l4 4M15 15l4 4" strokeOpacity="0.5" />
        </svg>
      );
    case 'defender': // 重装：棱面坚盾
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 3l8 4v6c0 5-4 8-8 9-4-1-8-4-8-9V7l8-4z" fill={color} fillOpacity="0.25" />
          <path d="M12 7v10M8 10h8" />
        </svg>
      );
    case 'sniper': // 狙击：精准准星
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="7" strokeDasharray="3 2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
    case 'caster': // 术师：源石能量多面体
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 2l7 5v10l-7 5-7-5V7l7-5z" fill={color} fillOpacity="0.2" />
          <circle cx="12" cy="12" r="3" fill={color} />
        </svg>
      );
    case 'medic': // 医疗：战术双环十字
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="4" width="4" height="16" rx="1" fill={color} />
          <rect x="4" y="10" width="16" height="4" rx="1" fill={color} />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </svg>
      );
    case 'supporter': // 辅助：折射增幅棱镜
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <polygon points="12 3 21 19 3 19" fill={color} fillOpacity="0.25" />
          <polygon points="12 8 17 17 7 17" strokeDasharray="2 1" />
        </svg>
      );
    case 'specialist': // 特种：多功能战术刺标
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 2l3 7h7l-6 4 3 8-7-5-7 5 3-8-6-4h7l3-7z" fill={color} fillOpacity="0.25" />
        </svg>
      );
    case 'tactic': // 战术：指挥指令符
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    default: // 支援 / 其他
      return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke={color} strokeWidth="2">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
  }
}

/**
 * 罗德岛战术终端卡牌立绘 / 头像渲染组件
 *
 * 核心设计：
 * 1. 尝试从 CardPresentation 加载对应素材（portrait / avatar）。
 * 2. 若图片不存在（404）或加载错误，自动优雅降级为具有明日方舟战术工业风格的 SVG 剪影占位。
 * 3. 绝不导致页面崩溃或闪烁，完整展示角色中文名、英文代号、职业战术图标、星级与网格扫描线。
 */
export function OperatorPortrait({
  cardId,
  presentation,
  variant = 'portrait',
  className = '',
  alt,
}: OperatorPortraitProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const p = presentation ?? getCardPresentation(cardId);
  const assetUrl = variant === 'avatar' ? p.assets.avatar : p.assets.portrait;
  const classColor = CLASS_COLOR[p.profession] ?? '#94a3b8';
  const classLabelZh = CLASS_LABEL[p.profession] ?? p.profession;

  // 如果已有图片且未报错，尝试正常加载
  if (assetUrl && !imgFailed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={assetUrl}
          alt={alt ?? `${p.codeNameZh} (${p.codeNameEn})`}
          className="w-full h-full"
          style={{
            objectFit: p.display.portraitFit ?? 'contain',
            objectPosition: p.display.portraitPosition ?? 'center top',
          }}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  // --- 终端剪影兜底 (Tactical Terminal Silhouette Fallback) ---
  if (variant === 'mini') {
    return (
      <div
        className={`relative flex items-center justify-center bg-slate-900 border border-slate-700/60 overflow-hidden ${className}`}
        style={{ borderLeftColor: classColor, borderLeftWidth: 3 }}
      >
        <div className="w-4 h-4 opacity-80">
          <ProfessionIcon profession={p.profession} color={classColor} />
        </div>
      </div>
    );
  }

  if (variant === 'avatar') {
    return (
      <div
        className={`relative flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950 border border-slate-700/80 overflow-hidden select-none ${className}`}
      >
        {/* 背景扫描纹理 */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px)`,
          }}
        />

        {/* 顶部职业色条 */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: classColor }} />

        {/* 职业标志 */}
        <div className="w-6 h-6 z-10 drop-shadow-sm opacity-90 my-auto">
          <ProfessionIcon profession={p.profession} color={classColor} />
        </div>

        {/* 底部代号标签 */}
        <div className="z-10 w-full text-center px-0.5 pb-0.5 bg-slate-900/90 border-t border-slate-800/80">
          <span className="text-[10px] font-bold text-slate-200 tracking-tight leading-none block truncate">
            {p.codeNameZh}
          </span>
        </div>
      </div>
    );
  }

  // 默认 vertical portrait 表现
  return (
    <div
      className={`relative flex flex-col items-center justify-between p-3 bg-gradient-to-b from-slate-800 via-slate-900 to-black border border-slate-700/70 overflow-hidden select-none ${className}`}
    >
      {/* 战术网格与扫描线背景 */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '16px 16px',
        }}
      />
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)`,
        }}
      />

      {/* 顶部战术标识条 */}
      <div className="relative z-10 w-full flex items-center justify-between border-b border-slate-700/60 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 flex-shrink-0">
            <ProfessionIcon profession={p.profession} color={classColor} />
          </div>
          <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
            {classLabelZh}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: p.rarity }).map((_, i) => (
            <span key={i} className="text-amber-400 text-xs leading-none">
              ★
            </span>
          ))}
        </div>
      </div>

      {/* 中央战术剪影与干员代号 */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center px-2 py-4">
        {/* 罗德岛六边形几何外环 */}
        <div className="relative w-24 h-24 mb-3 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full opacity-30 animate-pulse">
            <polygon
              points="50 3, 90 25, 90 75, 50 97, 10 75, 10 25"
              fill="none"
              stroke={classColor}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <polygon
              points="50 12, 82 30, 82 70, 50 88, 18 70, 18 30"
              fill={classColor}
              fillOpacity="0.08"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <ProfessionIcon profession={p.profession} color={classColor} />
          </div>
        </div>

        {/* 干员中文代号 */}
        <div className="text-lg font-black text-white tracking-widest drop-shadow-md">
          {p.codeNameZh}
        </div>
        {/* 英文代号 */}
        <div className="text-[11px] font-mono font-medium text-slate-400 uppercase tracking-widest mt-0.5">
          {p.codeNameEn}
        </div>
      </div>

      {/* 底部系统状态栏 */}
      <div className="relative z-10 w-full flex items-center justify-between pt-1.5 border-t border-slate-800 text-[10px] font-mono text-slate-400">
        <span className="tracking-tight text-slate-300">{p.operatorId}</span>
        <span className="text-[9px] px-1 py-0.5 bg-slate-800 rounded text-slate-400">
          SYS.PORTRAIT
        </span>
      </div>
    </div>
  );
}

import React from 'react';
import { RARITY_THEMES } from './tokens';
import { CLASS_COLOR, CLASS_LABEL } from '../../client/demoData';

export type BadgeVariant = 'class' | 'rarity' | 'status' | 'cost' | 'ally' | 'enemy' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
  readonly value?: string | number;
  readonly unboxed?: boolean;
}

export function Badge({
  variant = 'neutral',
  value,
  unboxed = false,
  children,
  className = '',
  style,
  ...props
}: BadgeProps) {
  // If unboxed is requested, render quiet text with high legibility, conforming to zero-pill discipline
  if (unboxed) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-mono tracking-tight text-slate-400 ${className}`}
        style={style}
        {...props}
      >
        {children ?? value}
      </span>
    );
  }

  // Rarity Variant
  if (variant === 'rarity') {
    const starCount = typeof value === 'number' ? value : Number(value) || 3;
    const theme = RARITY_THEMES[starCount as keyof typeof RARITY_THEMES] ?? RARITY_THEMES[3];
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-mono font-bold tracking-wider uppercase border rounded-none ${className}`}
        style={{
          color: theme.color,
          borderColor: theme.border,
          backgroundColor: theme.badgeBg,
          ...style,
        }}
        {...props}
      >
        <span>{'★'.repeat(starCount)}</span>
        {children && <span>{children}</span>}
      </span>
    );
  }

  // Class / Profession Variant
  if (variant === 'class') {
    const classKey = String(value ?? '').toLowerCase();
    const color = CLASS_COLOR[classKey] ?? '#94a3b8';
    const label = CLASS_LABEL[classKey] ?? classKey;
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-bold border-l-2 rounded-none bg-slate-900/80 text-slate-200 border-slate-700/80 border ${className}`}
        style={{ borderLeftColor: color, ...style }}
        {...props}
      >
        <span>{children ?? label}</span>
      </span>
    );
  }

  // Cost Variant
  if (variant === 'cost') {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[11px] font-mono font-black text-amber-300 bg-amber-500/15 border border-amber-500/40 rounded-none ${className}`}
        style={style}
        {...props}
      >
        <span className="text-[9px]">DP</span>
        <span>{value ?? children}</span>
      </span>
    );
  }

  // Ally / Enemy Variant
  if (variant === 'ally') {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold text-sky-300 bg-sky-950/60 border border-sky-500/50 rounded-none ${className}`}
        style={style}
        {...props}
      >
        {children ?? value ?? '友方'}
      </span>
    );
  }

  if (variant === 'enemy') {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold text-rose-300 bg-rose-950/60 border border-rose-500/50 rounded-none ${className}`}
        style={style}
        {...props}
      >
        {children ?? value ?? '敌方'}
      </span>
    );
  }

  // Default Neutral Tag
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.2 text-[10px] font-mono text-slate-300 bg-[#1c2229] border border-[#3c4750] rounded-none ${className}`}
      style={style}
      {...props}
    >
      {children ?? value}
    </span>
  );
}

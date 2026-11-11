import React from 'react';

export type ResourceType = 'dp' | 'sp' | 'atk' | 'def' | 'hp';

export interface ResourceIndicatorProps {
  readonly type: ResourceType;
  readonly current: number;
  readonly max?: number;
  readonly label?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly showIcon?: boolean;
  readonly className?: string;
}

export function ResourceIndicator({
  type,
  current,
  max,
  label,
  size = 'md',
  showIcon = true,
  className = '',
}: ResourceIndicatorProps) {
  const config = {
    dp: {
      color: '#e5a52b',
      bgColor: 'rgba(229, 165, 43, 0.12)',
      borderColor: 'rgba(229, 165, 43, 0.4)',
      label: label ?? 'DP',
      icon: (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
    sp: {
      color: '#38bdf8',
      bgColor: 'rgba(56, 189, 248, 0.12)',
      borderColor: 'rgba(56, 189, 248, 0.4)',
      label: label ?? 'SP',
      icon: (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
          <polygon points="12 2 19 8 19 16 12 22 5 16 5 8 12 2" />
        </svg>
      ),
    },
    atk: {
      color: '#fb7185',
      bgColor: 'rgba(251, 113, 133, 0.12)',
      borderColor: 'rgba(251, 113, 133, 0.4)',
      label: label ?? 'ATK',
      icon: (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
          <path d="M13 19l6-6" />
          <path d="M16 16l4 4" />
          <path d="M19 21l2-2" />
        </svg>
      ),
    },
    def: {
      color: '#60a5fa',
      bgColor: 'rgba(96, 165, 250, 0.12)',
      borderColor: 'rgba(96, 165, 250, 0.4)',
      label: label ?? 'DEF',
      icon: (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    hp: {
      color: '#34d399',
      bgColor: 'rgba(52, 211, 153, 0.12)',
      borderColor: 'rgba(52, 211, 153, 0.4)',
      label: label ?? 'HP',
      icon: (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
    },
  }[type];

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5 font-bold',
    lg: 'text-base px-3.5 py-1.5 gap-2 font-black',
  }[size];

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <div
      className={`inline-flex items-center font-mono tracking-tight border select-none ${sizeClasses} ${className}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
    >
      {showIcon && <div className={`${iconSizeClasses} shrink-0`}>{config.icon}</div>}
      <span className="text-[10px] font-sans font-semibold tracking-wider uppercase opacity-80">
        {config.label}
      </span>
      <div className="flex items-center gap-0.5 font-bold">
        <span>{current}</span>
        {max !== undefined && (
          <>
            <span className="opacity-50 text-[10px]">/</span>
            <span className="opacity-75">{max}</span>
          </>
        )}
      </div>
    </div>
  );
}

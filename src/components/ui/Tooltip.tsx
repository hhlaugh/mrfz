import React, { useState } from 'react';

export interface TooltipProps {
  readonly content: React.ReactNode;
  readonly children: React.ReactNode;
  readonly position?: 'top' | 'bottom' | 'left' | 'right';
  readonly className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 ${positionClasses} px-2.5 py-1.5 bg-[#171a1d] text-slate-200 text-[11px] leading-snug border border-[#4a555e] shadow-xl pointer-events-none whitespace-normal min-w-[120px] max-w-[260px] animate-fade-in ${className}`}
        >
          <div className="flex items-center gap-1 border-b border-slate-700/60 pb-0.5 mb-1 text-[9px] font-mono text-[#e5a52b] tracking-wider uppercase">
            <span>SYS.INFO</span>
          </div>
          {content}
        </div>
      )}
    </div>
  );
}

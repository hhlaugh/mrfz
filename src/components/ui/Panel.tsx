import React from 'react';
import { CORNER_CUTS } from './tokens';

export type PanelVariant = 'default' | 'raised' | 'dark' | 'glass';

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: React.ReactNode;
  readonly codeName?: string;
  readonly actions?: React.ReactNode;
  readonly variant?: PanelVariant;
  readonly cornerCut?: boolean | 'sm' | 'md' | 'lg';
  readonly scanlines?: boolean;
  readonly grid?: boolean;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      title,
      codeName,
      actions,
      variant = 'default',
      cornerCut = false,
      scanlines = false,
      grid = false,
      children,
      className = '',
      style,
      ...props
    },
    ref,
  ) => {
    const variantClasses: Record<PanelVariant, string> = {
      default: 'bg-[#20262b] border-[#4a555b]/70 text-[#e8e9e6]',
      raised: 'bg-[#293137] border-[#5a666e]/80 text-[#e8e9e6] shadow-xl',
      dark: 'bg-[#171a1d] border-[#363f45] text-[#e8e9e6]',
      glass: 'bg-[#1c2227]/90 backdrop-blur-md border-[#4a555b]/60 text-[#e8e9e6]',
    };

    let clipPathStyle: string | undefined;
    if (cornerCut === true || cornerCut === 'md') {
      clipPathStyle = CORNER_CUTS.md;
    } else if (cornerCut === 'sm') {
      clipPathStyle = CORNER_CUTS.sm;
    } else if (cornerCut === 'lg') {
      clipPathStyle = CORNER_CUTS.lg;
    }

    const combinedStyle = clipPathStyle
      ? {
          clipPath: clipPathStyle,
          ...style,
        }
      : style;

    return (
      <div
        ref={ref}
        className={`relative flex flex-col border rounded-sm overflow-hidden ${variantClasses[variant]} ${className}`}
        style={combinedStyle}
        {...props}
      >
        {/* Subtle Scanlines Texture */}
        {scanlines && (
          <div
            className="absolute inset-0 opacity-5 pointer-events-none z-0"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
            }}
          />
        )}

        {/* Subtle Grid Pattern */}
        {grid && (
          <div
            className="absolute inset-0 opacity-5 pointer-events-none z-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
            }}
          />
        )}

        {/* Optional Tactical Header */}
        {(title || codeName || actions) && (
          <div className="relative z-10 flex items-center justify-between px-3.5 py-2 border-b border-[#363f45] bg-[#1a1f23]/80 select-none">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-1.5 h-3.5 bg-[#e5a52b] rounded-none shrink-0" />
              {title && <span className="font-bold text-xs tracking-wider text-slate-100 uppercase truncate">{title}</span>}
              {codeName && (
                <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase shrink-0">
                  // {codeName}
                </span>
              )}
            </div>
            {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
          </div>
        )}

        {/* Content Body */}
        <div className="relative z-10 flex-1">{children}</div>
      </div>
    );
  },
);

Panel.displayName = 'Panel';

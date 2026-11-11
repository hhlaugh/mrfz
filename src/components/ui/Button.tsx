import React from 'react';
import { CORNER_CUTS } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly cornerCut?: boolean;
  readonly icon?: React.ReactNode;
  readonly loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      cornerCut = false,
      icon,
      loading = false,
      disabled,
      children,
      className = '',
      style,
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center font-medium tracking-wide transition-all duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171a1d] disabled:cursor-not-allowed disabled:opacity-40';

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'text-xs px-2.5 py-1 gap-1.5 min-h-[28px]',
      md: 'text-xs px-3.5 py-1.5 gap-2 min-h-[34px]',
      lg: 'text-sm px-5 py-2.5 gap-2.5 min-h-[42px] font-semibold',
    };

    const variantClasses: Record<ButtonVariant, string> = {
      primary:
        'bg-[#e5a52b] hover:bg-[#f59e0b] active:bg-[#d97706] text-slate-950 font-bold border border-[#f59e0b] shadow-[0_2px_8px_rgba(229,165,43,0.25)]',
      secondary:
        'bg-[#20262b] hover:bg-[#293137] active:bg-[#1a1f23] text-slate-200 border border-[#4a555b] hover:border-amber-400/70',
      danger:
        'bg-[#3b1921] hover:bg-[#4c1d27] active:bg-[#2e1319] text-rose-200 border border-rose-700/80 hover:border-rose-500',
      ghost:
        'bg-transparent hover:bg-white/5 active:bg-white/10 text-slate-300 hover:text-white border border-transparent',
      outline:
        'bg-transparent hover:bg-amber-400/10 active:bg-amber-400/20 text-amber-300 border border-amber-400/70 hover:border-amber-400',
    };

    const combinedStyle = cornerCut
      ? {
          clipPath: CORNER_CUTS.sm,
          ...style,
        }
      : style;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        style={combinedStyle}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-0.5 h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';

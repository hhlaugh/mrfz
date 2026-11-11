import React, { useEffect } from 'react';
import { Button } from './Button';
import { CORNER_CUTS } from './tokens';

export interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: React.ReactNode;
  readonly codeName?: string;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  codeName = 'SYS.DIALOG',
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      {/* Backdrop close capture */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Dialog Window */}
      <div
        className={`relative w-full ${sizeClasses} bg-[#1e2329] border border-[#4a555e] text-[#e8e9e6] shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10 flex flex-col overflow-hidden`}
        style={{ clipPath: CORNER_CUTS.md }}
        role="dialog"
        aria-modal="true"
      >
        {/* Subtle scanline background */}
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
          }}
        />

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-[#171a1d] border-b border-[#363f45]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-[#e5a52b]" />
            <h3 className="font-bold text-sm tracking-wider text-slate-100 uppercase">{title}</h3>
            {codeName && (
              <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase">
                // {codeName}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white px-2 py-0.5 text-xs"
            aria-label="关闭"
          >
            ✕
          </Button>
        </div>

        {/* Modal Body */}
        <div className="relative z-10 p-5 overflow-y-auto max-h-[70vh] text-xs leading-relaxed text-slate-300">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="relative z-10 flex items-center justify-end gap-2 px-4 py-3 bg-[#171a1d]/90 border-t border-[#363f45]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

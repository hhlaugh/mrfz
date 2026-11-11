import React, { useEffect } from 'react';
import { Button } from './Button';

export interface BottomSheetProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: React.ReactNode;
  readonly codeName?: string;
  readonly children: React.ReactNode;
  readonly maxHeight?: string;
  readonly className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  codeName = 'SYS.DRAWER',
  children,
  maxHeight = 'max-h-[80vh]',
  className = '',
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Sheet Content */}
      <div
        className={`w-full bg-[#1b2025] border-t-2 border-[#e5a52b] text-[#e8e9e6] shadow-2xl flex flex-col ${maxHeight} ${className}`}
      >
        {/* Handle / Drag Bar */}
        <div className="w-full flex items-center justify-center pt-2 pb-1 cursor-grab" onClick={onClose}>
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#313a42] bg-[#171a1d]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-[#e5a52b]" />
            <span className="font-bold text-xs tracking-wider text-slate-100 uppercase">{title}</span>
            {codeName && (
              <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase">
                // {codeName}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2 py-0.5 text-xs text-slate-400">
            ✕
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

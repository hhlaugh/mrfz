/**
 * PRTS Tactical Terminal Design Tokens
 * 遵循《UI_REDESIGN.md》Section 2 & 5 以及《docs/ui-design-system.md》
 */

export const TERMINAL_COLORS = {
  bgBase: '#171a1d',
  bgSub: '#20262b',
  bgPanel: '#293137',
  bgRaised: '#343d43',
  textPrimary: '#e8e9e6',
  textSecondary: '#aab2b5',
  textMuted: '#778187',
  accent: '#e5a52b',
  accentHover: '#f59e0b',
  accentSoft: 'rgba(229, 165, 43, 0.22)',
  ally: '#38bdf8',
  enemy: '#fb7185',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  border: '#4a555b',
  borderSubtle: '#2d353b',
} as const;

export const RARITY_THEMES = {
  3: {
    color: '#94a3b8',
    label: '标准干员',
    glow: 'rgba(148, 163, 184, 0.2)',
    badgeBg: 'rgba(148, 163, 184, 0.15)',
    border: 'rgba(148, 163, 184, 0.4)',
  },
  4: {
    color: '#a855f7',
    label: '精英干员',
    glow: 'rgba(168, 85, 247, 0.25)',
    badgeBg: 'rgba(168, 85, 247, 0.18)',
    border: 'rgba(168, 85, 247, 0.45)',
  },
  5: {
    color: '#eab308',
    label: '资深干员',
    glow: 'rgba(234, 179, 8, 0.3)',
    badgeBg: 'rgba(234, 179, 8, 0.2)',
    border: 'rgba(234, 179, 8, 0.55)',
  },
  6: {
    color: '#f97316',
    label: '高级资深干员',
    glow: 'rgba(249, 115, 22, 0.35)',
    badgeBg: 'rgba(249, 115, 22, 0.22)',
    border: 'rgba(249, 115, 22, 0.6)',
  },
} as const;

export const CORNER_CUTS = {
  sm: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
  md: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
  lg: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
  topRightOnly: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
  bottomLeftOnly: 'polygon(0 0, 100% 0, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
} as const;

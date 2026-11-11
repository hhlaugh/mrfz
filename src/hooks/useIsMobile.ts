import { useEffect, useState } from 'react';

export interface ViewportInfo {
  readonly isMobile: boolean; // < 1024px (Mobile & Tablet)
  readonly isPhone: boolean;  // < 640px (Small Phone)
  readonly isLandscape: boolean;
}

/**
 * 响应式视口检测 Hook
 * 用于 Phase 3 移动端独立布局，在窄屏时切换为抽屉式与紧凑触控视图
 */
export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isPhone: false, isLandscape: false };
    }
    return {
      isMobile: window.innerWidth < 1024,
      isPhone: window.innerWidth < 640,
      isLandscape: window.innerWidth > window.innerHeight,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      setInfo({
        isMobile: window.innerWidth < 1024,
        isPhone: window.innerWidth < 640,
        isLandscape: window.innerWidth > window.innerHeight,
      });
    };

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return info;
}

export function useIsMobile(): boolean {
  return useViewport().isMobile;
}

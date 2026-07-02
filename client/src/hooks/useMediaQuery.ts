import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render when its match state changes.
 * SSR-safe: returns `false` until mounted in a browser with `matchMedia`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Re-sync in case the query changed between render and effect.
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True below Tailwind's `md` breakpoint (viewport < 768px). */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 768px)');
}

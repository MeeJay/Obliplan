import { create } from 'zustand';
import type { AppTheme } from '@obliplan/shared';

const THEME_KEY = 'obliplan_theme';
const COLLAPSED_KEY = 'obliplan_sidebar_collapsed';

/** Every theme with a `[data-theme=...]` block in index.css. Anything else falls back. */
export const VALID_THEMES: AppTheme[] = ['obli-operator', 'obli-daylight', 'modern', 'neon'];

export function isValidTheme(value: string | null | undefined): value is AppTheme {
  return value != null && (VALID_THEMES as string[]).includes(value);
}

function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

const initialTheme = ((): AppTheme => {
  const saved = localStorage.getItem(THEME_KEY);
  return isValidTheme(saved) ? saved : 'obli-operator';
})();
applyTheme(initialTheme);

interface UiState {
  theme: AppTheme;
  sidebarCollapsed: boolean;
  /** Off-canvas mobile navigation drawer (below the `md` breakpoint only). */
  mobileNavOpen: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleSidebarCollapsed: () => void;
  setMobileNavOpen: (v: boolean) => void;
  toggleMobileNav: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: initialTheme,
  sidebarCollapsed: localStorage.getItem(COLLAPSED_KEY) === 'true',
  mobileNavOpen: false,
  setTheme: (theme) => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
  toggleSidebarCollapsed: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return { sidebarCollapsed: next };
    }),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
}));

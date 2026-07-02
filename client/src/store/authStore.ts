import { create } from 'zustand';
import type { User, TenantWithRole } from '@obliplan/shared';
import { authApi, tenantApi } from '../api';
import { storeSessionToken } from '../api/client';
import { useUiStore, isValidTheme } from './uiStore';

/**
 * SSO users have their theme managed centrally by Obligate (the /profile Apparence
 * card hides the local picker for them). Mirror the assertion's preferredTheme onto
 * this app whenever the session loads. Local-auth users keep their own local choice.
 */
function syncObligateTheme(user: User | null): void {
  if (user?.foreignSource !== 'obligate') return;
  const theme = user.preferences?.preferredTheme;
  if (isValidTheme(theme)) useUiStore.getState().setTheme(theme);
}

interface AuthState {
  user: User | null;
  currentTenantId: number | null;
  tenants: TenantWithRole[];
  capabilities: string[];
  modules: string[];
  /** Platform (system) admin - distinct from a per-tenant admin. Gates global config. */
  platformAdmin: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  switchTenant: (tenantId: number) => Promise<void>;

  isAdmin: () => boolean;
  isPlatformAdmin: () => boolean;
  isManager: () => boolean;
  /** Capability check for the active tenant (platform admin → always true). */
  can: (capability: string) => boolean;
  /** Module enablement check for the active tenant. */
  hasModule: (key: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  currentTenantId: null,
  tenants: [],
  capabilities: [],
  modules: [],
  platformAdmin: false,
  isLoading: false,
  isInitialized: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const result = await authApi.login(username, password);
      storeSessionToken(result.sessionToken);
      const session = await authApi.me();
      set({
        user: session.user,
        currentTenantId: session.currentTenantId,
        tenants: session.tenants,
        capabilities: session.capabilities ?? [],
        modules: session.modules ?? [],
        platformAdmin: !!session.platformAdmin,
        isLoading: false,
      });
      syncObligateTheme(session.user);
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    // SSO users: full single-logout (destroys local + Obligate session, lands on /login).
    if (get().user?.foreignSource === 'obligate') {
      window.location.href = '/auth/sso-logout';
      return;
    }
    try {
      await authApi.logout();
    } finally {
      set({ user: null, currentTenantId: null, tenants: [], capabilities: [], modules: [], platformAdmin: false });
    }
  },

  checkSession: async () => {
    try {
      const session = await authApi.me();
      set({
        user: session.user,
        currentTenantId: session.currentTenantId,
        tenants: session.tenants,
        capabilities: session.capabilities ?? [],
        modules: session.modules ?? [],
        platformAdmin: !!session.platformAdmin,
        isInitialized: true,
      });
      syncObligateTheme(session.user);
    } catch {
      set({ user: null, isInitialized: true });
    }
  },

  switchTenant: async (tenantId) => {
    await tenantApi.switch(tenantId);
    set({ currentTenantId: tenantId });
  },

  isAdmin: () => get().user?.role === 'admin',
  isPlatformAdmin: () => get().platformAdmin,
  isManager: () => {
    const r = get().user?.role;
    return r === 'manager' || r === 'admin';
  },
  can: (capability) => {
    const s = get();
    if (s.user?.role === 'admin') return true;
    return s.capabilities.includes(capability);
  },
  hasModule: (key) => get().modules.includes(key),
}));

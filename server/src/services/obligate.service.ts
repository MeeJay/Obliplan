import { appConfigService } from './appConfig.service';
import type { SsoConfig } from '@obliplan/shared';
import { logger } from '../utils/logger';

// Shape returned by Obligate's POST /api/oauth/token/exchange (data field).
export interface ObligateUserAssertion {
  obligateUserId: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string; // 'admin' (all-tenants) | 'user' | custom
  tenants: Array<{ slug: string; role: string }>;
  teams: string[];
  authSource: 'local' | 'ldap';
  linkedLocalUserId: number | null;
  preferences?: {
    preferredTheme?: string;
    preferredLanguage?: string;
    profilePhotoUrl?: string | null;
  };
}

export const obligateService = {
  /** Config + reachability for the login page to decide which form to show. */
  async getSsoConfig(): Promise<SsoConfig> {
    const raw = await appConfigService.getObligateRaw();
    if (!raw.enabled || !raw.url || !raw.apiKey) {
      return { obligateEnabled: false, obligateReachable: false, obligateUrl: raw.url };
    }
    let reachable = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${raw.url}/health`, { signal: controller.signal });
      clearTimeout(timer);
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    return { obligateEnabled: true, obligateReachable: reachable, obligateUrl: raw.url };
  },

  /** Exchange a one-time OAuth code for the user assertion (server-to-server). */
  async exchangeCode(code: string, redirectUri: string): Promise<ObligateUserAssertion | null> {
    const raw = await appConfigService.getObligateRaw();
    if (!raw.url || !raw.apiKey) {
      logger.warn('Obligate exchange failed: not configured');
      return null;
    }
    try {
      const res = await fetch(`${raw.url}/api/oauth/token/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${raw.apiKey}` },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      });
      if (!res.ok) {
        logger.warn(`Obligate exchange failed: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { success: boolean; data?: ObligateUserAssertion };
      return data.success && data.data ? data.data : null;
    } catch (err) {
      logger.error(err, 'Obligate exchange error');
      return null;
    }
  },

  /** Best-effort: tell Obligate which local user id an Obligate user maps to. */
  async reportProvision(obligateUserId: number, remoteUserId: number): Promise<void> {
    const raw = await appConfigService.getObligateRaw();
    if (!raw.url || !raw.apiKey) return;
    try {
      await fetch(`${raw.url}/api/apps/report-provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${raw.apiKey}` },
        body: JSON.stringify({ obligateUserId, remoteUserId }),
      });
    } catch (err) {
      logger.warn({ err }, 'Obligate report-provision failed (non-fatal)');
    }
  },

  /**
   * List the Obli* apps the user can reach via Obligate (for the header app
   * switcher). Scoped to the user's Obligate permissions when obligateUserId is
   * known; returns [] when SSO isn't configured.
   */
  async getConnectedApps(
    obligateUserId?: number | null,
  ): Promise<Array<{ appType: string; name: string; baseUrl: string; icon: string | null; color: string | null }>> {
    const raw = await appConfigService.getObligateRaw();
    if (!raw.url || !raw.apiKey) return [];
    const url = obligateUserId
      ? `${raw.url}/api/apps/connected?userId=${encodeURIComponent(obligateUserId)}`
      : `${raw.url}/api/apps/connected`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${raw.apiKey}` } });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        success: boolean;
        data?: Array<{ appType: string; name: string; baseUrl: string; icon: string | null; color: string | null }>;
      };
      return data.data ?? [];
    } catch {
      return [];
    }
  },

  /** Validate an inbound Bearer token against our stored Obligate API key. */
  async verifyInboundBearer(authHeader: string | undefined): Promise<boolean> {
    if (!authHeader?.startsWith('Bearer ')) return false;
    const raw = await appConfigService.getObligateRaw();
    return !!raw.apiKey && authHeader.slice(7) === raw.apiKey;
  },
};

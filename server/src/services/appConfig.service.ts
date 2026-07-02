import { db } from '../db';
import type { ObligateConfig, SmtpConfig } from '@obliplan/shared';

const OBLIGATE_CONFIG_KEY = 'obligate_config'; // JSON { url, apiKey }
const OBLIGATE_ENABLED_KEY = 'obligate_enabled'; // 'true' | 'false'
const SMTP_CONFIG_KEY = 'smtp_config'; // JSON { host, port, secure, user, pass, fromAddress }

interface SmtpRaw {
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  user?: string | null;
  pass?: string | null;
  fromAddress?: string | null;
}

export const appConfigService = {
  async get(key: string): Promise<string | null> {
    const row = await db('app_config').where({ key }).first<{ value: string | null }>();
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await db('app_config')
      .insert({ key, value, updated_at: db.fn.now() })
      .onConflict('key')
      .merge({ value, updated_at: db.fn.now() });
  },

  /** Public view (never leaks the API key). */
  async getObligateConfig(): Promise<ObligateConfig> {
    const raw = await this.get(OBLIGATE_CONFIG_KEY);
    const enabled = (await this.get(OBLIGATE_ENABLED_KEY)) === 'true';
    if (!raw) return { url: null, apiKeySet: false, enabled };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKeySet: !!cfg.apiKey, enabled };
    } catch {
      return { url: null, apiKeySet: false, enabled };
    }
  },

  /** Internal: includes the secret. Server-side only. */
  async getObligateRaw(): Promise<{ url: string | null; apiKey: string | null; enabled: boolean }> {
    const raw = await this.get(OBLIGATE_CONFIG_KEY);
    const enabled = (await this.get(OBLIGATE_ENABLED_KEY)) === 'true';
    if (!raw) return { url: null, apiKey: null, enabled };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKey: cfg.apiKey ?? null, enabled };
    } catch {
      return { url: null, apiKey: null, enabled };
    }
  },

  async patchObligateConfig(patch: {
    url?: string | null;
    apiKey?: string | null;
    enabled?: boolean;
  }): Promise<ObligateConfig> {
    const existing = await this.getObligateRaw();
    const merged = {
      url: 'url' in patch ? patch.url ?? null : existing.url,
      apiKey: 'apiKey' in patch && patch.apiKey ? patch.apiKey : existing.apiKey,
    };
    await this.set(OBLIGATE_CONFIG_KEY, JSON.stringify(merged));
    if ('enabled' in patch) await this.set(OBLIGATE_ENABLED_KEY, patch.enabled ? 'true' : 'false');
    return this.getObligateConfig();
  },

  // ── SMTP ──────────────────────────────────────────────────────────────────
  async getSmtpRaw(): Promise<SmtpRaw> {
    const raw = await this.get(SMTP_CONFIG_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as SmtpRaw;
    } catch {
      return {};
    }
  },

  /** Public view (never leaks the password). */
  async getSmtpConfig(): Promise<SmtpConfig> {
    const cfg = await this.getSmtpRaw();
    return {
      host: cfg.host ?? null,
      port: cfg.port ?? null,
      secure: cfg.secure ?? false,
      user: cfg.user ?? null,
      fromAddress: cfg.fromAddress ?? null,
      passSet: !!cfg.pass,
    };
  },

  async patchSmtpConfig(patch: {
    host?: string | null;
    port?: number | null;
    secure?: boolean;
    user?: string | null;
    pass?: string | null;
    fromAddress?: string | null;
  }): Promise<SmtpConfig> {
    const existing = await this.getSmtpRaw();
    const merged: SmtpRaw = {
      host: 'host' in patch ? patch.host ?? null : existing.host,
      port: 'port' in patch ? patch.port ?? null : existing.port,
      secure: 'secure' in patch ? !!patch.secure : existing.secure,
      user: 'user' in patch ? patch.user ?? null : existing.user,
      // Only overwrite the password when a non-empty value is provided.
      pass: 'pass' in patch && patch.pass ? patch.pass : existing.pass,
      fromAddress: 'fromAddress' in patch ? patch.fromAddress ?? null : existing.fromAddress,
    };
    await this.set(SMTP_CONFIG_KEY, JSON.stringify(merged));
    return this.getSmtpConfig();
  },
};

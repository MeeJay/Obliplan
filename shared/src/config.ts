// ============================================================================
// Admin/global configuration types (Settings page): About, SMTP, Obligate SSO.
// ============================================================================

/** Public-safe view of the Obligate SSO gateway config (never leaks the API key). */
export interface ObligateConfig {
  url: string | null;
  apiKeySet: boolean;
  enabled: boolean;
}

/** SMTP server config (single server). Password is never returned. */
export interface SmtpConfig {
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  fromAddress: string | null;
  passSet: boolean;
}

/** System / "About" info surfaced on the Settings page. */
export interface SystemInfo {
  appVersion: string;
  nodeVersion: string;
  uptimeSeconds: number;
  environment: {
    isDocker: boolean;
    platform: string;
    dbStatus: 'ok' | 'error';
  };
  cpu: {
    cores: number;
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
  };
  memory: {
    processRssMb: number;
    processHeapMb: number;
    systemFreeMb: number;
    systemTotalMb: number;
  };
}

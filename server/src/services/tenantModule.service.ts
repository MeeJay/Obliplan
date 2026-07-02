import { db } from '../db';
import { MODULE_KEYS, type ModuleKey } from '@obliplan/shared';

interface TenantModuleRow {
  tenant_id: number;
  module_key: string;
  enabled: boolean;
}

export const tenantModuleService = {
  /**
   * Enabled module keys for a workspace. Default-all-on: any catalog module
   * without an explicit `enabled=false` row is considered enabled.
   */
  async getEnabled(tenantId: number): Promise<ModuleKey[]> {
    const rows = await db<TenantModuleRow>('tenant_modules')
      .where({ tenant_id: tenantId })
      .select('module_key', 'enabled');
    const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.module_key));
    return MODULE_KEYS.filter((key) => !disabled.has(key));
  },

  /** True when `key` is enabled for the workspace (default-on when no row). */
  async isEnabled(tenantId: number, key: ModuleKey): Promise<boolean> {
    const row = await db<TenantModuleRow>('tenant_modules')
      .where({ tenant_id: tenantId, module_key: key })
      .first('enabled');
    return row ? row.enabled : true;
  },

  /** Upsert the enabled flag for a single module on a workspace. */
  async setEnabled(tenantId: number, key: ModuleKey, enabled: boolean): Promise<void> {
    await db('tenant_modules')
      .insert({ tenant_id: tenantId, module_key: key, enabled })
      .onConflict(['tenant_id', 'module_key'])
      .merge({ enabled, updated_at: db.fn.now() });
  },
};

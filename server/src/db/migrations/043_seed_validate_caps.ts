import type { Knex } from 'knex';

// The overtime validation caps must be present on BOTH the manager and admin default
// permission sets so the capability-gated routes (overtime:validate / overtime:natures:manage)
// are reachable. Migration 041 only partially back-filled these; merge them idempotently here.
const CAPS = ['overtime:validate', 'overtime:natures:manage'];

export async function up(knex: Knex): Promise<void> {
  async function addCaps(slug: string, caps: string[]): Promise<void> {
    const row = await knex('permission_sets').where({ slug }).first<{ capabilities: string[] | string }>();
    if (!row) return;
    const current = typeof row.capabilities === 'string' ? (JSON.parse(row.capabilities) as string[]) : row.capabilities;
    const merged = Array.from(new Set([...current, ...caps]));
    await knex('permission_sets').where({ slug }).update({ capabilities: JSON.stringify(merged), updated_at: knex.fn.now() });
  }
  await addCaps('manager', CAPS);
  await addCaps('admin', CAPS);
}

export async function down(knex: Knex): Promise<void> {
  async function removeCaps(slug: string, caps: string[]): Promise<void> {
    const row = await knex('permission_sets').where({ slug }).first<{ capabilities: string[] | string }>();
    if (!row) return;
    const current = typeof row.capabilities === 'string' ? (JSON.parse(row.capabilities) as string[]) : row.capabilities;
    const filtered = current.filter((c) => !caps.includes(c));
    await knex('permission_sets').where({ slug }).update({ capabilities: JSON.stringify(filtered), updated_at: knex.fn.now() });
  }
  await removeCaps('manager', CAPS);
  await removeCaps('admin', CAPS);
}

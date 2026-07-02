import type { Knex } from 'knex';

// Capabilities added after migration 020 (overtime:*, hourtypes:manage) were never
// back-filled into the seeded default permission sets, so managers got 403. Merge them.
export async function up(knex: Knex): Promise<void> {
  async function addCaps(slug: string, caps: string[]): Promise<void> {
    const row = await knex('permission_sets').where({ slug }).first<{ capabilities: string[] | string }>();
    if (!row) return;
    const current = typeof row.capabilities === 'string' ? (JSON.parse(row.capabilities) as string[]) : row.capabilities;
    const merged = Array.from(new Set([...current, ...caps]));
    await knex('permission_sets').where({ slug }).update({ capabilities: JSON.stringify(merged), updated_at: knex.fn.now() });
  }
  await addCaps('manager', ['overtime:validate', 'hourtypes:manage']);
  await addCaps('admin', ['overtime:natures:manage', 'overtime:validate', 'hourtypes:manage']);
}

export async function down(): Promise<void> {
  // No-op: capabilities are additive; we don't remove them on rollback.
}

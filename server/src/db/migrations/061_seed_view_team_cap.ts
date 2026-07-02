import type { Knex } from 'knex';

// Phase 7a (#20): give EVERY employee a READ-ONLY overview of who works when, gated by the
// NEW capability `planning:view_team`. Merge it idempotently into the admin, manager AND employe
// default permission sets so the read-only /planning/team-overview route is reachable by default
// (an org can still switch it off per permission-set). Same addCaps pattern as 043/041.
const CAPS = ['planning:view_team'];

export async function up(knex: Knex): Promise<void> {
  async function addCaps(slug: string, caps: string[]): Promise<void> {
    const row = await knex('permission_sets').where({ slug }).first<{ capabilities: string[] | string }>();
    if (!row) return;
    const current = typeof row.capabilities === 'string' ? (JSON.parse(row.capabilities) as string[]) : row.capabilities;
    const merged = Array.from(new Set([...current, ...caps]));
    await knex('permission_sets').where({ slug }).update({ capabilities: JSON.stringify(merged), updated_at: knex.fn.now() });
  }
  await addCaps('admin', CAPS);
  await addCaps('manager', CAPS);
  await addCaps('employe', CAPS);
}

export async function down(knex: Knex): Promise<void> {
  async function removeCaps(slug: string, caps: string[]): Promise<void> {
    const row = await knex('permission_sets').where({ slug }).first<{ capabilities: string[] | string }>();
    if (!row) return;
    const current = typeof row.capabilities === 'string' ? (JSON.parse(row.capabilities) as string[]) : row.capabilities;
    const filtered = current.filter((c) => !caps.includes(c));
    await knex('permission_sets').where({ slug }).update({ capabilities: JSON.stringify(filtered), updated_at: knex.fn.now() });
  }
  await removeCaps('admin', CAPS);
  await removeCaps('manager', CAPS);
  await removeCaps('employe', CAPS);
}

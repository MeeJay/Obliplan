import { db } from '../db';
import type { PermissionSet } from '@obliplan/shared';
import { CAPABILITY_KEYS } from '@obliplan/shared';

interface PermissionSetRow {
  id: number;
  name: string;
  slug: string;
  capabilities: string[] | string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

function parseCaps(v: string[] | string): string[] {
  const arr = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(arr) ? (arr as string[]) : [];
}

export function rowToPermissionSet(r: PermissionSetRow): PermissionSet {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    capabilities: parseCaps(r.capabilities),
    isDefault: r.is_default,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'set';
}

export const permissionSetService = {
  async getAll(): Promise<PermissionSet[]> {
    const rows = await db<PermissionSetRow>('permission_sets').orderBy([{ column: 'is_default', order: 'desc' }, 'name']);
    return rows.map(rowToPermissionSet);
  },

  async getBySlug(slug: string): Promise<PermissionSet | null> {
    const row = await db<PermissionSetRow>('permission_sets').where({ slug }).first();
    return row ? rowToPermissionSet(row) : null;
  },

  async create(data: { name: string; capabilities?: string[] }): Promise<PermissionSet> {
    const caps = (data.capabilities ?? []).filter((c) => CAPABILITY_KEYS.includes(c));
    const [row] = await db<PermissionSetRow>('permission_sets')
      .insert({ name: data.name, slug: slugify(data.name), capabilities: JSON.stringify(caps), is_default: false })
      .returning('*');
    return rowToPermissionSet(row);
  },

  async update(id: number, data: { name?: string; capabilities?: string[] }): Promise<PermissionSet | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.capabilities !== undefined) {
      patch.capabilities = JSON.stringify(data.capabilities.filter((c) => CAPABILITY_KEYS.includes(c)));
    }
    const [row] = await db<PermissionSetRow>('permission_sets').where({ id }).update(patch).returning('*');
    return row ? rowToPermissionSet(row) : null;
  },

  async delete(id: number): Promise<{ ok: boolean; reason?: string }> {
    const set = await db<PermissionSetRow>('permission_sets').where({ id }).first();
    if (!set) return { ok: false, reason: 'not_found' };
    if (set.is_default) return { ok: false, reason: 'default' };
    await db('permission_sets').where({ id }).del();
    return { ok: true };
  },
};

import { db } from '../db';
import type { Client } from '@obliplan/shared';
import { teamService } from './team.service';

/** Caller context used to enforce Axis-C client scope on listings. */
export interface ClientViewer {
  userId: number;
  role: string;
  platformAdmin?: boolean;
}

interface ClientRow {
  id: number;
  tenant_id: number;
  name: string;
  color: string | null;
  contact: string | null;
  notes: string | null;
  logo: string | null;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    color: r.color ?? null,
    contact: r.contact ?? null,
    notes: r.notes ?? null,
    logo: r.logo ?? null,
    archived: r.archived,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface ClientInput {
  name: string;
  color?: string | null;
  contact?: string | null;
  notes?: string | null;
  logo?: string | null;
  archived?: boolean;
}

export const clientService = {
  async getAll(tenantId: number | null, viewer?: ClientViewer): Promise<Client[]> {
    const q = db<ClientRow>('clients').orderBy('name');
    if (tenantId !== null) q.where({ tenant_id: tenantId });
    // No viewer (internal call), god-view fan-out, or admin → unfiltered.
    if (!viewer || viewer.platformAdmin || viewer.role === 'admin' || tenantId === null) {
      return (await q).map(rowToClient);
    }
    // Otherwise restrict to the clients the user's teams (Axis C) grant.
    const scope = await teamService.resolveScope(viewer.userId, tenantId, {
      role: viewer.role,
      platformAdmin: viewer.platformAdmin,
    });
    if (scope.allClients) return (await q).map(rowToClient);
    if (scope.clientIds.size === 0) return [];
    q.whereIn('id', [...scope.clientIds]);
    return (await q).map(rowToClient);
  },

  async getById(id: number, tenantId: number | null): Promise<Client | null> {
    const q = db<ClientRow>('clients').where({ id });
    if (tenantId !== null) q.andWhere({ tenant_id: tenantId });
    const row = await q.first();
    return row ? rowToClient(row) : null;
  },

  async create(tenantId: number, data: ClientInput): Promise<Client> {
    const [row] = await db<ClientRow>('clients')
      .insert({
        tenant_id: tenantId,
        name: data.name,
        color: data.color ?? null,
        contact: data.contact ?? null,
        notes: data.notes ?? null,
        logo: data.logo ?? null,
        archived: data.archived ?? false,
      })
      .returning('*');
    return rowToClient(row);
  },

  async update(id: number, tenantId: number, data: Partial<ClientInput>): Promise<Client | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.contact !== undefined) patch.contact = data.contact;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.logo !== undefined) patch.logo = data.logo;
    if (data.archived !== undefined) patch.archived = data.archived;
    const [row] = await db<ClientRow>('clients')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToClient(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('clients').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

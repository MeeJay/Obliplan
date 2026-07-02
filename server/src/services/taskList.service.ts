import { db } from '../db';
import type { TaskList, ListGroup, ListShare } from '@obliplan/shared';

// ── Row types + mappers ──────────────────────────────────────────────────────
interface TaskListRow {
  id: number; tenant_id: number; owner_id: number; name: string; color: string;
  icon: string | null; group_id: number | null; position: number; created_at: Date; updated_at: Date;
}
interface ListGroupRow {
  id: number; tenant_id: number; owner_id: number; name: string; position: number;
  collapsed: boolean; created_at: Date; updated_at: Date;
}
interface ListShareRow {
  id: number; tenant_id: number; list_id: number; user_id: number; can_edit: boolean;
  created_at: Date; updated_at: Date;
}

const rowToTaskList = (r: TaskListRow): TaskList => ({
  id: r.id, tenantId: r.tenant_id, ownerId: r.owner_id, name: r.name, color: r.color,
  icon: r.icon, groupId: r.group_id, position: r.position,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToListGroup = (r: ListGroupRow): ListGroup => ({
  id: r.id, tenantId: r.tenant_id, ownerId: r.owner_id, name: r.name, position: r.position,
  collapsed: r.collapsed, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToListShare = (r: ListShareRow): ListShare => ({
  id: r.id, tenantId: r.tenant_id, listId: r.list_id, userId: r.user_id, canEdit: r.can_edit,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

export interface ListAccess {
  list: TaskList;
  canEdit: boolean;
  isOwner: boolean;
}

export const taskListService = {
  /** Lists the user owns + lists shared with them, decorated with counts. */
  async listForUser(tenantId: number, userId: number): Promise<TaskList[]> {
    const owned = await db<TaskListRow>('task_lists').where({ tenant_id: tenantId, owner_id: userId });
    const shared = await db<TaskListRow>('task_lists as l')
      .join('list_shares as s', 's.list_id', 'l.id')
      .where('l.tenant_id', tenantId)
      .andWhere('s.user_id', userId)
      .select('l.*');

    const all = [
      ...owned.map((r) => ({ r, shared: false })),
      ...shared.map((r) => ({ r, shared: true })),
    ];
    if (!all.length) return [];

    const ids = all.map((x) => x.r.id);
    const countRows = await db('tasks')
      .whereIn('list_id', ids)
      .andWhere('is_completed', false)
      .groupBy('list_id')
      .select('list_id')
      .count<{ list_id: number; c: string }[]>('* as c');
    const memberRows = await db('list_shares')
      .whereIn('list_id', ids)
      .groupBy('list_id')
      .select('list_id')
      .count<{ list_id: number; c: string }[]>('* as c');
    const cmap = new Map(countRows.map((r) => [r.list_id, Number(r.c)]));
    const mmap = new Map(memberRows.map((r) => [r.list_id, Number(r.c)]));

    return all
      .map(({ r, shared }) => ({
        ...rowToTaskList(r),
        shared,
        taskCount: cmap.get(r.id) ?? 0,
        memberCount: mmap.get(r.id) ?? 0,
      }))
      .sort((a, b) => a.position - b.position || a.id - b.id);
  },

  async getById(id: number, tenantId: number): Promise<TaskList | null> {
    const row = await db<TaskListRow>('task_lists').where({ id, tenant_id: tenantId }).first();
    return row ? rowToTaskList(row) : null;
  },

  /** Resolve access: owner can always edit; shared members per `can_edit`. Throws-free. */
  async access(id: number, tenantId: number, userId: number): Promise<ListAccess | null> {
    const list = await this.getById(id, tenantId);
    if (!list) return null;
    if (list.ownerId === userId) return { list, canEdit: true, isOwner: true };
    const share = await db<ListShareRow>('list_shares').where({ list_id: id, user_id: userId }).first();
    if (!share) return null;
    return { list, canEdit: share.can_edit, isOwner: false };
  },

  /** Every list id the user may read (owned + shared). */
  async accessibleIds(tenantId: number, userId: number): Promise<number[]> {
    const owned = (await db('task_lists').where({ tenant_id: tenantId, owner_id: userId }).pluck('id')) as number[];
    const shared = (await db('list_shares').where({ tenant_id: tenantId, user_id: userId }).pluck('list_id')) as number[];
    return [...new Set([...owned, ...shared])];
  },

  /** The user's default inbox list (smart "Tâches"); created on first access. */
  async ensureInbox(tenantId: number, ownerId: number): Promise<TaskList> {
    const existing = await db<TaskListRow>('task_lists')
      .where({ tenant_id: tenantId, owner_id: ownerId })
      .orderBy(['position', 'id'])
      .first();
    if (existing) return rowToTaskList(existing);
    const [row] = await db<TaskListRow>('task_lists')
      .insert({ tenant_id: tenantId, owner_id: ownerId, name: 'Tâches', color: '#4f9cf9', position: 0 })
      .returning('*');
    return rowToTaskList(row);
  },

  async create(
    tenantId: number,
    ownerId: number,
    data: { name: string; color?: string; icon?: string | null; groupId?: number | null },
  ): Promise<TaskList> {
    const max = await db('task_lists').where({ tenant_id: tenantId, owner_id: ownerId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<TaskListRow>('task_lists')
      .insert({
        tenant_id: tenantId, owner_id: ownerId, name: data.name,
        color: data.color ?? '#4f9cf9', icon: data.icon ?? null,
        group_id: data.groupId ?? null, position: (max?.m ?? -1) + 1,
      })
      .returning('*');
    return rowToTaskList(row);
  },

  async update(
    id: number,
    tenantId: number,
    data: { name?: string; color?: string; icon?: string | null; groupId?: number | null; position?: number },
  ): Promise<TaskList | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.groupId !== undefined) patch.group_id = data.groupId;
    if (data.position !== undefined) patch.position = data.position;
    const [row] = await db<TaskListRow>('task_lists').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToTaskList(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('task_lists').where({ id, tenant_id: tenantId }).del()) > 0;
  },

  async reorder(
    tenantId: number,
    ownerId: number,
    items: { id: number; position: number; groupId?: number | null }[],
  ): Promise<void> {
    await db.transaction(async (trx) => {
      for (const it of items) {
        const patch: Record<string, unknown> = { position: it.position, updated_at: trx.fn.now() };
        if (it.groupId !== undefined) patch.group_id = it.groupId;
        await trx('task_lists').where({ id: it.id, tenant_id: tenantId, owner_id: ownerId }).update(patch);
      }
    });
  },
};

export const listGroupService = {
  async listForUser(tenantId: number, ownerId: number): Promise<ListGroup[]> {
    const rows = await db<ListGroupRow>('list_groups')
      .where({ tenant_id: tenantId, owner_id: ownerId })
      .orderBy(['position', 'id']);
    return rows.map(rowToListGroup);
  },
  async create(tenantId: number, ownerId: number, data: { name: string }): Promise<ListGroup> {
    const max = await db('list_groups').where({ tenant_id: tenantId, owner_id: ownerId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<ListGroupRow>('list_groups')
      .insert({ tenant_id: tenantId, owner_id: ownerId, name: data.name, position: (max?.m ?? -1) + 1 })
      .returning('*');
    return rowToListGroup(row);
  },
  async update(
    id: number,
    tenantId: number,
    ownerId: number,
    data: { name?: string; position?: number; collapsed?: boolean },
  ): Promise<ListGroup | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.position !== undefined) patch.position = data.position;
    if (data.collapsed !== undefined) patch.collapsed = data.collapsed;
    const [row] = await db<ListGroupRow>('list_groups')
      .where({ id, tenant_id: tenantId, owner_id: ownerId })
      .update(patch)
      .returning('*');
    return row ? rowToListGroup(row) : null;
  },
  async delete(id: number, tenantId: number, ownerId: number): Promise<boolean> {
    // Detach member lists (group_id → null) then drop the group.
    await db('task_lists').where({ tenant_id: tenantId, owner_id: ownerId, group_id: id }).update({ group_id: null });
    return (await db('list_groups').where({ id, tenant_id: tenantId, owner_id: ownerId }).del()) > 0;
  },
};

export const listShareService = {
  async listForList(listId: number, tenantId: number): Promise<ListShare[]> {
    const rows = await db<ListShareRow>('list_shares').where({ list_id: listId, tenant_id: tenantId }).orderBy('id');
    return rows.map(rowToListShare);
  },
  async share(tenantId: number, listId: number, userId: number, canEdit: boolean): Promise<ListShare> {
    const existing = await db<ListShareRow>('list_shares').where({ list_id: listId, user_id: userId }).first();
    if (existing) {
      const [row] = await db<ListShareRow>('list_shares')
        .where({ id: existing.id })
        .update({ can_edit: canEdit, updated_at: db.fn.now() })
        .returning('*');
      return rowToListShare(row);
    }
    const [row] = await db<ListShareRow>('list_shares')
      .insert({ tenant_id: tenantId, list_id: listId, user_id: userId, can_edit: canEdit })
      .returning('*');
    return rowToListShare(row);
  },
  async unshare(listId: number, userId: number, tenantId: number): Promise<boolean> {
    return (await db('list_shares').where({ list_id: listId, user_id: userId, tenant_id: tenantId }).del()) > 0;
  },
};

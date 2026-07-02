import { db } from '../db';
import type { Notification } from '@obliplan/shared';

interface NotificationRow {
  id: number;
  tenant_id: number;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: number | null;
  actor_id: number | null;
  read_at: Date | null;
  created_at: Date;
}

export function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actorId: r.actor_id,
    readAt: r.read_at ? r.read_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

/** Common payload shared by `create` (with userId) and `createMany` (fan-out). */
export interface NotificationPayload {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  actorId?: number | null;
}

const toRow = (tenantId: number, userId: number, p: NotificationPayload) => ({
  tenant_id: tenantId,
  user_id: userId,
  type: p.type,
  title: p.title,
  body: p.body ?? null,
  link: p.link ?? null,
  entity_type: p.entityType ?? null,
  entity_id: p.entityId ?? null,
  actor_id: p.actorId ?? null,
});

export const notificationService = {
  /** Insert a single notification for one recipient. */
  async create(tenantId: number, data: { userId: number } & NotificationPayload): Promise<Notification> {
    const { userId, ...payload } = data;
    const [row] = await db<NotificationRow>('notifications')
      .insert(toRow(tenantId, userId, payload))
      .returning('*');
    return rowToNotification(row);
  },

  /** Fan a single event out to many recipients (one row each). No-op on empty input. */
  async createMany(tenantId: number, recipientIds: number[], payload: NotificationPayload): Promise<void> {
    const ids = [...new Set(recipientIds)].filter((id) => Number.isFinite(id));
    if (ids.length === 0) return;
    await db<NotificationRow>('notifications').insert(ids.map((userId) => toRow(tenantId, userId, payload)));
  },

  /** Most-recent-first list for one user (default 50). */
  async listForUser(
    tenantId: number,
    userId: number,
    opts?: { limit?: number; offset?: number },
  ): Promise<Notification[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = await db<NotificationRow>('notifications')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return rows.map(rowToNotification);
  },

  async unreadCount(tenantId: number, userId: number): Promise<number> {
    const [row] = await db<NotificationRow>('notifications')
      .where({ tenant_id: tenantId, user_id: userId })
      .whereNull('read_at')
      .count<{ c: string }[]>('* as c');
    return Number(row?.c ?? 0);
  },

  /** Mark one notification read (scoped to its owner; idempotent). */
  async markRead(id: number, tenantId: number, userId: number): Promise<void> {
    await db<NotificationRow>('notifications')
      .where({ id, tenant_id: tenantId, user_id: userId })
      .whereNull('read_at')
      .update({ read_at: db.fn.now() });
  },

  async markAllRead(tenantId: number, userId: number): Promise<void> {
    await db<NotificationRow>('notifications')
      .where({ tenant_id: tenantId, user_id: userId })
      .whereNull('read_at')
      .update({ read_at: db.fn.now() });
  },
};

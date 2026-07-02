import { db } from '../db';
import type { Todo } from '@obliplan/shared';
import { toIso } from '../utils/date';

interface TodoRow {
  id: number; tenant_id: number; user_id: number; title: string; done: boolean;
  position: number; due_date: Date | string | null; created_at: Date; updated_at: Date;
}

const d = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? v.slice(0, 10) : toIso(v);

const rowToTodo = (r: TodoRow): Todo => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, title: r.title, done: r.done,
  position: r.position, dueDate: d(r.due_date), createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

export const todoService = {
  async listForUser(tenantId: number, userId: number): Promise<Todo[]> {
    const rows = await db<TodoRow>('todos')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy(['done', 'position', 'id']);
    return rows.map(rowToTodo);
  },

  async create(tenantId: number, userId: number, data: { title: string; dueDate?: string | null }): Promise<Todo> {
    const max = await db('todos').where({ tenant_id: tenantId, user_id: userId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<TodoRow>('todos')
      .insert({ tenant_id: tenantId, user_id: userId, title: data.title, due_date: data.dueDate ?? null, position: (max?.m ?? -1) + 1 })
      .returning('*');
    return rowToTodo(row);
  },

  async update(id: number, tenantId: number, userId: number, data: { title?: string; done?: boolean; dueDate?: string | null; position?: number }): Promise<Todo | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.done !== undefined) patch.done = data.done;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.position !== undefined) patch.position = data.position;
    const [row] = await db<TodoRow>('todos').where({ id, tenant_id: tenantId, user_id: userId }).update(patch).returning('*');
    return row ? rowToTodo(row) : null;
  },

  async delete(id: number, tenantId: number, userId: number): Promise<boolean> {
    return (await db('todos').where({ id, tenant_id: tenantId, user_id: userId }).del()) > 0;
  },
};

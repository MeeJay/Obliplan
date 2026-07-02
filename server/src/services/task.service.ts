import { db } from '../db';
import type { Task, TaskStep, SmartList } from '@obliplan/shared';
import { toIso, todayIso } from '../utils/date';
import { taskListService } from './taskList.service';
import { notify, emailFor } from './notify';

/** Fire a `task.assigned` notification to a newly-assigned teammate (best-effort). */
async function notifyTaskAssignment(task: Task, actorId?: number): Promise<void> {
  if (task.assigneeId == null || task.assigneeId === actorId) return;
  const title = task.title;
  const body = `Une tâche vous a été assignée : « ${task.title} ».`;
  await notify(task.tenantId, {
    recipientIds: [task.assigneeId],
    actorId,
    type: 'task.assigned',
    title,
    body,
    link: '/taches',
    entityType: 'task',
    entityId: task.id,
    email: emailFor(title, { title, body, link: '/taches' }),
  });
}

// ── Row types + mappers ──────────────────────────────────────────────────────
const dDate = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? v.slice(0, 10) : toIso(v);
const dTs = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? new Date(v).toISOString() : v.toISOString();

interface TaskRow {
  id: number; tenant_id: number; list_id: number; title: string; note: string | null;
  is_important: boolean; is_completed: boolean; completed_at: Date | null;
  due_date: Date | string | null; reminder_at: Date | string | null; my_day_date: Date | string | null;
  position: number; assignee_id: number | null; created_by: number | null;
  created_at: Date; updated_at: Date;
}
interface TaskStepRow {
  id: number; tenant_id: number; task_id: number; title: string; done: boolean;
  position: number; created_at: Date; updated_at: Date;
}

const rowToTask = (r: TaskRow): Task => ({
  id: r.id, tenantId: r.tenant_id, listId: r.list_id, title: r.title, note: r.note,
  isImportant: r.is_important, isCompleted: r.is_completed, completedAt: dTs(r.completed_at),
  dueDate: dDate(r.due_date), reminderAt: dTs(r.reminder_at), myDayDate: dDate(r.my_day_date),
  position: r.position, assigneeId: r.assignee_id, createdBy: r.created_by,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToStep = (r: TaskStepRow): TaskStep => ({
  id: r.id, tenantId: r.tenant_id, taskId: r.task_id, title: r.title, done: r.done,
  position: r.position, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

/** Attach step progress (stepCount / doneStepCount) to a batch of tasks. */
async function withStepCounts(tasks: Task[]): Promise<Task[]> {
  if (!tasks.length) return tasks;
  const ids = tasks.map((t) => t.id);
  const totals = await db('task_steps').whereIn('task_id', ids).groupBy('task_id').select('task_id').count<{ task_id: number; c: string }[]>('* as c');
  const dones = await db('task_steps').whereIn('task_id', ids).andWhere('done', true).groupBy('task_id').select('task_id').count<{ task_id: number; c: string }[]>('* as c');
  const tmap = new Map(totals.map((r) => [r.task_id, Number(r.c)]));
  const dmap = new Map(dones.map((r) => [r.task_id, Number(r.c)]));
  return tasks.map((t) => ({ ...t, stepCount: tmap.get(t.id) ?? 0, doneStepCount: dmap.get(t.id) ?? 0 }));
}

export interface TaskInput {
  listId: number;
  title: string;
  note?: string | null;
  isImportant?: boolean;
  dueDate?: string | null;
  reminderAt?: string | null;
  myDayDate?: string | null;
  assigneeId?: number | null;
}

export const taskService = {
  async listForList(listId: number, tenantId: number): Promise<Task[]> {
    const rows = await db<TaskRow>('tasks')
      .where({ list_id: listId, tenant_id: tenantId })
      .orderBy(['is_completed', 'position', 'id']);
    return withStepCounts(rows.map(rowToTask));
  },

  async smartList(key: SmartList, tenantId: number, userId: number): Promise<Task[]> {
    if (key === 'tasks') {
      const inbox = await taskListService.ensureInbox(tenantId, userId);
      return this.listForList(inbox.id, tenantId);
    }
    const ids = await taskListService.accessibleIds(tenantId, userId);
    if (!ids.length) return [];
    const q = db<TaskRow>('tasks').where('tenant_id', tenantId).whereIn('list_id', ids);
    if (key === 'my_day') q.andWhere('my_day_date', todayIso());
    else if (key === 'important') q.andWhere('is_important', true);
    else if (key === 'planned') q.whereNotNull('due_date');
    else if (key === 'assigned') q.andWhere('assignee_id', userId);
    const rows = await q.orderBy(['is_completed', 'due_date', 'position', 'id']);
    return withStepCounts(rows.map(rowToTask));
  },

  /** Incomplete-task counts for every smart list + the inbox list id. */
  async smartCounts(tenantId: number, userId: number): Promise<{
    counts: Record<SmartList, number>;
    inboxListId: number;
  }> {
    const inbox = await taskListService.ensureInbox(tenantId, userId);
    const ids = await taskListService.accessibleIds(tenantId, userId);
    const today = todayIso();
    const counts: Record<SmartList, number> = { my_day: 0, important: 0, planned: 0, assigned: 0, tasks: 0 };

    const inboxRow = await db('tasks').where({ list_id: inbox.id, tenant_id: tenantId, is_completed: false }).count<{ c: string }[]>('* as c');
    counts.tasks = Number(inboxRow[0]?.c ?? 0);

    if (ids.length) {
      const base = () => db('tasks').where('tenant_id', tenantId).whereIn('list_id', ids).andWhere('is_completed', false);
      const myDay = await base().andWhere('my_day_date', today).count<{ c: string }[]>('* as c');
      const important = await base().andWhere('is_important', true).count<{ c: string }[]>('* as c');
      const planned = await base().whereNotNull('due_date').count<{ c: string }[]>('* as c');
      const assigned = await base().andWhere('assignee_id', userId).count<{ c: string }[]>('* as c');
      counts.my_day = Number(myDay[0]?.c ?? 0);
      counts.important = Number(important[0]?.c ?? 0);
      counts.planned = Number(planned[0]?.c ?? 0);
      counts.assigned = Number(assigned[0]?.c ?? 0);
    }
    return { counts, inboxListId: inbox.id };
  },

  async getById(id: number, tenantId: number): Promise<Task | null> {
    const row = await db<TaskRow>('tasks').where({ id, tenant_id: tenantId }).first();
    return row ? rowToTask(row) : null;
  },

  async create(tenantId: number, actorId: number, data: TaskInput): Promise<Task> {
    const max = await db('tasks').where({ list_id: data.listId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<TaskRow>('tasks')
      .insert({
        tenant_id: tenantId, list_id: data.listId, title: data.title, note: data.note ?? null,
        is_important: data.isImportant ?? false, due_date: data.dueDate ?? null,
        reminder_at: data.reminderAt ?? null, my_day_date: data.myDayDate ?? null,
        assignee_id: data.assigneeId ?? null, created_by: actorId, position: (max?.m ?? -1) + 1,
      })
      .returning('*');
    const task = rowToTask(row);
    await notifyTaskAssignment(task, actorId);
    return task;
  },

  async update(
    id: number,
    tenantId: number,
    data: Partial<TaskInput> & { isCompleted?: boolean; position?: number },
    actorId?: number,
  ): Promise<Task | null> {
    const prevAssignee = data.assigneeId !== undefined
      ? (await db<TaskRow>('tasks').where({ id, tenant_id: tenantId }).first('assignee_id'))?.assignee_id ?? null
      : null;
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.listId !== undefined) patch.list_id = data.listId;
    if (data.title !== undefined) patch.title = data.title;
    if (data.note !== undefined) patch.note = data.note;
    if (data.isImportant !== undefined) patch.is_important = data.isImportant;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.reminderAt !== undefined) patch.reminder_at = data.reminderAt;
    if (data.myDayDate !== undefined) patch.my_day_date = data.myDayDate;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.position !== undefined) patch.position = data.position;
    if (data.isCompleted !== undefined) {
      patch.is_completed = data.isCompleted;
      patch.completed_at = data.isCompleted ? db.fn.now() : null;
    }
    const [row] = await db<TaskRow>('tasks').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    if (!row) return null;
    const task = rowToTask(row);
    // Notify only when the assignee actually changed to a new teammate.
    if (data.assigneeId !== undefined && task.assigneeId !== prevAssignee) {
      await notifyTaskAssignment(task, actorId);
    }
    return task;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('tasks').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

export const taskStepService = {
  async listForTask(taskId: number, tenantId: number): Promise<TaskStep[]> {
    const rows = await db<TaskStepRow>('task_steps')
      .where({ task_id: taskId, tenant_id: tenantId })
      .orderBy(['position', 'id']);
    return rows.map(rowToStep);
  },
  async create(tenantId: number, taskId: number, data: { title: string }): Promise<TaskStep> {
    const max = await db('task_steps').where({ task_id: taskId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<TaskStepRow>('task_steps')
      .insert({ tenant_id: tenantId, task_id: taskId, title: data.title, position: (max?.m ?? -1) + 1 })
      .returning('*');
    return rowToStep(row);
  },
  async getById(id: number, tenantId: number): Promise<TaskStep | null> {
    const row = await db<TaskStepRow>('task_steps').where({ id, tenant_id: tenantId }).first();
    return row ? rowToStep(row) : null;
  },
  async update(
    id: number,
    tenantId: number,
    data: { title?: string; done?: boolean; position?: number },
  ): Promise<TaskStep | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.done !== undefined) patch.done = data.done;
    if (data.position !== undefined) patch.position = data.position;
    const [row] = await db<TaskStepRow>('task_steps').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToStep(row) : null;
  },
  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('task_steps').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO yyyy-mm-dd attendue');
const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/, 'Date-heure ISO attendue');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue');

// ── List groups ───────────────────────────────────────────────────────────────
export const createListGroupSchema = z.object({
  name: z.string().min(1).max(200),
});
export const updateListGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
  collapsed: z.boolean().optional(),
});

// ── Task lists ────────────────────────────────────────────────────────────────
export const createTaskListSchema = z.object({
  name: z.string().min(1).max(200),
  color: hexColor.optional(),
  icon: z.string().max(40).nullable().optional(),
  groupId: z.number().int().positive().nullable().optional(),
});
export const updateTaskListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: hexColor.optional(),
  icon: z.string().max(40).nullable().optional(),
  groupId: z.number().int().positive().nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export const reorderListsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      position: z.number().int().min(0),
      groupId: z.number().int().positive().nullable().optional(),
    }),
  ),
});

// ── Sharing ───────────────────────────────────────────────────────────────────
export const shareListSchema = z.object({
  userId: z.number().int().positive(),
  canEdit: z.boolean().optional(),
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const createTaskSchema = z.object({
  listId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  note: z.string().max(10000).nullable().optional(),
  isImportant: z.boolean().optional(),
  dueDate: isoDate.nullable().optional(),
  reminderAt: isoDateTime.nullable().optional(),
  myDayDate: isoDate.nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  note: z.string().max(10000).nullable().optional(),
  isImportant: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  dueDate: isoDate.nullable().optional(),
  reminderAt: isoDateTime.nullable().optional(),
  myDayDate: isoDate.nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  listId: z.number().int().positive().optional(),
  position: z.number().int().min(0).optional(),
});

// ── Steps ─────────────────────────────────────────────────────────────────────
export const createTaskStepSchema = z.object({
  title: z.string().min(1).max(500),
});
export const updateTaskStepSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateTaskListInput = z.infer<typeof createTaskListSchema>;
export type UpdateTaskListInput = z.infer<typeof updateTaskListSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

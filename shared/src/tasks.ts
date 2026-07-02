// ============================================================================
// "Mes tâches" - a Microsoft To Do-style task manager: custom lists grouped in
// collapsible groups, smart lists (My Day / Important / Planned / Assigned /
// Tasks inbox), per-task steps, sharing and assignment to list members.
// ============================================================================

/** Computed views that aggregate tasks across all accessible lists. */
export type SmartList = 'my_day' | 'important' | 'planned' | 'assigned' | 'tasks';

/** Collapsible folder grouping several custom lists in the sidebar. */
export interface ListGroup {
  id: number;
  tenantId: number;
  ownerId: number;
  name: string;
  position: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: number;
  tenantId: number;
  ownerId: number;
  name: string;
  /** Theme color (hex #rrggbb) used for the list title + icon. */
  color: string;
  /** Optional lucide icon key (null = default list icon). */
  icon: string | null;
  /** Parent group (null = ungrouped, top level). */
  groupId: number | null;
  position: number;
  /** True when the list is shared with the current user (not owned by them). */
  shared?: boolean;
  /** Number of incomplete tasks (sidebar badge). */
  taskCount?: number;
  /** Number of members the list is shared with (owner view → people icon). */
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListShare {
  id: number;
  tenantId: number;
  listId: number;
  userId: number;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  tenantId: number;
  listId: number;
  title: string;
  note: string | null;
  isImportant: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  /** ISO date (yyyy-mm-dd) when the task is pinned to "My Day"; null = not. */
  myDayDate: string | null;
  position: number;
  assigneeId: number | null;
  createdBy: number | null;
  /** Step progress summary (filled on list/detail queries). */
  stepCount?: number;
  doneStepCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: number;
  tenantId: number;
  taskId: number;
  title: string;
  done: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

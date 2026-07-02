// ============================================================================
// Internal project management per teammate: Kanban/Scrum boards + personal todos.
// ============================================================================

export type CardPriority = 'low' | 'medium' | 'high';
export type SprintStatus = 'planned' | 'active' | 'done';

export interface Board {
  id: number;
  tenantId: number;
  ownerId: number;
  /** Owning client (customer); null = internal / unassigned project. */
  clientId: number | null;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  id: number;
  tenantId: number;
  boardId: number;
  name: string;
  position: number;
  /** Optional work-in-progress limit (null = none). */
  wipLimit: number | null;
  /** A "done" lane: a card in this column is considered completed. */
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: number;
  tenantId: number;
  boardId: number;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: number;
  tenantId: number;
  boardId: number;
  columnId: number;
  /** Null = backlog (no sprint). */
  sprintId: number | null;
  title: string;
  description: string | null;
  position: number;
  points: number | null;
  /** Planned effort in minutes (null = no estimate). Drives the Charge/workload view. */
  estimateMin: number | null;
  priority: CardPriority | null;
  /** Optional start of the card's [start, due] span (null = none). */
  startDate: string | null;
  dueDate: string | null;
  /** Assigned teammate (null = unassigned). */
  assigneeId: number | null;
  /** Parent card for subtasks (null = top-level card). */
  parentCardId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A board's team. Members are a visibility/access source on top of the
 * existing owner/manager/admin/team-scope grants. */
export type BoardMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface BoardMember {
  id: number;
  tenantId: number;
  boardId: number;
  userId: number;
  role: BoardMemberRole;
  /** COALESCE(display_name, username) of the member. */
  userName: string;
  createdAt: string;
}

/** Dependency relationship between two cards of the same board. */
export type CardLinkType = 'blocks' | 'relates' | 'duplicates';

export interface CardLink {
  id: number;
  tenantId: number;
  boardId: number;
  sourceCardId: number;
  targetCardId: number;
  type: CardLinkType;
  createdAt: string;
}

/** A comment on a card (the per-card discussion thread). */
export interface CardComment {
  id: number;
  tenantId: number;
  cardId: number;
  /** Author (null = a since-deleted user). */
  authorId: number | null;
  /** COALESCE(display_name, username) of the author. */
  authorName: string;
  body: string;
  createdAt: string;
}

/** Kinds of entries in a card's activity feed. */
export type CardActivityType = 'created' | 'assigned' | 'moved' | 'status' | 'commented' | 'updated';

/** One append-only entry in a card's change history. */
export interface CardActivity {
  id: number;
  tenantId: number;
  cardId: number;
  /** Actor (null = a since-deleted user). */
  actorId: number | null;
  /** COALESCE(display_name, username) of the actor. */
  actorName: string;
  type: CardActivityType;
  /** Per-type details, e.g. { from, to } for a move (null = none). */
  meta: Record<string, unknown> | null;
  createdAt: string;
}

/** A board with its columns, cards, sprints, members and links in one payload. */
export interface BoardDetail extends Board {
  columns: BoardColumn[];
  cards: Card[];
  sprints: Sprint[];
  members: BoardMember[];
  links: CardLink[];
}

/**
 * One teammate's row in the Charge (workload) view: their active assigned work
 * (Σ card estimates in non-done columns) vs their real weekly capacity
 * (contract base hours − approved leave this week).
 */
export interface WorkloadRow {
  userId: number;
  /** COALESCE(display_name, username) of the teammate. */
  userName: string;
  /** Σ estimateMin of the teammate's active (non-done) assigned cards. */
  assignedMin: number;
  /** Weekly contract base minutes minus this week's approved-leave days. */
  capacityMin: number;
  /** How many active assigned cards the teammate has. */
  cardCount: number;
  /** Of those, how many have NO estimate (so the bar's honesty is visible). */
  overCount: number;
}

export interface Todo {
  id: number;
  tenantId: number;
  userId: number;
  title: string;
  done: boolean;
  position: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

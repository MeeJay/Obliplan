import { db } from '../db';
import type {
  Board, BoardColumn, Sprint, Card, BoardDetail, CardPriority, SprintStatus,
  BoardMember, BoardMemberRole, CardLink, CardLinkType,
  CardComment, CardActivity, CardActivityType,
} from '@obliplan/shared';
import { toIso } from '../utils/date';
import { teamService } from './team.service';
import { notify, emailFor } from './notify';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

/** Fire a `card.assigned` notification to a newly-assigned teammate (best-effort). */
async function notifyCardAssignment(card: Card, actorId?: number): Promise<void> {
  if (card.assigneeId == null || card.assigneeId === actorId) return;
  const title = card.title;
  const body = `Une carte vous a été assignée : « ${card.title} ».`;
  await notify(card.tenantId, {
    recipientIds: [card.assigneeId],
    actorId,
    type: 'card.assigned',
    title,
    body,
    link: '/projets',
    entityType: 'card',
    entityId: card.id,
    email: emailFor(title, { title, body, link: '/projets' }),
  });
}

/**
 * Fan out the notifications for a freshly-posted comment (best-effort).
 * Recipients = dedup( mentions ∪ {assignee, creator} ) minus the author:
 * mentioned teammates get a `card.comment.mention` notice ("Vous avez été
 * mentionné"), the assignee/creator a `card.comment` one ("Nouveau commentaire").
 */
async function notifyCommentRecipients(
  cardId: number, tenantId: number, authorId: number, body: string, mentions: number[],
): Promise<void> {
  const card = await cardService.getById(cardId, tenantId);
  if (!card) return;
  // Only people with access to the board may be notified - never leak a comment snippet to an
  // arbitrary tenant user via a crafted @mention.
  const allowed = new Set((await boardService.getMembers(card.boardId, tenantId)).map((m) => m.userId));
  const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  const link = '/projets';

  // Mentioned teammates who are board members (minus the author).
  const mentionIds = [...new Set(mentions)].filter((id) => id > 0 && id !== authorId && allowed.has(id));
  // Card assignee + creator, minus the author and anyone already mentioned.
  const ownerIds = [...new Set([card.assigneeId, card.createdBy].filter((v): v is number => v != null))]
    .filter((id) => id !== authorId && !mentionIds.includes(id));

  if (mentionIds.length) {
    const title = 'Vous avez été mentionné';
    await notify(tenantId, {
      recipientIds: mentionIds, actorId: authorId, type: 'card.comment.mention',
      title, body: snippet, link, entityType: 'card', entityId: cardId,
      email: emailFor(title, { title, body: snippet, link }),
    });
  }
  if (ownerIds.length) {
    const title = 'Nouveau commentaire';
    await notify(tenantId, {
      recipientIds: ownerIds, actorId: authorId, type: 'card.comment',
      title, body: snippet, link, entityType: 'card', entityId: cardId,
      email: emailFor(title, { title, body: snippet, link }),
    });
  }
}

// ── Row types + mappers ──────────────────────────────────────────────────────
const d = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? v.slice(0, 10) : toIso(v);

interface BoardRow {
  id: number; tenant_id: number; owner_id: number; client_id: number | null; name: string; description: string | null;
  created_at: Date; updated_at: Date;
}
interface ColumnRow {
  id: number; tenant_id: number; board_id: number; name: string; position: number;
  wip_limit: number | null; is_done: boolean; created_at: Date; updated_at: Date;
}
interface SprintRow {
  id: number; tenant_id: number; board_id: number; name: string; goal: string | null;
  start_date: Date | string | null; end_date: Date | string | null; status: string;
  created_at: Date; updated_at: Date;
}
interface CardRow {
  id: number; tenant_id: number; board_id: number; column_id: number; sprint_id: number | null;
  title: string; description: string | null; position: number; points: number | null;
  estimate_min: number | null;
  priority: string | null; start_date: Date | string | null; due_date: Date | string | null;
  assignee_id: number | null; parent_card_id: number | null; created_by: number | null;
  created_at: Date; updated_at: Date;
}
interface BoardMemberRow {
  id: number; tenant_id: number; board_id: number; user_id: number; role: string;
  user_name: string; created_at: Date | string;
}
interface CardLinkRow {
  id: number; tenant_id: number; board_id: number; source_card_id: number; target_card_id: number;
  type: string; created_at: Date | string;
}
interface CardCommentRow {
  id: number; tenant_id: number; card_id: number; author_id: number | null;
  author_name: string; body: string; created_at: Date | string;
}
interface CardActivityRow {
  id: number; tenant_id: number; card_id: number; actor_id: number | null;
  actor_name: string; type: string; meta: Record<string, unknown> | null; created_at: Date | string;
}

const rowToBoard = (r: BoardRow): Board => ({
  id: r.id, tenantId: r.tenant_id, ownerId: r.owner_id, clientId: r.client_id, name: r.name, description: r.description,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToColumn = (r: ColumnRow): BoardColumn => ({
  id: r.id, tenantId: r.tenant_id, boardId: r.board_id, name: r.name, position: r.position,
  wipLimit: r.wip_limit, isDone: r.is_done, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToSprint = (r: SprintRow): Sprint => ({
  id: r.id, tenantId: r.tenant_id, boardId: r.board_id, name: r.name, goal: r.goal,
  startDate: d(r.start_date), endDate: d(r.end_date), status: r.status as SprintStatus,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const rowToCard = (r: CardRow): Card => ({
  id: r.id, tenantId: r.tenant_id, boardId: r.board_id, columnId: r.column_id, sprintId: r.sprint_id,
  title: r.title, description: r.description, position: r.position, points: r.points,
  estimateMin: r.estimate_min,
  priority: (r.priority as CardPriority) ?? null, startDate: d(r.start_date), dueDate: d(r.due_date), assigneeId: r.assignee_id,
  parentCardId: r.parent_card_id ?? null, createdBy: r.created_by,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const ts = (v: Date | string): string => (typeof v === 'string' ? v : v.toISOString());
const rowToBoardMember = (r: BoardMemberRow): BoardMember => ({
  id: r.id, tenantId: r.tenant_id, boardId: r.board_id, userId: r.user_id,
  role: r.role as BoardMemberRole, userName: r.user_name, createdAt: ts(r.created_at),
});
const rowToCardLink = (r: CardLinkRow): CardLink => ({
  id: r.id, tenantId: r.tenant_id, boardId: r.board_id,
  sourceCardId: r.source_card_id, targetCardId: r.target_card_id,
  type: r.type as CardLinkType, createdAt: ts(r.created_at),
});
const rowToCardComment = (r: CardCommentRow): CardComment => ({
  id: r.id, tenantId: r.tenant_id, cardId: r.card_id,
  authorId: r.author_id, authorName: r.author_name, body: r.body, createdAt: ts(r.created_at),
});
const rowToCardActivity = (r: CardActivityRow): CardActivity => ({
  id: r.id, tenantId: r.tenant_id, cardId: r.card_id, actorId: r.actor_id, actorName: r.actor_name,
  type: r.type as CardActivityType, meta: r.meta ?? null, createdAt: ts(r.created_at),
});

const DEFAULT_COLUMNS = ['À faire', 'En cours', 'Terminé'];

/** Minimal session shape used to gate board visibility/access. */
export interface BoardViewer {
  userId: number;
  role: string;
}

export const boardService = {
  async listForUser(tenantId: number, ownerId: number): Promise<Board[]> {
    const rows = await db<BoardRow>('boards').where({ tenant_id: tenantId, owner_id: ownerId }).orderBy('name');
    return rows.map(rowToBoard);
  },

  /**
   * Boards a user may see: their own, plus (for managers) those owned by their
   * direct reports, plus boards their teams (Axis C) scope to, plus everything
   * for a platform admin.
   */
  async listVisible(tenantId: number, user: BoardViewer): Promise<Board[]> {
    const q = db<BoardRow>('boards').where({ tenant_id: tenantId });
    if (user.role !== 'admin') {
      const scope = await teamService.resolveScope(user.userId, tenantId, { role: user.role });
      if (!scope.allProjects) {
        q.andWhere((b) => {
          b.where('owner_id', user.userId).orWhereIn(
            'owner_id',
            db('users').select('id').where({ manager_id: user.userId, tenant_id: tenantId }),
          );
          // Board membership is an additional visibility source (union with the
          // existing owner/manager/client/team-scope grants).
          b.orWhereIn(
            'id',
            db('board_members').select('board_id').where({ user_id: user.userId, tenant_id: tenantId }),
          );
          if (scope.allClients) b.orWhereNotNull('client_id');
          else if (scope.clientIds.size) b.orWhereIn('client_id', [...scope.clientIds]);
          if (scope.projectIds.size) b.orWhereIn('id', [...scope.projectIds]);
        });
      }
    }
    const rows = await q.orderBy('name');
    return rows.map(rowToBoard);
  },

  /** Every board in the tenant (admin picker for team project scope). */
  async listAll(tenantId: number): Promise<Board[]> {
    const rows = await db<BoardRow>('boards').where({ tenant_id: tenantId }).orderBy('name');
    return rows.map(rowToBoard);
  },

  /**
   * Can `user` access `board`? Owner, platform admin, manager-of-owner, or a
   * member of a team whose Axis-C scope reaches this project (or its client).
   */
  async canAccess(board: Board, user: BoardViewer): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (board.ownerId === user.userId) return true;
    // Board membership grants access (added to, not replacing, the grants below).
    const member = await db('board_members')
      .where({ board_id: board.id, tenant_id: board.tenantId, user_id: user.userId })
      .first<{ id: number }>('id');
    if (member) return true;
    const owner = await db('users')
      .where({ id: board.ownerId, tenant_id: board.tenantId })
      .first<{ manager_id: number | null }>();
    if (owner && owner.manager_id === user.userId) return true;
    const scope = await teamService.resolveScope(user.userId, board.tenantId, { role: user.role });
    if (scope.allProjects) return true;
    if (scope.projectIds.has(board.id)) return true;
    if (board.clientId != null && (scope.allClients || scope.clientIds.has(board.clientId))) return true;
    return false;
  },

  async getById(id: number, tenantId: number): Promise<Board | null> {
    const row = await db<BoardRow>('boards').where({ id, tenant_id: tenantId }).first();
    return row ? rowToBoard(row) : null;
  },

  async getDetail(id: number, tenantId: number): Promise<BoardDetail | null> {
    const board = await this.getById(id, tenantId);
    if (!board) return null;
    const [columns, cards, sprints, members, links] = await Promise.all([
      db<ColumnRow>('board_columns').where({ board_id: id }).orderBy('position'),
      db<CardRow>('cards').where({ board_id: id }).orderBy(['column_id', 'position']),
      db<SprintRow>('sprints').where({ board_id: id }).orderBy('id'),
      this.getMembers(id, tenantId),
      db<CardLinkRow>('card_links').where({ board_id: id, tenant_id: tenantId }).orderBy('id'),
    ]);
    return {
      ...board,
      columns: columns.map(rowToColumn),
      cards: cards.map(rowToCard),
      sprints: sprints.map(rowToSprint),
      members,
      links: links.map(rowToCardLink),
    };
  },

  async create(tenantId: number, ownerId: number, data: { name: string; description?: string | null; clientId?: number | null }): Promise<BoardDetail> {
    // Never trust a client-supplied clientId (the CSV import forwards it): the client
    // must belong to THIS tenant, else drop it (no cross-tenant dangling reference).
    let clientId = data.clientId ?? null;
    if (clientId != null) {
      const owned = await db('clients').where({ id: clientId, tenant_id: tenantId }).first('id');
      if (!owned) clientId = null;
    }
    const [row] = await db<BoardRow>('boards')
      .insert({ tenant_id: tenantId, owner_id: ownerId, name: data.name, description: data.description ?? null, client_id: clientId })
      .returning('*');
    await db('board_columns').insert(
      DEFAULT_COLUMNS.map((name, i) => ({ tenant_id: tenantId, board_id: row.id, name, position: i })),
    );
    // The creator is the board's first member, as its owner.
    await db('board_members').insert({ tenant_id: tenantId, board_id: row.id, user_id: ownerId, role: 'owner' });
    return (await this.getDetail(row.id, tenantId))!;
  },

  // ── Membership ───────────────────────────────────────────────────────────────
  /** Members of a board with their display name (COALESCE(display_name, username)). */
  async getMembers(boardId: number, tenantId: number): Promise<BoardMember[]> {
    const rows = await db<BoardMemberRow>('board_members as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where({ 'm.board_id': boardId, 'm.tenant_id': tenantId })
      .orderBy('m.id')
      .select('m.*', db.raw('COALESCE(u.display_name, u.username) as user_name'));
    return rows.map(rowToBoardMember);
  },

  async getMember(boardId: number, tenantId: number, userId: number): Promise<BoardMember | null> {
    const row = await db<BoardMemberRow>('board_members as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where({ 'm.board_id': boardId, 'm.tenant_id': tenantId, 'm.user_id': userId })
      .first('m.*', db.raw('COALESCE(u.display_name, u.username) as user_name'));
    return row ? rowToBoardMember(row) : null;
  },

  /** Add (or, on conflict, re-role) a member. Default role 'member'. */
  async addMember(boardId: number, tenantId: number, userId: number, role: BoardMemberRole = 'member'): Promise<BoardMember> {
    // The target must belong to the tenant (no cross-tenant member rows).
    const inTenant = await db('user_tenants').where({ user_id: userId, tenant_id: tenantId }).first();
    if (!inTenant) throw new AppError(400, 'Utilisateur hors du workspace');
    // Re-roling an existing member must go through the last-owner-guarded path.
    const existing = await this.getMember(boardId, tenantId, userId);
    if (existing) return (await this.updateMemberRole(boardId, tenantId, userId, role))!;
    await db('board_members').insert({ tenant_id: tenantId, board_id: boardId, user_id: userId, role });
    return (await this.getMember(boardId, tenantId, userId))!;
  },

  async updateMemberRole(boardId: number, tenantId: number, userId: number, role: BoardMemberRole): Promise<BoardMember | null> {
    if (role !== 'owner') await this.assertNotLastOwner(boardId, tenantId, userId);
    const updated = await db('board_members')
      .where({ board_id: boardId, tenant_id: tenantId, user_id: userId })
      .update({ role });
    if (!updated) return null;
    return this.getMember(boardId, tenantId, userId);
  },

  async removeMember(boardId: number, tenantId: number, userId: number): Promise<boolean> {
    await this.assertNotLastOwner(boardId, tenantId, userId);
    return (await db('board_members').where({ board_id: boardId, tenant_id: tenantId, user_id: userId }).del()) > 0;
  },

  /** Guard: refuse to demote/remove the board's sole remaining owner. */
  async assertNotLastOwner(boardId: number, tenantId: number, userId: number): Promise<void> {
    const current = await db('board_members')
      .where({ board_id: boardId, tenant_id: tenantId, user_id: userId })
      .first<{ role: string }>('role');
    if (current?.role !== 'owner') return;
    const owners = await db('board_members')
      .where({ board_id: boardId, tenant_id: tenantId, role: 'owner' })
      .count<{ c: string }[]>('* as c');
    if (Number(owners[0]?.c ?? 0) <= 1) throw new AppError(400, 'Le dernier propriétaire du tableau ne peut pas être retiré');
  },

  /** A board manager = board member with role owner|admin, or a tenant admin. */
  async isBoardManager(boardId: number, tenantId: number, userId: number): Promise<boolean> {
    const user = await db('users').where({ id: userId, tenant_id: tenantId }).first<{ role: string }>('role');
    if (user?.role === 'admin') return true;
    const member = await db('board_members')
      .where({ board_id: boardId, tenant_id: tenantId, user_id: userId })
      .first<{ role: string }>('role');
    return member?.role === 'owner' || member?.role === 'admin';
  },

  async update(id: number, tenantId: number, data: { name?: string; description?: string | null }): Promise<Board | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    const [row] = await db<BoardRow>('boards').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToBoard(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('boards').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

export const columnService = {
  async create(tenantId: number, boardId: number, data: { name: string; wipLimit?: number | null }): Promise<BoardColumn> {
    const max = await db('board_columns').where({ board_id: boardId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<ColumnRow>('board_columns')
      .insert({ tenant_id: tenantId, board_id: boardId, name: data.name, position: (max?.m ?? -1) + 1, wip_limit: data.wipLimit ?? null, is_done: false })
      .returning('*');
    return rowToColumn(row);
  },
  async update(id: number, tenantId: number, data: { name?: string; position?: number; wipLimit?: number | null; isDone?: boolean }): Promise<BoardColumn | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.position !== undefined) patch.position = data.position;
    if (data.wipLimit !== undefined) patch.wip_limit = data.wipLimit;
    if (data.isDone !== undefined) patch.is_done = data.isDone;
    const [row] = await db<ColumnRow>('board_columns').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToColumn(row) : null;
  },
  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('board_columns').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

export const sprintService = {
  async create(tenantId: number, boardId: number, data: { name: string; goal?: string | null; startDate?: string | null; endDate?: string | null; status?: SprintStatus }): Promise<Sprint> {
    const [row] = await db<SprintRow>('sprints')
      .insert({ tenant_id: tenantId, board_id: boardId, name: data.name, goal: data.goal ?? null, start_date: data.startDate ?? null, end_date: data.endDate ?? null, status: data.status ?? 'planned' })
      .returning('*');
    return rowToSprint(row);
  },
  async update(id: number, tenantId: number, data: { name?: string; goal?: string | null; startDate?: string | null; endDate?: string | null; status?: SprintStatus }): Promise<Sprint | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.goal !== undefined) patch.goal = data.goal;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.status !== undefined) patch.status = data.status;
    const [row] = await db<SprintRow>('sprints').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToSprint(row) : null;
  },
  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('sprints').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

export interface CardInput {
  columnId: number;
  sprintId?: number | null;
  title: string;
  description?: string | null;
  points?: number | null;
  /** Planned effort in minutes (null = no estimate). */
  estimateMin?: number | null;
  priority?: CardPriority | null;
  startDate?: string | null;
  dueDate?: string | null;
  assigneeId?: number | null;
  /** Parent card for subtasks (null/omitted = top-level). */
  parentCardId?: number | null;
}

export const activityService = {
  /** A card's change history, newest first, with the actor's display name. */
  async getActivity(cardId: number, tenantId: number): Promise<CardActivity[]> {
    const rows = await db<CardActivityRow>('card_activity as a')
      .leftJoin('users as u', 'u.id', 'a.actor_id')
      .where({ 'a.card_id': cardId, 'a.tenant_id': tenantId })
      .orderBy('a.created_at', 'desc')
      .orderBy('a.id', 'desc')
      .select('a.*', db.raw("COALESCE(u.display_name, u.username, '-') as actor_name"));
    return rows.map(rowToCardActivity);
  },

  /** Append one activity entry (best-effort: never throws / breaks the mutation). */
  async logActivity(
    cardId: number, tenantId: number, actorId: number | null | undefined,
    type: CardActivityType, meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db('card_activity').insert({
        tenant_id: tenantId, card_id: cardId, actor_id: actorId ?? null,
        type, meta: meta ? JSON.stringify(meta) : null,
      });
    } catch (err) {
      logger.warn({ err, cardId, type }, 'logActivity: failed (non-fatal)');
    }
  },
};

export const cardService = {
  async getById(id: number, tenantId: number): Promise<Card | null> {
    const row = await db<CardRow>('cards').where({ id, tenant_id: tenantId }).first();
    return row ? rowToCard(row) : null;
  },
  async create(tenantId: number, boardId: number, actorId: number, data: CardInput): Promise<Card> {
    if (data.parentCardId != null) {
      const parent = await db('cards').where({ id: data.parentCardId, board_id: boardId, tenant_id: tenantId }).first('id');
      if (!parent) throw new AppError(400, 'La carte parente doit appartenir au tableau');
    }
    const max = await db('cards').where({ column_id: data.columnId }).max('position as m').first<{ m: number | null }>();
    const [row] = await db<CardRow>('cards')
      .insert({
        tenant_id: tenantId, board_id: boardId, column_id: data.columnId, sprint_id: data.sprintId ?? null,
        title: data.title, description: data.description ?? null, position: (max?.m ?? -1) + 1,
        points: data.points ?? null, estimate_min: data.estimateMin ?? null, priority: data.priority ?? null,
        start_date: data.startDate ?? null, due_date: data.dueDate ?? null,
        assignee_id: data.assigneeId ?? null, parent_card_id: data.parentCardId ?? null, created_by: actorId,
      })
      .returning('*');
    const card = rowToCard(row);
    await activityService.logActivity(card.id, tenantId, actorId, 'created');
    await notifyCardAssignment(card, actorId);
    return card;
  },
  async update(
    id: number,
    tenantId: number,
    data: Partial<CardInput> & { position?: number },
    actorId?: number,
  ): Promise<Card | null> {
    if (data.parentCardId != null) {
      if (data.parentCardId === id) throw new AppError(400, 'Une carte ne peut pas être sa propre sous-tâche');
      const self = await db<CardRow>('cards').where({ id, tenant_id: tenantId }).first('board_id');
      const parent = await db('cards')
        .where({ id: data.parentCardId, board_id: self?.board_id, tenant_id: tenantId })
        .first('id');
      if (!parent) throw new AppError(400, 'La carte parente doit appartenir au tableau');
    }
    // Snapshot the fields we may need to diff for activity / notifications.
    const needsPrev = data.assigneeId !== undefined || data.columnId !== undefined;
    const prev = needsPrev
      ? await db<CardRow>('cards').where({ id, tenant_id: tenantId }).first('assignee_id', 'column_id')
      : null;
    const prevAssignee = prev?.assignee_id ?? null;
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.columnId !== undefined) patch.column_id = data.columnId;
    if (data.sprintId !== undefined) patch.sprint_id = data.sprintId;
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.points !== undefined) patch.points = data.points;
    if (data.estimateMin !== undefined) patch.estimate_min = data.estimateMin;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.parentCardId !== undefined) patch.parent_card_id = data.parentCardId;
    if (data.position !== undefined) patch.position = data.position;
    const [row] = await db<CardRow>('cards').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    if (!row) return null;
    const card = rowToCard(row);
    // Activity (best-effort): a column move, an assignee change, else a generic update.
    const moved = data.columnId !== undefined && prev != null && card.columnId !== prev.column_id;
    const reassigned = data.assigneeId !== undefined && card.assigneeId !== prevAssignee;
    if (moved) await activityService.logActivity(card.id, tenantId, actorId, 'moved', { from: prev!.column_id, to: card.columnId });
    if (reassigned) await activityService.logActivity(card.id, tenantId, actorId, 'assigned', { assigneeId: card.assigneeId });
    if (!moved && !reassigned) await activityService.logActivity(card.id, tenantId, actorId, 'updated');
    // Notify only when the assignee actually changed to a new teammate.
    if (reassigned) {
      await notifyCardAssignment(card, actorId);
    }
    return card;
  },
  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('cards').where({ id, tenant_id: tenantId }).del()) > 0;
  },

  // ── Dependencies (card_links) ────────────────────────────────────────────────
  async getLink(linkId: number, tenantId: number): Promise<CardLink | null> {
    const row = await db<CardLinkRow>('card_links').where({ id: linkId, tenant_id: tenantId }).first();
    return row ? rowToCardLink(row) : null;
  },
  /** Link two cards of the same board. Rejects self-links and cross-board cards. */
  async addLink(
    boardId: number,
    tenantId: number,
    sourceCardId: number,
    targetCardId: number,
    type: CardLinkType,
  ): Promise<CardLink> {
    if (sourceCardId === targetCardId) throw new AppError(400, 'Une carte ne peut pas dépendre d’elle-même');
    const cards = await db<CardRow>('cards')
      .where({ board_id: boardId, tenant_id: tenantId })
      .whereIn('id', [sourceCardId, targetCardId])
      .select('id');
    if (cards.length !== 2) throw new AppError(400, 'Les deux cartes doivent appartenir au tableau');
    const [row] = await db<CardLinkRow>('card_links')
      .insert({ tenant_id: tenantId, board_id: boardId, source_card_id: sourceCardId, target_card_id: targetCardId, type })
      .onConflict(['source_card_id', 'target_card_id', 'type'])
      .merge({ type })
      .returning('*');
    return rowToCardLink(row);
  },
  async removeLink(linkId: number, tenantId: number): Promise<boolean> {
    return (await db('card_links').where({ id: linkId, tenant_id: tenantId }).del()) > 0;
  },
};

export const commentService = {
  /** A card's comments, oldest first, with the author's display name. */
  async getComments(cardId: number, tenantId: number): Promise<CardComment[]> {
    const rows = await db<CardCommentRow>('card_comments as c')
      .leftJoin('users as u', 'u.id', 'c.author_id')
      .where({ 'c.card_id': cardId, 'c.tenant_id': tenantId })
      .orderBy('c.created_at', 'asc')
      .orderBy('c.id', 'asc')
      .select('c.*', db.raw("COALESCE(u.display_name, u.username, '-') as author_name"));
    return rows.map(rowToCardComment);
  },

  /** A single comment (with author name) - null if it isn't in this tenant. */
  async getCommentById(commentId: number, tenantId: number): Promise<CardComment | null> {
    const row = await db<CardCommentRow>('card_comments as c')
      .leftJoin('users as u', 'u.id', 'c.author_id')
      .where({ 'c.id': commentId, 'c.tenant_id': tenantId })
      .first('c.*', db.raw("COALESCE(u.display_name, u.username, '-') as author_name"));
    return row ? rowToCardComment(row) : null;
  },

  /**
   * Post a comment. The side effects (activity entry + mention/owner
   * notifications) are best-effort and never break the insert.
   */
  async addComment(
    cardId: number, tenantId: number, authorId: number, body: string, mentions: number[],
  ): Promise<CardComment> {
    const [row] = await db<CardCommentRow>('card_comments')
      .insert({ tenant_id: tenantId, card_id: cardId, author_id: authorId, body })
      .returning('id');
    try {
      await activityService.logActivity(cardId, tenantId, authorId, 'commented');
      await notifyCommentRecipients(cardId, tenantId, authorId, body, mentions);
    } catch (err) {
      logger.warn({ err, cardId }, 'addComment: side effects failed (non-fatal)');
    }
    return (await this.getCommentById(row.id, tenantId))!;
  },

  /** Delete a comment. Allowed for its author OR a board manager. */
  async deleteComment(
    commentId: number, tenantId: number, userId: number, isManager: boolean,
  ): Promise<boolean> {
    const row = await db('card_comments')
      .where({ id: commentId, tenant_id: tenantId })
      .first<{ author_id: number | null }>('author_id');
    if (!row) return false;
    if (!isManager && row.author_id !== userId) {
      throw new AppError(403, 'Vous ne pouvez supprimer que vos propres commentaires');
    }
    return (await db('card_comments').where({ id: commentId, tenant_id: tenantId }).del()) > 0;
  },
};

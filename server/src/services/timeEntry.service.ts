import { db } from '../db';
import type { TimeEntry, CardTimeTotal } from '@obliplan/shared';
import { toIso, todayIso } from '../utils/date';
import { AppError } from '../middleware/errorHandler';

/** Reject a board_id / card_id that does not belong to the tenant (prevents cross-tenant refs). */
async function assertRefsInTenant(tenantId: number, boardId?: number | null, cardId?: number | null): Promise<void> {
  if (boardId != null && !(await db('boards').where({ id: boardId, tenant_id: tenantId }).first('id'))) {
    throw new AppError(400, 'Projet introuvable');
  }
  if (cardId != null && !(await db('cards').where({ id: cardId, tenant_id: tenantId }).first('id'))) {
    throw new AppError(400, 'Tâche introuvable');
  }
}

interface TimeEntryRow {
  id: number;
  tenant_id: number;
  user_id: number;
  board_id: number | null;
  card_id: number | null;
  minutes: number;
  note: string | null;
  spent_on: Date | string | null;
  is_running: boolean;
  started_at: Date | null;
  created_at: Date;
}

/** A board entry enriched with the teammate's name and the card's title (left-joins). */
interface BoardTimeEntryRow extends TimeEntryRow {
  user_name: string | null;
  card_title: string | null;
}

const isoDate = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? v.slice(0, 10) : toIso(v);

export function rowToTimeEntry(r: TimeEntryRow): TimeEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    boardId: r.board_id,
    cardId: r.card_id,
    minutes: r.minutes,
    note: r.note,
    spentOn: isoDate(r.spent_on),
    isRunning: r.is_running,
    startedAt: r.started_at ? r.started_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

function rowToBoardTimeEntry(r: BoardTimeEntryRow): TimeEntry {
  return {
    ...rowToTimeEntry(r),
    userName: r.user_name ?? undefined,
    cardTitle: r.card_title,
  };
}

export interface StartTimerInput {
  boardId?: number | null;
  cardId?: number | null;
  note?: string | null;
}

export interface ManualEntryInput {
  boardId?: number | null;
  cardId?: number | null;
  minutes: number;
  note?: string | null;
  spentOn?: string | null;
  /** Teammate the time is for; defaults to the caller (manager-on-behalf logging). */
  userId?: number;
}

export interface UpdateTimeEntryInput {
  boardId?: number | null;
  cardId?: number | null;
  minutes?: number;
  note?: string | null;
  spentOn?: string | null;
}

/** Minutes elapsed since a started_at timestamp (rounded down, never negative). */
function elapsedMinutes(startedAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60000));
}

export const timeEntryService = {
  async listForUser(tenantId: number, userId: number): Promise<TimeEntry[]> {
    const rows = await db<TimeEntryRow>('time_entries')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy([
        { column: 'is_running', order: 'desc' },
        { column: 'spent_on', order: 'desc' },
        { column: 'created_at', order: 'desc' },
      ]);
    return rows.map(rowToTimeEntry);
  },

  /** All entries on a board, enriched with the teammate's name and the card's title. */
  async listForBoard(tenantId: number, boardId: number): Promise<TimeEntry[]> {
    const rows = await db('time_entries')
      .leftJoin('users', 'users.id', 'time_entries.user_id')
      // Tenant-scope the card join so a stray cross-tenant card_id can never leak a foreign title.
      .leftJoin('cards', function () {
        this.on('cards.id', 'time_entries.card_id').andOn('cards.tenant_id', 'time_entries.tenant_id');
      })
      .where({ 'time_entries.tenant_id': tenantId, 'time_entries.board_id': boardId })
      .orderBy('time_entries.created_at', 'desc')
      .select<BoardTimeEntryRow[]>(
        'time_entries.*',
        db.raw('COALESCE(users.display_name, users.username) AS user_name'),
        'cards.title AS card_title',
      );
    return rows.map(rowToBoardTimeEntry);
  },

  async getById(id: number, tenantId: number): Promise<TimeEntry | null> {
    const row = await db<TimeEntryRow>('time_entries').where({ id, tenant_id: tenantId }).first();
    return row ? rowToTimeEntry(row) : null;
  },

  /** The user's currently running timer (at most one), if any. */
  async getRunning(tenantId: number, userId: number): Promise<TimeEntry | null> {
    const row = await db<TimeEntryRow>('time_entries')
      .where({ tenant_id: tenantId, user_id: userId, is_running: true })
      .first();
    return row ? rowToTimeEntry(row) : null;
  },

  /** Total minutes per card for a board (cardId null = time not tied to a card). */
  async totalsPerCard(tenantId: number, boardId: number): Promise<CardTimeTotal[]> {
    const rows = await db<TimeEntryRow>('time_entries')
      .where({ tenant_id: tenantId, board_id: boardId })
      .groupBy('card_id')
      .select('card_id')
      .sum<{ card_id: number | null; total: string }[]>({ total: 'minutes' });
    return rows.map((r) => ({ cardId: r.card_id, minutes: Number(r.total) }));
  },

  /** Start a timer - only one may run per user, so stop any other first. */
  async start(tenantId: number, userId: number, data: StartTimerInput): Promise<TimeEntry> {
    await assertRefsInTenant(tenantId, data.boardId, data.cardId);
    return db.transaction(async (trx) => {
      const running = await trx<TimeEntryRow>('time_entries')
        .where({ tenant_id: tenantId, user_id: userId, is_running: true })
        .forUpdate();
      for (const r of running) {
        const minutes = r.started_at ? elapsedMinutes(r.started_at) : r.minutes;
        await trx('time_entries').where({ id: r.id }).update({ is_running: false, minutes });
      }
      const [row] = await trx<TimeEntryRow>('time_entries')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          board_id: data.boardId ?? null,
          card_id: data.cardId ?? null,
          minutes: 0,
          note: data.note ?? null,
          spent_on: todayIso(),
          is_running: true,
          started_at: new Date(),
        })
        .returning('*');
      return rowToTimeEntry(row);
    });
  },

  /** Stop a running entry, committing the elapsed minutes. */
  async stop(id: number, tenantId: number, userId: number): Promise<TimeEntry | null> {
    const existing = await db<TimeEntryRow>('time_entries')
      .where({ id, tenant_id: tenantId, user_id: userId, is_running: true })
      .first();
    if (!existing) return null;
    const minutes = existing.started_at ? elapsedMinutes(existing.started_at) : existing.minutes;
    const [row] = await db<TimeEntryRow>('time_entries')
      .where({ id, tenant_id: tenantId })
      .update({ is_running: false, minutes })
      .returning('*');
    return row ? rowToTimeEntry(row) : null;
  },

  /** Create a finished manual entry (no timer). */
  async createManual(tenantId: number, userId: number, data: ManualEntryInput): Promise<TimeEntry> {
    await assertRefsInTenant(tenantId, data.boardId, data.cardId);
    const [row] = await db<TimeEntryRow>('time_entries')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId ?? userId,
        board_id: data.boardId ?? null,
        card_id: data.cardId ?? null,
        minutes: data.minutes,
        note: data.note ?? null,
        spent_on: data.spentOn ?? todayIso(),
        is_running: false,
        started_at: null,
      })
      .returning('*');
    return rowToTimeEntry(row);
  },

  /** Patch an existing entry (board/card/minutes/note/date). Only provided fields change. */
  async update(id: number, tenantId: number, data: UpdateTimeEntryInput): Promise<TimeEntry | null> {
    const patch: Partial<TimeEntryRow> = {};
    if (data.boardId !== undefined) patch.board_id = data.boardId;
    if (data.cardId !== undefined) patch.card_id = data.cardId;
    if (data.minutes !== undefined) patch.minutes = data.minutes;
    if (data.note !== undefined) patch.note = data.note;
    if (data.spentOn !== undefined) patch.spent_on = data.spentOn;
    if (Object.keys(patch).length === 0) return timeEntryService.getById(id, tenantId);
    const [row] = await db<TimeEntryRow>('time_entries')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToTimeEntry(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('time_entries').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};

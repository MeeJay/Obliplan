import { db } from '../db';
import type { OvertimeDeclaration, OvertimeStatus, OvertimeTeamSummary } from '@obliplan/shared';
import { toIso, mondayOf } from '../utils/date';

interface OvertimeDeclarationRow {
  id: number;
  tenant_id: number;
  user_id: number;
  nature_id: number;
  date: Date | string;
  minutes: number;
  recup_minutes: number;
  motif: string | null;
  status: string;
  decided_by: number | null;
  decided_at: Date | null;
  decision_comment: string | null;
  created_at: Date;
  updated_at: Date;
  /** Joined display name (only present on enriched feeds like getPending). */
  user_name?: string;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));

export function rowToOvertimeDeclaration(r: OvertimeDeclarationRow): OvertimeDeclaration {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    natureId: r.nature_id,
    date: isoDate(r.date),
    minutes: r.minutes,
    recupMinutes: r.recup_minutes,
    motif: r.motif,
    status: r.status as OvertimeStatus,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
    decisionComment: r.decision_comment,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    ...(r.user_name !== undefined ? { userName: r.user_name } : {}),
  };
}

export interface OvertimeDeclarationInput {
  userId: number;
  natureId: number;
  date: string;
  minutes: number;
  recupMinutes?: number;
  motif?: string | null;
}

export const overtimeDeclarationService = {
  async getForUser(tenantId: number, userId: number): Promise<OvertimeDeclaration[]> {
    const rows = await db<OvertimeDeclarationRow>('overtime_declarations')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('date', 'desc');
    return rows.map(rowToOvertimeDeclaration);
  },

  async getById(id: number, tenantId: number): Promise<OvertimeDeclaration | null> {
    const row = await db<OvertimeDeclarationRow>('overtime_declarations').where({ id, tenant_id: tenantId }).first();
    return row ? rowToOvertimeDeclaration(row) : null;
  },

  /** Pending declarations for a manager's reports (or whole tenant for admin), enriched with the employee name. */
  async getPending(tenantId: number, managerId: number | null): Promise<OvertimeDeclaration[]> {
    const q = db<OvertimeDeclarationRow>('overtime_declarations as od')
      .join('users as u', 'u.id', 'od.user_id')
      .where('od.tenant_id', tenantId)
      .andWhere('od.status', 'en_attente')
      .orderBy('od.date')
      .select('od.*', db.raw('COALESCE(u.display_name, u.username) as user_name'));
    if (managerId !== null) {
      q.andWhere('u.manager_id', managerId);
    }
    return (await q).map(rowToOvertimeDeclaration);
  },

  async create(tenantId: number, data: OvertimeDeclarationInput): Promise<OvertimeDeclaration> {
    const [row] = await db<OvertimeDeclarationRow>('overtime_declarations')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        nature_id: data.natureId,
        date: data.date,
        minutes: data.minutes,
        recup_minutes: data.recupMinutes ?? 0,
        motif: data.motif ?? null,
        status: 'en_attente',
      })
      .returning('*');
    return rowToOvertimeDeclaration(row);
  },

  async decide(
    id: number,
    tenantId: number,
    deciderId: number,
    decision: 'valide' | 'refuse',
    comment?: string | null,
  ): Promise<OvertimeDeclaration | null> {
    const [row] = await db<OvertimeDeclarationRow>('overtime_declarations')
      .where({ id, tenant_id: tenantId })
      .update({
        status: decision,
        decided_by: deciderId,
        decided_at: new Date(),
        decision_comment: comment ?? null,
        updated_at: db.fn.now(),
      })
      .returning('*');
    if (!row) return null;
    const decl = rowToOvertimeDeclaration(row);
    // Credits récup when validé + recupMinutes>0, removes it on refuse.
    await this.syncRecupCredit(decl);
    return decl;
  },

  /**
   * Apply corrected values and revert the declaration to `en_attente` (clearing any
   * prior decision). Used both for an owner editing a still-pending declaration and
   * for a "demande de modification" on an already-validated one.
   */
  async update(
    id: number,
    tenantId: number,
    data: Partial<Pick<OvertimeDeclarationInput, 'natureId' | 'date' | 'minutes' | 'recupMinutes' | 'motif'>>,
  ): Promise<OvertimeDeclaration | null> {
    const patch: Record<string, unknown> = {
      status: 'en_attente',
      decided_by: null,
      decided_at: null,
      decision_comment: null,
      updated_at: db.fn.now(),
    };
    if (data.natureId !== undefined) patch.nature_id = data.natureId;
    if (data.date !== undefined) patch.date = data.date;
    if (data.minutes !== undefined) patch.minutes = data.minutes;
    if (data.recupMinutes !== undefined) patch.recup_minutes = data.recupMinutes;
    if (data.motif !== undefined) patch.motif = data.motif ?? null;
    const [row] = await db<OvertimeDeclarationRow>('overtime_declarations')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    if (!row) return null;
    const decl = rowToOvertimeDeclaration(row);
    // Update reverts status to en_attente → drop any previously-credited récup.
    await this.syncRecupCredit(decl);
    return decl;
  },

  // delete is unchanged: the linked récup credit is removed by the FK ON DELETE CASCADE.
  async delete(id: number, tenantId: number): Promise<boolean> {
    const count = await db<OvertimeDeclarationRow>('overtime_declarations')
      .where({ id, tenant_id: tenantId })
      .del();
    return count > 0;
  },

  /**
   * Maintain the invariant "a linked récup credit exists IFF
   * decl.status==='valide' && decl.recupMinutes>0, equal to recupMinutes, on the
   * Monday of decl.date". Idempotent via the recup_overtime_decl_uniq partial index.
   */
  async syncRecupCredit(decl: OvertimeDeclaration): Promise<void> {
    const target = decl.status === 'valide' && decl.recupMinutes > 0 ? decl.recupMinutes : 0;
    const existing = await db('recup_mouvements')
      .where({ overtime_declaration_id: decl.id, tenant_id: decl.tenantId })
      .first();
    if (target === 0) {
      if (existing) await db('recup_mouvements').where({ id: existing.id, tenant_id: decl.tenantId }).del();
      return;
    }
    const semaine = mondayOf(decl.date);
    if (existing) {
      await db('recup_mouvements')
        .where({ id: existing.id, tenant_id: decl.tenantId })
        .update({ heures_min: target, semaine });
    } else {
      await db('recup_mouvements').insert({
        tenant_id: decl.tenantId,
        user_id: decl.userId,
        semaine,
        heures_min: target,
        sens: 'credit',
        motif: 'Conversion heures sup → récup',
        source: 'overtime',
        overtime_declaration_id: decl.id,
        created_by: decl.decidedBy ?? null,
      });
    }
  },

  /**
   * Per-employee monthly overtime aggregate for the manager console. Manageable
   * users = members of the tenant filtered by manager_id (admin passes null →
   * whole tenant). Users with zero declarations are included. Sorted by name.
   */
  async teamSummary(
    tenantId: number,
    managerId: number | null,
    from: string,
    toExclusive: string,
  ): Promise<OvertimeTeamSummary[]> {
    const usersQ = db('users as u')
      .join('user_tenants as ut', 'ut.user_id', 'u.id')
      .where('ut.tenant_id', tenantId)
      .distinct('u.id')
      .select('u.id', db.raw('COALESCE(u.display_name, u.username) as name'));
    if (managerId !== null) usersQ.andWhere('u.manager_id', managerId);
    const users = (await usersQ) as { id: number; name: string }[];
    if (users.length === 0) return [];
    const ids = users.map((u) => u.id);
    const decls = await db('overtime_declarations')
      .where('tenant_id', tenantId)
      .andWhere('date', '>=', from)
      .andWhere('date', '<', toExclusive)
      .whereIn('user_id', ids)
      .select('user_id', 'nature_id', 'status', 'minutes', 'recup_minutes');
    return users
      .map((u) => {
        let validatedMinutes = 0,
          recupMinutes = 0,
          pendingMinutes = 0,
          pendingCount = 0,
          refusedCount = 0;
        const perNature: Record<number, number> = {};
        for (const d of decls) {
          if (d.user_id !== u.id) continue;
          if (d.status === 'valide') {
            validatedMinutes += d.minutes;
            recupMinutes += d.recup_minutes;
            perNature[d.nature_id] = (perNature[d.nature_id] ?? 0) + d.minutes;
          } else if (d.status === 'en_attente') {
            pendingMinutes += d.minutes;
            pendingCount++;
          } else if (d.status === 'refuse') refusedCount++;
        }
        return { userId: u.id, userName: u.name, validatedMinutes, recupMinutes, pendingMinutes, pendingCount, refusedCount, perNature };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));
  },
};

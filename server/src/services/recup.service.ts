import { db } from '../db';
import type { RecupMouvement, RecupSens, Shift, User } from '@obliplan/shared';
import { recupSoldeMinutes } from './calc.service';
import { rowToUser, type UserRow } from './auth.service';
import { toIso, mondayOf, hmToMin } from '../utils/date';

interface RecupRow {
  id: number;
  tenant_id: number;
  user_id: number;
  semaine: Date | string;
  heures_min: number;
  sens: string;
  motif: string | null;
  source: string | null;
  overtime_declaration_id: number | null;
  shift_id: number | null;
  created_by: number | null;
  created_at: Date;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));

export function rowToRecup(r: RecupRow): RecupMouvement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    semaine: isoDate(r.semaine),
    heuresMin: r.heures_min,
    sens: r.sens as RecupSens,
    motif: r.motif,
    source: r.source,
    overtimeDeclarationId: r.overtime_declaration_id ?? null,
    shiftId: r.shift_id ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
  };
}

export interface RecupInput {
  userId: number;
  semaine: string;
  heuresMin: number;
  sens: RecupSens;
  motif?: string | null;
}

export const recupService = {
  async getForUser(tenantId: number, userId: number): Promise<RecupMouvement[]> {
    const rows = await db<RecupRow>('recup_mouvements')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('semaine', 'desc');
    return rows.map(rowToRecup);
  },

  async soldeForUser(tenantId: number, userId: number): Promise<number> {
    const movements = await this.getForUser(tenantId, userId);
    return recupSoldeMinutes(movements);
  },

  async create(tenantId: number, actorId: number, data: RecupInput): Promise<RecupMouvement> {
    const [row] = await db<RecupRow>('recup_mouvements')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        semaine: data.semaine,
        heures_min: data.heuresMin,
        sens: data.sens,
        motif: data.motif ?? null,
        source: 'manual',
        created_by: actorId,
      })
      .returning('*');
    return rowToRecup(row);
  },

  /** The single automatic "eligible" credit for a given week, if any. */
  async eligibleForWeek(tenantId: number, userId: number, semaine: string): Promise<RecupMouvement | null> {
    const row = await db<RecupRow>('recup_mouvements')
      .where({ tenant_id: tenantId, user_id: userId, semaine, source: 'eligible' })
      .first();
    return row ? rowToRecup(row) : null;
  },

  /**
   * Auto-credit the week's récup-eligible overflow. Idempotent per
   * (tenant_id, user_id, semaine) via the `recup_eligible_uniq` partial index:
   * re-validating updates the existing eligible credit instead of duplicating it.
   */
  async creditEligibleWeek(
    tenantId: number,
    actorId: number,
    data: { userId: number; semaine: string; heuresMin: number },
  ): Promise<RecupMouvement | null> {
    const existing = await this.eligibleForWeek(tenantId, data.userId, data.semaine);
    if (existing) {
      if (existing.heuresMin === data.heuresMin) return existing;
      const [row] = await db<RecupRow>('recup_mouvements')
        .where({ id: existing.id })
        .update({ heures_min: data.heuresMin })
        .returning('*');
      return rowToRecup(row);
    }
    if (data.heuresMin <= 0) return null; // nothing eligible, nothing to credit
    const [row] = await db<RecupRow>('recup_mouvements')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        semaine: data.semaine,
        heures_min: data.heuresMin,
        sens: 'credit',
        motif: 'Crédit récup éligible (validation semaine)',
        source: 'eligible',
        created_by: actorId,
      })
      .returning('*');
    return rowToRecup(row);
  },

  /**
   * Maintain the invariant "a linked récup debit exists IFF the shift is type
   * 'recup' with a positive span, equal to its spanned minutes (fin − début −
   * pause), on the Monday of shift.date". Keyed by shift_id / source='recup-shift'.
   * Idempotent via the recup_shift_uniq partial index. Deleting the shift removes
   * the trace through the FK CASCADE - no debit cleanup needed here.
   */
  async syncRecupForShift(shift: Shift): Promise<void> {
    const span =
      shift.type === 'recup' && shift.heureDebut && shift.heureFin
        ? hmToMin(shift.heureFin) - hmToMin(shift.heureDebut) - shift.pauseMin
        : 0;
    const target = span > 0 ? span : 0;
    const existing = await db<RecupRow>('recup_mouvements')
      .where({ shift_id: shift.id, tenant_id: shift.tenantId })
      .first();
    if (target === 0) {
      if (existing) await db('recup_mouvements').where({ id: existing.id, tenant_id: shift.tenantId }).del();
      return;
    }
    const semaine = mondayOf(shift.date);
    if (existing) {
      await db<RecupRow>('recup_mouvements')
        .where({ id: existing.id, tenant_id: shift.tenantId })
        .update({ heures_min: target, semaine, user_id: shift.userId });
    } else {
      await db<RecupRow>('recup_mouvements').insert({
        tenant_id: shift.tenantId,
        user_id: shift.userId,
        semaine,
        heures_min: target,
        sens: 'debit',
        motif: 'Récup planifiée',
        source: 'recup-shift',
        shift_id: shift.id,
        created_by: shift.createdBy ?? null,
      });
    }
  },

  /** Toggle a user's self-service récup view (users.recup_self_service). */
  async setSelfService(tenantId: number, userId: number, enabled: boolean): Promise<User | null> {
    const [row] = await db<UserRow>('users')
      .where({ id: userId, tenant_id: tenantId })
      .update({ recup_self_service: enabled, updated_at: db.fn.now() })
      .returning('*');
    return row ? rowToUser(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    const n = await db('recup_mouvements').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};

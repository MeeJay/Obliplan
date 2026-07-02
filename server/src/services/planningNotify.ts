import { db } from '../db';
import type { Shift } from '@obliplan/shared';
import { todayIso } from '../utils/date';
import { notify } from './notify';

/**
 * Notifies an employee when THEIR planning changes (cycle/hour-type swap, project
 * change, added/removed/moved slot). Wired at the shift CONTROLLER (interactive
 * single-shift edits) - never at shiftService, so the bulk CSV import can't fan out
 * hundreds of notifications. Every emit is best-effort: notify() never throws and we
 * swallow lookup errors, so a notification can never block or fail a planning edit.
 *
 * Gate: only VALIDATED shifts (a draft isn't visible to the employee yet) that fall
 * on TODAY or later (no point pinging about last week), changed by someone else.
 */

const TYPE_LABEL: Record<string, string> = {
  travail: 'Travail',
  repos: 'Repos',
  conge: 'Congé',
  absence: 'Absence',
  ecole: 'École',
  pause: 'Pause déjeuner',
  astreinte: 'Astreinte',
  recup: 'Récupération',
};

const ddmm = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};
const timeRange = (s: Shift): string => (s.heureDebut && s.heureFin ? ` ${s.heureDebut}-${s.heureFin}` : '');

async function nameOf(
  table: 'hour_types' | 'boards',
  col: 'libelle' | 'name',
  tenantId: number,
  id: number | null,
): Promise<string | null> {
  if (id == null) return null;
  const row = await db(table).where({ id, tenant_id: tenantId }).first(col);
  return (row as Record<string, string> | undefined)?.[col] ?? null;
}

/** The human "cycle" label of a shift: the hour-type (Front/Back…) for worked time, else the type. */
async function cycleLabel(tenantId: number, s: Shift): Promise<string> {
  if (s.type === 'travail') {
    const ht = await nameOf('hour_types', 'libelle', tenantId, s.hourTypeId);
    if (ht) return ht;
  }
  return TYPE_LABEL[s.type] ?? s.type;
}

/** Visible to the employee (validated), upcoming (today+), and not their own edit. */
function relevant(actorId: number, s: Shift): boolean {
  return s.statut === 'valide' && s.userId !== actorId && s.date >= todayIso();
}

async function emit(
  tenantId: number,
  actorId: number,
  userId: number,
  title: string,
  body: string,
): Promise<void> {
  await notify(tenantId, {
    recipientIds: [userId],
    actorId,
    type: 'planning.changed',
    title,
    body,
    link: '/mon-planning',
    entityType: 'shift',
  });
}

async function shiftCreated(tenantId: number, actorId: number, shift: Shift): Promise<void> {
  try {
    if (!relevant(actorId, shift)) return;
    const label = await cycleLabel(tenantId, shift);
    await emit(tenantId, actorId, shift.userId, 'Nouveau créneau ajouté', `${ddmm(shift.date)} : ${label}${timeRange(shift)}`);
  } catch {
    /* best-effort */
  }
}

async function shiftDeleted(tenantId: number, actorId: number, shift: Shift): Promise<void> {
  try {
    if (!relevant(actorId, shift)) return;
    const label = await cycleLabel(tenantId, shift);
    await emit(tenantId, actorId, shift.userId, 'Créneau supprimé', `${ddmm(shift.date)} : ${label}${timeRange(shift)}`);
  } catch {
    /* best-effort */
  }
}

async function shiftUpdated(tenantId: number, actorId: number, oldS: Shift, newS: Shift): Promise<void> {
  try {
    // Reassigned to another employee (drag-move): old one loses it, new one gains it.
    if (oldS.userId !== newS.userId) {
      await shiftDeleted(tenantId, actorId, oldS);
      await shiftCreated(tenantId, actorId, newS);
      return;
    }
    const visible =
      (oldS.statut === 'valide' || newS.statut === 'valide') &&
      newS.userId !== actorId &&
      (newS.date >= todayIso() || oldS.date >= todayIso());
    if (!visible) return;

    const parts: string[] = [];
    const [oldLabel, newLabel] = await Promise.all([cycleLabel(tenantId, oldS), cycleLabel(tenantId, newS)]);
    if (oldLabel !== newLabel) parts.push(`${oldLabel} → ${newLabel}`);

    const [oldBoard, newBoard] = await Promise.all([
      nameOf('boards', 'name', tenantId, oldS.boardId),
      nameOf('boards', 'name', tenantId, newS.boardId),
    ]);
    if ((oldBoard ?? '') !== (newBoard ?? '')) parts.push(newBoard ? `projet : ${newBoard}` : 'projet retiré');

    if (oldS.heureDebut !== newS.heureDebut || oldS.heureFin !== newS.heureFin) {
      const tr = timeRange(newS).trim();
      if (tr) parts.push(`horaire : ${tr}`);
    }
    if (oldS.date !== newS.date) parts.push(`déplacé au ${ddmm(newS.date)}`);

    if (!parts.length) return; // nothing the employee cares about changed (e.g. a note tweak)
    await emit(tenantId, actorId, newS.userId, `Planning modifié - ${ddmm(newS.date)}`, parts.join(' · '));
  } catch {
    /* best-effort */
  }
}

export const planningNotify = { shiftCreated, shiftDeleted, shiftUpdated };

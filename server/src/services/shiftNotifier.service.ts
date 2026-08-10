import { db } from '../db';
import { logger } from '../utils/logger';
import { notify } from './notify';

/**
 * Shift-change notifier. A once-a-minute sweep that, for every user who opted in
 * (users.shift_notify_before_min set), sends:
 *   - a "heads-up" push/in-app notification `lead` minutes before each shift CHANGE, and
 *   - a "you're now on X" notification at the change itself.
 * A change = the start of a validated timed shift whose label differs from the previous
 * contiguous shift of the day (the first shift of the day counts as a change). Times are
 * compared on the Paris civil clock (planning is Paris). Fire-and-forget: never throws.
 *
 * Single-instance assumption: run one container. If the app is ever scaled horizontally,
 * this sweep must move behind a shared lock to avoid duplicate sends.
 */

const SHIFT_TYPE_LABEL: Record<string, string> = {
  travail: 'Travail',
  pause: 'Pause déjeuner',
  repos: 'Repos',
  recup: 'Récup',
  conge: 'Congé',
  absence: 'Absence',
  ecole: 'École',
  astreinte: 'Astreinte',
};

const toMin = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Current Paris civil date + minutes-since-midnight. */
function nowParis(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = g('hour') === '24' ? '00' : g('hour');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(hour) * 60 + Number(g('minute')) };
}

// Sent-marker set (keys "date:shiftId:pre|start" / "date:user:tenant:eod") so each target fires
// once. Purged daily.
const sent = new Set<string>();
// End-of-day fires only within this many minutes after the last shift ends (avoids a late resend
// after an evening restart, since a passed day would otherwise re-trigger on first sweep).
const EOD_WINDOW_MIN = 3;

interface ShiftRow {
  id: number;
  user_id: number;
  tenant_id: number;
  heure_debut: string;
  heure_fin: string;
  type: string;
  ht_label: string | null;
}

async function tick(): Promise<void> {
  const now = nowParis();
  // Drop yesterday's markers so the set doesn't grow unbounded.
  for (const k of sent) if (!k.startsWith(`${now.date}:`)) sent.delete(k);

  const prefUsers = (await db('users')
    .where('is_active', true)
    .andWhere((b) => b.whereNotNull('shift_notify_before_min').orWhere('shift_notify_at_change', true))
    .select('id', 'shift_notify_before_min', 'shift_notify_at_change')) as {
    id: number;
    shift_notify_before_min: number | null;
    shift_notify_at_change: boolean | null;
  }[];
  if (prefUsers.length === 0) return;
  const prefById = new Map(prefUsers.map((u) => [u.id, u]));

  const rows = (await db('shifts as s')
    .leftJoin('hour_types as ht', 'ht.id', 's.hour_type_id')
    .whereIn(
      's.user_id',
      prefUsers.map((u) => u.id),
    )
    .andWhere('s.statut', 'valide')
    .andWhere('s.date', now.date)
    .whereNotNull('s.heure_debut')
    .whereNotNull('s.heure_fin')
    .orderBy([{ column: 's.user_id' }, { column: 's.tenant_id' }, { column: 's.heure_debut' }])
    .select(
      's.id',
      's.user_id',
      's.tenant_id',
      's.heure_debut',
      's.heure_fin',
      's.type',
      'ht.libelle as ht_label',
    )) as ShiftRow[];

  // Group by (user, tenant) so "previous shift" is within the same roster.
  const groups = new Map<string, ShiftRow[]>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.tenant_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const labelOf = (r: ShiftRow) => r.ht_label ?? SHIFT_TYPE_LABEL[r.type] ?? r.type;

  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const label = labelOf(s);
      const prevLabel = i > 0 ? labelOf(list[i - 1]) : null;
      // Only real changes: first shift of the day, or a label different from the previous one.
      if (prevLabel !== null && prevLabel === label) continue;

      const pref = prefById.get(s.user_id);
      const lead = pref?.shift_notify_before_min ?? 0;
      const atChange = pref?.shift_notify_at_change === true;
      const startMin = toMin(s.heure_debut);
      const endMin = toMin(s.heure_fin);
      const start = s.heure_debut.slice(0, 5);
      const end = s.heure_fin.slice(0, 5);

      // Heads-up, `lead` minutes before the change (only fires in the run-up, not retroactively).
      const preTarget = startMin - lead;
      const preKey = `${now.date}:${s.id}:pre`;
      if (
        lead > 0 &&
        preTarget >= 0 &&
        now.minutes >= preTarget &&
        now.minutes < startMin && // not past the change yet
        !sent.has(preKey)
      ) {
        sent.add(preKey);
        logger.info({ userId: s.user_id, shiftId: s.id, label, at: start }, 'shiftNotifier: heads-up sent');
        void notify(s.tenant_id, {
          recipientIds: [s.user_id],
          type: 'planning.shift_change_pre',
          title: 'Changement de créneau bientôt',
          body: `Dans ${Math.max(1, startMin - now.minutes)} min : ${label} à ${start}${prevLabel ? ` (après ${prevLabel})` : ''}`,
          link: '/mon-planning',
        });
      }

      // The change notification fires as soon as the shift is IN PROGRESS (start ≤ now < end),
      // not just in a 2-min window after the start. This survives a mid-shift server restart or
      // enabling the setting mid-shift: the user still gets "you're now on X" once.
      const startKey = `${now.date}:${s.id}:start`;
      if (atChange && startMin <= now.minutes && now.minutes < endMin && !sent.has(startKey)) {
        sent.add(startKey);
        logger.info({ userId: s.user_id, shiftId: s.id, label, at: start }, 'shiftNotifier: change sent');
        void notify(s.tenant_id, {
          recipientIds: [s.user_id],
          type: 'planning.shift_change',
          title: prevLabel ? `Vous passez sur ${label}` : `Créneau : ${label}`,
          body: `${label} · ${start} – ${end}`,
          link: '/mon-planning',
        });
      }
    }

    // End-of-day: once the last shift of the day is over, "plus de créneau aujourd'hui". Part of
    // the at-change family. A short window (not "in progress") avoids a late resend on an evening
    // restart; the 60s sweep still catches the transition.
    const owner = list[0];
    const pref = prefById.get(owner.user_id);
    if (pref?.shift_notify_at_change) {
      const lastEnd = Math.max(...list.map((r) => toMin(r.heure_fin)));
      const eodKey = `${now.date}:${owner.user_id}:${owner.tenant_id}:eod`;
      if (now.minutes >= lastEnd && now.minutes < lastEnd + EOD_WINDOW_MIN && !sent.has(eodKey)) {
        sent.add(eodKey);
        logger.info({ userId: owner.user_id }, 'shiftNotifier: end-of-day sent');
        void notify(owner.tenant_id, {
          recipientIds: [owner.user_id],
          type: 'planning.day_end',
          title: 'Fin de journée',
          body: "Plus de créneau prévu aujourd'hui. Bonne fin de journée !",
          link: '/mon-planning',
        });
      }
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the once-a-minute sweep. Idempotent. Each tick is guarded so it never crashes the loop. */
export function startShiftNotifier(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => logger.warn({ err }, 'shiftNotifier tick failed (non-fatal)'));
  }, 60_000);
  logger.info('Shift-change notifier started (60s sweep)');
}

import crypto from 'crypto';
import { db } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { addDays, todayIso, hmToMin } from '../utils/date';
import { notify, emailFor, managerIdOf } from './notify';
import { mailerService, brandedEmail } from './mailer.service';
import type {
  BookingPageConfig,
  BookingPageInput,
  BookingValidationMode,
  PublicBookingPage,
  BookingDayAvailability,
  BookingSlot,
  CreateAppointmentInput,
  AppointmentBooked,
  Appointment,
  AppointmentStatus,
} from '@obliplan/shared';

// The app's civil timezone (planning dates + slot times are Paris-local, never UTC).
const APP_TZ = process.env.APP_TIMEZONE || 'Europe/Paris';

// Hard bounds so a misconfigured page can never expose an unbounded window.
const MAX_HORIZON_DAYS = 120;
const MIN_SLOT = 5;

type Interval = [number, number]; // [startMin, endMin) minutes since midnight

interface BookingPageRow {
  id: number;
  tenant_id: number;
  user_id: number;
  token: string;
  title: string | null;
  intro: string | null;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  horizon_days: number;
  work_start: string;
  work_end: string;
  validation_mode: BookingValidationMode;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AppointmentRow {
  id: number;
  tenant_id: number;
  user_id: number;
  date: Date | string;
  heure_debut: string;
  heure_fin: string;
  status: AppointmentStatus;
  external_name: string;
  external_email: string;
  subject: string | null;
  cancel_token: string;
  created_at: Date | string;
  updated_at: Date | string;
}

// ── small helpers ────────────────────────────────────────────────────────────

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10));

function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function publicUrlFor(token: string): string {
  return `${config.appUrl.replace(/\/$/, '')}/rdv/${token}`;
}

/** "Now" in the business timezone as a { date, minutes-since-midnight } pair (DST-proof
 *  for same-day comparisons, and it avoids any Paris↔UTC conversion). */
function nowInTz(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24; // some engines emit '24' at midnight
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}

/** The earliest bookable instant, honouring the min-notice lead time. */
function earliestBookable(minNoticeHours: number): { date: string; minutes: number } {
  const now = nowInTz();
  let total = now.minutes + Math.max(0, minNoticeHours) * 60;
  const extraDays = Math.floor(total / 1440);
  total %= 1440;
  return { date: addDays(now.date, extraDays), minutes: total };
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** base minus every cut interval (both already merged/unmerged - handled internally). */
function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  const merged = mergeIntervals(cuts);
  let pieces = base.slice();
  for (const [cs, ce] of merged) {
    const next: Interval[] = [];
    for (const [ps, pe] of pieces) {
      if (ce <= ps || cs >= pe) {
        next.push([ps, pe]); // no overlap
        continue;
      }
      if (cs > ps) next.push([ps, cs]); // left remainder
      if (ce < pe) next.push([ce, pe]); // right remainder
    }
    pieces = next;
  }
  return pieces.filter(([a, b]) => b > a);
}

/** Slice free intervals into fixed-length slots aligned to each interval's start. */
function sliceSlots(free: Interval[], slotMin: number): Interval[] {
  const slots: Interval[] = [];
  for (const [a, b] of free) {
    for (let s = a; s + slotMin <= b; s += slotMin) slots.push([s, s + slotMin]);
  }
  return slots;
}

// ── mapping ──────────────────────────────────────────────────────────────────

function rowToConfig(r: BookingPageRow): BookingPageConfig {
  return {
    userId: r.user_id,
    token: r.token,
    title: r.title,
    intro: r.intro,
    slotMinutes: r.slot_minutes,
    bufferMinutes: r.buffer_minutes,
    minNoticeHours: r.min_notice_hours,
    horizonDays: r.horizon_days,
    workStart: r.work_start,
    workEnd: r.work_end,
    validationMode: r.validation_mode,
    isActive: r.is_active,
    publicUrl: publicUrlFor(r.token),
  };
}

// ── availability core ────────────────────────────────────────────────────────

/**
 * Compute FREE booking slots for a page's owner over [fromIso, toIso], clamped to
 * [today, today+horizon]. Availability is derived from the owner's own VALIDATED
 * shifts worked under a `bookable` hour-type, clamped to the page's work window,
 * minus existing (pending/confirmed) appointments padded by the buffer, minus any
 * slot earlier than the min-notice lead time. Emits days that have >= 1 slot.
 */
async function computeAvailability(page: BookingPageRow, fromIso: string, toIso: string): Promise<BookingDayAvailability[]> {
  const today = todayIso();
  const horizonEnd = addDays(today, Math.min(page.horizon_days, MAX_HORIZON_DAYS));
  let from = fromIso < today ? today : fromIso;
  let to = toIso > horizonEnd ? horizonEnd : toIso;
  if (from > to) return [];

  const workStart = hmToMin(page.work_start);
  const workEnd = hmToMin(page.work_end);
  if (workEnd <= workStart) return [];

  const slotMin = Math.max(MIN_SLOT, page.slot_minutes);
  const buffer = Math.max(0, page.buffer_minutes);
  const earliest = earliestBookable(page.min_notice_hours);

  // Which hour-types count as bookable for this tenant.
  const bookableTypes = (await db('hour_types')
    .where({ tenant_id: page.tenant_id, bookable: true, is_active: true })
    .select<{ id: number }[]>('id')).map((r) => r.id);
  if (bookableTypes.length === 0) return [];

  const shifts = (await db('shifts')
    .where({ tenant_id: page.tenant_id, user_id: page.user_id, statut: 'valide' })
    .whereIn('hour_type_id', bookableTypes)
    .whereNotNull('heure_debut')
    .whereNotNull('heure_fin')
    .andWhere('date', '>=', from)
    .andWhere('date', '<=', to)
    .select<{ date: Date | string; heure_debut: string; heure_fin: string }[]>('date', 'heure_debut', 'heure_fin'));

  const appts = (await db('appointments')
    .where({ tenant_id: page.tenant_id, user_id: page.user_id })
    .whereIn('status', ['pending', 'confirmed'])
    .andWhere('date', '>=', from)
    .andWhere('date', '<=', to)
    .select<{ date: Date | string; heure_debut: string; heure_fin: string }[]>('date', 'heure_debut', 'heure_fin'));

  const shiftsByDay = new Map<string, Interval[]>();
  for (const s of shifts) {
    const d = isoDate(s.date);
    const a = Math.max(workStart, hmToMin(s.heure_debut.slice(0, 5)));
    const b = Math.min(workEnd, hmToMin(s.heure_fin.slice(0, 5)));
    if (b <= a) continue; // outside the work window or crosses midnight - ignore
    (shiftsByDay.get(d) ?? shiftsByDay.set(d, []).get(d)!).push([a, b]);
  }

  const apptsByDay = new Map<string, Interval[]>();
  for (const ap of appts) {
    const d = isoDate(ap.date);
    const a = hmToMin(ap.heure_debut.slice(0, 5)) - buffer;
    const b = hmToMin(ap.heure_fin.slice(0, 5)) + buffer;
    (apptsByDay.get(d) ?? apptsByDay.set(d, []).get(d)!).push([a, b]);
  }

  const days: BookingDayAvailability[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const work = shiftsByDay.get(d);
    if (!work || work.length === 0) continue;
    const free = subtractIntervals(mergeIntervals(work), apptsByDay.get(d) ?? []);
    let slots = sliceSlots(free, slotMin);
    if (d === earliest.date) slots = slots.filter(([s]) => s >= earliest.minutes);
    else if (d < earliest.date) slots = [];
    if (slots.length === 0) continue;
    days.push({ date: d, slots: slots.map(([s, e]): BookingSlot => ({ start: minToHm(s), end: minToHm(e) })) });
  }
  return days;
}

// ── public API ───────────────────────────────────────────────────────────────

export const bookingService = {
  /** The owner's page config, creating a default (inactive) one on first access. */
  async getOrCreateConfig(tenantId: number, userId: number): Promise<BookingPageConfig> {
    const existing = await db<BookingPageRow>('booking_pages').where({ tenant_id: tenantId, user_id: userId }).first();
    if (existing) return rowToConfig(existing);
    const [row] = await db<BookingPageRow>('booking_pages')
      .insert({ tenant_id: tenantId, user_id: userId, token: newToken(), is_active: false })
      .returning('*');
    return rowToConfig(row);
  },

  async updateConfig(tenantId: number, userId: number, data: BookingPageInput): Promise<BookingPageConfig> {
    await this.getOrCreateConfig(tenantId, userId); // ensure the row exists
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.intro !== undefined) patch.intro = data.intro;
    if (data.slotMinutes !== undefined) patch.slot_minutes = data.slotMinutes;
    if (data.bufferMinutes !== undefined) patch.buffer_minutes = data.bufferMinutes;
    if (data.minNoticeHours !== undefined) patch.min_notice_hours = data.minNoticeHours;
    if (data.horizonDays !== undefined) patch.horizon_days = Math.min(data.horizonDays, MAX_HORIZON_DAYS);
    if (data.workStart !== undefined) patch.work_start = data.workStart;
    if (data.workEnd !== undefined) patch.work_end = data.workEnd;
    if (data.validationMode !== undefined) patch.validation_mode = data.validationMode;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const [row] = await db<BookingPageRow>('booking_pages')
      .where({ tenant_id: tenantId, user_id: userId })
      .update(patch)
      .returning('*');
    return rowToConfig(row);
  },

  async regenerateToken(tenantId: number, userId: number): Promise<BookingPageConfig> {
    await this.getOrCreateConfig(tenantId, userId);
    const [row] = await db<BookingPageRow>('booking_pages')
      .where({ tenant_id: tenantId, user_id: userId })
      .update({ token: newToken(), updated_at: db.fn.now() })
      .returning('*');
    return rowToConfig(row);
  },

  /** PUBLIC page view (no auth). Returns null for an unknown/inactive token → 404. */
  async getPublicPage(token: string, fromIso?: string, toIso?: string): Promise<PublicBookingPage | null> {
    const page = await db<BookingPageRow>('booking_pages').where({ token, is_active: true }).first();
    if (!page) return null;

    const today = todayIso();
    const from = fromIso && fromIso >= today ? fromIso : today;
    const to = toIso && toIso >= from ? toIso : addDays(from, 13); // default: 2 weeks

    const [host, tenant, days] = await Promise.all([
      db('users').where({ id: page.user_id }).first<{ display_name: string | null; username: string }>('display_name', 'username'),
      db('tenants').where({ id: page.tenant_id }).first<{ name: string }>('name'),
      computeAvailability(page, from, to),
    ]);

    const hostName = host?.display_name?.trim() || host?.username || 'Hôte';
    return {
      token: page.token,
      hostName,
      organization: tenant?.name ?? null,
      title: page.title,
      intro: page.intro,
      slotMinutes: page.slot_minutes,
      timezone: APP_TZ,
      days,
      rangeStart: from,
      rangeEnd: to,
    };
  },

  /**
   * Book a slot from the PUBLIC page. Re-derives availability for the requested day
   * and requires the requested slot to be exactly one of the free slots (so it can
   * never land outside working hours or on top of another appointment).
   */
  async book(token: string, input: CreateAppointmentInput): Promise<AppointmentBooked | { error: 'unknown' | 'unavailable' }> {
    const page = await db<BookingPageRow>('booking_pages').where({ token, is_active: true }).first();
    if (!page) return { error: 'unknown' };

    const days = await computeAvailability(page, input.date, input.date);
    const day = days.find((d) => d.date === input.date);
    const slot = day?.slots.find((s) => s.start === input.start && s.end === input.end);
    if (!slot) return { error: 'unavailable' };

    const status: AppointmentStatus = page.validation_mode === 'auto' ? 'confirmed' : 'pending';
    const cancelToken = newToken();
    const [row] = await db('appointments')
      .insert({
        tenant_id: page.tenant_id,
        user_id: page.user_id,
        booking_page_id: page.id,
        date: input.date,
        heure_debut: input.start,
        heure_fin: input.end,
        external_name: input.name.trim(),
        external_email: input.email.trim(),
        subject: input.subject?.trim() || null,
        status,
        cancel_token: cancelToken,
      })
      .returning<{ id: number }[]>('id');

    // Notify whoever must act (in-app + push + email). Best-effort - never blocks the booking:
    //  - 'auto'    → the host is simply informed a confirmed meeting landed on their calendar.
    //  - 'self'    → the host validates their own reservation.
    //  - 'manager' → the host's manager validates (falls back to the host if no manager set).
    void notifyOnBooking(page, row.id, input, status);

    return { status, date: input.date, start: input.start, end: input.end, cancelToken };
  },

  /** External self-cancel via the cancel token (no account). Idempotent. */
  async cancelByToken(cancelToken: string): Promise<boolean> {
    const appt = await db('appointments').where({ cancel_token: cancelToken }).first<AppointmentRow>();
    if (!appt || appt.status === 'cancelled') return !!appt;
    await db('appointments').where({ cancel_token: cancelToken }).update({ status: 'cancelled', updated_at: db.fn.now() });
    void notifyHostCancelled(appt.tenant_id, appt.user_id, appt);
    return true;
  },

  // ── host-side management (authenticated) ──────────────────────────────────

  /**
   * The authenticated viewer's inbox: appointments on THEIR OWN calendar (as host),
   * PLUS appointments they must validate as a MANAGER (a report whose page is in
   * 'manager' validation mode). Each item carries the host name + a `mine` flag.
   */
  async listAppointments(tenantId: number, viewerId: number, opts: { includePast?: boolean } = {}): Promise<Appointment[]> {
    const rows = (await db('appointments as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .where('a.tenant_id', tenantId)
      .andWhere((qb) => {
        qb.where('a.user_id', viewerId).orWhere((sub) => {
          sub.where('u.manager_id', viewerId).whereExists((ex) => {
            ex.select(db.raw('1'))
              .from('booking_pages as bp')
              .whereRaw('bp.user_id = a.user_id')
              .andWhere('bp.tenant_id', tenantId)
              .andWhere('bp.validation_mode', 'manager');
          });
        });
      })
      .modify((qb) => {
        if (!opts.includePast) qb.andWhere('a.date', '>=', todayIso());
      })
      .orderBy(['a.date', 'a.heure_debut'])
      .select(
        'a.*',
        'u.display_name as host_display_name',
        'u.username as host_username',
      )) as (AppointmentRow & { host_display_name: string | null; host_username: string | null })[];

    return rows.map((r) =>
      mapAppointment(r, r.host_display_name?.trim() || r.host_username || 'Hôte', r.user_id === viewerId),
    );
  },

  /**
   * Confirm or cancel an appointment. Authorization mirrors the validation mode:
   *  - CONFIRM requires the approver (the host for 'self'/'auto', the manager for 'manager').
   *  - CANCEL is allowed by the approver OR the host (it is the host's own calendar).
   * E-mails the external visitor and, when a manager acted, informs the host employee.
   */
  async setStatus(tenantId: number, viewerId: number, id: number, status: 'confirmed' | 'cancelled'): Promise<Appointment | null> {
    const appt = await db('appointments').where({ id, tenant_id: tenantId }).first<AppointmentRow>();
    if (!appt) return null;
    const approverId = await approverOf(tenantId, appt.user_id);
    const isHost = appt.user_id === viewerId;
    const isApprover = approverId === viewerId;
    const permitted = status === 'confirmed' ? isApprover : isApprover || isHost;
    if (!permitted) return null; // controller surfaces this as 404 (not found / not yours)

    const [row] = await db<AppointmentRow>('appointments')
      .where({ id, tenant_id: tenantId })
      .update({ status, updated_at: db.fn.now() })
      .returning('*');
    if (!row) return null;

    void emailExternal(tenantId, row.user_id, row, status);
    // A manager acted on a report's calendar → keep the host employee informed (in-app + push).
    if (row.user_id !== viewerId) void notifyHostDecision(tenantId, row, status);

    return mapAppointment(row, await hostNameOf(row.user_id), row.user_id === viewerId);
  },
};

// ── notifications (all best-effort) ───────────────────────────────────────────

const ddmm = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

function mapAppointment(r: AppointmentRow, hostName: string, mine: boolean): Appointment {
  return {
    id: r.id,
    date: isoDate(r.date),
    start: r.heure_debut.slice(0, 5),
    end: r.heure_fin.slice(0, 5),
    status: r.status,
    externalName: r.external_name,
    externalEmail: r.external_email,
    subject: r.subject,
    createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
    hostName,
    mine,
  };
}

async function hostNameOf(hostId: number): Promise<string> {
  const host = await db('users').where({ id: hostId }).first<{ display_name: string | null; username: string }>('display_name', 'username');
  return host?.display_name?.trim() || host?.username || 'Hôte';
}

/** The user who validates reservations for a host: the manager in 'manager' mode
 *  (falling back to the host if no manager is set), otherwise the host itself. */
async function approverOf(tenantId: number, hostId: number): Promise<number> {
  const page = await db('booking_pages')
    .where({ tenant_id: tenantId, user_id: hostId })
    .first<{ validation_mode: BookingValidationMode }>('validation_mode');
  if (page?.validation_mode === 'manager') return (await managerIdOf(tenantId, hostId)) ?? hostId;
  return hostId;
}

/**
 * Notify whoever must act when a reservation is made. 'auto' → the host is informed of a
 * confirmed meeting; 'self'/'manager' → the validator (host or manager) gets an actionable
 * "à valider" notification (in-app + web push + e-mail).
 */
async function notifyOnBooking(
  page: BookingPageRow,
  apptId: number,
  input: CreateAppointmentInput,
  status: AppointmentStatus,
): Promise<void> {
  try {
    const recipientId = status === 'confirmed' ? page.user_id : await approverOf(page.tenant_id, page.user_id);
    const forHost = recipientId === page.user_id;
    const hostName = forHost ? '' : await hostNameOf(page.user_id);
    const title =
      status === 'confirmed'
        ? 'Nouveau rendez-vous confirmé'
        : forHost
          ? 'Rendez-vous à valider'
          : `Rendez-vous à valider (${hostName})`;
    const who = forHost ? '' : `${hostName} · `;
    const body = `${who}${ddmm(input.date)} ${input.start}-${input.end} · ${input.name}${input.subject ? ` · ${input.subject}` : ''}`;
    await notify(page.tenant_id, {
      recipientIds: [recipientId],
      type: 'booking.new',
      title,
      body,
      link: '/rendez-vous',
      entityType: 'appointment',
      entityId: apptId,
      email: emailFor(title, { title, body, link: '/rendez-vous' }),
    });
  } catch (err) {
    logger.warn({ err }, 'booking: new-reservation notify failed (non-fatal)');
  }
}

/** Inform the host employee (in-app + push) when their MANAGER confirms/cancels a RDV. */
async function notifyHostDecision(tenantId: number, appt: AppointmentRow, status: 'confirmed' | 'cancelled'): Promise<void> {
  try {
    const title = status === 'confirmed' ? 'Rendez-vous confirmé par votre manager' : 'Rendez-vous annulé par votre manager';
    const body = `${ddmm(isoDate(appt.date))} ${appt.heure_debut.slice(0, 5)}-${appt.heure_fin.slice(0, 5)} · ${appt.external_name}`;
    await notify(tenantId, {
      recipientIds: [appt.user_id],
      type: 'booking.decided',
      title,
      body,
      link: '/rendez-vous',
      entityType: 'appointment',
      entityId: appt.id,
    });
  } catch (err) {
    logger.warn({ err }, 'booking: host decision notify failed (non-fatal)');
  }
}

async function notifyHostCancelled(
  tenantId: number,
  hostId: number,
  appt: { id: number; date: Date | string; heure_debut: string; heure_fin: string; external_name: string },
): Promise<void> {
  try {
    const date = isoDate(appt.date);
    const body = `${ddmm(date)} ${appt.heure_debut.slice(0, 5)}-${appt.heure_fin.slice(0, 5)} · ${appt.external_name}`;
    const title = 'Rendez-vous annulé';
    await notify(tenantId, {
      recipientIds: [hostId],
      type: 'booking.cancelled',
      title,
      body,
      link: '/rendez-vous',
      entityType: 'appointment',
      entityId: appt.id,
      email: emailFor(title, { title, body, link: '/rendez-vous' }),
    });
  } catch (err) {
    logger.warn({ err }, 'booking: host cancel notify failed (non-fatal)');
  }
}

/** E-mail the external visitor when the host confirms or cancels their appointment. */
async function emailExternal(
  tenantId: number,
  hostId: number,
  appt: AppointmentRow,
  status: 'confirmed' | 'cancelled',
): Promise<void> {
  try {
    if (!(await mailerService.isConfigured())) return;
    const host = await db('users').where({ id: hostId }).first<{ display_name: string | null; username: string }>('display_name', 'username');
    const hostName = host?.display_name?.trim() || host?.username || 'votre interlocuteur';
    const date = isoDate(appt.date);
    const when = `${ddmm(date)} de ${appt.heure_debut.slice(0, 5)} à ${appt.heure_fin.slice(0, 5)}`;
    const subject = status === 'confirmed' ? 'Votre rendez-vous est confirmé' : 'Votre rendez-vous a été annulé';
    const line =
      status === 'confirmed'
        ? `Votre rendez-vous avec ${hostName} le ${when} est confirmé.`
        : `Votre rendez-vous avec ${hostName} le ${when} a été annulé.`;
    const html = brandedEmail({ title: subject, bodyHtml: `<p style="margin:0;">${line}</p>` });
    await mailerService.sendMail({ to: appt.external_email, subject, html }, { tenantId, template: `booking.${status}` });
  } catch (err) {
    logger.warn({ err }, 'booking: external e-mail failed (non-fatal)');
  }
}

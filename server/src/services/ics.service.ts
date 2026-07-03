import crypto from 'crypto';
import { db } from '../db';
import type { ShiftType } from '@obliplan/shared';
import { toIso, todayIso, addDays, hmToMin } from '../utils/date';

// ── ICS calendar feed (subscribe to my planning) ─────────────────────────────
// A per-user secret token (users.ics_token) gates a PUBLIC unauthenticated feed
// so a calendar client can poll it forever. The feed only ever exposes the
// token owner's OWN validated shifts + approved leave - no other user, no other
// secret. Home tenant (users.tenant_id) scopes the query.

/** Window exposed by the feed, relative to today: [today-31d, today+92d). */
const PAST_DAYS = 31;
const FUTURE_DAYS = 92;

/** Server-side shift-type labels (client SHIFT_META lives in the client bundle). */
const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  travail: 'Travail',
  astreinte: 'Astreinte',
  pause: 'Pause déjeuner',
  repos: 'Repos',
  recup: 'Récup',
  conge: 'Congé',
  absence: 'Absence',
  ecole: 'École',
};

/** Only timed (counted) shift types become calendar events. */
const TIMED_TYPES: ShiftType[] = ['travail', 'astreinte'];

interface FeedUser {
  id: number;
  tenant_id: number;
}

interface FeedShiftRow {
  id: number;
  date: Date | string;
  heure_debut: string;
  heure_fin: string;
  type: string;
  note: string | null;
  hour_type_libelle: string | null;
}

interface FeedLeaveRow {
  id: number;
  start_date: Date | string;
  end_date: Date | string;
  start_period: string;
  end_period: string;
  leave_type_libelle: string | null;
}

interface FeedApptRow {
  id: number;
  date: Date | string;
  heure_debut: string;
  heure_fin: string;
  status: string;
  external_name: string;
  external_email: string;
  subject: string | null;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));

function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ── RFC 5545 helpers ─────────────────────────────────────────────────────────

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Fold a content line to <=75 OCTETS per RFC 5545 3.1 (French accents & emoji are
 * multi-byte in UTF-8). Cuts on codepoint boundaries so a multi-byte character is
 * never split; continuation lines are prefixed with a single space (1 octet).
 */
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let first = true;
  for (const ch of line /* iterates whole codepoints, never a lone surrogate */) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    const limit = first ? 75 : 74; // continuations reserve 1 octet for the leading space
    if (curBytes + chBytes > limit) {
      out.push(first ? cur : ' ' + cur);
      first = false;
      cur = ch;
      curBytes = chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  out.push(first ? cur : ' ' + cur);
  return out.join('\r\n');
}

/** Local floating date-time `YYYYMMDDTHHMMSS` (no Z - the viewer's wall clock). */
function localDateTime(dateIso: string, hm: string): string {
  const [h, m] = hm.split(':');
  return `${dateIso.replace(/-/g, '')}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
}

/** All-day DATE value `YYYYMMDD`. */
function dateValue(dateIso: string): string {
  return dateIso.replace(/-/g, '');
}

/** UTC DTSTAMP `YYYYMMDDTHHMMSSZ`. */
function stampUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export const icsService = {
  /** Return the user's ics_token, generating + persisting one if absent. */
  async ensureToken(userId: number): Promise<string> {
    const row = await db('users').where({ id: userId }).first<{ ics_token: string | null }>('ics_token');
    if (row?.ics_token) return row.ics_token;
    const token = newToken();
    await db('users').where({ id: userId }).update({ ics_token: token, updated_at: db.fn.now() });
    return token;
  },

  /** Rotate the token - invalidates the previous subscribe URL. */
  async regenerate(userId: number): Promise<string> {
    const token = newToken();
    await db('users').where({ id: userId }).update({ ics_token: token, updated_at: db.fn.now() });
    return token;
  },

  /**
   * Build the iCalendar body for the user owning `token`, or null when the token
   * is unknown (→ 404). Exposes the token owner's validated timed shifts (as
   * timed VEVENTs) and approved leave (as all-day VEVENTs) over [today-31d,
   * today+92d), scoped to the user's home tenant.
   */
  async buildFeed(token: string): Promise<string | null> {
    const user = await db('users').where({ ics_token: token }).first<FeedUser>('id', 'tenant_id');
    if (!user) return null;

    const today = todayIso();
    const from = addDays(today, -PAST_DAYS);
    const toExclusive = addDays(today, FUTURE_DAYS);

    const shifts = (await db('shifts')
      .leftJoin('hour_types', 'hour_types.id', 'shifts.hour_type_id')
      .where({ 'shifts.tenant_id': user.tenant_id, 'shifts.user_id': user.id, 'shifts.statut': 'valide' })
      .whereIn('shifts.type', TIMED_TYPES)
      .whereNotNull('shifts.heure_debut')
      .whereNotNull('shifts.heure_fin')
      .andWhere('shifts.date', '>=', from)
      .andWhere('shifts.date', '<', toExclusive)
      .orderBy(['shifts.date', 'shifts.heure_debut'])
      .select(
        'shifts.id',
        'shifts.date',
        'shifts.heure_debut',
        'shifts.heure_fin',
        'shifts.type',
        'shifts.note',
        'hour_types.libelle as hour_type_libelle',
      )) as FeedShiftRow[];

    const leaves = (await db('leave_requests')
      .leftJoin('leave_types', 'leave_types.id', 'leave_requests.leave_type_id')
      .where({
        'leave_requests.tenant_id': user.tenant_id,
        'leave_requests.user_id': user.id,
        'leave_requests.status': 'valide',
      })
      .andWhere('leave_requests.start_date', '<', toExclusive)
      .andWhere('leave_requests.end_date', '>=', from)
      .orderBy('leave_requests.start_date')
      .select(
        'leave_requests.id',
        'leave_requests.start_date',
        'leave_requests.end_date',
        'leave_requests.start_period',
        'leave_requests.end_period',
        'leave_types.libelle as leave_type_libelle',
      )) as FeedLeaveRow[];

    // Booked meeting reservations on this user's calendar, with the external booker's
    // name/e-mail. Confirmed → CONFIRMED VEVENT, pending → TENTATIVE.
    const appts = (await db('appointments')
      .where({ tenant_id: user.tenant_id, user_id: user.id })
      .whereIn('status', ['confirmed', 'pending'])
      .andWhere('date', '>=', from)
      .andWhere('date', '<', toExclusive)
      .orderBy(['date', 'heure_debut'])
      .select(
        'id',
        'date',
        'heure_debut',
        'heure_fin',
        'status',
        'external_name',
        'external_email',
        'subject',
      )) as FeedApptRow[];

    const dtstamp = stampUtc(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Obliplan//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText('Mon planning Obliplan')}`,
    ];

    for (const s of shifts) {
      const date = isoDate(s.date);
      const debut = s.heure_debut.slice(0, 5);
      const fin = s.heure_fin.slice(0, 5);
      // End before/equal start → shift crosses midnight; land DTEND on the next day.
      const endDate = hmToMin(fin) <= hmToMin(debut) ? addDays(date, 1) : date;
      const summary = s.hour_type_libelle || SHIFT_TYPE_LABELS[s.type as ShiftType] || 'Travail';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:shift-${s.id}@obliplan`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${localDateTime(date, debut)}`);
      lines.push(`DTEND:${localDateTime(endDate, fin)}`);
      lines.push(`SUMMARY:${escapeText(summary)}`);
      if (s.note) lines.push(`DESCRIPTION:${escapeText(s.note)}`);
      lines.push('END:VEVENT');
    }

    for (const l of leaves) {
      const start = isoDate(l.start_date);
      const end = isoDate(l.end_date);
      // All-day DTEND is exclusive → end date + 1 day.
      const endExclusive = addDays(end, 1);
      let summary = l.leave_type_libelle || 'Congé';
      // Single-day morning/afternoon leave: keep the all-day event but flag the half.
      if (start === end) {
        if (l.start_period === 'am') summary += ' (matin)';
        else if (l.start_period === 'pm') summary += ' (après-midi)';
      }
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:leave-${l.id}@obliplan`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateValue(start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateValue(endExclusive)}`);
      lines.push(`SUMMARY:${escapeText(summary)}`);
      lines.push('END:VEVENT');
    }

    for (const a of appts) {
      const date = isoDate(a.date);
      const debut = a.heure_debut.slice(0, 5);
      const fin = a.heure_fin.slice(0, 5);
      const endDate = hmToMin(fin) <= hmToMin(debut) ? addDays(date, 1) : date;
      const descParts = [`Réservé par ${a.external_name} (${a.external_email})`];
      if (a.subject) descParts.push(a.subject);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:appt-${a.id}@obliplan`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${localDateTime(date, debut)}`);
      lines.push(`DTEND:${localDateTime(endDate, fin)}`);
      lines.push(`SUMMARY:${escapeText(`Rendez-vous : ${a.external_name}`)}`);
      lines.push(`DESCRIPTION:${escapeText(descParts.join(' - '))}`);
      // The external booker as a named attendee (their e-mail lands in the calendar event).
      lines.push(`ATTENDEE;CN=${escapeText(a.external_name)};ROLE=REQ-PARTICIPANT:mailto:${a.external_email}`);
      lines.push(`STATUS:${a.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`);
      lines.push('END:VEVENT');
    }

    // RFC 5545 requires at least one component. A brand-new subscriber with no
    // validated shifts, no approved leave and no appointments in the window gets a
    // transparent (non-busy) anchor so calendar clients accept the feed.
    if (shifts.length === 0 && leaves.length === 0 && appts.length === 0) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:placeholder-${user.id}@obliplan`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateValue(today)}`);
      lines.push(`DTEND;VALUE=DATE:${dateValue(addDays(today, 1))}`);
      lines.push('SUMMARY:Planning Obliplan');
      lines.push('DESCRIPTION:Aucun créneau planifié pour le moment.');
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  },

  /**
   * A standalone iCalendar invite for ONE appointment, to attach to the confirmation
   * (METHOD:REQUEST) or cancellation (METHOD:CANCEL) e-mail sent to the external booker,
   * so their calendar can add/remove the meeting in one click.
   */
  appointmentIcs(opts: {
    id: number;
    date: string;
    start: string;
    end: string;
    hostName: string;
    hostEmail?: string | null;
    attendeeName: string;
    attendeeEmail: string;
    subject?: string | null;
    cancelled?: boolean;
  }): string {
    const endDate = hmToMin(opts.end) <= hmToMin(opts.start) ? addDays(opts.date, 1) : opts.date;
    const dtstamp = stampUtc(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Obliplan//FR',
      'CALSCALE:GREGORIAN',
      `METHOD:${opts.cancelled ? 'CANCEL' : 'REQUEST'}`,
      'BEGIN:VEVENT',
      `UID:appt-${opts.id}@obliplan`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${localDateTime(opts.date, opts.start)}`,
      `DTEND:${localDateTime(endDate, opts.end)}`,
      `SUMMARY:${escapeText(`Rendez-vous avec ${opts.hostName}`)}`,
    ];
    if (opts.subject) lines.push(`DESCRIPTION:${escapeText(opts.subject)}`);
    if (opts.hostEmail) lines.push(`ORGANIZER;CN=${escapeText(opts.hostName)}:mailto:${opts.hostEmail}`);
    lines.push(`ATTENDEE;CN=${escapeText(opts.attendeeName)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${opts.attendeeEmail}`);
    lines.push(`STATUS:${opts.cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push(`SEQUENCE:${opts.cancelled ? 1 : 0}`);
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  },
};

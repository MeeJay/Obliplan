// ============================================================================
// Public meeting-booking ("réservation de créneau").
//
// An external, unauthenticated visitor opens a host's token-gated page and books
// a slot. Availability is DERIVED from the host's own validated planning: only
// time worked under a `bookable` hour-type counts as free. Empty planning = out
// of working hours = never bookable. The public view is PII-free: it exposes free
// slots only, never the project, client, or the reason a slot is busy.
// ============================================================================

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

/** Who validates an incoming reservation (and is notified when one is made):
 *  - 'manager' (default): the host's manager validates.
 *  - 'self': the host employee validates their own reservations.
 *  - 'auto': no validation, reservations confirm immediately (host is informed). */
export type BookingValidationMode = 'manager' | 'self' | 'auto';

/** A user's public booking page configuration (one per user, tenant-scoped). */
export interface BookingPageConfig {
  userId: number;
  token: string;
  title: string | null;
  /** Public-facing description shown to external visitors. */
  intro: string | null;
  /** Slot granularity in minutes (e.g. 30). */
  slotMinutes: number;
  /** Padding kept free on both sides of an existing appointment. */
  bufferMinutes: number;
  /** Earliest lead time before a slot can be booked. */
  minNoticeHours: number;
  /** How many days ahead the page shows availability. */
  horizonDays: number;
  /** Daily clamp: no slot is ever offered outside [workStart, workEnd], even if a
   *  shift extends further. 'HH:mm'. */
  workStart: string;
  workEnd: string;
  /** Who validates an incoming reservation (see BookingValidationMode). */
  validationMode: BookingValidationMode;
  isActive: boolean;
  /** Absolute shareable URL to the public page (server-built). */
  publicUrl: string;
}

export interface BookingPageInput {
  title?: string | null;
  intro?: string | null;
  slotMinutes?: number;
  bufferMinutes?: number;
  minNoticeHours?: number;
  horizonDays?: number;
  workStart?: string;
  workEnd?: string;
  validationMode?: BookingValidationMode;
  isActive?: boolean;
}

/** A single bookable time window on a given day ('HH:mm'). */
export interface BookingSlot {
  start: string;
  end: string;
}

/** Availability for one calendar day. Only FREE slots are ever emitted - busy time
 *  is simply absent (never labelled), so nothing about the host's work leaks. */
export interface BookingDayAvailability {
  date: string; // ISO yyyy-mm-dd
  slots: BookingSlot[];
}

/** Public, PII-free view of a booking page for an external visitor. */
export interface PublicBookingPage {
  token: string;
  /** Host display name only - never email/role/project. */
  hostName: string;
  organization: string | null;
  title: string | null;
  intro: string | null;
  slotMinutes: number;
  timezone: string;
  days: BookingDayAvailability[];
  /** Inclusive ISO date bounds actually covered by `days`. */
  rangeStart: string;
  rangeEnd: string;
}

export interface CreateAppointmentInput {
  date: string;
  start: string;
  end: string;
  name: string;
  email: string;
  subject?: string | null;
}

/** Minimal result returned to the external visitor after booking. */
export interface AppointmentBooked {
  status: AppointmentStatus;
  date: string;
  start: string;
  end: string;
  /** Lets the visitor cancel their own appointment without an account. */
  cancelToken: string;
}

/** A booked appointment as surfaced ON a planning view (the host's own week, the team
 *  grid, the ICS feed): carries the external booker's name + e-mail. */
export interface PlanningAppointment {
  id: number;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  /** External booker name. */
  name: string;
  /** External booker e-mail. */
  email: string;
  subject: string | null;
}

/** An appointment as seen in an authenticated inbox (host OR manager-approver). */
export interface Appointment {
  id: number;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  externalName: string;
  externalEmail: string;
  subject: string | null;
  createdAt: string;
  /** Display name of the host the meeting is with (whose calendar it lands on). */
  hostName: string;
  /** true = the current viewer IS the host; false = it surfaced because the viewer is
   *  the manager who validates this host's reservations. */
  mine: boolean;
}

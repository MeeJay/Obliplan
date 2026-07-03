import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure HH:mm attendue');
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date yyyy-mm-dd attendue');

/** Host-side booking page configuration (all fields optional - partial update). */
export const bookingConfigSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  intro: z.string().max(2000).nullable().optional(),
  slotMinutes: z.number().int().min(5).max(240).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  minNoticeHours: z.number().int().min(0).max(720).optional(),
  horizonDays: z.number().int().min(1).max(120).optional(),
  workStart: hhmm.optional(),
  workEnd: hhmm.optional(),
  validationMode: z.enum(['manager', 'self', 'auto']).optional(),
  isActive: z.boolean().optional(),
});

/** Public booking submission from an external, unauthenticated visitor. */
export const createAppointmentSchema = z.object({
  date: isoDay,
  start: hhmm,
  end: hhmm,
  name: z.string().min(1).max(160),
  email: z.string().email('E-mail invalide').max(254),
  subject: z.string().max(300).nullable().optional(),
});

export type BookingConfigInput = z.infer<typeof bookingConfigSchema>;
export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;

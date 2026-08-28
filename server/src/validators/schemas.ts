import { z } from 'zod';

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:mm attendu');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO yyyy-mm-dd attendue');
const shiftType = z.enum(['travail', 'pause', 'repos', 'recup', 'conge', 'absence', 'ecole']);
const shiftTypeFull = z.enum(['travail', 'pause', 'repos', 'recup', 'conge', 'absence', 'ecole', 'astreinte']);
const shiftStatut = z.enum(['brouillon', 'valide']);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue');

// ── Shift templates + copy-week ───────────────────────────────────────────────
export const createShiftTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  heureDebut: hm,
  heureFin: hm,
  pauseMin: z.number().int().min(0).max(24 * 60).optional(),
  type: shiftTypeFull.optional(),
  hourTypeId: z.number().int().positive().nullable().optional(),
  boardId: z.number().int().positive().nullable().optional(),
  color: hexColor.nullable().optional(),
});
export const updateShiftTemplateSchema = createShiftTemplateSchema.partial();
export const copyWeekSchema = z.object({
  fromMonday: isoDate,
  toMonday: isoDate,
  userIds: z.array(z.number().int().positive()).min(1),
});
export const publishWeekSchema = z.object({
  monday: isoDate,
  userIds: z.array(z.number().int().positive()).min(1),
});
export const cloneShiftsSchema = z.object({
  shiftIds: z.array(z.number().int().positive()).min(1),
  toUserId: z.number().int().positive(),
  toDate: isoDate,
  /** Keep a multi-day copy's shape: each shift lands on toDate + its offset from the earliest copied day. */
  spread: z.boolean().optional(),
  /** "Annule et remplace": clear the destination's existing shifts on every pasted day first. */
  replace: z.boolean().optional(),
});

/** Undo: rewrite one employee's week to the snapshot the client captured before a mutation. */
export const restoreWeekSchema = z.object({
  userId: z.number().int().positive(),
  monday: isoDate,
  shifts: z.array(
    z.object({
      date: isoDate,
      heureDebut: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
      heureFin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
      pauseMin: z.number().int().min(0).default(0),
      type: shiftTypeFull,
      statut: shiftStatut,
      note: z.string().nullable().optional(),
      hourTypeId: z.number().int().positive().nullable().optional(),
      boardId: z.number().int().positive().nullable().optional(),
    }),
  ),
});

// ── Contrats ──────────────────────────────────────────────────────────────────
export const createContratSchema = z.object({
  libelle: z.string().min(1).max(200),
  heuresHebdoBaseMin: z.number().int().min(0).max(7 * 24 * 60),
  heuresSupAutorisees: z.boolean(),
  seuilHeuresSupMin: z.number().int().min(0).nullable().optional(),
  alternance: z.boolean(),
  // ISO country code of the contract (drives which public holidays apply). Default 'FR'.
  pays: z.string().regex(/^[A-Z]{2}$/, 'Code pays ISO à 2 lettres attendu').optional(),
  // Worked-public-holiday multiplier for heures sup (1 = 1:1, 2 = +100%).
  ferieWorkedCoeff: z.number().min(0).max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue').nullable().optional(),
  // Phase 3c - per-weekday expected minutes [Mon..Sun]; null = uniform base/5.
  workPattern: z.array(z.number().int().min(0).max(24 * 60)).length(7).nullable().optional(),
  ftePercent: z.number().int().min(0).max(100).nullable().optional(),
});
export const updateContratSchema = createContratSchema.partial();

// ── Users (admin) ─────────────────────────────────────────────────────────────
export const createUserSchema = z.object({
  username: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Identifiant invalide (lettres, chiffres, . _ -)'),
  password: z.string().min(8).max(255),
  displayName: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.string().min(1).optional(),
  contratId: z.number().int().positive().nullable().optional(),
  managerId: z.number().int().positive().nullable().optional(),
});

export const updateUserSchema = z.object({
  displayName: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  contratId: z.number().int().positive().nullable().optional(),
  managerId: z.number().int().positive().nullable().optional(),
});

// ── Jours d'école ─────────────────────────────────────────────────────────────
export const createJourEcoleSchema = z
  .object({
    userId: z.number().int().positive(),
    date: isoDate.nullable().optional(),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    periodStart: isoDate.nullable().optional(),
    periodEnd: isoDate.nullable().optional(),
  })
  .refine((d) => d.date != null || d.weekday != null, {
    message: 'Fournir une date OU un weekday récurrent',
  });

// ── Shifts ────────────────────────────────────────────────────────────────────
export const createShiftSchema = z.object({
  userId: z.number().int().positive(),
  date: isoDate,
  heureDebut: hm.nullable().optional(),
  heureFin: hm.nullable().optional(),
  pauseMin: z.number().int().min(0).max(24 * 60).optional(),
  type: shiftType,
  statut: shiftStatut.optional(),
  note: z.string().max(2000).nullable().optional(),
  hourTypeId: z.number().int().positive().nullable().optional(),
  boardId: z.number().int().positive().nullable().optional(),
  /** Half-day for a full-day absence block (congé/absence/récup): 'full' | 'am' | 'pm'. */
  dayPeriod: z.enum(['full', 'am', 'pm']).optional(),
  /** Carve overlapping shifts instead of stacking on them (default true; false = keep the overlap). */
  carve: z.boolean().optional(),
});
// userId stays writable so a manager can reassign (drag-move) a shift to another employee.
export const updateShiftSchema = createShiftSchema.partial();

// ── Récup ─────────────────────────────────────────────────────────────────────
export const createRecupSchema = z.object({
  userId: z.number().int().positive(),
  semaine: isoDate,
  heuresMin: z.number().int().positive().max(7 * 24 * 60),
  sens: z.enum(['credit', 'debit']),
  motif: z.string().max(2000).nullable().optional(),
});

// ── Kanban / Scrum ────────────────────────────────────────────────────────────
const cardPriority = z.enum(['low', 'medium', 'high']);
const sprintStatus = z.enum(['planned', 'active', 'done']);

export const createBoardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
});
export const updateBoardSchema = createBoardSchema.partial();

export const createColumnSchema = z.object({
  name: z.string().min(1).max(120),
  wipLimit: z.number().int().min(0).nullable().optional(),
});
export const updateColumnSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  position: z.number().int().min(0).optional(),
  wipLimit: z.number().int().min(0).nullable().optional(),
  isDone: z.boolean().optional(),
});

export const createSprintSchema = z.object({
  name: z.string().min(1).max(160),
  goal: z.string().max(2000).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  status: sprintStatus.optional(),
});
export const updateSprintSchema = createSprintSchema.partial();

export const createCardSchema = z.object({
  columnId: z.number().int().positive(),
  sprintId: z.number().int().positive().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).nullable().optional(),
  points: z.number().int().min(0).max(999).nullable().optional(),
  // Planned effort in minutes (Charge/workload view). null/omitted = no estimate.
  estimateMin: z.number().int().min(0).max(100000).nullable().optional(),
  priority: cardPriority.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  // Subtask parent (null/omitted = top-level card).
  parentCardId: z.number().int().positive().nullable().optional(),
});
export const updateCardSchema = createCardSchema.partial().extend({
  position: z.number().int().min(0).optional(),
});

// Board membership + card dependencies (Phase 4a).
const boardMemberRole = z.enum(['owner', 'admin', 'member', 'viewer']);
const cardLinkType = z.enum(['blocks', 'relates', 'duplicates']);

export const addBoardMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: boardMemberRole.optional(),
});
export const updateBoardMemberSchema = z.object({
  role: boardMemberRole,
});
export const addCardLinkSchema = z.object({
  targetCardId: z.number().int().positive(),
  type: cardLinkType,
});

// Card comments (Phase 4b). mentions = userIds referenced via @mention.
export const addCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  mentions: z.array(z.number().int().positive()).optional(),
});

export const createTodoSchema = z.object({
  title: z.string().min(1).max(300),
  dueDate: isoDate.nullable().optional(),
});
export const updateTodoSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  done: z.boolean().optional(),
  dueDate: isoDate.nullable().optional(),
  position: z.number().int().min(0).optional(),
});

// ── Admin config (Settings) ───────────────────────────────────────────────────
export const patchObligateSchema = z.object({
  url: z.string().url().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});
export const patchSmtpSchema = z.object({
  host: z.string().max(255).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  secure: z.boolean().optional(),
  user: z.string().max(255).nullable().optional(),
  pass: z.string().max(255).nullable().optional(),
  fromAddress: z.string().max(255).nullable().optional(),
});

// ── Tenants / workspaces ──────────────────────────────────────────────────────
const slug = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Slug invalide (minuscules, chiffres, tirets)');
export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slug.optional(),
});
export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slug.optional(),
});

// ── Leave & absence ───────────────────────────────────────────────────────────
export const createLeaveTypeSchema = z.object({
  libelle: z.string().min(1).max(120),
  code: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  paid: z.boolean().optional(),
  reducesAttendu: z.boolean().optional(),
  requiresJustification: z.boolean().optional(),
  allowanceDays: z.number().min(0).max(366).nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  // Phase 3b - legal accrual (CP 2,5 j/mois) + acquisition-period anchor.
  accrualMode: z.enum(['fixed_annual', 'monthly']).optional(),
  accrualRatePerMonth: z.number().min(0).max(31).nullable().optional(),
  periodStartMonth: z.number().int().min(1).max(12).optional(),
});
export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const createLeaveRequestSchema = z
  .object({
    userId: z.number().int().positive().optional(),
    leaveTypeId: z.number().int().positive(),
    startDate: isoDate,
    endDate: isoDate,
    halfDay: z.boolean().optional(),
    startPeriod: z.enum(['full', 'am', 'pm']).optional(),
    endPeriod: z.enum(['full', 'am', 'pm']).optional(),
    motif: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'La date de fin doit être ≥ la date de début' });

export const decideLeaveRequestSchema = z.object({
  decision: z.enum(['valide', 'refuse']),
  comment: z.string().max(2000).nullable().optional(),
});

// ── Public holidays ───────────────────────────────────────────────────────────
export const createHolidaySchema = z.object({
  date: isoDate,
  label: z.string().min(1).max(160),
  pays: z.string().regex(/^[A-Z]{2}$/, 'Code pays ISO à 2 lettres attendu').nullable().optional(),
});

export type CreateContratInput = z.infer<typeof createContratSchema>;
export type UpdateContratInput = z.infer<typeof updateContratSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateJourEcoleInput = z.infer<typeof createJourEcoleSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type CreateRecupInput = z.infer<typeof createRecupSchema>;

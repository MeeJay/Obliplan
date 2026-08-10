import apiClient from './client';
import type {
  ApiResponse,
  ComplianceFlag,
  SessionInfo,
  SsoConfig,
  TenantWithRole,
  Contrat,
  User,
  Shift,
  ShiftTemplate,
  JourEcole,
  RecupMouvement,
  Board,
  BoardDetail,
  BoardColumn,
  BoardMember,
  CardLink,
  CardLinkType,
  CardComment,
  CardActivity,
  Sprint,
  Card,
  WorkloadRow,
  ReportSummary,
  ReportByProject,
  ReportByUser,
  AstreinteQuinzaineReport,
  ImportPreview,
  ImportApplyRequest,
  ImportApplyResult,
  Todo,
  Tenant,
  SystemInfo,
  ObligateConfig,
  SmtpConfig,
  LeaveType,
  LeaveRequest,
  LeaveBalance,
  UpcomingShift,
  PermissionSet,
  CapabilityDef,
  Client,
  HourType,
  TimeEntry,
  CardTimeTotal,
  OvertimeNature,
  OvertimeDeclaration,
  OvertimeTeamSummary,
  TaskList,
  ListGroup,
  ListShare,
  Task,
  TaskStep,
  SmartList,
  UserTeam,
  TeamMember,
  TeamPermission,
  LeaveCalendarEntry,
  Notification,
  PublicHoliday,
  AuditEntry,
  AuditVerifyResult,
  TeamOverviewDTO,
  PlanningTeamRef,
  PlanningView,
  PlanningViewInput,
  BookingPageConfig,
  BookingPageInput,
  Appointment,
  PlanningAppointment,
  PublicBookingPage,
  CreateAppointmentInput,
  AppointmentBooked,
} from '@obliplan/shared';
import axios from 'axios';

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<ApiResponse<T>>(url, { params });
  return res.data.data as T;
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<ApiResponse<T>>(url, body);
  return res.data.data as T;
}
async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.put<ApiResponse<T>>(url, body);
  return res.data.data as T;
}
async function patchReq<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.patch<ApiResponse<T>>(url, body);
  return res.data.data as T;
}
async function del(url: string): Promise<void> {
  await apiClient.delete(url);
}

// Server-computed weekly view (mirrors planning.service UserWeek).
export interface WeeklyCounterDTO {
  userId: number;
  semaine: string;
  contratId: number | null;
  realiseMin: number;
  attenduMin: number;
  ecartMin: number;
  heuresSupMin: number;
  recupEligibleMin: number;
  joursEcole: number;
  astreinteMin: number;
  astreinteDeclenchements: number;
  congeJours: number;
}
export interface UserWeekDTO {
  user: User;
  shifts: Shift[];
  counter: WeeklyCounterDTO;
  recupSoldeMin: number;
  flags: ComplianceFlag[];
  /** (id, name) of every project (board) referenced by this week's shifts - lets the salarié see the project name. */
  boards: { id: number; name: string }[];
  /** Hour-types referenced by THIS week's shifts (tenant-scoped) - colours the shift chips. Mirrors `boards`. */
  hourTypes: { id: number; libelle: string; color: string | null }[];
  /** ISO dates in [monday, monday+7) that are public holidays (sorted). Purely a visual day-marker, non-blocking. */
  holidays: string[];
  /** Booked meeting reservations on this employee's calendar this week (name + e-mail), read-only on the planning. */
  appointments: PlanningAppointment[];
  /** Axis-C user_teams ids this employee belongs to (tenant-scoped). Empty = no team. Powers the per-team visibility filter. */
  teamIds: number[];
}

export interface ConnectedApp {
  appType: string;
  name: string;
  baseUrl: string;
  icon: string | null;
  color: string | null;
}

export const authApi = {
  ssoConfig: () => get<SsoConfig>('/auth/sso-config'),
  login: (username: string, password: string) =>
    post<{ user: User; sessionToken?: string }>('/auth/login', { username, password }),
  logout: () => post('/auth/logout'),
  me: () => get<SessionInfo>('/auth/me'),
  connectedApps: () => get<ConnectedApp[]>('/auth/connected-apps'),
  /** Opt-in / configure shift-change notifications (null or 0 = disabled). */
  setShiftNotify: (minutesBefore: number | null) =>
    patchReq<{ shiftNotifyBeforeMin: number | null }>('/auth/me/shift-notify', { minutesBefore }),
  /** Send the current user a test notification (in-app + push) to verify the pipeline. */
  testNotify: () => post<{ success: boolean }>('/auth/me/test-notify'),
};

export interface TenantMember {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  tenantRole: string;
}

export const moduleApi = {
  getEnabled: () => get<string[]>('/modules'),
  setEnabled: (key: string, enabled: boolean) => patchReq<string[]>('/modules', { key, enabled }),
  getEnabledFor: (tenantId: number) => get<string[]>(`/tenants/${tenantId}/modules`),
  setEnabledFor: (tenantId: number, key: string, enabled: boolean) =>
    patchReq<string[]>(`/tenants/${tenantId}/modules`, { key, enabled }),
};

export const tenantApi = {
  list: () => get<TenantWithRole[]>('/tenants'),
  switch: (tenantId: number) => post<{ currentTenantId: number }>('/tenant/switch', { tenantId }),
  setDefault: (tenantId: number | null) =>
    post<{ preferredTenantId: number | null }>('/tenant/default', { tenantId }),
  // Admin workspace management
  listAll: () => get<Tenant[]>('/tenants/all'),
  create: (data: { name: string; slug?: string }) => post<Tenant>('/tenants', data),
  update: (id: number, data: { name?: string; slug?: string }) => put<Tenant>(`/tenants/${id}`, data),
  remove: (id: number) => del(`/tenants/${id}`),
  members: (id: number) => get<TenantMember[]>(`/tenants/${id}/members`),
  addMember: (id: number, data: { userId: number; role?: string }) => post(`/tenants/${id}/members`, data),
  removeMember: (id: number, userId: number) => del(`/tenants/${id}/members/${userId}`),
};

export const appConfigApi = {
  getSystem: () => get<SystemInfo>('/admin/config/system'),
  getObligate: () => get<ObligateConfig>('/admin/config/obligate'),
  patchObligate: (patch: { url?: string | null; apiKey?: string | null; enabled?: boolean }) =>
    patchReq<ObligateConfig>('/admin/config/obligate', patch),
  importObligateUsers: () =>
    post<{ total: number; created: number; updated: number; failed: number }>(
      '/admin/config/obligate/import-users',
      {},
    ),
  getSmtp: () => get<SmtpConfig>('/admin/config/smtp'),
  patchSmtp: (patch: Partial<SmtpConfig> & { pass?: string | null }) =>
    patchReq<SmtpConfig>('/admin/config/smtp', patch),
  testSmtp: (to: string) => post<{ ok: boolean; error?: string }>('/admin/config/smtp/test', { to }),
};

export const contratApi = {
  list: () => get<Contrat[]>('/contrats'),
  create: (data: Partial<Contrat>) => post<Contrat>('/contrats', data),
  update: (id: number, data: Partial<Contrat>) => put<Contrat>(`/contrats/${id}`, data),
  remove: (id: number) => del(`/contrats/${id}`),
};

export const clientApi = {
  list: () => get<Client[]>('/clients'),
  create: (data: Partial<Client>) => post<Client>('/clients', data),
  update: (id: number, data: Partial<Client>) => put<Client>(`/clients/${id}`, data),
  remove: (id: number) => del(`/clients/${id}`),
};

export const hourTypeApi = {
  list: () => get<HourType[]>('/hour-types'),
  create: (data: Partial<HourType>) => post<HourType>('/hour-types', data),
  update: (id: number, data: Partial<HourType>) => put<HourType>(`/hour-types/${id}`, data),
  remove: (id: number) => del(`/hour-types/${id}`),
};

export const holidayApi = {
  list: (year?: number) => get<PublicHoliday[]>('/holidays', year != null ? { year } : undefined),
  addCustom: (data: { date: string; label: string; pays?: string | null }) => post<PublicHoliday>('/holidays', data),
  remove: (id: number) => del(`/holidays/${id}`),
};

export const timeEntryApi = {
  list: (userId?: number) => get<TimeEntry[]>('/time-entries', userId ? { userId } : undefined),
  running: () => get<TimeEntry | null>('/time-entries/running'),
  forBoard: (boardId: number) => get<TimeEntry[]>(`/time-entries/board/${boardId}`),
  totals: (boardId: number) => get<CardTimeTotal[]>(`/time-entries/board/${boardId}/totals`),
  start: (data: { boardId?: number | null; cardId?: number | null; note?: string | null }) =>
    post<TimeEntry>('/time-entries/start', data),
  stop: (id: number) => post<TimeEntry>(`/time-entries/${id}/stop`),
  create: (data: { boardId?: number | null; cardId?: number | null; userId?: number; minutes: number; note?: string | null; spentOn?: string | null }) =>
    post<TimeEntry>('/time-entries', data),
  update: (id: number, data: { boardId?: number | null; cardId?: number | null; minutes?: number; note?: string | null; spentOn?: string | null }) =>
    put<TimeEntry>(`/time-entries/${id}`, data),
  remove: (id: number) => del(`/time-entries/${id}`),
};

export interface AssignableUser {
  id: number;
  displayName: string | null;
  username: string;
}

export const userApi = {
  list: () => get<User[]>('/users'),
  get: (id: number) => get<User>(`/users/${id}`),
  assignable: () => get<AssignableUser[]>('/users/assignable'),
  manageable: () => get<AssignableUser[]>('/users/manageable'),
  create: (data: {
    username: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
    contratId?: number | null;
    managerId?: number | null;
  }) => post<User>('/users', data),
  update: (id: number, data: Partial<User>) => put<User>(`/users/${id}`, data),
};

export const planningApi = {
  me: (week?: string) => get<UserWeekDTO>('/planning/me', week ? { week } : undefined),
  meMonth: (month?: string) => get<UserWeekDTO[]>('/planning/me/month', month ? { month } : undefined),
  week: (userId: number, week?: string) => get<UserWeekDTO>('/planning/week', { userId, ...(week ? { week } : {}) }),
  team: (week?: string) => get<UserWeekDTO[]>('/planning/team', week ? { week } : undefined),
  // Read-only overview of every colleague's validated shifts (privacy: no note/counters). Gated server-side by planning:view_team.
  teamOverview: (week?: string) => get<TeamOverviewDTO>('/planning/team-overview', week ? { week } : undefined),
  // Axis-C teams (id + name) visible to the current viewer, for the per-team planning visibility filter. Gated planning:view_team.
  teams: () => get<PlanningTeamRef[]>('/planning/teams'),
  copyWeek: (fromMonday: string, toMonday: string, userIds: number[]) =>
    post<{ count: number }>('/planning/copy-week', { fromMonday, toMonday, userIds }),
  cloneShifts: (
    shiftIds: number[],
    toUserId: number,
    toDate: string,
    opts?: { spread?: boolean; replace?: boolean },
  ) => post<{ count: number }>('/planning/clone-shifts', { shiftIds, toUserId, toDate, ...opts }),
  /** Undo: rewrite one employee's week to a snapshot captured before a mutation. */
  restoreWeek: (
    userId: number,
    monday: string,
    shifts: Array<{
      date: string;
      heureDebut: string | null;
      heureFin: string | null;
      pauseMin: number;
      type: string;
      statut: string;
      note: string | null;
      hourTypeId: number | null;
      boardId: number | null;
    }>,
  ) => post<{ restored: number }>('/planning/restore-week', { userId, monday, shifts }),
  publish: (monday: string, userIds: number[]) =>
    post<{ published: number; notified: number }>('/planning/publish', { monday, userIds }),
  // CSV import - parse+preview then apply (creates drafts). Gated planning:write.
  importPreview: (csvText: string) => post<ImportPreview>('/planning/import/preview', { csvText }),
  importApply: (payload: ImportApplyRequest) => post<ImportApplyResult>('/planning/import/apply', payload),
};

// Saved planning "vues" - per-user, per-tenant presets of visible team ids. Gated server-side by planning:view_team.
export const planningViewApi = {
  list: () => get<PlanningView[]>('/planning/views'),
  create: (body: PlanningViewInput) => post<PlanningView>('/planning/views', body),
  update: (id: number, body: PlanningViewInput) => put<PlanningView>(`/planning/views/${id}`, body),
  remove: (id: number) => del(`/planning/views/${id}`),
};

export const shiftApi = {
  // `carve` (default true server-side) slices the shifts already on that slot instead of
  // stacking; pass carve:false to deliberately create a parallel/overlapping entry.
  create: (data: Partial<Shift> & { carve?: boolean }) => post<Shift>('/shifts', data),
  update: (id: number, data: Partial<Shift> & { carve?: boolean }) => put<Shift>(`/shifts/${id}`, data),
  remove: (id: number) => del(`/shifts/${id}`),
};

export const shiftTemplateApi = {
  list: () => get<ShiftTemplate[]>('/shift-templates'),
  create: (data: Partial<ShiftTemplate> & { name: string; heureDebut: string; heureFin: string }) =>
    post<ShiftTemplate>('/shift-templates', data),
  update: (id: number, data: Partial<ShiftTemplate>) => put<ShiftTemplate>(`/shift-templates/${id}`, data),
  remove: (id: number) => del(`/shift-templates/${id}`),
};

export const joursEcoleApi = {
  list: (userId: number) => get<JourEcole[]>('/jours-ecole', { userId }),
  create: (data: Partial<JourEcole> & { userId: number }) => post<JourEcole>('/jours-ecole', data),
  remove: (id: number) => del(`/jours-ecole/${id}`),
};

export interface RecupWeekPreview {
  eligibleMin: number;
  soldeMin: number;
  alreadyCreditedMin: number;
  projectedSoldeMin: number;
  negative: boolean;
}

export const recupApi = {
  list: (userId?: number) =>
    get<{ movements: RecupMouvement[]; soldeMin: number }>('/recup', userId ? { userId } : undefined),
  create: (data: Partial<RecupMouvement> & { userId: number }) => post<RecupMouvement>('/recup', data),
  weekPreview: (userId: number, semaine: string) =>
    get<RecupWeekPreview>('/recup/week-preview', { userId, semaine }),
  validateWeek: (userId: number, semaine: string) =>
    post<{ soldeMin: number }>('/recup/validate-week', { userId, semaine }),
  setSelfService: (userId: number, enabled: boolean) =>
    patchReq<User>('/recup/self-service', { userId, enabled }),
  remove: (id: number) => del(`/recup/${id}`),
};

export const boardApi = {
  list: () => get<Board[]>('/boards'),
  listAll: () => get<Board[]>('/boards/all'),
  get: (id: number) => get<BoardDetail>(`/boards/${id}`),
  create: (data: { name: string; description?: string | null; clientId?: number | null }) => post<BoardDetail>('/boards', data),
  update: (id: number, data: Partial<Board>) => put<Board>(`/boards/${id}`, data),
  remove: (id: number) => del(`/boards/${id}`),

  addColumn: (boardId: number, data: { name: string; wipLimit?: number | null }) =>
    post<BoardColumn>(`/boards/${boardId}/columns`, data),
  updateColumn: (id: number, data: Partial<BoardColumn>) => put<BoardColumn>(`/boards/columns/${id}`, data),
  removeColumn: (id: number) => del(`/boards/columns/${id}`),

  addSprint: (boardId: number, data: Partial<Sprint> & { name: string }) =>
    post<Sprint>(`/boards/${boardId}/sprints`, data),
  updateSprint: (id: number, data: Partial<Sprint>) => put<Sprint>(`/boards/sprints/${id}`, data),
  removeSprint: (id: number) => del(`/boards/sprints/${id}`),

  addCard: (boardId: number, data: Partial<Card> & { columnId: number; title: string }) =>
    post<Card>(`/boards/${boardId}/cards`, data),
  updateCard: (id: number, data: Partial<Card>) => put<Card>(`/boards/cards/${id}`, data),
  removeCard: (id: number) => del(`/boards/cards/${id}`),

  // Board membership (project team).
  members: (boardId: number) => get<BoardMember[]>(`/boards/${boardId}/members`),
  addMember: (boardId: number, data: { userId: number; role?: BoardMember['role'] }) =>
    post<BoardMember>(`/boards/${boardId}/members`, data),
  updateMember: (boardId: number, userId: number, data: { role: BoardMember['role'] }) =>
    put<BoardMember>(`/boards/${boardId}/members/${userId}`, data),
  removeMember: (boardId: number, userId: number) => del(`/boards/${boardId}/members/${userId}`),

  // Card dependencies.
  addLink: (cardId: number, data: { targetCardId: number; type: CardLinkType }) =>
    post<CardLink>(`/boards/cards/${cardId}/links`, data),
  removeLink: (linkId: number) => del(`/boards/cards/links/${linkId}`),

  // Card comments (+ @mentions) and activity feed.
  comments: (cardId: number) => get<CardComment[]>(`/boards/cards/${cardId}/comments`),
  addComment: (cardId: number, data: { body: string; mentions?: number[] }) =>
    post<CardComment>(`/boards/cards/${cardId}/comments`, data),
  removeComment: (commentId: number) => del(`/boards/cards/comments/${commentId}`),
  activity: (cardId: number) => get<CardActivity[]>(`/boards/cards/${cardId}/activity`),
};

export const reportApi = {
  // Per-teammate active assigned work vs weekly contract capacity (the "Charge" view).
  workload: () => get<WorkloadRow[]>('/reports/workload'),
  // Analytics hub (Rapports) - period defaults to current month when from/to omitted.
  // `to` is the exclusive upper bound (first day after the period).
  summary: (from?: string, to?: string) =>
    get<ReportSummary>('/reports/summary', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  byProject: (from?: string, to?: string) =>
    get<ReportByProject[]>('/reports/by-project', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  byUser: (from?: string, to?: string) =>
    get<ReportByUser[]>('/reports/by-user', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  // On-call (astreinte) aggregated per fortnight (quinzaine), per employee.
  astreinte: (from?: string, to?: string) =>
    get<AstreinteQuinzaineReport>('/reports/astreinte', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
};

export const todoApi = {
  list: () => get<Todo[]>('/todos'),
  create: (data: { title: string; dueDate?: string | null }) => post<Todo>('/todos', data),
  update: (id: number, data: Partial<Todo>) => put<Todo>(`/todos/${id}`, data),
  remove: (id: number) => del(`/todos/${id}`),
};

export const overtimeApi = {
  listNatures: () => get<OvertimeNature[]>('/overtime/natures'),
  createNature: (data: Partial<OvertimeNature> & { libelle: string }) => post<OvertimeNature>('/overtime/natures', data),
  updateNature: (id: number, data: Partial<OvertimeNature>) => put<OvertimeNature>(`/overtime/natures/${id}`, data),
  removeNature: (id: number) => del(`/overtime/natures/${id}`),
  listDeclarations: (userId?: number) =>
    get<OvertimeDeclaration[]>('/overtime/declarations', userId ? { userId } : undefined),
  pending: () => get<OvertimeDeclaration[]>('/overtime/declarations/pending'),
  teamSummary: (month?: string) =>
    get<OvertimeTeamSummary[]>('/overtime/declarations/team-summary', month ? { month } : undefined),
  createDeclaration: (data: { userId?: number; natureId: number; date: string; minutes: number; recupMinutes?: number; motif?: string | null }) =>
    post<OvertimeDeclaration>('/overtime/declarations', data),
  decide: (id: number, decision: 'valide' | 'refuse', comment?: string | null) =>
    patchReq<OvertimeDeclaration>(`/overtime/declarations/${id}/decision`, { decision, comment }),
  updateDeclaration: (id: number, data: { natureId?: number; date?: string; minutes?: number; recupMinutes?: number; motif?: string | null }) =>
    put<OvertimeDeclaration>(`/overtime/declarations/${id}`, data),
  requestChange: (id: number, data: { natureId?: number; date?: string; minutes?: number; recupMinutes?: number; motif?: string | null }) =>
    patchReq<OvertimeDeclaration>(`/overtime/declarations/${id}/request-change`, data),
  removeDeclaration: (id: number) => del(`/overtime/declarations/${id}`),
};

export interface TaskCounts {
  my_day: number;
  important: number;
  planned: number;
  assigned: number;
  tasks: number;
}

export const listApi = {
  list: () => get<TaskList[]>('/task-lists'),
  create: (data: { name: string; color?: string; icon?: string | null; groupId?: number | null }) =>
    post<TaskList>('/task-lists', data),
  update: (id: number, data: Partial<Pick<TaskList, 'name' | 'color' | 'icon' | 'groupId' | 'position'>>) =>
    put<TaskList>(`/task-lists/${id}`, data),
  remove: (id: number) => del(`/task-lists/${id}`),
  reorder: (items: { id: number; position: number; groupId?: number | null }[]) =>
    put<void>('/task-lists/reorder', { items }),
  groups: () => get<ListGroup[]>('/task-lists/groups'),
  createGroup: (data: { name: string }) => post<ListGroup>('/task-lists/groups', data),
  updateGroup: (id: number, data: { name?: string; position?: number; collapsed?: boolean }) =>
    put<ListGroup>(`/task-lists/groups/${id}`, data),
  removeGroup: (id: number) => del(`/task-lists/groups/${id}`),
  shares: (id: number) => get<ListShare[]>(`/task-lists/${id}/shares`),
  share: (id: number, data: { userId: number; canEdit?: boolean }) => post<ListShare>(`/task-lists/${id}/shares`, data),
  unshare: (id: number, userId: number) => del(`/task-lists/${id}/shares/${userId}`),
  members: () => get<User[]>('/task-lists/members-pool'),
};

export const taskApi = {
  byList: (listId: number) => get<Task[]>('/tasks', { listId }),
  bySmart: (smart: SmartList) => get<Task[]>('/tasks', { smart }),
  counts: () => get<{ counts: TaskCounts; inboxListId: number }>('/tasks/counts'),
  create: (data: {
    listId: number;
    title: string;
    note?: string | null;
    isImportant?: boolean;
    dueDate?: string | null;
    reminderAt?: string | null;
    myDayDate?: string | null;
    assigneeId?: number | null;
  }) => post<Task>('/tasks', data),
  update: (
    id: number,
    data: {
      title?: string;
      note?: string | null;
      isImportant?: boolean;
      isCompleted?: boolean;
      dueDate?: string | null;
      reminderAt?: string | null;
      myDayDate?: string | null;
      assigneeId?: number | null;
      listId?: number;
      position?: number;
    },
  ) => put<Task>(`/tasks/${id}`, data),
  remove: (id: number) => del(`/tasks/${id}`),
  steps: (taskId: number) => get<TaskStep[]>(`/tasks/${taskId}/steps`),
  addStep: (taskId: number, data: { title: string }) => post<TaskStep>(`/tasks/${taskId}/steps`, data),
  updateStep: (id: number, data: { title?: string; done?: boolean; position?: number }) =>
    put<TaskStep>(`/tasks/steps/${id}`, data),
  removeStep: (id: number) => del(`/tasks/steps/${id}`),
};

export const teamApi = {
  list: () => get<UserTeam[]>('/teams'),
  create: (data: { name: string; description?: string | null; canCreate?: boolean; weight?: number }) =>
    post<UserTeam>('/teams', data),
  update: (id: number, data: { name?: string; description?: string | null; canCreate?: boolean; weight?: number }) =>
    put<UserTeam>(`/teams/${id}`, data),
  remove: (id: number) => del(`/teams/${id}`),
  members: (id: number) => get<TeamMember[]>(`/teams/${id}/members`),
  setMembers: (id: number, members: TeamMember[]) => put<TeamMember[]>(`/teams/${id}/members`, { members }),
  permissions: (id: number) => get<TeamPermission[]>(`/teams/${id}/permissions`),
  setPermissions: (
    id: number,
    permissions: { scope: 'client' | 'project' | 'all'; scopeId?: number; level?: 'ro' | 'rw' }[],
  ) => put<TeamPermission[]>(`/teams/${id}/permissions`, { permissions }),
};

export const permissionSetApi = {
  list: () => get<PermissionSet[]>('/permission-sets'),
  capabilities: () => get<CapabilityDef[]>('/permission-sets/capabilities'),
  create: (data: { name: string; capabilities?: string[] }) => post<PermissionSet>('/permission-sets', data),
  update: (id: number, data: { name?: string; capabilities?: string[] }) => put<PermissionSet>(`/permission-sets/${id}`, data),
  remove: (id: number) => del(`/permission-sets/${id}`),
};

export const leaveApi = {
  // Types (config)
  listTypes: () => get<LeaveType[]>('/leave/types'),
  createType: (data: Partial<LeaveType> & { libelle: string; code: string }) => post<LeaveType>('/leave/types', data),
  updateType: (id: number, data: Partial<LeaveType>) => put<LeaveType>(`/leave/types/${id}`, data),
  removeType: (id: number) => del(`/leave/types/${id}`),
  // Requests
  listRequests: (userId?: number) => get<LeaveRequest[]>('/leave/requests', userId ? { userId } : undefined),
  pending: () => get<LeaveRequest[]>('/leave/requests/pending'),
  balances: (userId?: number) => get<LeaveBalance[]>('/leave/requests/balances', userId ? { userId } : undefined),
  createRequest: (data: { userId?: number; leaveTypeId: number; startDate: string; endDate: string; halfDay?: boolean; startPeriod?: 'full' | 'am' | 'pm'; endPeriod?: 'full' | 'am' | 'pm'; motif?: string | null }) =>
    post<LeaveRequest>('/leave/requests', data),
  calendar: (month: string) => get<LeaveCalendarEntry[]>('/leave/calendar', { month }),
  decide: (id: number, decision: 'valide' | 'refuse', comment?: string | null) =>
    patchReq<LeaveRequest>(`/leave/requests/${id}/decision`, { decision, comment }),
  cancel: (id: number) => patchReq<LeaveRequest>(`/leave/requests/${id}/cancel`, {}),
};

// ── Notifications, dashboard & calendar subscription ─────────────────────────
export const notificationApi = {
  list: (opts?: { limit?: number; offset?: number }) => get<Notification[]>('/notifications', opts),
  unreadCount: () => get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => patchReq<void>(`/notifications/${id}/read`),
  markAllRead: () => post<void>('/notifications/read-all'),
};

export interface DashboardApprovals {
  pendingLeave: number;
  pendingOvertime: number;
}
export interface DashboardDTO {
  weekStart: string;
  counter: WeeklyCounterDTO;
  recupSoldeMin: number;
  upcoming: UpcomingShift[];
  leaveBalances: LeaveBalance[];
  leaveTypes: LeaveType[];
  approvals: DashboardApprovals | null;
}
export const dashboardApi = {
  me: () => get<DashboardDTO>('/dashboard/me'),
};

// Personal iCalendar (.ics) subscription - the secret feed URL for the current user's own planning.
export const icsApi = {
  me: () => get<{ url: string; token: string }>('/ics/me'),
  regenerate: () => post<{ url: string; token: string }>('/ics/regenerate'),
};

// ── Web Push (PWA notifications) - per-device subscription for the current user ─
export const pushApi = {
  /** VAPID public key + whether push is enabled server-side (VAPID configured). */
  publicKey: () => get<{ publicKey: string | null; enabled: boolean }>('/push/public-key'),
  subscribe: (sub: unknown) => post<{ ok: boolean }>('/push/subscribe', sub),
  unsubscribe: (endpoint: string) => post<{ ok: boolean }>('/push/unsubscribe', { endpoint }),
};

// ── RGPD / GDPR - personal-data export (droit d'accès) & anonymisation (droit à l'effacement) ─
export const gdprApi = {
  /** Current user downloads all their own personal data (planning, congés, heures, récup, temps). */
  exportMe: () => get<Record<string, unknown>>('/gdpr/export/me'),
  /** Admin (users:manage) exports any tenant member's personal data. */
  exportUser: (id: number) => get<Record<string, unknown>>(`/gdpr/export/${id}`),
  /** Admin (users:manage) pseudonymises a departed salarié - identity scrubbed, records kept. */
  anonymize: (id: number) => post<{ ok: boolean }>(`/gdpr/anonymize/${id}`),
};

// ── Journal d'audit - tamper-evident, append-only trail (admin: users:manage) ─
export const auditApi = {
  /** List audit entries (newest first), optionally filtered by action. */
  list: (opts?: { action?: string; limit?: number; offset?: number }) => get<AuditEntry[]>('/audit', opts),
  /** Recompute the per-tenant hash chain and pinpoint the first break, if any. */
  verify: () => get<AuditVerifyResult>('/audit/verify'),
};

// ── Meeting booking - host-side (authed): manage my own public page + inbox ────
export const bookingApi = {
  me: () => get<BookingPageConfig>('/booking/me'),
  update: (data: BookingPageInput) => put<BookingPageConfig>('/booking/me', data),
  regenerate: () => post<BookingPageConfig>('/booking/me/regenerate'),
  appointments: (includePast = false) => get<Appointment[]>('/booking/appointments', { includePast }),
  confirm: (id: number) => post<Appointment>(`/booking/appointments/${id}/confirm`),
  cancel: (id: number) => post<Appointment>(`/booking/appointments/${id}/cancel`),
};

// ── Meeting booking - PUBLIC (no auth). A bare axios client so the 401→/login
// interceptor and the X-Auth-Token header never apply to unauthenticated visitors.
const publicClient = axios.create({ baseURL: '/api/public', headers: { 'Content-Type': 'application/json' } });
export const publicBookingApi = {
  page: (token: string, range?: { from?: string; to?: string }) =>
    publicClient
      .get<{ data: PublicBookingPage }>(`/booking/${token}`, { params: range })
      .then((r) => r.data.data),
  book: (token: string, input: CreateAppointmentInput) =>
    publicClient.post<{ data: AppointmentBooked }>(`/booking/${token}`, input).then((r) => r.data.data),
  cancel: (cancelToken: string) => publicClient.post(`/booking/appointment/${cancelToken}/cancel`).then(() => undefined),
};

/** Trigger a client-side download of `data` as a pretty-printed JSON file. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

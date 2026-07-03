import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requireModule } from '../middleware/module';
import tenantModulesRoutes, { tenantModuleAdminRouter } from './tenantModules.routes';
import authRoutes from './auth.routes';
import obligateApiRoutes from './obligate.routes';
import appConfigRoutes from './appConfig.routes';
import permissionSetsRoutes from './permissionSets.routes';
import tenantRoutes from './tenant.routes';
import usersRoutes from './users.routes';
import contratsRoutes from './contrats.routes';
import joursEcoleRoutes from './joursEcole.routes';
import shiftsRoutes from './shifts.routes';
import recupRoutes from './recup.routes';
import planningRoutes from './planning.routes';
import boardsRoutes from './boards.routes';
import todosRoutes from './todos.routes';
import leaveRoutes from './leave.routes';
import clientsRoutes from './clients.routes';
import hourTypesRoutes from './hourTypes.routes';
import timeEntriesRoutes from './timeEntries.routes';
import overtimeRoutes from './overtime.routes';
import taskListsRoutes from './taskLists.routes';
import tasksRoutes from './tasks.routes';
import teamsRoutes from './teams.routes';
import notificationsRoutes from './notifications.routes';
import dashboardRoutes from './dashboard.routes';
import shiftTemplatesRoutes from './shiftTemplates.routes';
import holidaysRoutes from './holidays.routes';
import reportsRoutes from './reports.routes';
import gdprRoutes from './gdpr.routes';
import auditRoutes from './audit.routes';
import pushRoutes from './push.routes';
import { icsPublicRoutes, icsAuthedRoutes } from './ics.routes';
import bookingRoutes from './booking.routes';
import bookingPublicRoutes from './bookingPublic.routes';

const router = Router();

// ── Global (no tenant required) ──────────────────────────────────────────────
router.use('/auth', authRoutes); // login / logout / me / sso-config
router.use('/auth', obligateApiRoutes); // app-info / dashboard-stats / sso-user-sync (Bearer)
router.use('/admin/config', appConfigRoutes); // About / Obligate gateway / SMTP (admin)
router.use('/permission-sets', permissionSetsRoutes); // permission matrix (global)
router.use('/ics', icsPublicRoutes); // PUBLIC calendar feed - token-gated, NO auth/tenant
router.use('/public/booking', bookingPublicRoutes); // PUBLIC meeting booking - token-gated, NO auth/tenant

// ── Tenant management (requireAuth, NOT requireTenant) ───────────────────────
router.use('/tenants', tenantRoutes);
router.use('/tenants', tenantModuleAdminRouter); // admin: GET/PATCH /tenants/:id/modules
router.use('/tenant', tenantRoutes); // /tenant/switch

// ── Tenant-scoped (requireAuth + requireTenant) ──────────────────────────────
const tenantRouter = Router();
tenantRouter.use(requireAuth);
tenantRouter.use(requireTenant);

tenantRouter.use('/modules', tenantModulesRoutes);
tenantRouter.use('/users', usersRoutes);
tenantRouter.use('/contrats', contratsRoutes);
tenantRouter.use('/jours-ecole', joursEcoleRoutes);
tenantRouter.use('/shifts', shiftsRoutes);
tenantRouter.use('/shift-templates', shiftTemplatesRoutes);
tenantRouter.use('/recup', requireModule('recup'), recupRoutes);
tenantRouter.use('/planning', planningRoutes);
tenantRouter.use('/boards', requireModule('projets'), boardsRoutes);
tenantRouter.use('/todos', todosRoutes);
tenantRouter.use('/leave', requireModule('conges'), leaveRoutes);
tenantRouter.use('/clients', requireModule('clients'), clientsRoutes);
tenantRouter.use('/hour-types', hourTypesRoutes);
tenantRouter.use('/holidays', holidaysRoutes); // universal (no module gate)
tenantRouter.use('/time-entries', requireModule('temps'), timeEntriesRoutes);
tenantRouter.use('/overtime', requireModule('heures_sup'), overtimeRoutes);
tenantRouter.use('/task-lists', requireModule('taches'), taskListsRoutes);
tenantRouter.use('/tasks', requireModule('taches'), tasksRoutes);
tenantRouter.use('/teams', teamsRoutes);
tenantRouter.use('/notifications', notificationsRoutes); // universal (no module gate)
tenantRouter.use('/dashboard', dashboardRoutes); // universal home aggregator
tenantRouter.use('/reports', reportsRoutes); // Charge/workload aggregation (planning:read_team)
tenantRouter.use('/gdpr', gdprRoutes); // RGPD: self data export + admin export/anonymise (users:manage)
tenantRouter.use('/audit', auditRoutes); // Tamper-evident audit trail (users:manage)
tenantRouter.use('/push', pushRoutes); // Web Push: manage my own device subscriptions
tenantRouter.use('/ics', icsAuthedRoutes); // authed: manage my own subscribe token
tenantRouter.use('/booking', bookingRoutes); // authed: manage my own public booking page + inbox

router.use('/', tenantRouter);

export { router as routes };

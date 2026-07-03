import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MyWeekPage } from './pages/MyWeekPage';
import { TeamPage } from './pages/TeamPage';
import { TeamOverviewPage } from './pages/TeamOverviewPage';
import { PlanningBoardPage } from './pages/PlanningBoardPage';
import { ImportPlanningPage } from './pages/ImportPlanningPage';
import { WorkloadPage } from './pages/WorkloadPage';
import { ReportsPage } from './pages/ReportsPage';
import { RecupPage } from './pages/RecupPage';
import { ContratsPage } from './pages/ContratsPage';
import { UsersPage } from './pages/UsersPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TodoPage } from './pages/TodoPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { CongesPage } from './pages/CongesPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { ClientsPage } from './pages/ClientsPage';
import { HourTypesPage } from './pages/HourTypesPage';
import { TimeTrackingPage } from './pages/TimeTrackingPage';
import { RecupSelfPage } from './pages/RecupSelfPage';
import { OvertimePage } from './pages/OvertimePage';
import { TeamsPage } from './pages/TeamsPage';
import { AuditPage } from './pages/AuditPage';
import { BookingSettingsPage } from './pages/BookingSettingsPage';
import { PublicBookingPage } from './pages/PublicBookingPage';

/** Gate a nested route on a tenant capability (platform admins always pass). */
function CapabilityRoute({ capability }: { capability: string }) {
  const { can } = useAuthStore();
  return can(capability) ? <Outlet /> : <Navigate to="/" replace />;
}

/** Gate the self-service récup view: opt-in employees, or managers/admins. */
function RecupSelfRoute() {
  const { user, isManager } = useAuthStore();
  return isManager() || user?.recupSelfService ? <Outlet /> : <Navigate to="/" replace />;
}

/** Gate a nested route on PLATFORM (system) admin - for global config only. */
function PlatformAdminRoute() {
  const { isPlatformAdmin } = useAuthStore();
  return isPlatformAdmin() ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* PUBLIC meeting booking - no auth, standalone (token-gated). */}
        <Route path="/rdv/:token" element={<PublicBookingPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/mon-planning" element={<MyWeekPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/conges" element={<CongesPage />} />
            <Route path="/heures-sup" element={<OvertimePage />} />
            <Route path="/projets" element={<ProjectsPage />} />
            <Route path="/taches" element={<TodoPage />} />
            <Route path="/temps" element={<TimeTrackingPage />} />
            <Route path="/rendez-vous" element={<BookingSettingsPage />} />
            <Route element={<RecupSelfRoute />}>
              <Route path="/ma-recup" element={<RecupSelfPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="planning:view_team" />}>
              <Route path="/vue-equipe" element={<TeamOverviewPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="planning:read_team" />}>
              <Route path="/equipe" element={<TeamPage />} />
              <Route path="/planning-equipe" element={<PlanningBoardPage />} />
              <Route path="/charge" element={<WorkloadPage />} />
              <Route path="/rapports" element={<ReportsPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="planning:write" />}>
              <Route path="/import-planning" element={<ImportPlanningPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="recup:manage" />}>
              <Route path="/recup" element={<RecupPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="hourtypes:manage" />}>
              <Route path="/types-heures" element={<HourTypesPage />} />
            </Route>
            <Route element={<CapabilityRoute capability="users:manage" />}>
              <Route path="/audit" element={<AuditPage />} />
            </Route>
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route path="/contrats" element={<ContratsPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/utilisateurs" element={<UsersPage />} />
              <Route path="/equipes" element={<TeamsPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
            </Route>
            {/* GLOBAL platform config - system admins only, not tenant admins. */}
            <Route element={<PlatformAdminRoute />}>
              <Route path="/workspaces" element={<WorkspacesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: 'rgb(19 23 40)', color: 'rgb(232 236 245)', border: '1px solid rgb(30 36 60)' },
        }}
      />
    </BrowserRouter>
  );
}

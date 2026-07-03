import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  BarChart3,
  Plane,
  Clock4,
  Timer,
  Tag,
  Zap,
  History,
  LayoutGrid,
  CheckSquare,
  FileText,
  UserCog,
  Users2,
  Building2,
  Briefcase,
  ScrollText,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { UserAvatar } from '../common/UserAvatar';
import { cn } from '../../utils/cn';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  /** When set, the item requires this tenant capability (platform admins always pass). */
  cap?: string;
  /** When set, the item is hidden if the module is disabled for the active tenant. */
  module?: string;
  /** Requires TENANT admin (no capability of its own - e.g. Salariés, Contrats). */
  adminOnly?: boolean;
  /** Requires PLATFORM (system) admin - global config only (Paramètres, Workspaces). */
  platform?: boolean;
  /** Extra predicate against the auth context (e.g. self-service opt-in, or a negative capability). */
  show?: (ctx: { managerOrAdmin: boolean; recupSelfService: boolean; can: (c: string) => boolean }) => boolean;
}

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', manager: 'Manager', employe: 'Salarié' };

const MAIN_NAV: NavItem[] = [
  { label: 'Accueil', path: '/', icon: <Home size={16} /> },
  { label: 'Mon planning', path: '/mon-planning', icon: <CalendarDays size={16} /> },
  // Read-only team overview for rank-and-file employees; managers/admins use the editable rota instead.
  {
    label: 'Vue équipe',
    path: '/vue-equipe',
    icon: <CalendarRange size={16} />,
    cap: 'planning:view_team',
    show: ({ can }) => !can('planning:read_team'),
  },
  { label: 'Congés', path: '/conges', icon: <Plane size={16} />, module: 'conges' },
  { label: 'Heures sup', path: '/heures-sup', icon: <Zap size={16} />, module: 'heures_sup' },
  // One entry for the whole team-planning area - Grille / Semaine / Charge are tabs inside.
  { label: 'Planning équipe', path: '/planning-equipe', icon: <CalendarRange size={16} />, cap: 'planning:read_team' },
  { label: 'Rapports', path: '/rapports', icon: <BarChart3 size={16} />, cap: 'planning:read_team' },
  { label: 'Mes projets', path: '/projets', icon: <LayoutGrid size={16} />, module: 'projets' },
  { label: 'Mes tâches', path: '/taches', icon: <CheckSquare size={16} />, module: 'taches' },
  { label: 'Suivi du temps', path: '/temps', icon: <Timer size={16} />, module: 'temps' },
  // Personal, self-service: my public meeting-booking page + incoming appointments.
  { label: 'Rendez-vous', path: '/rendez-vous', icon: <CalendarClock size={16} /> },
  {
    label: 'Ma récup',
    path: '/ma-recup',
    icon: <History size={16} />,
    module: 'recup',
    show: ({ managerOrAdmin, recupSelfService }) => managerOrAdmin || recupSelfService,
  },
];

// ── Tenant administration (grouped) ──────────────────────────────────────────
const ADMIN_PEOPLE: NavItem[] = [
  { label: 'Salariés', path: '/utilisateurs', icon: <UserCog size={16} />, adminOnly: true },
  { label: 'Équipes', path: '/equipes', icon: <Users2 size={16} />, adminOnly: true },
  { label: 'Clients', path: '/clients', icon: <Briefcase size={16} />, adminOnly: true, module: 'clients' },
];
const ADMIN_CONFIG: NavItem[] = [
  { label: 'Contrats', path: '/contrats', icon: <FileText size={16} />, adminOnly: true },
  { label: "Types d'heures", path: '/types-heures', icon: <Tag size={16} />, cap: 'hourtypes:manage' },
  { label: 'Récupération', path: '/recup', icon: <Clock4 size={16} />, cap: 'recup:manage', module: 'recup' },
  { label: 'Permissions', path: '/permissions', icon: <Shield size={16} />, adminOnly: true },
  { label: "Journal d'audit", path: '/audit', icon: <ScrollText size={16} />, cap: 'users:manage' },
];

// ── Platform (system) administration - global, cross-tenant config ────────────
const PLATFORM_NAV: NavItem[] = [
  { label: 'Workspaces', path: '/workspaces', icon: <Building2 size={16} />, platform: true },
  { label: 'Paramètres', path: '/settings', icon: <Settings size={16} />, platform: true },
];

function cleanName(user: { displayName: string | null; username: string } | null) {
  if (!user) return '';
  const u = user.username.startsWith('og_') ? user.username.slice(3) : user.username;
  return user.displayName?.trim() || u;
}

interface SidebarProps {
  /** `desktop` = persistent rail (collapsible). `drawer` = full-width panel inside the mobile off-canvas nav. */
  variant?: 'desktop' | 'drawer';
}

export function Sidebar({ variant = 'desktop' }: SidebarProps) {
  const location = useLocation();
  const { user, modules, can, isManager, isPlatformAdmin } = useAuthStore();
  const { sidebarCollapsed, toggleSidebarCollapsed, setMobileNavOpen } = useUiStore();
  const isDrawer = variant === 'drawer';
  // Closing the drawer on navigation; a no-op on desktop.
  const handleNavClick = isDrawer ? () => setMobileNavOpen(false) : undefined;
  const role = user?.role;
  const admin = role === 'admin';
  const platformAdmin = isPlatformAdmin();
  const managerOrAdmin = isManager();
  const recupSelfService = !!user?.recupSelfService;
  const [adminOpen, setAdminOpen] = useState(() => localStorage.getItem('obliplan_admin_open') !== 'false');

  const hasModule = (m?: string) => !m || modules.includes(m);
  const visible = (i: NavItem): boolean => {
    if (!hasModule(i.module)) return false;
    if (i.platform) return platformAdmin; // global config → system admin only
    if (i.cap) return can(i.cap);
    if (i.adminOnly) return admin; // tenant admin, capability-less items
    if (i.show) return i.show({ managerOrAdmin, recupSelfService, can });
    return true;
  };
  const mainItems = MAIN_NAV.filter(visible);
  const peopleItems = ADMIN_PEOPLE.filter(visible);
  const configItems = ADMIN_CONFIG.filter(visible);
  const platformItems = PLATFORM_NAV.filter(visible);
  const hasAdmin = peopleItems.length > 0 || configItems.length > 0;

  const renderLink = (item: NavItem) => {
    const active = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={handleNavClick}
        className={cn(
          'mb-0.5 flex h-[38px] items-center gap-3 rounded-[7px] px-3 text-sm font-medium transition-colors',
          active ? 'bg-accent/10 text-accent-hover' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        )}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    );
  };
  const subHeader = (label: string) => (
    <div className="px-3 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-wider text-text-muted/80">{label}</div>
  );

  function toggleAdmin() {
    setAdminOpen((v) => {
      localStorage.setItem('obliplan_admin_open', String(!v));
      return !v;
    });
  }

  // ── Collapsed (icon-only) - desktop rail only ──────────────────────────────
  if (sidebarCollapsed && !isDrawer) {
    const items = [...mainItems, ...peopleItems, ...configItems, ...platformItems];
    return (
      <aside className="flex h-full w-16 shrink-0 flex-col border-r border-border bg-bg-secondary">
        <div className="flex flex-col items-center px-2 pt-3.5">
          <button
            onClick={toggleSidebarCollapsed}
            title="Déplier"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pt-3">
          {items.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                  active ? 'bg-accent/10 text-accent-hover' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                )}
              >
                {item.icon}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-2 border-t border-border px-2 py-3">
          <Link to="/profile" title={cleanName(user)} className="transition-opacity hover:opacity-80">
            <UserAvatar avatar={user?.avatar} username={user?.username ?? '?'} size={24} />
          </Link>
          <button
            onClick={() => useAuthStore.getState().logout()}
            title="Déconnexion"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    );
  }

  // ── Expanded (desktop rail + mobile drawer) ────────────────────────────────
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-bg-secondary',
        isDrawer ? 'w-full' : 'w-60 shrink-0',
      )}
    >
      <div className="flex items-center justify-end px-3 pt-3.5">
        {isDrawer ? (
          <button
            onClick={() => setMobileNavOpen(false)}
            title="Fermer"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={toggleSidebarCollapsed}
            title="Replier"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ChevronsLeft size={16} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2">
        {mainItems.map(renderLink)}

        {/* Administration (tenant) - grouped Personnes / Configuration */}
        {hasAdmin && (
          <>
            <button
              onClick={toggleAdmin}
              className="mt-2 flex w-full items-center gap-2 px-3 py-1.5 text-text-muted transition-colors hover:text-text-secondary"
            >
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Administration</span>
              <ChevronDown size={11} className={cn('transition-transform duration-200', !adminOpen && '-rotate-90')} />
              <div className="h-px flex-1 bg-border" />
            </button>
            {adminOpen && (
              <>
                {peopleItems.length > 0 && subHeader('Personnes')}
                {peopleItems.map(renderLink)}
                {configItems.length > 0 && subHeader('Configuration')}
                {configItems.map(renderLink)}
              </>
            )}
          </>
        )}

        {/* Plateforme (system) - global config, platform admins only */}
        {platformItems.length > 0 && (
          <>
            <div className="mt-2 flex w-full items-center gap-2 px-3 py-1.5 text-text-muted">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Plateforme</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {platformItems.map(renderLink)}
          </>
        )}
      </nav>

      {/* Footer - user row + logout */}
      <div className="border-t border-border p-2.5">
        <Link
          to="/profile"
          onClick={handleNavClick}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
            location.pathname === '/profile' ? 'bg-accent/10' : 'hover:bg-bg-hover',
          )}
        >
          <UserAvatar avatar={user?.avatar} username={user?.username ?? '?'} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-text-primary">{cleanName(user)}</div>
            <div className="truncate font-mono text-[10px] text-text-muted">{ROLE_LABEL[role ?? ''] ?? role}</div>
          </div>
        </Link>
        <button
          onClick={() => useAuthStore.getState().logout()}
          className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <LogOut size={14} />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}

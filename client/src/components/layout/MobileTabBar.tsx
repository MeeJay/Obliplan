import { Link, useLocation } from 'react-router-dom';
import { Home, CalendarDays, Plane, CheckSquare, User, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';

interface TabItem {
  label: string;
  path: string;
  Icon: LucideIcon;
  /** Hidden when the module is disabled for the active tenant. */
  module?: string;
  /** Hidden unless the active tenant grants this capability (admins always pass). */
  cap?: string;
}

/** Primary destinations mirrored from Sidebar `MAIN_NAV` for one-tap phone access. */
const TABS: TabItem[] = [
  { label: 'Accueil', path: '/', Icon: Home },
  { label: 'Planning', path: '/mon-planning', Icon: CalendarDays },
  { label: 'Congés', path: '/conges', Icon: Plane, module: 'conges' },
  { label: 'Tâches', path: '/taches', Icon: CheckSquare, module: 'taches' },
  { label: 'Profil', path: '/profile', Icon: User },
];

/** Fixed bottom navigation shown only under `md`; hidden on desktop. */
export function MobileTabBar() {
  const location = useLocation();
  const { modules, can } = useAuthStore();
  const items = TABS.filter(
    (t) => (!t.module || modules.includes(t.module)) && (!t.cap || can(t.cap)),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 shrink-0 border-t border-border bg-bg-secondary pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ label, path, Icon }) => {
        const active = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-accent-hover' : 'text-text-muted hover:text-text-primary',
            )}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

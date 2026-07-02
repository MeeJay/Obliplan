import { useEffect, useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { authApi, type ConnectedApp } from '../../api';
import { TenantSwitcher } from './TenantSwitcher';
import { NotificationBell } from '../notifications/NotificationBell';
import { UserAvatar } from '../common/UserAvatar';
import { cn } from '../../utils/cn';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', manager: 'Manager', employe: 'Salarié' };

/** Per-app brand dot colors (Obli design system §1). Not theme-swappable. */
const APP_ACCENTS: Record<string, string> = {
  obliview: '#2bc4bd',
  obliguard: '#f5a623',
  oblimap: '#1edd8a',
  obliance: '#e03a3a',
  oblihub: '#2d4ec9',
  obliplan: '#7c6cff',
};
const CURRENT_APP = 'obliplan';
const APP_DISPLAY_ORDER = ['obliview', 'obliguard', 'oblimap', 'obliance', 'obliplan', 'oblihub'] as const;

function cleanName(user: { displayName: string | null; username: string }) {
  const u = user.username.startsWith('og_') ? user.username.slice(3) : user.username;
  return user.displayName?.trim() || u;
}

export function Header() {
  const { user, logout, tenants, currentTenantId } = useAuthStore();
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);
  const theme = useUiStore((s) => s.theme);
  // The white wordmark is invisible on the light (daylight) surface: use the dark lockup there.
  const wordmark = theme === 'obli-daylight' ? '/logo-daylight.svg' : '/logo.svg';
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);

  // Cross-app handoff: forward the current tenant slug so the target app lands
  // the user on the same workspace if it exists there.
  const currentTenantSlug = tenants.find((t) => t.id === currentTenantId)?.slug;

  useEffect(() => {
    authApi.connectedApps().then(setConnectedApps).catch(() => setConnectedApps([]));
  }, []);

  const appsByType = new Map<string, ConnectedApp>();
  for (const app of connectedApps) appsByType.set(app.appType, app);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3.5 bg-bg-secondary px-[18px]">
      {/* Mobile: open the off-canvas navigation drawer */}
      <button
        type="button"
        onClick={toggleMobileNav}
        aria-label="Ouvrir le menu"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary md:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Logo - compact icon on the smallest screens, full wordmark from sm+ (Obli suite parity). */}
      <Link to="/" className="flex shrink-0 items-center">
        <img src="/favicon.svg" alt="Obliplan" className="h-7 w-7 object-contain sm:hidden" />
        <img src={wordmark} alt="Obliplan" className="hidden h-8 w-auto max-w-[160px] object-contain sm:block" />
      </Link>

      {/* Tenant selector - allowed to shrink/truncate so the right cluster is never clipped. */}
      <div className="min-w-0">
        <TenantSwitcher />
      </div>

      {/* App switcher - container-wrapped pill group (Obli kit): a subtle inset frame
          (bg-hover, matching the user pill on the right) with the current app raised. */}
      <div className="ml-1.5 hidden items-center gap-1 rounded-lg bg-bg-hover p-1 md:flex">
        {APP_DISPLAY_ORDER.map((type) => {
          const isCurrent = type === CURRENT_APP;
          const app = appsByType.get(type);
          // Hide non-current apps the user has no access to.
          if (!isCurrent && !app) return null;
          const accent = app?.color || APP_ACCENTS[type] || '#8c93b6';
          const label = app?.name ?? type.charAt(0).toUpperCase() + type.slice(1);
          const onClick =
            isCurrent || !app
              ? undefined
              : () => {
                  const url = new URL(`${app.baseUrl}/auth/sso-redirect`);
                  if (currentTenantSlug) url.searchParams.set('tenant', currentTenantSlug);
                  window.location.href = url.toString();
                };
          return (
            <button
              key={type}
              type="button"
              onClick={onClick}
              disabled={isCurrent}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                isCurrent
                  ? 'cursor-default bg-bg-secondary font-semibold text-text-primary shadow-[0_1px_3px_rgb(46_52_64_/_0.1)]'
                  : 'cursor-pointer text-text-secondary hover:bg-bg-active hover:text-text-primary',
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Right cluster - never clipped: it stays shrink-0 while the left/tenant switcher compress. */}
      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        {user && (
          <>
            <NotificationBell />
            <div className="flex items-center gap-[9px] rounded-lg bg-bg-hover py-[5px] pl-[5px] pr-1.5 text-[12.5px] md:pr-3">
              <UserAvatar avatar={user.avatar} username={user.username} size={28} />
              <span className="hidden font-medium text-text-primary md:inline">{cleanName(user)}</span>
              <span className="hidden border-l border-border-light pl-2 font-mono text-[10px] uppercase tracking-wider text-accent md:inline">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </div>
            <button
              onClick={() => logout()}
              title="Déconnexion"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <LogOut size={15} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

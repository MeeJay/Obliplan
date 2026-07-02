import { NavLink } from 'react-router-dom';
import { CalendarRange, ClipboardList, Gauge } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Shared sub-navigation for the team-planning area - the three team views now live
 * under one "Planning équipe" menu entry and switch via these tabs instead of three
 * separate sidebar items.
 */
const TABS = [
  { to: '/planning-equipe', label: 'Grille', Icon: CalendarRange },
  { to: '/equipe', label: 'Récap', Icon: ClipboardList },
  { to: '/charge', label: 'Charge', Icon: Gauge },
];

export function PlanningTabs() {
  return (
    <div className="inline-flex rounded-md border border-border bg-bg-secondary p-0.5">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-accent/15 text-accent-hover' : 'text-text-secondary hover:text-text-primary',
            )
          }
        >
          <Icon size={15} /> {label}
        </NavLink>
      ))}
    </div>
  );
}

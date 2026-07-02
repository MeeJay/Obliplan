import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Activity, Wallet, ClipboardCheck, Plane, Zap, ArrowRight } from 'lucide-react';
import type { Shift, WeeklyCounter, LeaveBalance, LeaveType } from '@obliplan/shared';
import { dashboardApi, type DashboardDTO } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';
import { minToHm, minToSignedHm, dayLabel } from '../utils/format';
import { cn } from '../utils/cn';

const SHIFT_TYPE_LABEL: Record<string, string> = {
  travail: 'Travail',
  pause: 'Pause déjeuner',
  repos: 'Repos',
  recup: 'Récup',
  conge: 'Congé',
  absence: 'Absence',
  ecole: 'École',
  astreinte: 'Astreinte',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function cleanName(user: { displayName: string | null; username: string } | null): string {
  if (!user) return '';
  const u = user.username.startsWith('og_') ? user.username.slice(3) : user.username;
  return user.displayName?.trim() || u;
}

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    dashboardApi
      .me()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">
          {greeting()}, {cleanName(user)}
        </h2>
        <p className="text-sm text-text-muted">Voici un aperçu de votre semaine.</p>
      </div>

      {loading ? (
        <Spinner className="h-40" />
      ) : !data ? (
        <Card className="px-6 py-16 text-center text-sm text-text-secondary">
          Impossible de charger le tableau de bord.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <NextShiftCard shift={data.nextShift} />
          <WeekCounterCard counter={data.counter} />
          <BalancesCard
            recupSoldeMin={data.recupSoldeMin}
            balances={data.leaveBalances}
            types={data.leaveTypes}
          />
          {data.approvals && (
            <ApprovalsCard pendingLeave={data.approvals.pendingLeave} pendingOvertime={data.approvals.pendingOvertime} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Widgets ──────────────────────────────────────────────────────────────────

function WidgetHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <CardHeader className="flex items-center gap-2">
      <span className="text-accent">{icon}</span>
      <span className="text-sm font-semibold text-text-primary">{title}</span>
    </CardHeader>
  );
}

function NextShiftCard({ shift }: { shift: Shift | null }) {
  return (
    <Card>
      <WidgetHeader icon={<CalendarClock size={16} />} title="Prochain créneau" />
      <CardBody>
        {!shift ? (
          <p className="py-4 text-center text-sm text-text-muted">Aucun créneau validé à venir.</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold capitalize text-text-primary">{dayLabel(shift.date)}</div>
              <div className="mt-0.5 font-mono text-sm text-text-secondary">
                {shift.heureDebut ?? '-'}
                {shift.heureFin ? ` – ${shift.heureFin}` : ''}
              </div>
              {shift.note && <div className="mt-1 text-[13px] text-text-muted">{shift.note}</div>}
            </div>
            <span className="shrink-0 rounded bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
              {SHIFT_TYPE_LABEL[shift.type] ?? shift.type}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function WeekCounterCard({ counter }: { counter: WeeklyCounter }) {
  const pct = counter.attenduMin > 0 ? Math.min(100, Math.round((counter.realiseMin / counter.attenduMin) * 100)) : 0;
  return (
    <Card>
      <WidgetHeader icon={<Activity size={16} />} title="Ma semaine" />
      <CardBody className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="font-mono text-2xl font-semibold text-text-primary">{minToHm(counter.realiseMin)}</span>
            <span className="ml-1 text-sm text-text-muted">/ {minToHm(counter.attenduMin)}</span>
          </div>
          <span className={cn('font-mono text-sm', counter.ecartMin >= 0 ? 'text-status-up' : 'text-status-down')}>
            {minToSignedHm(counter.ecartMin)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          {counter.heuresSupMin > 0 && (
            <span className="rounded bg-status-pending/15 px-1.5 py-0.5 text-status-pending">
              heures sup {minToHm(counter.heuresSupMin)}
            </span>
          )}
          {counter.recupEligibleMin > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">récup {minToHm(counter.recupEligibleMin)}</span>
          )}
          {counter.congeJours > 0 && (
            <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-secondary">
              congé {counter.congeJours} j
            </span>
          )}
          {counter.heuresSupMin === 0 && counter.recupEligibleMin === 0 && counter.congeJours === 0 && (
            <span className="text-text-muted">Pas d'écart notable cette semaine.</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function BalancesCard({
  recupSoldeMin,
  balances,
  types,
}: {
  recupSoldeMin: number;
  balances: LeaveBalance[];
  types: LeaveType[];
}) {
  const typeById = new Map(types.map((t) => [t.id, t]));
  // Only show tracked allowances (e.g. CP/RTT), newest config order.
  const tracked = balances.filter((b) => b.remainingDays !== null);
  return (
    <Card>
      <WidgetHeader icon={<Wallet size={16} />} title="Mes soldes" />
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between rounded-md bg-bg-tertiary px-3 py-2">
          <span className="text-sm text-text-secondary">Récupération</span>
          <span
            className={cn(
              'font-mono text-base font-semibold',
              recupSoldeMin >= 0 ? 'text-text-primary' : 'text-status-down',
            )}
          >
            {minToHm(recupSoldeMin)}
          </span>
        </div>

        {tracked.length === 0 ? (
          <p className="text-[13px] text-text-muted">Aucun solde de congés suivi.</p>
        ) : (
          <ul className="space-y-1.5">
            {tracked.map((b) => {
              const t = typeById.get(b.leaveTypeId);
              return (
                <li key={b.leaveTypeId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: t?.color ?? 'rgb(var(--c-text-muted))' }}
                    />
                    {t?.libelle ?? `Type #${b.leaveTypeId}`}
                  </span>
                  <span className="font-mono text-text-primary">
                    {b.remainingDays} <span className="text-text-muted">/ {b.allowanceDays} j</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ApprovalsCard({ pendingLeave, pendingOvertime }: { pendingLeave: number; pendingOvertime: number }) {
  const none = pendingLeave === 0 && pendingOvertime === 0;
  return (
    <Card>
      <WidgetHeader icon={<ClipboardCheck size={16} />} title="À valider" />
      <CardBody className="space-y-2">
        {none ? (
          <p className="py-2 text-center text-sm text-text-muted">Rien en attente. Tout est à jour. 🎉</p>
        ) : (
          <>
            <ApprovalRow
              to="/conges"
              icon={<Plane size={15} />}
              label="Demandes de congé"
              count={pendingLeave}
            />
            <ApprovalRow
              to="/heures-sup"
              icon={<Zap size={15} />}
              label="Heures supplémentaires"
              count={pendingOvertime}
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ApprovalRow({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count: number }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-bg-hover"
    >
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        <span className="text-text-muted">{icon}</span>
        {label}
      </span>
      <span className="flex items-center gap-2">
        {count > 0 && (
          <span className="rounded-full bg-status-pending/15 px-2 py-0.5 text-xs font-semibold text-status-pending">
            {count}
          </span>
        )}
        <ArrowRight size={14} className="text-text-muted" />
      </span>
    </Link>
  );
}

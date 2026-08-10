import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Activity, Wallet, ClipboardCheck, Plane, Zap, ArrowRight } from 'lucide-react';
import type { WeeklyCounter, LeaveBalance, LeaveType, UpcomingShift } from '@obliplan/shared';
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

const toMin = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Current civil date + minutes-since-midnight in the app's Paris timezone (planning is Paris). */
function parisNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = g('hour') === '24' ? '00' : g('hour'); // some engines emit 24 at midnight
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(hour) * 60 + Number(g('minute')) };
}

/** Short "dans X" label from a minute count (e.g. 42 → "42 min", 95 → "1 h 35"). */
function inLabel(min: number): string {
  if (min <= 0) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function shiftLabel(s: UpcomingShift): string {
  return s.hourTypeLabel ?? SHIFT_TYPE_LABEL[s.type] ?? s.type;
}

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
    let alive = true;
    setLoading(true);
    const fetchData = (initial: boolean) =>
      dashboardApi
        .me()
        .then((d) => {
          if (alive) setData(d);
        })
        .catch(() => {
          if (alive && initial) setData(null);
        })
        .finally(() => {
          if (alive && initial) setLoading(false);
        });
    void fetchData(true);
    // Silently refresh every 5 min so a planning change (new/edited shift) surfaces without reload.
    const id = setInterval(() => void fetchData(false), 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
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
          <MyShiftCard upcoming={data.upcoming} />
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

/** Coloured badge for a shift's hour-type (falls back to the accent when no colour). */
function ShiftBadge({ shift }: { shift: UpcomingShift }) {
  const c = shift.hourTypeColor;
  return (
    <span
      className={cn('shrink-0 rounded px-2 py-1 text-xs font-medium', !c && 'bg-accent/15 text-accent')}
      style={c ? { backgroundColor: `${c}22`, color: c } : undefined}
    >
      {shiftLabel(shift)}
    </span>
  );
}

/**
 * "Mon créneau": the in-progress shift (with a progress bar counting down to the next change)
 * plus the next upcoming one. Self-refreshes every 30 s off the Paris clock, so it rolls over
 * on a shift change without a page reload. At day's end it just shows the next shift (next
 * working day / Monday), since `upcoming` already spans the coming days.
 */
function MyShiftCard({ upcoming }: { upcoming: UpcomingShift[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = parisNow();
  const current = upcoming.find(
    (s) => s.date === now.date && toMin(s.start) <= now.minutes && now.minutes < toMin(s.end),
  );
  const next = upcoming.find(
    (s) => s.date > now.date || (s.date === now.date && toMin(s.start) > now.minutes),
  );

  const nextWhen = (s: UpcomingShift): string => (s.date === now.date ? "Aujourd'hui" : dayLabel(s.date));

  return (
    <Card>
      <WidgetHeader icon={<CalendarClock size={16} />} title="Mon créneau" />
      <CardBody>
        {!current && !next ? (
          <p className="py-4 text-center text-sm text-text-muted">Aucun créneau validé à venir.</p>
        ) : (
          <div className="space-y-4">
            {current && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-status-up" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-status-up">En cours</span>
                    </div>
                    <div className="mt-1 font-mono text-sm text-text-secondary">
                      {current.start} – {current.end}
                      {current.boardName && <span className="ml-2 text-text-muted">{current.boardName}</span>}
                    </div>
                  </div>
                  <ShiftBadge shift={current} />
                </div>
                {(() => {
                  const s = toMin(current.start);
                  const e = toMin(current.end);
                  const pct = e > s ? Math.min(100, Math.max(0, ((now.minutes - s) / (e - s)) * 100)) : 0;
                  const remaining = Math.max(0, e - now.minutes);
                  const barColor = current.hourTypeColor ?? 'rgb(var(--c-accent))';
                  return (
                    <>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        {next && shiftLabel(next) !== shiftLabel(current)
                          ? `Changement vers ${shiftLabel(next)} dans ${inLabel(remaining)}`
                          : `Fin dans ${inLabel(remaining)}`}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {next && (
              <div className={cn(current && 'border-t border-border pt-3')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">À venir</div>
                    <div className="mt-1 text-sm font-medium capitalize text-text-primary">{nextWhen(next)}</div>
                    <div className="mt-0.5 font-mono text-sm text-text-secondary">
                      {next.start} – {next.end}
                      {next.boardName && <span className="ml-2 text-text-muted">{next.boardName}</span>}
                    </div>
                  </div>
                  <ShiftBadge shift={next} />
                </div>
              </div>
            )}
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

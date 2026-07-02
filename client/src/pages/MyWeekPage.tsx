import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { planningApi, type UserWeekDTO } from '../api';
import { currentMonth, addMonths, monthLabel, minToHm, minToSignedHm, dayLabel, addDaysIso } from '../utils/format';
import { CounterBar } from '../components/planning/CounterBar';
import { WeekTable } from '../components/planning/WeekTable';
import { ComplianceFlags } from '../components/planning/ComplianceFlags';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';

export function MyWeekPage() {
  const [month, setMonth] = useState(currentMonth);
  const [weeks, setWeeks] = useState<UserWeekDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    planningApi
      .meMonth(month)
      .then(setWeeks)
      .finally(() => setLoading(false));
  }, [month]);

  // Month totals across the weeks.
  const total = weeks.reduce(
    (acc, w) => ({
      realise: acc.realise + w.counter.realiseMin,
      attendu: acc.attendu + w.counter.attenduMin,
      sup: acc.sup + w.counter.heuresSupMin,
      recup: acc.recup + w.counter.recupEligibleMin,
      astreinte: acc.astreinte + w.counter.astreinteMin,
      decl: acc.decl + w.counter.astreinteDeclenchements,
    }),
    { realise: 0, attendu: 0, sup: 0, recup: 0, astreinte: 0, decl: 0 },
  );
  const soldeMin = weeks[0]?.recupSoldeMin ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">Mon planning</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setMonth(addMonths(month, -1))}
            className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-0 text-center font-medium capitalize text-text-primary md:min-w-[150px]">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-secondary hover:text-text-primary"
          >
            <ChevronRight size={16} />
          </button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
            Ce mois
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner className="h-40" />
      ) : (
        <>
          {/* Month totals */}
          <CounterBar
            counter={{
              userId: 0,
              semaine: month,
              contratId: null,
              realiseMin: total.realise,
              attenduMin: total.attendu,
              ecartMin: total.realise - total.attendu,
              heuresSupMin: total.sup,
              recupEligibleMin: total.recup,
              joursEcole: 0,
              astreinteMin: total.astreinte,
              astreinteDeclenchements: total.decl,
              congeJours: 0,
            }}
            soldeMin={soldeMin}
          />

          {/* One card per week */}
          {weeks.map((w) => (
            <Card key={w.counter.semaine}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {dayLabel(w.counter.semaine)} → {dayLabel(addDaysIso(w.counter.semaine, 6))}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                  <span className="text-text-secondary">
                    {minToHm(w.counter.realiseMin)} / {minToHm(w.counter.attenduMin)}
                  </span>
                  <span className={w.counter.ecartMin >= 0 ? 'text-status-up' : 'text-status-down'}>
                    {minToSignedHm(w.counter.ecartMin)}
                  </span>
                  {w.counter.heuresSupMin > 0 && (
                    <span className="rounded bg-status-pending/15 px-1.5 py-0.5 text-status-pending">
                      sup {minToHm(w.counter.heuresSupMin)}
                    </span>
                  )}
                  {w.counter.recupEligibleMin > 0 && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">récup {minToHm(w.counter.recupEligibleMin)}</span>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                <ComplianceFlags flags={w.flags} />
                <WeekTable
                  monday={w.counter.semaine}
                  shifts={w.shifts}
                  hourTypes={Object.fromEntries((w.hourTypes ?? []).map((h) => [h.id, { libelle: h.libelle, color: h.color }]))}
                  boards={Object.fromEntries((w.boards ?? []).map((b) => [b.id, { name: b.name }]))}
                  holidays={w.holidays}
                />
              </CardBody>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

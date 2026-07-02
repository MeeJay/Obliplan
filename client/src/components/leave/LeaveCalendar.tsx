import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeaveCalendarEntry } from '@obliplan/shared';
import { leaveApi } from '../../api';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Spinner } from '../common/Spinner';
import { currentMonth, addMonths, monthLabel, addDaysIso, mondayOfIso, WEEKDAYS_FR } from '../../utils/format';

/** Mon..Sun ISO dates covering the whole month (padded to full weeks). */
function monthGridDays(month: string): string[] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, '0')}`;
  const days: string[] = [];
  for (let d = mondayOfIso(first); d <= last || days.length % 7 !== 0; d = addDaysIso(d, 1)) {
    days.push(d);
  }
  return days;
}

function periodMark(entry: LeaveCalendarEntry, day: string): string {
  if (day === entry.startDate && entry.startPeriod === 'pm') return ' (am libre)';
  if (day === entry.startDate && entry.startPeriod === 'am') return ' (matin)';
  if (day === entry.endDate && entry.endPeriod === 'am') return ' (matin)';
  if (day === entry.endDate && entry.endPeriod === 'pm') return ' (pm libre)';
  return '';
}

export function LeaveCalendar() {
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<LeaveCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    leaveApi
      .calendar(month)
      .then((data) => {
        if (active) setEntries(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const days = monthGridDays(month);
  const entriesFor = (day: string) =>
    entries.filter((e) => e.startDate <= day && day <= e.endDate);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Calendrier d'équipe</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((mo) => addMonths(mo, -1))}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            title="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium capitalize text-text-primary">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setMonth((mo) => addMonths(mo, 1))}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            title="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[42rem] grid-cols-7 gap-px rounded-md bg-border">
              {WEEKDAYS_FR.map((wd) => (
                <div key={wd} className="bg-bg-secondary px-2 py-1 text-center text-[11px] font-medium text-text-muted">
                  {wd}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = day.slice(0, 7) === month;
                const dayEntries = entriesFor(day);
                return (
                  <div
                    key={day}
                    className={`min-h-[5.5rem] px-1 py-1 ${inMonth ? 'bg-bg-tertiary' : 'bg-bg-secondary'}`}
                  >
                    <div className={`mb-1 text-right text-[11px] ${inMonth ? 'text-text-secondary' : 'text-text-muted'}`}>
                      {Number(day.slice(8, 10))}
                    </div>
                    <div className="space-y-0.5">
                      {dayEntries.slice(0, 4).map((e) => {
                        const color = e.leaveTypeColor ?? '#6b7280';
                        const pending = e.status === 'en_attente';
                        return (
                          <div
                            key={e.id}
                            className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${pending ? 'border border-dashed' : ''}`}
                            style={{
                              background: `${color}${pending ? '12' : '26'}`,
                              borderColor: pending ? color : undefined,
                              color,
                            }}
                            title={`${e.userName} · ${e.leaveTypeLibelle}${pending ? ' (en attente)' : ''}`}
                          >
                            {e.userName}
                            {periodMark(e, day)}
                          </div>
                        );
                      })}
                      {dayEntries.length > 4 && (
                        <div className="px-1 text-[10px] text-text-muted">+{dayEntries.length - 4}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-accent/30" /> Validé
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm border border-dashed border-accent bg-accent/10" /> En attente
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

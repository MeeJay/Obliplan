import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import type { ReportSummary, ReportByProject, ReportByUser, AstreinteQuinzaineReport } from '@obliplan/shared';
import { reportApi } from '../api';
import { Card, CardBody, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';
import { minToHm, minToSignedHm, todayIso, currentMonth, addMonths, addDaysIso } from '../utils/format';
import { cn } from '../utils/cn';

const firstOfMonth = (month: string) => `${month}-01`;
/** Inclusive last day of a YYYY-MM month (one day before the first of next month). */
const lastOfMonth = (month: string) => addDaysIso(`${addMonths(month, 1)}-01`, -1);
/** 'YYYY-MM-DD' → 'DD/MM' for compact fortnight labels. */
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Écart tone: ahead of plan (green) vs behind plan (red), neutral at zero. */
function ecartTone(min: number): string {
  if (min > 0) return 'text-status-up';
  if (min < 0) return 'text-status-down';
  return 'text-text-muted';
}

/** One KPI tile. `value` is pre-formatted; `tone` overrides the value colour. */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={cn('mt-1 font-mono text-lg font-semibold', tone ?? 'text-text-primary')}>{value}</div>
    </div>
  );
}

/** CSV field escaping for the ';'-separated French-Excel-friendly export. */
function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ReportsPage() {
  const nowMonth = currentMonth();
  const [from, setFrom] = useState(firstOfMonth(nowMonth));
  const [toIncl, setToIncl] = useState(lastOfMonth(nowMonth));

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [byProject, setByProject] = useState<ReportByProject[]>([]);
  const [byUser, setByUser] = useState<ReportByUser[]>([]);
  const [astreinte, setAstreinte] = useState<AstreinteQuinzaineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // The API treats `to` as an exclusive upper bound; the picker shows the inclusive last day.
  const toExcl = addDaysIso(toIncl, 1);
  const validRange = from <= toIncl;

  useEffect(() => {
    if (!validRange) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      reportApi.summary(from, toExcl),
      reportApi.byProject(from, toExcl),
      reportApi.byUser(from, toExcl),
      reportApi.astreinte(from, toExcl),
    ])
      .then(([s, p, u, a]) => {
        if (!alive) return;
        setSummary(s);
        setByProject(p);
        setByUser(u);
        setAstreinte(a);
        setError(false);
      })
      .catch(() => {
        if (!alive) return;
        setSummary(null);
        setByProject([]);
        setByUser([]);
        setAstreinte(null);
        setError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, toExcl, validRange]);

  function pickMonth(month: string) {
    setFrom(firstOfMonth(month));
    setToIncl(lastOfMonth(month));
  }
  function pickLast30() {
    const today = todayIso();
    setFrom(addDaysIso(today, -29));
    setToIncl(today);
  }

  // Projects sorted most-tracked-first; max drives the proportional bar widths.
  const sortedProjects = useMemo(() => [...byProject].sort((a, b) => b.trackedMin - a.trackedMin), [byProject]);
  const maxProjectMin = Math.max(1, ...sortedProjects.map((p) => p.trackedMin));

  const ecartMin = summary ? summary.trackedMin - summary.plannedMin : 0;
  const hasData = byProject.length > 0 || byUser.length > 0 || (astreinte?.rows.length ?? 0) > 0;

  function exportCsv() {
    const sep = ';';
    const lines: string[] = [];
    const row = (cells: (string | number | null)[]) => lines.push(cells.map(csvCell).join(sep));

    row(['Rapport Obliplan']);
    row(['Période', from, toIncl]);
    lines.push('');

    row(['Temps par projet']);
    row(['Projet', 'Client', 'Temps suivi', 'Minutes', 'Entrées']);
    for (const p of sortedProjects) row([p.boardName, p.clientName ?? '', minToHm(p.trackedMin), p.trackedMin, p.entryCount]);
    lines.push('');

    row(['Temps par salarié']);
    row(['Salarié', 'Suivi', 'Planifié', 'Heures sup', 'Écart']);
    for (const u of byUser)
      row([u.userName, minToHm(u.trackedMin), minToHm(u.plannedMin), minToHm(u.overtimeMin), minToSignedHm(u.ecartMin)]);

    if (astreinte && astreinte.rows.length > 0) {
      lines.push('');
      row(['Astreinte par quinzaine (heures ; déclenchements entre parenthèses)']);
      row(['Salarié', ...astreinte.quinzaines.map((q) => `${ddmm(q.start)}-${ddmm(q.end)}`), 'Total', 'Déclenchements']);
      for (const r of astreinte.rows)
        row([
          r.userName,
          ...r.cells.map((c) => (c.count > 0 ? `${minToHm(c.minutes)} (${c.count})` : '')),
          minToHm(r.totalMin),
          r.totalCount,
        ]);
    }

    // BOM so Excel reads the UTF-8 accents correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obliplan-rapport-${from}_${toIncl}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          <BarChart3 size={20} className="text-accent" /> Rapports
        </h2>
        <Button variant="secondary" disabled={loading || error || !hasData || !validRange} onClick={exportCsv}>
          <Download size={15} className="mr-2" /> Exporter CSV
        </Button>
      </div>

      {/* Period selector */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Input label="Du" type="date" value={from} max={toIncl} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Au" type="date" value={toIncl} min={from} onChange={(e) => setToIncl(e.target.value)} />
          <div className="flex flex-wrap gap-2 pb-0.5">
            <Button size="sm" variant="secondary" onClick={() => pickMonth(currentMonth())}>
              Ce mois
            </Button>
            <Button size="sm" variant="secondary" onClick={() => pickMonth(addMonths(currentMonth(), -1))}>
              Mois préc.
            </Button>
            <Button size="sm" variant="secondary" onClick={pickLast30}>
              30 j
            </Button>
          </div>
        </CardBody>
      </Card>

      {!validRange ? (
        <p className="text-status-down">La date de début doit précéder la date de fin.</p>
      ) : loading ? (
        <Spinner className="h-40" />
      ) : error ? (
        <p className="text-status-down">Impossible de charger les rapports. Réessayez plus tard.</p>
      ) : (
        <>
          {/* KPI summary */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Kpi label="Temps suivi" value={minToHm(summary.trackedMin)} />
              <Kpi label="Planifié" value={minToHm(summary.plannedMin)} />
              <Kpi label="Écart" value={minToSignedHm(ecartMin)} tone={ecartTone(ecartMin)} />
              <Kpi label="Heures sup" value={minToHm(summary.overtimeMin)} />
              <Kpi label="Solde récup" value={minToHm(summary.recupBalanceMin)} />
              <Kpi label="Congés à venir (30 j)" value={`${summary.leaveDaysUpcoming} j`} />
              <Kpi label="Salariés actifs" value={String(summary.activeUsers)} />
            </div>
          )}

          {/* Temps par projet */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Temps par projet</span>
              <span className="font-mono text-xs text-text-muted">{sortedProjects.length} projet(s)</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {sortedProjects.length === 0 ? (
                <p className="text-sm text-text-muted">Aucun temps suivi sur la période.</p>
              ) : (
                sortedProjects.map((p) => (
                  <div key={p.boardId} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{p.boardName}</span>
                      {p.clientName && <span className="truncate text-xs text-text-muted">{p.clientName}</span>}
                      <span className="font-mono text-text-secondary">{minToHm(p.trackedMin)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${(p.trackedMin / maxProjectMin) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-text-muted">{p.entryCount} entrée(s)</div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {/* Temps par salarié */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Temps par salarié</span>
              <span className="font-mono text-xs text-text-muted">{byUser.length} salarié(s)</span>
            </CardHeader>
            <CardBody>
              {byUser.length === 0 ? (
                <p className="text-sm text-text-muted">Aucun salarié à afficher.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-text-muted">
                        <th className="px-3 py-2 text-left font-medium">Salarié</th>
                        <th className="px-2 py-2 text-right font-medium">Suivi</th>
                        <th className="px-2 py-2 text-right font-medium">Planifié</th>
                        <th className="px-2 py-2 text-right font-medium">H. sup</th>
                        <th className="px-2 py-2 text-right font-medium">Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byUser.map((u) => (
                        <tr key={u.userId} className="border-t border-border">
                          <td className="whitespace-nowrap px-3 py-2 text-text-primary">{u.userName}</td>
                          <td className="px-2 py-2 text-right font-mono text-text-secondary">{minToHm(u.trackedMin)}</td>
                          <td className="px-2 py-2 text-right font-mono text-text-secondary">{minToHm(u.plannedMin)}</td>
                          <td className="px-2 py-2 text-right font-mono text-text-muted">
                            {u.overtimeMin > 0 ? minToHm(u.overtimeMin) : <span className="text-text-muted">-</span>}
                          </td>
                          <td className={cn('px-2 py-2 text-right font-mono font-medium', ecartTone(u.ecartMin))}>
                            {minToSignedHm(u.ecartMin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Astreinte par quinzaine */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Astreinte par quinzaine</span>
              <span className="font-mono text-xs text-text-muted">{astreinte?.rows.length ?? 0} salarié(s)</span>
            </CardHeader>
            <CardBody>
              {!astreinte || astreinte.rows.length === 0 ? (
                <p className="text-sm text-text-muted">Aucune astreinte validée sur la période.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-text-muted">
                        <th className="px-3 py-2 text-left font-medium">Salarié</th>
                        {astreinte.quinzaines.map((q) => (
                          <th key={q.start} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                            {ddmm(q.start)}–{ddmm(q.end)}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {astreinte.rows.map((r) => (
                        <tr key={r.userId} className="border-t border-border">
                          <td className="whitespace-nowrap px-3 py-2 text-text-primary">{r.userName}</td>
                          {r.cells.map((c) => (
                            <td key={c.start} className="px-2 py-2 text-right font-mono text-text-secondary">
                              {c.count > 0 ? (
                                <span>
                                  {minToHm(c.minutes)} <span className="text-text-muted">({c.count})</span>
                                </span>
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right font-mono font-medium text-text-primary">
                            {minToHm(r.totalMin)} <span className="text-text-muted">({r.totalCount})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-text-muted">
                    Heures d'astreinte (nombre de déclenchements) par quinzaine - quinzaines alignées sur un ancrage fixe.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, Trash2 } from 'lucide-react';
import type { LeaveType, LeaveRequest, LeaveBalance, LeaveStatus } from '@obliplan/shared';
import { leaveApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { LeaveCalendar } from '../components/leave/LeaveCalendar';
import { todayIso } from '../utils/format';

type LeavePeriodOpt = 'full' | 'am' | 'pm';
const PERIOD_LABELS: Record<LeavePeriodOpt, string> = { full: 'Journée', am: 'Matin', pm: 'Après-midi' };
const periodTag = (p: LeavePeriodOpt) => (p === 'am' ? ' (matin)' : p === 'pm' ? ' (après-midi)' : '');

// French month labels for the acquisition-period anchor (1 = Janvier … 12 = Décembre).
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const STATUS_META: Record<LeaveStatus, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-bg-active text-text-muted' },
  en_attente: { label: 'En attente', cls: 'bg-status-pending/15 text-status-pending' },
  valide: { label: 'Validé', cls: 'bg-status-up/15 text-status-up' },
  refuse: { label: 'Refusé', cls: 'bg-status-down/15 text-status-down' },
  annule: { label: 'Annulé', cls: 'bg-bg-active text-text-muted line-through' },
};

export function CongesPage() {
  const { user, can } = useAuthStore();
  const canValidate = can('leave:validate');
  const canManageTypes = can('leave:types:manage');

  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // Inline refusal-reason editor for the pending list (motif de refus required).
  const [refusing, setRefusing] = useState<{ id: number; reason: string } | null>(null);

  // New request form
  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: todayIso(),
    endDate: todayIso(),
    startPeriod: 'full' as LeavePeriodOpt,
    endPeriod: 'full' as LeavePeriodOpt,
    motif: '',
  });

  const typeById = (id: number) => types.find((t) => t.id === id);

  const load = useCallback(() => {
    Promise.all([
      leaveApi.listTypes(),
      leaveApi.listRequests(),
      leaveApi.balances(),
      canValidate ? leaveApi.pending() : Promise.resolve([] as LeaveRequest[]),
    ])
      .then(([t, r, b, p]) => {
        setTypes(t);
        setRequests(r);
        setBalances(b);
        setPending(p);
        setForm((f) => ({ ...f, leaveTypeId: f.leaveTypeId || (t[0]?.id ? String(t[0].id) : '') }));
      })
      .finally(() => setLoading(false));
  }, [canValidate]);

  useEffect(load, [load]);

  async function submitRequest() {
    if (!form.leaveTypeId) {
      toast.error('Choisissez un type de congé');
      return;
    }
    try {
      const single = form.startDate === form.endDate;
      await leaveApi.createRequest({
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        startPeriod: form.startPeriod,
        endPeriod: single ? form.startPeriod : form.endPeriod,
        motif: form.motif || null,
      });
      toast.success('Demande envoyée');
      setForm((f) => ({ ...f, motif: '', startPeriod: 'full', endPeriod: 'full' }));
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Échec de la demande');
    }
  }

  async function decide(id: number, decision: 'valide' | 'refuse', comment?: string) {
    await leaveApi.decide(id, decision, comment ?? null);
    toast.success(decision === 'valide' ? 'Demande validée' : 'Demande refusée');
    setRefusing(null);
    load();
  }

  async function cancel(id: number) {
    await leaveApi.cancel(id);
    load();
  }

  if (loading) return <Spinner className="h-40" />;

  const userName = (uid: number) => (uid === user?.id ? 'Moi' : `#${uid}`);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-text-primary">Congés & absences</h2>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {balances.map((b) => {
          const t = typeById(b.leaveTypeId);
          if (!t) return null;
          // acquiredDays == null → untracked type (no allowance / fixed-no-solde): show only consumption.
          const tracked = b.acquiredDays != null;
          const isMonthly = t.accrualMode === 'monthly';
          return (
            <div key={b.leaveTypeId} className="rounded-md border border-border bg-bg-tertiary px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? 'transparent' }} />
                <span className="truncate">{t.libelle}</span>
                {b.periodLabel && <span className="ml-auto font-mono text-[10px] text-text-muted/80">{b.periodLabel}</span>}
              </div>
              <div className="font-mono text-lg font-semibold text-text-primary" title="Solde restant">
                {tracked ? `${b.remainingDays} j` : '-'}
                {tracked && <span className="ml-1 font-sans text-[10px] font-normal text-text-muted">restant</span>}
              </div>
              <div className="text-[11px] text-text-muted">
                {tracked
                  ? `${b.acquiredDays} acquis${isMonthly ? ' à ce jour' : ''} · ${b.consumedDays} pris`
                  : `${b.consumedDays} pris`}
                {b.pendingDays > 0 && ` · ${b.pendingDays} en attente`}
              </div>
            </div>
          );
        })}
      </div>

      {/* New request */}
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Nouvelle demande</span>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Select label="Type" value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
              </option>
            ))}
          </Select>
          <Input label="Du" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Select
            label={form.startDate === form.endDate ? 'Période' : 'Début'}
            value={form.startPeriod}
            onChange={(e) => setForm({ ...form, startPeriod: e.target.value as LeavePeriodOpt })}
          >
            {(['full', 'am', 'pm'] as LeavePeriodOpt[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
          <Input label="Au" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <Select
            label="Fin"
            value={form.endPeriod}
            disabled={form.startDate === form.endDate}
            onChange={(e) => setForm({ ...form, endPeriod: e.target.value as LeavePeriodOpt })}
          >
            {(['full', 'am', 'pm'] as LeavePeriodOpt[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button className="w-full" onClick={submitRequest}>
              Demander
            </Button>
          </div>
          <Input
            label="Motif (optionnel)"
            className="sm:col-span-6"
            value={form.motif}
            onChange={(e) => setForm({ ...form, motif: e.target.value })}
          />
        </CardBody>
      </Card>

      {/* Pending to validate (leave:validate) */}
      {canValidate && (
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-text-secondary">À valider ({pending.length})</span>
          </CardHeader>
          <CardBody>
            {pending.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune demande en attente.</p>
            ) : (
              <div className="space-y-1">
                {pending.map((r) => {
                  const t = typeById(r.leaveTypeId);
                  const isRefusing = refusing?.id === r.id;
                  return (
                    <div key={r.id} className="rounded-md border border-border bg-bg-tertiary">
                      <div className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: t?.color ?? 'transparent' }} />
                        <span className="text-text-primary">{r.userName ?? userName(r.userId)}</span>
                        <span className="text-text-secondary">{t?.libelle}</span>
                        <span className="font-mono text-xs text-text-muted">
                          {r.startDate}
                          {periodTag(r.startPeriod)} → {r.endDate}
                          {periodTag(r.endPeriod)} · {r.days} j
                        </span>
                        <span className="flex-1 truncate text-text-muted">{r.motif}</span>
                        <button onClick={() => decide(r.id, 'valide')} className="rounded p-1 text-status-up hover:bg-status-up/10" title="Valider">
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setRefusing(isRefusing ? null : { id: r.id, reason: '' })}
                          className="rounded p-1 text-status-down hover:bg-status-down/10"
                          title="Refuser"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {isRefusing && (
                        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                          <Input
                            className="flex-1"
                            placeholder="Motif du refus (obligatoire)"
                            value={refusing.reason}
                            onChange={(e) => setRefusing({ id: r.id, reason: e.target.value })}
                          />
                          <Button
                            variant="danger"
                            disabled={!refusing.reason.trim()}
                            onClick={() => decide(r.id, 'refuse', refusing.reason.trim())}
                          >
                            Confirmer le refus
                          </Button>
                          <Button variant="secondary" onClick={() => setRefusing(null)}>
                            Annuler
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Team absence calendar (leave:validate) */}
      {canValidate && <LeaveCalendar />}

      {/* My requests */}
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Mes demandes</span>
        </CardHeader>
        <CardBody>
          {requests.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune demande.</p>
          ) : (
            <div className="space-y-1">
              {requests.map((r) => {
                const t = typeById(r.leaveTypeId);
                const st = STATUS_META[r.status];
                return (
                  <div key={r.id} className="rounded-md border border-border bg-bg-secondary">
                    <div className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: t?.color ?? 'transparent' }} />
                      <span className="text-text-primary">{t?.libelle}</span>
                      <span className="font-mono text-xs text-text-muted">
                        {r.startDate}
                        {periodTag(r.startPeriod)} → {r.endDate}
                        {periodTag(r.endPeriod)} · {r.days} j
                      </span>
                      <span className="flex-1 truncate text-text-muted">{r.motif}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      {(r.status === 'en_attente' || r.status === 'valide') && (
                        <button onClick={() => cancel(r.id)} className="text-text-muted hover:text-status-down" title="Annuler">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {r.status === 'refuse' && r.decisionComment && (
                      <div className="border-t border-border px-3 py-1.5 text-xs text-status-down">
                        Motif de refus : {r.decisionComment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Leave types management (leave:types:manage) */}
      {canManageTypes && <LeaveTypesManager types={types} onChanged={load} />}
    </div>
  );
}

function LeaveTypesManager({ types, onChanged }: { types: LeaveType[]; onChanged: () => void }) {
  const [draft, setDraft] = useState({
    libelle: '',
    code: '',
    color: '#1edd8a',
    allowance: '',
    reducesAttendu: true,
    paid: true,
    accrualMode: 'fixed_annual' as 'fixed_annual' | 'monthly',
    ratePerMonth: '',
    periodStartMonth: '1',
  });

  async function add() {
    if (!draft.libelle.trim() || !draft.code.trim()) {
      toast.error('Libellé et code requis');
      return;
    }
    const monthly = draft.accrualMode === 'monthly';
    if (monthly && !(Number(draft.ratePerMonth) > 0)) {
      toast.error('Saisissez un nombre de jours/mois (ex. 2,5)');
      return;
    }
    try {
      await leaveApi.createType({
        libelle: draft.libelle.trim(),
        code: draft.code.trim().toUpperCase(),
        color: draft.color,
        // Monthly accrual derives its acquired days from the rate, not a fixed annual allowance.
        allowanceDays: monthly ? null : draft.allowance ? Number(draft.allowance) : null,
        reducesAttendu: draft.reducesAttendu,
        paid: draft.paid,
        accrualMode: draft.accrualMode,
        accrualRatePerMonth: monthly && draft.ratePerMonth ? Number(draft.ratePerMonth) : null,
        periodStartMonth: Number(draft.periodStartMonth),
      });
      toast.success('Type créé');
      setDraft({
        libelle: '',
        code: '',
        color: '#1edd8a',
        allowance: '',
        reducesAttendu: true,
        paid: true,
        accrualMode: 'fixed_annual',
        ratePerMonth: '',
        periodStartMonth: '1',
      });
      onChanged();
    } catch {
      toast.error('Échec de la création');
    }
  }

  async function remove(id: number) {
    try {
      await leaveApi.removeType(id);
      onChanged();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Suppression impossible');
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Types de congés (admin)</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="space-y-1">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: t.color ?? 'transparent' }} />
              <span className="text-text-primary">{t.libelle}</span>
              <span className="font-mono text-xs text-text-muted">{t.code}</span>
              <span className="text-xs text-text-muted">
                {t.accrualMode === 'monthly'
                  ? `${t.accrualRatePerMonth ?? 0} j/mois · période ${MONTHS_FR[(t.periodStartMonth || 1) - 1]}`
                  : t.allowanceDays != null
                    ? `${t.allowanceDays} j/an`
                    : 'sans solde'}
                {t.reducesAttendu ? ' · réduit attendu' : ''}
                {t.paid ? ' · payé' : ' · non payé'}
              </span>
              <button onClick={() => remove(t.id)} className="ml-auto text-text-muted hover:text-status-down" title="Supprimer">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-6">
          <Input label="Libellé" value={draft.libelle} onChange={(e) => setDraft({ ...draft, libelle: e.target.value })} />
          <Input label="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <Select
            label="Mode"
            value={draft.accrualMode}
            onChange={(e) => setDraft({ ...draft, accrualMode: e.target.value as 'fixed_annual' | 'monthly' })}
          >
            <option value="fixed_annual">Annuel fixe</option>
            <option value="monthly">Mensuel (acquisition)</option>
          </Select>
          {draft.accrualMode === 'monthly' ? (
            <Input
              label="Jours/mois"
              type="number"
              step="0.1"
              min="0"
              placeholder="2.5"
              value={draft.ratePerMonth}
              onChange={(e) => setDraft({ ...draft, ratePerMonth: e.target.value })}
            />
          ) : (
            <Input label="Jours/an" type="number" value={draft.allowance} onChange={(e) => setDraft({ ...draft, allowance: e.target.value })} />
          )}
          <Select
            label="Mois de début de période"
            value={draft.periodStartMonth}
            onChange={(e) => setDraft({ ...draft, periodStartMonth: e.target.value })}
          >
            {MONTHS_FR.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-secondary">Couleur</label>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              className="h-[38px] w-full cursor-pointer rounded-md border border-border bg-bg-tertiary"
            />
          </div>
          <label className="flex items-end gap-1.5 pb-2 text-sm text-text-secondary">
            <input type="checkbox" checked={draft.reducesAttendu} onChange={(e) => setDraft({ ...draft, reducesAttendu: e.target.checked })} />
            Réduit l'attendu
          </label>
          <div className="flex items-end">
            <Button className="w-full" onClick={add}>
              Ajouter
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

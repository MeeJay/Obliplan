import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { OvertimeNature, OvertimeDeclaration, OvertimeStatus, OvertimeTeamSummary } from '@obliplan/shared';
import { overtimeApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { minToHm, todayIso, currentMonth, addMonths, monthLabel } from '../utils/format';

const STATUS_META: Record<OvertimeStatus, { label: string; cls: string }> = {
  en_attente: { label: 'En attente', cls: 'bg-status-pending/15 text-status-pending' },
  valide: { label: 'Validé', cls: 'bg-status-up/15 text-status-up' },
  refuse: { label: 'Refusé', cls: 'bg-status-down/15 text-status-down' },
};

/** Hours string (e.g. "1.5") → minutes. */
function hoursToMinutes(hours: string): number {
  return Math.round(Number(hours) * 60);
}

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

type DeclarationDraft = { natureId: number; date: string; minutes: number; recupMinutes: number; motif: string | null };

/** Clear "X h sup · Y récup · Z net" breakdown (requirement #4). Net = minutes − récup. */
function HoursBreakdown({ minutes, recupMinutes }: { minutes: number; recupMinutes: number }) {
  if (recupMinutes > 0) {
    return (
      <span className="font-mono text-xs">
        <span className="text-text-secondary">{minToHm(minutes)} sup</span>
        <span className="text-text-muted"> · {minToHm(recupMinutes)} récup · </span>
        <span className="text-text-primary">{minToHm(minutes - recupMinutes)} net</span>
      </span>
    );
  }
  return <span className="font-mono text-xs text-text-muted">{minToHm(minutes)}</span>;
}

/** Live récup hint below the declare/edit grids. */
function RecupHint({ minutes, recupMinutes }: { minutes: number; recupMinutes: number }) {
  if (recupMinutes <= 0) return null;
  if (recupMinutes > minutes) {
    return <p className="text-xs text-status-down sm:col-span-6">La récup ne peut excéder les heures déclarées.</p>;
  }
  return (
    <p className="text-xs text-text-muted sm:col-span-6">
      → {minToHm(minutes - recupMinutes)} net · {minToHm(recupMinutes)} récup
    </p>
  );
}

/** Inline reason editor used by the refusal flow (motif de refus required). */
function RefusalEditor({
  reason,
  onChange,
  onConfirm,
  onCancel,
}: {
  reason: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border px-3 py-2">
      <div className="flex-1">
        <Input
          placeholder="Motif de refus (obligatoire)"
          value={reason}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <Button size="sm" variant="danger" disabled={!reason.trim()} onClick={onConfirm}>
        Confirmer le refus
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>
        Annuler
      </Button>
    </div>
  );
}

/** Nature / Date / Heures / Récup / Motif form, reused for self-declare and declare-on-behalf. */
function DeclarationForm({
  natures,
  defaultNatureId,
  submitLabel,
  onSubmit,
}: {
  natures: OvertimeNature[];
  defaultNatureId: string;
  submitLabel: string;
  onSubmit: (data: DeclarationDraft) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ natureId: defaultNatureId, date: todayIso(), hours: '', recupHours: '', motif: '' });

  useEffect(() => {
    setForm((f) => ({ ...f, natureId: f.natureId || defaultNatureId }));
  }, [defaultNatureId]);

  const minutes = hoursToMinutes(form.hours);
  const recupMinutes = hoursToMinutes(form.recupHours);

  async function submit() {
    if (!form.natureId) {
      toast.error('Choisissez une nature');
      return;
    }
    if (!minutes || minutes <= 0) {
      toast.error('Saisissez un nombre d’heures valide');
      return;
    }
    if (recupMinutes > minutes) {
      toast.error('La récup ne peut excéder les heures déclarées');
      return;
    }
    const ok = await onSubmit({
      natureId: Number(form.natureId),
      date: form.date,
      minutes,
      recupMinutes: Math.max(0, recupMinutes),
      motif: form.motif || null,
    });
    if (ok) setForm((f) => ({ ...f, hours: '', recupHours: '', motif: '' }));
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <Select label="Nature" value={form.natureId} onChange={(e) => setForm({ ...form, natureId: e.target.value })}>
        {natures.map((n) => (
          <option key={n.id} value={n.id}>
            {n.libelle}
          </option>
        ))}
      </Select>
      <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Input
        label="Heures"
        type="number"
        step="0.25"
        min="0"
        value={form.hours}
        onChange={(e) => setForm({ ...form, hours: e.target.value })}
      />
      <Input
        label="Récup (h)"
        type="number"
        step="0.25"
        min="0"
        value={form.recupHours}
        onChange={(e) => setForm({ ...form, recupHours: e.target.value })}
      />
      <Input label="Motif (optionnel)" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
      <div className="flex items-end">
        <Button className="w-full" disabled={recupMinutes > minutes} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
      <RecupHint minutes={minutes} recupMinutes={recupMinutes} />
    </div>
  );
}

/** Inline edit / "demande de modification" form seeded from an existing declaration. */
function InlineEditForm({
  natures,
  initial,
  title,
  onSave,
  onCancel,
}: {
  natures: OvertimeNature[];
  initial: OvertimeDeclaration;
  title: string;
  onSave: (data: DeclarationDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [natureId, setNatureId] = useState(String(initial.natureId));
  const [date, setDate] = useState(initial.date);
  const [hours, setHours] = useState(String(initial.minutes / 60));
  const [recupHours, setRecupHours] = useState(initial.recupMinutes ? String(initial.recupMinutes / 60) : '');
  const [motif, setMotif] = useState(initial.motif ?? '');

  const minutes = hoursToMinutes(hours);
  const recupMinutes = hoursToMinutes(recupHours);

  async function save() {
    if (!minutes || minutes <= 0) {
      toast.error('Saisissez un nombre d’heures valide');
      return;
    }
    if (recupMinutes > minutes) {
      toast.error('La récup ne peut excéder les heures déclarées');
      return;
    }
    await onSave({ natureId: Number(natureId), date, minutes, recupMinutes: Math.max(0, recupMinutes), motif: motif || null });
  }

  return (
    <div className="rounded-md border border-accent/40 bg-bg-secondary px-3 py-3">
      <p className="mb-2 text-xs text-text-muted">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Select label="Nature" value={natureId} onChange={(e) => setNatureId(e.target.value)}>
          {natures.map((nat) => (
            <option key={nat.id} value={nat.id}>
              {nat.libelle}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Heures" type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
        <Input label="Récup (h)" type="number" step="0.25" min="0" value={recupHours} onChange={(e) => setRecupHours(e.target.value)} />
        <Input label="Motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
        <div className="flex items-end gap-2">
          <Button className="flex-1" disabled={recupMinutes > minutes} onClick={save}>
            Enregistrer
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
        <RecupHint minutes={minutes} recupMinutes={recupMinutes} />
      </div>
    </div>
  );
}

export function OvertimePage() {
  const { user, isManager, isAdmin, can } = useAuthStore();
  const manager = isManager();
  const admin = isAdmin();
  const canValidate = can('overtime:validate');

  const [natures, setNatures] = useState<OvertimeNature[]>([]);
  const [declarations, setDeclarations] = useState<OvertimeDeclaration[]>([]);
  const [pending, setPending] = useState<OvertimeDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped after every mutation so the manager console re-fetches its own data.
  const [signal, setSignal] = useState(0);

  // Inline edit / "demande de modification" of one of MY declarations.
  const [editing, setEditing] = useState<{ id: number; mode: 'edit' | 'change' } | null>(null);
  // Refusal flow state for the "À valider" quick-triage list.
  const [refusal, setRefusal] = useState<{ id: number; reason: string } | null>(null);

  const natureById = (id: number) => natures.find((n) => n.id === id);

  const load = useCallback(() => {
    Promise.all([
      overtimeApi.listNatures(),
      overtimeApi.listDeclarations(),
      manager ? overtimeApi.pending() : Promise.resolve([] as OvertimeDeclaration[]),
    ])
      .then(([n, d, p]) => {
        setNatures(n);
        setDeclarations(d);
        setPending(p);
      })
      .finally(() => setLoading(false));
  }, [manager]);

  useEffect(load, [load]);

  const reloadAll = useCallback(() => {
    load();
    setSignal((s) => s + 1);
  }, [load]);

  async function submitSelfDeclaration(data: DeclarationDraft): Promise<boolean> {
    try {
      await overtimeApi.createDeclaration(data);
      toast.success('Déclaration envoyée');
      reloadAll();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la déclaration'));
      return false;
    }
  }

  async function decide(id: number, decision: 'valide' | 'refuse', comment?: string | null) {
    try {
      await overtimeApi.decide(id, decision, comment ?? null);
      toast.success(decision === 'valide' ? 'Déclaration validée' : 'Déclaration refusée');
      setRefusal(null);
      reloadAll();
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la décision'));
    }
  }

  async function saveOwnEdit(id: number, mode: 'edit' | 'change', data: DeclarationDraft): Promise<boolean> {
    try {
      if (mode === 'edit') {
        await overtimeApi.updateDeclaration(id, data);
        toast.success('Déclaration modifiée');
      } else {
        await overtimeApi.requestChange(id, data);
        toast.success('Demande de modification envoyée');
      }
      setEditing(null);
      reloadAll();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la modification'));
      return false;
    }
  }

  async function removeDeclaration(id: number) {
    try {
      await overtimeApi.removeDeclaration(id);
      toast.success('Déclaration supprimée');
      if (editing?.id === id) setEditing(null);
      reloadAll();
    } catch (err) {
      toast.error(errMsg(err, 'Suppression impossible'));
    }
  }

  if (loading) return <Spinner className="h-40" />;

  const userName = (d: OvertimeDeclaration) =>
    d.userName ?? (d.userId === user?.id ? 'Moi' : `#${d.userId}`);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-text-primary">Heures supplémentaires</h2>

      {/* New declaration */}
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Nouvelle déclaration</span>
        </CardHeader>
        <CardBody>
          <DeclarationForm
            natures={natures}
            defaultNatureId={natures[0]?.id ? String(natures[0].id) : ''}
            submitLabel="Déclarer"
            onSubmit={submitSelfDeclaration}
          />
        </CardBody>
      </Card>

      {/* Pending quick-triage (manager/admin) */}
      {manager && (
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-text-secondary">À valider ({pending.length})</span>
          </CardHeader>
          <CardBody>
            {pending.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune déclaration en attente.</p>
            ) : (
              <div className="space-y-1">
                {pending.map((d) => {
                  const n = natureById(d.natureId);
                  const refusing = refusal?.id === d.id;
                  return (
                    <div key={d.id} className="rounded-md border border-border bg-bg-tertiary">
                      <div className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: n?.color ?? 'transparent' }} />
                        <span className="text-text-primary">{userName(d)}</span>
                        <span className="text-text-secondary">{n?.libelle}</span>
                        <span className="font-mono text-xs text-text-muted">{d.date}</span>
                        <HoursBreakdown minutes={d.minutes} recupMinutes={d.recupMinutes} />
                        <span className="flex-1 truncate text-text-muted">{d.motif}</span>
                        {!refusing && (
                          <>
                            <button onClick={() => decide(d.id, 'valide')} className="rounded p-1 text-status-up hover:bg-status-up/10" title="Valider">
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setRefusal({ id: d.id, reason: '' })}
                              className="rounded p-1 text-status-down hover:bg-status-down/10"
                              title="Refuser"
                            >
                              <X size={16} />
                            </button>
                            {canValidate && (
                              <button
                                onClick={() => removeDeclaration(d.id)}
                                className="rounded p-1 text-text-muted hover:bg-status-down/10 hover:text-status-down"
                                title="Supprimer"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {refusing && (
                        <RefusalEditor
                          reason={refusal.reason}
                          onChange={(v) => setRefusal({ id: d.id, reason: v })}
                          onConfirm={() => decide(d.id, 'refuse', refusal.reason)}
                          onCancel={() => setRefusal(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* My declarations */}
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Mes déclarations</span>
        </CardHeader>
        <CardBody>
          {declarations.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune déclaration.</p>
          ) : (
            <div className="space-y-1">
              {declarations.map((d) => {
                const n = natureById(d.natureId);
                const st = STATUS_META[d.status];
                if (editing?.id === d.id) {
                  return (
                    <InlineEditForm
                      key={d.id}
                      natures={natures}
                      initial={d}
                      title={editing.mode === 'change' ? 'Demande de modification' : 'Modifier la déclaration'}
                      onSave={(data) => saveOwnEdit(d.id, editing.mode, data)}
                      onCancel={() => setEditing(null)}
                    />
                  );
                }
                return (
                  <div key={d.id} className="rounded-md border border-border bg-bg-secondary">
                    <div className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: n?.color ?? 'transparent' }} />
                      <span className="text-text-primary">{n?.libelle}</span>
                      <span className="font-mono text-xs text-text-muted">{d.date}</span>
                      <HoursBreakdown minutes={d.minutes} recupMinutes={d.recupMinutes} />
                      <span className="flex-1 truncate text-text-muted">{d.motif}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      {d.status === 'en_attente' && (
                        <>
                          <button onClick={() => setEditing({ id: d.id, mode: 'edit' })} className="rounded p-1 text-text-muted hover:bg-bg-tertiary hover:text-text-primary" title="Modifier">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => removeDeclaration(d.id)} className="rounded p-1 text-text-muted hover:bg-status-down/10 hover:text-status-down" title="Supprimer">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                      {d.status === 'valide' && (
                        <button
                          onClick={() => setEditing({ id: d.id, mode: 'change' })}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
                          title="Demander une modification"
                        >
                          <RefreshCw size={14} />
                          Demander une modification
                        </button>
                      )}
                      {/* Admin cleanup: delete on ANY status (incl. validé/refusé). */}
                      {canValidate && d.status !== 'en_attente' && (
                        <button
                          onClick={() => removeDeclaration(d.id)}
                          className="rounded p-1 text-text-muted hover:bg-status-down/10 hover:text-status-down"
                          title="Supprimer (admin)"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {d.status === 'refuse' && d.decisionComment && (
                      <div className="border-t border-border px-3 py-2 text-xs text-status-down">
                        Motif de refus : {d.decisionComment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Manager console: monthly team summary + per-employee management */}
      {manager && <ManagerConsole natures={natures} canValidate={canValidate} signal={signal} onChanged={reloadAll} />}

      {/* Natures management (admin / overtime:natures:manage) */}
      {admin && <OvertimeNaturesManager natures={natures} onChanged={reloadAll} />}
    </div>
  );
}

function ManagerConsole({
  natures,
  canValidate,
  signal,
  onChanged,
}: {
  natures: OvertimeNature[];
  canValidate: boolean;
  signal: number;
  onChanged: () => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<OvertimeTeamSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [decls, setDecls] = useState<OvertimeDeclaration[]>([]);
  const [declsLoading, setDeclsLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<{ id: number; reason: string } | null>(null);

  const natureById = (id: number) => natures.find((n) => n.id === id);

  useEffect(() => {
    let active = true;
    setSummaryLoading(true);
    overtimeApi
      .teamSummary(month)
      .then((data) => {
        if (active) setSummary(data);
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, signal]);

  useEffect(() => {
    if (selectedUserId == null) {
      setDecls([]);
      return;
    }
    let active = true;
    setDeclsLoading(true);
    overtimeApi
      .listDeclarations(selectedUserId)
      .then((data) => {
        if (active) setDecls(data);
      })
      .finally(() => {
        if (active) setDeclsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, signal]);

  const selectedEntry = summary.find((s) => s.userId === selectedUserId) ?? null;

  // Active natures = the matrix columns. Inactive natures stay out of the recap.
  const activeNatures = natures.filter((n) => n.isActive);
  const activeIds = new Set(activeNatures.map((n) => n.id));
  // Validated minutes on a nature that is no longer active (e.g. deactivated after use) -
  // surfaced in an "Autres" column so each row reconciles with its Total H sup.
  const othersOf = (s: OvertimeTeamSummary) =>
    Object.entries(s.perNature ?? {}).reduce((sum, [id, m]) => (activeIds.has(Number(id)) ? sum : sum + m), 0);
  const anyOthers = summary.some((s) => othersOf(s) > 0);

  // Column totals across the whole team for the TOTAUX footer row.
  const totals = summary.reduce(
    (acc, s) => {
      for (const nat of activeNatures) acc.perNature[nat.id] = (acc.perNature[nat.id] ?? 0) + (s.perNature?.[nat.id] ?? 0);
      acc.others += othersOf(s);
      acc.validatedMinutes += s.validatedMinutes;
      acc.recupMinutes += s.recupMinutes;
      acc.pendingMinutes += s.pendingMinutes;
      acc.pendingCount += s.pendingCount;
      return acc;
    },
    { perNature: {} as Record<number, number>, others: 0, validatedMinutes: 0, recupMinutes: 0, pendingMinutes: 0, pendingCount: 0 },
  );

  // The selected employee's declarations restricted to the displayed month, chronological.
  const periodDecls = decls
    .filter((d) => d.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date));

  async function decide(id: number, decision: 'valide' | 'refuse', comment?: string | null) {
    try {
      await overtimeApi.decide(id, decision, comment ?? null);
      toast.success(decision === 'valide' ? 'Déclaration validée' : 'Déclaration refusée');
      setRefusal(null);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la décision'));
    }
  }

  async function saveEdit(id: number, data: DeclarationDraft): Promise<boolean> {
    try {
      await overtimeApi.updateDeclaration(id, data);
      toast.success('Déclaration modifiée');
      setEditingId(null);
      onChanged();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la modification'));
      return false;
    }
  }

  async function remove(id: number) {
    try {
      await overtimeApi.removeDeclaration(id);
      toast.success('Déclaration supprimée');
      if (editingId === id) setEditingId(null);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Suppression impossible'));
    }
  }

  async function declareForEmployee(data: DeclarationDraft): Promise<boolean> {
    if (selectedUserId == null) return false;
    try {
      await overtimeApi.createDeclaration({ userId: selectedUserId, ...data });
      toast.success('Déclaration créée');
      onChanged();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la déclaration'));
      return false;
    }
  }

  return (
    <Card className="print-recap">
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Récap heures sup de l'équipe</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary"
            title="Imprimer le récapitulatif"
          >
            <Printer size={14} />
            Imprimer
          </button>
          <button
            onClick={() => setMonth((mo) => addMonths(mo, -1))}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            title="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium capitalize text-text-primary">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth((mo) => addMonths(mo, 1))}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            title="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* RECAP MATRIX - rows = employees, columns = each active nature + totals */}
        {summaryLoading ? (
          <Spinner className="h-24" />
        ) : summary.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun salarié à afficher.</p>
        ) : (
          <>
            {activeNatures.length === 0 && (
              <p className="text-xs text-text-muted">
                Aucune nature active - seuls les totaux sont affichés. Configurez les natures pour détailler le récap.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2 text-left font-medium">Salarié</th>
                    {activeNatures.map((nat) => (
                      <th key={nat.id} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: nat.color ?? 'transparent' }} />
                          <span style={{ color: nat.color ?? undefined }}>{nat.libelle}</span>
                        </span>
                      </th>
                    ))}
                    {anyOthers && <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-text-muted">Autres</th>}
                    <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-text-secondary">Total H sup</th>
                    <th className="px-2 py-2 text-right font-medium">Récup</th>
                    <th className="px-2 py-2 text-right font-medium">En attente</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => {
                    const selected = s.userId === selectedUserId;
                    return (
                      <tr
                        key={s.userId}
                        onClick={() => setSelectedUserId(selected ? null : s.userId)}
                        className={`cursor-pointer border-t border-border ${selected ? 'bg-bg-active' : 'hover:bg-bg-tertiary'}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-text-primary">{s.userName}</td>
                        {activeNatures.map((nat) => {
                          const min = s.perNature?.[nat.id] ?? 0;
                          return (
                            <td key={nat.id} className="px-2 py-2 text-right">
                              {min > 0 ? (
                                <span className="font-mono text-text-primary">{minToHm(min)}</span>
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </td>
                          );
                        })}
                        {anyOthers && (
                          <td className="px-2 py-2 text-right">
                            {othersOf(s) > 0 ? (
                              <span className="font-mono text-text-muted">{minToHm(othersOf(s))}</span>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right font-mono font-medium text-text-primary">{minToHm(s.validatedMinutes)}</td>
                        <td className="px-2 py-2 text-right">
                          {s.recupMinutes > 0 ? (
                            <span className="font-mono text-text-secondary">{minToHm(s.recupMinutes)}</span>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-text-secondary">
                          {s.pendingCount > 0 ? `${s.pendingCount} · ${minToHm(s.pendingMinutes)}` : <span className="text-text-muted">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border text-[11px] uppercase tracking-wide">
                    <td className="px-3 py-2 font-semibold text-text-secondary">Totaux</td>
                    {activeNatures.map((nat) => (
                      <td key={nat.id} className="px-2 py-2 text-right font-mono text-text-primary">
                        {totals.perNature[nat.id] > 0 ? minToHm(totals.perNature[nat.id]) : <span className="text-text-muted">-</span>}
                      </td>
                    ))}
                    {anyOthers && (
                      <td className="px-2 py-2 text-right font-mono text-text-muted">
                        {totals.others > 0 ? minToHm(totals.others) : <span className="text-text-muted">-</span>}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right font-mono font-semibold text-text-primary">{minToHm(totals.validatedMinutes)}</td>
                    <td className="px-2 py-2 text-right font-mono text-text-secondary">
                      {totals.recupMinutes > 0 ? minToHm(totals.recupMinutes) : <span className="text-text-muted">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-text-secondary">
                      {totals.pendingCount > 0 ? `${totals.pendingCount} · ${minToHm(totals.pendingMinutes)}` : <span className="text-text-muted">-</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* Selected-employee management panel */}
        {selectedUserId != null && (
          <div className="rounded-md border border-border bg-bg-tertiary p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{selectedEntry?.userName ?? `#${selectedUserId}`}</p>
                <p className="text-xs text-text-muted">
                  <span className="capitalize">{monthLabel(month)}</span> - Total H sup{' '}
                  <span className="font-mono text-text-secondary">{minToHm(selectedEntry?.validatedMinutes ?? 0)}</span>
                  {(selectedEntry?.recupMinutes ?? 0) > 0 && (
                    <>
                      {' · '}Récup <span className="font-mono text-text-secondary">{minToHm(selectedEntry?.recupMinutes ?? 0)}</span>
                    </>
                  )}
                  {(selectedEntry?.pendingCount ?? 0) > 0 && (
                    <>
                      {' · '}En attente{' '}
                      <span className="font-mono text-status-pending">
                        {selectedEntry?.pendingCount} · {minToHm(selectedEntry?.pendingMinutes ?? 0)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedUserId(null)}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                title="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            {declsLoading ? (
              <Spinner className="h-24" />
            ) : periodDecls.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune déclaration pour ce salarié sur la période.</p>
            ) : (
              <div className="space-y-1">
                {periodDecls.map((d) => {
                  const n = natureById(d.natureId);
                  const st = STATUS_META[d.status];
                  if (editingId === d.id) {
                    return (
                      <InlineEditForm
                        key={d.id}
                        natures={natures}
                        initial={d}
                        title="Modifier la déclaration"
                        onSave={(data) => saveEdit(d.id, data)}
                        onCancel={() => setEditingId(null)}
                      />
                    );
                  }
                  const refusing = refusal?.id === d.id;
                  return (
                    <div key={d.id} className="rounded-md border border-border bg-bg-secondary">
                      <div className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: n?.color ?? 'transparent' }} />
                        <span className="whitespace-nowrap font-mono text-xs text-text-muted">{d.date}</span>
                        <span className="whitespace-nowrap text-text-secondary">{n?.libelle}</span>
                        <HoursBreakdown minutes={d.minutes} recupMinutes={d.recupMinutes} />
                        <span className="flex-1" />
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                        {!refusing && (
                          <>
                            {d.status === 'en_attente' && (
                              <>
                                <button onClick={() => decide(d.id, 'valide')} className="rounded p-1 text-status-up hover:bg-status-up/10" title="Valider">
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => setRefusal({ id: d.id, reason: '' })}
                                  className="rounded p-1 text-status-down hover:bg-status-down/10"
                                  title="Refuser"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            )}
                            <button onClick={() => setEditingId(d.id)} className="rounded p-1 text-text-muted hover:bg-bg-tertiary hover:text-text-primary" title="Modifier">
                              <Pencil size={15} />
                            </button>
                            {canValidate && (
                              <button
                                onClick={() => remove(d.id)}
                                className="rounded p-1 text-text-muted hover:bg-status-down/10 hover:text-status-down"
                                title="Supprimer"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {/* Motif = the "Notes/Reports" intervention description, shown in full. */}
                      {d.motif && (
                        <div className="border-t border-border px-3 py-1.5 text-xs text-text-secondary">
                          <span className="text-text-muted">Motif : </span>
                          {d.motif}
                        </div>
                      )}
                      {d.status === 'refuse' && d.decisionComment && (
                        <div className="border-t border-border px-3 py-2 text-xs text-status-down">
                          Motif de refus : {d.decisionComment}
                        </div>
                      )}
                      {refusing && (
                        <RefusalEditor
                          reason={refusal.reason}
                          onChange={(v) => setRefusal({ id: d.id, reason: v })}
                          onConfirm={() => decide(d.id, 'refuse', refusal.reason)}
                          onCancel={() => setRefusal(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Declare on behalf of this employee */}
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-xs text-text-muted">Déclarer pour ce salarié</p>
              <DeclarationForm
                natures={natures}
                defaultNatureId={natures[0]?.id ? String(natures[0].id) : ''}
                submitLabel="Déclarer"
                onSubmit={declareForEmployee}
              />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function OvertimeNaturesManager({ natures, onChanged }: { natures: OvertimeNature[]; onChanged: () => void }) {
  const [draft, setDraft] = useState({ libelle: '', color: '#1edd8a' });
  const [editing, setEditing] = useState<{ id: number; libelle: string; color: string; isActive: boolean } | null>(null);

  async function add() {
    if (!draft.libelle.trim()) {
      toast.error('Libellé requis');
      return;
    }
    try {
      await overtimeApi.createNature({ libelle: draft.libelle.trim(), color: draft.color });
      toast.success('Nature créée');
      setDraft({ libelle: '', color: '#1edd8a' });
      onChanged();
    } catch {
      toast.error('Échec de la création');
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.libelle.trim()) {
      toast.error('Libellé requis');
      return;
    }
    try {
      await overtimeApi.updateNature(editing.id, {
        libelle: editing.libelle.trim(),
        color: editing.color,
        isActive: editing.isActive,
      });
      toast.success('Nature modifiée');
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la modification'));
    }
  }

  async function remove(id: number) {
    try {
      await overtimeApi.removeNature(id);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Suppression impossible'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Natures d’heures sup (admin)</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="space-y-1">
          {natures.map((n) =>
            editing?.id === n.id ? (
              <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-bg-secondary px-3 py-2 text-sm">
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border border-border bg-bg-tertiary"
                />
                <Input className="flex-1" value={editing.libelle} onChange={(e) => setEditing({ ...editing, libelle: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
                  Actif
                </label>
                <Button onClick={saveEdit}>Enregistrer</Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Annuler
                </Button>
              </div>
            ) : (
              <div key={n.id} className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: n.color ?? 'transparent' }} />
                <span className="text-text-primary">{n.libelle}</span>
                {!n.isActive && <span className="text-xs text-text-muted">· inactif</span>}
                <button
                  onClick={() => setEditing({ id: n.id, libelle: n.libelle, color: n.color ?? '#1edd8a', isActive: n.isActive })}
                  className="ml-auto text-text-muted hover:text-text-primary"
                  title="Modifier"
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(n.id)} className="text-text-muted hover:text-status-down" title="Supprimer">
                  <X size={14} />
                </button>
              </div>
            ),
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
          <Input label="Libellé" className="sm:col-span-2" value={draft.libelle} onChange={(e) => setDraft({ ...draft, libelle: e.target.value })} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-secondary">Couleur</label>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              className="h-[38px] w-full cursor-pointer rounded-md border border-border bg-bg-tertiary"
            />
          </div>
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

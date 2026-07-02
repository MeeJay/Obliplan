import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  HourType,
  Client,
  ImportPreview,
  ImportApplyResult,
  ImportLabelMapping,
  ImportLabelAction,
  ImportMergeMode,
} from '@obliplan/shared';
import { planningApi, userApi, hourTypeApi, clientApi, type AssignableUser } from '../api';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';

const ACTIONS: { value: ImportLabelAction; label: string }[] = [
  { value: 'hourtype', label: "Type d'heure (travail)" },
  { value: 'pause', label: 'Pause déjeuner' },
  { value: 'repos', label: 'Repos' },
  { value: 'conge', label: 'Congé' },
  { value: 'absence', label: 'Absence' },
  { value: 'ecole', label: 'École' },
  { value: 'ignore', label: 'Ignorer' },
];

const CURRENT_YEAR = new Date().getFullYear();

const MODES: { value: ImportMergeMode; label: string; desc: string }[] = [
  { value: 'replace', label: 'Remplacer', desc: "Vide les journées touchées par l'import, puis les remplace (par défaut)." },
  { value: 'merge', label: 'Fusionner', desc: "Conserve l'existant mais rogne/découpe les créneaux qui chevauchent l'import (l'import gagne)." },
  { value: 'add', label: 'Ajouter', desc: 'Cumule les deux plannings sans rien supprimer ni fusionner (doublons exacts ignorés).' },
];

export function ImportPlanningPage() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ImportApplyResult | null>(null);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [mode, setMode] = useState<ImportMergeMode>('replace');
  const [empMap, setEmpMap] = useState<Record<string, number | null>>({});
  const [labelMap, setLabelMap] = useState<Record<string, ImportLabelMapping>>({});

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  // Per-label "clé à molette" toggle: reveals a client Select for the on-the-fly project.
  const [clientOpen, setClientOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    userApi.manageable().then(setUsers).catch(() => setUsers([]));
    hourTypeApi.list().then(setHourTypes).catch(() => setHourTypes([]));
    clientApi.list().then(setClients).catch(() => setClients([]));
  }, []);

  async function onFile(file: File) {
    setResult(null);
    setPreview(null);
    setLoading(true);
    try {
      // French Excel exports are windows-1252; decode explicitly so accents survive.
      const buf = await file.arrayBuffer();
      const text = new TextDecoder('windows-1252').decode(buf);
      setCsvText(text);
      const pv = await planningApi.importPreview(text);
      setPreview(pv);
      const em: Record<string, number | null> = {};
      pv.employees.forEach((e) => (em[e.csvName] = e.suggestedUserId));
      setEmpMap(em);
      const lm: Record<string, ImportLabelMapping> = {};
      pv.labels.forEach((l) => (lm[l.label] = { ...l.suggestion }));
      setLabelMap(lm);
    } catch (err) {
      // Surface the REAL cause instead of a generic message: a server 404 (backend
      // not redeployed), a 500 with its message, or a parse-level 400.
      console.error('[import] preview failed', err);
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const detail = e?.response?.data?.error || (e?.response?.status ? `HTTP ${e.response.status}` : e?.message) || '';
      toast.error(detail ? `Échec de l'analyse : ${detail}` : "Échec de l'analyse du fichier.");
      setCsvText(null);
    } finally {
      setLoading(false);
    }
  }

  async function doApply() {
    if (!csvText || !preview) return;
    setApplying(true);
    try {
      const res = await planningApi.importApply({ csvText, year, employeeMap: empMap, labelMap, statut: 'brouillon', mode });
      setResult(res);
      toast.success(`${res.createdShifts} créneaux créés en brouillon.`);
    } catch (err) {
      console.error('[import] apply failed', err);
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const detail = e?.response?.data?.error || (e?.response?.status ? `HTTP ${e.response.status}` : e?.message) || '';
      toast.error(detail ? `Échec de l'import : ${detail}` : "Échec de l'import.");
    } finally {
      setApplying(false);
    }
  }

  const mappedEmployees = preview ? preview.employees.filter((e) => empMap[e.csvName] != null).length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          <FileSpreadsheet size={20} className="text-accent" /> Importer un planning (CSV)
        </h2>
        <Link to="/planning-equipe" className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
          <ArrowLeft size={15} /> Retour au tableau
        </Link>
      </div>

      {/* Step 1 - upload */}
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-text-secondary">
            Déposez l'export CSV de votre tableau (format hebdomadaire, cases par créneau horaire). Rien n'est créé tant
            que vous n'avez pas validé l'étape suivante : l'import produit des <strong>brouillons</strong> à publier ensuite.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover">
            <Upload size={16} />
            {csvText ? 'Choisir un autre fichier' : 'Choisir un fichier CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </CardBody>
      </Card>

      {loading && <Spinner className="h-32" />}

      {preview && !loading && (
        <>
          {preview.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-status-pending/40 bg-status-pending/10 px-3 py-2 text-sm text-status-pending"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}

          {/* Detection summary + year */}
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-text-secondary">Détecté</span>
            </CardHeader>
            <CardBody className="flex flex-wrap items-end gap-4">
              <div className="text-sm text-text-secondary">
                <span className="font-mono text-lg font-semibold text-text-primary">{preview.weekLabels.length}</span> semaine(s) ·{' '}
                <span className="font-mono text-lg font-semibold text-text-primary">{preview.employees.length}</span> salarié(s) ·{' '}
                <span className="font-mono text-lg font-semibold text-text-primary">{preview.totalShifts}</span> créneaux
              </div>
              <div className="w-28">
                <Input
                  label="Année"
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-text-muted">
                Les dates du fichier (JJ/MM) n'ont pas d'année - {preview.weekLabels[0]}…
              </p>
            </CardBody>
          </Card>

          {/* Employee mapping */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Salariés</span>
              <span className="font-mono text-xs text-text-muted">
                {mappedEmployees}/{preview.employees.length} associés
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              {preview.employees.map((e) => (
                <div key={e.csvName} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-text-primary" title={e.csvName}>
                    {e.csvName} <span className="text-text-muted">({e.count})</span>
                  </span>
                  <Select
                    className="max-w-xs"
                    value={empMap[e.csvName] ?? ''}
                    onChange={(ev) =>
                      setEmpMap((m) => ({ ...m, [e.csvName]: ev.target.value ? Number(ev.target.value) : null }))
                    }
                  >
                    <option value="">- Ne pas importer -</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName || u.username}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Label mapping */}
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-text-secondary">Activités → types d'heures</span>
            </CardHeader>
            <CardBody className="space-y-2">
              <p className="text-xs text-text-muted">
                Ajoutez un <strong>projet</strong> à une activité travaillée pour rattacher ses créneaux : le projet est
                créé s'il n'existe pas, sinon réutilisé (par nom).
              </p>
              {preview.labels.map((l) => {
                const map = labelMap[l.label] ?? l.suggestion;
                const hasProject = (map.projectName ?? '').trim() !== '';
                const showClient = hasProject && (clientOpen[l.label] || map.clientId != null);
                return (
                  <div key={l.label} className="flex flex-wrap items-center gap-2">
                    <span className="w-44 shrink-0 truncate text-sm text-text-primary" title={l.label}>
                      {l.label} <span className="text-text-muted">({l.count})</span>
                    </span>
                    <Select
                      className="w-48"
                      value={map.action}
                      onChange={(ev) =>
                        setLabelMap((m) => ({
                          ...m,
                          [l.label]: { ...map, action: ev.target.value as ImportLabelAction, hourTypeId: map.hourTypeId },
                        }))
                      }
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                    {map.action === 'hourtype' && (
                      <>
                        <Select
                          className="w-56"
                          value={map.hourTypeId ?? ''}
                          onChange={(ev) =>
                            setLabelMap((m) => ({
                              ...m,
                              [l.label]: { ...map, action: 'hourtype', hourTypeId: ev.target.value ? Number(ev.target.value) : null },
                            }))
                          }
                        >
                          <option value="">➕ Créer « {l.label} »</option>
                          {hourTypes.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.libelle}
                            </option>
                          ))}
                        </Select>
                        <Input
                          className="w-48"
                          placeholder="Projet (optionnel)"
                          value={map.projectName ?? ''}
                          onChange={(ev) => {
                            const projectName = ev.target.value || null;
                            setLabelMap((m) => ({
                              ...m,
                              // Clearing the project name also drops the client (only meaningful with a project).
                              [l.label]: projectName
                                ? { ...map, projectName }
                                : { ...map, projectName: null, clientId: null },
                            }));
                          }}
                        />
                        {hasProject && (
                          <button
                            type="button"
                            onClick={() => setClientOpen((o) => ({ ...o, [l.label]: !o[l.label] }))}
                            aria-label="Rattacher le projet à un client"
                            title="Rattacher le projet à un client"
                            className={
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ' +
                              (showClient
                                ? 'border-accent text-accent'
                                : 'border-border text-text-muted hover:bg-bg-hover hover:text-text-primary')
                            }
                          >
                            <SlidersHorizontal size={15} />
                          </button>
                        )}
                        {showClient && (
                          <div className="flex w-full flex-col gap-1 pl-[11.5rem]">
                            <Select
                              className="w-56"
                              value={map.clientId ?? ''}
                              onChange={(ev) =>
                                setLabelMap((m) => ({
                                  ...m,
                                  [l.label]: { ...map, clientId: ev.target.value ? Number(ev.target.value) : null },
                                }))
                              }
                            >
                              <option value="">- Aucun client -</option>
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </Select>
                            <span className="text-xs text-text-muted">Le projet créé sera rattaché à ce client.</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Sample */}
          {preview.sample.length > 0 && (
            <Card>
              <CardHeader>
                <span className="text-sm font-medium text-text-secondary">Aperçu (semaine 1)</span>
              </CardHeader>
              <CardBody className="space-y-2">
                {preview.sample.map((s, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-text-primary">{s.employeeName}</span>
                    <span className="text-text-muted"> - {s.date} : </span>
                    <span className="font-mono text-xs text-text-secondary">
                      {s.shifts.map((sh) => `${sh.start}–${sh.end} ${sh.label}`).join(' · ')}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Import mode - how the import combines with the current planning */}
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-text-secondary">Mode d'import</span>
            </CardHeader>
            <CardBody className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={
                    'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors ' +
                    (mode === m.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-bg-tertiary hover:bg-bg-hover')
                  }
                >
                  <span className={'text-sm font-medium ' + (mode === m.value ? 'text-accent-hover' : 'text-text-primary')}>
                    {m.label}
                  </span>
                  <span className="text-xs text-text-muted">{m.desc}</span>
                </button>
              ))}
            </CardBody>
          </Card>

          {/* Apply */}
          {result ? (
            <Card>
              <CardBody className="space-y-2">
                <div className="flex items-center gap-2 text-status-up">
                  <CheckCircle2 size={18} />
                  <span className="font-medium">
                    {result.createdShifts} créneaux créés en brouillon
                    {result.createdHourTypes > 0 && ` · ${result.createdHourTypes} type(s) d'heure créé(s)`}
                    {result.createdBoards > 0 && ` · ${result.createdBoards} projet(s) créé(s)`}
                    {result.deletedShifts > 0 && ` · ${result.deletedShifts} supprimé(s)`}
                    {result.trimmedShifts > 0 && ` · ${result.trimmedShifts} ajusté(s)`}
                    {result.skipped > 0 && ` · ${result.skipped} ignoré(s)`}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  Va sur le <Link to="/planning-equipe" className="text-accent hover:underline">tableau de l'équipe</Link>{' '}
                  pour vérifier puis <strong>publier</strong> les créneaux importés.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <span className="text-xs text-text-muted">Les créneaux seront créés en brouillon.</span>
              <Button loading={applying} disabled={mappedEmployees === 0} onClick={() => void doApply()}>
                Importer {preview.totalShifts} créneaux
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

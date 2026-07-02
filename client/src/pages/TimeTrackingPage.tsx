import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Play, Square, Trash2, Timer, Pencil, X } from 'lucide-react';
import type { Board, Card, TimeEntry } from '@obliplan/shared';
import { boardApi, timeEntryApi } from '../api';
import { Card as UICard, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { minToHm, todayIso } from '../utils/format';
import { cn } from '../utils/cn';

/** Live minutes for a running entry = committed minutes + elapsed since startedAt. */
function runningMinutes(entry: TimeEntry, nowMs: number): number {
  if (!entry.startedAt) return entry.minutes;
  return entry.minutes + Math.max(0, Math.floor((nowMs - new Date(entry.startedAt).getTime()) / 60000));
}

export function TimeTrackingPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [cardsByBoard, setCardsByBoard] = useState<Record<number, Card[]>>({});
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Timer form (start)
  const [timer, setTimer] = useState({ boardId: '', cardId: '', note: '' });
  // Manual entry form (doubles as the edit form when editingId is set)
  const [manual, setManual] = useState({ boardId: '', cardId: '', hours: '', minutes: '', note: '', spentOn: todayIso() });
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(() => {
    // Decouple from the projets module: a failing board list must not break time tracking.
    Promise.all([boardApi.list().catch(() => [] as Board[]), timeEntryApi.list(), timeEntryApi.running()])
      .then(([b, e, r]) => {
        setBoards(b);
        setEntries(e);
        setRunning(r);
      })
      .catch(() => toast.error('Chargement du suivi du temps impossible'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Tick every 30s so the running timer label stays fresh.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [running]);

  // Lazily fetch a board's cards the first time it's referenced by a picker.
  const ensureCards = useCallback(
    (boardId: number) => {
      if (!boardId || cardsByBoard[boardId]) return;
      boardApi
        .get(boardId)
        .then((detail) => setCardsByBoard((m) => ({ ...m, [boardId]: detail.cards })))
        .catch(() => undefined);
    },
    [cardsByBoard],
  );

  useEffect(() => {
    if (timer.boardId) ensureCards(Number(timer.boardId));
  }, [timer.boardId, ensureCards]);
  useEffect(() => {
    if (manual.boardId) ensureCards(Number(manual.boardId));
  }, [manual.boardId, ensureCards]);

  const boardName = (id: number | null) => (id == null ? 'Aucun projet' : boards.find((b) => b.id === id)?.name ?? `#${id}`);
  const cardTitle = (boardId: number | null, cardId: number | null) =>
    cardId == null || boardId == null ? '-' : cardsByBoard[boardId]?.find((c) => c.id === cardId)?.title ?? `#${cardId}`;

  // Totals: per board + grand total over finished + running minutes.
  const totals = useMemo(() => {
    const perBoard = new Map<number | null, number>();
    let grand = 0;
    for (const e of entries) {
      const m = e.isRunning ? runningMinutes(e, now) : e.minutes;
      perBoard.set(e.boardId, (perBoard.get(e.boardId) ?? 0) + m);
      grand += m;
    }
    return { perBoard, grand };
  }, [entries, now]);

  async function startTimer() {
    try {
      await timeEntryApi.start({
        boardId: timer.boardId ? Number(timer.boardId) : null,
        cardId: timer.cardId ? Number(timer.cardId) : null,
        note: timer.note || null,
      });
      toast.success('Minuteur démarré');
      setTimer((f) => ({ ...f, note: '' }));
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Échec du démarrage');
    }
  }

  async function stopTimer() {
    if (!running) return;
    try {
      await timeEntryApi.stop(running.id);
      toast.success('Minuteur arrêté');
      load();
    } catch {
      toast.error("Échec de l'arrêt");
    }
  }

  function startEdit(e: TimeEntry) {
    setEditingId(e.id);
    setManual({
      boardId: e.boardId != null ? String(e.boardId) : '',
      cardId: e.cardId != null ? String(e.cardId) : '',
      hours: String(Math.floor(e.minutes / 60)),
      minutes: String(e.minutes % 60),
      note: e.note ?? '',
      spentOn: e.spentOn ?? todayIso(),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setManual({ boardId: '', cardId: '', hours: '', minutes: '', note: '', spentOn: todayIso() });
  }

  async function saveManual() {
    const minutes = (Number(manual.hours) || 0) * 60 + (Number(manual.minutes) || 0);
    if (minutes <= 0) {
      toast.error('Durée invalide');
      return;
    }
    const payload = {
      boardId: manual.boardId ? Number(manual.boardId) : null,
      cardId: manual.cardId ? Number(manual.cardId) : null,
      minutes,
      note: manual.note || null,
      spentOn: manual.spentOn || null,
    };
    try {
      if (editingId != null) {
        await timeEntryApi.update(editingId, payload);
        toast.success('Temps mis à jour');
      } else {
        await timeEntryApi.create(payload);
        toast.success('Temps enregistré');
      }
      setEditingId(null);
      setManual((f) => ({ ...f, cardId: '', hours: '', minutes: '', note: '' }));
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Échec de l'enregistrement");
    }
  }

  async function remove(id: number) {
    try {
      await timeEntryApi.remove(id);
      if (editingId === id) cancelEdit();
      load();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Suivi du temps</h2>
        <div className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm">
          <span className="text-text-muted">Total : </span>
          <span className="font-mono font-semibold text-text-primary">{minToHm(totals.grand)}</span>
        </div>
      </div>

      {/* Running timer */}
      <UICard>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Timer size={15} /> Minuteur
          </span>
        </CardHeader>
        <CardBody>
          {running ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text-primary">
                  {boardName(running.boardId)}
                  {running.cardId != null && (
                    <span className="text-text-muted"> · {cardTitle(running.boardId, running.cardId)}</span>
                  )}
                </div>
                {running.note && <div className="truncate text-xs text-text-muted">{running.note}</div>}
              </div>
              <span className="font-mono text-lg font-semibold text-accent-hover">{minToHm(runningMinutes(running, now))}</span>
              <Button variant="secondary" className="gap-1.5" onClick={stopTimer}>
                <Square size={14} /> Arrêter
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Select
                label="Projet"
                value={timer.boardId}
                onChange={(e) => setTimer({ ...timer, boardId: e.target.value, cardId: '' })}
              >
                <option value="">Aucun projet</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select label="Tâche (optionnel)" value={timer.cardId} onChange={(e) => setTimer({ ...timer, cardId: e.target.value })}>
                <option value="">Aucune</option>
                {(cardsByBoard[Number(timer.boardId)] ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
              <Input label="Note (optionnel)" value={timer.note} onChange={(e) => setTimer({ ...timer, note: e.target.value })} />
              <div className="flex items-end">
                <Button className="w-full gap-1.5" onClick={startTimer}>
                  <Play size={14} /> Démarrer
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </UICard>

      {/* Manual entry (also the edit form when editingId is set) */}
      <UICard>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">{editingId != null ? "Modifier l'entrée" : 'Saisie manuelle'}</span>
          {editingId != null && (
            <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary" title="Annuler la modification">
              <X size={13} /> Annuler
            </button>
          )}
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Select
            label="Projet"
            className="col-span-2"
            value={manual.boardId}
            onChange={(e) => setManual({ ...manual, boardId: e.target.value, cardId: '' })}
          >
            <option value="">Aucun projet</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select
            label="Tâche (optionnel)"
            className="col-span-2"
            value={manual.cardId}
            onChange={(e) => setManual({ ...manual, cardId: e.target.value })}
          >
            <option value="">Aucune</option>
            {(cardsByBoard[Number(manual.boardId)] ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <Input label="Heures" type="number" min={0} value={manual.hours} onChange={(e) => setManual({ ...manual, hours: e.target.value })} />
          <Input label="Minutes" type="number" min={0} max={59} value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: e.target.value })} />
          <Input label="Date" type="date" value={manual.spentOn} onChange={(e) => setManual({ ...manual, spentOn: e.target.value })} />
          <Input
            label="Note (optionnel)"
            className="col-span-2 sm:col-span-3"
            value={manual.note}
            onChange={(e) => setManual({ ...manual, note: e.target.value })}
          />
          <div className="col-span-2 flex items-end">
            <Button className="w-full" onClick={saveManual}>
              {editingId != null ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </div>
        </CardBody>
      </UICard>

      {/* Totals per board */}
      {totals.perBoard.size > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...totals.perBoard.entries()].map(([boardId, min]) => (
            <div key={boardId} className="rounded-md border border-border bg-bg-tertiary px-3 py-2">
              <div className="truncate text-xs text-text-muted">{boardName(boardId)}</div>
              <div className="font-mono text-lg font-semibold text-text-primary">{minToHm(min)}</div>
            </div>
          ))}
        </div>
      )}

      {/* My entries */}
      <UICard>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Mes entrées</span>
        </CardHeader>
        <CardBody>
          {entries.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune entrée.</p>
          ) : (
            <div className="space-y-1">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md border bg-bg-secondary px-3 py-2 text-sm',
                    editingId === e.id ? 'border-accent/50' : 'border-border',
                  )}
                >
                  {e.isRunning && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" title="En cours" />}
                  <span className="font-mono text-xs text-text-muted">{e.spentOn ?? '-'}</span>
                  <span className="text-text-primary">{boardName(e.boardId)}</span>
                  {e.cardId != null && <span className="text-text-secondary">· {cardTitle(e.boardId, e.cardId)}</span>}
                  <span className="flex-1 truncate text-text-muted">{e.note}</span>
                  <span className="font-mono font-semibold text-text-primary">
                    {minToHm(e.isRunning ? runningMinutes(e, now) : e.minutes)}
                  </span>
                  {!e.isRunning && (
                    <button onClick={() => startEdit(e)} className="text-text-muted hover:text-accent" title="Modifier">
                      <Pencil size={14} />
                    </button>
                  )}
                  <button onClick={() => remove(e.id)} className="text-text-muted hover:text-status-down" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </UICard>
    </div>
  );
}

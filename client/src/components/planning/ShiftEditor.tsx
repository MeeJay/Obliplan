import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SlidersHorizontal } from 'lucide-react';
import type { Shift, ShiftType, ShiftStatus, HourType, Board, ShiftTemplate, Client } from '@obliplan/shared';
import { shiftApi, hourTypeApi, boardApi, shiftTemplateApi, clientApi } from '../../api';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { SHIFT_TYPES, SHIFT_META, TIMED_SHIFT_TYPES } from './shiftMeta';

interface ShiftEditorProps {
  userId: number;
  date: string;
  shift?: Shift | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ShiftEditor({ userId, date, shift, onClose, onSaved }: ShiftEditorProps) {
  const [type, setType] = useState<ShiftType>(shift?.type ?? 'travail');
  const [heureDebut, setHeureDebut] = useState(shift?.heureDebut ?? '09:00');
  const [heureFin, setHeureFin] = useState(shift?.heureFin ?? '17:00');
  const [pauseMin, setPauseMin] = useState(shift?.pauseMin ?? 60);
  const [statut, setStatut] = useState<ShiftStatus>(shift?.statut ?? 'valide');
  const [note, setNote] = useState(shift?.note ?? '');
  const [hourTypeId, setHourTypeId] = useState<number | null>(shift?.hourTypeId ?? null);
  const [boardId, setBoardId] = useState<number | null>(shift?.boardId ?? null);
  // Half-day period for full-day absence blocks (congé/absence/récup): full / am / pm.
  const [dayPeriod, setDayPeriod] = useState<'full' | 'am' | 'pm'>(shift?.dayPeriod ?? 'full');
  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  // "Occurrence en parallèle": when on, this timed shift is layered ON TOP of any overlapping
  // shift instead of carving it (two activities at once). Off = default carve behaviour.
  const [parallel, setParallel] = useState(false);
  // Inline "+ Nouveau projet" - create a board on the fly and select it. The "clé à molette"
  // (wrench) reveals an optional client to rattacher the new project; name-only stays the default.
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showBoardClient, setShowBoardClient] = useState(false);
  const [newBoardClientId, setNewBoardClientId] = useState<number | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);

  const isWork = TIMED_SHIFT_TYPES.includes(type);
  // Types where a half-day (matin/après-midi) makes sense.
  const canHalfDay = (['conge', 'absence', 'recup'] as ShiftType[]).includes(type);

  useEffect(() => {
    hourTypeApi.list().then(setHourTypes).catch(() => setHourTypes([]));
    boardApi.list().then(setBoards).catch(() => setBoards([]));
    clientApi.list().then(setClients).catch(() => setClients([]));
    shiftTemplateApi.list().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  function applyTemplate(id: string) {
    const t = templates.find((tpl) => tpl.id === Number(id));
    if (!t) return;
    setType(t.type);
    setHeureDebut(t.heureDebut);
    setHeureFin(t.heureFin);
    setPauseMin(t.pauseMin);
    setHourTypeId(t.hourTypeId);
    setBoardId(t.boardId);
  }

  async function createBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    setSavingBoard(true);
    try {
      const board = await boardApi.create({ name, clientId: newBoardClientId });
      setBoards((prev) => [...prev, board]);
      setBoardId(board.id);
      setNewBoardName('');
      setNewBoardClientId(null);
      setShowBoardClient(false);
      setCreatingBoard(false);
      toast.success('Projet créé');
    } catch {
      toast.error('Échec de la création du projet');
    } finally {
      setSavingBoard(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Partial<Shift> & { carve?: boolean } = {
        userId,
        date,
        type,
        statut,
        pauseMin: isWork ? pauseMin : 0,
        heureDebut: isWork ? heureDebut : null,
        heureFin: isWork ? heureFin : null,
        hourTypeId: isWork ? hourTypeId : null,
        boardId: isWork ? boardId : null,
        note: note || null,
        dayPeriod: canHalfDay ? dayPeriod : 'full',
        // A timed shift carves overlaps by default; parallel mode keeps them side by side.
        carve: isWork ? !parallel : false,
      };
      if (shift) await shiftApi.update(shift.id, payload);
      else await shiftApi.create(payload);
      toast.success('Shift enregistré');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!shift) return;
    setSaving(true);
    try {
      await shiftApi.remove(shift.id);
      toast.success('Shift supprimé');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de la suppression');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-text-primary">
          {shift ? 'Modifier' : 'Nouveau'} shift - {date}
        </h3>
        <div className="space-y-3">
          {templates.length > 0 && (
            <Select label="Modèle (pré-remplit le créneau)" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">- Choisir un modèle -</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.heureDebut}–{t.heureFin})
                </option>
              ))}
            </Select>
          )}
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ShiftType)}>
            {SHIFT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SHIFT_META[t].label}
              </option>
            ))}
          </Select>
          {canHalfDay && (
            <Select
              label="Période"
              value={dayPeriod}
              onChange={(e) => setDayPeriod(e.target.value as 'full' | 'am' | 'pm')}
            >
              <option value="full">Journée entière</option>
              <option value="am">Matin (½ journée)</option>
              <option value="pm">Après-midi (½ journée)</option>
            </Select>
          )}
          {isWork && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Début" type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
                <Input label="Fin" type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
                <Input
                  label="Pause (min)"
                  type="number"
                  value={pauseMin}
                  onChange={(e) => setPauseMin(Number(e.target.value))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Type d'heure"
                  value={hourTypeId ?? ''}
                  onChange={(e) => setHourTypeId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">-</option>
                  {hourTypes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.libelle}
                    </option>
                  ))}
                </Select>
                <div>
                  <Select
                    label="Projet"
                    value={boardId ?? ''}
                    onChange={(e) => setBoardId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">-</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  {creatingBoard ? (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="flex items-end gap-1.5">
                        <Input
                          label="Nouveau projet"
                          value={newBoardName}
                          autoFocus
                          placeholder="Nom du projet"
                          onChange={(e) => setNewBoardName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void createBoard();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant={showBoardClient ? 'primary' : 'secondary'}
                          size="sm"
                          className="px-2"
                          title="Rattacher à un client"
                          aria-label="Rattacher à un client"
                          onClick={() => setShowBoardClient((v) => !v)}
                        >
                          <SlidersHorizontal size={15} />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void createBoard()}
                          loading={savingBoard}
                          disabled={!newBoardName.trim()}
                        >
                          Créer
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCreatingBoard(false);
                            setNewBoardName('');
                            setShowBoardClient(false);
                            setNewBoardClientId(null);
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                      {showBoardClient && (
                        <Select
                          label="Client"
                          value={newBoardClientId ?? ''}
                          onChange={(e) => setNewBoardClientId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">- Aucun client -</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreatingBoard(true)}
                      className="mt-1 text-xs text-accent hover:underline"
                    >
                      + Nouveau projet
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
          {isWork && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={parallel}
                onChange={(e) => setParallel(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-text-primary">Occurrence en parallèle</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Superpose ce créneau à ceux déjà présents au lieu de les découper (deux activités en même temps).
                </span>
              </span>
            </label>
          )}
          <Select label="Statut" value={statut} onChange={(e) => setStatut(e.target.value as ShiftStatus)}>
            <option value="brouillon">Brouillon</option>
            <option value="valide">Validé</option>
          </Select>
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-5 flex justify-between">
          {shift ? (
            <Button variant="danger" onClick={remove} loading={saving}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={save} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

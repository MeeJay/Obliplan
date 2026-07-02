import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Trash2 } from 'lucide-react';
import type { Shift, ShiftType, ShiftStatus, HourType, Board } from '@obliplan/shared';
import { shiftApi, hourTypeApi, boardApi } from '../../api';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { dayLabel } from '../../utils/format';
import { SHIFT_TYPES, SHIFT_META, TIMED_SHIFT_TYPES } from './shiftMeta';
import { cn } from '../../utils/cn';

interface ShiftQuickEditorProps {
  shift: Shift;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Compact popover to set a shift's activity from the hourly grid: type, hour-type
 * (Front/Back/Réunion… colour palette), project, exact times, status and note.
 * Reuses the ShiftEditor look but trimmed for the draw-then-tag flow. NOT window.*.
 */
export function ShiftQuickEditor({ shift, onClose, onSaved }: ShiftQuickEditorProps) {
  const [type, setType] = useState<ShiftType>(shift.type);
  const [heureDebut, setHeureDebut] = useState(shift.heureDebut ?? '09:00');
  const [heureFin, setHeureFin] = useState(shift.heureFin ?? '17:00');
  const [statut, setStatut] = useState<ShiftStatus>(shift.statut);
  const [note, setNote] = useState(shift.note ?? '');
  const [hourTypeId, setHourTypeId] = useState<number | null>(shift.hourTypeId);
  const [boardId, setBoardId] = useState<number | null>(shift.boardId);
  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [saving, setSaving] = useState(false);

  const isWork = TIMED_SHIFT_TYPES.includes(type);

  useEffect(() => {
    hourTypeApi.list().then(setHourTypes).catch(() => setHourTypes([]));
    boardApi.list().then(setBoards).catch(() => setBoards([]));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await shiftApi.update(shift.id, {
        type,
        statut,
        heureDebut: isWork ? heureDebut : null,
        heureFin: isWork ? heureFin : null,
        hourTypeId: isWork ? hourTypeId : null,
        boardId: isWork ? boardId : null,
        note: note || null,
      });
      toast.success('Créneau enregistré');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await shiftApi.remove(shift.id);
      toast.success('Créneau supprimé');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de la suppression');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg-secondary p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Créneau - {dayLabel(shift.date)}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary" title="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ShiftType)}>
            {SHIFT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SHIFT_META[t].label}
              </option>
            ))}
          </Select>

          {isWork && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Début" type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
                <Input label="Fin" type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
              </div>

              <div className="space-y-1">
                <span className="block text-sm font-medium text-text-secondary">Type d'heure</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHourTypeId(null)}
                    className={cn(
                      'rounded border px-2 py-1 text-xs transition-colors',
                      hourTypeId == null
                        ? 'border-accent bg-accent/10 text-text-primary'
                        : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary',
                    )}
                  >
                    Aucun
                  </button>
                  {hourTypes.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHourTypeId(h.id)}
                      title={h.libelle}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors',
                        hourTypeId === h.id
                          ? 'border-accent bg-accent/10 text-text-primary'
                          : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: h.color ?? 'rgb(var(--c-text-muted))' }}
                      />
                      <span className="max-w-[8rem] truncate">{h.libelle}</span>
                    </button>
                  ))}
                </div>
              </div>

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
            </>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Select label="Statut" value={statut} onChange={(e) => setStatut(e.target.value as ShiftStatus)}>
              <option value="brouillon">Brouillon</option>
              <option value="valide">Validé</option>
            </Select>
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="danger" size="sm" onClick={remove} loading={saving}>
            <Trash2 size={14} className="mr-1" /> Supprimer
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

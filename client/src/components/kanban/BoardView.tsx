import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Calendar, Pencil, Trash2, Ban, ListTree, Check } from 'lucide-react';
import type { BoardDetail, Card, BoardColumn, Sprint, SprintStatus } from '@obliplan/shared';
import { boardApi, type AssignableUser } from '../../api';
import { UserAvatar } from '../common/UserAvatar';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { CardEditor } from './CardEditor';
import { PRIORITY_META, PRIORITY_DOT, isOverdue } from './cardMeta';
import { cn } from '../../utils/cn';

type SprintFilter = 'all' | 'backlog' | number;

interface EditorState {
  columnId: number;
  card?: Card | null;
}

/** Where the dragged card would drop: before/after a card, or at the end of a column. */
interface DragOver {
  columnId: number;
  cardId: number | null;
  after: boolean;
}

const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: 'Planifié',
  active: 'En cours',
  done: 'Terminé',
};

interface BoardViewProps {
  board: BoardDetail;
  onChanged: () => void;
  assignees: AssignableUser[];
  /** Client-side assignee filter; null = everyone. */
  assigneeFilter: number | null;
}

export function BoardView({ board, onChanged, assignees, assigneeFilter }: BoardViewProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  const [sprintFilter, setSprintFilter] = useState<SprintFilter>('all');
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [newColumn, setNewColumn] = useState('');
  const [newSprint, setNewSprint] = useState('');

  // Per-column settings panel state.
  const [colSettingsId, setColSettingsId] = useState<number | null>(null);
  const [colName, setColName] = useState('');
  const [colWip, setColWip] = useState('');
  const [colConfirmDelete, setColConfirmDelete] = useState(false);

  const assigneeById = useMemo(() => new Map(assignees.map((u) => [u.id, u])), [assignees]);

  // Cards that are the TARGET of a 'blocks' link are flagged "Bloqué" on the board.
  const blockedCardIds = useMemo(
    () => new Set(board.links.filter((l) => l.type === 'blocks').map((l) => l.targetCardId)),
    [board.links],
  );
  // Child counts per parent card → subtask badge.
  const subtaskCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of board.cards) {
      if (c.parentCardId != null) m.set(c.parentCardId, (m.get(c.parentCardId) ?? 0) + 1);
    }
    return m;
  }, [board.cards]);

  const visibleCards = board.cards.filter((c) => {
    if (assigneeFilter !== null && c.assigneeId !== assigneeFilter) return false;
    if (sprintFilter === 'all') return true;
    if (sprintFilter === 'backlog') return c.sprintId === null;
    return c.sprintId === sprintFilter;
  });

  const selectedSprint = typeof sprintFilter === 'number' ? board.sprints.find((s) => s.id === sprintFilter) ?? null : null;

  function markDragOver(next: DragOver) {
    setDragOver((cur) =>
      cur && cur.columnId === next.columnId && cur.cardId === next.cardId && cur.after === next.after ? cur : next,
    );
  }

  /**
   * Persist a drag: insert the dragged card at the resolved index of the target column,
   * re-sequencing positions in the destination (and the source, on a cross-column move).
   */
  async function reorder(target: DragOver) {
    const dragged = dragId != null ? board.cards.find((c) => c.id === dragId) : null;
    setDragId(null);
    setDragOver(null);
    if (!dragged) return;

    const destCards = board.cards
      .filter((c) => c.columnId === target.columnId && c.id !== dragged.id)
      .sort((a, b) => a.position - b.position);

    let index = destCards.length;
    if (target.cardId != null) {
      const i = destCards.findIndex((c) => c.id === target.cardId);
      if (i >= 0) index = target.after ? i + 1 : i;
    }

    const ordered = [...destCards.slice(0, index), dragged, ...destCards.slice(index)];

    const updates: Promise<unknown>[] = [];
    ordered.forEach((c, i) => {
      if (c.id === dragged.id) {
        if (c.columnId !== target.columnId || c.position !== i) {
          updates.push(boardApi.updateCard(c.id, { columnId: target.columnId, position: i }));
        }
      } else if (c.position !== i) {
        updates.push(boardApi.updateCard(c.id, { position: i }));
      }
    });

    if (dragged.columnId !== target.columnId) {
      board.cards
        .filter((c) => c.columnId === dragged.columnId && c.id !== dragged.id)
        .sort((a, b) => a.position - b.position)
        .forEach((c, i) => {
          if (c.position !== i) updates.push(boardApi.updateCard(c.id, { position: i }));
        });
    }

    if (updates.length === 0) return;
    try {
      await Promise.all(updates);
      onChanged();
    } catch {
      toast.error('Déplacement impossible');
    }
  }

  async function addColumn() {
    if (!newColumn.trim()) return;
    await boardApi.addColumn(board.id, { name: newColumn.trim() });
    setNewColumn('');
    onChanged();
  }

  async function addSprint() {
    if (!newSprint.trim()) return;
    await boardApi.addSprint(board.id, { name: newSprint.trim() });
    setNewSprint('');
    onChanged();
  }

  function openColSettings(col: BoardColumn) {
    if (colSettingsId === col.id) {
      setColSettingsId(null);
      return;
    }
    setColSettingsId(col.id);
    setColName(col.name);
    setColWip(col.wipLimit != null ? String(col.wipLimit) : '');
    setColConfirmDelete(false);
  }

  async function renameColumn(col: BoardColumn) {
    const name = colName.trim();
    if (!name || name === col.name) return;
    try {
      await boardApi.updateColumn(col.id, { name });
      onChanged();
    } catch {
      toast.error('Renommage impossible');
    }
  }

  async function setColumnWip(col: BoardColumn) {
    const trimmed = colWip.trim();
    const wipLimit = trimmed === '' ? null : Number(trimmed);
    if (wipLimit != null && (!Number.isInteger(wipLimit) || wipLimit < 0)) {
      toast.error('Limite invalide');
      return;
    }
    if (wipLimit === col.wipLimit) return;
    try {
      await boardApi.updateColumn(col.id, { wipLimit });
      onChanged();
    } catch {
      toast.error('Mise à jour impossible');
    }
  }

  async function toggleColumnDone(col: BoardColumn) {
    try {
      await boardApi.updateColumn(col.id, { isDone: !col.isDone });
      onChanged();
    } catch {
      toast.error('Mise à jour impossible');
    }
  }

  async function removeColumn(col: BoardColumn) {
    try {
      await boardApi.removeColumn(col.id);
      setColSettingsId(null);
      onChanged();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  return (
    <div className="space-y-3">
      {/* Sprint filter + management + creation */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Sprint :</span>
        <select
          value={String(sprintFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setSprintFilter(v === 'all' || v === 'backlog' ? v : Number(v));
          }}
          className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
        >
          <option value="all">Tous</option>
          <option value="backlog">Backlog</option>
          {board.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({SPRINT_STATUS_LABEL[s.status]})
            </option>
          ))}
        </select>
        {selectedSprint && (
          <button
            onClick={() => setEditingSprint(selectedSprint)}
            title="Gérer le sprint"
            className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-muted hover:text-accent"
          >
            <Pencil size={14} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <input
            value={newSprint}
            onChange={(e) => setNewSprint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSprint()}
            placeholder="Nouveau sprint"
            className="w-36 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {board.columns.map((col) => {
          const cards = visibleCards
            .filter((c) => c.columnId === col.id)
            .sort((a, b) => a.position - b.position);
          const overLimit = col.wipLimit != null && cards.length > col.wipLimit;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId != null) markDragOver({ columnId: col.id, cardId: null, after: false });
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorder({ columnId: col.id, cardId: null, after: false });
              }}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-bg-secondary"
            >
              <div className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {col.name}{' '}
                      <span className={cn('text-xs', overLimit ? 'text-status-down' : 'text-text-muted')}>
                        {cards.length}
                        {col.wipLimit != null ? `/${col.wipLimit}` : ''}
                      </span>
                    </span>
                    {col.isDone && (
                      <span
                        title="Colonne terminée"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded bg-status-up/15 px-1 py-0.5 text-[10px] font-medium text-status-up"
                      >
                        <Check size={10} /> terminé
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openColSettings(col)}
                      title="Paramètres de la colonne"
                      className={cn('text-text-muted hover:text-accent', colSettingsId === col.id && 'text-accent')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setEditor({ columnId: col.id })}
                      title="Nouvelle carte"
                      className="text-text-muted hover:text-accent"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {colSettingsId === col.id && (
                  <div className="mt-2 space-y-2 rounded-md border border-border bg-bg-tertiary p-2">
                    <input
                      value={colName}
                      onChange={(e) => setColName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && renameColumn(col)}
                      onBlur={() => renameColumn(col)}
                      placeholder="Nom de la colonne"
                      className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-text-muted">Limite WIP</label>
                      <input
                        type="number"
                        min={0}
                        value={colWip}
                        onChange={(e) => setColWip(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && setColumnWip(col)}
                        onBlur={() => setColumnWip(col)}
                        placeholder="-"
                        className="w-20 rounded-md border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={col.isDone}
                        onChange={() => toggleColumnDone(col)}
                        className="h-3.5 w-3.5 accent-accent"
                      />
                      Colonne terminée
                      <span className="text-text-muted">(cartes = complétées)</span>
                    </label>
                    {colConfirmDelete ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-secondary">Supprimer cette colonne ?</span>
                        <button
                          onClick={() => removeColumn(col)}
                          className="rounded bg-status-down px-2 py-0.5 font-medium text-white hover:bg-red-700"
                        >
                          Confirmer
                        </button>
                        <button onClick={() => setColConfirmDelete(false)} className="text-text-muted hover:text-text-primary">
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setColConfirmDelete(true)}
                        className="flex items-center gap-1 text-xs text-status-down hover:underline"
                      >
                        <Trash2 size={12} /> Supprimer la colonne
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {cards.map((card) => {
                  const prio = card.priority ? PRIORITY_META[card.priority] : null;
                  const assignee = card.assigneeId != null ? assigneeById.get(card.assigneeId) : undefined;
                  const overdue = isOverdue(card.dueDate);
                  const blocked = blockedCardIds.has(card.id);
                  const subN = subtaskCount.get(card.id) ?? 0;
                  const dndCls =
                    dragOver && dragOver.cardId === card.id
                      ? dragOver.after
                        ? 'border-b-2 border-b-accent'
                        : 'border-t-2 border-t-accent'
                      : '';
                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragId == null || dragId === card.id) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY - rect.top > rect.height / 2;
                        markDragOver({ columnId: col.id, cardId: card.id, after });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragId === card.id) {
                          setDragId(null);
                          setDragOver(null);
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY - rect.top > rect.height / 2;
                        reorder({ columnId: col.id, cardId: card.id, after });
                      }}
                      onClick={() => setEditor({ columnId: col.id, card })}
                      className={cn(
                        'cursor-pointer rounded-md border border-border bg-bg-tertiary p-2 text-sm hover:border-accent/50',
                        col.isDone && 'opacity-70',
                        dndCls,
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        {card.priority && (
                          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])} />
                        )}
                        <div className={cn('flex-1 text-text-primary', col.isDone && 'text-text-muted line-through')}>
                          {card.title}
                        </div>
                        {assignee && (
                          <UserAvatar username={assignee.displayName || assignee.username} size={20} className="mt-0.5" />
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {blocked && (
                          <span className="flex items-center gap-1 rounded border border-status-down/40 bg-status-down/15 px-1.5 py-0.5 font-medium text-status-down">
                            <Ban size={11} /> Bloqué
                          </span>
                        )}
                        {subN > 0 && (
                          <span className="flex items-center gap-1 rounded bg-bg-active px-1.5 py-0.5 text-text-muted">
                            <ListTree size={11} /> {subN}
                          </span>
                        )}
                        {prio && (
                          <span className={cn('rounded border px-1.5 py-0.5', prio.cls)}>{prio.label}</span>
                        )}
                        {card.points != null && (
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">{card.points} pts</span>
                        )}
                        {card.dueDate && (
                          <span
                            className={cn(
                              'flex items-center gap-1',
                              overdue ? 'font-medium text-status-down' : 'text-text-muted',
                            )}
                          >
                            <Calendar size={11} /> {card.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {dragOver && dragOver.columnId === col.id && dragOver.cardId === null && (
                  <div className="h-0.5 rounded-full bg-accent" />
                )}
              </div>
            </div>
          );
        })}

        {/* Add column */}
        <div className="flex w-56 shrink-0 flex-col gap-2 rounded-lg border border-dashed border-border p-2">
          <input
            value={newColumn}
            onChange={(e) => setNewColumn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            placeholder="Nouvelle colonne"
            className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>
      </div>

      {editor && (
        <CardEditor
          key={editor.card?.id ?? 'new'}
          boardId={board.id}
          columns={board.columns}
          sprints={board.sprints}
          assignees={assignees}
          board={board}
          card={editor.card}
          defaultColumnId={editor.columnId}
          onOpenCard={(c) => setEditor({ columnId: c.columnId, card: c })}
          onClose={() => setEditor(null)}
          onSaved={onChanged}
        />
      )}

      {editingSprint && (
        <SprintEditor sprint={editingSprint} onClose={() => setEditingSprint(null)} onSaved={onChanged} />
      )}
    </div>
  );
}

interface SprintEditorProps {
  sprint: Sprint;
  onClose: () => void;
  onSaved: () => void;
}

function SprintEditor({ sprint, onClose, onSaved }: SprintEditorProps) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? '');
  const [startDate, setStartDate] = useState(sprint.startDate ?? '');
  const [endDate, setEndDate] = useState(sprint.endDate ?? '');
  const [status, setStatus] = useState<SprintStatus>(sprint.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(patch?: Partial<Sprint>) {
    if (!patch && !name.trim()) {
      toast.error('Nom requis');
      return;
    }
    setSaving(true);
    try {
      await boardApi.updateSprint(
        sprint.id,
        patch ?? {
          name: name.trim(),
          goal: goal.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          status,
        },
      );
      toast.success('Sprint enregistré');
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
      await boardApi.removeSprint(sprint.id);
      toast.success('Sprint supprimé');
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
        <h3 className="mb-4 text-lg font-semibold text-text-primary">Gérer le sprint</h3>
        <div className="space-y-3">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Objectif</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Fin" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Select label="Statut" value={status} onChange={(e) => setStatus(e.target.value as SprintStatus)}>
            <option value="planned">{SPRINT_STATUS_LABEL.planned}</option>
            <option value="active">{SPRINT_STATUS_LABEL.active}</option>
            <option value="done">{SPRINT_STATUS_LABEL.done}</option>
          </Select>
          {/* Quick lifecycle transitions */}
          <div className="flex flex-wrap gap-2">
            {sprint.status !== 'active' && (
              <Button size="sm" variant="secondary" onClick={() => save({ status: 'active' })} loading={saving}>
                Démarrer
              </Button>
            )}
            {sprint.status !== 'done' && (
              <Button size="sm" variant="secondary" onClick={() => save({ status: 'done' })} loading={saving}>
                Terminer
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Supprimer ?</span>
              <Button variant="danger" size="sm" onClick={remove} loading={saving}>
                Confirmer
              </Button>
              <button onClick={() => setConfirmDelete(false)} className="text-text-muted hover:text-text-primary">
                Annuler
              </button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => save()} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Plus, Star, Check, Sun, CalendarDays, Bell, Trash2, ListChecks } from 'lucide-react';
import type { Task, TaskStep, User } from '@obliplan/shared';
import { taskApi } from '../../api';
import { cn } from '../../utils/cn';
import { todayIso } from '../../utils/format';

interface TaskDetailPaneProps {
  task: Task;
  members: User[];
  isShared: boolean;
  onChanged: () => void;
  onClose: () => void;
}

/** datetime-local <-> ISO helpers (reminder_at is a timestamptz). */
const toLocalInput = (iso: string | null): string => (iso ? iso.slice(0, 16) : '');
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export function TaskDetailPane({ task, members, isShared, onChanged, onClose }: TaskDetailPaneProps) {
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [stepDraft, setStepDraft] = useState('');
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? '');

  const loadSteps = useCallback(() => {
    taskApi.steps(task.id).then(setSteps);
  }, [task.id]);

  useEffect(() => {
    setTitle(task.title);
    setNote(task.note ?? '');
    loadSteps();
  }, [task.id, task.title, task.note, loadSteps]);

  async function patch(data: Parameters<typeof taskApi.update>[1]) {
    await taskApi.update(task.id, data);
    onChanged();
  }

  async function addStep() {
    if (!stepDraft.trim()) return;
    await taskApi.addStep(task.id, { title: stepDraft.trim() });
    setStepDraft('');
    loadSteps();
    onChanged();
  }

  async function toggleStep(s: TaskStep) {
    await taskApi.updateStep(s.id, { done: !s.done });
    loadSteps();
    onChanged();
  }

  async function removeStep(s: TaskStep) {
    await taskApi.removeStep(s.id);
    loadSteps();
    onChanged();
  }

  async function remove() {
    await taskApi.remove(task.id);
    toast.success('Tâche supprimée');
    onChanged();
    onClose();
  }

  const inMyDay = !!task.myDayDate;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-bg-secondary">
      {/* Title row */}
      <div className="flex items-start gap-3 border-b border-border px-4 py-4">
        <button
          onClick={() => patch({ isCompleted: !task.isCompleted })}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            task.isCompleted ? 'border-accent bg-accent text-white' : 'border-text-muted text-transparent hover:border-accent',
          )}
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm font-medium text-text-primary focus:outline-none',
            task.isCompleted && 'text-text-muted line-through',
          )}
        />
        <button
          onClick={() => patch({ isImportant: !task.isImportant })}
          className={cn('shrink-0 rounded p-1', task.isImportant ? 'text-accent' : 'text-text-muted hover:text-accent')}
        >
          <Star size={16} fill={task.isImportant ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((s) => (
            <div key={s.id} className="group flex items-center gap-2.5 rounded-md bg-bg-tertiary px-2.5 py-2">
              <button
                onClick={() => toggleStep(s)}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  s.done ? 'border-accent bg-accent text-white' : 'border-text-muted text-transparent hover:border-accent',
                )}
              >
                <Check size={10} strokeWidth={3} />
              </button>
              <span className={cn('flex-1 truncate text-sm', s.done ? 'text-text-muted line-through' : 'text-text-primary')}>
                {s.title}
              </span>
              <button onClick={() => removeStep(s)} className="text-text-muted opacity-0 transition-opacity hover:text-status-down group-hover:opacity-100">
                <X size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
            <Plus size={15} className="shrink-0 text-text-muted" />
            <input
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStep()}
              placeholder="Ajouter une étape"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Add to My Day */}
        <button
          onClick={() => patch({ myDayDate: inMyDay ? null : todayIso() })}
          className={cn(
            'flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:bg-bg-hover',
            inMyDay ? 'text-accent' : 'text-text-secondary',
          )}
        >
          <Sun size={16} className="shrink-0" />
          <span className="flex-1 text-left">{inMyDay ? 'Ajoutée à Ma journée' : 'Ajouter à Ma journée'}</span>
          {inMyDay && <X size={14} className="text-text-muted" />}
        </button>

        {/* Échéance + rappel */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <CalendarDays size={14} /> Échéance
          </label>
          <input
            type="date"
            value={task.dueDate ?? ''}
            onChange={(e) => patch({ dueDate: e.target.value || null })}
            className="w-full rounded-md border border-border bg-bg-tertiary px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <label className="flex items-center gap-2 pt-1 text-xs font-medium text-text-secondary">
            <Bell size={14} /> Rappel
          </label>
          <input
            type="datetime-local"
            value={toLocalInput(task.reminderAt)}
            onChange={(e) => patch({ reminderAt: fromLocalInput(e.target.value) })}
            className="w-full rounded-md border border-border bg-bg-tertiary px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Assignee (shared lists only) */}
        {isShared && (
          <div className="space-y-1.5 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
              <ListChecks size={14} /> Affecter à
            </label>
            <select
              value={task.assigneeId ?? ''}
              onChange={(e) => patch({ assigneeId: e.target.value ? Number(e.target.value) : null })}
              className="w-full rounded-md border border-border bg-bg-tertiary px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Personne</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName?.trim() || m.username}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (task.note ?? '') && patch({ note: note || null })}
          rows={4}
          placeholder="Ajouter une note"
          className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text-primary" title="Fermer">
          <X size={16} />
        </button>
        <button onClick={remove} className="rounded p-1 text-text-muted hover:text-status-down" title="Supprimer la tâche">
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

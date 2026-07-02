import { useState, type ReactNode } from 'react';
import { Plus, Star, Check, ChevronDown, CalendarDays, Sun, ListChecks } from 'lucide-react';
import type { Task } from '@obliplan/shared';
import { cn } from '../../utils/cn';
import { dayLabel } from '../../utils/format';

interface TaskListPaneProps {
  title: string;
  color: string;
  icon: ReactNode;
  tasks: Task[];
  selectedId: number | null;
  onAdd: (title: string) => void;
  onToggleComplete: (task: Task) => void;
  onToggleImportant: (task: Task) => void;
  onSelect: (task: Task) => void;
}

function Circle({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        done ? 'border-accent bg-accent text-white' : 'border-text-muted text-transparent hover:border-accent',
      )}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}

function TaskRow({
  task,
  active,
  onToggleComplete,
  onToggleImportant,
  onSelect,
}: {
  task: Task;
  active: boolean;
  onToggleComplete: (t: Task) => void;
  onToggleImportant: (t: Task) => void;
  onSelect: (t: Task) => void;
}) {
  return (
    <div
      onClick={() => onSelect(task)}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
        active ? 'border-accent/50 bg-bg-hover' : 'border-border bg-bg-secondary hover:bg-bg-hover',
      )}
    >
      <Circle done={task.isCompleted} onClick={() => onToggleComplete(task)} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm', task.isCompleted ? 'text-text-muted line-through' : 'text-text-primary')}>
          {task.title}
        </div>
        {(task.myDayDate || task.dueDate || (task.stepCount ?? 0) > 0) && (
          <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-text-muted">
            {task.myDayDate && (
              <span className="flex items-center gap-1">
                <Sun size={11} /> Ma journée
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarDays size={11} /> {dayLabel(task.dueDate)}
              </span>
            )}
            {(task.stepCount ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <ListChecks size={11} /> {task.doneStepCount ?? 0}/{task.stepCount}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleImportant(task);
        }}
        title={task.isImportant ? 'Retirer des importantes' : 'Marquer comme importante'}
        className={cn('shrink-0 rounded p-1 transition-colors', task.isImportant ? 'text-accent' : 'text-text-muted hover:text-accent')}
      >
        <Star size={16} fill={task.isImportant ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function TaskListPane({
  title,
  color,
  icon,
  tasks,
  selectedId,
  onAdd,
  onToggleComplete,
  onToggleImportant,
  onSelect,
}: TaskListPaneProps) {
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(true);

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft('');
  }

  const active = tasks.filter((t) => !t.isCompleted);
  const done = tasks.filter((t) => t.isCompleted);

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-bg-primary">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-6 pb-3 pt-5" style={{ color }}>
        <span className="shrink-0">{icon}</span>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>

      {/* Quick-add composer */}
      <div className="px-6">
        <div className="flex items-center gap-3 rounded-md border border-border bg-bg-secondary px-3 py-2.5">
          <Plus size={18} className="shrink-0 text-accent" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ajouter une tâche"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Task rows */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-6 py-4">
        {active.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            active={t.id === selectedId}
            onToggleComplete={onToggleComplete}
            onToggleImportant={onToggleImportant}
            onSelect={onSelect}
          />
        ))}
        {active.length === 0 && done.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-text-muted">Aucune tâche ici.</p>
        )}

        {done.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="mb-1.5 flex items-center gap-2 rounded px-1 py-1 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              <ChevronDown size={14} className={cn('transition-transform duration-200', !showDone && '-rotate-90')} />
              Terminées {done.length}
            </button>
            {showDone &&
              done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  active={t.id === selectedId}
                  onToggleComplete={onToggleComplete}
                  onToggleImportant={onToggleImportant}
                  onSelect={onSelect}
                />
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

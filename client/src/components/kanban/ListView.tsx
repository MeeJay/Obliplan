import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import type { BoardDetail, Card } from '@obliplan/shared';
import { type AssignableUser } from '../../api';
import { UserAvatar } from '../common/UserAvatar';
import { CardEditor } from './CardEditor';
import { PRIORITY_META, PRIORITY_DOT, isOverdue } from './cardMeta';
import { cn } from '../../utils/cn';

interface ListViewProps {
  board: BoardDetail;
  onChanged: () => void;
  assignees: AssignableUser[];
  /** Client-side assignee filter; null = everyone. */
  assigneeFilter: number | null;
}

export function ListView({ board, onChanged, assignees, assigneeFilter }: ListViewProps) {
  const [editor, setEditor] = useState<Card | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const assigneeById = useMemo(() => new Map(assignees.map((u) => [u.id, u])), [assignees]);

  const visibleCards = board.cards.filter((c) => assigneeFilter === null || c.assigneeId === assigneeFilter);

  function toggle(columnId: number) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {board.columns.map((col) => {
        const cards = visibleCards
          .filter((c) => c.columnId === col.id)
          .sort((a, b) => a.position - b.position);
        const open = !collapsed.has(col.id);
        return (
          <div key={col.id} className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
            <button
              onClick={() => toggle(col.id)}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-bg-hover"
            >
              {open ? <ChevronDown size={15} className="text-text-muted" /> : <ChevronRight size={15} className="text-text-muted" />}
              <span className="text-sm font-medium text-text-primary">{col.name}</span>
              <span className="text-xs text-text-muted">{cards.length}</span>
            </button>
            {open && (
              <div className="divide-y divide-border-light">
                {cards.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-muted">Aucune carte</div>
                )}
                {cards.map((card) => {
                  const prio = card.priority ? PRIORITY_META[card.priority] : null;
                  const assignee = card.assigneeId != null ? assigneeById.get(card.assigneeId) : undefined;
                  const overdue = isOverdue(card.dueDate);
                  return (
                    <div
                      key={card.id}
                      onClick={() => setEditor(card)}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-bg-hover"
                    >
                      {card.priority ? (
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])} />
                      ) : (
                        <span className="h-2 w-2 shrink-0" />
                      )}
                      <span className="flex-1 truncate text-text-primary">{card.title}</span>
                      {prio && (
                        <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', prio.cls)}>{prio.label}</span>
                      )}
                      {card.dueDate && (
                        <span
                          className={cn(
                            'flex items-center gap-1 text-[11px]',
                            overdue ? 'font-medium text-status-down' : 'text-text-muted',
                          )}
                        >
                          <Calendar size={11} /> {card.dueDate}
                        </span>
                      )}
                      {assignee ? (
                        <UserAvatar username={assignee.displayName || assignee.username} size={22} />
                      ) : (
                        <span className="text-[11px] text-text-muted">-</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {editor && (
        <CardEditor
          boardId={board.id}
          board={board}
          columns={board.columns}
          sprints={board.sprints}
          assignees={assignees}
          card={editor}
          defaultColumnId={editor.columnId}
          onOpenCard={(c) => setEditor(c)}
          onClose={() => setEditor(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

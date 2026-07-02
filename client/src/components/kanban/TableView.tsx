import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { BoardDetail, Card, CardPriority } from '@obliplan/shared';
import { type AssignableUser } from '../../api';
import { UserAvatar } from '../common/UserAvatar';
import { CardEditor } from './CardEditor';
import { PRIORITY_META, PRIORITY_DOT, isOverdue } from './cardMeta';
import { cn } from '../../utils/cn';

interface TableViewProps {
  board: BoardDetail;
  onChanged: () => void;
  assignees: AssignableUser[];
  /** Client-side assignee filter; null = everyone. */
  assigneeFilter: number | null;
}

type SortKey = 'title' | 'assignee' | 'priority' | 'points' | 'dueDate' | 'sprint' | 'column';
type SortDir = 'asc' | 'desc';

const PRIORITY_RANK: Record<CardPriority, number> = { low: 1, medium: 2, high: 3 };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Titre' },
  { key: 'assignee', label: 'Assigné' },
  { key: 'priority', label: 'Priorité' },
  { key: 'points', label: 'Points' },
  { key: 'dueDate', label: 'Échéance' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'column', label: 'Colonne' },
];

export function TableView({ board, onChanged, assignees, assigneeFilter }: TableViewProps) {
  const [editor, setEditor] = useState<Card | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const assigneeById = useMemo(() => new Map(assignees.map((u) => [u.id, u])), [assignees]);
  const columnById = useMemo(() => new Map(board.columns.map((c) => [c.id, c.name])), [board.columns]);
  const sprintById = useMemo(() => new Map(board.sprints.map((s) => [s.id, s.name])), [board.sprints]);

  const assigneeName = (card: Card) =>
    card.assigneeId != null ? assigneeById.get(card.assigneeId)?.displayName || assigneeById.get(card.assigneeId)?.username || '' : '';

  function sortValue(card: Card, key: SortKey): string | number {
    switch (key) {
      case 'title':
        return card.title.toLowerCase();
      case 'assignee':
        return assigneeName(card).toLowerCase();
      case 'priority':
        return card.priority ? PRIORITY_RANK[card.priority] : 0;
      case 'points':
        return card.points ?? -1;
      case 'dueDate':
        return card.dueDate ?? '';
      case 'sprint':
        return (card.sprintId != null ? sprintById.get(card.sprintId) : '')?.toLowerCase() ?? '';
      case 'column':
        return (columnById.get(card.columnId) ?? '').toLowerCase();
    }
  }

  const rows = useMemo(() => {
    const filtered = board.cards.filter((c) => assigneeFilter === null || c.assigneeId === assigneeFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      // Stable tiebreak on board position so drag-reorder ordering is preserved.
      if (cmp === 0) return a.position - b.position;
      return cmp * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.cards, assigneeFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-secondary">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-text-primary">
                  {c.label}
                  {sortKey === c.key &&
                    (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-3 text-xs text-text-muted">
                Aucune carte
              </td>
            </tr>
          )}
          {rows.map((card) => {
            const prio = card.priority ? PRIORITY_META[card.priority] : null;
            const assignee = card.assigneeId != null ? assigneeById.get(card.assigneeId) : undefined;
            const overdue = isOverdue(card.dueDate);
            return (
              <tr
                key={card.id}
                onClick={() => setEditor(card)}
                className="cursor-pointer border-b border-border-light last:border-0 hover:bg-bg-hover"
              >
                <td className="px-3 py-2 text-text-primary">
                  <div className="flex items-center gap-2">
                    {card.priority && (
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])} />
                    )}
                    <span className="truncate">{card.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {assignee ? (
                    <div className="flex items-center gap-1.5">
                      <UserAvatar username={assignee.displayName || assignee.username} size={20} />
                      <span className="truncate text-text-secondary">{assignee.displayName || assignee.username}</span>
                    </div>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {prio ? (
                    <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', prio.cls)}>{prio.label}</span>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-text-secondary">{card.points ?? '-'}</td>
                <td className={cn('px-3 py-2', overdue ? 'font-medium text-status-down' : 'text-text-secondary')}>
                  {card.dueDate ?? '-'}
                </td>
                <td className="px-3 py-2 text-text-secondary">
                  {card.sprintId != null ? sprintById.get(card.sprintId) ?? '-' : '-'}
                </td>
                <td className="px-3 py-2 text-text-secondary">{columnById.get(card.columnId) ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

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

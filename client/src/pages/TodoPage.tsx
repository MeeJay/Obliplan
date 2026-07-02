import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListTodo } from 'lucide-react';
import type { SmartList, TaskList, ListGroup, Task, User } from '@obliplan/shared';
import { listApi, taskApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/common/Spinner';
import { TodoSidebar } from '../components/todo/TodoSidebar';
import { TaskListPane } from '../components/todo/TaskListPane';
import { TaskDetailPane } from '../components/todo/TaskDetailPane';
import { SMART_LISTS, type TodoView } from '../components/todo/todoMeta';
import { todayIso } from '../utils/format';

const EMPTY_COUNTS: Record<SmartList, number> = { my_day: 0, important: 0, planned: 0, assigned: 0, tasks: 0 };

export function TodoPage() {
  const { user } = useAuthStore();
  const [lists, setLists] = useState<TaskList[]>([]);
  const [groups, setGroups] = useState<ListGroup[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [counts, setCounts] = useState<Record<SmartList, number>>(EMPTY_COUNTS);
  const [inboxListId, setInboxListId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TodoView>({ kind: 'smart', key: 'my_day' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSidebar = useCallback(async () => {
    const [l, g, c] = await Promise.all([listApi.list(), listApi.groups(), taskApi.counts()]);
    setLists(l);
    setGroups(g);
    setCounts(c.counts);
    setInboxListId(c.inboxListId);
  }, []);

  const loadTasks = useCallback(async (v: TodoView) => {
    const data = v.kind === 'smart' ? await taskApi.bySmart(v.key) : await taskApi.byList(v.id);
    setTasks(data);
  }, []);

  useEffect(() => {
    Promise.all([loadSidebar(), listApi.members().then(setMembers)]).finally(() => setLoading(false));
  }, [loadSidebar]);

  useEffect(() => {
    loadTasks(view);
  }, [view, loadTasks]);

  const refresh = useCallback(async () => {
    await Promise.all([loadSidebar(), loadTasks(view)]);
  }, [loadSidebar, loadTasks, view]);

  // ── Header (title / color / icon) for the active view ─────────────────────────
  const header = useMemo(() => {
    if (view.kind === 'smart') {
      const meta = SMART_LISTS.find((s) => s.key === view.key)!;
      const Icon = meta.icon;
      return { title: meta.label, color: meta.color, icon: <Icon size={22} /> };
    }
    const list = lists.find((l) => l.id === view.id);
    return {
      title: list?.name ?? 'Liste',
      color: list?.color ?? '#4f9cf9',
      icon: <ListTodo size={22} style={{ color: list?.color }} />,
    };
  }, [view, lists]);

  const currentList = view.kind === 'list' ? lists.find((l) => l.id === view.id) : undefined;
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const selectedList = selectedTask ? lists.find((l) => l.id === selectedTask.listId) : undefined;
  const detailShared = !!selectedList && (selectedList.shared || (selectedList.memberCount ?? 0) > 0);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  async function addTask(title: string) {
    if (view.kind === 'list') {
      await taskApi.create({ listId: view.id, title });
    } else {
      if (!inboxListId) return;
      const today = todayIso();
      await taskApi.create({
        listId: inboxListId,
        title,
        myDayDate: view.key === 'my_day' ? today : undefined,
        isImportant: view.key === 'important' ? true : undefined,
        dueDate: view.key === 'planned' ? today : undefined,
        assigneeId: view.key === 'assigned' ? user?.id : undefined,
      });
    }
    refresh();
  }

  async function toggleComplete(t: Task) {
    await taskApi.update(t.id, { isCompleted: !t.isCompleted });
    refresh();
  }

  async function toggleImportant(t: Task) {
    await taskApi.update(t.id, { isImportant: !t.isImportant });
    refresh();
  }

  async function newList(name: string) {
    const created = await listApi.create({ name });
    await loadSidebar();
    setView({ kind: 'list', id: created.id });
  }

  async function newGroup(name: string) {
    await listApi.createGroup({ name });
    loadSidebar();
  }

  async function toggleGroup(g: ListGroup) {
    await listApi.updateGroup(g.id, { collapsed: !g.collapsed });
    setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, collapsed: !x.collapsed } : x)));
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden bg-bg-primary">
      <TodoSidebar
        smartCounts={counts}
        lists={lists}
        groups={groups}
        members={members}
        view={view}
        onSelect={(v) => {
          setSelectedId(null);
          setView(v);
        }}
        onNewList={newList}
        onNewGroup={newGroup}
        onToggleGroup={toggleGroup}
        onChanged={refresh}
      />

      <TaskListPane
        title={header.title}
        color={header.color}
        icon={header.icon}
        tasks={tasks}
        selectedId={selectedId}
        onAdd={addTask}
        onToggleComplete={toggleComplete}
        onToggleImportant={toggleImportant}
        onSelect={(t) => setSelectedId((id) => (id === t.id ? null : t.id))}
      />

      {selectedTask && (
        <TaskDetailPane
          task={selectedTask}
          members={members}
          isShared={detailShared || !!currentList?.shared}
          onChanged={refresh}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

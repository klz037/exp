/** The task fields needed for progress calculations; compatible with Google Tasks. */
export interface ProgressTaskInput {
  id: string;
  title: string;
  status: string;
  due?: string;
  parent?: string;
}

export interface TaskProgress {
  task: ProgressTaskInput;
  subtasks: TaskProgress[];
  /** Completed subtasks / subtasks, expressed from 0 to 100. */
  progressPercent: number;
  completedSubtasks: number;
  totalSubtasks: number;
  /** A task with children is done when all children are done. */
  isDone: boolean;
}

export interface TodayProgress {
  tasks: TaskProgress[];
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

const COMPLETED_STATUS = 'completed';

/** Groups parent tasks with their descendants. Orphaned subtasks remain visible as roots. */
export function groupTasks(tasks: readonly ProgressTaskInput[]): TaskProgress[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string, ProgressTaskInput[]>();

  for (const task of tasks) {
    if (!task.parent || !taskById.has(task.parent)) continue;
    const children = childrenByParent.get(task.parent) ?? [];
    children.push(task);
    childrenByParent.set(task.parent, children);
  }

  const consumed = new Set<string>();
  const build = (task: ProgressTaskInput, path: ReadonlySet<string>): TaskProgress => {
    const nextPath = new Set(path);
    nextPath.add(task.id);
    consumed.add(task.id);
    const children = (childrenByParent.get(task.id) ?? [])
      .filter((child) => !nextPath.has(child.id))
      .map((child) => build(child, nextPath));
    const totalSubtasks = children.length;
    const completedSubtasks = children.filter((child) => child.isDone).length;
    const progressPercent = totalSubtasks === 0
      ? (task.status === COMPLETED_STATUS ? 100 : 0)
      : Math.round((completedSubtasks / totalSubtasks) * 100);

    return {
      task,
      subtasks: children,
      progressPercent,
      completedSubtasks,
      totalSubtasks,
      isDone: progressPercent === 100,
    };
  };

  const roots = tasks.filter((task) => !task.parent || !taskById.has(task.parent));
  const groups = roots.map((task) => build(task, new Set()));

  // Malformed cyclic parent references have no natural root; retain each remaining task.
  for (const task of tasks) {
    if (!consumed.has(task.id)) groups.push(build(task, new Set()));
  }

  return groups;
}

/** Returns all tasks due on the supplied local calendar day, including due subtasks. */
export function computeTodayProgress(
  groups: readonly TaskProgress[],
  today: Date | string = new Date(),
): TodayProgress {
  const todayKey = typeof today === 'string' ? today.slice(0, 10) : localDateKey(today);
  const dueTasks: TaskProgress[] = [];
  const visit = (task: TaskProgress) => {
    if (task.task.due && dueDateKey(task.task.due) === todayKey) dueTasks.push(task);
    task.subtasks.forEach(visit);
  };
  groups.forEach(visit);

  const completedTasks = dueTasks.filter((task) => task.isDone).length;
  return {
    tasks: dueTasks,
    totalTasks: dueTasks.length,
    completedTasks,
    progressPercent: dueTasks.length === 0
      ? 0
      : Math.round((completedTasks / dueTasks.length) * 100),
  };
}

/** Picks the earliest-due incomplete task; due-date ties favor the most progress. */
export function pickNextUpTask(groups: readonly TaskProgress[]): TaskProgress | null {
  const candidates: TaskProgress[] = [];
  const visit = (task: TaskProgress) => {
    if (!task.isDone) candidates.push(task);
    task.subtasks.forEach(visit);
  };
  groups.forEach(visit);

  return candidates
    .map((task, index) => ({ task, index, dueTime: dueTimestamp(task.task.due) }))
    .sort((a, b) => a.dueTime - b.dueTime
      || b.task.progressPercent - a.task.progressPercent
      || a.index - b.index)[0]?.task ?? null;
}

function dueTimestamp(due?: string): number {
  if (!due) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(due);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function dueDateKey(due: string): string {
  // Preserve date-only values as calendar dates instead of parsing them as UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const parsed = new Date(due);
  return Number.isNaN(parsed.getTime()) ? '' : localDateKey(parsed);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

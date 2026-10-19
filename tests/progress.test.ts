import { describe, expect, it } from 'vitest';
import {
  computeTodayProgress,
  groupTasks,
  pickNextUpTask,
  type ProgressTaskInput,
} from '../src/progress';

const task = (id: string, options: Partial<ProgressTaskInput> = {}): ProgressTaskInput => ({
  id,
  title: id,
  status: 'needsAction',
  ...options,
});

describe('groupTasks', () => {
  it('groups subtasks under their parent while retaining input order', () => {
    const [parent] = groupTasks([
      task('first', { parent: 'parent' }),
      task('parent'),
      task('second', { parent: 'parent', status: 'completed' }),
    ]);

    expect(parent.task.id).toBe('parent');
    expect(parent.subtasks.map(({ task: child }) => child.id)).toEqual(['first', 'second']);
    expect(parent.progressPercent).toBe(50);
    expect(parent.completedSubtasks).toBe(1);
    expect(parent.totalSubtasks).toBe(2);
    expect(parent.isDone).toBe(false);
  });

  it('uses task status when there are no subtasks', () => {
    const [incomplete, complete] = groupTasks([
      task('incomplete'),
      task('complete', { status: 'completed' }),
    ]);

    expect(incomplete.progressPercent).toBe(0);
    expect(incomplete.isDone).toBe(false);
    expect(complete.progressPercent).toBe(100);
    expect(complete.isDone).toBe(true);
  });

  it('keeps orphaned subtasks visible as roots', () => {
    const [orphan] = groupTasks([task('orphan', { parent: 'missing' })]);
    expect(orphan.task.id).toBe('orphan');
  });
});

describe('computeTodayProgress', () => {
  it('counts tasks and subtasks due today and computes completed progress', () => {
    const groups = groupTasks([
      task('parent', { due: '2026-10-19T17:00:00', status: 'needsAction' }),
      task('done-child', { parent: 'parent', due: '2026-10-19T12:00:00', status: 'completed' }),
      task('open-child', { parent: 'parent', due: '2026-10-20T12:00:00' }),
      task('other-day', { due: '2026-10-18T12:00:00', status: 'completed' }),
    ]);

    const result = computeTodayProgress(groups, '2026-10-19');
    expect(result.tasks.map(({ task: dueTask }) => dueTask.id)).toEqual(['parent', 'done-child']);
    expect(result.totalTasks).toBe(2);
    expect(result.completedTasks).toBe(1);
    expect(result.progressPercent).toBe(50);
  });

  it('returns zero progress when no tasks are due today', () => {
    const result = computeTodayProgress(groupTasks([task('later', { due: '2026-10-20' })]), '2026-10-19');
    expect(result).toMatchObject({ tasks: [], totalTasks: 0, completedTasks: 0, progressPercent: 0 });
  });
});

describe('pickNextUpTask', () => {
  it('chooses earliest due and then the incomplete task with most progress', () => {
    const groups = groupTasks([
      task('later', { due: '2026-10-20T09:00:00' }),
      task('less-parent'),
      task('less-progress', { parent: 'less-parent' }),
      task('more-parent', { due: '2026-10-19T09:00:00' }),
      task('more-progress', { parent: 'more-parent', status: 'completed' }),
      task('more-open', { parent: 'more-parent' }),
      task('completed', { due: '2026-10-19T08:00:00', status: 'completed' }),
    ]);
    const next = pickNextUpTask(groups);
    expect(next?.task.id).toBe('more-parent');
  });

  it('puts undated incomplete tasks after dated tasks and returns null when all are done', () => {
    const dated = groupTasks([task('undated'), task('dated', { due: '2026-10-19T10:00:00' })]);
    expect(pickNextUpTask(dated)?.task.id).toBe('dated');
    expect(pickNextUpTask(groupTasks([task('done', { status: 'completed' })]))).toBeNull();
  });
});

import { GAME_CONFIG } from './gameConfig';

export interface GameState {
  xp: number;
  awardedTaskIds: string[];
  awardedSubtaskIds: string[];
  /** Completed task keys grouped by local calendar date. */
  completionIdsByDay: Record<string, string[]>;
  /** ISO week keys where the single rest-day token was used. */
  restTokenWeeks: string[];
  quietMode: boolean;
  xpEnabled: boolean;
  selectedTaskListId: string | null;
}

export interface LevelProgress {
  level: number;
  currentLevelXp: number;
  xpToNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface WeekActivity {
  weekKey: string;
  completionDays: number;
  active: boolean;
  restTokenUsed: boolean;
}

export const DEFAULT_GAME_STATE: GameState = {
  xp: 0,
  awardedTaskIds: [],
  awardedSubtaskIds: [],
  completionIdsByDay: {},
  restTokenWeeks: [],
  quietMode: false,
  xpEnabled: true,
  selectedTaskListId: null,
};

export function readGameState(value: unknown): GameState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_STATE };
  const saved = value as Partial<GameState>;
  return {
    xp: Number.isFinite(saved.xp) ? Math.max(0, saved.xp as number) : 0,
    awardedTaskIds: Array.isArray(saved.awardedTaskIds) ? saved.awardedTaskIds.filter(isString) : [],
    awardedSubtaskIds: Array.isArray(saved.awardedSubtaskIds) ? saved.awardedSubtaskIds.filter(isString) : [],
    completionIdsByDay: isStringArrayRecord(saved.completionIdsByDay) ? saved.completionIdsByDay : {},
    restTokenWeeks: Array.isArray(saved.restTokenWeeks) ? saved.restTokenWeeks.filter(isString) : [],
    quietMode: saved.quietMode === true,
    xpEnabled: saved.xpEnabled !== false,
    selectedTaskListId: typeof saved.selectedTaskListId === 'string' ? saved.selectedTaskListId : null,
  };
}

export function awardCompletion(
  state: GameState,
  taskKey: string,
  isSubtask: boolean,
  completed: boolean,
  localDay: string,
  xpEnabled = true,
): GameState {
  const completionIdsByDay = { ...state.completionIdsByDay };
  const todaysIds = new Set(completionIdsByDay[localDay] ?? []);
  if (completed) todaysIds.add(taskKey);
  else todaysIds.delete(taskKey);

  if (todaysIds.size > 0) completionIdsByDay[localDay] = [...todaysIds];
  else delete completionIdsByDay[localDay];

  if (!completed) return { ...state, completionIdsByDay };

  const awardedIds = isSubtask ? state.awardedSubtaskIds : state.awardedTaskIds;
  if (awardedIds.includes(taskKey)) return { ...state, completionIdsByDay };

  const reward = xpEnabled
    ? (isSubtask ? GAME_CONFIG.XP_PER_SUBTASK : GAME_CONFIG.XP_PER_COMPLETED_TASK)
    : 0;
  return {
    ...state,
    xp: state.xp + reward,
    awardedTaskIds: isSubtask ? state.awardedTaskIds : [...state.awardedTaskIds, taskKey],
    awardedSubtaskIds: isSubtask ? [...state.awardedSubtaskIds, taskKey] : state.awardedSubtaskIds,
    completionIdsByDay,
  };
}

/** Clears earned progress while retaining one-time award history and preferences. */
export function resetGameProgress(state: GameState): GameState {
  return {
    ...state,
    xp: 0,
    completionIdsByDay: {},
    restTokenWeeks: [],
  };
}

export function getLevelProgress(xp: number): LevelProgress {
  const thresholds = GAME_CONFIG.LEVEL_THRESHOLDS;
  let levelIndex = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (xp < thresholds[index]) break;
    levelIndex = index;
  }
  const currentThreshold = thresholds[levelIndex];
  const nextThreshold = thresholds[levelIndex + 1];
  if (nextThreshold === undefined) {
    return {
      level: levelIndex + 1,
      currentLevelXp: Math.max(0, xp - currentThreshold),
      xpToNextLevel: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }
  const xpIntoLevel = Math.max(0, xp - currentThreshold);
  const levelSpan = nextThreshold - currentThreshold;
  return {
    level: levelIndex + 1,
    currentLevelXp: xpIntoLevel,
    xpToNextLevel: levelSpan,
    progressPercent: Math.min(100, Math.round((xpIntoLevel / levelSpan) * 100)),
    isMaxLevel: false,
  };
}

export function getWeekActivity(state: GameState, date = new Date()): WeekActivity {
  const weekKey = getIsoWeekKey(date);
  const completionDays = Object.entries(state.completionIdsByDay)
    .filter(([day, ids]) => ids.length > 0 && getIsoWeekKey(new Date(`${day}T12:00:00`)) === weekKey)
    .length;
  const restTokenUsed = state.restTokenWeeks.includes(weekKey);
  return {
    weekKey,
    completionDays,
    active: completionDays + (restTokenUsed ? 1 : 0) >= GAME_CONFIG.ACTIVE_DAYS_REQUIRED,
    restTokenUsed,
  };
}

export function getActiveWeekCount(state: GameState): number {
  const weekKeys = new Set<string>();
  for (const [day, ids] of Object.entries(state.completionIdsByDay)) {
    if (ids.length > 0) weekKeys.add(getIsoWeekKey(new Date(`${day}T12:00:00`)));
  }
  state.restTokenWeeks.forEach((week) => weekKeys.add(week));
  return [...weekKeys].filter((week) => {
    const completionDays = Object.entries(state.completionIdsByDay)
      .filter(([day, ids]) => ids.length > 0 && getIsoWeekKey(new Date(`${day}T12:00:00`)) === week)
      .length;
    return completionDays + (state.restTokenWeeks.includes(week) ? 1 : 0)
      >= GAME_CONFIG.ACTIVE_DAYS_REQUIRED;
  }).length;
}

export function useRestDayToken(state: GameState, date = new Date()): GameState {
  const activity = getWeekActivity(state, date);
  if (activity.restTokenUsed) return state;
  return { ...state, restTokenWeeks: [...state.restTokenWeeks, activity.weekKey] };
}

export function getIsoWeekKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>)
    .every((items) => Array.isArray(items) && items.every(isString));
}

/** Tune all game rewards and milestones here. XP is a progress score, not a food measure. */
export const GAME_CONFIG = {
  XP_PER_SUBTASK: 10,
  XP_PER_COMPLETED_TASK: 50,
  /** Cumulative XP needed to reach each level; level 1 begins at 0 XP. */
  LEVEL_THRESHOLDS: [0, 100, 250, 450, 700, 1_000, 1_400, 1_900] as const,
  ACTIVE_DAYS_REQUIRED: 4,
  COMPLETION_PULSE_MS: 640,
} as const;

export const GAME_STORAGE_KEY = 'questGameState';

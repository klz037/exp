import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  GoogleApiClient,
  GoogleApiError,
  type GoogleCalendarEvent,
  type GoogleTask,
} from './googleApi';
import {
  computeTodayProgress,
  groupTasks,
  pickNextUpTask,
  type TaskProgress,
} from './progress';
import { GAME_CONFIG, GAME_STORAGE_KEY } from './gameConfig';
import {
  DEFAULT_GAME_STATE,
  awardCompletion,
  getActiveWeekCount,
  getLevelProgress,
  getWeekActivity,
  readGameState,
  useRestDayToken,
  type GameState,
} from './gameState';
import './styles.css';

interface TaskRecord extends GoogleTask {
  listId: string;
}

interface PanelData {
  tasks: TaskRecord[];
  events: GoogleCalendarEvent[];
}

const api = new GoogleApiClient(
  async (interactive) => {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result.token) throw new Error('Google did not return an access token.');
    return result.token;
  },
  (token) => chrome.identity.removeCachedAuthToken({ token }),
);

async function loadGoogleData(): Promise<PanelData> {
  const [taskLists, events] = await Promise.all([
    api.listTaskLists(),
    api.getTodayEvents(),
  ]);
  const taskBuckets = await Promise.all(taskLists.map(async (list) => {
    const tasks = await api.listTasks(list.id);
    return tasks.map((task) => ({ ...task, listId: list.id }));
  }));
  return { tasks: taskBuckets.flat(), events };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dueTime(task: TaskProgress): number {
  if (!task.task.due) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(task.task.due);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function clockLabel(event: GoogleCalendarEvent): string {
  if (event.start?.date && !event.start.dateTime) return 'All day';
  if (!event.start?.dateTime) return 'Time TBD';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(event.start.dateTime));
}

function App() {
  const [signedIn, setSignedIn] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [tasks, setTasks] = React.useState<TaskRecord[]>([]);
  const [events, setEvents] = React.useState<GoogleCalendarEvent[]>([]);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(() => new Set());
  const [gameState, setGameState] = React.useState<GameState>({ ...DEFAULT_GAME_STATE });
  const gameStateRef = React.useRef(gameState);
  const gameWriteQueue = React.useRef<Promise<void>>(Promise.resolve());
  const [gameReady, setGameReady] = React.useState(false);
  const [ringPulse, setRingPulse] = React.useState(false);
  const pulseTimer = React.useRef<number | undefined>(undefined);
  const [today] = React.useState(() => new Date());
  const todayKey = localDateKey(today);
  const groups = React.useMemo(() => groupTasks(tasks), [tasks]);
  const todayProgress = React.useMemo(
    () => computeTodayProgress(groups, todayKey),
    [groups, todayKey],
  );
  const nextUp = React.useMemo(() => {
    const dueIncomplete = todayProgress.tasks
      .filter((task) => !task.isDone)
      .sort((a, b) => dueTime(a) - dueTime(b)
        || b.progressPercent - a.progressPercent);
    return dueIncomplete[0] ?? pickNextUpTask(groups);
  }, [groups, todayProgress.tasks]);
  const todayTaskIds = React.useMemo(
    () => new Set(todayProgress.tasks.map((task) => task.task.id)),
    [todayProgress.tasks],
  );
  const laterTasks = React.useMemo(() => {
    const result: TaskProgress[] = [];
    const visit = (task: TaskProgress) => {
      if (!task.isDone && !todayTaskIds.has(task.task.id)) result.push(task);
      task.subtasks.forEach(visit);
    };
    groups.forEach(visit);
    return result;
  }, [groups, todayTaskIds]);
  const level = getLevelProgress(gameState.xp);
  const weekActivity = getWeekActivity(gameState, today);
  const activeWeekCount = getActiveWeekCount(gameState);

  const saveGameState = React.useCallback(async (nextState: GameState) => {
    gameStateRef.current = nextState;
    setGameState(nextState);
    const write = gameWriteQueue.current.then(
      () => chrome.storage.sync.set({ [GAME_STORAGE_KEY]: nextState }),
    );
    gameWriteQueue.current = write.catch(() => undefined);
    await write;
  }, []);

  const syncGoogleData = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const nextData = await loadGoogleData();
      setTasks(nextData.tasks);
      setEvents(nextData.events);
      setSignedIn(true);
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : 'Could not load Google data. Please try again.');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await chrome.identity.getAuthToken({ interactive: false });
        if (!result.token || !active) return;
        setSignedIn(true);
        await syncGoogleData();
      } catch {
        // No cached authorization is expected before the user signs in.
      }
    })();
    return () => { active = false; };
  }, [syncGoogleData]);

  React.useEffect(() => {
    let active = true;
    void chrome.storage.sync.get(GAME_STORAGE_KEY).then((stored) => {
      if (!active) return;
      const loaded = readGameState(stored[GAME_STORAGE_KEY]);
      gameStateRef.current = loaded;
      setGameState(loaded);
      setGameReady(true);
    }).catch(() => {
      if (!active) return;
      setGameReady(true);
      setMessage('Game progress could not be loaded from Chrome sync storage.');
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => () => {
    if (pulseTimer.current !== undefined) window.clearTimeout(pulseTimer.current);
  }, []);

  const pulseProgressRing = () => {
    if (gameStateRef.current.quietMode) return;
    setRingPulse(true);
    if (pulseTimer.current !== undefined) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setRingPulse(false), GAME_CONFIG.COMPLETION_PULSE_MS);
  };

  const signIn = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await chrome.identity.getAuthToken({ interactive: true });
      if (!result.token) throw new Error('Google did not return an access token. Please try again.');
      setSignedIn(true);
      await syncGoogleData();
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : 'Could not sign in to Google. Please try again.');
      setLoading(false);
    }
  };

  const toggleTask = async (progressTask: TaskProgress, checked: boolean) => {
    if (!gameReady) return;
    const record = tasks.find(({ id }) => id === progressTask.task.id);
    if (!record || pendingIds.has(record.id)) return;
    const previousStatus = record.status;
    const nextStatus: GoogleTask['status'] = checked ? 'completed' : 'needsAction';
    setPendingIds((current) => new Set(current).add(record.id));
    setTasks((current) => current.map((task) => task.id === record.id && task.listId === record.listId
      ? { ...task, status: nextStatus }
      : task));

    try {
      const saved = await api.patchTask(record.listId, record.id, nextStatus);
      setTasks((current) => current.map((task) => task.id === record.id && task.listId === record.listId
        ? { ...saved, listId: record.listId }
        : task));
      if (checked) pulseProgressRing();
      const nextGameState = awardCompletion(
        gameStateRef.current,
        `${record.listId}:${record.id}`,
        Boolean(record.parent),
        checked,
        localDateKey(new Date()),
      );
      try {
        await saveGameState(nextGameState);
      } catch {
        setMessage('Task saved, but game progress could not sync to Chrome storage.');
      }
    } catch (error) {
      setTasks((current) => current.map((task) => task.id === record.id && task.listId === record.listId
        ? { ...task, status: previousStatus }
        : task));
      setMessage(error instanceof GoogleApiError || error instanceof Error
        ? `Could not update “${record.title}”. ${error.message}`
        : `Could not update “${record.title}”. Please try again.`);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
    }
  };

  const toggleQuietMode = (quietMode: boolean) => {
    void saveGameState({ ...gameStateRef.current, quietMode }).catch(() => {
      setMessage('Quiet mode could not be saved to Chrome sync storage.');
    });
    if (quietMode) {
      setRingPulse(false);
      if (pulseTimer.current !== undefined) window.clearTimeout(pulseTimer.current);
    }
  };

  const useWeeklyRestToken = () => {
    void saveGameState(useRestDayToken(gameStateRef.current, today)).catch(() => {
      setMessage('The rest-day token could not be saved. Please try again.');
    });
  };

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(today);
  const circumference = 2 * Math.PI * 38;
  const ringOffset = circumference * (1 - todayProgress.progressPercent / 100);

  return (
    <main className="panel">
      <header className="header">
        <div className="brand-mark" aria-hidden="true">✦</div>
        <div className="brand-copy"><p className="eyebrow">QUEST PANEL</p><h1>Your day, one step at a time</h1></div>
        <span className={`connection-dot${signedIn ? ' is-connected' : ''}`} aria-label={signedIn ? 'Google connected' : 'Google not connected'} />
      </header>

      <section className="today" aria-labelledby="today-heading">
        <div className="section-heading">
          <div><p className="date">{dateLabel}</p><h2 id="today-heading">Today</h2></div>
          {signedIn && <button className="refresh-button" type="button" onClick={() => void syncGoogleData()} disabled={loading} aria-label="Refresh today's tasks and events">↻</button>}
        </div>

        {!signedIn ? (
          <div className="connect-card">
            <div className="connect-copy">
              <strong>Connect your Google account</strong>
              <span>Bring today’s tasks and calendar together.</span>
            </div>
            <button className="sign-in-button" type="button" onClick={signIn} disabled={loading}>
              {loading ? 'Loading…' : 'Sign in'}
            </button>
            {message && <p className="status-message" role="status">{message}</p>}
          </div>
        ) : (
          <>
            <section className="progress-card" aria-label="Today's task progress">
              <div className={`progress-ring${ringPulse && !gameState.quietMode ? ' ring-pulse' : ''}`} role="progressbar" aria-label="Tasks completed today" aria-valuemin={0} aria-valuemax={Math.max(1, todayProgress.totalTasks)} aria-valuenow={todayProgress.completedTasks}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle className="ring-track" cx="50" cy="50" r="38" />
                  <circle className="ring-value" cx="50" cy="50" r="38" strokeDasharray={circumference} strokeDashoffset={ringOffset} />
                </svg>
                <span className="ring-count">{todayProgress.completedTasks}<small>/{todayProgress.totalTasks}</small></span>
              </div>
              <div className="progress-copy">
                <p className="eyebrow">YOUR MOMENTUM</p>
                <h3>{todayProgress.completedTasks} of {todayProgress.totalTasks} done</h3>
                <p>{todayProgress.totalTasks === 0 ? 'A little room to choose your first step.' : 'Every small step moves you forward.'}</p>
              </div>
            </section>

            <section className="game-card" aria-label="Quest progress">
              <div className="game-topline">
                <div className="level-badge">LVL {level.level}</div>
                <strong>{gameState.xp.toLocaleString()} XP</strong>
              </div>
              <div className="level-track" role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.progressPercent}>
                <span style={{ width: `${level.progressPercent}%` }} />
              </div>
              <p className="level-caption">{level.isMaxLevel ? 'Max level reached' : `${level.currentLevelXp} / ${level.xpToNextLevel} XP to level ${level.level + 1}`}</p>
              <div className="game-divider" />
              <div className="week-row">
                <div className="streak-icon" aria-hidden="true">✧</div>
                <div className="week-copy"><strong>{activeWeekCount} active {activeWeekCount === 1 ? 'week' : 'weeks'}</strong><span>{weekActivity.completionDays} of {GAME_CONFIG.ACTIVE_DAYS_REQUIRED} completion days this week{weekActivity.restTokenUsed ? ' · rest day used' : ''}</span></div>
                {!weekActivity.restTokenUsed && weekActivity.completionDays === GAME_CONFIG.ACTIVE_DAYS_REQUIRED - 1 && (
                  <button className="rest-token-button" type="button" onClick={useWeeklyRestToken} disabled={!gameReady}>Use rest token</button>
                )}
              </div>
              <label className="quiet-toggle"><input type="checkbox" checked={gameState.quietMode} onChange={(event) => toggleQuietMode(event.currentTarget.checked)} disabled={!gameReady} /><span className="toggle-track" aria-hidden="true"><span /></span><span>Quiet mode</span></label>
            </section>

            {nextUp ? (
              <section className="next-card" aria-labelledby="next-heading">
                <div className="card-kicker"><span className="next-icon" aria-hidden="true">↗</span><p className="eyebrow">NEXT UP</p></div>
                <TaskCheck task={nextUp} pending={pendingIds.has(nextUp.task.id) || !gameReady} onToggle={toggleTask} prominent />
                {nextUp.subtasks.length > 0 && (
                  <div className="checklist" aria-label="Subtasks">
                    {nextUp.subtasks.map((subtask) => (
                      <TaskCheck key={subtask.task.id} task={subtask} pending={pendingIds.has(subtask.task.id) || !gameReady} onToggle={toggleTask} />
                    ))}
                  </div>
                )}
                {nextUp.totalSubtasks > 0 && (
                  <div className="subtask-progress"><span>{nextUp.completedSubtasks} of {nextUp.totalSubtasks} steps</span><span className="mini-track"><span style={{ width: `${nextUp.progressPercent}%` }} /></span></div>
                )}
              </section>
            ) : (
              <section className="next-card all-done"><span className="done-mark" aria-hidden="true">✓</span><div><h3>You’re all caught up</h3><p>Enjoy the space you made today.</p></div></section>
            )}

            <section className="events-section" aria-labelledby="events-heading">
              <div className="list-heading"><h3 id="events-heading">On your calendar</h3><span>{events.length}</span></div>
              {events.length > 0 ? (
                <ol className="timeline">
                  {events.map((event) => (
                    <li className="timeline-item" key={event.id}>
                      <time>{clockLabel(event)}</time>
                      <span className="timeline-dot" aria-hidden="true" />
                      <span className="event-title">{event.summary || 'Untitled event'}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="quiet-empty">Nothing on the calendar today.</p>}
            </section>

            <details className="later-section">
              <summary><span>Later</span><span className="later-count">{laterTasks.length}</span><span className="chevron" aria-hidden="true">⌄</span></summary>
              <div className="later-list">
                {laterTasks.length > 0 ? laterTasks.map((task) => (
                  <TaskCheck key={task.task.id} task={task} pending={pendingIds.has(task.task.id) || !gameReady} onToggle={toggleTask} />
                )) : <p className="quiet-empty">Nothing waiting in the wings.</p>}
              </div>
            </details>
            {message && <p className="status-message panel-message" role="status">{message}</p>}
          </>
        )}
      </section>
      <footer className="footer"><span className="sparkle" aria-hidden="true">✧</span><span>One step at a time.</span></footer>
    </main>
  );
}

interface TaskCheckProps {
  task: TaskProgress;
  pending: boolean;
  prominent?: boolean;
  onToggle: (task: TaskProgress, checked: boolean) => void;
}

function TaskCheck({ task, pending, prominent = false, onToggle }: TaskCheckProps) {
  return (
    <label className={`task-check${prominent ? ' task-check-prominent' : ''}${task.isDone ? ' is-done' : ''}`}>
      <input
        type="checkbox"
        checked={task.task.status === 'completed'}
        disabled={pending}
        onChange={(event) => onToggle(task, event.currentTarget.checked)}
      />
      <span className="custom-check" aria-hidden="true">✓</span>
      <span className="task-title">{task.task.title}</span>
      {pending && <span className="saving-label">Saving</span>}
    </label>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

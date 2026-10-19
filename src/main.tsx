import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleApiClient, GoogleApiError } from './googleApi';
import './styles.css';

interface PanelData {
  taskListCount: number;
  taskCount: number;
  eventCount: number;
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
  const taskGroups = await Promise.all(taskLists.map((list) => api.listTasks(list.id)));
  return {
    taskListCount: taskLists.length,
    taskCount: taskGroups.reduce((total, tasks) => total + tasks.length, 0),
    eventCount: events.length,
  };
}

function App() {
  const [signedIn, setSignedIn] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [data, setData] = React.useState<PanelData | null>(null);

  const syncGoogleData = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const nextData = await loadGoogleData();
      setData(nextData);
      setSignedIn(true);
    } catch (error) {
      setMessage(error instanceof GoogleApiError || error instanceof Error
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

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date());

  return (
    <main className="panel">
      <header className="header">
        <div className="brand-mark" aria-hidden="true">✦</div>
        <div><p className="eyebrow">QUEST PANEL</p><h1>Hello Quest Panel</h1></div>
        <span className={`connection-dot${signedIn ? ' is-connected' : ''}`} aria-label={signedIn ? 'Google connected' : 'Google not connected'} />
      </header>
      <section className="today" aria-labelledby="today-heading">
        <p className="date">{today}</p>
        <h2 id="today-heading">Today</h2>
        <div className="connect-card">
          <div className="connect-copy">
            <strong>{signedIn ? 'Google connected' : 'Connect your Google account'}</strong>
            <span>{signedIn ? 'Your day is ready to sync.' : 'See your tasks and calendar in one place.'}</span>
          </div>
          <button className="sign-in-button" type="button" onClick={signIn} disabled={loading}>
            {loading ? 'Loading…' : signedIn ? 'Refresh' : 'Sign in'}
          </button>
          {message && <p className="status-message" role="status">{message}</p>}
          {data && signedIn && (
            <p className="data-summary" role="status">
              {data.taskCount} tasks across {data.taskListCount} lists · {data.eventCount} events today
            </p>
          )}
        </div>
        {!signedIn && <div className="empty-state">
          <div className="sunrise" aria-hidden="true">☀</div>
          <h3>A fresh start</h3>
          <p>Your next step will show up here.</p>
        </div>}
      </section>
      <footer className="footer"><span className="sparkle" aria-hidden="true">✧</span><span>One step at a time.</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

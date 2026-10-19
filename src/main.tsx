import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date());

  return (
    <main className="panel">
      <header className="header">
        <div className="brand-mark" aria-hidden="true">✦</div>
        <div><p className="eyebrow">QUEST PANEL</p><h1>Hello Quest Panel</h1></div>
        <button className="avatar" type="button" aria-label="Settings">···</button>
      </header>
      <section className="today" aria-labelledby="today-heading">
        <p className="date">{today}</p>
        <h2 id="today-heading">Today</h2>
        <div className="empty-state">
          <div className="sunrise" aria-hidden="true">☀</div>
          <h3>A fresh start</h3>
          <p>Your next step will show up here.</p>
        </div>
      </section>
      <footer className="footer"><span className="sparkle" aria-hidden="true">✧</span><span>One step at a time.</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

import { useEffect, useMemo, useState } from 'react';
import { customerMoodState } from '../data/customerMood.js';

function customerLabel(c, i) {
  const n = Number.isFinite(c.queueIndex) ? c.queueIndex + 1 : i + 1;
  return `Customer ${n}`;
}

export default function CustomerMoodHud({
  customers = [],
  alerts = [],
  onDismissAlert,
  showToasts = true,
}) {
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState(null);

  const living = useMemo(
    () =>
      (customers || []).filter(
        (c) => c.status !== 'SERVED' && c.status !== 'LEFT',
      ),
    [customers],
  );
  const picked = living.find((c) => c.id === pickedId) || living[0] || null;
  const pickedMood = customerMoodState(picked);
  const latest = alerts[0] || null;
  const unread = alerts.filter((a) => !a.read).length;

  useEffect(() => {
    if (!latest || latest.read) return undefined;
    const t = window.setTimeout(() => onDismissAlert?.(latest.id), 8000);
    return () => window.clearTimeout(t);
  }, [latest, onDismissAlert]);

  return (
    <div className="customer-mood-hud">
      {showToasts && latest && !latest.read ? (
        <div
          className={`customer-toast${latest.improved ? ' is-good' : ' is-warn'}`}
          role="status"
        >
          <strong>Customer update</strong>
          <p>
            {latest.fromFace} → {latest.toFace} {latest.toLabel}
          </p>
          <p className="customer-toast-reason">{latest.reason}</p>
          <button type="button" onClick={() => onDismissAlert?.(latest.id)}>
            OK
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={`customer-mood-btn${unread ? ' has-alert' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Customers {living.length}
        {unread ? <span className="customer-mood-dot">{unread}</span> : null}
      </button>

      {open ? (
        <div className="customer-mood-panel" role="dialog" aria-label="Customer moods">
          <header>
            <h3>Customers</h3>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          {!living.length ? (
            <p className="customer-mood-empty">No one is waiting at the stall.</p>
          ) : (
            <ul>
              {living.map((c, i) => {
                const mood = customerMoodState(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={c.id === picked?.id ? 'is-on' : ''}
                      onClick={() => setPickedId(c.id)}
                    >
                      <span>{mood.face}</span>
                      {customerLabel(c, i)}
                      <em>{mood.label}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {picked ? (
            <div className="customer-mood-detail">
              <p>
                {pickedMood.face} <strong>{pickedMood.label}</strong>
              </p>
              <p>Reason: {pickedMood.reason}</p>
              {pickedMood.action ? <p>Try: {pickedMood.action}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

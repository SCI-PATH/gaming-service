/**
 * Separate history section — review mind maps saved after incorrect answers.
 */
import { useEffect, useState } from 'react';
import {
  clearMindMapHistory,
  loadMindMapHistory,
  subscribeMindMapHistory,
} from './mindMapHistoryStore.js';
import ConceptMindMap from './ConceptMindMap.jsx';

export default function MindMapHistoryDrawer({ open, onClose }) {
  const [entries, setEntries] = useState(() => loadMindMapHistory());
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setEntries(loadMindMapHistory());
    return subscribeMindMapHistory(setEntries);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    if (!selectedId && entries[0]) setSelectedId(entries[0].id);
  }, [open, entries, selectedId]);

  if (!open) return null;

  const selected =
    entries.find((e) => e.id === selectedId) || entries[0] || null;

  return (
    <div
      className="mm-history-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Mind map history"
    >
      <div className="mm-history-panel">
        <header className="mm-history-header">
          <div>
            <p className="mm-history-kicker">Saved after incorrect answers</p>
            <h2>Mind map history</h2>
            <p className="mm-history-sub">
              Review maps tagged by lesson topic and time. Not shown in the
              live mentor chat.
            </p>
          </div>
          <button type="button" className="avatar-close" onClick={onClose}>
            Close
          </button>
        </header>

        {entries.length === 0 ? (
          <p className="mm-history-empty">
            No maps yet. Maps are saved only when you answer a question
            incorrectly.
          </p>
        ) : (
          <div className="mm-history-body">
            <ul className="mm-history-list">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`mm-history-item${
                      selected?.id === e.id ? ' is-active' : ''
                    }`}
                    onClick={() => setSelectedId(e.id)}
                  >
                    <strong>{e.lessonTopic}</strong>
                    <time dateTime={new Date(e.timestamp).toISOString()}>
                      {formatWhen(e.timestamp)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mm-history-detail">
              {selected?.studentWrongAnswer ? (
                <p className="mm-history-wrong">
                  Your answer then: <em>{selected.studentWrongAnswer}</em>
                </p>
              ) : null}
              {selected?.structuredMap ? (
                <ConceptMindMap map={selected.structuredMap} />
              ) : (
                <p className="mm-history-empty">No diagram for this entry.</p>
              )}
            </div>
          </div>
        )}

        {entries.length > 0 ? (
          <footer className="mm-history-footer">
            <button
              type="button"
              className="avatar-chip"
              onClick={() => {
                if (
                  window.confirm(
                    'Clear all saved mind maps from this device?',
                  )
                ) {
                  clearMindMapHistory();
                  setEntries([]);
                  setSelectedId(null);
                }
              }}
            >
              Clear history
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function formatWhen(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

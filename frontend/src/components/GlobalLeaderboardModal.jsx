import { useCallback, useEffect, useState } from 'react';
import { fetchLeaderboard } from '../data/leaderboardApi.js';
import { IconTrophy } from './GameIcons.jsx';

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

/**
 * Global top-10 leaderboard modal (server-backed, not local device storage).
 */
export default function GlobalLeaderboardModal({
  open,
  student,
  onClose,
}) {
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [you, setYou] = useState(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    const result = await fetchLeaderboard({
      period,
      studentId: student?.id || null,
    });
    setLoading(false);
    if (!result.ok) {
      setEntries([]);
      setYou(null);
      setError(
        result.skipped
          ? 'No shared rankings yet. Play a round and your score will appear here.'
          : result.error || 'Could not load leaderboard.',
      );
      return;
    }
    setEntries(result.entries);
    setYou(result.you);
  }, [open, period, student?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.code === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="global-leaderboard-overlay" role="dialog" aria-modal="true" aria-label="Leaderboard">
      <div className="global-leaderboard-card">
        <header className="global-leaderboard-head">
          <div className="global-leaderboard-title-wrap">
            <IconTrophy size={22} />
            <div>
              <h2>Arena Leaderboard</h2>
              <p>Top 10 students across Discovery Grove</p>
            </div>
          </div>
          <button type="button" className="global-leaderboard-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="global-leaderboard-tabs" role="tablist" aria-label="Leaderboard period">
          <button
            type="button"
            role="tab"
            aria-selected={period === 'today'}
            className={period === 'today' ? 'is-active' : ''}
            onClick={() => setPeriod('today')}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={period === 'all'}
            className={period === 'all' ? 'is-active' : ''}
            onClick={() => setPeriod('all')}
          >
            All time
          </button>
        </div>

        {loading ? (
          <p className="global-leaderboard-status">Loading rankings…</p>
        ) : error ? (
          <p className="global-leaderboard-status is-error">{error}</p>
        ) : entries.length === 0 ? (
          <p className="global-leaderboard-status">
            No ranked players yet. Complete science quizzes and levels to appear here.
          </p>
        ) : (
          <div className="global-leaderboard-table-wrap">
            <table className="global-leaderboard-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Level</th>
                  <th scope="col">Score</th>
                  <th scope="col">Correct</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isYou = entry.studentId && entry.studentId === student?.id;
                  return (
                    <tr key={`${entry.studentId}-${entry.rank}`} className={isYou ? 'is-you' : ''}>
                      <td>{rankBadge(entry.rank)}</td>
                      <td>
                        {entry.displayName}
                        {isYou ? <span className="global-leaderboard-you-tag">You</span> : null}
                      </td>
                      <td>L{entry.currentLevel}</td>
                      <td>{entry.score.toLocaleString()}</td>
                      <td>{entry.quizCorrect}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {you && !entries.some((e) => e.studentId === you.studentId) ? (
          <footer className="global-leaderboard-you-row">
            Your rank: <strong>#{you.rank}</strong> · Score {you.score.toLocaleString()} · L
            {you.currentLevel}
          </footer>
        ) : null}

        <footer className="global-leaderboard-foot">
          <button type="button" className="global-leaderboard-back" onClick={onClose}>
            Back to lobby
          </button>
        </footer>
      </div>
    </div>
  );
}

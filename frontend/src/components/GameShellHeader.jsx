import { GAME_NAME, GAME_PLATFORM } from '../data/gameBrand.js';
import { IconChart } from './GameIcons.jsx';

function playerInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Compact SCI-PATH shell header above the game canvas.
 * mode: lobby | playing | dashboard
 */
export default function GameShellHeader({
  mode = 'lobby',
  student,
  farm = {},
  gameReady = false,
  onOpenDashboard,
  onBackToFarm,
  onLogout,
}) {
  const isDashboard = mode === 'dashboard';
  const isPlaying = mode === 'playing';

  return (
    <header
      className={`game-shell-header${mode === 'lobby' ? ' is-lobby' : ''}${isPlaying ? ' is-playing' : ''}${isDashboard ? ' is-dashboard' : ''}`}
    >
      <div className="game-shell-header-brand">
        {!isDashboard ? (
          <span className="game-shell-header-kicker">{GAME_PLATFORM}</span>
        ) : null}
        <h1>{isDashboard ? 'Research dashboard' : GAME_NAME}</h1>
        {isPlaying ? (
          <p className="game-shell-header-sub">
            {gameReady ? (
              <>
                <span className="game-shell-live-dot" aria-hidden />
                Live run
              </>
            ) : (
              'Loading farm…'
            )}
          </p>
        ) : mode === 'lobby' ? (
          <p className="game-shell-header-sub">Farm &amp; unlock adventure</p>
        ) : (
          <p className="game-shell-header-sub">Session insights and progression</p>
        )}
      </div>

      {isPlaying ? (
        <div className="game-shell-header-stats" aria-label="Run stats">
          <span className="game-shell-stat-chip">
            <span className="game-shell-stat-label">Level</span>
            <strong>{farm.levelId ?? 1}</strong>
          </span>
          <span className="game-shell-stat-chip is-cash">
            <span className="game-shell-stat-label">Cash</span>
            <strong>${farm.earnings ?? 0}</strong>
          </span>
        </div>
      ) : null}

      <div className="game-shell-header-actions">
        <div className="game-shell-player">
          <span className="game-shell-player-avatar" aria-hidden>
            {playerInitials(student?.displayName)}
          </span>
          <span className="game-shell-player-name">{student?.displayName || 'Player'}</span>
        </div>

        {isDashboard ? (
          <button type="button" className="game-shell-btn" onClick={onBackToFarm}>
            Back to farm
          </button>
        ) : (
          <button
            type="button"
            className="game-shell-btn is-accent"
            onClick={onOpenDashboard}
            title="Research dashboard"
          >
            <IconChart size={16} />
            <span>Dashboard</span>
          </button>
        )}

        <button type="button" className="game-shell-btn is-ghost" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

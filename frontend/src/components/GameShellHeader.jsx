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
 * mode: lobby | playing | dashboard | mindmap | textbooks
 */
export default function GameShellHeader({
  mode = 'lobby',
  student,
  farm = {},
  gameReady = false,
  chapterTitle = '',
  chapterLevel = null,
  onOpenLearningPath,
  onOpenDashboard,
  onOpenMindMap,
  onOpenTextbooks,
  onBackToFarm,
  onLogout,
  loggingOut = false,
}) {
  const isDashboard = mode === 'dashboard';
  const isMindMap = mode === 'mindmap';
  const isTextbooks = mode === 'textbooks';
  const isPlaying = mode === 'playing';
  const isOverlay = isDashboard || isMindMap || isTextbooks;

  return (
    <header
      className={`game-shell-header${mode === 'lobby' ? ' is-lobby' : ''}${isPlaying ? ' is-playing' : ''}${isOverlay ? ' is-dashboard' : ''}`}
    >
      <div className="game-shell-header-brand">
        {!isOverlay ? (
          <span className="game-shell-header-kicker">{GAME_PLATFORM}</span>
        ) : null}
        <h1>
          {isDashboard
            ? 'Your learning dashboard'
            : isMindMap
              ? 'Science mind map'
              : isTextbooks
                ? 'Textbook ingest'
                : GAME_NAME}
        </h1>
        {isPlaying ? (
          <p className="game-shell-header-sub">
            {gameReady ? (
              <>
                <span className="game-shell-live-dot" aria-hidden />
                {chapterTitle
                  ? `${chapterTitle} · Level ${farm.levelId ?? 1}`
                  : 'Live run'}
              </>
            ) : (
              'Loading farm…'
            )}
          </p>
        ) : mode === 'lobby' ? (
          <p className="game-shell-header-sub">
            {chapterTitle
              ? `Chapter farm · ${chapterTitle}`
              : 'Farm & unlock adventure'}
          </p>
        ) : isMindMap ? (
          <p className="game-shell-header-sub">Ask a Science question. The map uses your textbook and frustration score.</p>
        ) : isTextbooks ? (
          <p className="game-shell-header-sub">Download PDFs, chunk them, and store embeddings in ChromaDB</p>
        ) : (
          <p className="game-shell-header-sub">Frustration, topics, and Sage&apos;s next step</p>
        )}
      </div>

      {isPlaying ? (
        <div className="game-shell-header-stats" aria-label="Run stats">
          <span className="game-shell-stat-chip">
            <span className="game-shell-stat-label">Level</span>
            <strong>
              {chapterLevel != null ? chapterLevel : farm.levelId ?? 1}
            </strong>
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

        {onOpenLearningPath && !isPlaying ? (
          <button
            type="button"
            className="game-shell-btn"
            onClick={onOpenLearningPath}
            title="Back to learning path"
          >
            <span>Learning Path</span>
          </button>
        ) : null}

        {isOverlay ? (
          <button type="button" className="game-shell-btn" onClick={onBackToFarm}>
            Back to farm
          </button>
        ) : (
          <button
            type="button"
            className="game-shell-btn is-accent"
            onClick={onOpenDashboard}
            title="Learning dashboard"
          >
            <IconChart size={16} />
            <span>Dashboard</span>
          </button>
        )}

        {onOpenMindMap && !isPlaying && !isMindMap ? (
          <button type="button" className="game-shell-btn" onClick={onOpenMindMap}>
            Science map
          </button>
        ) : null}

        {onOpenTextbooks && !isPlaying && !isTextbooks ? (
          <button type="button" className="game-shell-btn" onClick={onOpenTextbooks}>
            Textbooks
          </button>
        ) : null}

        <button
          type="button"
          className="game-shell-btn is-ghost"
          onClick={onLogout}
          disabled={loggingOut}
          aria-busy={loggingOut}
        >
          {loggingOut ? 'Signing out…' : 'Log out'}
        </button>
      </div>
    </header>
  );
}

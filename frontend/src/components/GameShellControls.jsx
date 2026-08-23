import { GAME_NAME } from '../data/gameBrand.js';
import { IconChart } from './GameIcons.jsx';

/** Full-canvas loading state before Phaser menu is interactive. */
export function GameCanvasLoading() {
  return (
    <div className="game-canvas-loading" role="status" aria-live="polite">
      <div className="game-canvas-loading-card">
        <p className="game-canvas-loading-kicker">SCI-PATH</p>
        <h2 className="game-canvas-loading-title">{GAME_NAME}</h2>
        <div className="game-canvas-loading-bar" aria-hidden>
          <span className="game-canvas-loading-bar-fill" />
        </div>
        <p className="game-canvas-loading-text">Loading game…</p>
      </div>
    </div>
  );
}

/** Compact progress shortcut shown during farm play. */
export function GameProgressButton({ onClick, progressPct = 0 }) {
  return (
    <button type="button" className="game-progress-btn" onClick={onClick} title="Research dashboard">
      <IconChart size={18} />
      <span>Progress</span>
      <span className="game-progress-btn-pct">{Math.round(progressPct)}%</span>
    </button>
  );
}

import { useEffect } from 'react';
import { GAME_NAME, GAME_PLATFORM, GAME_TAGLINE } from '../data/gameBrand.js';
import {
  GameIconButton,
  IconChart,
  IconChevronRight,
  IconPlay,
  IconTrophy,
  IconVolumeOff,
  IconVolumeOn,
} from './GameIcons.jsx';

const GUIDE_LINES = [
  'Plant on gold beds, then answer the science quiz.',
  'Harvest crops onto your back when they are ready.',
  'Walk to the Farm Shop and press E to unload.',
  'Customers buy automatically from shop stock.',
  'WASD to move · E to interact.',
];

function playerInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Game lobby / briefing overlay — icon toolbar, progress card, research dashboard link.
 */
export default function GameLobbyOverlay({
  mode = 'menu',
  student,
  farm,
  lobbyProgress,
  musicEnabled = true,
  gameReady = false,
  savedRun = null,
  onStart,
  onStartOver,
  onLeaderboard,
  onToggleMusic,
  onOpenProgress,
  chapterTitle = '',
  nextChapterTitle = '',
  pathLinked = false,
  unlockedLabels = [],
}) {
  const isGuide = mode === 'guide';
  const progress = lobbyProgress || {};

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      onStart?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onStart]);
  const levelLabel =
    progress.phase === 'returning'
      ? `Level ${progress.levelId ?? farm.levelId}`
      : `Level ${progress.levelId ?? farm.levelId ?? 1}`;

  return (
    <div
      className={`game-lobby-overlay${isGuide ? ' is-guide' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={isGuide ? 'How to play' : 'Game lobby'}
    >
      <header className="game-lobby-topbar">
        <div className="game-lobby-player">
          <span className="game-lobby-avatar" aria-hidden>
            {playerInitials(student?.displayName)}
          </span>
          <div className="game-lobby-player-copy">
            <strong>{student?.displayName || 'Player'}</strong>
            <span>{levelLabel}</span>
          </div>
        </div>

        <div className="game-lobby-actions">
          <GameIconButton
            label={musicEnabled ? 'Mute sound' : 'Unmute sound'}
            onClick={onToggleMusic}
            active={musicEnabled}
          >
            {musicEnabled ? <IconVolumeOn /> : <IconVolumeOff />}
          </GameIconButton>

          {!isGuide && (
            <GameIconButton label="Leaderboard" onClick={onLeaderboard}>
              <IconTrophy />
            </GameIconButton>
          )}

          <GameIconButton label="Research dashboard" onClick={onOpenProgress} highlight>
            <IconChart />
          </GameIconButton>
        </div>
      </header>

      <div className="game-lobby-body">
        <section className="game-lobby-hero">
          <p className="game-lobby-kicker">{isGuide ? 'Briefing' : GAME_PLATFORM}</p>
          <h2 className="game-lobby-title">{isGuide ? 'How to Play' : GAME_NAME}</h2>
          {!isGuide && pathLinked && chapterTitle ? (
            <p className="game-lobby-chapter">
              Chapter farm · <strong>{chapterTitle}</strong> · Level{' '}
              {progress.levelId ?? farm.levelId ?? 1}
              {unlockedLabels.length ? (
                <>
                  <br />
                  On this farm:{' '}
                  {unlockedLabels.slice(0, 6).join(', ')}
                  {unlockedLabels.length > 6 ? '…' : ''}
                </>
              ) : null}
              {nextChapterTitle ? (
                <>
                  <br />
                  After you finish, you return to unlock {nextChapterTitle}.
                </>
              ) : null}
            </p>
          ) : null}
          {!isGuide ? (
            <p className="game-lobby-tagline">{GAME_TAGLINE.replace(/\n/g, ' ')}</p>
          ) : (
            <ul className="game-lobby-guide-list">
              {GUIDE_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="game-lobby-play"
            onClick={onStart}
            disabled={!gameReady}
          >
            <IconPlay size={18} />
            {isGuide
              ? 'Enter the Farm'
              : savedRun
                ? 'Continue farm'
                : progress.phase === 'returning'
                  ? `Continue Level ${progress.levelId ?? farm.levelId ?? 1}`
                  : 'Start Adventure'}
          </button>
          {!isGuide && savedRun ? (
            <p className="game-lobby-saved">
              Saved: {savedRun.label}. Pick up where you left the crops, cash, and
              shop.
            </p>
          ) : null}
          {!isGuide && savedRun && onStartOver ? (
            <button
              type="button"
              className="game-lobby-start-over"
              onClick={onStartOver}
              disabled={!gameReady}
            >
              Start this level over
            </button>
          ) : null}
          <p className="game-lobby-enter-hint">Press Enter to continue</p>
        </section>

        {!isGuide && (
          <aside className="game-lobby-progress-card" aria-label="Your progress">
            <div className="game-lobby-progress-head">
              <span className="game-lobby-progress-title">Your progress</span>
              <span className="game-lobby-progress-count">
                {progress.progressCountLabel ?? '—'}
              </span>
            </div>

            <div className="game-lobby-progress-track" aria-hidden>
              <div
                className="game-lobby-progress-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, progress.progressPct ?? 0))}%`,
                }}
              />
            </div>

            <dl className="game-lobby-stat-grid">
              <div>
                <dt>Mastery</dt>
                <dd>{progress.masteryLabel ?? '—'}</dd>
              </div>
              <div>
                <dt>Gameplay</dt>
                <dd>{progress.gameplayLabel ?? '—'}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>
                  {progress.targetLabel ?? '—'}
                  {progress.targetSource === 'previous_level' ? (
                    <span className="game-lobby-stat-note">From last level</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Cash</dt>
                <dd>${farm.earnings ?? 0}</dd>
              </div>
            </dl>

            <button type="button" className="game-lobby-progress-link" onClick={onOpenProgress}>
              <IconChart size={18} />
              View Research Dashboard
              <IconChevronRight />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}

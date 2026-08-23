import { useCallback, useEffect } from 'react';
import { GAME_NAME } from '../data/gameBrand.js';
import { IconChevronRight } from './GameIcons.jsx';

/**
 * Full-screen game over — shown over the Phaser canvas when the run ends.
 */
export default function GameOverOverlay({
  open,
  payload,
  student,
  onContinue,
}) {
  const quizCorrect = payload?.quizCorrect ?? 0;
  const quizIncorrect = payload?.quizIncorrect ?? 0;
  const maxWrong = payload?.maxWrong ?? 6;
  const levelId = payload?.levelId ?? 1;
  const score = Math.round(payload?.score ?? 0);
  const earnings = Math.round(payload?.earnings ?? 0);
  const reason = payload?.reason ?? 'wrong_answers';

  const handleContinue = useCallback(() => {
    onContinue?.();
  }, [onContinue]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleContinue]);

  if (!open) return null;

  const missPct = Math.min(100, Math.round((quizIncorrect / maxWrong) * 100));
  const accuracy =
    quizCorrect + quizIncorrect > 0
      ? Math.round((quizCorrect / (quizCorrect + quizIncorrect)) * 100)
      : 0;

  return (
    <div
      className="game-over-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
    >
      <div className="game-over-vignette" aria-hidden />
      <div className="game-over-scanlines" aria-hidden />

      <div className="game-over-panel">
        <div className="game-over-panel-glow" aria-hidden />

        <header className="game-over-head">
          <span className="game-over-badge">
            {reason === 'wrong_answers' ? 'Science check failed' : 'Run ended'}
          </span>
          <h1 className="game-over-title">Game Over</h1>
          <p className="game-over-sub">
            {reason === 'wrong_answers'
              ? `${student?.displayName || 'Farmer'}, you hit ${maxWrong} missed questions. Review the science tips and jump back in.`
              : 'Your farm run has ended. Return to the lobby when you are ready.'}
          </p>
        </header>

        <div className="game-over-meter" aria-label={`${quizIncorrect} of ${maxWrong} misses`}>
          <div className="game-over-meter-label">
            <span>Miss limit</span>
            <strong>
              {quizIncorrect}/{maxWrong}
            </strong>
          </div>
          <div className="game-over-meter-track">
            <div
              className="game-over-meter-fill"
              style={{ width: `${missPct}%` }}
            />
          </div>
          <div className="game-over-meter-segments" aria-hidden>
            {Array.from({ length: maxWrong }, (_, i) => (
              <span
                key={i}
                className={i < quizIncorrect ? 'is-filled' : ''}
              />
            ))}
          </div>
        </div>

        <ul className="game-over-stats">
          <li className="game-over-stat is-correct">
            <span className="game-over-stat-icon" aria-hidden>
              ✓
            </span>
            <span className="game-over-stat-value">{quizCorrect}</span>
            <span className="game-over-stat-label">Correct</span>
          </li>
          <li className="game-over-stat is-missed">
            <span className="game-over-stat-icon" aria-hidden>
              ✗
            </span>
            <span className="game-over-stat-value">{quizIncorrect}</span>
            <span className="game-over-stat-label">Missed</span>
          </li>
          <li className="game-over-stat is-coins">
            <span className="game-over-stat-icon" aria-hidden>
              ◆
            </span>
            <span className="game-over-stat-value">${earnings}</span>
            <span className="game-over-stat-label">Coins</span>
          </li>
        </ul>

        <div className="game-over-meta">
          <span>Level {levelId}</span>
          <span className="game-over-meta-dot" aria-hidden>
            ·
          </span>
          <span>Score {score}</span>
          <span className="game-over-meta-dot" aria-hidden>
            ·
          </span>
          <span>{accuracy}% accuracy</span>
        </div>

        <p className="game-over-tip">
          Use hints on tough questions · enemy hits no longer end your run
        </p>

        <button
          type="button"
          className="game-over-cta"
          onClick={handleContinue}
        >
          Return to lobby
          <IconChevronRight />
        </button>

        <p className="game-over-keys">Enter · Space</p>
      </div>

      <p className="game-over-brand">{GAME_NAME}</p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EGG_ASSETS,
  createEggRound,
  getEggCollectSettings,
  pickProtectQuestion,
} from '../data/eggCollect.js';
import { GAMEPLAY_BAND_LABELS } from '../data/gameplayPerformance.js';

function formatMs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function NestCard({ nest, active, disabled, onCollect }) {
  const hatched = nest.status === 'hatched';
  const collected = nest.status === 'collected';
  return (
    <div
      className={`egg-nest-card egg-nest-card--${nest.status}${
        active ? ' is-active' : ''
      }`}
    >
      <img
        src={
          hatched
            ? nest.chickSrc || EGG_ASSETS.chick
            : nest.roosterSrc || EGG_ASSETS.rooster
        }
        alt={hatched ? 'Chick' : 'Rooster'}
        className={hatched ? 'egg-nest-chick' : 'egg-nest-rooster'}
      />
      {nest.status === 'egg' && (
        <button
          type="button"
          className="egg-nest-egg-btn"
          onClick={onCollect}
          disabled={disabled}
          title="Answer to collect this egg"
        >
          <img src={EGG_ASSETS.egg} alt="" />
          <em>Answer</em>
        </button>
      )}
      {hatched && <span className="egg-nest-tag is-hatched">Hatched</span>}
      {collected && <span className="egg-nest-tag">In bowl</span>}
    </div>
  );
}

/**
 * Wooden coop egg challenge.
 * Correct science answers put eggs in the bowl; wrong / late → eggs hatch to chicks.
 */
export default function EggCollectModal({
  open,
  stageTitle = 'Collect Eggs',
  gameplayBand = 'average',
  onProtectCorrect,
  onProtectWrong,
  onComplete,
  onClose,
}) {
  const band = gameplayBand || 'average';
  const settings = useMemo(() => getEggCollectSettings(band), [band]);

  const [round, setRound] = useState(() => createEggRound(band));
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState('collect'); // collect | quiz | won | lost
  const [question, setQuestion] = useState(null);
  const [activeNestId, setActiveNestId] = useState(null);
  const [quizMode, setQuizMode] = useState('collect'); // collect | protect
  const [usedQuestionIds, setUsedQuestionIds] = useState([]);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const openedAtRef = useRef(Date.now());
  const pausedRemainRef = useRef(null);
  const protectMarks = useRef({ half: false, low: false, started: false });
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setRound(createEggRound(band));
    setNow(Date.now());
    setPhase('collect');
    setQuestion(null);
    setActiveNestId(null);
    setQuizMode('collect');
    setUsedQuestionIds([]);
    setResult(null);
    setToast('Answer correctly to collect each egg into the bowl.');
    openedAtRef.current = Date.now();
    pausedRemainRef.current = null;
    protectMarks.current = { half: false, low: false, started: false };
    completedRef.current = false;
  }, [open, band]);

  useEffect(() => {
    if (!open || phase !== 'collect') return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [open, phase]);

  const remainingMs = Math.max(0, (round?.endsAt || 0) - now);
  const eggsNeeded = settings.eggsNeeded;
  const collected = round?.collected || 0;
  const eggNests = (round?.nests || []).filter((n) => n.status === 'egg');
  const collectedNests = (round?.nests || []).filter((n) => n.status === 'collected');
  const hatchedNests = (round?.nests || []).filter((n) => n.status === 'hatched');

  // Open first collect quiz once round is ready
  useEffect(() => {
    if (!open || phase !== 'collect' || !round) return;
    if (protectMarks.current.started) return;
    if (eggNests.length < 1) return;
    protectMarks.current.started = true;
    const first = eggNests[0];
    window.setTimeout(() => {
      openCollectQuiz(first.id, 'Answer correctly to collect this egg into the bowl.');
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, round]);

  // Extra protect quizzes when time is low (still must answer correctly)
  useEffect(() => {
    if (!open || phase !== 'collect' || !round) return;
    const total = settings.collectTimerMs;
    if (remainingMs <= 0) return;
    if (remainingMs <= total * 0.45 && !protectMarks.current.half) {
      protectMarks.current.half = true;
      openProtectQuiz('Hatch risk! Correct answer protects eggs and buys time.');
      return;
    }
    if (remainingMs <= total * 0.25 && !protectMarks.current.low) {
      protectMarks.current.low = true;
      openProtectQuiz('Almost out of time — answer correctly to protect eggs!');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, open, phase]);

  useEffect(() => {
    if (!open || phase !== 'collect' || !round) return;
    if (remainingMs > 0) return;
    if (collected >= eggsNeeded) {
      finishWin(collected, round?.hatched || 0);
      return;
    }
    hatchRemaining('Too late — uncollected eggs hatched into chicks!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, open, phase]);

  if (!open) return null;

  function pauseTimer() {
    pausedRemainRef.current = Math.max(0, (round?.endsAt || 0) - Date.now());
  }

  function openCollectQuiz(nestId, message) {
    if (phase !== 'collect') return;
    const nest = round?.nests?.find((n) => n.id === nestId && n.status === 'egg');
    if (!nest) return;
    pauseTimer();
    const q = pickProtectQuestion(usedQuestionIds);
    setActiveNestId(nestId);
    setQuizMode('collect');
    setQuestion(q);
    setResult(null);
    setPhase('quiz');
    openedAtRef.current = Date.now();
    if (message) setToast(message);
  }

  function openProtectQuiz(message) {
    if (phase !== 'collect') return;
    if (eggNests.length < 1 && collected < eggsNeeded) return;
    pauseTimer();
    const q = pickProtectQuestion(usedQuestionIds);
    setActiveNestId(null);
    setQuizMode('protect');
    setQuestion(q);
    setResult(null);
    setPhase('quiz');
    openedAtRef.current = Date.now();
    if (message) setToast(message);
  }

  function resumeAfterQuiz() {
    const remain = pausedRemainRef.current;
    pausedRemainRef.current = null;
    if (remain != null) {
      setRound((prev) =>
        prev ? { ...prev, endsAt: Date.now() + remain } : prev,
      );
    }
    setQuestion(null);
    setActiveNestId(null);
    setResult(null);
    setPhase('collect');
    setNow(Date.now());
  }

  function hatchRemaining(message) {
    setRound((prev) => {
      if (!prev) return prev;
      let hatched = prev.hatched;
      const nests = prev.nests.map((n) => {
        if (n.status !== 'egg') return n;
        hatched += 1;
        return { ...n, status: 'hatched' };
      });
      return { ...prev, nests, hatched };
    });
    setToast(message || 'Eggs hatched into chicks.');
    setPhase('lost');
  }

  function finishWin(finalCollected, finalHatched = 0) {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('won');
    setToast('Eggs safely collected in the bowl!');
    onComplete?.({
      collected: finalCollected,
      eggsNeeded,
      band,
      hatched: finalHatched,
    });
  }

  const handleAnswer = (selectedIndex) => {
    if (!question || result || phase !== 'quiz') return;
    const isCorrect = selectedIndex === question.correctIndex;
    const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
    setResult({ isCorrect, selectedIndex, responseTimeMs });
    setUsedQuestionIds((ids) => [...ids, question.id]);
    const nestIdForCollect = activeNestId;
    const mode = quizMode;

    window.setTimeout(() => {
      if (isCorrect) {
        onProtectCorrect?.({
          questionId: question.id,
          responseTimeMs,
          band,
          quizMode: mode,
        });

        if (mode === 'collect' && nestIdForCollect) {
          let nextCollected = 0;
          let nextHatched = 0;
          let nextEggId = null;
          setRound((prev) => {
            if (!prev) return prev;
            const was = prev.nests.find((n) => n.id === nestIdForCollect);
            if (!was || was.status !== 'egg') return prev;
            const nests = prev.nests.map((n) =>
              n.id === nestIdForCollect ? { ...n, status: 'collected' } : n,
            );
            nextCollected = prev.collected + 1;
            nextHatched = prev.hatched;
            nextEggId = nests.find((n) => n.status === 'egg')?.id || null;
            return { ...prev, nests, collected: nextCollected };
          });
          setToast('Correct — egg collected into the bowl!');

          const remain = pausedRemainRef.current;
          pausedRemainRef.current = null;
          if (remain != null) {
            setRound((prev) =>
              prev ? { ...prev, endsAt: Date.now() + remain } : prev,
            );
          }
          setQuestion(null);
          setActiveNestId(null);
          setResult(null);
          setNow(Date.now());

          if (nextCollected >= eggsNeeded) {
            finishWin(nextCollected, nextHatched);
            return;
          }
          setPhase('collect');
          if (nextEggId) {
            window.setTimeout(() => {
              openCollectQuiz(
                nextEggId,
                'Correct! Answer again to collect the next egg.',
              );
            }, 350);
          }
          return;
        }

        const bonus = settings.protectBonusMs;
        const base = pausedRemainRef.current ?? 0;
        pausedRemainRef.current = base + bonus;
        setToast(
          `Correct — eggs protected! +${Math.round(bonus / 1000)}s on the hatch timer.`,
        );
        resumeAfterQuiz();
      } else {
        onProtectWrong?.({
          questionId: question.id,
          responseTimeMs,
          band,
          quizMode: mode,
        });
        const hatchId =
          nestIdForCollect ||
          round?.nests?.find((n) => n.status === 'egg')?.id ||
          null;
        if (hatchId) {
          setRound((prev) => {
            if (!prev) return prev;
            const nests = prev.nests.map((n) =>
              n.id === hatchId ? { ...n, status: 'hatched' } : n,
            );
            return { ...prev, nests, hatched: prev.hatched + 1 };
          });
        }
        setToast('Wrong answer — that egg hatched into a chick!');
        resumeAfterQuiz();
      }
    }, isCorrect ? 700 : 1100);
  };

  const tryAgain = () => {
    setRound(createEggRound(band));
    setNow(Date.now());
    setPhase('collect');
    setQuestion(null);
    setActiveNestId(null);
    setQuizMode('collect');
    setResult(null);
    setToast('New round — answer correctly to collect eggs.');
    pausedRemainRef.current = null;
    protectMarks.current = { half: false, low: false, started: false };
    completedRef.current = false;
  };

  const timerTone =
    remainingMs <= settings.collectTimerMs * 0.25
      ? 'is-critical'
      : remainingMs <= settings.collectTimerMs * 0.4
        ? 'is-warn'
        : '';

  return (
    <div className="egg-collect-overlay" role="dialog" aria-modal="true">
      <div className="egg-collect-card egg-collect-card--coop">
        <header className="egg-collect-head">
          <div>
            <strong>{stageTitle}</strong>
            <h2>Wooden coop — answer to collect eggs</h2>
            <p>
              Tap an egg, then give the <strong>correct science answer</strong> to
              put it in the bowl. Wrong or late answers → eggs hatch into chicks.
            </p>
            <p className={`egg-band-badge gp-${band}`}>
              {settings.label} · {GAMEPLAY_BAND_LABELS[band] || band}
              <span>
                {' '}
                · {settings.nestCount} roosters · need {eggsNeeded} eggs
              </span>
            </p>
          </div>
          <button type="button" className="house-interior-x" onClick={onClose}>
            Leave
          </button>
        </header>

        <div className="egg-collect-body">
          <div className="egg-timer-row">
            <div className={`egg-timer ${timerTone}`}>
              <span>Hatch timer</span>
              <strong>{formatMs(remainingMs)}</strong>
            </div>
            <p className="egg-timer-hint">
              Correct answers collect eggs. If the timer hits zero, leftover eggs
              become chicks.
            </p>
            <button
              type="button"
              className="egg-protect-btn"
              disabled={phase !== 'collect' || eggNests.length === 0}
              onClick={() =>
                openProtectQuiz('Answer correctly to protect eggs and gain time')
              }
            >
              Protect eggs
            </button>
          </div>

          {/* Bowl always first / visible */}
          <div className="egg-bowl-panel">
            <div className="egg-bowl-visual">
              <img src={EGG_ASSETS.bowl} alt="Egg bowl" />
              <div className="egg-bowl-eggs">
                {collectedNests.map((n) => (
                  <img key={n.id} src={EGG_ASSETS.egg} alt="" />
                ))}
              </div>
            </div>
            <div className="egg-bowl-meta">
              <strong>
                {collected} / {eggsNeeded}
              </strong>
              <span>Eggs in the bowl</span>
            </div>
          </div>

          <div className="egg-rooster-grid">
            {(round?.nests || []).map((nest) => (
              <NestCard
                key={nest.id}
                nest={nest}
                active={activeNestId === nest.id}
                disabled={phase !== 'collect'}
                onCollect={() =>
                  openCollectQuiz(
                    nest.id,
                    'Answer correctly to collect this egg into the bowl.',
                  )
                }
              />
            ))}
          </div>

          <div className="egg-status-row">
            <span>In bowl: {collected}</span>
            <span>On shelves: {eggNests.length}</span>
            <span>Hatched: {hatchedNests.length}</span>
          </div>

          {toast && <p className="egg-toast">{toast}</p>}

          {phase === 'quiz' && question && (
            <div className="egg-quiz-panel egg-quiz-panel--urgent">
              <p className="house-quiz-step">
                {quizMode === 'collect'
                  ? 'Collect egg — correct answer puts it in the bowl'
                  : 'Protect eggs — correct answer adds hatch time'}
              </p>
              <p className="house-quiz-prompt">{question.prompt}</p>
              {question.hint && !result && (
                <p className="egg-hint">{question.hint}</p>
              )}
              <div className="house-quiz-options">
                {question.options.map((opt, idx) => {
                  let tone = '';
                  if (result) {
                    if (idx === question.correctIndex) tone = 'is-correct';
                    else if (idx === result.selectedIndex) tone = 'is-wrong';
                  }
                  return (
                    <button
                      key={`${question.id}-${idx}`}
                      type="button"
                      className={`house-quiz-option ${tone}`}
                      disabled={Boolean(result)}
                      onClick={() => handleAnswer(idx)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'won' && (
            <div className="egg-quiz-done">
              <strong>Eggs collected!</strong>
              <p>
                You answered correctly and filled the bowl with {collected} eggs.
              </p>
              <button type="button" className="is-primary" onClick={onClose}>
                Back to farm
              </button>
            </div>
          )}

          {phase === 'lost' && (
            <div className="egg-quiz-done is-lost">
              <strong>Eggs hatched into chicks</strong>
              <p>
                Need {eggsNeeded} correct answers before the timer ends. Wrong or
                late answers hatch eggs into chicks.
              </p>
              <div className="egg-lost-actions">
                <button type="button" onClick={tryAgain}>
                  Try again
                </button>
                <button type="button" className="is-primary" onClick={onClose}>
                  Leave
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

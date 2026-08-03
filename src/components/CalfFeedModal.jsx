import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CALF_ASSETS,
  calfFrameStyle,
  createCalfFeedRound,
  getCalfFeedSettings,
  pickCalfFeedQuestion,
} from '../data/calfFeed.js';
import { GAMEPLAY_BAND_LABELS } from '../data/gameplayPerformance.js';

function formatMs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function CalfSprite({ calf }) {
  return (
    <div
      className={`calf-pen-calf calf-pen-calf--${calf.mood}${
        calf.fed ? ' is-fed' : ''
      }`}
    >
      <span className="calf-sprite" style={calfFrameStyle(calf.frame)} />
      {calf.mood === 'crying' && (
        <>
          <span className="calf-tear calf-tear--l" aria-hidden />
          <span className="calf-tear calf-tear--r" aria-hidden />
          <em className="calf-cry-bubble">baa…</em>
        </>
      )}
      {calf.fed && <span className="calf-fed-tag">Fed</span>}
    </div>
  );
}

function BucketPanel({ kind, level, max, flying }) {
  const pct = Math.min(100, Math.round((level / Math.max(1, max)) * 100));
  const isWater = kind === 'water';
  return (
    <div
      className={`calf-bucket calf-bucket--${kind}${flying ? ' is-filling' : ''}`}
    >
      <div className="calf-bucket-visual">
        <img
          src={CALF_ASSETS.bucket}
          alt=""
          className="calf-bucket-vessel"
        />
        {isWater ? (
          <div
            className="calf-bucket-water"
            style={{ height: `${Math.max(pct, pct > 0 ? 18 : 0)}%` }}
          />
        ) : (
          <div
            className="calf-bucket-food"
            style={{ opacity: Math.max(pct / 100, pct > 0 ? 0.35 : 0.15) }}
          >
            <img src={CALF_ASSETS.foodCrate} alt="" />
          </div>
        )}
        {flying && (
          <span className="calf-bucket-fly-label">
            {isWater ? '+ water' : '+ food'}
          </span>
        )}
      </div>
      <strong>{isWater ? 'Water' : 'Food'}</strong>
      <span>
        {level}/{max} {isWater ? 'filled' : 'stocked'}
      </span>
    </div>
  );
}

function FenceRail({ side }) {
  return (
    <div className={`calf-fence-rail calf-fence-rail--${side}`} aria-hidden>
      {Array.from({ length: side === 'top' || side === 'bottom' ? 6 : 4 }).map(
        (_, i) => (
          <span key={i} className="calf-fence-post">
            <img src={CALF_ASSETS.fenceGate} alt="" />
          </span>
        ),
      )}
    </div>
  );
}

/**
 * Closed-fence calf feeding challenge.
 * Correct answers fill water/food buckets; wrong → calf cries.
 */
export default function CalfFeedModal({
  open,
  stageTitle = 'Feed the Calves',
  gameplayBand = 'average',
  onFeedCorrect,
  onFeedWrong,
  onComplete,
  onClose,
}) {
  const band = gameplayBand || 'average';
  const settings = useMemo(() => getCalfFeedSettings(band), [band]);
  const halfFills = Math.ceil(settings.fillsNeeded / 2);

  const [round, setRound] = useState(() => createCalfFeedRound(band));
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState('play');
  const [question, setQuestion] = useState(null);
  const [usedQuestionIds, setUsedQuestionIds] = useState([]);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [flyingKind, setFlyingKind] = useState(null);
  const openedAtRef = useRef(Date.now());
  const pausedRemainRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const fresh = createCalfFeedRound(band);
    setRound(fresh);
    setNow(Date.now());
    setPhase('play');
    setQuestion(null);
    setUsedQuestionIds([]);
    setResult(null);
    setToast('Answer correctly — water and food fill the buckets.');
    setFlyingKind(null);
    openedAtRef.current = Date.now();
    pausedRemainRef.current = fresh.settings.feedTimerMs;
    completedRef.current = false;
    const t = window.setTimeout(() => {
      pausedRemainRef.current = Math.max(
        0,
        (fresh.endsAt || Date.now()) - Date.now(),
      );
      const q = pickCalfFeedQuestion([]);
      setQuestion(q);
      setPhase('quiz');
      openedAtRef.current = Date.now();
    }, 500);
    return () => window.clearTimeout(t);
  }, [open, band]);

  useEffect(() => {
    if (!open || phase !== 'play') return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [open, phase]);

  useEffect(() => {
    if (!open || phase !== 'play' || !round) return;
    if (now < round.endsAt) return;
    setRound((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        calves: prev.calves.map((c) =>
          c.fed ? c : { ...c, mood: 'crying' },
        ),
      };
    });
    setToast('Time ran out — the calves are crying for food and water!');
    setPhase('lost');
  }, [open, phase, now, round]);

  if (!open) return null;

  const remainMs = Math.max(0, (round?.endsAt || 0) - now);
  const waterMax = halfFills;
  const foodMax = Math.max(1, settings.fillsNeeded - halfFills);

  function openQuiz(message) {
    if (phase === 'won' || phase === 'lost') return;
    const remain = Math.max(0, (round?.endsAt || Date.now()) - Date.now());
    pausedRemainRef.current = remain;
    const q = pickCalfFeedQuestion(usedQuestionIds);
    setQuestion(q);
    setResult(null);
    setPhase('quiz');
    openedAtRef.current = Date.now();
    if (message) setToast(message);
  }

  function resumeTimer() {
    const remain = pausedRemainRef.current;
    pausedRemainRef.current = null;
    if (remain != null) {
      setRound((prev) =>
        prev ? { ...prev, endsAt: Date.now() + remain } : prev,
      );
    }
    setQuestion(null);
    setResult(null);
    setPhase('play');
    setNow(Date.now());
  }

  function finishWin(finalRound) {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('won');
    setToast('Calves fed — water and food buckets are full!');
    onComplete?.({
      correctCount: finalRound?.correctCount || 0,
      fillsNeeded: settings.fillsNeeded,
      waterLevel: finalRound?.waterLevel || 0,
      foodLevel: finalRound?.foodLevel || 0,
      band,
      cryCount: finalRound?.cryCount || 0,
    });
  }

  const handleAnswer = (selectedIndex) => {
    if (!question || result || phase !== 'quiz') return;
    const isCorrect = selectedIndex === question.correctIndex;
    const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
    setResult({ isCorrect, selectedIndex, responseTimeMs });
    setUsedQuestionIds((ids) => [...ids, question.id]);

    window.setTimeout(() => {
      if (isCorrect) {
        onFeedCorrect?.({
          questionId: question.id,
          responseTimeMs,
          band,
        });

        let wonRound = null;
        let fly = 'water';
        setRound((prev) => {
          if (!prev) return prev;
          const fillKind = prev.nextFill;
          fly = fillKind;
          let waterLevel = prev.waterLevel;
          let foodLevel = prev.foodLevel;
          if (fillKind === 'water') {
            waterLevel = Math.min(waterMax, waterLevel + 1);
          } else {
            foodLevel = Math.min(foodMax, foodLevel + 1);
          }
          const correctCount = prev.correctCount + 1;
          const calves = prev.calves.map((c, i) => {
            const shouldFeed =
              correctCount >=
              Math.ceil(((i + 1) / prev.calves.length) * settings.fillsNeeded);
            if (shouldFeed && !c.fed) {
              return { ...c, fed: true, mood: 'happy' };
            }
            return { ...c, mood: c.mood === 'crying' ? 'idle' : c.mood };
          });
          const nextFill =
            waterLevel >= waterMax
              ? 'food'
              : foodLevel >= foodMax
                ? 'water'
                : fillKind === 'water'
                  ? 'food'
                  : 'water';
          const next = {
            ...prev,
            waterLevel,
            foodLevel,
            correctCount,
            calves,
            nextFill,
          };
          if (
            waterLevel >= waterMax &&
            foodLevel >= foodMax &&
            correctCount >= settings.fillsNeeded
          ) {
            wonRound = next;
          }
          return next;
        });

        setFlyingKind(fly);
        window.setTimeout(() => setFlyingKind(null), 700);
        setToast(
          fly === 'water'
            ? 'Correct — water poured into the bucket!'
            : 'Correct — food dropped into the bucket!',
        );

        window.setTimeout(() => {
          if (wonRound) {
            finishWin(wonRound);
            setQuestion(null);
            setResult(null);
            return;
          }
          resumeTimer();
          window.setTimeout(() => {
            openQuiz('Keep going — fill both buckets.');
          }, 400);
        }, 450);
      } else {
        onFeedWrong?.({
          questionId: question.id,
          responseTimeMs,
          band,
        });
        setRound((prev) => {
          if (!prev) return prev;
          const hungry = prev.calves.filter((c) => !c.fed);
          const target =
            hungry[Math.floor(Math.random() * hungry.length)] ||
            prev.calves[0];
          return {
            ...prev,
            cryCount: prev.cryCount + 1,
            calves: prev.calves.map((c) =>
              c.id === target?.id ? { ...c, mood: 'crying' } : c,
            ),
          };
        });
        setToast('Wrong — a calf is crying! Try the next question.');
        window.setTimeout(() => {
          resumeTimer();
          window.setTimeout(() => openQuiz(null), 500);
        }, 700);
      }
    }, 450);
  };

  return (
    <div className="calf-feed-overlay" role="dialog" aria-modal="true">
      <div className="calf-feed-card">
        <header className="calf-feed-head">
          <div>
            <strong>
              {GAMEPLAY_BAND_LABELS[band] || settings.label} · Closed fence
            </strong>
            <h2>{stageTitle}</h2>
            <p>{settings.blurb}</p>
          </div>
          <div className="calf-feed-timer" aria-live="polite">
            <span>Time</span>
            <em className={remainMs < 8000 ? 'is-urgent' : ''}>
              {formatMs(remainMs)}
            </em>
          </div>
        </header>

        <div className="calf-pen">
          <FenceRail side="top" />
          <FenceRail side="left" />
          <FenceRail side="right" />

          <div className="calf-pen-yard">
            <div className="calf-pen-herd">
              {(round?.calves || []).map((c) => (
                <CalfSprite key={c.id} calf={c} />
              ))}
            </div>

            <div className="calf-pen-buckets">
              <BucketPanel
                kind="water"
                level={round?.waterLevel || 0}
                max={waterMax}
                flying={flyingKind === 'water'}
              />
              <BucketPanel
                kind="food"
                level={round?.foodLevel || 0}
                max={foodMax}
                flying={flyingKind === 'food'}
              />
            </div>
          </div>

          <FenceRail side="bottom" />
        </div>

        {toast && <p className="calf-feed-toast">{toast}</p>}

        {phase === 'play' && (
          <div className="calf-feed-actions">
            <button type="button" onClick={() => openQuiz(null)}>
              Answer to fill buckets
            </button>
            <button type="button" className="is-ghost" onClick={onClose}>
              Leave pen
            </button>
          </div>
        )}

        {phase === 'quiz' && question && (
          <div className="calf-feed-quiz">
            <p className="calf-feed-prompt">{question.prompt}</p>
            {question.hint && !result && (
              <p className="calf-feed-hint">{question.hint}</p>
            )}
            <div className="calf-feed-options">
              {question.options.map((opt, idx) => {
                let cls = '';
                if (result) {
                  if (idx === question.correctIndex) cls = 'is-correct';
                  else if (idx === result.selectedIndex) cls = 'is-wrong';
                }
                return (
                  <button
                    key={`${question.id}-${idx}`}
                    type="button"
                    className={cls}
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

        {(phase === 'won' || phase === 'lost') && (
          <div className="calf-feed-actions">
            <button type="button" onClick={onClose}>
              {phase === 'won' ? 'Back to farm' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

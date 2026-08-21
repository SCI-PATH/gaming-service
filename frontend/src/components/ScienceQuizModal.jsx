import { useEffect, useRef, useState } from 'react';
import { ForestGameBridge } from '../game/ForestGameBridge.js';

/**
 * Plant / harvest / load / unload quiz — always reveals the correct answer.
 * Optional gameplayAssist controls answer timer + hint visibility only
 * (does not change question selection / difficulty).
 */
export default function ScienceQuizModal({
  questionData,
  cropId,
  cropName = '',
  mode = 'plant',
  carriedCount = 0,
  gameplayAssist = null,
  onClose,
  onAnswerAttempt,
  onHintUsed = null,
  onOptionSwitch = null,
}) {
  const openedAtRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onAnswerAttemptRef = useRef(onAnswerAttempt);
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const isLoad = mode === 'load';
  const isHarvest = mode === 'harvest';
  const isUnload = mode === 'unload' || mode === 'sell';
  const isItem = mode === 'item_challenge';
  const isStory = mode === 'storyline';
  const isWorld = mode === 'world_challenge';
  const isAnimalTend = mode === 'animal_tend';
  const isAnimalCollect = mode === 'animal_collect';
  const isCleanStart = mode === 'clean_start';
  const isCleanSweep = mode === 'clean_sweep';

  const assist = gameplayAssist || {};
  const answerTimerMs = Number(assist.answerTimerMs) || 0;
  const hintLevel = assist.hintLevel || 'limited';
  const hintText = questionData?.hint || null;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onAnswerAttemptRef.current = onAnswerAttempt;
  }, [onAnswerAttempt]);

  useEffect(() => {
    openedAtRef.current = Date.now();
    finishedRef.current = false;
    setResult(null);
    setShowHint(hintLevel === 'more' && Boolean(hintText));
  }, [
    questionData?.id,
    questionData?.prompt,
    questionData?.question,
    mode,
    hintLevel,
    hintText,
  ]);

  useEffect(() => {
    if (!answerTimerMs || !questionData) return undefined;

    setSecondsLeft(Math.ceil(answerTimerMs / 1000));
    const tick = window.setInterval(() => {
      if (finishedRef.current) return;
      const elapsed = Date.now() - openedAtRef.current;
      const left = Math.max(0, Math.ceil((answerTimerMs - elapsed) / 1000));
      setSecondsLeft(left);
      if (elapsed < answerTimerMs) return;

      finishedRef.current = true;
      const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
      onAnswerAttemptRef.current?.({
        isCorrect: false,
        selectedIndex: -1,
        selectedText: null,
        responseTimeMs,
        questionData,
        mode,
        timedOut: true,
      });
      setResult({
        isCorrect: false,
        selectedIndex: -1,
        responseTimeMs,
        timedOut: true,
      });
      window.setTimeout(() => {
        ForestGameBridge.emit('SCIENCE_INCORRECT', {
          cropId,
          mode,
          questionId: questionData.id,
          responseTimeMs,
        });
        onCloseRef.current?.(false, responseTimeMs);
      }, 1800);
    }, 250);

    return () => window.clearInterval(tick);
  }, [answerTimerMs, questionData, cropId, mode]);

  useEffect(() => {
    if (!hintText || hintLevel === 'minimal' || hintLevel === 'more') {
      return undefined;
    }
    if (hintLevel === 'limited' && answerTimerMs > 0) {
      const mid = window.setTimeout(() => {
        setShowHint(true);
        onHintUsed?.();
      }, Math.floor(answerTimerMs * 0.45));
      return () => window.clearTimeout(mid);
    }
    return undefined;
  }, [hintText, hintLevel, answerTimerMs, questionData?.id, onHintUsed]);

  if (!questionData || !Array.isArray(questionData.options)) return null;

  const options = questionData.options.map((opt, idx) => {
    if (typeof opt === 'string') {
      return {
        text: opt,
        isCorrect: idx === questionData.correctIndex,
      };
    }
    return {
      ...opt,
      isCorrect: Boolean(opt.isCorrect) || idx === questionData.correctIndex,
    };
  });

  const correctOption =
    options.find((o) => o.isCorrect) ||
    options[questionData.correctIndex] ||
    null;
  const correctText = correctOption?.text ?? '—';

  const finish = (isCorrect, responseTimeMs) => {
    if (isCorrect) {
      ForestGameBridge.emit('SCIENCE_CORRECT', {
        cropId,
        mode,
        rp: questionData.rp ?? 0,
        responseTimeMs,
      });
    } else {
      ForestGameBridge.emit('SCIENCE_INCORRECT', {
        cropId,
        mode,
        questionId: questionData.id,
        responseTimeMs,
      });
    }
    onCloseRef.current?.(isCorrect, responseTimeMs);
  };

  const handleAnswer = (isCorrect, selectedIndex) => {
    if (result || finishedRef.current) return;
    finishedRef.current = true;
    const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
    const selectedText = options[selectedIndex]?.text ?? null;
    onAnswerAttemptRef.current?.({
      isCorrect,
      selectedIndex,
      selectedText,
      responseTimeMs,
      questionData,
      mode,
      timedOut: false,
    });
    setResult({
      isCorrect,
      selectedIndex,
      responseTimeMs,
      timedOut: false,
    });
    window.setTimeout(() => {
      finish(isCorrect, responseTimeMs);
    }, isCorrect ? 1600 : 2200);
  };

  const cropLabel = String(cropName || '').trim().toLowerCase();

  const title = isStory
    ? 'A quick question'
    : isWorld
    ? questionData.topic || ''
    : isItem
    ? questionData.topic
      ? `Item Challenge — ${questionData.topic}`
      : 'Item Challenge'
    : isAnimalTend
      ? cropLabel
        ? `Animal Challenge — Feed the ${cropLabel}`
        : 'Animal Challenge — Tend the herd'
      : isAnimalCollect
        ? cropLabel
          ? `Collect Challenge — Pick ${cropLabel}`
          : 'Collect Challenge — Animal produce'
        : isCleanStart
          ? cropLabel
            ? `Cleaning Challenge — Start on ${cropLabel}`
            : 'Cleaning Challenge — Start sweeping'
          : isCleanSweep
            ? cropLabel
              ? `Cleaning Challenge — Sweep ${cropLabel}`
              : 'Cleaning Challenge — Sweep the yard'
        : isUnload
      ? cropLabel
        ? `Sell Challenge — Sell ${cropLabel} at the shop`
        : 'Unload Challenge (Sell Cart)'
      : isLoad
        ? cropLabel
          ? `Load Challenge — Take ${cropLabel} to the cart`
          : 'Load Challenge (Unload onto Cart)'
        : isHarvest
          ? cropLabel
            ? `Harvest Challenge — Pick ${cropLabel}`
            : 'Harvest Challenge (Pick Crops)'
          : cropLabel
            ? `Plant Challenge — Plant ${cropLabel}`
            : 'Plant Challenge (Plant Lock)';

  const successBlurb = isStory
    ? ''
    : isWorld
    ? ''
    : isItem
    ? 'Challenge step complete.'
    : isAnimalTend
      ? 'Animals are fed — collect their milk, eggs, or wool.'
      : isAnimalCollect
        ? 'Collect unlocked — run over the produce in the pen.'
        : isCleanStart
          ? 'Yard unlocked — run over the mess to sweep it up.'
          : isCleanSweep
            ? 'Sweeping unlocked — run over the mess in the yard.'
        : isUnload
      ? 'Crops sold from the cart — cash added.'
      : isLoad
        ? 'Crops unloaded into the cart.'
        : isHarvest
          ? 'Harvest unlocked — run over ready crops to pick them up.'
          : 'Crops will grow — harvest them onto your back.';

  return (
    <div
      className="science-quiz-overlay"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 1000 }}
    >
      <div className="science-quiz-card escape-quiz">
        <div className="escape-quiz-head">
          <h3>{title}</h3>
          {questionData.rp != null && (
            <p className="escape-quiz-topic">+{questionData.rp} RP</p>
          )}
          {answerTimerMs > 0 && secondsLeft != null && !result && (
            <p
              className={`science-quiz-timer ${
                secondsLeft <= 5 ? 'is-urgent' : ''
              }`}
            >
              {secondsLeft}s
            </p>
          )}
          {isLoad && (
            <p className="science-quiz-carry">
              Carrying {carriedCount} crop{carriedCount === 1 ? '' : 's'} on your
              back
            </p>
          )}
          {isUnload && (
            <p className="science-quiz-carry">
              Cart ready to sell — answer to unload for cash
            </p>
          )}
        </div>

        <p className="science-quiz-prompt">
          {questionData.prompt || questionData.question}
        </p>

        {showHint && hintText && !result && (
          <p className="science-quiz-hint" aria-live="polite">
            Hint: {hintText}
          </p>
        )}

        {!showHint && hintText && hintLevel !== 'minimal' && !result && (
          <button
            type="button"
            className="science-quiz-hint-btn"
            onClick={() => {
              setShowHint(true);
              onHintUsed?.();
            }}
          >
            Show hint
          </button>
        )}

        <div className="science-quiz-options">
          {options.map((option, idx) => {
            let tone = '';
            if (result) {
              if (option.isCorrect) tone = 'is-correct';
              else if (idx === result.selectedIndex) tone = 'is-wrong';
            }
            return (
              <button
                key={`${option.text}-${idx}`}
                type="button"
                className={`science-quiz-option ${tone}`}
                disabled={Boolean(result)}
                onPointerEnter={() => onOptionSwitch?.(idx)}
                onFocus={() => onOptionSwitch?.(idx)}
                onClick={() => handleAnswer(option.isCorrect, idx)}
              >
                {option.text}
              </button>
            );
          })}
        </div>

        {result && (
          <div
            className={`science-quiz-feedback ${
              result.isCorrect ? 'is-ok' : 'is-miss'
            }`}
            aria-live="polite"
          >
            {result.isCorrect ? (
              <>
                <strong>{isStory ? 'Nice!' : 'Correct!'}</strong>
                <span>
                  {isStory
                    ? 'You can keep going.'
                    : `Answer: ${correctText}. ${successBlurb}`}
                </span>
              </>
            ) : (
              <>
                <strong>{result.timedOut ? 'Time’s up.' : 'Not quite.'}</strong>
                <span>
                  {isStory
                    ? 'Try that again when you are ready.'
                    : `Correct answer: ${correctText}. The farm problem is still there — try again.`}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

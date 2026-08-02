import { useEffect, useRef, useState } from 'react';
import {
  HOUSE_FURNITURE,
  getHouseBonusKeys,
  getHouseStage,
} from '../data/houseInterior.js';
import { GAMEPLAY_BAND_LABELS } from '../data/gameplayPerformance.js';
import HouseFloorPlan from './HouseFloorPlan.jsx';

/**
 * House challenge screen: empty floor plan fills with furniture on correct answers.
 * Furniture luxury (beds, tables, décor) follows gameplay performance band.
 */
export default function HouseInteriorModal({
  open,
  stageId = 'clean_maintain',
  stageTitle = 'Farm House',
  initialPlaced = [],
  luxuryBand = 'average',
  onStepCorrect,
  onStepWrong,
  onComplete,
  onClose,
}) {
  const band = luxuryBand || 'average';
  const stage = getHouseStage(stageId, band);
  const placements = stage.placements;
  const [placed, setPlaced] = useState(() => new Set(initialPlaced));
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [justPlaced, setJustPlaced] = useState(null);
  const openedAtRef = useRef(Date.now());
  const quizRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const seeded = Array.isArray(initialPlaced) ? initialPlaced : [];
    setPlaced(new Set(seeded));
    let idx = 0;
    for (let i = 0; i < placements.length; i += 1) {
      if (!seeded.includes(placements[i].furnitureKey)) {
        idx = i;
        break;
      }
      idx = i + 1;
    }
    setStepIndex(Math.min(idx, placements.length));
    setResult(null);
    setJustPlaced(null);
    openedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stageId, band]);

  useEffect(() => {
    if (!open) return;
    quizRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open, stepIndex]);

  const current = placements[stepIndex] || null;
  const allDone = stepIndex >= placements.length;
  const progressLabel = `${Math.min(placed.size, placements.length)} / ${placements.length} pieces placed`;
  const highlightSlot = current
    ? HOUSE_FURNITURE[current.furnitureKey]?.slot
    : null;

  if (!open) return null;

  const handleAnswer = (isCorrect, selectedIndex) => {
    if (!current || result || allDone) return;
    const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
    setResult({ isCorrect, selectedIndex, responseTimeMs });

    window.setTimeout(() => {
      if (isCorrect) {
        const key = current.furnitureKey;
        const bonusKeys = getHouseBonusKeys(key, band);
        const added = [key, ...bonusKeys];
        setPlaced((prev) => new Set([...prev, ...added]));
        setJustPlaced(key);
        onStepCorrect?.({
          stageId,
          placementId: current.id,
          furnitureKey: key,
          bonusKeys,
          placeLabel: current.placeLabel,
          responseTimeMs,
          stepIndex,
          totalSteps: placements.length,
          luxuryBand: band,
          houseLevel: stage.houseLevel,
        });

        const next = stepIndex + 1;
        window.setTimeout(() => {
          setJustPlaced(null);
          setResult(null);
          setStepIndex(next);
          openedAtRef.current = Date.now();
          if (next >= placements.length) {
            onComplete?.({
              stageId,
              placedKeys: [...new Set([...placed, ...added])],
              luxuryBand: band,
              houseLevel: stage.houseLevel,
            });
          }
        }, 850);
      } else {
        onStepWrong?.({
          stageId,
          placementId: current.id,
          responseTimeMs,
          stepIndex,
          luxuryBand: band,
        });
        window.setTimeout(() => {
          setResult(null);
          openedAtRef.current = Date.now();
        }, 1200);
      }
    }, isCorrect ? 600 : 1100);
  };

  return (
    <div className="house-interior-overlay" role="dialog" aria-modal="true">
      <div className="house-interior-card">
        <header className="house-interior-head">
          <div>
            <strong>{stageTitle}</strong>
            <h2>{stage.title}</h2>
            <p>{stage.blurb}</p>
            <p className={`house-luxury-badge gp-${band}`}>
              {stage.luxuryLabel}
              <span>
                {' '}
                ({GAMEPLAY_BAND_LABELS[band] || band})
              </span>
            </p>
          </div>
          <button type="button" className="house-interior-x" onClick={onClose}>
            Leave
          </button>
        </header>

        <div className="house-interior-body">
          <div className="house-plan-wrap">
            <HouseFloorPlan
              placedKeys={[...placed]}
              highlightSlot={highlightSlot}
              justPlaced={justPlaced}
              luxuryBand={band}
            />
            <p className="house-interior-progress">{progressLabel}</p>
            {justPlaced && HOUSE_FURNITURE[justPlaced] && (
              <p className="house-place-toast">
                {HOUSE_FURNITURE[justPlaced].label} placed in the house!
              </p>
            )}
          </div>

          <div className="house-quiz-scroll" ref={quizRef}>
            {allDone ? (
              <div className="house-quiz-done">
                <strong>This challenge’s rooms are furnished!</strong>
                <p>
                  Your {stage.houseLevel.toLowerCase()} look is saved. Return to
                  the farm when ready.
                </p>
                <button type="button" className="is-primary" onClick={onClose}>
                  Back to farm
                </button>
              </div>
            ) : (
              current && (
                <div className="house-quiz-panel">
                  <p className="house-quiz-step">
                    Question {stepIndex + 1} of {placements.length} — place{' '}
                    {HOUSE_FURNITURE[current.furnitureKey]?.label || 'item'}
                  </p>
                  <p className="house-quiz-prompt">{current.prompt}</p>
                  <div className="house-quiz-options">
                    {current.options.map((opt, idx) => {
                      let tone = '';
                      if (result) {
                        if (idx === current.correctIndex) tone = 'is-correct';
                        else if (idx === result.selectedIndex) tone = 'is-wrong';
                      }
                      return (
                        <button
                          key={`${current.id}-${idx}`}
                          type="button"
                          className={`house-quiz-option ${tone}`}
                          disabled={Boolean(result)}
                          onClick={() =>
                            handleAnswer(idx === current.correctIndex, idx)
                          }
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {result && !result.isCorrect && (
                    <p className="house-quiz-miss">
                      Not yet — try another answer
                      {current.hint || band === 'weak'
                        ? `. Hint: ${
                            current.hint ||
                            'Think about which room this furniture belongs in.'
                          }`
                        : '.'}
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

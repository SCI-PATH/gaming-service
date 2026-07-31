import { useCallback, useMemo, useState } from 'react';
import ForestRPGCanvas, {
  emitSellCrops,
  emitPlantCrop,
} from './components/ForestRPGCanvas.jsx';
import ScienceQuizModal from './components/ScienceQuizModal.jsx';
import { getFarmLevel } from './data/farmLevels.js';
import { MASTERY_CASH_GOALS } from './data/masteryModel.js';

const DEFAULT_LEVEL = getFarmLevel(1);

/**
 * ForestRPG + Science-Gated Planting loop UI.
 * Phaser canvas stays clean — all HUD lives in React overlays.
 */
export default function App() {
  const [gameReady, setGameReady] = useState(false);
  const [farm, setFarm] = useState({
    earnings: 0,
    target: MASTERY_CASH_GOALS.developing,
    inventory: 0,
    harvestedCount: 0,
    plantedCount: 0,
    levelId: DEFAULT_LEVEL.id,
    cropName: DEFAULT_LEVEL.cropName,
    cropValue: DEFAULT_LEVEL.cropValue,
    goalText: `Developing mastery (50%): harvest & sell to reach $${MASTERY_CASH_GOALS.developing}`,
    forestUnlocked: false,
    performanceBand: 'developing',
    mastery: 0.5,
    masteryPercent: 50,
    masterySource: 'default',
    accuracy: 50,
    questionsAnswered: 0,
  });
  const [ddaMisses, setDdaMisses] = useState(0);
  const [rpEarned, setRpEarned] = useState(0);
  const [banner, setBanner] = useState(null);
  const [hint, setHint] = useState(null);
  const [quizPayload, setQuizPayload] = useState(null);

  const progressPct = useMemo(() => {
    if (!farm.target) return 0;
    return Math.min(100, Math.round((farm.earnings / farm.target) * 100));
  }, [farm.earnings, farm.target]);

  const progressLabel = useMemo(
    () => `$${farm.earnings} / $${farm.target}`,
    [farm.earnings, farm.target],
  );

  const bagCount = farm.harvestedCount ?? farm.inventory ?? 0;

  const bandLabel = useMemo(() => {
    const pct = farm.masteryPercent ?? Math.round((farm.mastery || 0) * 100);
    switch (farm.performanceBand) {
      case 'strong':
        return `High mastery (${pct}%)`;
      case 'emerging':
        return `Building mastery (${pct}%)`;
      default:
        return `Developing mastery (${pct}%)`;
    }
  }, [farm.performanceBand, farm.mastery, farm.masteryPercent]);

  const handleReady = useCallback(() => setGameReady(true), []);

  const handleFarmState = useCallback((state) => {
    setFarm((prev) => ({
      ...prev,
      ...state,
      earnings: state.earnings ?? state.currentMoney ?? prev.earnings,
      target: state.target ?? prev.target,
      harvestedCount:
        state.harvestedItemsCount ??
        state.harvestedCount ??
        state.inventory ??
        prev.harvestedCount,
      inventory:
        state.harvestedItemsCount ??
        state.inventory ??
        state.harvestedCount ??
        prev.inventory,
    }));
  }, []);

  const handleTriggerQuiz = useCallback((payload) => {
    setQuizPayload(payload);
  }, []);

  const handleTargetReached = useCallback((payload) => {
    const goal = payload.target ?? payload.earnings;
    setFarm((prev) => ({
      ...prev,
      goalText:
        payload.goalText ||
        `Target Reached ($${goal})! Proceed to the Forest Entrance!`,
      forestUnlocked: true,
      earnings: payload.earnings ?? payload.currentMoney ?? prev.earnings,
      target: payload.target ?? prev.target,
    }));
    setBanner(
      `Target Reached ($${payload.earnings ?? payload.currentMoney})! Proceed to the Forest Entrance!`,
    );
  }, []);

  const handleInteraction = useCallback((detail) => {
    if (detail?.type === 'plant_fail') {
      setDdaMisses((n) => n + 1);
    }
    if (detail?.type === 'plant_success' && detail.rp) {
      setRpEarned((n) => n + detail.rp);
    }
    if (detail?.type === 'mastery_goal_set') {
      const src =
        detail.source === 'external'
          ? 'mastery model'
          : detail.source === 'previous_level'
            ? `level ${detail.fromLevelId}`
            : 'default';
      setHint(
        `Cash goal $${detail.target} set from ${src} (${detail.masteryPercent}% mastery)`,
      );
      window.setTimeout(() => setHint(null), 3200);
    }
    if (detail?.type === 'quiz_attempt') {
      setHint(
        `Answered in ${detail.responseLabel} · score ${detail.attemptScore}`,
      );
      window.setTimeout(() => setHint(null), 2000);
    }
    if (detail?.type === 'sell') {
      setHint(`Sold for $${detail.coinsEarned ?? detail.gained}!`);
      window.setTimeout(() => setHint(null), 1800);
    }
    if (detail?.type === 'plant_blocked') {
      const msg =
        detail.reason === 'tile_occupied'
          ? 'Tile planted — walk to another row/column and press E.'
          : detail.reason === 'target_reached'
            ? 'Goal reached — head to the forest gate!'
            : 'Cannot plant here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'sell_blocked') {
      setHint('Run over ready crops to harvest, then sell with Q.');
      window.setTimeout(() => setHint(null), 2200);
    }
  }, []);

  const handleQuizClose = useCallback(() => {
    setQuizPayload(null);
  }, []);

  const handleSell = useCallback(() => {
    emitSellCrops();
  }, []);

  return (
    <div className="app-shell forest-app">
      <header className="forest-header">
        <div>
          <h1>SCI_PATH — Farm &amp; Unlock</h1>
          <p>
            Cash goal set from your previous mastery · quiz, plant, harvest &amp;
            sell to enter the forest
          </p>
        </div>
        <div className="forest-stats">
          <span className="forest-chip">
            {gameReady ? 'Playing' : 'Loading…'}
          </span>
          <span>Mastery: {bandLabel}</span>
          <span>Goal: ${farm.target}</span>
          <span>Avg time: {farm.avgResponseLabel ?? '—'}</span>
          <span>RP: {rpEarned}</span>
          <span>Misses: {ddaMisses}</span>
          <span>Bag: {bagCount}</span>
        </div>
      </header>

      <div className="forest-stage-wrap">
        <div className="farm-goal-hud" aria-live="polite">
          <strong>Level {farm.levelId} Goal</strong>
          <span>{farm.goalText}</span>
        </div>

        <div className="farm-progress-hud" aria-live="polite">
          <div className="farm-progress-label">{progressLabel}</div>
          <div className="farm-progress-track">
            <div
              className="farm-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <ForestRPGCanvas
          onReady={handleReady}
          onFarmState={handleFarmState}
          onTriggerQuiz={handleTriggerQuiz}
          onTargetReached={handleTargetReached}
          onInteraction={handleInteraction}
        />

        <div className="farm-controls">
          <button
            type="button"
            onClick={() => emitPlantCrop()}
            disabled={
              !gameReady ||
              Boolean(quizPayload) ||
              (farm.target > 0 && farm.earnings >= farm.target)
            }
          >
            Plant (E) — Quiz first
          </button>
          <button
            type="button"
            onClick={handleSell}
            disabled={!gameReady || bagCount < 1 || Boolean(quizPayload)}
          >
            Sell Inventory (Q) — ${farm.cropValue}/ea
          </button>
        </div>

        {hint && <div className="farm-hint">{hint}</div>}

        {banner && (
          <div className="farm-banner">
            {banner}
            <button type="button" onClick={() => setBanner(null)}>
              OK
            </button>
          </div>
        )}

        {quizPayload && (
          <ScienceQuizModal
            questionData={quizPayload.questionData || quizPayload.question}
            cropId={quizPayload.cropId}
            onClose={handleQuizClose}
          />
        )}
      </div>

      <p className="forest-help">
        Arrow keys move · <kbd>E</kbd> quiz-plant · run over crops to harvest ·{' '}
        <kbd>Q</kbd> sell · Reach ${farm.target} to unlock the forest
      </p>
    </div>
  );
}

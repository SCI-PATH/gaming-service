import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForestRPGCanvas, {
  emitSellCrops,
  emitPlantCrop,
  emitUnlockShopOpen,
  emitUnlockShopClose,
} from './components/ForestRPGCanvas.jsx';
import ScienceQuizModal from './components/ScienceQuizModal.jsx';
import UnlockShopModal from './components/UnlockShopModal.jsx';
import StudentLogin from './components/StudentLogin.jsx';
import FarmMapPanel from './components/FarmMapPanel.jsx';
import { getFarmLevel } from './data/farmLevels.js';
import { DDA_CONFIG, formatResponseTime } from './data/dda.js';
import {
  getCurrentStudent,
  logoutStudent,
} from './data/mockStudents.js';

const DEFAULT_LEVEL = getFarmLevel(1);
const DEFAULT_TIME_TARGET_MS = DDA_CONFIG.midTargetMs;

function createInitialFarm() {
  return {
    earnings: 0,
    target: DEFAULT_TIME_TARGET_MS,
    timeTargetMs: DEFAULT_TIME_TARGET_MS,
    timeTargetLabel: formatResponseTime(DEFAULT_TIME_TARGET_MS),
    maxQuestions: DDA_CONFIG.maxQuestions,
    inventory: 0,
    harvestedCount: 0,
    plantedCount: 0,
    levelId: DEFAULT_LEVEL.id,
    cropName: DEFAULT_LEVEL.cropName,
    cropValue: DEFAULT_LEVEL.cropValue,
    goalText: `Developing mastery (50%): finish ${DDA_CONFIG.maxQuestions} questions · target avg ${formatResponseTime(DEFAULT_TIME_TARGET_MS)}`,
    forestUnlocked: false,
    performanceBand: 'developing',
    mastery: 0.5,
    masteryPercent: 50,
    masterySource: 'default',
    accuracy: 50,
    questionsAnswered: 0,
    avgResponseLabel: '—',
    beatTimeTarget: null,
    playerMapX: 48,
    playerMapY: 32,
    playerTileX: 48,
    playerTileY: 32,
  };
}

/**
 * ForestRPG + Science-Gated Planting loop UI.
 * Phaser canvas stays clean — all HUD lives in React overlays.
 */
export default function App() {
  const [student, setStudent] = useState(() => getCurrentStudent());
  const [gameReady, setGameReady] = useState(false);
  const [farm, setFarm] = useState(createInitialFarm);
  const [ddaMisses, setDdaMisses] = useState(0);
  const [rpEarned, setRpEarned] = useState(0);
  const [banner, setBanner] = useState(null);
  const [hint, setHint] = useState(null);
  const [quizPayload, setQuizPayload] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopPerformance, setShopPerformance] = useState(null);
  const [playerMap, setPlayerMap] = useState({ x: 48, y: 32 });
  const [inFarm, setInFarm] = useState(false);
  const playerMapRef = useRef({ x: 48, y: 32 });
  const playerMapRaf = useRef(0);

  const resetSessionUi = useCallback(() => {
    setGameReady(false);
    setFarm(createInitialFarm());
    setDdaMisses(0);
    setRpEarned(0);
    setBanner(null);
    setHint(null);
    setQuizPayload(null);
    setShopOpen(false);
    setShopPerformance(null);
    setInFarm(false);
    playerMapRef.current = { x: 48, y: 32 };
    setPlayerMap({ x: 48, y: 32 });
  }, []);

  const handleLogin = useCallback(
    (nextStudent) => {
      resetSessionUi();
      setStudent(nextStudent);
    },
    [resetSessionUi],
  );

  const handleLogout = useCallback(() => {
    logoutStudent();
    resetSessionUi();
    setStudent(null);
  }, [resetSessionUi]);

  const maxQuestions = farm.maxQuestions ?? DDA_CONFIG.maxQuestions;

  const progressPct = useMemo(() => {
    if (!maxQuestions) return 0;
    return Math.min(
      100,
      Math.round(((farm.questionsAnswered || 0) / maxQuestions) * 100),
    );
  }, [farm.questionsAnswered, maxQuestions]);

  const progressLabel = useMemo(
    () =>
      `Questions ${farm.questionsAnswered || 0} / ${maxQuestions} · Avg ${
        farm.avgResponseLabel ?? '—'
      } / target ${farm.timeTargetLabel ?? formatResponseTime(farm.timeTargetMs || DEFAULT_TIME_TARGET_MS)}`,
    [
      farm.questionsAnswered,
      farm.avgResponseLabel,
      farm.timeTargetLabel,
      farm.timeTargetMs,
      maxQuestions,
    ],
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

  const handlePlayerMapPos = useCallback((payload = {}) => {
    const x = Number(payload.playerMapX);
    const y = Number(payload.playerMapY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Map positions only emit from GameScene → treat as "in farm"
    setInFarm(true);
    playerMapRef.current = { x, y };
    if (playerMapRaf.current) return;
    playerMapRaf.current = window.requestAnimationFrame(() => {
      playerMapRaf.current = 0;
      setPlayerMap({ ...playerMapRef.current });
    });
  }, []);

  const handleFarmSceneActive = useCallback((payload = {}) => {
    setInFarm(payload.active === true);
  }, []);

  useEffect(
    () => () => {
      if (playerMapRaf.current) {
        window.cancelAnimationFrame(playerMapRaf.current);
      }
    },
    [],
  );

  const handleFarmState = useCallback((state) => {
    setFarm((prev) => ({
      ...prev,
      ...state,
      earnings: state.earnings ?? state.currentMoney ?? prev.earnings,
      target: state.timeTargetMs ?? state.target ?? prev.target,
      timeTargetMs: state.timeTargetMs ?? prev.timeTargetMs,
      playerTileX: state.playerTileX ?? prev.playerTileX,
      playerTileY: state.playerTileY ?? prev.playerTileY,
      playerMapX: state.playerMapX ?? prev.playerMapX,
      playerMapY: state.playerMapY ?? prev.playerMapY,
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
    if (
      Number.isFinite(Number(state.playerMapX)) &&
      Number.isFinite(Number(state.playerMapY))
    ) {
      handlePlayerMapPos(state);
    }
  }, [handlePlayerMapPos]);

  const handleTriggerQuiz = useCallback((payload) => {
    setQuizPayload(payload);
  }, []);

  const handleTargetReached = useCallback((payload) => {
    setFarm((prev) => ({
      ...prev,
      goalText:
        payload.goalText ||
        'Level complete! Unlock shop is open — then head to the Forest.',
      forestUnlocked: true,
      earnings: payload.earnings ?? payload.currentMoney ?? prev.earnings,
      target: payload.timeTargetMs ?? payload.target ?? prev.target,
      timeTargetMs: payload.timeTargetMs ?? prev.timeTargetMs,
      timeTargetLabel:
        payload.timeTargetLabel ?? prev.timeTargetLabel,
      beatTimeTarget: payload.beatTimeTarget ?? prev.beatTimeTarget,
      performanceBand: payload.performanceBand ?? prev.performanceBand,
      questionsAnswered:
        payload.questionsAnswered ?? prev.questionsAnswered,
    }));

    if (payload.openUnlockShop === true) {
      setShopPerformance({
        attemptScores: payload.attemptScores ?? [],
        avgResponseMs: payload.avgResponseMs ?? 0,
        performanceScore: payload.performanceScore,
        performanceBand: payload.performanceBand,
        questionsAnswered: payload.questionsAnswered,
      });
      setShopOpen(true);
      emitUnlockShopOpen();
      const beatNote =
        payload.beatTimeTarget === true
          ? ' You beat the time target!'
          : '';
      setBanner(
        `Level complete!${beatNote} Spend cash ($${
          payload.earnings ?? payload.currentMoney
        }) on unlocks — they stay on your farm.`,
      );
    } else {
      setBanner('Level complete! Proceed to the Forest Entrance!');
    }
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
        `Target avg ${detail.timeTargetLabel || formatResponseTime(detail.timeTargetMs)} from ${src} (${detail.masteryPercent}% mastery) · max ${detail.maxQuestions ?? DDA_CONFIG.maxQuestions} questions`,
      );
      window.setTimeout(() => setHint(null), 3600);
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
        detail.reason === 'not_plot'
          ? 'Stand on a marked PLANT bed (gold outline) to plant.'
          : detail.reason === 'tile_occupied'
            ? 'This plant bed is full — try another marked bed.'
            : detail.reason === 'target_reached'
              ? 'Level complete — open the Unlock Shop or head to the forest!'
              : 'Cannot plant here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'sell_blocked') {
      setHint('Run over ready crops to harvest, then sell with Q.');
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'unlock_purchased') {
      if (detail.earnings != null || detail.currentMoney != null) {
        setFarm((prev) => ({
          ...prev,
          earnings: detail.earnings ?? detail.currentMoney ?? prev.earnings,
        }));
      }
      setHint(`Bought unlock for $${detail.price}! It stays on your farm.`);
      window.setTimeout(() => setHint(null), 1800);
    }
  }, []);

  const handleQuizClose = useCallback(() => {
    setQuizPayload(null);
  }, []);

  const handleShopClose = useCallback(() => {
    setShopOpen(false);
    emitUnlockShopClose();
    setBanner('Forest gate is open — head to the entrance!');
  }, []);

  const handleSell = useCallback(() => {
    emitSellCrops();
  }, []);

  if (!student) {
    return <StudentLogin onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell forest-app">
      <header className="forest-header">
        <div>
          <h1>SCI_PATH — Farm &amp; Unlock</h1>
          <p>
            Target time from your previous level · finish {maxQuestions}{' '}
            questions · unlocks stay on the farm
          </p>
        </div>
        <div className="forest-stats">
          <span className="forest-chip student-chip">
            {student.displayName}
          </span>
          <button
            type="button"
            className="student-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
          <span className="forest-chip">
            {gameReady ? 'Playing' : 'Loading…'}
          </span>
          <span>Mastery: {bandLabel}</span>
          <span>
            Target: {farm.timeTargetLabel ?? formatResponseTime(farm.timeTargetMs)}
          </span>
          <span>Avg time: {farm.avgResponseLabel ?? '—'}</span>
          <span>
            Q: {farm.questionsAnswered || 0}/{maxQuestions}
          </span>
          <span>Cash: ${farm.earnings}</span>
          <span>RP: {rpEarned}</span>
          <span>Misses: {ddaMisses}</span>
          <span>Bag: {bagCount}</span>
        </div>
      </header>

      <div className="forest-play-layout">
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
            key={student.id}
            onReady={handleReady}
            onFarmState={handleFarmState}
            onPlayerMapPos={handlePlayerMapPos}
            onFarmSceneActive={handleFarmSceneActive}
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
                shopOpen ||
                farm.forestUnlocked
              }
            >
              Plant (E) — Quiz first
            </button>
            <button
              type="button"
              onClick={handleSell}
              disabled={
                !gameReady || bagCount < 1 || Boolean(quizPayload) || shopOpen
              }
            >
              Sell Inventory (Q) — ${farm.cropValue}/ea
            </button>
          </div>

          {hint && <div className="farm-hint">{hint}</div>}

          {banner && !shopOpen && (
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

          <UnlockShopModal
            open={shopOpen}
            cash={farm.earnings}
            performance={shopPerformance}
            onClose={handleShopClose}
          />
        </div>

        {inFarm && (
          <FarmMapPanel
            playerMapX={playerMap.x}
            playerMapY={playerMap.y}
          />
        )}
      </div>

      <p className="forest-help">
        Arrow keys move · use the Farm Map to find gold plant beds · stand on a
        marked <kbd>PLANT</kbd> bed · <kbd>E</kbd> quiz-plant · run over crops to
        harvest · <kbd>Q</kbd> sell · Finish {maxQuestions} questions. Unharvested
        crops clear when the level ends.
      </p>
    </div>
  );
}

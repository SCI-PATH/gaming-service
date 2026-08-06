import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForestRPGCanvas, {
  emitSellCrops,
  emitPlantCrop,
  emitUnlockShopOpen,
  emitUnlockShopClose,
  emitStartFarmLevel,
  emitHouseInteriorDone,
  emitHouseInteriorCancel,
  emitHouseStepCorrect,
  emitHouseStepWrong,
  emitEggCollectDone,
  emitEggCollectCancel,
  emitEggProtectCorrect,
  emitEggProtectWrong,
} from './components/ForestRPGCanvas.jsx';
import ScienceQuizModal from './components/ScienceQuizModal.jsx';
import UnlockShopModal from './components/UnlockShopModal.jsx';
import LevelQuestScroll from './components/LevelQuestScroll.jsx';
import GameplayPerformancePanel from './components/GameplayPerformancePanel.jsx';
import HouseInteriorModal from './components/HouseInteriorModal.jsx';
import EggCollectModal from './components/EggCollectModal.jsx';
import StudentLogin from './components/StudentLogin.jsx';
import FarmMapPanel from './components/FarmMapPanel.jsx';
import {
  AvatarAssistantModal,
  useBehavioralTelemetry,
} from './avatar/index.js';
import { getFarmLevel } from './data/farmLevels.js';
import { buildActiveChallenges } from './data/challengeRuntime.js';
import { DDA_CONFIG, formatResponseTime } from './data/dda.js';
import {
  GAMEPLAY_BAND_LABELS,
  getGameplaySettings,
} from './data/gameplayPerformance.js';
import {
  ensureFreshStudentProgress,
  getCurrentStudent,
  logoutStudent,
} from './data/mockStudents.js';

// One-time wipe when progress generation bumps — all students start fresh
ensureFreshStudentProgress();

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
    cropId: DEFAULT_LEVEL.cropId,
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
    carriedCount: 0,
    gameplayBand: 'average',
    gameplayLabel: GAMEPLAY_BAND_LABELS.average,
    retries: 0,
    avgAnswerTimeSec: null,
    levelElapsedSec: 0,
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
  const [challenges, setChallenges] = useState([]);
  const [questScrollOpen, setQuestScrollOpen] = useState(false);
  const [houseInterior, setHouseInterior] = useState(null);
  const [eggCollect, setEggCollect] = useState(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarTrigger, setAvatarTrigger] = useState(null);
  const [gameplay, setGameplay] = useState(() => ({
    band: 'average',
    label: GAMEPLAY_BAND_LABELS.average,
    settings: getGameplaySettings('average'),
    previousLevel: null,
    appliedBonus: null,
    pendingBonus: null,
    nextGameplaySettings: getGameplaySettings('average'),
    live: { retries: 0, avgAnswerTimeSec: null, levelElapsedSec: 0 },
  }));
  const playerMapRef = useRef({ x: 48, y: 32 });
  const playerMapRaf = useRef(0);
  /** Level id for which the quest scroll already auto-opened */
  const questScrollLevelRef = useRef(null);

  const quizKey =
    quizPayload?.questionData?.id ||
    quizPayload?.question?.id ||
    quizPayload?.mode ||
    null;

  const {
    trigger: telemTrigger,
    session: telemetrySession,
    metrics: behavioralMetrics,
    misconceptions,
    learningPrefs,
    activeMindMap,
    clearTrigger: clearAvatarTrigger,
    resetSession: resetAvatarTelemetry,
    recordAnswer: recordAvatarAnswer,
    requestHelp: openAvatarHelp,
    updateLearningPreferences,
    showMindMapForTopic,
  } = useBehavioralTelemetry({
    // Keep telemetry hot whenever a student is logged in (quizzes can fire
    // before the farm “active” flag settles; old gate silently dropped all misses).
    enabled: Boolean(student),
    quizOpen: Boolean(quizPayload),
    quizKey,
    levelId: farm.levelId,
    levelElapsedSec: gameplay.live?.levelElapsedSec || 0,
    externalRetries: gameplay.live?.retries ?? farm.retries ?? 0,
  });

  useEffect(() => {
    if (!telemTrigger) return;
    setAvatarTrigger(telemTrigger);
    setAvatarOpen(true);
  }, [telemTrigger]);

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
    setChallenges([]);
    setQuestScrollOpen(false);
    setHouseInterior(null);
    setEggCollect(null);
    setAvatarOpen(false);
    setAvatarTrigger(null);
    resetAvatarTelemetry();
    setGameplay({
      band: 'average',
      label: GAMEPLAY_BAND_LABELS.average,
      settings: getGameplaySettings('average'),
      previousLevel: null,
      appliedBonus: null,
      pendingBonus: null,
      nextGameplaySettings: getGameplaySettings('average'),
      live: { retries: 0, avgAnswerTimeSec: null, levelElapsedSec: 0 },
    });
    playerMapRef.current = { x: 48, y: 32 };
    setPlayerMap({ x: 48, y: 32 });
    questScrollLevelRef.current = null;
  }, [resetAvatarTelemetry]);

  const handleAvatarClose = useCallback(() => {
    setAvatarOpen(false);
    setAvatarTrigger(null);
    clearAvatarTrigger();
  }, [clearAvatarTrigger]);

  const handleQuizAnswerAttempt = useCallback(
    (attempt = {}) => {
      recordAvatarAnswer({
        isCorrect: Boolean(attempt.isCorrect),
        selectedText: attempt.selectedText || null,
        questionData: attempt.questionData || null,
      });
    },
    [recordAvatarAnswer],
  );

  const handleLogin = useCallback(
    (nextStudent, opts = {}) => {
      resetSessionUi();
      setStudent(nextStudent);
      if (opts.testMode === 'buy_house') {
        setBanner(
          'Shop test: buy Farm House and/or chicks with cash, close shop → next level unlocks their challenges.',
        );
      } else if (
        opts.testMode === 'house_challenge' ||
        (typeof opts.testMode === 'string' &&
          (opts.testMode.startsWith('house_') ||
            opts.testMode.startsWith('egg_')))
      ) {
        setBanner(
          'House + eggs + calf test: click Farm House, Hen House, or the Calf Pen on the farm.',
        );
      }
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
  const carriedCount = farm.carriedCount ?? 0;

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

  const handleChallengesState = useCallback((payload = {}) => {
    const list = Array.isArray(payload.challenges) ? payload.challenges : [];
    setChallenges(list);
  }, []);

  const refreshChallenges = useCallback((levelId) => {
    const id = Math.max(1, Number(levelId) || 1);
    try {
      setChallenges(buildActiveChallenges(id));
    } catch {
      setChallenges([]);
    }
  }, []);

  // Rebuild challenge list whenever the farm level changes (don't rely only on Phaser emit)
  useEffect(() => {
    if (!inFarm || shopOpen) return;
    refreshChallenges(farm.levelId);
  }, [inFarm, farm.levelId, shopOpen, refreshChallenges]);

  // Auto-unfurl quest scroll whenever the student enters a new farm level
  // (no button required). Skips if this level's scroll was already shown.
  useEffect(() => {
    if (
      !inFarm ||
      shopOpen ||
      quizPayload ||
      houseInterior ||
      eggCollect
    ) {
      return;
    }
    const level = Math.max(1, Number(farm.levelId) || 1);
    if (questScrollLevelRef.current === level) return;
    questScrollLevelRef.current = level;
    setQuestScrollOpen(true);
    setBanner(null);
  }, [
    farm.levelId,
    inFarm,
    shopOpen,
    quizPayload,
    houseInterior,
    eggCollect,
  ]);

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
    if (Array.isArray(state.challenges)) {
      setChallenges(state.challenges);
    }
    if (
      Number.isFinite(Number(state.playerMapX)) &&
      Number.isFinite(Number(state.playerMapY))
    ) {
      handlePlayerMapPos(state);
    }
    if (state.gameplayBand || state.retries != null || state.gameplaySettings) {
      setGameplay((prev) => ({
        ...prev,
        band: state.gameplayBand ?? prev.band,
        label: state.gameplayLabel ?? prev.label,
        settings: state.gameplaySettings ?? prev.settings,
        previousLevel: state.gameplayPreviousLevel ?? prev.previousLevel,
        appliedBonus: state.gameplayAppliedBonus ?? prev.appliedBonus,
        nextGameplaySettings:
          state.nextGameplaySettings ?? prev.nextGameplaySettings,
        live: {
          retries: state.retries ?? prev.live?.retries ?? 0,
          avgAnswerTimeSec:
            state.avgAnswerTimeSec ?? prev.live?.avgAnswerTimeSec ?? null,
          levelElapsedSec:
            state.levelElapsedSec ?? prev.live?.levelElapsedSec ?? 0,
        },
      }));
    }
  }, [handlePlayerMapPos]);

  const handleTriggerQuiz = useCallback((payload) => {
    setQuestScrollOpen(false);
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
      const bonus = payload.pendingGameplayBonus;
      const bonusNote =
        bonus?.totalBonus > 0
          ? ` Next level bonus: +$${bonus.totalBonus} (${bonus.gradeLabel}${
              bonus.improvementBonusPct
                ? ` + improvement`
                : ''
            }).`
          : '';
      setBanner(
        `Level complete!${beatNote}${bonusNote} Spend cash ($${
          payload.earnings ?? payload.currentMoney
        }) on unlocks — they stay on your farm.`,
      );
    } else {
      setBanner('Level complete! Proceed to the Forest Entrance!');
    }

    if (payload.gameplayBand || payload.pendingGameplayBonus) {
      setGameplay((prev) => ({
        ...prev,
        band: payload.gameplayBand ?? prev.band,
        label: payload.gameplayLabel ?? prev.label,
        pendingBonus: payload.pendingGameplayBonus ?? prev.pendingBonus,
        nextGameplaySettings:
          payload.nextGameplaySettings ?? prev.nextGameplaySettings,
        live: {
          retries: payload.retries ?? prev.live?.retries,
          avgAnswerTimeSec:
            payload.avgAnswerTimeSec ?? prev.live?.avgAnswerTimeSec,
          levelElapsedSec:
            payload.levelCompletionTimeSec ?? prev.live?.levelElapsedSec,
        },
      }));
    }
  }, []);

  const handleInteraction = useCallback((detail) => {
    if (detail?.type === 'plant_success' && detail.rp) {
      setRpEarned((n) => n + detail.rp);
      setHint('Correct plant answer! Harvest crops — they stack on your back.');
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'load_success') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      setHint(
        `Unloaded ${detail.unloaded ?? ''} crops into the cart! Sell with Q.`,
      );
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'load_fail' || detail?.type === 'plant_fail') {
      setDdaMisses((n) => n + 1);
    }
    if (detail?.type === 'harvest') {
      setHint(
        `Carrying ${detail.carriedCount ?? ''} — take them to the blue LOAD dock.`,
      );
      window.setTimeout(() => setHint(null), 2000);
    }
    if (detail?.type === 'mastery_goal_set') {
      setHint(
        `Harvest target: ${detail.harvestTarget} crops (${detail.masteryPercent}% mastery) · avg ${detail.timeTargetLabel || formatResponseTime(detail.timeTargetMs)}`,
      );
      window.setTimeout(() => setHint(null), 3600);
    }
    if (detail?.type === 'gameplay_adapt_set') {
      setGameplay((prev) => ({
        ...prev,
        band: detail.gameplayBand ?? prev.band,
        label: detail.gameplayLabel ?? prev.label,
        settings: detail.settings ?? prev.settings,
        previousLevel: detail.previousLevel ?? prev.previousLevel,
        appliedBonus: detail.appliedBonus ?? prev.appliedBonus,
        nextGameplaySettings:
          detail.nextGameplaySettings ?? prev.nextGameplaySettings,
      }));
      setHint(
        `Gameplay adapt: ${detail.gameplayLabel || detail.gameplayBand}`,
      );
      window.setTimeout(() => setHint(null), 3200);
    }
    if (detail?.type === 'gameplay_bonus_applied') {
      setGameplay((prev) => ({
        ...prev,
        appliedBonus: detail,
      }));
      setHint(
        `Previous-level bonus +$${detail.totalBonus} (perf $${detail.performanceCash} + improve $${detail.improvementCash})`,
      );
      window.setTimeout(() => setHint(null), 4000);
    }
    if (detail?.type === 'gameplay_level_complete') {
      setGameplay((prev) => ({
        ...prev,
        band: detail.record?.classification ?? prev.band,
        label: detail.record?.classificationLabel ?? prev.label,
        pendingBonus: detail.pendingBonus ?? prev.pendingBonus,
        nextGameplaySettings:
          detail.record?.nextGameplaySettings ?? prev.nextGameplaySettings,
      }));
    }
    if (detail?.type === 'quiz_attempt') {
      setHint(
        `Answered in ${detail.responseLabel} · score ${detail.attemptScore}`,
      );
      window.setTimeout(() => setHint(null), 2000);
      setGameplay((prev) => ({
        ...prev,
        live: {
          ...prev.live,
          retries: detail.retries ?? prev.live?.retries,
          avgAnswerTimeSec:
            detail.avgAnswerTimeSec ?? prev.live?.avgAnswerTimeSec,
        },
      }));
    }
    if (detail?.type === 'sell') {
      setHint(`Sold for $${detail.coinsEarned ?? detail.gained}!`);
      window.setTimeout(() => setHint(null), 1800);
    }
    if (detail?.type === 'plant_blocked') {
      const msg =
        detail.reason === 'not_plot'
          ? 'Stand on a marked PLANT bed (gold) to plant.'
          : detail.reason === 'tile_occupied'
            ? 'This plant bed is full — try another marked bed.'
            : detail.reason === 'target_reached'
              ? 'Level complete — open the Unlock Shop or head to the forest!'
              : 'Cannot plant here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'load_blocked') {
      const msg =
        detail.reason === 'empty_carry'
          ? 'Harvest crops onto your back first, then come to LOAD.'
          : detail.reason === 'not_dock'
            ? 'Stand on the blue LOAD dock to unload.'
            : 'Cannot unload here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'sell_blocked') {
      setHint('Unload crops into the cart at LOAD first, then sell with Q.');
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'unlock_purchased') {
      if (detail.earnings != null || detail.currentMoney != null) {
        setFarm((prev) => ({
          ...prev,
          earnings: detail.earnings ?? detail.currentMoney ?? prev.earnings,
        }));
      }
      setHint(`Bought unlock for $${detail.price}! Challenges unlock next level.`);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'challenge_complete') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      if (detail.earnings != null) {
        setFarm((prev) => ({
          ...prev,
          earnings: detail.earnings ?? prev.earnings,
        }));
      }
      setHint(
        `${detail.itemId ? detail.title : 'Challenge'} complete!${
          detail.rewardCash ? ` +$${detail.rewardCash}` : ''
        }`,
      );
      window.setTimeout(() => setHint(null), 2600);
      refreshChallenges(farm.levelId);
    }
    if (detail?.type === 'challenge_step') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      setHint(
        detail.placeLabel ||
          `${detail.title}: item placed in the house.`,
      );
      window.setTimeout(() => setHint(null), 2200);
      refreshChallenges(farm.levelId);
    }
    if (detail?.type === 'calf_feed') {
      if (detail.correct) {
        setHint(
          detail.fillKind === 'water'
            ? 'Water poured into the pen bucket!'
            : 'Food added to the pen bucket!',
        );
      } else {
        setHint('Wrong answer — a calf is crying!');
      }
      window.setTimeout(() => setHint(null), 1800);
    }
    if (detail?.type === 'challenge_fail') {
      setDdaMisses((n) => n + 1);
    }
    if (detail?.type === 'challenge_blocked') {
      setHint(
        detail.hint ||
          'Click the Farm House or Hen House on the farm when a challenge is open.',
      );
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'challenge_opening') {
      setHint(detail.hint || 'Opening…');
      window.setTimeout(() => setHint(null), 1600);
    }
  }, [farm.levelId, refreshChallenges]);

  const handleQuizClose = useCallback(() => {
    setQuizPayload(null);
  }, []);

  const handleShopClose = useCallback(() => {
    const nextLevelId = Math.max(1, (farm.levelId || 1) + 1);
    setShopOpen(false);
    emitUnlockShopClose();
    setBanner(null);
    // Point React at the next level immediately so the quest scroll can unfurl
    setFarm((prev) => ({ ...prev, levelId: nextLevelId }));
    refreshChallenges(nextLevelId);
    questScrollLevelRef.current = null;
    setQuestScrollOpen(true);
    window.setTimeout(() => {
      emitStartFarmLevel({ levelId: nextLevelId });
    }, 50);
  }, [farm.levelId, refreshChallenges]);

  const handleOpenHouseInterior = useCallback((payload = {}) => {
    setQuestScrollOpen(false);
    setHouseInterior(payload);
  }, []);

  const handleOpenEggCollect = useCallback((payload = {}) => {
    setQuestScrollOpen(false);
    setEggCollect(payload);
  }, []);

  const handleHouseInteriorComplete = useCallback((payload) => {
    emitHouseInteriorDone(payload);
    // Keep modal open briefly so student sees the furnished room; close on Leave
    setHint('House challenge complete — look at your furnished room!');
    window.setTimeout(() => setHint(null), 2800);
    refreshChallenges(farm.levelId);
  }, [farm.levelId, refreshChallenges]);

  const handleHouseInteriorClose = useCallback(() => {
    setHouseInterior(null);
    emitHouseInteriorCancel();
  }, []);

  const handleHouseStepCorrect = useCallback((payload) => {
    emitHouseStepCorrect(payload);
    if (payload.placeLabel) {
      setHint(payload.placeLabel);
      window.setTimeout(() => setHint(null), 1800);
    }
  }, []);

  const handleHouseStepWrong = useCallback((payload) => {
    emitHouseStepWrong(payload);
  }, []);

  const handleEggCollectComplete = useCallback((payload) => {
    emitEggCollectDone(payload);
    setHint(
      `Eggs collected (${payload?.collected || 0}) — bucket secured!`,
    );
    window.setTimeout(() => setHint(null), 2800);
    refreshChallenges(farm.levelId);
  }, [farm.levelId, refreshChallenges]);

  const handleEggCollectClose = useCallback(() => {
    setEggCollect(null);
    emitEggCollectCancel();
  }, []);

  const handleEggProtectCorrect = useCallback((payload) => {
    emitEggProtectCorrect(payload);
    setHint('Eggs protected — more time!');
    window.setTimeout(() => setHint(null), 1600);
  }, []);

  const handleEggProtectWrong = useCallback((payload) => {
    emitEggProtectWrong(payload);
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
            Gameplay:{' '}
            {gameplay.label || GAMEPLAY_BAND_LABELS[gameplay.band] || 'AVERAGE'}
          </span>
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
          <span>Retries: {gameplay.live?.retries ?? farm.retries ?? 0}</span>
          <span>On back: {carriedCount}</span>
          <span>Cart: {bagCount}</span>
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
            onChallengesState={handleChallengesState}
            onOpenHouseInterior={handleOpenHouseInterior}
            onOpenEggCollect={handleOpenEggCollect}
          />

          <div className="farm-controls">
            <button
              type="button"
              className="avatar-help-btn"
              onClick={openAvatarHelp}
              disabled={
                !gameReady ||
                Boolean(shopOpen) ||
                Boolean(houseInterior) ||
                Boolean(eggCollect) ||
                avatarOpen
              }
            >
              Ask mentor
            </button>
            <button
              type="button"
              className="quest-scroll-reopen"
              onClick={() => setQuestScrollOpen(true)}
              disabled={
                !gameReady ||
                Boolean(quizPayload) ||
                shopOpen ||
                Boolean(houseInterior) ||
                Boolean(eggCollect)
              }
            >
              Quest scroll
              {challenges.some((c) => !c.done)
                ? ` (${challenges.filter((c) => !c.done).length} open)`
                : ''}
            </button>
            <button
              type="button"
              onClick={() => emitPlantCrop()}
              disabled={
                !gameReady ||
                Boolean(quizPayload) ||
                shopOpen ||
                Boolean(houseInterior) ||
                Boolean(eggCollect) ||
                farm.forestUnlocked
              }
            >
            Plant (E) — at gold bed
          </button>
          <button
            type="button"
            onClick={handleSell}
            disabled={
              !gameReady ||
              bagCount < 1 ||
              Boolean(quizPayload) ||
              shopOpen ||
              Boolean(houseInterior) ||
              Boolean(eggCollect)
            }
          >
            Sell Cart (Q) — ${farm.cropValue}/ea
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
              mode={quizPayload.mode || quizPayload.challenge || 'plant'}
              carriedCount={quizPayload.carriedCount ?? carriedCount}
              gameplayAssist={
                quizPayload.gameplayAssist || {
                  answerTimerMs: quizPayload.answerTimerMs,
                  hintLevel: quizPayload.hintLevel,
                  maxRetriesPerQuestion: quizPayload.maxRetriesPerQuestion,
                }
              }
              onAnswerAttempt={handleQuizAnswerAttempt}
              onClose={handleQuizClose}
            />
          )}

          <UnlockShopModal
            open={shopOpen}
            cash={farm.earnings}
            performance={shopPerformance}
            onClose={handleShopClose}
          />

          <LevelQuestScroll
            open={
              questScrollOpen &&
              !shopOpen &&
              !quizPayload &&
              !houseInterior &&
              !eggCollect
            }
            levelId={farm.levelId}
            challenges={challenges}
            goalText={farm.goalText}
            harvestTarget={farm.harvestTarget ?? 24}
            cropsHarvestedTotal={farm.cropsHarvestedTotal ?? 0}
            cropName={farm.cropName || 'crops'}
            onClose={() => setQuestScrollOpen(false)}
          />
        </div>

        {inFarm && (
          <div className="farm-side-panels">
            <FarmMapPanel
              playerMapX={playerMap.x}
              playerMapY={playerMap.y}
              harvestTarget={farm.harvestTarget ?? 24}
              cropsHarvestedTotal={farm.cropsHarvestedTotal ?? 0}
              performanceBand={farm.performanceBand}
              cropName={farm.cropName || 'crops'}
            />
            <GameplayPerformancePanel
              visible={!shopOpen && !houseInterior && !eggCollect}
              gameplay={gameplay}
            />
          </div>
        )}
      </div>

      <HouseInteriorModal
        open={Boolean(houseInterior)}
        stageId={houseInterior?.stageId || 'clean_maintain'}
        stageTitle={houseInterior?.title || 'Farm House'}
        initialPlaced={houseInterior?.placed || []}
        luxuryBand={
          houseInterior?.luxuryBand ||
          houseInterior?.gameplayBand ||
          gameplay.band ||
          'average'
        }
        onStepCorrect={handleHouseStepCorrect}
        onStepWrong={handleHouseStepWrong}
        onComplete={handleHouseInteriorComplete}
        onClose={handleHouseInteriorClose}
      />

      <EggCollectModal
        open={Boolean(eggCollect)}
        stageTitle={eggCollect?.title || 'Collect Eggs'}
        gameplayBand={
          eggCollect?.gameplayBand || gameplay.band || 'average'
        }
        onProtectCorrect={handleEggProtectCorrect}
        onProtectWrong={handleEggProtectWrong}
        onComplete={handleEggCollectComplete}
        onClose={handleEggCollectClose}
      />

      <AvatarAssistantModal
        open={avatarOpen}
        student={student}
        farm={farm}
        gameplay={gameplay}
        quiz={quizPayload}
        metrics={avatarTrigger?.metrics || behavioralMetrics}
        misconceptions={misconceptions}
        learningPrefs={learningPrefs}
        scenario={
          avatarTrigger?.scenario || telemetrySession.scenario || null
        }
        offerMindMap={Boolean(
          avatarTrigger?.offerMindMap ||
            avatarTrigger?.reason === 'concept_misconceptions' ||
            avatarTrigger?.reason === 'repeated_incorrect',
        )}
        mindMap={
          avatarTrigger?.offerMindMap ||
          avatarTrigger?.reason === 'concept_misconceptions' ||
          avatarTrigger?.reason === 'repeated_incorrect'
            ? avatarTrigger?.mindMap || activeMindMap
            : avatarTrigger?.mindMap || null
        }
        interventionMode={
          avatarTrigger?.intervention_mode ||
          telemetrySession.lastInterventionMode
        }
        perceivedState={avatarTrigger?.perceived_state}
        onLearningMessage={updateLearningPreferences}
        onShowMindMap={() => showMindMapForTopic()}
        telemetry={{
          ...telemetrySession,
          metrics: avatarTrigger?.metrics || behavioralMetrics,
          mindMap:
            avatarTrigger?.mindMap ||
            (avatarTrigger?.offerMindMap ? activeMindMap : null),
          learningPrefs,
          scenario: avatarTrigger?.scenario,
          offerMindMap: avatarTrigger?.offerMindMap,
          consecutiveFails:
            avatarTrigger?.consecutiveFails ?? telemetrySession.consecutiveFails,
          frustrationScore:
            avatarTrigger?.frustrationScore ?? telemetrySession.frustrationScore,
          timeOnQuestionMs:
            avatarTrigger?.timeOnQuestionMs ?? telemetrySession.timeOnQuestionMs,
          lastWrongAnswer:
            avatarTrigger?.lastWrongAnswer ?? telemetrySession.lastWrongAnswer,
          lastTriggerReason:
            avatarTrigger?.reason ?? telemetrySession.lastTriggerReason,
          lastInterventionMode:
            avatarTrigger?.intervention_mode ||
            telemetrySession.lastInterventionMode,
          perceived_state: avatarTrigger?.perceived_state,
        }}
        triggerReason={
          avatarTrigger?.reason || telemetrySession.lastTriggerReason
        }
        onClose={handleAvatarClose}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForestRPGCanvas, {
  emitUnlockShopOpen,
  emitUnlockShopClose,
  emitUiInputLock,
  emitStartFarmLevel,
  emitSyncStudentState,
  emitReturnToMenu,
} from './components/ForestRPGCanvas.jsx';
import { ForestGameBridge, FARM_EVENTS } from './components/ForestGameBridge.js';
import ScienceQuizModal from './components/ScienceQuizModal.jsx';
import UnlockShopModal from './components/UnlockShopModal.jsx';
import MotivationalVideoModal from './components/MotivationalVideoModal.jsx';
import LevelQuestScroll from './components/LevelQuestScroll.jsx';
import StudentLogin from './components/StudentLogin.jsx';
import GameLobbyOverlay from './components/GameLobbyOverlay.jsx';
import GameOverOverlay from './components/GameOverOverlay.jsx';
import GameShellHeader from './components/GameShellHeader.jsx';
import GlobalLeaderboardModal from './components/GlobalLeaderboardModal.jsx';
import { GameCanvasLoading, GameProgressButton } from './components/GameShellControls.jsx';
import {
  computeArenaScore,
  submitLeaderboardScore,
} from './data/leaderboardApi.js';
import FarmMapPanel from './components/FarmMapPanel.jsx';
import ResearchDashboard from './components/ResearchDashboard.jsx';
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
import { PERFORMANCE_CATEGORIES, PERFORMANCE_LABELS } from './data/performanceCategories.js';
import {
  ensureFreshStudentProgress,
  getCurrentStudent,
  logoutStudent,
} from './data/mockStudents.js';
import { resolvePlatformLaunch } from './data/platformLaunch.js';
import { GAME_PLATFORM } from './data/gameBrand.js';
import {
  syncStudentLogin,
  syncStudentLogout,
  syncFrustration,
  syncGameplayEvent,
} from './data/engagementSync.js';
import {
  bootstrapStudentProgress,
  resolveLobbyProgress,
  syncBootstrapStudentProgress,
} from './data/aptitudeProgress.js';

// One-time wipe when progress generation bumps — all students start fresh
ensureFreshStudentProgress();

const platformLaunchRef =
  typeof window !== 'undefined' ? resolvePlatformLaunch() : null;

const DEFAULT_LEVEL = getFarmLevel(1);
const DEFAULT_TIME_TARGET_MS = DDA_CONFIG.midTargetMs;

function isStorylineChallenge(c) {
  return (
    c?.source === 'house' ||
    c?.source === 'storyline' ||
    String(c?.itemId || '').startsWith('house_') ||
    String(c?.itemId || '').startsWith('storyline_')
  );
}

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
    goalText: `Medium performance: finish ${DDA_CONFIG.maxQuestions} questions · target avg ${formatResponseTime(DEFAULT_TIME_TARGET_MS)}`,
    forestUnlocked: false,
    performanceBand: PERFORMANCE_CATEGORIES.MEDIUM,
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
    gameplayBand: PERFORMANCE_CATEGORIES.MEDIUM,
    gameplayLabel: PERFORMANCE_LABELS.medium,
    shopCustomersLeft: 0,
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
  const [student, setStudent] = useState(
    () => platformLaunchRef?.student || getCurrentStudent(),
  );

  useEffect(() => {
    if (platformLaunchRef?.student?.id) {
      syncStudentLogin(platformLaunchRef.student, {
        sessionId: platformLaunchRef.sessionId || undefined,
      });
      return;
    }
    const existing = getCurrentStudent();
    if (existing?.id) syncStudentLogin(existing);
  }, []);

  const [gameReady, setGameReady] = useState(false);
  const [farm, setFarm] = useState(() => {
    const initialStudent = platformLaunchRef?.student || getCurrentStudent();
    const boot = syncBootstrapStudentProgress(initialStudent);
    return boot.farmPatch
      ? { ...createInitialFarm(), ...boot.farmPatch }
      : createInitialFarm();
  });
  const [ddaMisses, setDdaMisses] = useState(0);
  const [rpEarned, setRpEarned] = useState(0);
  const [banner, setBanner] = useState(null);
  const [hint, setHint] = useState(null);
  const [quizPayload, setQuizPayload] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopPerformance, setShopPerformance] = useState(null);
  const [motivationOpen, setMotivationOpen] = useState(false);
  const [motivationContext, setMotivationContext] = useState(null);
  const [playerMap, setPlayerMap] = useState({ x: 48, y: 32 });
  const [inFarm, setInFarm] = useState(false);
  const [gamePhase, setGamePhase] = useState('menu');
  const [gameOverPayload, setGameOverPayload] = useState(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [lobbyProgress, setLobbyProgress] = useState(() => {
    const initialStudent = platformLaunchRef?.student || getCurrentStudent();
    return syncBootstrapStudentProgress(initialStudent).lobby;
  });
  const [challenges, setChallenges] = useState([]);
  const [questScrollOpen, setQuestScrollOpen] = useState(false);
  /** 'farm' | 'dashboard' — research console vs play view */
  const [appView, setAppView] = useState('farm');
  const correctStreakRef = useRef(0);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarTrigger, setAvatarTrigger] = useState(null);
  const [gameplay, setGameplay] = useState(() => ({
    band: PERFORMANCE_CATEGORIES.MEDIUM,
    label: PERFORMANCE_LABELS.medium,
    settings: getGameplaySettings(PERFORMANCE_CATEGORIES.MEDIUM),
    previousLevel: null,
    appliedBonus: null,
    pendingBonus: null,
    nextGameplaySettings: getGameplaySettings(PERFORMANCE_CATEGORIES.MEDIUM),
    live: { retries: 0, avgAnswerTimeSec: null, levelElapsedSec: 0 },
  }));
  const playerMapRef = useRef({ x: 48, y: 32 });
  const playerMapRaf = useRef(0);
  /** Level id for which the quest scroll already auto-opened */
  const questScrollLevelRef = useRef(null);
  const storylineChallengesRef = useRef([]);

  useEffect(() => {
    if (!student?.id) {
      setLobbyProgress(resolveLobbyProgress(null));
      return undefined;
    }

    let cancelled = false;

    void bootstrapStudentProgress(student).then(({ lobby, farmPatch }) => {
      if (cancelled) return;
      setLobbyProgress(lobby);
      if (farmPatch) {
        setFarm((prev) => ({
          ...prev,
          ...farmPatch,
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [student?.id]);

  useEffect(() => {
    if (!student?.id) return undefined;

    const refreshProgress = () => {
      void bootstrapStudentProgress(student).then(({ lobby, farmPatch }) => {
        setLobbyProgress(lobby);
        if (farmPatch) {
          setFarm((prev) => ({
            ...prev,
            ...farmPatch,
          }));
        }
      });
    };

    window.addEventListener('focus', refreshProgress);
    return () => window.removeEventListener('focus', refreshProgress);
  }, [student?.id]);

  useEffect(() => {
    ForestGameBridge.emit(FARM_EVENTS.LOBBY_GATE, { canStart: true });
  }, [lobbyProgress?.phase]);

  const quizKey =
    quizPayload?.questionData?.id ||
    quizPayload?.question?.id ||
    quizPayload?.mode ||
    null;

  const quizMode = quizPayload?.mode || quizPayload?.challenge || 'plant';

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
    recordHintUsed: recordAvatarHint,
    recordSelectionSwitch: recordAvatarOptionSwitch,
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
    gameplayBand: gameplay.band || farm.performanceBand || null,
    mastery: farm.mastery,
    masteryBand: farm.performanceBand,
    masterySource: farm.masterySource,
    enemyHits: farm.enemyHits || 0,
    enemyDeaths: farm.enemyDeaths || 0,
    levelRestarts: farm.levelRestarts || 0,
    shopCustomersLeft: farm.shopCustomersLeft || 0,
    previousAvgAnswerTimeSec:
      gameplay.previousLevel?.avgAnswerTimeSec ?? farm.previousAvgAnswerTimeSec ?? 0,
  });

  useEffect(() => {
    if (!telemTrigger) return;
    setAvatarTrigger(telemTrigger);
    setAvatarOpen(true);
  }, [telemTrigger]);

  useEffect(() => {
    emitSyncStudentState({
      frustrationScore: telemetrySession.frustrationScore || 0,
      frustrationLevel: telemetrySession.frustrationLevel || 'low',
    });
  }, [telemetrySession.frustrationScore, telemetrySession.frustrationLevel]);

  // Farm shop money/state sync (no popup — sales happen in Phaser)
  useEffect(() => {
    const onState = (payload = {}) => {
      if (payload.currentMoney != null || payload.earnings != null) {
        setFarm((f) => ({
          ...f,
          earnings: payload.earnings ?? payload.currentMoney ?? f.earnings,
          currentMoney:
            payload.currentMoney ?? payload.earnings ?? f.currentMoney,
          harvestedItemsCount:
            payload.harvestedItemsCount ?? f.harvestedItemsCount,
        }));
      }
    };
    const onTelemetry = (ev = {}) => {
      if (!ev?.type) return;
      syncGameplayEvent(ev.type, {
        ...ev,
        levelNumber: farm.levelId,
      }, student);
    };
    ForestGameBridge.on(FARM_EVENTS.FARM_SHOP_STATE, onState);
    ForestGameBridge.on(FARM_EVENTS.FARM_SHOP_TELEMETRY, onTelemetry);
    return () => {
      ForestGameBridge.off(FARM_EVENTS.FARM_SHOP_STATE, onState);
      ForestGameBridge.off(FARM_EVENTS.FARM_SHOP_TELEMETRY, onTelemetry);
    };
  }, [farm.levelId, student]);

  // Keep unlock-shop prices live with the latest frustration score
  useEffect(() => {
    setShopPerformance((prev) => {
      if (!prev) return prev;
      const nextScore = telemetrySession.frustrationScore || 0;
      const nextLevel = telemetrySession.frustrationLevel || 'low';
      if (
        prev.frustrationScore === nextScore &&
        prev.frustrationLevel === nextLevel
      ) {
        return prev;
      }
      return {
        ...prev,
        frustrationScore: nextScore,
        frustrationLevel: nextLevel,
      };
    });
  }, [telemetrySession.frustrationScore, telemetrySession.frustrationLevel]);

  // Mirror frustration into Neon (throttled)
  useEffect(() => {
    if (!student?.id) return;
    const score = Number(telemetrySession.frustrationScore);
    if (!Number.isFinite(score)) return;
    const handle = window.setTimeout(() => {
      syncFrustration(
        {
          frustrationScore: score,
          frustrationLevel: telemetrySession.frustrationLevel || 'low',
          levelNumber: farm.levelId,
          source: 'gameplay',
        },
        student,
      );
    }, 2500);
    return () => window.clearTimeout(handle);
  }, [
    student,
    farm.levelId,
    telemetrySession.frustrationScore,
    telemetrySession.frustrationLevel,
  ]);

  // While avatar / quizzes / shop / quest scroll need focus, disable Phaser key capture
  useEffect(() => {
    const locked = Boolean(
      avatarOpen ||
        quizPayload ||
        shopOpen ||
        questScrollOpen ||
        motivationOpen ||
        gameOverPayload,
    );
    const freezeCombat = Boolean(
      quizPayload ||
        questScrollOpen ||
        shopOpen ||
        motivationOpen ||
        gameOverPayload,
    );
    emitUiInputLock(locked, { freezeCombat });
    return () => emitUiInputLock(false);
  }, [
    avatarOpen,
    quizPayload,
    shopOpen,
    questScrollOpen,
    motivationOpen,
    gameOverPayload,
  ]);

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
    setMotivationOpen(false);
    setMotivationContext(null);
    setGameOverPayload(null);
    setInFarm(false);
    setChallenges([]);
    setQuestScrollOpen(false);
    setAvatarOpen(false);
    setAvatarTrigger(null);
    setAppView('farm');
    resetAvatarTelemetry();
    setGameplay({
      band: PERFORMANCE_CATEGORIES.MEDIUM,
      label: PERFORMANCE_LABELS.medium,
      settings: getGameplaySettings(PERFORMANCE_CATEGORIES.MEDIUM),
      previousLevel: null,
      appliedBonus: null,
      pendingBonus: null,
      nextGameplaySettings: getGameplaySettings(PERFORMANCE_CATEGORIES.MEDIUM),
      live: { retries: 0, avgAnswerTimeSec: null, levelElapsedSec: 0 },
    });
    playerMapRef.current = { x: 48, y: 32 };
    setPlayerMap({ x: 48, y: 32 });
    questScrollLevelRef.current = null;
    storylineChallengesRef.current = [];
  }, [resetAvatarTelemetry]);

  const handleAvatarClose = useCallback(() => {
    setAvatarOpen(false);
    setAvatarTrigger(null);
    clearAvatarTrigger();
  }, [clearAvatarTrigger]);

  const handleQuizAnswerAttempt = useCallback(
    (attempt = {}) => {
      if (attempt.isCorrect) {
        correctStreakRef.current += 1;
      } else {
        correctStreakRef.current = 0;
      }
      recordAvatarAnswer({
        isCorrect: Boolean(attempt.isCorrect),
        selectedText: attempt.selectedText || null,
        questionData: attempt.questionData || null,
        responseTimeMs: attempt.responseTimeMs ?? null,
      });
    },
    [recordAvatarAnswer],
  );

  const handleQuizHint = useCallback(() => {
    recordAvatarHint();
  }, [recordAvatarHint]);

  const handleLogin = useCallback(
    (nextStudent) => {
      resetSessionUi();
      setStudent(nextStudent);
      const boot = syncBootstrapStudentProgress(nextStudent);
      setLobbyProgress(boot.lobby);
      if (boot.farmPatch) {
        setFarm({ ...createInitialFarm(), ...boot.farmPatch });
      }
      syncStudentLogin(nextStudent);
    },
    [resetSessionUi],
  );

  const handleLogout = useCallback(async () => {
    if (student?.id) {
      await submitLeaderboardScore({
        studentId: student.id,
        studentName: student.displayName,
        displayName: student.displayName,
        score: computeArenaScore({
          rpEarned,
          earnings: farm.earnings,
          levelId: farm.levelId,
          questionsAnswered: farm.questionsAnswered,
        }),
        currentLevel: farm.levelId,
        quizCorrect: farm.questionsAnswered || 0,
        walletBalance: farm.earnings,
      });
    }
    syncStudentLogout({
      endLevel: farm.levelId,
      quizCorrect: farm.questionsAnswered || 0,
    });
    logoutStudent();
    resetSessionUi();
    setStudent(null);
  }, [resetSessionUi, farm.levelId, farm.questionsAnswered, farm.earnings, rpEarned, student]);

  const maxQuestions = farm.maxQuestions ?? DDA_CONFIG.maxQuestions;

  const progressPct = useMemo(() => {
    if (!maxQuestions) return 0;
    return Math.min(
      100,
      Math.round(((farm.questionsAnswered || 0) / maxQuestions) * 100),
    );
  }, [farm.questionsAnswered, maxQuestions]);

  const bagCount = farm.harvestedCount ?? farm.inventory ?? 0;
  const carriedCount = farm.carriedCount ?? 0;

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

  useEffect(() => {
    const onPhase = (payload = {}) => {
      if (payload.phase) {
        setGamePhase(payload.phase);
        if (payload.phase === 'menu') setGameOverPayload(null);
      }
    };
    const onMusic = (payload = {}) => {
      setMusicEnabled(payload.enabled !== false);
    };
    const onLeaderboardOpen = () => setLeaderboardOpen(true);
    ForestGameBridge.on(FARM_EVENTS.GAME_PHASE, onPhase);
    ForestGameBridge.on(FARM_EVENTS.MUSIC_STATE, onMusic);
    ForestGameBridge.on(FARM_EVENTS.LEADERBOARD_OPEN, onLeaderboardOpen);
    const onGameOver = (payload = {}) => {
      setGameOverPayload(payload);
      setInFarm(false);
      emitUiInputLock(true, { freezeCombat: true });
    };
    ForestGameBridge.on(FARM_EVENTS.GAME_OVER, onGameOver);
    return () => {
      ForestGameBridge.off(FARM_EVENTS.GAME_PHASE, onPhase);
      ForestGameBridge.off(FARM_EVENTS.MUSIC_STATE, onMusic);
      ForestGameBridge.off(FARM_EVENTS.LEADERBOARD_OPEN, onLeaderboardOpen);
      ForestGameBridge.off(FARM_EVENTS.GAME_OVER, onGameOver);
    };
  }, []);

  useEffect(() => {
    if (!student?.id) return undefined;
    const score = computeArenaScore({
      rpEarned,
      earnings: farm.earnings,
      levelId: farm.levelId,
      questionsAnswered: farm.questionsAnswered,
    });
    const handle = window.setTimeout(() => {
      submitLeaderboardScore({
        studentId: student.id,
        studentName: student.displayName,
        displayName: student.displayName,
        score,
        currentLevel: farm.levelId,
        quizCorrect: farm.questionsAnswered || 0,
        walletBalance: farm.earnings,
        cash: farm.earnings,
      });
    }, 1500);
    return () => window.clearTimeout(handle);
  }, [
    student?.id,
    student?.displayName,
    farm.levelId,
    farm.questionsAnswered,
    farm.earnings,
    rpEarned,
  ]);

  const handleLobbyStart = useCallback(() => {
    ForestGameBridge.emit(FARM_EVENTS.MENU_START);
  }, []);

  const handleLobbyLeaderboard = useCallback(() => {
    setLeaderboardOpen(true);
  }, []);

  const handleLobbyToggleMusic = useCallback(() => {
    ForestGameBridge.emit(FARM_EVENTS.MENU_TOGGLE_MUSIC);
  }, []);

  const handleGameOverContinue = useCallback(() => {
    setGameOverPayload(null);
    emitUiInputLock(false);
    emitReturnToMenu();
  }, []);

  const handleOpenResearchDashboard = useCallback(() => {
    setAppView('dashboard');
  }, []);

  const handleChallengesState = useCallback((payload = {}) => {
    const list = Array.isArray(payload.challenges) ? payload.challenges : [];
    storylineChallengesRef.current = list.filter(isStorylineChallenge);
    setChallenges(list);
  }, []);

  const refreshChallenges = useCallback((levelId) => {
    const id = Math.max(1, Number(levelId) || 1);
    const story = Array.isArray(storylineChallengesRef.current)
      ? storylineChallengesRef.current
      : [];
    try {
      setChallenges([...story, ...buildActiveChallenges(id)]);
    } catch {
      setChallenges(story);
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
      quizPayload
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
    setFarm((prev) => {
      const next = {
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
      };
      setLobbyProgress(resolveLobbyProgress(student, next));
      return next;
    });
    if (Array.isArray(state.challenges)) {
      storylineChallengesRef.current = state.challenges.filter(isStorylineChallenge);
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
  }, [handlePlayerMapPos, student]);

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
      const frScore =
        payload.frustrationScore ?? telemetrySession.frustrationScore ?? 0;
      const frLevel =
        payload.frustrationLevel ?? telemetrySession.frustrationLevel ?? 'low';
      const perf = {
        attemptScores: payload.attemptScores ?? [],
        avgResponseMs: payload.avgResponseMs ?? 0,
        performanceScore: payload.performanceScore,
        performanceBand: payload.performanceBand,
        questionsAnswered: payload.questionsAnswered,
        frustrationScore: frScore,
        frustrationLevel: frLevel,
      };
      setShopPerformance(perf);
      // Suggest a genius-life motivational video before the unlock shop
      setMotivationContext({
        frustrationScore: frScore,
        frustrationLevel: frLevel,
        levelId: payload.levelId ?? farm.levelId ?? 1,
        pendingShop: true,
      });
      setMotivationOpen(true);
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
        `Level complete!${beatNote}${bonusNote} A motivational story is ready — then spend cash on unlocks.`,
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
  }, [
    farm.levelId,
    telemetrySession.frustrationScore,
    telemetrySession.frustrationLevel,
  ]);

  const handleMotivationContinue = useCallback(() => {
    setMotivationOpen(false);
    const openShop = motivationContext?.pendingShop === true;
    setMotivationContext(null);
    if (openShop) {
      setShopOpen(true);
      emitUnlockShopOpen();
    }
  }, [motivationContext]);

  const handleInteraction = useCallback((detail) => {
    if (detail?.type === 'plant_success' && detail.rp) {
      setRpEarned((n) => n + detail.rp);
      setHint('Correct plant answer! Harvest crops — they stack on your back.');
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'harvest_success') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      setHint('Harvest unlocked — run over ready crops to pick them up.');
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'farm_customer_shop_closed') {
      if (detail.coinsEarned || detail.gained) {
        setHint(
          `Shop visit: +$${detail.gained ?? detail.coinsEarned ?? 0}${
            detail.customersServed
              ? ` · served ${detail.customersServed}`
              : ''
          }`,
        );
        window.setTimeout(() => setHint(null), 2800);
      }
    }
    if (detail?.type === 'unload_success' || detail?.type === 'sell') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      if (detail.type === 'sell' || detail.sold) {
        setHint(
          `Sold ${detail.sold ?? ''} crops for $${detail.gained ?? detail.coinsEarned ?? 0}!`,
        );
        window.setTimeout(() => setHint(null), 2600);
      } else if (detail.type === 'unload_success') {
        setHint(
          'Visit the Farm Shop and press E or Q to see customers and stock.',
        );
        window.setTimeout(() => setHint(null), 3600);
      }
    }
    if (detail?.type === 'farm_shop_hint') {
      setHint(
        detail.message ||
          'Visit the Farm Shop and press E or Q to see customers and stock.',
      );
      window.setTimeout(() => setHint(null), 3600);
    }
    if (detail?.type === 'farm_shop_sale') {
      setHint(`Customer paid +$${detail.reward || 0}!`);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'shop_customers_left') {
      setFarm((prev) => ({
        ...prev,
        shopCustomersLeft:
          (prev.shopCustomersLeft || 0) + (detail.count || 1),
      }));
    }
    if (detail?.type === 'load_success') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      setHint(
        `Delivered ${detail.unloaded ?? ''} to the shop — customers will buy automatically.`,
      );
      window.setTimeout(() => setHint(null), 2800);
    }
    if (
      detail?.type === 'load_fail' ||
      detail?.type === 'plant_fail' ||
      detail?.type === 'harvest_fail' ||
      detail?.type === 'unload_fail'
    ) {
      setDdaMisses((n) => n + 1);
    }
    if (detail?.type === 'harvest') {
      setHint(
        `Carrying ${detail.carriedCount ?? ''} — walk to the Farm Shop and press E.`,
      );
      window.setTimeout(() => setHint(null), 2000);
    }
    if (detail?.type === 'mastery_goal_set') {
      setHint(
        `Plant ${detail.cropName || 'crops'} · pick ${detail.harvestTarget} · sell at the shop`,
      );
      window.setTimeout(() => setHint(null), 4200);
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
    if (detail?.type === 'crop_challenge_next') {
      setHint(
        `Next vegetable: plant ${detail.cropName} once, then harvest & sell.`,
      );
      window.setTimeout(() => setHint(null), 4200);
    }
    if (detail?.type === 'animal_challenge_next') {
      setHint(
        `Next animal challenge: feed the ${detail.animalName} · collect ${detail.collectTarget} ${detail.produceName} · sell at the shop`,
      );
      window.setTimeout(() => setHint(null), 4200);
    }
    if (detail?.type === 'animal_tend_success') {
      setHint(
        `Herd fed! Collect ${detail.produceName || 'produce'} in the pen, then sell at the shop.`,
      );
      window.setTimeout(() => setHint(null), 3600);
    }
    if (detail?.type === 'animal_collect_success') {
      setHint(
        `Collect unlocked — run over the ${detail.produceName || 'produce'} in the pen.`,
      );
      window.setTimeout(() => setHint(null), 2800);
    }
    if (detail?.type === 'animal_blocked') {
      const msg =
        detail.reason === 'already_tended'
          ? `Herd is already fed — collect ${detail.produceName || 'produce'} in the pen.`
          : 'Cannot tend animals now.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'clean_challenge_next') {
      setHint(
        `Next cleaning challenge: ${detail.verb || 'Clean'} ${detail.sweepTarget} ${detail.messName} · sell ${detail.wasteName} at the shop`,
      );
      window.setTimeout(() => setHint(null), 4200);
    }
    if (detail?.type === 'clean_start_success') {
      setHint(
        `Yard unlocked! Sweep ${detail.messName || 'the mess'}, then sell at the shop.`,
      );
      window.setTimeout(() => setHint(null), 3600);
    }
    if (detail?.type === 'clean_sweep_success') {
      setHint(
        `Sweeping unlocked — run over the ${detail.wasteName || 'mess'} in the yard.`,
      );
      window.setTimeout(() => setHint(null), 2800);
    }
    if (detail?.type === 'clean_blocked') {
      const msg =
        detail.reason === 'already_started'
          ? `Yard is already started — sweep ${detail.messName || 'the mess'}.`
          : 'Cannot clean here now.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2600);
    }
    if (detail?.type === 'plant_blocked') {
      const msg =
        detail.reason === 'not_plot'
          ? 'Stand on a marked PLANT bed (gold) to plant.'
          : detail.reason === 'tile_occupied'
            ? 'This plant bed is full — try another marked bed.'
            : detail.reason === 'already_planted'
              ? `Already planted ${detail.cropName || 'this crop'} — harvest & sell it to unlock the next vegetable.`
              : detail.reason === 'target_reached'
                ? 'Level complete — open the Unlock Shop or head to the forest!'
                : 'Cannot plant here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'load_blocked') {
      const msg =
        detail.reason === 'empty_carry'
          ? 'Harvest crops onto your back first, then press E at the Farm Shop.'
          : detail.reason === 'not_dock'
            ? 'Stand at the Farm Shop and press E to unload.'
            : 'Cannot unload here.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2200);
    }
    if (detail?.type === 'sell_blocked') {
      const msg =
        detail.reason === 'not_at_shop'
          ? detail.message ||
            'Walk to the Farm Shop and press E to unload, or Q to check stock.'
          : detail.reason === 'empty_inventory'
            ? 'Unload harvests at the Farm Shop with E first.'
            : 'Carry harvests to the Farm Shop and press E to unload.';
      setHint(msg);
      window.setTimeout(() => setHint(null), 2800);
    }
    if (detail?.type === 'unlock_purchased') {
      if (detail.earnings != null || detail.currentMoney != null) {
        setFarm((prev) => ({
          ...prev,
          earnings: detail.earnings ?? detail.currentMoney ?? prev.earnings,
        }));
      }
      setHint(`Bought! It will appear on your farm next level.`);
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
      if (detail.source !== 'house' && detail.source !== 'storyline') {
        setHint(
          `${detail.itemId ? detail.title : 'Challenge'} complete!${
            detail.rewardCash ? ` +$${detail.rewardCash}` : ''
          }`,
        );
        window.setTimeout(() => setHint(null), 2600);
        refreshChallenges(farm.levelId);
      }
    }
    if (detail?.type === 'storyline_beat') {
      const bits = [detail.title, detail.narrative, detail.objective]
        .filter(Boolean)
        .join(' — ');
      setHint(bits || 'Story beat complete.');
      window.setTimeout(() => setHint(null), 5200);
      refreshChallenges(farm.levelId);
    }
    if (detail?.type === 'challenge_step') {
      if (detail.rp) setRpEarned((n) => n + detail.rp);
      setHint(
        detail.placeLabel ||
          `${detail.title}: step complete.`,
      );
      window.setTimeout(() => setHint(null), 2200);
      refreshChallenges(farm.levelId);
    }
    if (detail?.type === 'challenge_fail') {
      setDdaMisses((n) => n + 1);
      if (detail.hint) {
        setHint(detail.hint);
        window.setTimeout(() => setHint(null), 2800);
      }
    }
    if (detail?.type === 'challenge_blocked') {
      setHint(
        detail.hint ||
          'Click the unlock on the farm when a challenge is open.',
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
    emitUiInputLock(false);
    emitUnlockShopClose();
  }, []);

  const handleShopClose = useCallback(() => {
    const nextLevelId = Math.max(1, (farm.levelId || 1) + 1);
    const cash = Math.max(
      0,
      Number(farm.earnings ?? farm.currentMoney) || 0,
    );
    setShopOpen(false);
    emitUnlockShopClose();
    setBanner(null);
    setQuizPayload(null);
    playerMapRef.current = { x: 48, y: 32 };
    setPlayerMap({ x: 48, y: 32 });
    setFarm((prev) => ({
      ...prev,
      levelId: nextLevelId,
      forestUnlocked: false,
      questionsAnswered: 0,
      plantedCount: 0,
      inventory: 0,
      harvestedCount: 0,
      carriedCount: 0,
      earnings: cash,
      goalText: `Level ${nextLevelId}: finish ${DDA_CONFIG.maxQuestions} questions · then shop`,
    }));
    refreshChallenges(nextLevelId);
    questScrollLevelRef.current = nextLevelId;
    setQuestScrollOpen(false);
    window.setTimeout(() => {
      emitStartFarmLevel({
        levelId: nextLevelId,
        startingMoney: cash,
      });
    }, 80);
  }, [farm.levelId, farm.earnings, farm.currentMoney, refreshChallenges]);

  if (!student) {
    return <StudentLogin onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell forest-app">
      <GameShellHeader
        mode={
          appView === 'dashboard'
            ? 'dashboard'
            : inFarm
              ? 'playing'
              : 'lobby'
        }
        student={student}
        farm={farm}
        gameReady={gameReady}
        onOpenDashboard={handleOpenResearchDashboard}
        onBackToFarm={() => setAppView('farm')}
        onLogout={handleLogout}
      />

      {appView === 'dashboard' ? (
        <ResearchDashboard
          student={student}
          farm={farm}
          telemetrySession={telemetrySession}
          behavioralMetrics={behavioralMetrics}
          rpEarned={rpEarned}
          ddaMisses={ddaMisses}
          onBackToFarm={() => setAppView('farm')}
        />
      ) : (
      <div className="forest-play-layout">
        <div className="forest-stage-wrap">
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
          />

          {!gameReady && appView === 'farm' && <GameCanvasLoading />}

          {!inFarm && gameReady && (gamePhase === 'menu' || gamePhase === 'guide') && (
            <GameLobbyOverlay
              mode={gamePhase === 'guide' ? 'guide' : 'menu'}
              student={student}
              farm={farm}
              lobbyProgress={lobbyProgress}
              musicEnabled={musicEnabled}
              gameReady={gameReady}
              onStart={handleLobbyStart}
              onLeaderboard={handleLobbyLeaderboard}
              onToggleMusic={handleLobbyToggleMusic}
              onOpenProgress={handleOpenResearchDashboard}
            />
          )}

          <GameOverOverlay
            open={Boolean(gameOverPayload)}
            payload={gameOverPayload}
            student={student}
            onContinue={handleGameOverContinue}
          />

          <GlobalLeaderboardModal
            open={leaderboardOpen}
            student={student}
            onClose={() => setLeaderboardOpen(false)}
          />

          {inFarm && (
          <div className="farm-controls farm-controls-minimal">
            <GameProgressButton
              onClick={handleOpenResearchDashboard}
              progressPct={progressPct}
            />
            <button
              type="button"
              className="quest-scroll-reopen"
              onClick={() => setQuestScrollOpen(true)}
              disabled={
                !gameReady ||
                Boolean(quizPayload) ||
                shopOpen
              }
            >
              Quest scroll
              {challenges.some((c) => !c.done)
                ? ` (${challenges.filter((c) => !c.done).length} open)`
                : ''}
            </button>
          </div>
          )}

          {inFarm && hint && <div className="farm-hint">{hint}</div>}

          {inFarm && banner && !shopOpen && (
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
              cropName={quizPayload.cropName || farm.cropName}
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
              onHintUsed={handleQuizHint}
              onOptionSwitch={recordAvatarOptionSwitch}
              onClose={handleQuizClose}
            />
          )}

          <UnlockShopModal
            open={shopOpen}
            cash={farm.earnings}
            performance={shopPerformance}
            onClose={handleShopClose}
          />

          <MotivationalVideoModal
            open={motivationOpen}
            frustrationScore={
              motivationContext?.frustrationScore ??
              telemetrySession.frustrationScore ??
              0
            }
            frustrationLevel={
              motivationContext?.frustrationLevel ??
              telemetrySession.frustrationLevel ??
              'low'
            }
            studentId={student?.id || ''}
            levelId={motivationContext?.levelId ?? farm.levelId ?? 1}
            onContinue={handleMotivationContinue}
          />

          <LevelQuestScroll
            open={
              questScrollOpen &&
              !shopOpen &&
              !quizPayload &&
              !motivationOpen
            }
            levelId={farm.levelId}
            challenges={challenges}
            goalText={farm.goalText}
            harvestTarget={farm.harvestTarget ?? 24}
            cropsHarvestedTotal={farm.cropsHarvestedTotal ?? 0}
            cropsSoldThisChallenge={farm.cropsSoldThisChallenge ?? 0}
            plantedCount={farm.plantedCount ?? 0}
            cropName={farm.cropName || 'crops'}
            cropChallengeIndex={farm.cropChallengeIndex ?? 0}
            cropChallengeTotal={farm.cropChallengeTotal ?? 2}
            libraryLevel={farm.libraryLevel ?? farm.levelId ?? 1}
            libraryLevelCount={farm.libraryLevelCount ?? 50}
            librarySummary={farm.librarySummary || ''}
            animalName={farm.animalName || ''}
            animalProduceName={farm.animalProduceName || 'produce'}
            animalAction={farm.animalAction || 'feed'}
            animalChallengeIndex={farm.animalChallengeIndex ?? 0}
            animalChallengeTotal={farm.animalChallengeTotal ?? 1}
            animalCollectTarget={farm.animalCollectTarget ?? 0}
            animalCollectedTotal={farm.animalCollectedTotal ?? 0}
            animalSoldThisChallenge={farm.animalSoldThisChallenge ?? 0}
            animalTended={Boolean(farm.animalTended)}
            cleanMessName={farm.cleanMessName || ''}
            cleanWasteName={farm.cleanWasteName || 'waste'}
            cleanVerb={farm.cleanVerb || 'Clean'}
            cleaningChallengeIndex={farm.cleaningChallengeIndex ?? 0}
            cleaningChallengeTotal={farm.cleaningChallengeTotal ?? 1}
            cleanSweepTarget={farm.cleanSweepTarget ?? 0}
            cleanSweptTotal={farm.cleanSweptTotal ?? 0}
            cleanSoldThisChallenge={farm.cleanSoldThisChallenge ?? 0}
            cleanStarted={Boolean(farm.cleanStarted)}
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
              challenges={challenges}
            />
          </div>
        )}
      </div>
      )}

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
            avatarTrigger?.generate_mind_map ||
            avatarTrigger?.intervention_focus?.require_mind_map ||
            avatarTrigger?.non_wrong_scenario_code === 'REPEATED_WRONG' ||
            avatarTrigger?.scenarioCode === 'REPEATED_WRONG' ||
            avatarTrigger?.non_wrong_scenario_code === 'SAME_CONCEPT_STRUGGLE' ||
            avatarTrigger?.scenarioCode === 'SAME_CONCEPT_STRUGGLE' ||
            avatarTrigger?.non_wrong_scenario_code === 'SLOW_AND_WRONG' ||
            avatarTrigger?.scenarioCode === 'SLOW_AND_WRONG' ||
            avatarTrigger?.reason === 'concept_misconceptions' ||
            avatarTrigger?.reason === 'repeated_incorrect' ||
            ((misconceptions?.length > 0) &&
              String(avatarTrigger?.reason || '').includes('incorrect')),
        )}
        mindMap={
          avatarTrigger?.mindMap ||
          activeMindMap ||
          null
        }
        interventionMode={
          avatarTrigger?.intervention_mode ||
          telemetrySession.lastInterventionMode
        }
        perceivedState={avatarTrigger?.perceived_state}
        onLearningMessage={updateLearningPreferences}
        onShowMindMap={() =>
          showMindMapForTopic(
            avatarTrigger?.intervention_focus?.concept_topic || null,
          )
        }
        telemetry={{
          ...telemetrySession,
          metrics: avatarTrigger?.metrics || behavioralMetrics,
          mindMap:
            avatarTrigger?.mindMap || activeMindMap || null,
          learningPrefs,
          scenario: avatarTrigger?.scenario,
          offerMindMap: Boolean(
            avatarTrigger?.offerMindMap ||
              avatarTrigger?.generate_mind_map ||
              avatarTrigger?.intervention_focus?.require_mind_map ||
              ['REPEATED_WRONG', 'SAME_CONCEPT_STRUGGLE', 'SLOW_AND_WRONG'].includes(
                String(
                  avatarTrigger?.scenarioCode ||
                    avatarTrigger?.non_wrong_scenario_code ||
                    '',
                ),
              ),
          ),
          intervention_focus:
            avatarTrigger?.intervention_focus ||
            telemetrySession.lastInterventionFocus ||
            null,
          non_wrong_scenario_code:
            avatarTrigger?.non_wrong_scenario_code ||
            avatarTrigger?.scenarioCode ||
            avatarTrigger?.intervention_focus?.code ||
            null,
          scenarioCode:
            avatarTrigger?.scenarioCode ||
            avatarTrigger?.non_wrong_scenario_code ||
            avatarTrigger?.intervention_focus?.code ||
            null,
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
          avatarTrigger?.reason ||
          avatarTrigger?.intervention_focus?.code ||
          telemetrySession.lastTriggerReason
        }
        onClose={handleAvatarClose}
      />
    </div>
  );
}

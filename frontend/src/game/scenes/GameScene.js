import Phaser from 'phaser';
import Arrow from '../objects/Arrow';
import Player from '../objects/Player';
import Enemy from '../objects/Enemy';
import Crop from '../objects/Crop';
import { createGameAnimations } from '../game/animations';
import {
  DIRECTIONS,
  HURT_INVULN_MS,
  KILLS_TO_OPEN_EXIT,
  MAX_WRONG_ANSWERS,
  PLAYER_SPEED,
  SCORE_TIME_OFFSET_SEC,
  TILE_SIZE,
  FARM_CAMERA_ZOOM,
} from '../config/constants';
import { ForestGameBridge, FARM_EVENTS } from '../EventBus';
import { getFarmLevel } from '../../data/farmLevels';
import {
  clearAssessmentSession,
  exportAssessmentSession,
  isRenderableQuizQuestion,
  resolveScienceQuestion,
  restoreAssessmentSession,
  terminateAssessmentSession,
  warmupAssessmentSession,
} from '../../assessmentEngine/assessmentQuizSession.js';
import {
  DDA_CONFIG,
  averageScore,
  formatResponseTime,
  scoreAttempt,
} from '../../data/dda';
import {
  cropValueFromMastery,
  getMasteryForLevelStart,
  goalTextFromMastery,
  harvestTargetFromMastery,
  plantPatchFromMastery,
  saveLevelPerformance,
} from '../../data/masteryModel';
import { loadFarmProgress, saveFarmProgress } from '../../data/farmProgress.js';
import { isLearningPathLinked } from '../../data/chapterPath.js';
import {
  applyFrustrationToGameplaySettings,
  consumePendingGameplayBonus,
  getGameplayForLevelStart,
  getGameplaySettings,
  saveGameplayLevelPerformance,
} from '../../data/gameplayPerformance.js';
import {
  getOwnedUnlockIds,
  getUnlockItem,
  getUnlockMeta,
  resolveUnlockDisplayScale,
  isUnlocked,
  markUnlocked,
  advanceChallengeProgress,
  getChallengeProgress,
  shopBandFromPerformance,
  pickUnlockWorldSlot,
} from '../../data/unlockShop.js';
import {
  buildActiveChallenges,
  getNextChallengeStep,
} from '../../data/challengeRuntime.js';
import { getStage } from '../../data/unlockChallenges.js';
import {
  coveringCellsInPlot,
  findPlotAt,
  isPlantableTile,
  isFarmShopTile,
  PLANT_PLOTS,
} from '../../data/plantPlots.js';
import { getCreature } from '../../data/assetLibrary.js';
import { getStorylineProp } from '../../storyline/storylineVisuals.js';
import WorldChallengeLayer from '../world/WorldChallengeLayer.js';
import AnimalPaddockLayer from '../world/AnimalPaddockLayer.js';
import CleaningYardLayer from '../world/CleaningYardLayer.js';
import FarmShopLayer from '../world/FarmShopLayer.js';
import {
  adaptWorldShopFrustration,
  createWorldShop,
  snapshotWorldShop,
  tickWorldShopPatience,
  loadCarryStackToShop,
  syncWorldShopSellableIds,
  SHOP_EVENTS,
} from '../../data/farmCustomerShop.js';
import { customerMoodState } from '../../data/customerMood.js';
import {
  ANIMAL_CHALLENGE_COUNT,
  animalGoalText,
  getAnimalChallenge,
} from '../../data/animalChallenges.js';
import {
  advanceAnimalChallengeIndex,
  getAnimalChallengeIndex,
  setAnimalChallengeIndex,
} from '../../data/animalChallengeStore.js';
import {
  CLEANING_CHALLENGE_COUNT,
  cleaningGoalText,
  getCleaningChallenge,
} from '../../data/cleaningChallenges.js';
import {
  advanceCleaningChallengeIndex,
  getCleaningChallengeIndex,
  setCleaningChallengeIndex,
} from '../../data/cleaningChallengeStore.js';
import {
  getLevelChallengePlan,
  LIBRARY_LEVEL_COUNT,
} from '../../data/challengeLibrary.js';
import {
  buildWorldChallengeProgress,
  getTaskAction,
  getWorldNode,
  getWorldTask,
  rebuildActiveNodes,
} from '../../data/worldChallenges.js';
import {
  isWorldChallengeComplete,
  markWorldChallengeComplete,
} from '../../data/worldChallengeStore.js';
import {
  CROP_CHALLENGE_COUNT,
  cropDefForPlot,
  getCropChallenge,
  getCropTextures,
  vegetableGoalText,
} from '../../data/cropChallenges.js';
import {
  advanceCropChallengeIndex,
  getCropChallengeIndex,
  setCropChallengeIndex,
} from '../../data/cropChallengeStore.js';
import {
  buildLevelCropChallengeList,
  CROP_CHALLENGE_STATUS,
  unsoldLevelCropIds,
  shopStockForCrop,
} from '../../data/cropChallengeProgression.js';
import {
  buildPersonalizedActivityBoard,
  personalizeAnimalChallenge,
  personalizeCleaningChallenge,
  personalizeCropChallenge,
} from '../../data/personalizedChallenges.js';
import {
  clearFarmRun,
  loadFarmRun,
  saveFarmRun,
} from '../../data/farmRunStore.js';

const MOLE_GID = 6;
const TREANT_GID = 5;
const SKIP_UNLOCK_ITEMS = new Set(['house', 'hen_house', 'calf', 'chick']);

function isStorylineItemId(itemId) {
  return String(itemId || '').startsWith('storyline_');
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    const registryLevel = Number(this.registry?.get?.('farmLevelId'));
    this.levelId = Math.max(
      1,
      Number(data?.levelId) ||
        (Number.isFinite(registryLevel) ? registryLevel : 0) ||
        1,
    );
    const cash = Number(data?.startingMoney);
    this.devStartingMoney = Number.isFinite(cash) && cash > 0 ? cash : 0;
    this.storyline = data?.storyline ?? this.registry?.get?.('storyline') ?? null;
    this._resumeSnapshot = null;
    this._runEnded = false;
    if (data?.resume !== false) {
      const saved = loadFarmRun();
      if (saved && Number(saved.levelId) === Number(this.levelId)) {
        this._resumeSnapshot = saved;
      }
    }
  }

  create() {
    if (this._resumeSnapshot?.assessmentSession) {
      restoreAssessmentSession(this._resumeSnapshot.assessmentSession);
    } else if (!this._resumeSnapshot) {
      clearAssessmentSession();
    }
    this.farmLevel = getFarmLevel(this.levelId);
    this.baseCropValue = this.farmLevel.cropValue;
    this.currentMoney = this.devStartingMoney || 0;
    this.earnings = 0;
    this.harvestedItemsCount = 0; // items delivered to shop stock (sellable)
    this.carriedCount = 0; // crops on the runner's back (not yet unloaded at shop)
    this.inventory = 0;
    this.carrySprites = [];
    this.pendingQuizMode = null;
    this.pendingWorldChallenge = null;
    this.forestUnlocked = false;
    this.farmInputLocked = false;
    this.uiInputLocked = false;
    this._uiOverlayPaused = false;
    this._uiOwnedWorldPause = false;
    this.frustrationLevel = 'low';
    this.frustrationScore = 0;
    this.worldShop = null;
    this.farmShopUnloadOpen = false;
    this._farmShopLeftSession = 0;
    this.currentTargetTile = null;
    this.pendingGridKey = null;
    this.pendingPatchCells = [];
    this.plantedCrops = [];
    this.plantedGridKeys = new Set();
    this.lastQuestionId = null;
    this.harvestArmedUntil = 0;
    this.animalCollectArmedUntil = 0;
    this.cleanSweepArmedUntil = 0;
    /** One planting per vegetable type per challenge — no replant. */
    this.plantDoneForChallenge = false;
    this.harvestUnlocked = false;
    this.loadUnlocked = false;
    this.unloadUnlocked = true;
    this.animalCollectUnlocked = false;
    this.cleanSweepUnlocked = false;
    this.enemyHits = 0;
    this.enemyDeaths = Number(this.registry.get('enemyDeaths')) || 0;
    this.levelRestarts = Number(this.registry.get('levelRestarts')) || 0;
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    try {
      this.physics?.world?.resume?.();
    } catch {
      /* world may not exist yet */
    }

    // Quiz telemetry for this level (saved for the *next* level's mastery)
    this.quizCorrect = 0;
    this.quizIncorrect = 0;
    this.attemptScores = [];
    this.responseTimesMs = [];
    this.levelAttempts = [];
    this.answerResults = [];
    this.quizOpenedAt = 0;
    this.retryCount = 0;
    this.levelStartedAtMs = Date.now();
    this.levelStartMoney = this.currentMoney;

    // Time target at level start from previous level avg / mastery (no cash goal)
    const prior = getMasteryForLevelStart(this.levelId);
    this.mastery = prior.mastery;
    this.masterySource = prior.source;
    this.masteryFromLevelId = prior.fromLevelId;
    this.performanceBand = prior.band;
    this.timeTargetMs = prior.timeTargetMs;
    this.cashTarget = null; // cash is for unlock shop only, not level completion
    this.ddaCalibrated = true;
    this.harvestTarget = harvestTargetFromMastery(this.mastery);
    this.cropsHarvestedTotal = 0;
    this.cropsSoldThisChallenge = 0;
    this.cropChallenge = null;
    // Per-crop tracking for free-choice multi-crop model
    this.cropSoldMap = {};
    this.cropPlantedSet = new Set();
    this.cropHarvestMap = {};
    this.animalChallenge = null;
    this.animalCollectTarget = 4;
    this.animalCollectedTotal = 0;
    this.animalSoldThisChallenge = 0;
    this.animalTended = false;
    this.cleaningChallenge = null;
    this.cleanSweepTarget = 4;
    this.cleanSweptTotal = 0;
    this.cleanSoldThisChallenge = 0;
    this.cleanStarted = false;
    this.cleanSweepArmedUntil = 0;
    this.carryStack = [];
    const patch = plantPatchFromMastery(this.mastery);

    // Adaptive GAMEPLAY (enemies / timers / retries / hints) — not question DDA
    const gameplayStart = getGameplayForLevelStart(this.levelId);
    this.gameplayBand = gameplayStart.band;
    this.gameplaySettings = gameplayStart.settings;
    this.gameplaySettingsBase = { ...gameplayStart.settings };
    this.gameplayPreviousLevel = gameplayStart.previousLevel;
    this.gameplayAppliedBonus = null;
    this.levelTargetCompletionMs = this.gameplaySettings.levelTargetTimeMs;
    this.answerTimerMs = this.gameplaySettings.answerTimerMs;
    this.applyFrustrationGamePersonalization({ respawnSpeedOnly: false });

    this.farmLevel = {
      ...this.farmLevel,
      targetEarnings: null,
      timeTargetMs: this.timeTargetMs,
      harvestTarget: this.harvestTarget,
      maxQuestions: DDA_CONFIG.maxQuestions,
      plantPatchCols: patch.cols,
      plantPatchRows: patch.rows,
      plantFillRatio: patch.fillRatio ?? 0.78,
      cropValue: cropValueFromMastery(this.baseCropValue, this.mastery),
      goalText: goalTextFromMastery(
        this.timeTargetMs,
        this.mastery,
        this.harvestTarget,
      ),
      gameplayBand: this.gameplayBand,
      answerTimerMs: this.answerTimerMs,
      levelTargetCompletionMs: this.levelTargetCompletionMs,
    };

    this.bindLevelLibrary();
    try {
      if (this._resumeSnapshot) {
        const snap = this._resumeSnapshot;
        if (Number.isFinite(Number(snap.cropLibraryIndex))) {
          setCropChallengeIndex(snap.cropLibraryIndex);
        }
        if (Number.isFinite(Number(snap.animalLibraryIndex))) {
          setAnimalChallengeIndex(snap.animalLibraryIndex);
        }
        if (Number.isFinite(Number(snap.cleanLibraryIndex))) {
          setCleaningChallengeIndex(snap.cleanLibraryIndex);
        }
      }
      this.applyCurrentCropChallenge({ resetProgress: !this._resumeSnapshot });
      this.applyCurrentAnimalChallenge({ resetProgress: !this._resumeSnapshot });
      this.applyCurrentCleaningChallenge({ resetProgress: !this._resumeSnapshot });
    } catch (err) {
      console.warn('Level challenge library failed to apply', err);
    }

    this.addAudios();
    this.createMap();
    this.createGroups();
    this.createExit();
    // Starting level = plain background; owned unlocks appear only after purchase
    this.placedUnlockIds = new Set();
    this.unlockSprites = new Map();
    this.storylineSprites = new Map();
    this.storylineDecorSprites = [];
    this.agentStationSprites = new Map();
    this.activeChallenges = [];
    this.storylineChallenges = [];
    this.pendingItemChallenge = null;
    this.placeOwnedUnlocks();
    this.paintFarmFromPerformance();
    this.worldLayer = new WorldChallengeLayer(this);
    this.animalLayer = new AnimalPaddockLayer(this);
    try {
      this.animalLayer.spawn(this.animalChallenge);
    } catch (err) {
      console.warn('Animal paddock failed to spawn', err);
    }
    this.cleaningLayer = new CleaningYardLayer(this);
    try {
      this.cleaningLayer.spawn(this.cleaningChallenge);
    } catch (err) {
      console.warn('Cleaning yard failed to spawn', err);
    }
    this.refreshActiveChallenges();
    this.refreshChallengeMarkers();
    this.createPlantPlotMarkers();
    this.farmShopLayer = new FarmShopLayer(this);
    try {
      this.farmShopLayer.spawn();
      this.ensurePhysicalFarmShop();
    } catch (err) {
      console.warn('Farm shop failed to spawn', err);
    }
    this.populateEnemies();
    this.createPlayer();
    this.bindKeys();
    this.createCamera();
    createGameAnimations(this);
    this.startTime = this.time.now;
    this.bindFarmBridge();
    this.bindWindowKeys();
    this.farmInputLocked = false;
    this.uiInputLocked = false;
    this._uiOverlayPaused = false;
    void warmupAssessmentSession();
    try {
      this.physics?.world?.resume?.();
    } catch {
      /* ignore */
    }
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.releaseStaleFarmLocks();
    this.focusGameCanvas();
    this.time.delayedCall(50, () => this.releaseStaleFarmLocks());
    this.time.delayedCall(250, () => {
      this.releaseStaleFarmLocks();
      this.focusGameCanvas();
    });

    if (this._resumeSnapshot) {
      this.applyRunSnapshot(this._resumeSnapshot);
      this._resumeSnapshot = null;
    } else {
      // Previous-level performance / improvement cash bonus (next-level grant)
      const pendingBonus = consumePendingGameplayBonus();
      if (pendingBonus?.totalBonus > 0) {
        this.currentMoney += pendingBonus.totalBonus;
        this.levelStartMoney = this.currentMoney;
        this.gameplayAppliedBonus = pendingBonus;
        this.syncMoneyAliases();
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'gameplay_bonus_applied',
          ...pendingBonus,
          currentMoney: this.currentMoney,
        });
      }
    }

    this.persistFarmResumeCursor();
    this.emitFarmState();
    this.emitPlayerMapPos();
    this.bindRunPersistence();

    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: true });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'farm' });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    });

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'mastery_goal_set',
      mastery: this.mastery,
      masteryPercent: Math.round(this.mastery * 100),
      performanceBand: this.performanceBand,
      timeTargetMs: this.timeTargetMs,
      timeTargetLabel: formatResponseTime(this.timeTargetMs),
      maxQuestions: DDA_CONFIG.maxQuestions,
      harvestTarget: this.harvestTarget,
      cropName: this.farmLevel.cropName,
      cropId: this.farmLevel.cropId,
      source: this.masterySource,
      fromLevelId: this.masteryFromLevelId,
      levelId: this.levelId,
    });

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'gameplay_adapt_set',
      levelId: this.levelId,
      gameplayBand: this.gameplayBand,
      gameplayLabel: this.gameplaySettings.label,
      settings: this.gameplaySettings,
      previousLevel: this.gameplayPreviousLevel,
      appliedBonus: this.gameplayAppliedBonus,
      nextGameplaySettings: this.gameplaySettings,
    });
  }

  captureRunSnapshot() {
    if (this.forestUnlocked) return null;
    const answered = this.questionsAnswered();
    if (!this.player && answered <= 0) {
      const plantedIds = this.cropPlantedSet?.size || 0;
      const soldAny = Object.values(this.cropSoldMap || {}).some((n) => Number(n) > 0);
      if (!planted.length && plantedIds <= 0 && !soldAny) return null;
    }
    const planted = (this.plantedCrops || [])
      .filter((crop) => crop?.active && crop.cropState !== 'harvested')
      .map((crop) => ({
        gridX: crop.gridX,
        gridY: crop.gridY,
        gridKey: crop.gridKey,
        cropType: crop.cropType,
        cropState: crop.cropState,
      }));
    return {
      levelId: this.levelId,
      currentMoney: this.currentMoney,
      playerTileX: this.player ? this.player.x / TILE_SIZE : 48,
      playerTileY: this.player ? this.player.y / TILE_SIZE : 32,
      carriedCount: this.carriedCount || 0,
      carryStack: [...(this.carryStack || [])],
      harvestedItemsCount: this.harvestedItemsCount || 0,
      cropsHarvestedTotal: this.cropsHarvestedTotal || 0,
      cropsSoldThisChallenge: this.cropsSoldThisChallenge || 0,
      harvestTarget: this.harvestTarget,
      cropSoldMap: { ...(this.cropSoldMap || {}) },
      cropPlantedSet: [...(this.cropPlantedSet || [])],
      cropHarvestMap: { ...(this.cropHarvestMap || {}) },
      cropId: this.farmLevel?.cropId || this.cropChallenge?.cropId || '',
      cropName: this.farmLevel?.cropName || this.cropChallenge?.cropName || '',
      cropChallengeId: this.cropChallenge?.id || null,
      cropChallengeList: this.buildCropChallengeProgress(),
      levelCropSlot: this.levelCropSlot || 0,
      harvestUnlocked: Boolean(this.harvestUnlocked),
      plantDoneForChallenge: Boolean(this.plantDoneForChallenge),
      loadUnlocked: Boolean(this.loadUnlocked),
      animalTended: Boolean(this.animalTended),
      animalCollectedTotal: this.animalCollectedTotal || 0,
      animalSoldThisChallenge: this.animalSoldThisChallenge || 0,
      animalCollectUnlocked: Boolean(this.animalCollectUnlocked),
      cleanStarted: Boolean(this.cleanStarted),
      cleanSweptTotal: this.cleanSweptTotal || 0,
      cleanSoldThisChallenge: this.cleanSoldThisChallenge || 0,
      cleanSweepUnlocked: Boolean(this.cleanSweepUnlocked),
      levelCropComplete: Boolean(this.levelCropComplete),
      levelAnimalComplete: Boolean(this.levelAnimalComplete),
      levelCleanComplete: Boolean(this.levelCleanComplete),
      quizCorrect: this.quizCorrect || 0,
      quizIncorrect: this.quizIncorrect || 0,
      questionsAnswered: answered,
      maxQuestions: DDA_CONFIG.maxQuestions,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
      assessmentSession: exportAssessmentSession(),
      attemptScores: [...(this.attemptScores || [])],
      responseTimesMs: [...(this.responseTimesMs || [])],
      retryCount: this.retryCount || 0,
      levelElapsedMs: Math.max(0, Date.now() - (this.levelStartedAtMs || Date.now())),
      plantedCrops: planted,
      shopStock: this.worldShop?.shopStock
        ? { ...this.worldShop.shopStock }
        : {},
      cropLibraryIndex: this.cropChallenge?.index ?? getCropChallengeIndex(),
      animalLibraryIndex: this.animalChallenge?.index ?? getAnimalChallengeIndex(),
      cleanLibraryIndex:
        this.cleaningChallenge?.index ?? getCleaningChallengeIndex(),
    };
  }

  persistFarmRun() {
    if (this.forestUnlocked || this._runEnded) {
      clearFarmRun();
      return null;
    }
    if (!this.sys?.isActive?.()) return null;
    const snap = this.captureRunSnapshot();
    if (!snap) return null;
    return saveFarmRun(snap);
  }

  applyRunSnapshot(snap) {
    if (!snap || Number(snap.levelId) !== Number(this.levelId)) return;
    this.currentMoney = Math.max(0, Number(snap.currentMoney) || 0);
    this.earnings = this.currentMoney;
    this.levelStartMoney = this.currentMoney;
    this.carriedCount = Math.max(0, Number(snap.carriedCount) || 0);
    this.carryStack = Array.isArray(snap.carryStack) ? [...snap.carryStack] : [];
    this.harvestedItemsCount = Number(snap.harvestedItemsCount) || 0;
    this.inventory = this.harvestedItemsCount;
    this.cropsHarvestedTotal = Number(snap.cropsHarvestedTotal) || 0;
    this.cropsSoldThisChallenge = Number(snap.cropsSoldThisChallenge) || 0;
    if (Number(snap.harvestTarget) > 0) this.harvestTarget = Number(snap.harvestTarget);
    this.cropSoldMap = { ...(snap.cropSoldMap || {}) };
    this.cropPlantedSet = new Set(
      (Array.isArray(snap.cropPlantedSet)
        ? snap.cropPlantedSet
        : Object.keys(snap.cropPlantedSet || {})
      )
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );
    this.cropHarvestMap = { ...(snap.cropHarvestMap || {}) };
    if (Number.isFinite(Number(snap.levelCropSlot))) {
      this.levelCropSlot = Math.max(0, Number(snap.levelCropSlot) || 0);
    }
    this.harvestUnlocked = Boolean(snap.harvestUnlocked);
    this.plantDoneForChallenge = Boolean(snap.plantDoneForChallenge);
    this.loadUnlocked = Boolean(snap.loadUnlocked);
    this.animalTended = Boolean(snap.animalTended);
    this.animalCollectedTotal = Number(snap.animalCollectedTotal) || 0;
    this.animalSoldThisChallenge = Number(snap.animalSoldThisChallenge) || 0;
    this.animalCollectUnlocked = Boolean(snap.animalCollectUnlocked);
    this.cleanStarted = Boolean(snap.cleanStarted);
    this.cleanSweptTotal = Number(snap.cleanSweptTotal) || 0;
    this.cleanSoldThisChallenge = Number(snap.cleanSoldThisChallenge) || 0;
    this.cleanSweepUnlocked = Boolean(snap.cleanSweepUnlocked);
    this.levelCropComplete = Boolean(snap.levelCropComplete);
    this.levelAnimalComplete = Boolean(snap.levelAnimalComplete);
    this.levelCleanComplete = Boolean(snap.levelCleanComplete);
    this.quizCorrect = Number(snap.quizCorrect) || 0;
    this.quizIncorrect = Number(snap.quizIncorrect) || 0;
    this.attemptScores = Array.isArray(snap.attemptScores) ? [...snap.attemptScores] : [];
    this.responseTimesMs = Array.isArray(snap.responseTimesMs)
      ? [...snap.responseTimesMs]
      : [];
    this.retryCount = Number(snap.retryCount) || 0;
    this.frustrationScore = Number(snap.frustrationScore) || this.frustrationScore || 0;
    this.frustrationLevel = snap.frustrationLevel || this.frustrationLevel || 'low';
    if (snap.assessmentSession) {
      restoreAssessmentSession(snap.assessmentSession);
    }
    const elapsed = Math.max(0, Number(snap.levelElapsedMs) || 0);
    this.levelStartedAtMs = Date.now() - elapsed;
    if (this.harvestUnlocked) this.harvestArmedUntil = Date.now() + 60_000;
    if (this.animalCollectUnlocked) this.animalCollectArmedUntil = Date.now() + 60_000;
    if (this.cleanSweepUnlocked) this.cleanSweepArmedUntil = Date.now() + 60_000;

    const tileX = Number(snap.playerTileX);
    const tileY = Number(snap.playerTileY);
    if (this.player && Number.isFinite(tileX) && Number.isFinite(tileY)) {
      this.player.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);
    }

    if (Array.isArray(snap.plantedCrops)) {
      for (const row of snap.plantedCrops) {
        const cell = {
          key: row.gridKey || `${row.gridX},${row.gridY}`,
          gridX: row.gridX,
          gridY: row.gridY,
        };
        const crop = this.spawnCropAtCell(cell, 0, { cropType: row.cropType });
        if (crop && row.cropState === 'readyToHarvest') {
          if (crop._growTimer) crop._growTimer.remove(false);
          crop.markReady();
        }
      }
    }

    if (this.worldShop && snap.shopStock && typeof snap.shopStock === 'object') {
      this.worldShop.shopStock = { ...snap.shopStock };
      try {
        this.farmShopLayer?.refreshStock?.(this.worldShop);
      } catch {
        /* optional */
      }
    }

    if (this.animalTended && this.animalLayer && !this.animalLayer.tended) {
      try {
        this.animalLayer.tend();
      } catch {
        /* ignore */
      }
    }
    if (this.cleanStarted && this.cleaningLayer) {
      this.cleaningLayer.started = true;
    }

    const resumeCropId = String(snap.cropId || this.farmLevel?.cropId || '').trim();
    if (resumeCropId) {
      this._activateBedChallenge(resumeCropId);
    }
    this.plantDoneForChallenge = Boolean(
      (resumeCropId && this.cropPlantedSet.has(resumeCropId)) ||
        snap.plantDoneForChallenge,
    );

    try {
      this.createPlantPlotMarkers();
    } catch {
      /* plots optional */
    }
    this.refreshActiveChallenges();
    this.refreshPersonalizedActivities();

    this.syncCarryTrail();
    this.syncMoneyAliases();
    this.pinFarmCamera();
  }

  bindRunPersistence() {
    this._onSaveFarmRun = () => this.persistFarmRun();
    ForestGameBridge.on(FARM_EVENTS.SAVE_FARM_RUN, this._onSaveFarmRun);
    this._onRunHide = () => this.persistFarmRun();
    window.addEventListener('visibilitychange', this._onRunHide);
    window.addEventListener('pagehide', this._onRunHide);
    this._runSaveTimer = this.time.addEvent({
      delay: 12000,
      loop: true,
      callback: () => this.persistFarmRun(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.persistFarmRun();
      ForestGameBridge.off(FARM_EVENTS.SAVE_FARM_RUN, this._onSaveFarmRun);
      window.removeEventListener('visibilitychange', this._onRunHide);
      window.removeEventListener('pagehide', this._onRunHide);
      this._runSaveTimer?.remove?.(false);
    });
  }

  /**
   * Advance to the next farm without tearing down Phaser.
   * scene.restart() / start() on a live GameScene kills arrow keys.
   */
  beginNextLevel(data = {}) {
    clearFarmRun();
    this._resumeSnapshot = null;
    this._runEnded = false;
    const registryLevel = Number(this.registry?.get?.('farmLevelId'));
    this.levelId = Math.max(
      1,
      Number(data?.levelId) ||
        (Number.isFinite(registryLevel) ? registryLevel : 0) ||
        (this.levelId || 1) + 1,
    );
    this.registry?.set?.('farmLevelId', this.levelId);
    const cash = Number(data?.startingMoney);
    this.devStartingMoney = Number.isFinite(cash) && cash >= 0 ? cash : this.currentMoney || 0;
    this.storyline = data?.storyline ?? this.registry?.get?.('storyline') ?? this.storyline ?? null;

    this.pendingQuizMode = null;
    this.pendingWorldChallenge = null;
    this.pendingItemChallenge = null;
    this.forestUnlocked = false;
    this.farmInputLocked = false;
    this.uiInputLocked = false;
    this._uiOverlayPaused = false;
    this._uiOwnedWorldPause = false;
    this.quizOpenedAt = 0;
    this.lastQuestionId = null;
    this.harvestArmedUntil = 0;
    this.animalCollectArmedUntil = 0;
    this.cleanSweepArmedUntil = 0;
    this.plantDoneForChallenge = false;
    this.harvestUnlocked = false;
    this.loadUnlocked = false;
    this.unloadUnlocked = true;
    this.animalCollectUnlocked = false;
    this.cleanSweepUnlocked = false;
    this.currentTargetTile = null;
    this.pendingGridKey = null;
    this.pendingPatchCells = [];

    this.farmLevel = getFarmLevel(this.levelId);
    this.baseCropValue = this.farmLevel.cropValue;
    this.currentMoney = this.devStartingMoney || 0;
    this.earnings = this.currentMoney;
    this.harvestedItemsCount = 0;
    this.carriedCount = 0;
    this.inventory = 0;
    this.carryStack = [];
    this.clearAllCrops({ silent: true });

    this.quizCorrect = 0;
    this.quizIncorrect = 0;
    this.attemptScores = [];
    this.responseTimesMs = [];
    this.levelAttempts = [];
    this.answerResults = [];
    this.retryCount = 0;
    this.levelStartedAtMs = Date.now();
    this.levelStartMoney = this.currentMoney;
    this.startTime = this.time.now;

    const prior = getMasteryForLevelStart(this.levelId);
    this.mastery = prior.mastery;
    this.masterySource = prior.source;
    this.masteryFromLevelId = prior.fromLevelId;
    this.performanceBand = prior.band;
    this.timeTargetMs = prior.timeTargetMs;
    this.cashTarget = null;
    this.ddaCalibrated = true;
    this.harvestTarget = harvestTargetFromMastery(this.mastery);
    this.cropsHarvestedTotal = 0;
    this.cropsSoldThisChallenge = 0;
    this.cropSoldMap = {};
    this.cropPlantedSet = new Set();
    this.cropHarvestMap = {};
    this.animalCollectedTotal = 0;
    this.animalSoldThisChallenge = 0;
    this.animalTended = false;
    this.cleanSweptTotal = 0;
    this.cleanSoldThisChallenge = 0;
    this.cleanStarted = false;
    const patch = plantPatchFromMastery(this.mastery);
    const gameplayStart = getGameplayForLevelStart(this.levelId);
    this.gameplayBand = gameplayStart.band;
    this.gameplaySettings = gameplayStart.settings;
    this.gameplaySettingsBase = { ...gameplayStart.settings };
    this.gameplayPreviousLevel = gameplayStart.previousLevel;
    this.gameplayAppliedBonus = null;
    this.levelTargetCompletionMs = this.gameplaySettings.levelTargetTimeMs;
    this.answerTimerMs = this.gameplaySettings.answerTimerMs;
    this.applyFrustrationGamePersonalization({ respawnSpeedOnly: false });

    this.farmLevel = {
      ...this.farmLevel,
      targetEarnings: null,
      timeTargetMs: this.timeTargetMs,
      harvestTarget: this.harvestTarget,
      maxQuestions: DDA_CONFIG.maxQuestions,
      plantPatchCols: patch.cols,
      plantPatchRows: patch.rows,
      plantFillRatio: patch.fillRatio ?? 0.78,
      cropValue: cropValueFromMastery(this.baseCropValue, this.mastery),
      goalText: goalTextFromMastery(
        this.timeTargetMs,
        this.mastery,
        this.harvestTarget,
      ),
      gameplayBand: this.gameplayBand,
      answerTimerMs: this.answerTimerMs,
      levelTargetCompletionMs: this.levelTargetCompletionMs,
    };

    this.bindLevelLibrary();
    try {
      this.applyCurrentCropChallenge({ resetProgress: true });
      this.applyCurrentAnimalChallenge({ resetProgress: true });
      this.applyCurrentCleaningChallenge({ resetProgress: true });
    } catch (err) {
      console.warn('Level challenge library failed to apply', err);
    }

    this.clearPlacedUnlocks();
    this.placeOwnedUnlocks();
    this.paintFarmFromPerformance();
    try {
      this.animalLayer?.spawn(this.animalChallenge);
    } catch (err) {
      console.warn('Animal paddock failed to spawn', err);
    }
    try {
      this.cleaningLayer?.spawn(this.cleaningChallenge);
    } catch (err) {
      console.warn('Cleaning yard failed to spawn', err);
    }
    this.refreshActiveChallenges();
    this.refreshChallengeMarkers();
    this.createPlantPlotMarkers();

    this.enemiesGroup?.clear(true, true);
    this.populateEnemies();

    if (this.exit) {
      this.exit.setAlpha(0);
      if (this.exit.body) this.exit.body.enable = false;
    }

    const spawnX = 48 * TILE_SIZE;
    const spawnY = 32 * TILE_SIZE;
    if (this.player) {
      this.player.setImmovable(false);
      this.player.setVelocity(0);
      if (this.player.body) {
        this.player.body.enable = true;
        this.player.body.moves = true;
        this.player.body.pushable = true;
        this.player.body.reset(spawnX, spawnY);
      } else {
        this.player.setPosition(spawnX, spawnY);
      }
    }
    if (this.moveKeys) {
      this.moveKeys.up = false;
      this.moveKeys.down = false;
      this.moveKeys.left = false;
      this.moveKeys.right = false;
      this.moveKeys.space = false;
    }

    try {
      this.physics?.world?.resume?.();
    } catch {
      /* ignore */
    }
    this.thawFarmCombat();
    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
      this.input.keyboard.resetKeys?.();
    }
    this.pinFarmCamera();

    const pendingBonus = consumePendingGameplayBonus();
    if (pendingBonus?.totalBonus > 0) {
      this.currentMoney += pendingBonus.totalBonus;
      this.levelStartMoney = this.currentMoney;
      this.gameplayAppliedBonus = pendingBonus;
      this.syncMoneyAliases();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'gameplay_bonus_applied',
        ...pendingBonus,
        currentMoney: this.currentMoney,
      });
    }

    this.releaseStaleFarmLocks();
    this.focusGameCanvas();
    this.persistFarmResumeCursor();
    this.emitFarmState();
    this.emitPlayerMapPos();

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'mastery_goal_set',
      mastery: this.mastery,
      masteryPercent: Math.round(this.mastery * 100),
      performanceBand: this.performanceBand,
      timeTargetMs: this.timeTargetMs,
      timeTargetLabel: formatResponseTime(this.timeTargetMs),
      maxQuestions: DDA_CONFIG.maxQuestions,
      harvestTarget: this.harvestTarget,
      cropName: this.farmLevel.cropName,
      cropId: this.farmLevel.cropId,
      source: this.masterySource,
      fromLevelId: this.masteryFromLevelId,
      levelId: this.levelId,
    });
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'gameplay_adapt_set',
      levelId: this.levelId,
      gameplayBand: this.gameplayBand,
      gameplayLabel: this.gameplaySettings.label,
      settings: this.gameplaySettings,
      previousLevel: this.gameplayPreviousLevel,
      appliedBonus: this.gameplayAppliedBonus,
      nextGameplaySettings: this.gameplaySettings,
    });
  }

  createGroups() {
    this.enemiesGroup = this.add.group();
    this.projectilesGroup = this.add.group();
    this.cropsGroup = this.add.group();
  }

  bindKeys() {
    // enableCapture=false so Space / arrows / E / Q never block typing in React inputs
    this.cursors = this.input.keyboard.addKeys(
      {
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      },
      false,
    );
    this.keyPlant = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
      false,
    );
    this.sellKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.Q,
      false,
    );
    this.keySell = this.sellKey;

    this.moveKeys = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
    };

    // Make sure browser captures from older Phaser defaults are cleared
    try {
      this.input.keyboard.removeCapture([
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.D,
        Phaser.Input.Keyboard.KeyCodes.E,
        Phaser.Input.Keyboard.KeyCodes.Q,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.BACKSPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      ]);
    } catch {
      /* older Phaser */
    }

    this.sellKey.off('down');
    this.keyPlant.off('down');
    this.sellKey.on('down', () => {
      if (!this.sys?.isActive()) return;
      if (this.shouldIgnoreGameKeys()) return;
      this.handleSellInventory();
    });
    this.keyPlant.on('down', () => {
      if (!this.sys?.isActive()) return;
      if (this.shouldIgnoreGameKeys()) return;
      this.handleInteractKey();
    });
  }

  /**
   * True when a React overlay owns the keyboard (quiz typing, Sage, shop…).
   */
  isTextOverlayOpen() {
    return Boolean(
      this.isScienceQuizOpen() ||
        this.isAvatarOpen() ||
        this.isPauseOpen() ||
        this.isUnlockShopOpen() ||
        this.isQuestScrollOpen() ||
        this.isMotivationOpen() ||
        document.querySelector('.student-login'),
    );
  }

  /**
   * True when WASD / Q / E / Space must reach the DOM (typed quiz answers).
   * Checks both event.target and activeElement — capture-phase handlers can
   * see the canvas as target while the input still has focus.
   */
  shouldPassKeysToDom(event = null) {
    if (
      this.isTypingTarget(event?.target) ||
      this.isTypingTarget(document.activeElement)
    ) {
      return true;
    }
    if (this.isTextOverlayOpen()) return true;
    const overlaySel = [
      '.avatar-assistant-overlay',
      '.science-quiz-overlay',
      '.unlock-shop-overlay',
      '.farm-pause-overlay',
      '.quest-scroll-overlay',
      '.motivation-overlay',
      '.student-login',
    ].join(',');
    return Boolean(
      event?.target?.closest?.(overlaySel) ||
        document.activeElement?.closest?.(overlaySel),
    );
  }

  /**
   * True when focus is in React text fields / overlays (avatar, quiz, shop…).
   * Prevents Phaser from eating Space, E, Q, and other letters while typing.
   */
  shouldIgnoreGameKeys(event = null) {
    if (this.shouldPassKeysToDom(event)) return true;
    if (this.uiInputLocked) return true;
    return false;
  }

  isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (tag === 'INPUT') {
      const type = String(el.type || 'text').toLowerCase();
      if (
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'button' ||
        type === 'submit' ||
        type === 'reset'
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Capture-phase window keys so Q/E work after React UI steals canvas focus.
   * Q is NEVER blocked by farmInputLocked (stuck quiz lock was swallowing sells).
   * Arrow / WASD movement is blocked while a science quiz or quest scroll is open.
   */
  bindWindowKeys() {
    this.moveKeys = this.moveKeys || {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
    };

    const setMove = (code, isDown) => {
      if (code === 'ArrowUp' || code === 'KeyW') this.moveKeys.up = isDown;
      else if (code === 'ArrowDown' || code === 'KeyS') this.moveKeys.down = isDown;
      else if (code === 'ArrowLeft' || code === 'KeyA') this.moveKeys.left = isDown;
      else if (code === 'ArrowRight' || code === 'KeyD') this.moveKeys.right = isDown;
      else if (code === 'Space') this.moveKeys.space = isDown;
    };

    this._clearMoveKeys = () => {
      this.moveKeys.up = false;
      this.moveKeys.down = false;
      this.moveKeys.left = false;
      this.moveKeys.right = false;
      this.moveKeys.space = false;
    };

    this._onWindowKeyDown = (event) => {
      // Capture-phase: never preventDefault while a typed quiz (or other overlay) is open.
      if (this.shouldPassKeysToDom(event)) return;

      const { code } = event;
      const isMove =
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD';
      if (isMove) {
        event.preventDefault();
        setMove(code, true);
        try {
          if (this.scene?.isPaused?.()) this.scene.resume();
        } catch {
          /* ignore */
        }
        this.releaseStaleFarmLocks();
        return;
      }

      if (!this.sys?.isActive()) return;
      if (this.shouldIgnoreGameKeys(event)) return;
      if (code === 'Space') {
        event.preventDefault();
        setMove(code, true);
      }

      if (event.repeat) return;

      if (code === 'KeyQ') {
        event.preventDefault();
        this.handleSellInventory();
        return;
      }
      if (code === 'KeyE') {
        if (this.farmInputLocked || this.uiInputLocked) return;
        event.preventDefault();
        this.handleInteractKey();
      }
    };

    this._onWindowKeyUp = (event) => {
      setMove(event.code, false);
    };

    window.addEventListener('keydown', this._onWindowKeyDown, true);
    window.addEventListener('keyup', this._onWindowKeyUp, true);
    window.addEventListener('blur', this._clearMoveKeys);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this._onWindowKeyDown, true);
      window.removeEventListener('keyup', this._onWindowKeyUp, true);
      window.removeEventListener('blur', this._clearMoveKeys);
      this._clearMoveKeys();
    });
  }

  isScienceQuizOpen() {
    return Boolean(document.querySelector('.science-quiz-overlay'));
  }

  isQuestScrollOpen() {
    return Boolean(document.querySelector('.quest-scroll-overlay'));
  }

  isUnlockShopOpen() {
    return Boolean(document.querySelector('.unlock-shop-overlay'));
  }

  isMotivationOpen() {
    return Boolean(document.querySelector('.motivation-overlay'));
  }

  isPauseOpen() {
    return Boolean(document.querySelector('.farm-pause-overlay'));
  }

  isAvatarOpen() {
    return Boolean(document.querySelector('.avatar-assistant-overlay'));
  }

  /** True while a modal should freeze combat (Sage, quest scroll, shop, motivation).
   * Science quizzes stay live: enemies and customers keep moving so the map can warn. */
  isFarmCombatFrozen() {
    return Boolean(
      this.isQuestScrollOpen() ||
        this.isUnlockShopOpen() ||
        this.isMotivationOpen() ||
        this.isPauseOpen() ||
        this.isAvatarOpen(),
    );
  }

  isAnswerLockActive() {
    return Boolean(this.pendingQuizMode || this.isScienceQuizOpen());
  }

  /** Stop walking/shooting during a quiz without pausing the farm world. */
  lockPlayerForAnswer() {
    this.farmInputLocked = true;
    this.player?.setVelocity(0);
    this._clearMoveKeys?.();
    if (this._farmCombatFrozen || this.physics?.world?.isPaused) {
      this.thawFarmCombat();
    }
  }

  /** Freeze player + enemies while quest scroll / shop / Sage owns the screen. */
  freezeFarmForQuiz() {
    this.farmInputLocked = true;
    this._farmCombatFrozen = true;
    this.player?.setVelocity(0);
    this._clearMoveKeys?.();
    try {
      this.enemiesGroup?.getChildren?.()?.forEach((enemy) => {
        if (!enemy?.body) return;
        // Keep patrol velocity across freeze; only snapshot once per freeze session
        if (enemy._frozenVx === undefined) {
          enemy._frozenVx = enemy.body.velocity.x;
          enemy._frozenVy = enemy.body.velocity.y;
        }
        enemy.setVelocity(0);
        enemy.body.moves = false;
      });
    } catch {
      /* ignore */
    }
    try {
      this.physics?.world?.pause?.();
    } catch {
      /* ignore */
    }
    if (!this._worldHoldStartedAt) {
      this._worldHoldStartedAt = Date.now();
    }
    try {
      this.time.paused = true;
    } catch {
      /* ignore */
    }
  }

  /** Resume Arcade + enemy patrol after quiz / quest scroll. */
  thawFarmCombat() {
    this._farmCombatFrozen = false;
    try {
      this.enemiesGroup?.getChildren?.()?.forEach((enemy) => {
        if (!enemy?.body) return;
        const hadSnapshot =
          enemy._frozenVx !== undefined || enemy._frozenVy !== undefined;
        if (hadSnapshot && typeof enemy.resumePatrol === 'function') {
          enemy.resumePatrol(enemy._frozenVx, enemy._frozenVy);
          delete enemy._frozenVx;
          delete enemy._frozenVy;
        } else if (!enemy.body.moves && typeof enemy.resumePatrol === 'function') {
          enemy.resumePatrol();
        } else {
          enemy.body.moves = true;
        }
      });
    } catch {
      /* ignore */
    }
    try {
      this.physics?.world?.resume?.();
    } catch {
      /* ignore */
    }
    if (this._worldHoldStartedAt) {
      const held = Date.now() - this._worldHoldStartedAt;
      this._worldHoldStartedAt = 0;
      if (this.levelStartedAtMs) this.levelStartedAtMs += held;
    }
    try {
      this.time.paused = false;
    } catch {
      /* ignore */
    }
  }

  /**
   * Shop / missed quiz close can leave Arcade paused and the hero wedged.
   * Walking is restored whenever quiz / quest scroll are not on screen.
   */
  releaseStaleFarmLocks() {
    if (this.isFarmCombatFrozen() || this.isAnswerLockActive()) return;
    const needsThaw =
      this._farmCombatFrozen || Boolean(this.physics?.world?.isPaused);
    this.farmInputLocked = false;
    this.uiInputLocked = false;
    this._uiOverlayPaused = false;
    this._uiOwnedWorldPause = false;
    try {
      if (this.scene?.isPaused?.()) this.scene.resume();
    } catch {
      /* ignore */
    }
    if (needsThaw) this.thawFarmCombat();
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    if (this.player) {
      this.player.setImmovable(false);
      if (this.player.body) {
        this.player.body.enable = true;
        this.player.body.moves = true;
        this.player.body.pushable = true;
      }
    }
  }

  bindFarmBridge() {
    this._onPlant = () => {
      if (!this.sys?.isActive()) return;
      this.handlePlantingAttempt();
    };
    this._onQuizSuccess = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onScienceCorrect(payload);
    };
    this._onQuizFailure = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onScienceIncorrect(payload);
    };
    this._onSell = () => {
      if (!this.sys?.isActive()) return;
      this.handleSellInventory();
    };
    this._onPurchaseUnlock = (payload) => {
      if (!this.sys?.isActive()) return;
      this.handlePurchaseUnlock(payload);
    };
    this._onStartItemChallenge = (payload) => {
      if (!this.sys?.isActive()) return;
      if (isStorylineItemId(payload?.itemId)) {
        this.tryStartStorylineChallenge(payload.itemId);
        return;
      }
      this.beginItemChallenge(payload);
    };
    this._onStudentState = (payload) => {
      if (!this.sys?.isActive()) return;
      this.frustrationLevel = payload?.frustrationLevel || 'low';
      this.frustrationScore = Number(payload?.frustrationScore) || 0;
      this.applyFrustrationGamePersonalization({ respawnSpeedOnly: true });
      if (this.worldShop && !this.worldShop.closed) {
        adaptWorldShopFrustration(
          this.worldShop,
          this.frustrationScore,
          this.frustrationLevel,
        );
        this.farmShopLayer?.sync?.(this.worldShop);
        this.emitFarmShopState();
      }
    };
    this._onFarmShopUnload = (payload = {}) => {
      if (!this.sys?.isActive()) return;
      this.handleFarmShopUnload(payload);
    };
    this._onShopOpen = () => {
      if (!this.sys?.isActive()) return;
      this.farmInputLocked = true;
      this.freezeFarmForQuiz();
    };
    this._onShopClose = () => {
      this.farmInputLocked = false;
      this.uiInputLocked = false;
      this.thawFarmCombat();
      if (this.input?.keyboard) this.input.keyboard.enabled = true;
      this.releaseStaleFarmLocks();
      this.focusGameCanvas();
    };
    this._onFarmCustomerShopResult = (payload) => {
      if (!this.sys?.isActive()) return;
      // Close shop panel — world shop already live; payload may carry leftover sync
      this.closeFarmShopUnload(payload || {});
    };
    this._onUiInputLock = (payload = {}) => {
      const locked = Boolean(payload?.locked);
      const freezeCombat =
        Boolean(payload?.freezeCombat) || this.isFarmCombatFrozen();
      this.uiInputLocked = locked;
      if (this.input?.keyboard) {
        // Disable Phaser keyboard entirely while React overlays need typing/mic
        this.input.keyboard.enabled = !locked;
      }
      if (locked) {
        this.player?.setVelocity(0);
        // Freeze Arcade for Sage / quest scroll / shop. Quizzes keep the farm live.
        if (freezeCombat) {
          this.freezeFarmForQuiz();
          this._uiOwnedWorldPause = true;
        } else if (this._uiOwnedWorldPause) {
          // Overlay still open but combat freeze no longer needed
          this._uiOwnedWorldPause = false;
          this.thawFarmCombat();
        }
      }

      // Pause audio while mentor / quizzes / shop own the screen.
      if (locked && !this._uiOverlayPaused) {
        this._uiOverlayPaused = true;
        this._uiOwnedWorldPause = freezeCombat;
        if (!this._uiOwnedWorldPause) {
          this.thawFarmCombat();
        }
        try {
          // Pause soundtrack + SFX for the mentoring moment
          this.sound?.pauseAll?.();
        } catch {
          /* ignore */
        }
        const track = this.game?.registry?.get?.('soundtrack');
        if (track?.isPlaying) {
          this._uiMusicWasPlaying = true;
          try {
            if (typeof track.pause === 'function') track.pause();
            else track.stop();
          } catch {
            this._uiMusicWasPlaying = false;
          }
        } else {
          this._uiMusicWasPlaying = false;
        }
      } else if (!locked && this._uiOverlayPaused) {
        this._uiOverlayPaused = false;
        if (this._uiOwnedWorldPause && !this.isFarmCombatFrozen()) {
          this.thawFarmCombat();
        }
        this._uiOwnedWorldPause = this.isFarmCombatFrozen();
        try {
          this.sound?.resumeAll?.();
        } catch {
          /* ignore */
        }
        const track = this.game?.registry?.get?.('soundtrack');
        const musicOn = this.game?.registry?.get?.('musicEnabled') !== false;
        if (musicOn && this._uiMusicWasPlaying && track) {
          try {
            if (track.isPaused && typeof track.resume === 'function') {
              track.resume();
            } else if (!track.isPlaying && typeof track.play === 'function') {
              track.play();
            }
          } catch {
            /* ignore */
          }
        } else if (!musicOn && track?.isPlaying) {
          try {
            track.pause?.() || track.stop?.();
          } catch {
            /* ignore */
          }
        }
        this._uiMusicWasPlaying = false;
        this.focusGameCanvas?.();
      }
    };

    // Drop stale handlers from HMR / StrictMode so dead scenes cannot eat events
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PLANT_CROP);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_FAILURE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SELL_INVENTORY_ACTION);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PURCHASE_UNLOCK);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_OPEN);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_CLOSE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.FARM_CUSTOMER_SHOP_RESULT);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.FARM_SHOP_UNLOAD);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UI_INPUT_LOCK);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.START_ITEM_CHALLENGE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SYNC_STUDENT_STATE);
    // NOTE: do NOT removeAllListeners(START_FARM_LEVEL) â€” ForestRPGCanvas owns that

    ForestGameBridge.on(FARM_EVENTS.PLANT_CROP, this._onPlant);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
    ForestGameBridge.on(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
    ForestGameBridge.on(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
    ForestGameBridge.on(
      FARM_EVENTS.FARM_CUSTOMER_SHOP_RESULT,
      this._onFarmCustomerShopResult,
    );
    ForestGameBridge.on(FARM_EVENTS.FARM_SHOP_UNLOAD, this._onFarmShopUnload);
    ForestGameBridge.on(FARM_EVENTS.UI_INPUT_LOCK, this._onUiInputLock);
    ForestGameBridge.on(
      FARM_EVENTS.START_ITEM_CHALLENGE,
      this._onStartItemChallenge,
    );
    ForestGameBridge.on(FARM_EVENTS.SYNC_STUDENT_STATE, this._onStudentState);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.PLANT_CROP, this._onPlant);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
      ForestGameBridge.off(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
      ForestGameBridge.off(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
      ForestGameBridge.off(
        FARM_EVENTS.FARM_CUSTOMER_SHOP_RESULT,
        this._onFarmCustomerShopResult,
      );
      ForestGameBridge.off(FARM_EVENTS.FARM_SHOP_UNLOAD, this._onFarmShopUnload);
      ForestGameBridge.off(FARM_EVENTS.UI_INPUT_LOCK, this._onUiInputLock);
      ForestGameBridge.off(
        FARM_EVENTS.START_ITEM_CHALLENGE,
        this._onStartItemChallenge,
      );
      ForestGameBridge.off(FARM_EVENTS.SYNC_STUDENT_STATE, this._onStudentState);
    });
  }

  syncMoneyAliases() {
    this.earnings = this.currentMoney;
    this.inventory = this.harvestedItemsCount;
  }

  /** Runtime counters shared by crop progression + quest scroll. */
  cropProgressRuntime() {
    return {
      harvestTarget: this.harvestTarget,
      cropsHarvestedTotal: this.cropsHarvestedTotal || 0,
      cropsSoldThisChallenge: this.cropsSoldThisChallenge || 0,
      carriedCount: this.carriedCount || 0,
      plantDoneForChallenge: Boolean(this.plantDoneForChallenge),
      loadUnlocked: Boolean(this.loadUnlocked),
      pendingQuizMode: this.pendingQuizMode || null,
      shopStockQty: shopStockForCrop(this.worldShop, this.farmLevel?.cropId),
      shopStockMap: this.worldShop?.shopStock || {},
      // Per-crop maps for free-choice model
      cropSoldMap: this.cropSoldMap || {},
      cropPlantedSet: this.cropPlantedSet || new Set(),
      cropHarvestMap: this.cropHarvestMap || {},
    };
  }

  buildCropChallengeProgress() {
    return buildLevelCropChallengeList(
      this.levelPlan,
      this.levelCropSlot ?? 0,
      this.cropProgressRuntime(),
      this.mastery,
    );
  }

  activeCropChallengeEntry() {
    const list = this.buildCropChallengeProgress();
    return list.find((c) => c.enabled) || list[this.levelCropSlot ?? 0] || null;
  }

  currentCropChallengeStatus() {
    return (
      this.activeCropChallengeEntry()?.status ||
      CROP_CHALLENGE_STATUS.AVAILABLE
    );
  }

  emitFarmState() {
    this.syncMoneyAliases();
    const activePlanted = this.plantedCrops.filter((c) => c?.active);
    const answered = this.quizCorrect + this.quizIncorrect;
    const perfScore = Math.round(averageScore(this.attemptScores));
    const avgMs =
      this.responseTimesMs.length > 0
        ? Math.round(
            this.responseTimesMs.reduce((a, b) => a + b, 0) /
              this.responseTimesMs.length,
          )
        : 0;
    const levelAvgMs = this.levelAvgResponseMs();
    ForestGameBridge.emit(FARM_EVENTS.FARM_STATE, {
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
      target: this.timeTargetMs,
      timeTargetMs: this.timeTargetMs,
      timeTargetLabel: formatResponseTime(this.timeTargetMs),
      maxQuestions: DDA_CONFIG.maxQuestions,
      inventory: this.harvestedItemsCount,
      harvestedCount: this.harvestedItemsCount,
      harvestedItemsCount: this.harvestedItemsCount,
      carriedCount: this.carriedCount,
      harvestTarget: this.harvestTarget,
      cropsHarvestedTotal: this.cropsHarvestedTotal,
      cropsSoldThisChallenge: this.cropsSoldThisChallenge || 0,
      harvestProgressLabel: `${this.cropsHarvestedTotal}/${this.harvestTarget} ${this.farmLevel.cropName || 'crops'}`,
      levelId: this.farmLevel.id,
      cropName: this.farmLevel.cropName,
      cropId: this.farmLevel.cropId,
      cropChallengeIndex: this.levelCropSlot ?? 0,
      cropChallengeTotal: this.levelPlan?.cropIndexes?.length || 2,
      cropChallengeId: this.cropChallenge?.id || null,
      cropLibraryIndex: this.cropChallenge?.index ?? getCropChallengeIndex(),
      animalLibraryIndex: this.animalChallenge?.index ?? getAnimalChallengeIndex(),
      cleanLibraryIndex:
        this.cleaningChallenge?.index ?? getCleaningChallengeIndex(),
      libraryLevel: this.levelPlan?.level ?? this.levelId,
      libraryLevelCount: LIBRARY_LEVEL_COUNT,
      librarySummary: this.levelPlan?.summary || '',
      levelCropNames: this.levelPlan?.cropNames || [],
      cropChallengeList: this.buildCropChallengeProgress(),
      cropChallengeStatus: this.currentCropChallengeStatus(),
      levelAnimalName: this.levelPlan?.animalName || '',
      levelCleanName: this.levelPlan?.cleanMessName || '',
      levelCropComplete: Boolean(this.levelCropComplete),
      levelAnimalComplete: Boolean(this.levelAnimalComplete),
      levelCleanComplete: Boolean(this.levelCleanComplete),
      animalName: this.animalChallenge?.animalName || 'animals',
      animalProduceName: this.animalChallenge?.produceName || 'produce',
      animalAction: this.animalChallenge?.action || 'feed',
      animalChallengeIndex: 0,
      animalChallengeTotal: 1,
      animalCollectTarget: this.animalCollectTarget,
      animalCollectedTotal: this.animalCollectedTotal || 0,
      animalSoldThisChallenge: this.animalSoldThisChallenge || 0,
      animalTended: Boolean(this.animalTended),
      animalGoalText:
        this.personalizedAnimal?.goalText ||
        (this.animalChallenge
          ? animalGoalText(this.animalChallenge, this.animalCollectTarget)
          : ''),
      cleanMessName: this.cleaningChallenge?.messName || 'mess',
      cleanWasteName: this.cleaningChallenge?.wasteName || 'waste',
      cleanVerb: this.cleaningChallenge?.verb || 'Clean',
      cleaningChallengeIndex: 0,
      cleaningChallengeTotal: 1,
      cleanSweepTarget: this.cleanSweepTarget,
      cleanSweptTotal: this.cleanSweptTotal || 0,
      cleanSoldThisChallenge: this.cleanSoldThisChallenge || 0,
      cleanStarted: Boolean(this.cleanStarted),
      cleanGoalText:
        this.personalizedClean?.goalText ||
        (this.cleaningChallenge
          ? cleaningGoalText(this.cleaningChallenge, this.cleanSweepTarget)
          : ''),
      cropValue: this.farmLevel.cropValue,
      goalText: this.farmLevel.goalText,
      activityBoard: this.activityBoard || null,
      personalizedChallengeLabel: this.personalizedCrop?.label || null,
      forestUnlocked: this.forestUnlocked,
      farmInputLocked: this.farmInputLocked,
      plantedCount: activePlanted.length,
      gridOccupied: this.plantedGridKeys.size,
      performanceBand: this.performanceBand,
      mastery: this.mastery,
      masteryPercent: Math.round((this.mastery || 0) * 100),
      masterySource: this.masterySource,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      wrongAnswersRemaining: Math.max(
        0,
        MAX_WRONG_ANSWERS - (this.quizIncorrect || 0),
      ),
      maxWrongAnswers: MAX_WRONG_ANSWERS,
      playerHealth: this.player?.playerModel?.health ?? 3,
      questionsAnswered: answered,
      ddaCalibrated: true,
      accuracy:
        answered > 0
          ? Math.round((this.quizCorrect / answered) * 100)
          : 50,
      performanceScore: perfScore,
      avgResponseMs: levelAvgMs || avgMs,
      avgResponseLabel:
        levelAvgMs || avgMs
          ? formatResponseTime(levelAvgMs || avgMs)
          : 'â€”',
      beatTimeTarget:
        levelAvgMs > 0 ? levelAvgMs <= this.timeTargetMs : null,
      ownedUnlockIds: getOwnedUnlockIds(),
      activeChallengeCount: (this.activeChallenges || []).filter((c) => !c.done)
        .length,
      challenges: this.activeChallenges || [],
      playerTileX: this.player
        ? Math.floor(this.player.x / TILE_SIZE)
        : 48,
      playerTileY: this.player
        ? Math.floor(this.player.y / TILE_SIZE)
        : 32,
      mapWidth: this.map?.width ?? 100,
      mapHeight: this.map?.height ?? 75,
      // Adaptive gameplay (separate from mastery / question DDA)
      gameplayBand: this.gameplayBand,
      gameplayLabel: this.gameplaySettings?.label,
      gameplaySettings: this.gameplaySettingsLive || this.gameplaySettings,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
      personalization: {
        answerTimerMs: this.answerTimerMs,
        hintLevel: this.hintLevel,
        maxRetriesPerQuestion: this.maxRetriesPerQuestion,
        enemySpeed: this.enemySpeed,
        cashRewardMultiplier: this.cashRewardMultiplierLive,
        playerSpeedMult: this.playerSpeedMult || 1,
        label:
          this.gameplaySettingsLive?.frustrationGameplayLabel || null,
        combatLabel:
          this.gameplaySettingsLive?.frustrationCombatLabel || null,
      },
      gameplayPreviousLevel: this.gameplayPreviousLevel,
      gameplayAppliedBonus: this.gameplayAppliedBonus,
      nextGameplaySettings: getGameplaySettings(this.gameplayBand),
      retries: this.retryCount,
      answerTimerMs: this.answerTimerMs,
      levelTargetCompletionMs: this.levelTargetCompletionMs,
      levelElapsedSec: Math.max(
        0,
        Math.round((Date.now() - (this.levelStartedAtMs || Date.now())) / 1000),
      ),
      avgAnswerTimeSec: levelAvgMs
        ? Math.round((levelAvgMs / 1000) * 10) / 10
        : null,
      enemyHits: this.enemyHits || 0,
      enemyDeaths: this.enemyDeaths || 0,
      levelRestarts: this.levelRestarts || 0,
    });
  }

  /** Live map pin â€” also mirrors to window so the React map cannot miss updates. */
  emitPlayerMapPos() {
    if (!this.player) return;
    const mapW = this.map?.widthInPixels ?? 100 * TILE_SIZE;
    const mapH = this.map?.heightInPixels ?? 75 * TILE_SIZE;
    const x = Phaser.Math.Clamp(this.player.x, 0, mapW);
    const y = Phaser.Math.Clamp(this.player.y, 0, mapH);
    const playerMapX = x / TILE_SIZE;
    const playerMapY = y / TILE_SIZE;
    const payload = {
      playerMapX,
      playerMapY,
      playerTileX: Math.floor(x / TILE_SIZE),
      playerTileY: Math.floor(y / TILE_SIZE),
      mapWidth: this.map?.width ?? 100,
      mapHeight: this.map?.height ?? 75,
      quizOpen: this.isAnswerLockActive(),
      enemies: this.collectEnemyMapPins(playerMapX, playerMapY),
      customers: this.collectCustomerMapPins(),
    };

    ForestGameBridge.emit(FARM_EVENTS.PLAYER_MAP_POS, payload);
    try {
      window.dispatchEvent(
        new CustomEvent('scipath-player-map', { detail: payload }),
      );
    } catch {
      // ignore
    }
  }

  collectEnemyMapPins(playerMapX, playerMapY) {
    const pins = [];
    const kids = this.enemiesGroup?.getChildren?.() || [];
    for (let i = 0; i < kids.length; i += 1) {
      const enemy = kids[i];
      if (!enemy?.active) continue;
      const ex = enemy.x / TILE_SIZE;
      const ey = enemy.y / TILE_SIZE;
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
      const dx = ex - playerMapX;
      const dy = ey - playerMapY;
      const distTiles = Math.hypot(dx, dy);
      let threat = 'far';
      if (distTiles < 2.4) threat = 'hit';
      else if (distTiles < 6) threat = 'near';
      else if (distTiles < 12) threat = 'watch';
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const dir =
        absX > absY
          ? dx > 0
            ? 'east'
            : 'west'
          : dy > 0
            ? 'south'
            : 'north';
      pins.push({
        id: enemy.name || `enemy-${i}`,
        x: ex,
        y: ey,
        distTiles: Math.round(distTiles * 10) / 10,
        threat,
        dir,
      });
    }
    return pins;
  }

  collectCustomerMapPins() {
    const byId = new Map(
      (this.farmShopLayer?.getMapPins?.() || []).map((p) => [p.id, p]),
    );
    const living = (this.worldShop?.customers || []).filter(
      (c) => c.status !== 'SERVED' && c.status !== 'LEFT',
    );
    return living.map((c, i) => {
      const pin = byId.get(c.id);
      const mood = customerMoodState(c);
      return {
        id: c.id,
        x: pin?.x ?? 43 + i * 2.8,
        y: pin?.y ?? 36,
        queueIndex: Number.isFinite(c.queueIndex) ? c.queueIndex : i,
        face: mood.face,
        label: mood.label,
        mood: mood.key,
        rank: mood.rank,
        reason: mood.reason,
        action: mood.action,
        speech: c.speech || '',
      };
    });
  }

  emitInventoryUpdated() {
    this.syncMoneyAliases();
    ForestGameBridge.emit(FARM_EVENTS.INVENTORY_UPDATED, {
      inventory: this.harvestedItemsCount,
      harvestedCount: this.harvestedItemsCount,
      harvestedItemsCount: this.harvestedItemsCount,
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
      timeTargetMs: this.timeTargetMs,
      cropValue: this.farmLevel.cropValue,
      performanceBand: this.performanceBand,
      mastery: this.mastery,
    });
    this.emitFarmState();
  }

  /**
   * Record this level's quiz attempt (saved for next level's time target).
   * Time target stays fixed from level-start mastery / previous avg.
   */
  recordQuizAttempt(wasCorrect, responseTimeMs = 0) {
    const ms =
      responseTimeMs > 0
        ? responseTimeMs
        : this.quizOpenedAt
          ? Date.now() - this.quizOpenedAt
          : DDA_CONFIG.moderateMs;

    if (wasCorrect) this.quizCorrect += 1;
    else {
      this.quizIncorrect += 1;
      this.retryCount += 1;
    }

    const attempt = { wasCorrect, responseTimeMs: ms };
    this.levelAttempts.push(attempt);
    this.answerResults.push({
      wasCorrect: Boolean(wasCorrect),
      responseTimeMs: ms,
      responseTimeSec: Math.round((ms / 1000) * 10) / 10,
    });

    const attemptScore = scoreAttempt(attempt);
    this.attemptScores.push(attemptScore);
    this.responseTimesMs.push(ms);
    if (this.attemptScores.length > DDA_CONFIG.windowSize) {
      this.attemptScores.shift();
    }
    if (this.responseTimesMs.length > DDA_CONFIG.windowSize) {
      this.responseTimesMs.shift();
    }

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'quiz_attempt',
      wasCorrect,
      responseTimeMs: ms,
      responseLabel: formatResponseTime(ms),
      attemptScore,
      performanceScore: Math.round(averageScore(this.attemptScores)),
      performanceBand: this.performanceBand,
      timeTargetMs: this.timeTargetMs,
      mastery: this.mastery,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      questionsAnswered: this.quizCorrect + this.quizIncorrect,
      retries: this.retryCount,
      quizMode: this.pendingQuizMode,
      challengeId: this.pendingWorldChallenge?.challengeId,
      challengeType: this.pendingWorldChallenge?.challengeType,
      challengeDifficulty: this.pendingWorldChallenge?.difficulty,
      avgAnswerTimeSec: this.levelAvgResponseMs()
        ? Math.round((this.levelAvgResponseMs() / 1000) * 10) / 10
        : null,
      gameplayBand: this.gameplayBand,
    });

    this.syncVegetableGoalText();
    this.persistFarmRun();
  }

  /** Full-level avg response time (not the rolling DDA window). */
  levelAvgResponseMs() {
    if (!this.levelAttempts.length) return 0;
    const sum = this.levelAttempts.reduce(
      (a, att) => a + (Number(att.responseTimeMs) || 0),
      0,
    );
    return Math.round(sum / this.levelAttempts.length);
  }

  /** Full-level attempt scores for unlock-shop pricing. */
  levelAttemptScores() {
    return this.levelAttempts.map((att) => scoreAttempt(att));
  }

  buildShopPerformance() {
    const attemptScores = this.levelAttemptScores();
    const avgResponseMs = this.levelAvgResponseMs();
    const performanceScore = Math.round(averageScore(attemptScores));
    const shopBand = shopBandFromPerformance({
      attemptScores,
      performanceBand: this.performanceBand,
      avgResponseMs,
    });
    return {
      attemptScores,
      avgResponseMs,
      performanceScore,
      performanceBand: shopBand,
      questionsAnswered: this.quizCorrect + this.quizIncorrect,
      enemyHits: this.enemyHits || 0,
      enemyDeaths: this.enemyDeaths || 0,
      levelRestarts: this.levelRestarts || 0,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    };
  }

  persistFarmResumeCursor() {
    const saved = loadFarmProgress();
    const levelId = Math.max(1, this.levelId || 1);
    const savedLevel = saved.currentLevelId || 1;
    saveFarmProgress({
      currentLevelId: Math.max(savedLevel, levelId),
      cash: levelId >= savedLevel ? this.currentMoney || 0 : saved.cash,
    });
  }

  persistLevelMastery() {
    const avgMs = this.levelAvgResponseMs() || null;

    const saved = saveLevelPerformance(this.levelId, {
      attempts: this.levelAttempts,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      avgResponseMs: avgMs,
      timeTargetMs: this.timeTargetMs,
      cash: this.currentMoney || 0,
    });
    return saved;
  }

  /** Persist adaptive gameplay metrics + next-level classification / bonuses. */
  persistGameplayPerformance() {
    const avgMs = this.levelAvgResponseMs() || 0;
    const levelCompletionTimeSec = Math.max(
      0,
      Math.round((Date.now() - (this.levelStartedAtMs || Date.now())) / 1000),
    );
    const cashEarned = Math.max(
      0,
      Math.round(this.currentMoney - (this.levelStartMoney || 0)),
    );
    const settings = this.gameplaySettings || getGameplaySettings('medium');

    return saveGameplayLevelPerformance(this.levelId, {
      correctAnswers: this.quizCorrect,
      incorrectAnswers: this.quizIncorrect,
      answerResults: this.answerResults,
      avgAnswerTimeSec: avgMs ? Math.round((avgMs / 1000) * 10) / 10 : 0,
      previousAvgAnswerTimeSec:
        this.gameplayPreviousLevel?.avgAnswerTimeSec ?? null,
      retries: this.retryCount,
      levelCompletionTimeSec,
      previousLevelCompletionTimeSec:
        this.gameplayPreviousLevel?.levelCompletionTimeSec ?? null,
      answerTimerMs: this.answerTimerMs,
      levelTargetTimeMs: this.levelTargetCompletionMs,
      maxRetriesExpected:
        (settings.maxRetriesPerQuestion || 2) * DDA_CONFIG.maxQuestions,
      cashEarned,
      baseReward: Math.max(cashEarned, this.farmLevel.cropValue * 10, 50),
    });
  }

  /**
   * Open ScienceQuizModal with Assessment Engine /next.
   * Caller must freeze farm + set pendingQuizMode first so actions stay blocked.
   */
  async emitScienceQuizFromEngine(mode, pickMode, extraFromQuestion) {
    const quizGen = (this._scienceQuizGen = (this._scienceQuizGen || 0) + 1);
    try {
      ForestGameBridge.emit(
        FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
        this.withGameplayQuizMeta({
          mode,
          challenge: mode,
          loading: true,
          question: null,
          questionData: null,
          levelId: this.farmLevel.id,
          openedAt: this.quizOpenedAt,
        }),
      );

      const question = await resolveScienceQuestion(
        this.farmLevel,
        this.lastQuestionId,
        pickMode,
      );
      if (!this.sys?.isActive() || quizGen !== this._scienceQuizGen) return false;
      if (!isRenderableQuizQuestion(question)) {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'quiz_blocked',
          reason: 'assessment_unavailable',
          hint: 'Science quiz is unavailable right now. Check Assessment Engine and try again.',
        });
        this.resumeAfterQuiz();
        return false;
      }
      this.lastQuestionId = question.id;
      const extra =
        typeof extraFromQuestion === 'function'
          ? extraFromQuestion(question) || {}
          : extraFromQuestion || {};
      ForestGameBridge.emit(
        FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
        this.withGameplayQuizMeta({
          mode,
          challenge: extra.challenge || mode,
          loading: false,
          question,
          questionData: question,
          rp: question.rp,
          levelId: this.farmLevel.id,
          openedAt: this.quizOpenedAt,
          ...extra,
        }),
      );
      this.emitFarmState();
      return true;
    } catch {
      if (this.sys?.isActive() && quizGen === this._scienceQuizGen) {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'quiz_blocked',
          reason: 'assessment_unavailable',
          hint: 'Science quiz is unavailable right now. Check Assessment Engine and try again.',
        });
        this.resumeAfterQuiz();
      }
      return false;
    }
  }

  /** Attach gameplay-assist fields to science quiz payloads (not question pick). */
  withGameplayQuizMeta(payload = {}) {
    const live =
      this.gameplaySettingsLive ||
      applyFrustrationToGameplaySettings(
        this.gameplaySettingsBase || this.gameplaySettings || getGameplaySettings('medium'),
        this.frustrationScore || 0,
        this.frustrationLevel || 'low',
      );
    const answerTimerMs = live.answerTimerMs || this.answerTimerMs;
    const hintLevel = live.hintLevel || this.hintLevel || 'limited';
    const maxRetries =
      live.maxRetriesPerQuestion || this.maxRetriesPerQuestion || 2;
    return {
      ...payload,
      answerTimerMs,
      hintLevel,
      maxRetriesPerQuestion: maxRetries,
      gameplayBand: this.gameplayBand,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
      gameplayAssist: {
        answerTimerMs,
        hintLevel,
        maxRetriesPerQuestion: maxRetries,
        frustrationLevel: this.frustrationLevel || 'low',
        personalizedLabel: live.frustrationGameplayLabel || null,
      },
      cropId: payload.cropId || this.farmLevel?.cropId,
      cropName: payload.cropName || this.farmLevel?.cropName,
      animalName: this.animalChallenge?.animalName,
      animalProduceName: this.animalChallenge?.produceName,
      messName: this.cleaningChallenge?.messName,
      wasteName: this.cleaningChallenge?.wasteName,
    };
  }

  /** Assign this level's slice of the challenge library. */
  bindLevelLibrary() {
    this.levelPlan = getLevelChallengePlan(this.levelId);
    this.libraryOverride = false;
    this.levelCropSlot = 0;
    this.levelCropComplete = false;
    this.levelAnimalComplete = false;
    this.levelCleanComplete = false;
    setCropChallengeIndex(this.levelPlan.cropIndexes[0] || 0);
    setAnimalChallengeIndex(this.levelPlan.animalIndex || 0);
    setCleaningChallengeIndex(this.levelPlan.cleanIndex || 0);
  }

  /** Vegetable challenges for the gold plant beds — several crops per level. */
  applyCurrentCropChallenge({ resetProgress = false } = {}) {
    if (!this.libraryOverride && this.levelPlan?.cropIndexes?.length) {
      const slot = Math.min(
        this.levelCropSlot || 0,
        this.levelPlan.cropIndexes.length - 1,
      );
      setCropChallengeIndex(this.levelPlan.cropIndexes[slot]);
    }
    const index = getCropChallengeIndex();
    const challenge = getCropChallenge(index);
    const personalized = personalizeCropChallenge(challenge, {
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });
    this.cropChallenge = challenge;
    this.personalizedCrop = personalized;
    this.harvestTarget = personalized.harvestTarget;
    if (resetProgress) {
      this.cropsHarvestedTotal = 0;
      this.cropsSoldThisChallenge = 0;
      // New vegetable challenge → one plant allowed again for the new type
      this.plantDoneForChallenge = false;
      this.harvestUnlocked = false;
      this.loadUnlocked = false;
      this.unloadUnlocked = true;
      this.harvestArmedUntil = 0;
    }
    this.farmLevel = {
      ...this.farmLevel,
      cropId: challenge.cropId,
      cropName: challenge.cropName,
      harvestTarget: personalized.harvestTarget,
      goalText: personalized.goalText,
    };
    this.refreshPersonalizedActivities();
    // Refresh shop order pool so customers ask for the new crop
    if (this.farmShopLayer) this.ensurePhysicalFarmShop();
  }

  syncVegetableGoalText() {
    if (this.forestUnlocked || !this.cropChallenge) return;
    const personalized = personalizeCropChallenge(this.cropChallenge, {
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });
    this.personalizedCrop = personalized;
    // Keep current target if already mid-challenge and higher than new soft target
    // only when student already harvested some — otherwise adopt live personalization.
    if ((this.cropsHarvestedTotal || 0) === 0) {
      this.harvestTarget = personalized.harvestTarget;
    }
    const answered = this.questionsAnswered();
    const quota = DDA_CONFIG.maxQuestions;
    const qLine = `Science questions ${answered}/${quota}`;
    this.farmLevel = {
      ...this.farmLevel,
      harvestTarget: this.harvestTarget,
      goalText: `${qLine}. ${personalized.goalText}`,
    };
  }

  cropCarryTextureKey(cropType = null) {
    const fromCrop = cropType ? getCropTextures(cropType) : null;
    const candidates = [
      fromCrop?.produce,
      fromCrop?.ready,
      this.cropChallenge?.produce,
      this.cropChallenge?.ready,
      this.farmLevel?.cropId === 'corn' ? 'crop_corn' : null,
      'kf_tomato',
      'hm_tomato',
      'crop_flower',
    ];
    for (const key of candidates) {
      if (key && this.textures.exists(key)) return key;
    }
    return 'crop_flower';
  }

  cropSpriteScale(key, fallback) {
    const tex = this.textures.get(key);
    const src = tex?.getSourceImage?.();
    const w = Number(src?.width) || 32;
    return w <= 20 ? fallback * 1.7 : fallback;
  }

  /**
   * Switch the active crop challenge to a specific cropId from the level plan.
   * Called when the student steps onto a specific bed.
   * Updates farmLevel.cropId, cropName, cropChallenge etc. without resetting sold counters.
   */
  _activateBedChallenge(cropId) {
    if (!cropId) return;
    if (this.farmLevel?.cropId === cropId) return; // already active

    const crops = this.levelPlan?.crops || [];
    const match = crops.find((c) => c.cropId === cropId);
    if (!match) return;

    const challenge = match;
    // Point the store index at this challenge so quiz helpers resolve correctly
    if (typeof match.index === 'number') setCropChallengeIndex(match.index);

    this.cropChallenge = challenge;
    this.farmLevel = {
      ...this.farmLevel,
      cropId: challenge.cropId,
      cropName: challenge.cropName,
    };
    const personalized = personalizeCropChallenge(challenge, {
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });
    this.personalizedCrop = personalized;
    this.harvestTarget = personalized.harvestTarget;
    // Restore per-bed planted state
    this.plantDoneForChallenge = !!(this.cropPlantedSet?.has(cropId));
  }

  advanceVegetableChallenge() {
    if (this.forestUnlocked) return;
    if (!this.libraryOverride && this.levelCropComplete) return;
    const finished = this.cropChallenge;

    // Free-choice model: all level crops are done simultaneously — mark complete
    if (!this.libraryOverride && this.levelPlan?.cropIndexes?.length) {
      this.levelCropComplete = true;
      if (this.farmShopLayer) this.ensurePhysicalFarmShop();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'crop_challenge_level_done',
        previousId: finished?.id,
        previousName: finished?.cropName,
        libraryLevel: this.levelPlan.level,
      });
      this.emitFarmState();
      this.checkTargetReached();
      return;
    }

    // Fallback for libraryOverride / unlimited mode
    advanceCropChallengeIndex();
    this.clearAllCrops({ silent: true });
    this.applyCurrentCropChallenge({ resetProgress: true });
    this.createPlantPlotMarkers();
    if (this.farmShopLayer) this.ensurePhysicalFarmShop();
    this.emitFarmState();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'crop_challenge_next',
      previousId: finished?.id,
      previousName: finished?.cropName,
      cropId: this.farmLevel.cropId,
      cropName: this.farmLevel.cropName,
      harvestTarget: this.harvestTarget,
      challengeIndex: getCropChallengeIndex(),
      challengeTotal: CROP_CHALLENGE_COUNT,
      cropChallengeList: this.buildCropChallengeProgress(),
    });
  }

  applyCurrentAnimalChallenge({ resetProgress = false } = {}) {
    if (!this.libraryOverride && this.levelPlan) {
      setAnimalChallengeIndex(this.levelPlan.animalIndex || 0);
    }
    const index = getAnimalChallengeIndex();
    const challenge = getAnimalChallenge(index);
    const personalized = personalizeAnimalChallenge(challenge, {
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });
    this.animalChallenge = challenge;
    this.personalizedAnimal = personalized;
    this.animalCollectTarget = personalized.collectTarget;
    if (resetProgress) {
      this.animalCollectedTotal = 0;
      this.animalSoldThisChallenge = 0;
      this.animalTended = false;
      this.animalCollectUnlocked = false;
      this.animalCollectArmedUntil = 0;
    }
    this.animalLayer?.spawn?.(challenge);
    this.refreshPersonalizedActivities();
    if (this.farmShopLayer) this.ensurePhysicalFarmShop();
  }

  advanceAnimalChallenge() {
    if (this.forestUnlocked) return;
    const finished = this.animalChallenge;
    if (!this.libraryOverride) {
      if (this.levelAnimalComplete) return;
      this.levelAnimalComplete = true;
      // Animal done → customers ask for compost from the cleaning challenge
      if (this.farmShopLayer) this.ensurePhysicalFarmShop();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'animal_challenge_level_done',
        previousId: finished?.id,
        previousName: finished?.animalName,
        libraryLevel: this.levelPlan?.level,
      });
      this.emitFarmState();
      this.checkTargetReached();
      return;
    }
    advanceAnimalChallengeIndex();
    this.applyCurrentAnimalChallenge({ resetProgress: true });
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'animal_challenge_next',
      previousId: finished?.id,
      previousName: finished?.animalName,
      animalName: this.animalChallenge?.animalName,
      produceName: this.animalChallenge?.produceName,
      collectTarget: this.animalCollectTarget,
      challengeIndex: getAnimalChallengeIndex(),
      challengeTotal: ANIMAL_CHALLENGE_COUNT,
    });
  }

  applyCurrentCleaningChallenge({ resetProgress = false } = {}) {
    if (!this.libraryOverride && this.levelPlan) {
      setCleaningChallengeIndex(this.levelPlan.cleanIndex || 0);
    }
    const index = getCleaningChallengeIndex();
    const challenge = getCleaningChallenge(index);
    const personalized = personalizeCleaningChallenge(challenge, {
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });
    this.cleaningChallenge = challenge;
    this.personalizedClean = personalized;
    this.cleanSweepTarget = personalized.sweepTarget;
    if (resetProgress) {
      this.cleanSweptTotal = 0;
      this.cleanSoldThisChallenge = 0;
      this.cleanStarted = false;
      this.cleanSweepArmedUntil = 0;
      this.cleanSweepUnlocked = false;
    }
    this.cleaningLayer?.spawn?.(challenge);
    this.refreshPersonalizedActivities();
    if (this.farmShopLayer) this.ensurePhysicalFarmShop();
  }

  advanceCleaningChallenge() {
    if (this.forestUnlocked) return;
    const finished = this.cleaningChallenge;
    if (!this.libraryOverride) {
      if (this.levelCleanComplete) return;
      this.levelCleanComplete = true;
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'clean_challenge_level_done',
        previousId: finished?.id,
        previousName: finished?.messName,
        libraryLevel: this.levelPlan?.level,
      });
      this.emitFarmState();
      this.checkTargetReached();
      return;
    }
    advanceCleaningChallengeIndex();
    this.applyCurrentCleaningChallenge({ resetProgress: true });
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'clean_challenge_next',
      previousId: finished?.id,
      previousName: finished?.messName,
      messName: this.cleaningChallenge?.messName,
      wasteName: this.cleaningChallenge?.wasteName,
      verb: this.cleaningChallenge?.verb,
      sweepTarget: this.cleanSweepTarget,
      challengeIndex: getCleaningChallengeIndex(),
      challengeTotal: CLEANING_CHALLENGE_COUNT,
    });
  }

  canPlantMore() {
    // Free replant stays available until the level is finished
    return !this.forestUnlocked;
  }

  questionsAnswered() {
    return (this.quizCorrect || 0) + (this.quizIncorrect || 0);
  }

  needsQuestionQuota() {
    return this.questionsAnswered() < DDA_CONFIG.maxQuestions;
  }

  /** Level complete only after the science-question quota (15). Farm jobs do not skip it. */
  checkTargetReached() {
    if (this.forestUnlocked) return;

    if (this.needsQuestionQuota()) {
      this.syncVegetableGoalText();
      this.emitFarmState();
      return;
    }

    this.forestUnlocked = true;
    clearFarmRun();
    this.persistLevelMastery();
    const gameplaySaved = this.persistGameplayPerformance();
    // Unharvested plants do not carry into the next level
    this.clearAllCrops({ silent: true });
    const avgMs = this.levelAvgResponseMs();
    const beat =
      avgMs > 0 ? avgMs <= this.timeTargetMs : null;
    const timeNote =
      beat == null
        ? ''
        : beat
          ? ` You beat the ${formatResponseTime(this.timeTargetMs)} target!`
          : ` Target was ${formatResponseTime(this.timeTargetMs)} avg.`;

    const gp = gameplaySaved?.record;
    const bonusNote = gameplaySaved?.pendingBonus?.totalBonus
      ? ` Next-level bonus ready: +$${gameplaySaved.pendingBonus.totalBonus}.`
      : '';

    this.farmLevel = {
      ...this.farmLevel,
      goalText: `Level complete!${timeNote}${bonusNote} Unlock shop is open — then return to your learning path.`,
    };

    const shopPerf = this.buildShopPerformance();
    const payload = {
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
      target: this.timeTargetMs,
      timeTargetMs: this.timeTargetMs,
      timeTargetLabel: formatResponseTime(this.timeTargetMs),
      beatTimeTarget: beat,
      maxQuestions: DDA_CONFIG.maxQuestions,
      levelId: this.farmLevel.id,
      goalText: this.farmLevel.goalText,
      performanceBand: shopPerf.performanceBand,
      mastery: this.mastery,
      openUnlockShop: true,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
      ...shopPerf,
      gameplayBand: gp?.classification || this.gameplayBand,
      gameplayLabel: gp?.classificationLabel,
      gameplayRecord: gp || null,
      pendingGameplayBonus: gameplaySaved?.pendingBonus || null,
      nextGameplaySettings: gp?.nextGameplaySettings || null,
      retries: this.retryCount,
      levelCompletionTimeSec: gp?.levelCompletionTimeSec,
      avgAnswerTimeSec: gp?.avgAnswerTimeSec,
      trend: gp?.trend,
    };
    ForestGameBridge.emit(FARM_EVENTS.GOAL_COMPLETED, payload);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'gameplay_level_complete',
      levelId: this.farmLevel.id,
      record: gp,
      pendingBonus: gameplaySaved?.pendingBonus,
      classification: gameplaySaved?.classification,
    });
    this.emitFarmState();
  }

  getShopStockFallbacks() {
    return {
      cropId: this.farmLevel?.cropId || 'tomato',
      animalProduceId: String(this.animalChallenge?.produceName || 'milk')
        .toLowerCase()
        .replace(/\s+/g, '_'),
    };
  }

  applyShopFulfillmentResult(result, { rp = 0 } = {}) {
    if (!result?.ok || !this.worldShop) return;

    // coinsEarned was already increased inside loadCarryStackToShop /
    // completeCustomer — credit the wallet from fulfillment rewards.
    let gained = Math.max(
      0,
      (result.rewards || []).reduce((sum, r) => sum + (Number(r) || 0), 0),
    );
    // Safety net: if customers did not pay, still pay for unloaded items.
    if (gained < 1 && result.moved) {
      const units = Object.values(result.moved).reduce(
        (sum, n) => sum + (Number(n) || 0),
        0,
      );
      const unit = Math.max(1, Number(this.worldShop.unitValue) || 10);
      gained = units * unit;
      this.worldShop.coinsEarned = (this.worldShop.coinsEarned || 0) + gained;
    }
    if (gained > 0) {
      this.currentMoney += gained;
      this.syncMoneyAliases();
    }

    for (const customer of result.completed || []) {
      this.farmShopLayer?.flashThanks?.(customer.id);
    }

    // Count every unloaded item toward challenge progress (sold on unload)
    const soldItems = result.leftoverSold || result.moved || {};
    for (const [id, n] of Object.entries(soldItems)) {
      const qty = Math.max(0, Number(n) || 0);
      if (!qty) continue;
      if (/milk|egg|wool|animal/.test(id)) {
        this.animalSoldThisChallenge =
          (this.animalSoldThisChallenge || 0) + qty;
      } else if (/compost|clean/.test(id)) {
        this.cleanSoldThisChallenge =
          (this.cleanSoldThisChallenge || 0) + qty;
      } else {
        this.cropsSoldThisChallenge =
          (this.cropsSoldThisChallenge || 0) + qty;
        this.cropSoldMap = this.cropSoldMap || {};
        this.cropSoldMap[id] = (this.cropSoldMap[id] || 0) + qty;
      }
    }

    this.farmShopLayer?.sync?.(this.worldShop);
    this.emitFarmShopTelemetry(
      [result.unloadEvent, ...(result.events || [])].filter(Boolean),
    );
    this.emitFarmShopState();
    this.emitFarmState();

    if (gained > 0) {
      this.persistFarmRun();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'farm_shop_sale',
        reward: gained,
        completedCount: result.completed?.length || 0,
        rp,
      });
    }

    if (
      !this.forestUnlocked && !this.levelCropComplete
    ) {
      // Free-choice model: level crops done when every challenge crop hits its target
      const levelCrops = this.levelPlan?.crops || [];
      const allLevelCropsDone = levelCrops.length > 0 && levelCrops.every((c) => {
        const target = Math.max(1, Number(this.harvestTarget) || c.harvestCount || 4);
        return (this.cropSoldMap?.[c.cropId] || 0) >= target;
      });
      if (allLevelCropsDone) {
        this.advanceVegetableChallenge();
      }
    }
    if (
      !this.forestUnlocked &&
      (this.animalSoldThisChallenge || 0) >= this.animalCollectTarget
    ) {
      this.advanceAnimalChallenge();
    }
    if (
      !this.forestUnlocked &&
      (this.cleanSoldThisChallenge || 0) >= this.cleanSweepTarget
    ) {
      this.advanceCleaningChallenge();
    }
    this.checkTargetReached();
  }

  /** Long vertical stack of harvested crops carried behind the runner. */
  syncCarryTrail(cropType = null) {
    if (!this.player) return;
    const stackTop =
      cropType ||
      this.carryStack?.[this.carryStack.length - 1] ||
      this.farmLevel?.cropId ||
      null;
    let cropKey = this.cropCarryTextureKey(stackTop);
    if (!this.textures.exists(cropKey)) {
      cropKey = this.cropCarryTextureKey(null);
    }
    if (!this.textures.exists(cropKey)) return;

    const need = this.carriedCount || 0;
    const scale = this.cropSpriteScale(cropKey, 0.7);
    const baseDepth = Math.max(Number(this.player.depth) || 5, 5) + 2;
    while (this.carrySprites.length < need) {
      const img = this.add.image(this.player.x, this.player.y, cropKey);
      img.setScale(scale);
      img.setDepth(baseDepth);
      this.carrySprites.push(img);
    }
    while (this.carrySprites.length > need) {
      const img = this.carrySprites.pop();
      img?.destroy();
    }
  }

  updateCarryTrailPositions() {
    if (!this.player || !this.carrySprites?.length) return;

    const model = this.player.playerModel;
    const dir = model?.direction || 'down';
    // Stack vertically behind the runner (column on their back)
    let backX = 0;
    let backY = 0;
    if (dir === 'up') {
      backX = 0;
      backY = 10;
    } else if (dir === 'down') {
      backX = 0;
      backY = -10;
    } else if (dir === 'left') {
      backX = 8;
      backY = -2;
    } else {
      backX = -8;
      backY = -2;
    }

    const baseDepth = Math.max(Number(this.player.depth) || 5, 5) + 2;
    this.carrySprites.forEach((sprite, i) => {
      if (!sprite?.active) return;
      sprite.setPosition(
        this.player.x + backX,
        this.player.y + backY - (i + 1) * 7,
      );
      sprite.setDepth(baseDepth + i * 0.01);
    });
  }

  clearCarryTrail() {
    this.carrySprites?.forEach((s) => s?.destroy());
    this.carrySprites = [];
    this.carriedCount = 0;
    this.carryStack = [];
  }

  /**
   * Draw marked tillable beds so students know where planting is allowed.
   */
  createPlantPlotMarkers() {
    if (this.plantPlotMarkers) {
      this.plantPlotMarkers.destroy(true);
    }
    this.plantPlotMarkers = this.add.container(0, 0);
    this.plantPlotMarkers.setDepth(1.5);

    PLANT_PLOTS.forEach((plot, plotIndex) => {
      const def = cropDefForPlot(plot.id, this.cropChallenge, this.levelPlan, plotIndex);
      if (def.inactive || !def.cropId) {
        // No unique crop for this bed — skip marker (1 bed = 1 plant only).
        return;
      }

      const px = plot.x * TILE_SIZE;
      const py = plot.y * TILE_SIZE;
      const pw = plot.w * TILE_SIZE;
      const ph = plot.h * TILE_SIZE;

      const g = this.add.graphics();
      g.fillStyle(0x2a1608, 0.55);
      g.fillRoundedRect(px - 3, py - 3, pw + 6, ph + 6, 4);
      g.fillStyle(0x5a3318, 0.92);
      g.fillRoundedRect(px, py, pw, ph, 3);
      g.fillStyle(0x7a4a24, 0.45);
      g.fillRoundedRect(px + 3, py + 3, pw - 6, ph - 6, 2);
      for (let row = 1; row < plot.h; row += 1) {
        const y = py + row * TILE_SIZE;
        g.lineStyle(1.5, 0x3a2210, 0.5);
        g.lineBetween(px + 4, y, px + pw - 4, y);
      }
      for (let col = 1; col < plot.w; col += 1) {
        const x = px + col * TILE_SIZE;
        g.lineStyle(1, 0x3a2210, 0.28);
        g.lineBetween(x, py + 4, x, py + ph - 4);
      }
      g.lineStyle(3, 0xf2d36b, 1);
      g.strokeRoundedRect(px + 0.5, py + 0.5, pw - 1, ph - 1, 3);
      g.lineStyle(1.5, 0x8fd45a, 0.7);
      g.strokeRoundedRect(px + 4, py + 4, pw - 8, ph - 8, 2);

      const cropId = def.cropId;
      const soldMap = this.cropSoldMap || {};
      const harvestTarget = this.harvestTarget || 4;
      const isCropDone = (soldMap[cropId] || 0) >= harvestTarget;
      const isPlanted = Boolean(this.cropPlantedSet?.has(cropId));
      const labelText = String(def.cropName || 'plant').toUpperCase();
      const labelColor = isCropDone ? '#80e880' : isPlanted ? '#c8e878' : '#ffe08a';
      const label = this.add
        .text(px + pw / 2, py - 6, labelText, {
          fontFamily: 'Courier New, monospace',
          fontSize: '11px',
          fontStyle: 'bold',
          color: labelColor,
          stroke: '#1a1208',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(1.6);

      this.plantPlotMarkers.add([g, label]);

      this.tweens.add({
        targets: g,
        alpha: { from: 0.82, to: 1 },
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  /** Remove every crop â€” unharvested plants never carry to the next level. */
  clearAllCrops({ silent = true } = {}) {
    const crops = [...(this.plantedCrops || [])];
    crops.forEach((crop) => {
      if (!crop) return;
      try {
        crop.destroy?.();
      } catch {
        // ignore
      }
    });
    this.plantedCrops = [];
    this.plantedGridKeys = new Set();
    this.pendingGridKey = null;
    this.pendingPatchCells = [];
    this.currentTargetTile = null;
    this.clearCarryTrail();
    this.cropsGroup?.clear(true, true);
    if (!silent) this.emitFarmState();
  }

  clearPlacedUnlocks() {
    for (const [, hit] of this.unlockSprites?.entries() || []) {
      try {
        hit?.getData?.('visual')?.destroy?.();
        hit?.getData?.('label')?.destroy?.();
        hit?.destroy?.();
      } catch {
        /* ignore */
      }
    }
    this.unlockSprites?.clear?.();
    this.placedUnlockIds?.clear?.();
    this.unlockSlotUsed = [];
  }

  /** Owned shop items appear starting the level after purchase; LPE rewards can appear now. */
  shouldShowOwnedUnlock(itemId) {
    if (!itemId || SKIP_UNLOCK_ITEMS.has(itemId)) return false;
    const levelId = Math.max(1, Number(this.levelId) || 1);
    const meta = getUnlockMeta(itemId) || {};
    const availableAt = Number(meta.availableAtLevel) || 0;
    if (availableAt > 0) return levelId >= availableAt;
    const purchasedAt = Number(meta.purchasedAtLevel) || 0;
    if (purchasedAt > 0 && levelId <= purchasedAt) return false;
    return true;
  }

  placeOwnedUnlocks() {
    if (!this.placedUnlockIds) this.placedUnlockIds = new Set();
    if (!this.unlockSprites) this.unlockSprites = new Map();
    this.unlockSlotUsed = [];
    for (const id of getOwnedUnlockIds()) {
      if (!this.shouldShowOwnedUnlock(id)) continue;
      this.placeUnlockSprite(id);
    }
  }

  paintFarmFromPerformance() {
    if (!this.farming?.paintFromStudent) return;
    const completedCount = (this.storylineChallenges || []).filter(
      (c) => c.done,
    ).length;
    this.farming.paintFromStudent({
      performanceBand: this.performanceBand,
      gameplayBand: this.gameplayBand,
      completedCount,
    });
  }

  scaleForStorySpec(spec, sprite) {
    const key = spec?.textureKey;
    const src =
      (key && this.textures.exists(key)
        ? this.textures.get(key)?.getSourceImage?.()
        : null) || null;
    return resolveUnlockDisplayScale(
      { mapTileWidth: spec?.mapTileWidth || 2.2 },
      src?.width || sprite?.width || 16,
      src?.height || sprite?.height || 16,
      TILE_SIZE,
    );
  }

  applySituationSpec(sprite, spec) {
    if (!sprite || !spec) return 1;
    const key = spec.textureKey;
    if (key && sprite.setTexture && this.textures.exists(key)) {
      sprite.setTexture(key);
    }
    if (spec.tint != null && spec.tint !== 0xffffff) {
      sprite.setTint?.(spec.tint);
    } else {
      sprite.clearTint?.();
    }
    if (spec.angle != null) sprite.setAngle?.(spec.angle);
    const scale = this.scaleForStorySpec(spec, sprite) * (spec.scaleMul || 1);
    sprite.setScale?.(scale);
    sprite.setData?.('baseScale', scale);
    return scale;
  }

  addStorylineImage(x, y, spec, depth = 8) {
    const key = spec?.textureKey;
    let sprite;
    if (key && this.textures.exists(key)) {
      sprite = this.add.image(x, y, key);
    } else {
      sprite = this.add.rectangle(x, y, 28, 32, 0x6b5344, 0.95);
      sprite.setStrokeStyle?.(2, 0xd4a017);
    }
    this.applySituationSpec(sprite, spec || { mapTileWidth: 2.2 });
    sprite.setDepth(depth);
    return sprite;
  }

  placeStorylineSprite(challenge) {
    const itemId = challenge?.itemId;
    if (!itemId || this.placedUnlockIds?.has(itemId)) return null;
    const situation = challenge.situation;
    const spec = challenge.done ? situation?.after : situation?.before;
    const x = challenge.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = challenge.tileY * TILE_SIZE + TILE_SIZE / 2;
    const visual = this.addStorylineImage(
      x,
      y,
      spec || {
        textureKey: challenge.textureKey,
        mapTileWidth: 2.4,
      },
      8,
    );

    const extras = [];
    for (const extra of situation?.extras || []) {
      const extraSpec = challenge.done ? extra.after : extra.before;
      extras.push({
        sprite: this.addStorylineImage(
          x + (extra.tileDX || 0) * TILE_SIZE,
          y + (extra.tileDY || 0) * TILE_SIZE,
          extraSpec,
          7,
        ),
        extra,
      });
    }

    const creature = getCreature(challenge.creatureId);
    let companion = null;
    if (creature?.textureKey && this.textures.exists(creature.textureKey)) {
      const cx =
        (challenge.companionTileX ?? challenge.tileX - 3) * TILE_SIZE +
        TILE_SIZE / 2;
      const cy =
        (challenge.companionTileY ?? challenge.tileY) * TILE_SIZE +
        TILE_SIZE / 2;
      companion = this.add.image(cx, cy, creature.textureKey);
      const src = this.textures.get(creature.textureKey)?.getSourceImage?.();
      const scale = resolveUnlockDisplayScale(
        creature,
        src?.width || companion.width,
        src?.height || companion.height,
        TILE_SIZE,
      );
      companion.setScale(scale * 0.85);
      companion.setDepth(8);
    }

    const labelY = y - Math.max(32, (visual.displayHeight || 48) / 2 + 12);
    const baseName =
      challenge.itemLabel ||
      (challenge.done ? situation?.labelAfter : situation?.labelBefore) ||
      creature?.name ||
      'Story';
    const label = this.add
      .text(x, labelY, baseName, {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#f0e6c8',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);

    const hitW = Math.max(
      TILE_SIZE * 5,
      (Number(visual.displayWidth) || 40) + TILE_SIZE * 2,
    );
    const hitH = Math.max(
      TILE_SIZE * 5,
      (Number(visual.displayHeight) || 40) + TILE_SIZE * 2,
    );
    const hit = this.add
      .rectangle(x, y, hitW, hitH, 0x000000, 0.001)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    hit.setData('unlockId', itemId);
    hit.setData('label', label);
    hit.setData('baseLabel', baseName);
    hit.setData('visual', visual);
    hit.setData('extras', extras);
    hit.setData('companion', companion);
    hit.setData('situation', situation);
    hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      if (!this.sys?.isActive()) return;
      event?.stopPropagation?.();
      this.tryStartUnlockChallenge(itemId);
    });

    this.unlockSprites?.set(itemId, hit);
    this.storylineSprites?.set(itemId, hit);
    this.placedUnlockIds.add(itemId);
    return hit;
  }

  placeStorylineDecor(decor) {
    const prop = getStorylineProp(decor?.propId);
    if (!prop) return null;
    const x = decor.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = decor.tileY * TILE_SIZE + TILE_SIZE / 2;
    let sprite;
    if (this.textures.exists(prop.textureKey)) {
      sprite = this.add.image(x, y, prop.textureKey);
      const src = this.textures.get(prop.textureKey)?.getSourceImage?.();
      const scale = resolveUnlockDisplayScale(
        prop,
        src?.width || sprite.width,
        src?.height || sprite.height,
        TILE_SIZE,
      );
      sprite.setScale(scale);
    } else {
      sprite = this.add.rectangle(x, y, 28, 28, 0x6b5344, 0.9);
    }
    sprite.setDepth(4);
    this.storylineDecorSprites?.push(sprite);
    return sprite;
  }

  stopStorylineWilt(hit) {
    const tween = hit?.getData?.('wiltTween');
    if (tween) {
      tween.stop?.();
      tween.remove?.();
      hit.setData('wiltTween', null);
    }
  }

  startStorylineWilt(hit, visual) {
    if (!hit || !visual || !this.tweens) return;
    this.stopStorylineWilt(hit);
    const tween = this.tweens.add({
      targets: visual,
      angle: (Number(visual.angle) || 0) + 7,
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    hit.setData('wiltTween', tween);
  }

  syncStorylineSpriteVisuals() {
    for (const c of this.storylineChallenges || []) {
      const hit =
        this.storylineSprites?.get(c.itemId) ||
        this.unlockSprites?.get(c.itemId);
      if (!hit) continue;
      const visual = hit.getData?.('visual');
      const extras = hit.getData?.('extras') || [];
      const companion = hit.getData?.('companion');
      const label = hit.getData?.('label');
      this.stopStorylineWilt(hit);
      if (c.done) {
        visual?.setAlpha?.(1);
        extras.forEach((entry) => entry.sprite?.setAlpha?.(1));
        companion?.setAlpha?.(0.92);
        label?.setColor?.('#c8e0a8');
      } else if (c.locked) {
        visual?.setAlpha?.(0.5);
        extras.forEach((entry) => entry.sprite?.setAlpha?.(0.45));
        companion?.setAlpha?.(0.45);
        label?.setColor?.('#8a8578');
      } else {
        visual?.setAlpha?.(1);
        extras.forEach((entry) => entry.sprite?.setAlpha?.(1));
        companion?.setAlpha?.(1);
        label?.setColor?.('#ffe9a8');
        this.startStorylineWilt(hit, visual);
      }
    }
  }

  playStorylineResolve(challenge) {
    const hit = this.storylineSprites?.get(challenge?.itemId);
    const situation = challenge?.situation;
    if (!hit || !situation) return;
    this.stopStorylineWilt(hit);
    const visual = hit.getData('visual');
    const extras = hit.getData('extras') || [];
    const label = hit.getData('label');
    const companion = hit.getData('companion');

    const swap = (sprite, spec) => {
      if (!sprite || !spec) return;
      const startScale = sprite.scaleX || 1;
      this.tweens.add({
        targets: sprite,
        scaleX: startScale * 0.72,
        scaleY: startScale * 0.72,
        duration: 130,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (!sprite.active) return;
          this.applySituationSpec(sprite, spec);
          const next = sprite.getData('baseScale') || startScale;
          sprite.setScale(next);
          this.tweens.add({
            targets: sprite,
            scaleX: next * 1.16,
            scaleY: next * 1.16,
            duration: 180,
            yoyo: true,
            ease: 'Sine.easeOut',
          });
        },
      });
    };

    swap(visual, situation.after);
    for (const entry of extras) {
      swap(entry.sprite, entry.extra?.after);
    }
    if (companion) {
      this.tweens.add({
        targets: companion,
        y: companion.y - 8,
        duration: 160,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
    if (label?.setText) {
      label.setText(situation.labelAfter);
      label.setColor('#d5e8a8');
    }
    hit.setData('baseLabel', situation.labelAfter);
    challenge.itemLabel = situation.labelAfter;
    this.cameras?.main?.flash(220, 150, 230, 110);
    this.farming?.recoverForSituation?.(situation.id);
  }

  tryStartStorylineChallenge(itemId) {
    if (!isStorylineItemId(itemId)) return false;
    const challenge =
      this.storylineChallenges?.find((c) => c.itemId === itemId && !c.done) ||
      this.activeChallenges?.find((c) => c.itemId === itemId && !c.done);
    if (!challenge) return false;
    this.startStorylineQuiz(challenge);
    return true;
  }

  startStorylineQuiz(challenge) {
    const step = getNextChallengeStep(challenge);
    if (!step?.prompt || !Array.isArray(step.options) || !step.options.length) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'no_question',
        itemId: challenge?.itemId,
        hint: 'This story beat has no question yet.',
      });
      return;
    }

    this.focusCameraOnUnlock(challenge.itemId);
    this.pendingQuizMode = 'storyline';
    this.pendingItemChallenge = {
      itemId: challenge.itemId,
      stageId: challenge.stageId,
      stepIndex: challenge.stepIndex || 0,
      rewardRp: challenge.rewardRp || 2,
      title: challenge.title,
      step,
    };

    this.quizOpenedAt = Date.now();
    this.lockPlayerForAnswer();

    const question = {
      id: step.id,
      prompt: step.prompt,
      options: step.options,
      correctIndex: step.correctIndex,
      hint: step.hint,
      rp: challenge.rewardRp || 2,
      topic: challenge.title,
    };

    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'storyline',
        challenge: 'storyline',
        itemId: challenge.itemId,
        stageId: challenge.stageId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
  }

  placeUnlockSprite(itemId) {
    if (!itemId || this.placedUnlockIds?.has(itemId)) return null;
    if (SKIP_UNLOCK_ITEMS.has(itemId)) return null;
    const item = getUnlockItem(itemId);
    if (!item) return null;

    if (!this.unlockSlotUsed) this.unlockSlotUsed = [];
    const slot = pickUnlockWorldSlot(item, this.unlockSlotUsed, {
      minTileGap: item.category === 'building' ? 5 : 3,
      collidesAt: (gridX, gridY) => {
        const colTile = this.colLayer?.getTileAt(gridX, gridY);
        return Boolean(colTile && colTile.collides);
      },
    });
    if (!slot) return null;
    this.unlockSlotUsed.push(slot);

    const x = slot.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = slot.tileY * TILE_SIZE + TILE_SIZE / 2;

    let sprite;
    if (this.textures.exists(item.textureKey)) {
      sprite = item.frameWidth
        ? this.add.sprite(x, y, item.textureKey, 0)
        : this.add.image(x, y, item.textureKey);
      const src = this.textures.get(item.textureKey)?.getSourceImage?.();
      let scale = resolveUnlockDisplayScale(
        item,
        src?.width || sprite.width || item.frameWidth,
        src?.height || sprite.height || item.frameHeight,
        TILE_SIZE,
      );
      const maxH = TILE_SIZE * (item.category === 'building' ? 4.2 : 2.4);
      const maxW = TILE_SIZE * (item.category === 'building' ? 4.2 : 2.8);
      const h = (src?.height || sprite.height || 16) * scale;
      const w = (src?.width || sprite.width || 16) * scale;
      if (h > maxH) scale *= maxH / h;
      if (w * (h > maxH ? maxH / h : 1) > maxW) {
        scale *= maxW / ((src?.width || sprite.width || 16) * scale);
      }
      sprite.setScale(scale);
    } else {
      sprite = this.add.rectangle(x, y, 40, 40, 0x3d6b45, 0.95);
      sprite.setStrokeStyle(2, 0xd4a017);
    }

    sprite.setOrigin(0.5, 0.92);
    sprite.setDepth(3 + y / 10000);
    sprite.setData('unlockId', itemId);

    const labelY = y - Math.max(22, (sprite.displayHeight || 48) * 0.92 + 8);
    const baseName = item.name || itemId;
    const label = this.add
      .text(x, labelY, baseName, {
        fontFamily: 'Georgia, serif',
        fontSize: item.category === 'building' ? '11px' : '10px',
        color: '#f0e6c8',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4 + y / 10000);

    const hitW = Math.min(
      TILE_SIZE * 3.2,
      Math.max(TILE_SIZE * 1.6, (Number(sprite.displayWidth) || 40) * 0.7),
    );
    const hitH = Math.min(
      TILE_SIZE * 3.2,
      Math.max(TILE_SIZE * 1.6, (Number(sprite.displayHeight) || 40) * 0.7),
    );
    const hit = this.add
      .rectangle(x, y - hitH * 0.2, hitW, hitH, 0x000000, 0.001)
      .setDepth(4 + y / 10000);
    hit.setData('unlockId', itemId);
    hit.setData('label', label);
    hit.setData('baseLabel', baseName);
    hit.setData('visual', sprite);

    this.unlockSprites?.set(itemId, hit);
    this.placedUnlockIds.add(itemId);

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'unlock_placed',
      itemId,
      tileX: slot.tileX,
      tileY: slot.tileY,
      hasTexture: this.textures.exists(item.textureKey),
    });

    return hit;
  }

  /**
   * Agent sun/bee field stations are no longer placed on the farm.
   * Personalized jobs spawn through FarmingChallengeLayer instead.
   */
  placeAgentChallengeStations() {
    if (!this.agentStationSprites) this.agentStationSprites = new Map();

    for (const [, hit] of this.agentStationSprites.entries()) {
      const visual = hit?.getData?.('visual');
      const label = hit?.getData?.('label');
      const ring = hit?.getData?.('pulse');
      const diamond = hit?.getData?.('diamond');
      const itemId = hit?.getData?.('unlockId');
      visual?.destroy?.();
      label?.destroy?.();
      ring?.destroy?.();
      diamond?.destroy?.();
      hit?.destroy?.();
      if (itemId) this.unlockSprites?.delete(itemId);
    }
    this.agentStationSprites.clear();
  }

  refreshActiveChallenges() {
    this.storylineChallenges = [];
    this.activeChallenges = [
      ...buildWorldChallengeProgress(),
      ...buildActiveChallenges(this.levelId),
    ];
    this.refreshChallengeMarkers();
    ForestGameBridge.emit(FARM_EVENTS.CHALLENGES_STATE, {
      levelId: this.levelId,
      challenges: this.activeChallenges,
    });
  }

  /** Glow ring + one clear label (never stack "QUEST" on top of the name). */
  refreshChallengeMarkers() {
    if (this.challengeMarkers) {
      this.challengeMarkers.clear(true, true);
    }
    this.challengeMarkers = this.add.group();
    const open = (this.activeChallenges || []).filter(
      (c) => !c.done && !c.locked,
    );
    const openIds = new Set(open.map((c) => c.itemId));

    // Restore plain names on unlocks that no longer have an open quest
    for (const [itemId, spr] of this.unlockSprites?.entries() || []) {
      if (openIds.has(itemId)) continue;
      const label = spr?.getData?.('label');
      const base = spr?.getData?.('baseLabel');
      if (label?.setText && base) {
        label.setText(base);
        label.setColor('#f0e6c8');
      }
    }

    for (const c of open) {
      const spr = this.unlockSprites?.get(c.itemId);
      if (!spr?.active) continue;
      const x = spr.x;
      const y = spr.y;
      const radius = Math.max(
        14,
        Math.min(
          28,
          ((spr.displayWidth || 32) + (spr.displayHeight || 32)) / 5,
        ),
      );
      const ring = this.add
        .circle(x, y + 4, radius, 0xd4a017, 0.28)
        .setStrokeStyle(2, 0xffe08a, 0.85)
        .setDepth(4);
      ring.disableInteractive?.();
      if (ring.input) ring.input.enabled = false;

      const base =
        spr.getData('baseLabel') ||
        c.itemLabel ||
        c.itemId ||
        'Unlock';
      const label = spr.getData('label');
      if (label?.setText) {
        label.setText(`${base} â€” Quest`);
        label.setColor('#ffe9a8');
      }

      this.tweens.add({
        targets: ring,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0.12,
        duration: 750,
        yoyo: true,
        repeat: -1,
      });
      this.challengeMarkers.add(ring);
    }
    this.syncStorylineSpriteVisuals();
  }

  focusCameraOnUnlock(itemId) {
    const spr = this.unlockSprites?.get(itemId);
    if (!spr || !this.cameras?.main || !this.player) return;
    this.cameras.main.pan(spr.x, spr.y, 450, 'Sine.easeInOut');
    this.time.delayedCall(480, () => {
      if (!this.sys?.isActive() || !this.player) return;
      this.cameras.main.startFollow(this.player);
    });
  }

  findNearestChallengeItem(maxDist = TILE_SIZE * 4.5) {
    if (!this.player || !this.unlockSprites) return null;
    let best = null;
    let bestD = maxDist;
    for (const [itemId, sprite] of this.unlockSprites.entries()) {
      if (!sprite?.active) continue;
      const hasOpen = this.activeChallenges?.some(
        (c) => c.itemId === itemId && !c.done && !c.locked,
      );
      if (!hasOpen) continue;
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        sprite.x,
        sprite.y,
      );
      if (d < bestD) {
        bestD = d;
        best = itemId;
      }
    }
    return best;
  }

  /**
   * Start an unlock challenge from a map click.
   * Clears a stuck input lock (no pending modal) so unlocks stay clickable.
   */
  tryStartUnlockChallenge(itemId) {
    if (!itemId) return false;
    if (this.farmInputLocked) {
      const busy =
        Boolean(this.pendingQuizMode) ||
        Boolean(this.pendingItemChallenge) ||
        Boolean(this.pendingWorldChallenge);
      if (busy) {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'challenge_blocked',
          reason: 'input_locked',
          itemId,
          hint: 'Finish or close the open window first, then try again.',
        });
        return false;
      }
      // Stuck lock from a previous modal â€” free input so clicks work again
      this.farmInputLocked = false;
      this.physics?.world?.resume();
    }
    return this.startChallengeForUnlock(itemId);
  }

  /**
   * Start the next open challenge for a placed unlock.
   * Used by clicking the sprite or pressing E nearby.
   */
  startChallengeForUnlock(itemId) {
    if (!itemId || SKIP_UNLOCK_ITEMS.has(itemId)) return false;
    if (this.farmInputLocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'input_locked',
        itemId,
        hint: 'Finish or close the open window first, then try again.',
      });
        return false;
    }
    if (this.tryStartStorylineChallenge(itemId)) return true;
    this.refreshActiveChallenges();
    const open = this.activeChallenges?.find(
      (c) => c.itemId === itemId && !c.done,
    );
    if (!open) {
      const item = getUnlockItem(itemId);
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'none_for_item',
        itemId,
        hint: `${item?.name || itemId}: no open challenge.`,
      });
      return false;
    }
    this.beginItemChallenge({
      itemId: open.itemId,
      stageId: open.stageId,
    });
    return true;
  }

  beginItemChallenge(payload = {}) {
    if (this.farmInputLocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'input_locked',
        itemId: payload.itemId,
        hint: 'Finish or close the open window first, then try again.',
      });
      return;
    }
    const itemId = payload.itemId;
    if (isStorylineItemId(itemId)) {
      this.tryStartStorylineChallenge(itemId);
      return;
    }
    if (SKIP_UNLOCK_ITEMS.has(itemId)) return;
    if (itemId) this.focusCameraOnUnlock(itemId);
    const stageId = payload.stageId;
    let challenge =
      this.activeChallenges?.find(
        (c) => c.itemId === itemId && c.stageId === stageId && !c.done,
      ) || null;

    if (!challenge && itemId) {
      challenge =
        this.activeChallenges?.find((c) => c.itemId === itemId && !c.done) ||
        null;
    }

    if (!challenge) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'none_available',
      });
      return;
    }

    const step = getNextChallengeStep(challenge);
    if (!step) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'stage_complete',
        itemId: challenge.itemId,
        hint: 'That challenge is already finished.',
      });
      return;
    }

    this.pendingQuizMode = 'item_challenge';
    this.pendingItemChallenge = {
      itemId: challenge.itemId,
      stageId: challenge.stageId,
      stepIndex: challenge.stepIndex || 0,
      rewardRp: challenge.rewardRp || 0,
      rewardCash: challenge.rewardCash || 0,
      totalSteps: challenge.steps?.length || 1,
      title: challenge.title,
      step,
    };

    this.quizOpenedAt = Date.now();
    this.lockPlayerForAnswer();

    const question = {
      id: step.id,
      prompt: step.prompt,
      options: step.options,
      correctIndex: step.correctIndex,
      hint: step.hint,
      rp: challenge.rewardRp || 20,
      topic: challenge.title,
    };

    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'item_challenge',
        challenge: 'item_challenge',
        itemId: challenge.itemId,
        stageId: challenge.stageId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
  }

  /**
   * Nearby farm cluster → one science quiz for the whole group.
   */
  beginWorldChallenge(nodeId) {
    if (this.farmInputLocked) {
      const busy =
        Boolean(this.pendingQuizMode) || Boolean(this.pendingWorldChallenge);
      if (busy) {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'challenge_blocked',
          reason: 'input_locked',
          challengeId: nodeId,
        });
        return false;
      }
      this.farmInputLocked = false;
      this.physics?.world?.resume();
    }

    const node = getWorldNode(nodeId);
    const task = getWorldTask(node?.taskId);
    if (!node || !task) return false;
    const action = getTaskAction(node, task);

    if (isWorldChallengeComplete(task.challengeId)) return false;

    this.pendingQuizMode = 'world_challenge';
    this.pendingWorldChallenge = {
      nodeId: node.nodeId,
      challengeId: task.challengeId,
      challengeType: task.challengeType,
      kind: node.kind,
      action,
      difficulty: task.difficulty,
      rewardCash: task.reward?.cash || 0,
      rewardRp: task.reward?.rp || 0,
      startedAt: Date.now(),
    };

    this.pinFarmCamera();
    this.quizOpenedAt = Date.now();
    this.lockPlayerForAnswer();

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'challenge_started',
      challengeId: task.challengeId,
      nodeId: node.nodeId,
      action,
      challengeType: task.challengeType,
      difficulty: task.difficulty,
      tileX: node.tileX,
      tileY: node.tileY,
      levelId: this.farmLevel.id,
    });

    void this.emitScienceQuizFromEngine(
      'world_challenge',
      'world_challenge',
      (question) => ({
        challengeId: task.challengeId,
        challengeType: task.challengeType,
        questionData: {
          ...question,
          rp: question.rp ?? task.reward?.rp ?? 15,
        },
        rp: question.rp ?? task.reward?.rp ?? 15,
      }),
    );
    return true;
  }

  resolveWorldChallengeSuccess() {
    const pending = this.pendingWorldChallenge;
    this.pendingQuizMode = null;
    this.pendingWorldChallenge = null;
    if (!pending) {
      this.emitFarmState();
      return;
    }

    const action = pending.action || 'tend';
    markWorldChallengeComplete(pending.challengeId, {
      challengeType: pending.challengeType,
      difficulty: pending.difficulty,
      rewardCash: pending.rewardCash,
      rewardRp: pending.rewardRp,
    });
    this.worldLayer?.playCluster(pending.challengeId, action, this.player);
    rebuildActiveNodes();
    this.time?.delayedCall(action === 'plant' ? 980 : 420, () => {
      if (!this.sys?.isActive()) return;
      this.worldLayer?.spawn();
      this.refreshActiveChallenges();
    });

    const cash = pending.rewardCash || 0;
    if (cash) {
      this.currentMoney += cash;
      this.syncMoneyAliases();
    }

    this.pinFarmCamera();
    this.audioItem?.play();

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'challenge_complete',
      challengeId: pending.challengeId,
      nodeId: pending.nodeId,
      action,
      challengeType: pending.challengeType,
      difficulty: pending.difficulty,
      rp: pending.rewardRp || 0,
      rewardCash: cash,
      rewardEarned: cash,
      timeSpentMs: pending.startedAt ? Date.now() - pending.startedAt : 0,
      completionStatus: 'complete',
      earnings: this.currentMoney,
    });

    this.refreshActiveChallenges();
    this.emitFarmState();
    this.checkTargetReached();
  }

  decorateNextLevelGround() {
    if (this._nextLevelGround) return;
    this._nextLevelGround = true;

    const tiles = [
      ['ground_01', 44, 27],
      ['ground_05', 45, 27],
      ['ground_10', 46, 27],
      ['ground_19', 47, 27],
      ['ground_20', 48, 27],
      ['ground_25', 44, 28],
      ['ground_34', 45, 28],
      ['ground_44', 46, 28],
      ['ground_50', 47, 28],
      ['ground_56', 48, 28],
    ];
    const scale = TILE_SIZE / 256;

    for (const [key, tx, ty] of tiles) {
      if (!this.textures.exists(key)) continue;
      this.add
        .image(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, key)
        .setScale(scale)
        .setDepth(1)
        .setAlpha(0.95);
    }
  }

  handlePurchaseUnlock(payload = {}) {
    const itemId = payload.itemId;
    const item = getUnlockItem(itemId);
    if (!item) return;

    if (isUnlocked(itemId)) {
      if (this.shouldShowOwnedUnlock(itemId)) this.placeUnlockSprite(itemId);
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'unlock_blocked',
        reason: 'already_owned',
        itemId,
      });
      this.emitFarmState();
      return;
    }

    const price = Math.max(0, Number(payload.price) || 0);
    if (this.currentMoney < price) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'unlock_blocked',
        reason: 'insufficient_cash',
        itemId,
        price,
        cash: this.currentMoney,
      });
      return;
    }

    this.currentMoney -= price;
    this.syncMoneyAliases();
    markUnlocked(itemId, { purchasedAtLevel: this.levelId });
    // Show on the farm starting next level — no unlock-item quests
    this.audioItem?.play();

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'unlock_purchased',
      itemId,
      price,
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
    });
    this.emitFarmState();
  }

  focusGameCanvas() {
    if (this.shouldPassKeysToDom()) return;
    const canvas = this.game?.canvas;
    if (!canvas) return;
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus();
    }
  }

  gridKey(gridX, gridY) {
    return `${gridX}_${gridY}`;
  }

  /**
   * Player tile on the farm grid.
   * Uses floor division so every standing cell maps to a distinct row/column.
   */
  getPlayerGridCell() {
    const tileOriginX = Math.floor(this.player.x / TILE_SIZE) * TILE_SIZE;
    const tileOriginY = Math.floor(this.player.y / TILE_SIZE) * TILE_SIZE;
    const gridX = tileOriginX / TILE_SIZE;
    const gridY = tileOriginY / TILE_SIZE;
    return {
      gridX,
      gridY,
      key: this.gridKey(gridX, gridY),
      // Top-left of tile + half tile = center (never reuse a shared sprite pos)
      x: tileOriginX + TILE_SIZE / 2,
      y: tileOriginY + TILE_SIZE / 2,
      tileOriginX,
      tileOriginY,
      tileX: gridX,
      tileY: gridY,
    };
  }

  isGridTileOccupied(key) {
    return (
      this.plantedGridKeys.has(key) ||
      this.pendingGridKey === key ||
      this.pendingPatchCells?.some((c) => c.key === key)
    );
  }

  /**
   * Free cells inside the marked plant bed under the player.
   * Grown plants cover the whole bed, with a few soil gaps left open.
   */
  getPlantPatchCells(originGridX, originGridY) {
    if (!isPlantableTile(originGridX, originGridY)) return [];

    return coveringCellsInPlot(originGridX, originGridY, {
      occupiedKeys: this.plantedGridKeys,
      tileSize: TILE_SIZE,
      fillRatio: this.farmLevel.plantFillRatio ?? 0.78,
      collidesAt: (gridX, gridY) => {
        const colTile = this.colLayer?.getTileAt(gridX, gridY);
        return Boolean(colTile?.collides);
      },
    });
  }

  /** Debounce shared by window + Phaser key paths (avoids double plant/sell). */
  guardFarmAction(action) {
    const now = this.time?.now ?? performance.now();
    if (this._lastFarmAction === action && now - (this._lastFarmActionAt || 0) < 120) {
      return false;
    }
    this._lastFarmAction = action;
    this._lastFarmActionAt = now;
    return true;
  }

  /** E: Farm Shop unload, harvest/collect quizzes, plant bed, or nearby challenge. */
  handleInteractKey() {
    if (!this.player) return;
    if (this.farmInputLocked) return;
    if (!this.guardFarmAction('interact')) return;

    const cell = this.getPlayerGridCell();
    const nearShop =
      isFarmShopTile(cell.gridX, cell.gridY) ||
      this.farmShopLayer?.isNear?.(this.player.x, this.player.y);

    if (nearShop) {
      // Carrying harvest → unload into shop stock. No popup.
      if ((this.carriedCount || 0) > 0) {
        this.handleLoadingAttempt({ skipGuard: true });
      } else {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'farm_shop_hint',
          message:
            'Carry harvests here and press E to unload — customers buy automatically.',
        });
      }
      return;
    }

    // Ready crops: first E opens harvest quiz; later E picks after unlock.
    if (this.hasReadyCropsUnderfoot()) {
      if (!this.harvestUnlocked) {
        this.openHarvestQuestion();
        return;
      }
      this.harvestCropsUnderfoot();
      return;
    }

    if (this.animalLayer?.isNear(this.player.x, this.player.y)) {
      if (!this.animalTended && !this.animalLayer?.tended) {
        this.beginAnimalTend();
        return;
      }
      if (
        this.animalLayer?.tended &&
        (this.animalLayer.remainingProduce?.() || 0) > 0 &&
        !this.animalCollectUnlocked
      ) {
        this.openAnimalCollectQuestion();
        return;
      }
      if (this.animalCollectUnlocked) {
        this.collectAnimalProduceUnderfoot();
      }
      return;
    }

    if (this.cleaningLayer?.isNear(this.player.x, this.player.y)) {
      if (!this.cleanStarted && !this.cleaningLayer?.started) {
        this.beginCleaningStart();
        return;
      }
      if (
        this.cleaningLayer?.started &&
        (this.cleaningLayer.remainingMess?.() || 0) > 0 &&
        !this.cleanSweepUnlocked
      ) {
        this.openCleanSweepQuestion();
        return;
      }
      if (this.cleanSweepUnlocked) {
        this.sweepCleaningUnderfoot();
      }
      return;
    }

    const nearWorld = this.worldLayer?.findNearest(this.player.x, this.player.y);
    if (nearWorld) {
      this.beginWorldChallenge(nearWorld);
      return;
    }

    if (isPlantableTile(cell.gridX, cell.gridY)) {
      this.handlePlantingAttempt({ skipGuard: true });
      return;
    }

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'plant_blocked',
      reason: 'not_plot',
    });
  }

  hasReadyCropsUnderfoot() {
    if (!this.player) return false;
    const reach = TILE_SIZE * 1.15;
    return (this.plantedCrops || []).some((crop) => {
      if (!crop?.active || !crop.isReady?.()) return false;
      return (
        Phaser.Math.Distance.Between(
          crop.x,
          crop.y,
          this.player.x,
          this.player.y,
        ) <= reach
      );
    });
  }

  beginAnimalTend() {
    if (this.farmInputLocked || !this.player) return;
    if (this.forestUnlocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'animal_blocked',
        reason: 'target_reached',
      });
      return;
    }
    if (this.animalTended || this.animalLayer?.tended) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'animal_blocked',
        reason: 'already_tended',
        produceName: this.animalChallenge?.produceName,
      });
      return;
    }

    this.pendingQuizMode = 'animal_tend';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('animal_tend', 'plant', () => ({
      animalName: this.animalChallenge?.animalName,
      cropName: this.animalChallenge?.animalName,
    }));
  }

  openAnimalCollectQuestion() {
    if (!this.player || this.farmInputLocked) return;
    this.pendingQuizMode = 'animal_collect';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('animal_collect', 'harvest', () => ({
      animalName: this.animalChallenge?.animalName,
      cropName: this.animalChallenge?.produceName,
    }));
  }

  collectAnimalProduceUnderfoot() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.animalLayer?.tended) return;
    if ((this.animalLayer.remainingProduce?.() || 0) < 1) return;
    if (!this.animalCollectUnlocked) return;

    const reach = TILE_SIZE * 1.25;
    const n = this.animalLayer.collectNear(
      this.player.x,
      this.player.y,
      reach,
    );
    if (n < 1) return;
    const produceId = String(
      this.animalChallenge?.produceName || 'milk',
    )
      .toLowerCase()
      .replace(/\s+/g, '_');
    for (let i = 0; i < n; i += 1) this.carryStack.push(produceId);
    this.carriedCount = (this.carriedCount || 0) + n;
    this.animalCollectedTotal = (this.animalCollectedTotal || 0) + n;
    this.syncCarryTrail();
    this.updateCarryTrailPositions();
    this.showHarvestingBanner(n);
    this.emitFarmState();
  }

  beginCleaningStart() {
    if (this.farmInputLocked || !this.player) return;
    if (this.forestUnlocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'clean_blocked',
        reason: 'target_reached',
      });
      return;
    }
    if (this.cleanStarted || this.cleaningLayer?.started) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'clean_blocked',
        reason: 'already_started',
        wasteName: this.cleaningChallenge?.wasteName,
        messName: this.cleaningChallenge?.messName,
      });
      return;
    }

    this.pendingQuizMode = 'clean_start';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('clean_start', 'plant', () => ({
      messName: this.cleaningChallenge?.messName,
      cropName: this.cleaningChallenge?.messName,
    }));
  }

  openCleanSweepQuestion() {
    if (!this.player || this.farmInputLocked) return;
    this.pendingQuizMode = 'clean_sweep';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('clean_sweep', 'harvest', () => ({
      messName: this.cleaningChallenge?.messName,
      cropName: this.cleaningChallenge?.wasteName,
    }));
  }

  sweepCleaningUnderfoot() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.cleaningLayer?.started) return;
    if ((this.cleaningLayer.remainingMess?.() || 0) < 1) return;
    if (!this.cleanSweepUnlocked) return;

    const reach = TILE_SIZE * 1.25;
    const n = this.cleaningLayer.sweepNear(
      this.player.x,
      this.player.y,
      reach,
    );
    if (n < 1) return;
    for (let i = 0; i < n; i += 1) this.carryStack.push('compost');
    this.carriedCount = (this.carriedCount || 0) + n;
    this.cleanSweptTotal = (this.cleanSweptTotal || 0) + n;
    this.syncCarryTrail();
    this.updateCarryTrailPositions();
    this.showHarvestingBanner(n);
    this.emitFarmState();
  }

  /** Unload carry stack into Farm Shop stock and sell to customers. */
  handleLoadingAttempt(options = {}) {
    if (this.farmInputLocked || !this.player) return;
    if (!options.skipGuard && !this.guardFarmAction('load')) return;

    if (this.forestUnlocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'load_blocked',
        reason: 'target_reached',
      });
      return;
    }

    const cell = this.getPlayerGridCell();
    const nearShop =
      isFarmShopTile(cell.gridX, cell.gridY) ||
      this.farmShopLayer?.isNear?.(this.player.x, this.player.y);
    if (!nearShop) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'load_blocked',
        reason: 'not_dock',
      });
      return;
    }

    if ((this.carriedCount || 0) < 1) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'load_blocked',
        reason: 'empty_carry',
      });
      return;
    }

    this.finishLoadToShop({ rp: 0 });
  }

  finishLoadToShop({ rp = 0 } = {}) {
    const unloaded = this.carriedCount || 0;
    if (unloaded < 1) return;

    this.ensurePhysicalFarmShop();
    const stack = [...(this.carryStack || [])];
    const result = loadCarryStackToShop(
      this.worldShop,
      stack,
      this.getShopStockFallbacks(),
    );

    this.harvestedItemsCount = (this.harvestedItemsCount || 0) + unloaded;
    this.carryStack = [];
    this.clearCarryTrail();
    this.carriedCount = 0;
    this.loadUnlocked = true;
    this.pendingQuizMode = null;
    this.audioItem?.play();
    this.cameras.main.flash(180, 120, 200, 255);

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'load_success',
      unloaded,
      deliveredToShop: true,
      rp,
    });

    this.applyShopFulfillmentResult(result, { rp });
  }

  /**
   * E on plant bed → one plant quiz, one planting per vegetable type (no replant).
   */
  handlePlantingAttempt(options = {}) {
    if (this.farmInputLocked || !this.player) return;
    if (!options.skipGuard && !this.guardFarmAction('plant')) return;

    if (!this.canPlantMore()) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'target_reached',
        earnings: this.currentMoney,
      });
      return;
    }

    // In free-choice model, check only if this specific bed's crop is already planted
    const cell = this.getPlayerGridCell();
    if (!isPlantableTile(cell.gridX, cell.gridY)) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'not_plot',
        tileX: cell.gridX,
        tileY: cell.gridY,
        gridKey: cell.key,
      });
      return;
    }

    const plot = findPlotAt(cell.gridX, cell.gridY);
    const plotIndex = plot ? PLANT_PLOTS.indexOf(plot) : 0;
    const bedDef = cropDefForPlot(
      plot?.id,
      this.cropChallenge,
      this.levelPlan,
      Math.max(0, plotIndex),
    );
    const bedCropId = bedDef.cropId;

    if (!bedCropId || bedDef.inactive) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'no_crop_for_bed',
        plotId: plot?.id,
      });
      return;
    }

    // One plant type per bed — cannot replant the same crop on another bed
    // Extra quizzes still count until the 15-question quota
    if (this.cropPlantedSet?.has(bedCropId)) {
      if (this.needsQuestionQuota()) {
        this.openPracticeScienceQuiz(bedDef);
        return;
      }
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'already_planted',
        cropType: bedCropId,
        cropName: bedDef.cropName,
      });
      return;
    }

    // Switch active challenge to the crop assigned to this bed
    this._activateBedChallenge(bedCropId);
    const patchCells = this.getPlantPatchCells(cell.gridX, cell.gridY);

    if (patchCells.length < 1) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'tile_occupied',
        tileX: cell.gridX,
        tileY: cell.gridY,
        gridKey: cell.key,
        plotId: plot?.id,
      });
      return;
    }

    this.pendingPatchCells = patchCells.map((c) => ({ ...c }));
    this.pendingGridKey = cell.key;
    this.currentTargetTile = {
      gridX: cell.gridX,
      gridY: cell.gridY,
      key: cell.key,
      x: cell.x,
      y: cell.y,
      tileOriginX: cell.tileOriginX,
      tileOriginY: cell.tileOriginY,
      patchCells: this.pendingPatchCells,
      plotId: plot?.id,
    };

    this.pendingQuizMode = 'plant';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('plant', 'plant', () => ({
      tileX: cell.gridX,
      tileY: cell.gridY,
      gridKey: cell.key,
      plotId: plot?.id,
      patchSize: patchCells.length,
      patchCols: this.farmLevel.plantPatchCols ?? 4,
      patchRows: this.farmLevel.plantPatchRows ?? 3,
      cropType: this.farmLevel.cropId,
    }));
  }

  /** Extra science quiz on an already-planted bed until the 15-question quota. */
  openPracticeScienceQuiz(bedDef = {}) {
    if (this.farmInputLocked || this.forestUnlocked || !this.needsQuestionQuota()) {
      return;
    }
    this.pendingQuizMode = 'practice';
    this.lockPlayerForAnswer();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'plant',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    const remaining = DDA_CONFIG.maxQuestions - this.questionsAnswered();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'practice',
        challenge: 'practice',
        cropName: bedDef.cropName || this.farmLevel?.cropName,
        cropType: bedDef.cropId || this.farmLevel?.cropId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
        questionsRemaining: remaining,
      }),
    );
    this.emitFarmState();
  }

  /** Spawn the pending patch after a correct plant quiz (once per crop type). */
  finishPlanting({ rp = 0 } = {}) {
    const cropId = this.farmLevel?.cropId;
    if (cropId && this.cropPlantedSet?.has(cropId)) {
      // Already planted this crop type this level — ignore duplicate quiz completion
      this.pendingQuizMode = null;
      this.pendingGridKey = null;
      this.pendingPatchCells = [];
      this.currentTargetTile = null;
      this.emitFarmState();
      return;
    }

    const crops = this.spawnCropAtTarget();
    const planted = Array.isArray(crops) ? crops : crops ? [crops] : [];

    if (planted.length > 0) {
      this.plantDoneForChallenge = true;
      // Record which crop was planted for per-crop tracking
      const plantedCropId = planted[0]?.cropType || cropId;
      if (plantedCropId) {
        this.cropPlantedSet = this.cropPlantedSet || new Set();
        this.cropPlantedSet.add(plantedCropId);
      }
      this.persistFarmRun();
      // Keep library harvest target (pick N · sell N) — do not overwrite with patch size.
      // Do not wipe cropsHarvestedTotal / carry — other beds may already be harvested.
      // Don't reset cropsSoldThisChallenge — it's now per-crop via cropSoldMap
      this.farmLevel = {
        ...this.farmLevel,
        harvestTarget: this.harvestTarget,
        goalText: vegetableGoalText(this.cropChallenge, this.harvestTarget),
      };
      this.audioItem?.play();
      this.cameras.main.flash(180, 120, 220, 100);
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_success',
        cropType: this.farmLevel.cropId,
        cropId: planted[0]?.cropId,
        plantedCount: this.plantedCrops.filter((c) => c?.active).length,
        patchPlanted: planted.length,
        harvestTarget: this.harvestTarget,
        rp,
        performanceBand: this.performanceBand,
        timeTargetMs: this.timeTargetMs,
      });
    } else {
      this.pendingGridKey = null;
      this.pendingPatchCells = [];
    }
    this.pendingQuizMode = null;
    this.emitFarmState();
    this.checkTargetReached();
  }

  /**
   * Spawn one independent crop Image at a grid cell (does not clear others).
   */
  spawnCropAtCell(cell, staggerMs = 0, extras = {}) {
    if (!cell || this.plantedGridKeys.has(cell.key)) return null;
    if (!isPlantableTile(cell.gridX, cell.gridY)) return null;

    const worldX = cell.x ?? cell.gridX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = cell.y ?? cell.gridY * TILE_SIZE + TILE_SIZE / 2;

    const plot = findPlotAt(cell.gridX, cell.gridY);
    const plotIndex = plot ? PLANT_PLOTS.indexOf(plot) : 0;
    const def = extras.cropType
      ? { cropId: extras.cropType, tint: extras.tint }
      : cropDefForPlot(plot?.id, this.cropChallenge, this.levelPlan, Math.max(0, plotIndex));
    const crop = new Crop(this, worldX, worldY, {
      cropType: def.cropId,
      value: this.farmLevel.cropValue,
      growMs: this.farmLevel.growMs,
      gridKey: cell.key,
      gridX: cell.gridX,
      gridY: cell.gridY,
      staggerMs,
      tint: def.tint,
    });

    this.cropsGroup.add(crop);
    this.plantedCrops.push(crop);
    this.plantedGridKeys.add(cell.key);
    return crop;
  }

  /**
   * On correct quiz: plant a full multi-row Ã— multi-column patch of sunflowers/corn.
   */
  spawnCropAtTarget() {
    const target = this.currentTargetTile;
    if (!target) return [];

    const patch =
      target.patchCells?.length > 0
        ? target.patchCells
        : this.getPlantPatchCells(target.gridX, target.gridY);

    const planted = [];
    patch.forEach((cell, index) => {
      const crop = this.spawnCropAtCell(cell, index * 40);
      if (crop) planted.push(crop);
    });

    this.currentTargetTile = null;
    this.pendingGridKey = null;
    this.pendingPatchCells = [];
    return planted;
  }

  findNearestReadyCrop(maxDist) {
    const ready = this.plantedCrops.filter((c) => c?.active && c.isReady());
    let nearest = null;
    let best = maxDist;
    ready.forEach((crop) => {
      const d = Phaser.Math.Distance.Between(
        crop.x,
        crop.y,
        this.player.x,
        this.player.y,
      );
      if (d < best) {
        best = d;
        nearest = crop;
      }
    });
    return nearest;
  }

  /**
   * Harvest ready crops underfoot after the harvest quiz unlocks.
   * Walking onto ready crops opens that quiz once (same as pressing E).
   */
  harvestCropsUnderfoot() {
    if (this.farmInputLocked || !this.player) return;

    if (!this.plantDoneForChallenge && (!this.cropPlantedSet || this.cropPlantedSet.size === 0)) {
      this.hideHarvestingBanner();
      return;
    }

    const reach = TILE_SIZE * 1.15;
    const hit = [];

    this.plantedCrops.forEach((crop) => {
      if (!crop?.active || !crop.isReady()) return;
      const d = Phaser.Math.Distance.Between(
        crop.x,
        crop.y,
        this.player.x,
        this.player.y,
      );
      if (d <= reach) hit.push(crop);
    });

    if (hit.length < 1) {
      this.hideHarvestingBanner();
      return;
    }

    // One harvest quiz per vegetable challenge, then free picking onto the back
    if (!this.harvestUnlocked) {
      this.openHarvestQuestion();
      return;
    }

    hit.forEach((crop) => this.harvestCrop(crop, { silent: true }));
    this.showHarvestingBanner(hit.length);
    this.emitInventoryUpdated();

    if (!this._harvestFlashCool) {
      this._harvestFlashCool = true;
      this.cameras.main.flash(90, 120, 220, 100);
      this.audioItem?.play();
      this.time.delayedCall(180, () => {
        this._harvestFlashCool = false;
      });
    }
  }

  showHarvestingBanner(count) {
    const label =
      count > 1 ? `Carrying! +${count}` : 'Carrying on your back!';

    if (!this.harvestBanner) {
      this.harvestBanner = this.add
        .text(this.player.x, this.player.y - 18, label, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffe082',
          stroke: '#1a1408',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(40)
        .setScrollFactor(1);
    } else {
      this.harvestBanner.setText(label);
      this.harvestBanner.setVisible(true);
      this.harvestBanner.setAlpha(1);
    }

    this.harvestBanner.setPosition(this.player.x, this.player.y - 18);
    this._harvestBannerUntil = this.time.now + 450;
  }

  hideHarvestingBanner() {
    if (!this.harvestBanner?.visible) return;
    if (this.time.now < (this._harvestBannerUntil || 0)) {
      this.harvestBanner.setPosition(this.player.x, this.player.y - 18);
      return;
    }
    this.harvestBanner.setVisible(false);
  }

  updateHarvestingBanner() {
    if (!this.harvestBanner?.visible) return;
    this.harvestBanner.setPosition(this.player.x, this.player.y - 18);
    if (this.time.now >= (this._harvestBannerUntil || 0)) {
      this.harvestBanner.setVisible(false);
    }
  }

  harvestCrop(crop, options = {}) {
    if (!crop?.active || !crop.isReady()) return;

    crop.playHarvestFx();
    // Harvested crops ride on the runner's back until unloaded at the Farm Shop
    const cropId = crop.cropType || this.farmLevel?.cropId || 'tomato';
    this.carriedCount = (this.carriedCount || 0) + 1;
    this.cropsHarvestedTotal = (this.cropsHarvestedTotal || 0) + 1;
    this.cropHarvestMap = this.cropHarvestMap || {};
    this.cropHarvestMap[cropId] = (this.cropHarvestMap[cropId] || 0) + 1;
    this.carryStack.push(cropId);
    this.syncCarryTrail(cropId);
    this.updateCarryTrailPositions();

    if (crop.gridKey) this.plantedGridKeys.delete(crop.gridKey);
    this.plantedCrops = this.plantedCrops.filter((c) => c !== crop && c?.active);

    if (!options.silent) {
      this.audioItem?.play();
      this.cameras.main.flash(200, 80, 200, 120);
      this.emitInventoryUpdated();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'harvest',
        carriedCount: this.carriedCount,
        cropsHarvestedTotal: this.cropsHarvestedTotal,
        harvestTarget: this.harvestTarget,
        inventory: this.harvestedItemsCount,
        harvestedCount: this.harvestedItemsCount,
        harvestedItemsCount: this.harvestedItemsCount,
        cropType: crop.cropType,
      });
    } else {
      this.emitFarmState();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'harvest',
        carriedCount: this.carriedCount,
        cropsHarvestedTotal: this.cropsHarvestedTotal,
        harvestTarget: this.harvestTarget,
        inventory: this.harvestedItemsCount,
        cropType: crop.cropType,
      });
    }
  }

  resumeAfterQuiz() {
    this.farmInputLocked = false;
    this.pendingQuizMode = null;
    this.thawFarmCombat();
    this.focusGameCanvas();
  }

  /**
   * Science question that unlocks harvesting for free picking onto the back.
   * If Assessment Engine is down, unlock harvest so gameplay is not soft-locked.
   */
  openHarvestQuestion() {
    if (!this.player || this.farmInputLocked) return;
    if (this.pendingQuizMode === 'harvest') return;
    this.pendingQuizMode = 'harvest';
    this.lockPlayerForAnswer();
    this.quizOpenedAt = Date.now();
    void this.emitScienceQuizFromEngine('harvest', 'harvest', () => ({
      cropType: this.farmLevel.cropId,
    })).then((ok) => {
      if (ok || !this.sys?.isActive()) return;
      this.harvestUnlocked = true;
      this.harvestArmedUntil = Number.MAX_SAFE_INTEGER;
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'farm_shop_hint',
        message:
          'Science quiz unavailable — walk over ready crops to pick them onto your back.',
      });
      this.harvestCropsUnderfoot();
    });
  }

  /**
   * Science question before unload — now just starts unload at the stall.
   */
  openUnloadQuestion() {
    if (!this.player || this.farmInputLocked) return;
    if ((this.carriedCount || 0) > 0) {
      this.handleLoadingAttempt({ skipGuard: true });
      return;
    }
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'farm_shop_hint',
      message:
        'Carry harvests to the Farm Shop and press E to unload.',
    });
  }

  onScienceCorrect(payload = {}) {
    try {
      this.recordQuizAttempt(true, payload.responseTimeMs);
      const mode = this.pendingQuizMode || payload.mode || 'plant';

      if (mode === 'storyline') {
        this.resolveStorylineChallengeSuccess();
        return;
      }

      if (mode === 'world_challenge') {
        this.resolveWorldChallengeSuccess();
        return;
      }

      if (mode === 'item_challenge') {
        this.resolveItemChallengeSuccess();
        return;
      }

      if (mode === 'practice') {
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'practice_quiz_success',
          rp: payload.rp ?? 0,
          questionsAnswered: this.questionsAnswered(),
          maxQuestions: DDA_CONFIG.maxQuestions,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        return;
      }

      if (mode === 'animal_tend') {
        this.animalTended = true;
        this.animalLayer?.tend?.();
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'animal_tend_success',
          rp: payload.rp ?? 0,
          animalName: this.animalChallenge?.animalName,
          produceName: this.animalChallenge?.produceName,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        return;
      }

      if (mode === 'animal_collect') {
        this.animalCollectUnlocked = true;
        this.animalCollectArmedUntil = Number.MAX_SAFE_INTEGER;
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'animal_collect_success',
          rp: payload.rp ?? 0,
          produceName: this.animalChallenge?.produceName,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        this.collectAnimalProduceUnderfoot();
        return;
      }

      if (mode === 'clean_start') {
        this.cleanStarted = true;
        this.cleaningLayer?.start?.();
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'clean_start_success',
          rp: payload.rp ?? 0,
          messName: this.cleaningChallenge?.messName,
          wasteName: this.cleaningChallenge?.wasteName,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        return;
      }

      if (mode === 'clean_sweep') {
        this.cleanSweepUnlocked = true;
        this.cleanSweepArmedUntil = Number.MAX_SAFE_INTEGER;
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'clean_sweep_success',
          rp: payload.rp ?? 0,
          wasteName: this.cleaningChallenge?.wasteName,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        this.sweepCleaningUnderfoot();
        return;
      }

      if (mode === 'harvest') {
        this.harvestUnlocked = true;
        this.harvestArmedUntil = Number.MAX_SAFE_INTEGER;
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'harvest_success',
          rp: payload.rp ?? 0,
        });
        this.emitFarmState();
        this.checkTargetReached();
        this.resumeAfterQuiz();
        this.harvestCropsUnderfoot();
        return;
      }

      if (mode === 'unload' || mode === 'sell') {
        this.unloadUnlocked = true;
        this.pendingQuizMode = null;
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'unload_success',
          rp: payload.rp ?? 0,
        });
        this.ensurePhysicalFarmShop();
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'farm_shop_hint',
          message: 'Press E at the Farm Shop to unload harvests into stock.',
        });
        this.emitFarmState();
        return;
      }

      if (mode === 'load') {
        this.finishLoadToShop({ rp: payload.rp ?? 0 });
        return;
      }

      this.finishPlanting({ rp: payload.rp ?? 0 });
    } finally {
      this.resumeAfterQuiz();
    }
  }

  resolveStorylineChallengeSuccess() {
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    this.resumeAfterQuiz();
    this.emitFarmState();
  }

  resolveItemChallengeSuccess() {
    const pending = this.pendingItemChallenge;
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    if (!pending) {
      this.emitFarmState();
      return;
    }

    const stage = getStage(pending.itemId, pending.stageId);
    const nextStep = (pending.stepIndex || 0) + 1;
    const done = !stage || nextStep >= (stage.steps?.length || 0);

    advanceChallengeProgress(pending.itemId, pending.stageId, {
      stepIndex: done ? stage?.steps?.length || nextStep : nextStep,
      done,
    });

    if (done) {
      if (pending.rewardCash) {
        this.currentMoney += pending.rewardCash;
        this.syncMoneyAliases();
      }
      this.audioItem?.play();
      this.cameras.main.flash(200, 255, 220, 100);
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_complete',
        itemId: pending.itemId,
        stageId: pending.stageId,
        title: pending.title,
        rp: pending.rewardRp || 0,
        rewardCash: pending.rewardCash || 0,
        earnings: this.currentMoney,
      });
    } else {
      this.audioItem?.play();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_step',
        itemId: pending.itemId,
        stageId: pending.stageId,
        stepIndex: nextStep,
        title: pending.title,
        rp: 0,
      });
    }

    this.refreshActiveChallenges();
    this.emitFarmState();
    this.checkTargetReached();
  }

  applyInteractiveAgentReward(payload = {}) {
    const reward = payload.reward || {};
    const cash = Number(reward.cash || reward.value || 0);
    const type = String(reward.type || '');
    let granted = 0;

    if (
      type === 'EMERGENCY_GRANT' ||
      type === 'CROP_HEALTH_RESTORE' ||
      type === 'RESOURCE_BOOST' ||
      cash > 0
    ) {
      const add =
        cash > 0
          ? cash
          : type === 'CROP_HEALTH_RESTORE'
            ? 60
            : type === 'EMERGENCY_GRANT'
              ? 70
              : 40;
      this.currentMoney += add;
      granted = add;
      this.syncMoneyAliases();
    }

    if (type === 'MARKET_MULTIPLIER') {
      const mult = Math.max(1, Number(reward.value) || 1.5);
      this.agentMarketMultiplier = mult;
      this.agentMarketMultiplierUntil = this.time.now + 90_000;
      // Immediate cash taste of the multiplier
      const bonus = Math.round(35 * mult);
      this.currentMoney += bonus;
      granted += bonus;
      this.syncMoneyAliases();
    }

    this.audioItem?.play();
    this.cameras.main.flash(180, 140, 220, 255);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'interactive_agent_reward',
      reward,
      grantedCash: granted,
      badge: reward.badge || null,
      evaluated_level: payload.evaluated_level || null,
      earnings: this.currentMoney,
    });
    this.emitFarmState();
  }

  resolveAgentChallengeSuccess() {
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    this.resumeAfterQuiz();
    this.emitFarmState();
  }

  onScienceIncorrect(payload = {}) {
    let skipResume = false;
    try {
      this.recordQuizAttempt(false, payload.responseTimeMs);
      const mode = this.pendingQuizMode || payload.mode || 'plant';
      const worldPending = this.pendingWorldChallenge;

      this.pendingQuizMode = null;
      this.pendingItemChallenge = null;
      this.pendingWorldChallenge = null;

      if (mode === 'plant') {
        this.currentTargetTile = null;
        this.pendingGridKey = null;
        this.pendingPatchCells = [];
      }

      if (mode !== 'storyline' && mode !== 'world_challenge') {
        this.audioHurt?.play();
        this.cameras.main.flash(300, 255, 0, 0);
        this.cameras.main.shake(160, 0.008);
      } else if (mode === 'world_challenge') {
        this.audioHurt?.play();
        this.pinFarmCamera();
      }

      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type:
          mode === 'load'
            ? 'load_fail'
            : mode === 'harvest'
              ? 'harvest_fail'
              : mode === 'unload' || mode === 'sell'
                ? 'unload_fail'
                : mode === 'item_challenge' ||
                    mode === 'storyline' ||
                    mode === 'world_challenge'
                  ? 'challenge_fail'
                  : 'plant_fail',
        dda: true,
        challengeId: worldPending?.challengeId || payload.challengeId,
        challengeType: worldPending?.challengeType,
        difficulty: worldPending?.difficulty,
        completionStatus: 'incomplete',
        questionId: payload.questionId,
        selectedIndex: payload.selectedIndex,
        performanceBand: this.performanceBand,
        timeTargetMs: this.timeTargetMs,
        carriedCount: this.carriedCount,
      });

      this.emitFarmState();
      this.checkTargetReached();

      if (this.checkWrongAnswerGameOver()) {
        skipResume = true;
      }
    } finally {
      if (!skipResume) this.resumeAfterQuiz();
    }
  }

  /**
   * End the run after too many wrong science answers (not enemy hits).
   * @returns {boolean} true if game over was triggered
   */
  checkWrongAnswerGameOver() {
    if ((this.quizIncorrect || 0) < MAX_WRONG_ANSWERS) return false;
    this.time.delayedCall(420, () => {
      if (this.sys?.isActive()) this.gameOver('wrong_answers');
    });
    return true;
  }

  /**
   * Q key: same as E at the Farm Shop — unload if carrying, else a short hint.
   * No popup panel.
   */
  handleSellInventory() {
    if (!this.sys?.isActive()) return;
    if (this.pendingQuizMode) return;
    if (!this.guardFarmAction('sell')) return;

    const cell = this.getPlayerGridCell();
    const nearShop =
      this.player &&
      (this.farmShopLayer?.isNear?.(this.player.x, this.player.y) ||
        isFarmShopTile(cell.gridX, cell.gridY));

    if (!nearShop) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'sell_blocked',
        reason: 'not_at_shop',
        message: 'Go to the Farm Shop and press E to unload.',
      });
      return;
    }

    if ((this.carriedCount || 0) > 0) {
      this.handleLoadingAttempt({ skipGuard: true });
      return;
    }

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'farm_shop_hint',
      message:
        'Carry harvests here and press E to unload — customers buy automatically.',
    });
  }

  getFarmShopSellableIds() {
    const ids = [];
    const crops = this.levelPlan?.crops || [];
    for (const c of crops) {
      if (c?.cropId) ids.push(c.cropId);
    }
    if (this.animalChallenge) {
      const animalId = String(this.animalChallenge.produceName || '')
        .toLowerCase()
        .replace(/\s+/g, '_');
      if (animalId) ids.push(animalId);
    }
    if (this.cleaningChallenge) ids.push('compost');
    if (!ids.length) {
      ids.push(this.farmLevel?.cropId || this.cropChallenge?.cropId || 'tomato');
    }
    return [...new Set(ids.filter(Boolean))];
  }

  ensurePhysicalFarmShop() {
    if (!this.farmShopLayer) {
      this.farmShopLayer = new FarmShopLayer(this);
    }
    if (!this.farmShopLayer.root) {
      this.farmShopLayer.spawn();
    }

    const sellableItemIds = this.getFarmShopSellableIds();
    if (this.worldShop && !this.worldShop.closed) {
      // Keep customer order pool in sync when crop/animal/clean challenges change
      syncWorldShopSellableIds(this.worldShop, sellableItemIds);
      this.farmShopLayer.sync(this.worldShop);
      return this.worldShop;
    }

    const mult =
      this.cashRewardMultiplierLive ??
      this.gameplaySettingsLive?.cashRewardMultiplier ??
      this.gameplaySettings?.cashRewardMultiplier ??
      1;
    const unitValue = Math.max(
      1,
      Math.round((this.farmLevel?.cropValue || 10) * mult),
    );

    this.worldShop = createWorldShop({
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
      sellableItemIds,
      unitValue,
      cashMult: mult,
    });
    this._farmShopLeftSession = 0;
    this.farmShopLayer.sync(this.worldShop);
    return this.worldShop;
  }

  /** No React popup — sales happen in-world when stock is unloaded. */
  openFarmShopUnload() {
    if (!this.sys?.isActive()) return;
    this.ensurePhysicalFarmShop();
    if ((this.carriedCount || 0) > 0) {
      this.handleLoadingAttempt({ skipGuard: true });
      return;
    }
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'farm_shop_hint',
      message:
        'Carry harvests here and press E to unload — customers buy automatically.',
    });
  }

  /** Alias kept for older call sites */
  openFarmCustomerShop() {
    this.openFarmShopUnload();
  }

  emitFarmShopState() {
    const snap = snapshotWorldShop(this.worldShop);
    ForestGameBridge.emit(FARM_EVENTS.FARM_SHOP_STATE, {
      harvestedItemsCount: this.harvestedItemsCount || 0,
      shopStock: snap?.shopStock || {},
      customers: snap?.customers || [],
      difficulty: snap?.difficulty || null,
      completedCount: snap?.completedCount || 0,
      leftCount: snap?.leftCount || 0,
      coinsEarned: snap?.coinsEarned || 0,
      currentMoney: this.currentMoney,
      earnings: this.currentMoney,
    });
  }

  emitFarmShopTelemetry(events = []) {
    for (const ev of events) {
      if (!ev?.type) continue;
      ForestGameBridge.emit(FARM_EVENTS.FARM_SHOP_TELEMETRY, {
        ...ev,
        levelNumber: this.farmLevel?.id,
      });
    }
  }

  handleFarmShopUnload() {
    // Cart removed — unload at the Farm Shop stall with E.
  }

  applyShopSaleProgress(customer) {
    if (!customer?.requestedItems) return;
    for (const line of customer.requestedItems) {
      const id = String(line.itemId || '');
      const n = Math.max(0, Number(line.qty) || 0);
      if (/milk|egg|wool|animal/.test(id)) {
        this.animalSoldThisChallenge =
          (this.animalSoldThisChallenge || 0) + n;
      } else if (/compost|clean/.test(id)) {
        this.cleanSoldThisChallenge =
          (this.cleanSoldThisChallenge || 0) + n;
      } else {
        this.cropsSoldThisChallenge =
          (this.cropsSoldThisChallenge || 0) + n;
        // Per-crop tracking for free-choice multi-crop model
        if (id) {
          this.cropSoldMap = this.cropSoldMap || {};
          this.cropSoldMap[id] = (this.cropSoldMap[id] || 0) + n;
        }
      }
    }
  }

  closeFarmShopUnload() {
    this.farmShopUnloadOpen = false;
    this.farmInputLocked = false;
    this.thawFarmCombat();
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.farmShopLayer?.sync?.(this.worldShop);
    this.emitFarmState();
    this.focusGameCanvas();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'farm_shop_closed',
      completedCount: this.worldShop?.completedCount || 0,
      leftCount: this.worldShop?.leftCount || 0,
    });
  }

  applyFarmCustomerShopResult() {
    this.closeFarmShopUnload();
  }

  tickPhysicalFarmShop() {
    if (!this.worldShop || this.worldShop.closed) return;
    if (this.farmShopUnloadOpen || this.isFarmCombatFrozen()) return;
    const { left, events } = tickWorldShopPatience(this.worldShop, Date.now());
    if (left?.length) {
      this._farmShopLeftSession =
        (this._farmShopLeftSession || 0) + left.length;
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'shop_customers_left',
        count: left.length,
        totalLeft: this.worldShop.leftCount,
        reason: 'patience_expired',
      });
    }
    if (events?.length) this.emitFarmShopTelemetry(events);
    this.farmShopLayer?.sync?.(this.worldShop);
    if (events?.length || left?.length) this.emitFarmShopState();
  }

  completeSellInventory() {
    if (!this.sys?.isActive()) return;
    const harvestedItemsCount = this.harvestedItemsCount;
    if (harvestedItemsCount <= 0) return;

    const mult =
      this.cashRewardMultiplierLive ??
      this.gameplaySettingsLive?.cashRewardMultiplier ??
      this.gameplaySettings?.cashRewardMultiplier ??
      1;
    const unitValue = Math.max(
      1,
      Math.round(this.farmLevel.cropValue * mult),
    );
    const coinsEarned = harvestedItemsCount * unitValue;
    this.harvestedItemsCount = 0;
    this.currentMoney += coinsEarned;
    this.syncMoneyAliases();
    const cropSold = harvestedItemsCount;
    this.cropsSoldThisChallenge =
      (this.cropsSoldThisChallenge || 0) + cropSold;

    this.audioItem?.play();
    this.cameras.main.flash(180, 255, 220, 80);

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'sell',
      sold: harvestedItemsCount,
      gained: coinsEarned,
      coinsEarned,
      coinsGained: coinsEarned,
      unitValue,
      cashRewardMultiplier: mult,
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
    });

    this.emitInventoryUpdated();
    this.focusGameCanvas();

    if (
      !this.forestUnlocked && !this.levelCropComplete
    ) {
      const levelCrops2 = this.levelPlan?.crops || [];
      const allDone2 = levelCrops2.length > 0 && levelCrops2.every((c) => {
        const target = Math.max(1, Number(this.harvestTarget) || c.harvestCount || 4);
        return (this.cropSoldMap?.[c.cropId] || 0) >= target;
      });
      if (allDone2) this.advanceVegetableChallenge();
    }
    if (
      !this.forestUnlocked &&
      (this.animalSoldThisChallenge || 0) >= this.animalCollectTarget
    ) {
      this.advanceAnimalChallenge();
    }
    if (
      !this.forestUnlocked &&
      (this.cleanSoldThisChallenge || 0) >= this.cleanSweepTarget
    ) {
      this.advanceCleaningChallenge();
    }
  }

  /** @deprecated Use handleSellInventory */
  sellInventory() {
    this.handleSellInventory();
  }

  openForestGate() {
    if (!this.exit.body) {
      this.physics.add.existing(this.exit, true);
    } else {
      this.exit.body.enable = true;
    }
    this.exit.setAlpha(1);
    this.tweens.add({
      targets: this.exit,
      scale: 1.25,
      yoyo: true,
      repeat: 3,
      duration: 220,
    });
    this.audioEnemyDeath?.play();
  }

  update(time) {
    this.releaseStaleFarmLocks();
    // Keep the map pin tracking even while a quiz or Sage locks farm input
    this.emitPlayerMapPos();
    if (this.isFarmCombatFrozen() || this.farmShopUnloadOpen) {
      this.freezeFarmForQuiz();
      return;
    }
    if (this.isAnswerLockActive()) {
      this.lockPlayerForAnswer();
      this.tickPhysicalFarmShop?.(time);
      this.animateEnemies();
      this.handleCollisions();
      this.cullOffscreenArrows();
      return;
    }
    this.worldLayer?.update(
      this.farmInputLocked || !this.player ? -9999 : this.player.x,
      this.player?.y || 0,
      time,
    );
    this.animalLayer?.update(time);
    this.cleaningLayer?.update(time);
    this.tickPhysicalFarmShop?.(time);
    this.handlePlayerInput();
    this.handleCollisions();
    this.harvestCropsUnderfoot();
    this.collectAnimalProduceUnderfoot();
    this.sweepCleaningUnderfoot();
    this.updateHarvestingBanner();
    this.pulseNearbyCrops();
    this.animateEnemies();
    this.updateCarryTrailPositions();
    this.cullOffscreenArrows();
    // Keep internal score ticking without drawing legacy HUD text
    const elapsed = Math.round(
      (time - this.startTime) / 1000 - SCORE_TIME_OFFSET_SEC,
    );
    this.player?.playerModel?.calculateScore(elapsed);
  }

  addAudios() {
    this.audioHurt = this.sound.add('hurt');
    this.audioItem = this.sound.add('item');
    this.audioEnemyDeath = this.sound.add('enemy-death');
    this.audioSlash = this.sound.add('slash');
  }

  createMap() {
    try {
      this.map?.destroy();
    } catch {
      /* first boot */
    }
    this.colLayer = null;
    this.groundLayer = null;
    this.decorLayer = null;

    const map = this.make.tilemap({ key: 'map' });
    const terrain = map.addTilesetImage('tileset');
    const objects = map.addTilesetImage('objects');
    const collisions = map.addTilesetImage('collisions');

    const ground = map.createLayer('Tile Layer', [objects, terrain]);
    const decor = map.createLayer('Tile Layer 2', [objects, terrain]);
    ground?.setDepth(0);
    decor?.setDepth(1);
    this.groundLayer = ground;
    this.decorLayer = decor;

    this.colLayer = map.createLayer('Collisions Layer', [collisions]);
    this.colLayer.setVisible(false);
    this.colLayer.setDepth(2);
    map.setCollision([0, 1]);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.map = map;
    try {
      this.physics.world.resume();
    } catch {
      /* ignore */
    }
  }

  createExit() {
    this.exit = this.add.sprite(47.5 * TILE_SIZE, 28.5 * TILE_SIZE, 'exit');
    this.exit.setAlpha(0);
  }

  populateEnemies() {
    this.applyFrustrationGamePersonalization({ respawnSpeedOnly: false });
    this.spawnEnemiesByGid(MOLE_GID, true, 'idle/mole-idle-front');
    this.spawnEnemiesByGid(TREANT_GID, false, 'idle/treant-idle-front');
  }

  /**
   * Live CSF personalization loop:
   * enemies, quiz timer/hints/retries, cash multiplier, player pace, farm mood.
   */
  applyFrustrationGamePersonalization(opts = {}) {
    const { respawnSpeedOnly = true } = opts;
    const base =
      this.gameplaySettingsBase ||
      this.gameplaySettings ||
      getGameplaySettings(this.gameplayBand || 'medium');
    // Keep the original band settings as the baseline for re-blending
    if (!this.gameplaySettingsBase) {
      this.gameplaySettingsBase = { ...base };
    }

    const settings = applyFrustrationToGameplaySettings(
      this.gameplaySettingsBase,
      this.frustrationScore || 0,
      this.frustrationLevel || 'low',
    );
    this.gameplaySettingsLive = settings;
    // Live assist overrides (quiz + cash) without erasing band identity
    this.answerTimerMs = settings.answerTimerMs;
    this.hintLevel = settings.hintLevel;
    this.maxRetriesPerQuestion = settings.maxRetriesPerQuestion;
    this.hurtInvulnMult = settings.hurtInvulnMult || 1;
    this.enemyDamageChance = settings.enemyDamageChance ?? 1;
    this.playerSpeedMult = settings.playerSpeedMult || 1;
    this.enemySpeed = settings.enemySpeed;
    this.enemyDistanceTiles = settings.enemyDistanceTiles;
    this.enemyCountFactor = settings.enemyCountFactor;
    this.cashRewardMultiplierLive = settings.cashRewardMultiplier;

    const prevBand = this._lastFrustrationBand || null;
    const nextBand = settings.frustrationLevel || 'low';
    this._lastFrustrationBand = nextBand;

    if (respawnSpeedOnly) {
      const group = this.enemiesGroup;
      if (group?.getChildren) {
        const speed = settings.enemySpeed;
        group.getChildren().forEach((enemy) => {
          if (enemy && typeof enemy.setPatrolSpeed === 'function') {
            enemy.setPatrolSpeed(speed);
          }
          if (enemy && typeof enemy.applyAdaptiveLook === 'function') {
            enemy.applyAdaptiveLook(nextBand);
          }
        });
      }
    }

    // Soft farm-mood refresh only when the frustration band changes
    if (
      prevBand &&
      prevBand !== nextBand &&
      this.farmingVisual?.paintFromStudent
    ) {
      try {
        this.farmingVisual.paintFromStudent({
          performanceBand: this.performanceBand,
          gameplayBand: this.gameplayBand,
          frustrationLevel: nextBand,
          completedCount: this.storyRecoveredCount || 0,
        });
      } catch {
        /* ignore visual refresh errors */
      }
    }

    // Re-shape activity targets / micro-challenges when band changes
    if (!prevBand || prevBand !== nextBand) {
      this.refreshPersonalizedActivities({ reapplyTargets: true });
    } else {
      this.refreshPersonalizedActivities({ reapplyTargets: false });
    }

    this.emitFarmState?.();
  }

  /**
   * Build / refresh the student's personalized activity board from CSF.
   */
  refreshPersonalizedActivities({ reapplyTargets = false } = {}) {
    this.activityBoard = buildPersonalizedActivityBoard({
      cropChallenge: this.cropChallenge,
      animalChallenge: this.animalChallenge,
      cleaningChallenge: this.cleaningChallenge,
      mastery: this.mastery,
      frustrationScore: this.frustrationScore || 0,
      frustrationLevel: this.frustrationLevel || 'low',
    });

    if (reapplyTargets && (this.cropsHarvestedTotal || 0) === 0 && this.cropChallenge) {
      const crop = personalizeCropChallenge(this.cropChallenge, {
        mastery: this.mastery,
        frustrationScore: this.frustrationScore || 0,
        frustrationLevel: this.frustrationLevel || 'low',
      });
      this.personalizedCrop = crop;
      this.harvestTarget = crop.harvestTarget;
      this.farmLevel = {
        ...this.farmLevel,
        harvestTarget: crop.harvestTarget,
        goalText: crop.goalText,
      };
    }
    if (
      reapplyTargets &&
      (this.animalCollectedTotal || 0) === 0 &&
      this.animalChallenge
    ) {
      const animal = personalizeAnimalChallenge(this.animalChallenge, {
        mastery: this.mastery,
        frustrationScore: this.frustrationScore || 0,
        frustrationLevel: this.frustrationLevel || 'low',
      });
      this.personalizedAnimal = animal;
      this.animalCollectTarget = animal.collectTarget;
    }
    if (
      reapplyTargets &&
      (this.cleanSweptTotal || 0) === 0 &&
      this.cleaningChallenge
    ) {
      const clean = personalizeCleaningChallenge(this.cleaningChallenge, {
        mastery: this.mastery,
        frustrationScore: this.frustrationScore || 0,
        frustrationLevel: this.frustrationLevel || 'low',
      });
      this.personalizedClean = clean;
      this.cleanSweepTarget = clean.sweepTarget;
    }
  }

  /** @deprecated use applyFrustrationGamePersonalization */
  applyFrustrationEnemyPressure() {
    this.applyFrustrationGamePersonalization({ respawnSpeedOnly: true });
  }

  spawnEnemiesByGid(gid, verticalMove, idleFrame) {
    const objectLayer = this.map.getObjectLayer('Object Layer');
    if (!objectLayer) return;

    const factor = Number.isFinite(this.enemyCountFactor)
      ? this.enemyCountFactor
      : 1;
    const speed = Number.isFinite(this.enemySpeed) ? this.enemySpeed : 60;
    const distTiles = Number.isFinite(this.enemyDistanceTiles)
      ? this.enemyDistanceTiles
      : 0;
    const playerTileX = 48;
    const playerTileY = 32;

    const sources = objectLayer.objects.filter((obj) => obj.gid === gid);
    if (!sources.length) return;

    let spawnList = sources.slice();
    if (factor < 1) {
      const keep = Math.max(1, Math.round(sources.length * factor));
      // Prefer farther spawns for weaker students when thinning
      spawnList = [...sources]
        .sort((a, b) => {
          const da =
            Math.hypot(a.x / TILE_SIZE - playerTileX, a.y / TILE_SIZE - playerTileY);
          const db =
            Math.hypot(b.x / TILE_SIZE - playerTileX, b.y / TILE_SIZE - playerTileY);
          return distTiles >= 0 ? db - da : da - db;
        })
        .slice(0, keep);
    } else if (factor > 1) {
      const extra = Math.round(sources.length * (factor - 1));
      for (let i = 0; i < extra; i += 1) {
        const src = sources[i % sources.length];
        spawnList.push({
          ...src,
          x: src.x + (i % 2 === 0 ? TILE_SIZE * 2 : -TILE_SIZE * 2),
          y: src.y + (i % 3 === 0 ? TILE_SIZE : -TILE_SIZE),
          _duplicate: true,
        });
      }
    }

    spawnList.forEach((obj) => {
      let tileX = obj.x / TILE_SIZE;
      let tileY = obj.y / TILE_SIZE;

      if (distTiles !== 0) {
        const dx = tileX - playerTileX;
        const dy = tileY - playerTileY;
        const len = Math.hypot(dx, dy) || 1;
        const push = distTiles / len;
        tileX += dx * push;
        tileY += dy * push;
      }

      const enemy = new Enemy(
        this,
        tileX,
        tileY,
        verticalMove,
        idleFrame,
        speed,
      );
      enemy.setSize(10, 10);
      enemy.setDepth(1);
      if (typeof enemy.applyAdaptiveLook === 'function') {
        enemy.applyAdaptiveLook(this.frustrationLevel || this._lastFrustrationBand);
      }
      this.enemiesGroup.add(enemy);
    });
  }

  createPlayer() {
    this.player = new Player(
      this,
      48,
      32,
      'atlas',
      'idle/hero-idle-back/hero-idle-back',
    );
    this.player.setSize(8, 13);
    this.player.setDepth(5);
    this.player.setImmovable(false);
    if (this.player.body) {
      this.player.body.enable = true;
      this.player.body.moves = true;
      this.player.body.pushable = true;
    }
  }

  createCamera() {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(FARM_CAMERA_ZOOM);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    if (this.map) {
      this.cameras.main.setBounds(
        0,
        0,
        this.map.widthInPixels,
        this.map.heightInPixels,
      );
    }
    this.input.on('wheel', () => {
      this.pinFarmCamera();
    });
    this._onWindowScroll = () => this.pinFarmCamera();
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('scroll', this._onWindowScroll);
    });
  }

  /** Keep the in-game camera on the hero. Page/UI scroll must not pan or zoom it. */
  pinFarmCamera() {
    if (!this.cameras?.main || !this.player) return;
    this.cameras.main.setZoom(FARM_CAMERA_ZOOM);
    this.cameras.main.startFollow(this.player, true, 1, 1);
  }


  handlePlayerInput() {
    const { player, cursors } = this;
    if (!player || !this.moveKeys) return;
    const model = player.playerModel;
    player.walking = false;

    if (this.isScienceQuizOpen() || this.isAvatarOpen() || this.isPauseOpen()) {
      player.setVelocity(0);
      return;
    }

    this.releaseStaleFarmLocks();

    const right = this.moveKeys.right || Boolean(cursors?.right?.isDown);
    const left = this.moveKeys.left || Boolean(cursors?.left?.isDown);
    const up = this.moveKeys.up || Boolean(cursors?.up?.isDown);
    const down = this.moveKeys.down || Boolean(cursors?.down?.isDown);

    const moveSpeed = PLAYER_SPEED * (Number(this.playerSpeedMult) || 1);

    if (right) {
      this.movePlayer(moveSpeed, 0, DIRECTIONS.RIGHT, 'walk-side', false);
    } else if (left) {
      this.movePlayer(-moveSpeed, 0, DIRECTIONS.LEFT, 'walk-side', true);
    } else if (up) {
      this.movePlayer(0, -moveSpeed, DIRECTIONS.UP, 'walk-back', false);
    } else if (down) {
      this.movePlayer(0, moveSpeed, DIRECTIONS.DOWN, 'walk-front', false);
    } else {
      player.setVelocity(0);
      player.setFrame(player.frameMap[model.direction]);
      player.setFlipX(model.direction === DIRECTIONS.LEFT);
    }

    const spacePressed =
      this.moveKeys.space || Boolean(cursors && Phaser.Input.Keyboard.JustDown(cursors.space));
    if (spacePressed && !this._spaceHeld) {
      player.setVelocity(0);
      const shot = new Arrow(this);
      this.projectilesGroup.add(shot);
      this.audioSlash.play();
      model.shots += 1;
    }
    this._spaceHeld = spacePressed;
  }

  movePlayer(vx, vy, direction, animKey, flipX) {
    if (
      this.farmInputLocked ||
      this.pendingQuizMode ||
      this.isScienceQuizOpen() ||
      this.isQuestScrollOpen() ||
      this.isUnlockShopOpen() ||
      this.isMotivationOpen() ||
      this.isPauseOpen() ||
      this.isAvatarOpen()
    ) {
      return;
    }
    const { player } = this;
    try {
      this.physics?.world?.resume?.();
    } catch {
      /* ignore */
    }
    if (player.body) {
      player.body.enable = true;
      player.body.moves = true;
      player.body.pushable = true;
    }
    player.setImmovable(false);
    player.walking = true;
    player.setVelocity(vx, vy);
    player.playerModel.direction = direction;
    player.play(animKey, true);
    player.setFlipX(flipX);
  }

  handleCollisions() {
    this.physics.collide(this.player, this.colLayer);
    this.physics.collide(this.enemiesGroup, this.colLayer);
    this.physics.overlap(this.player, this.enemiesGroup, this.hurtPlayer, null, this);
    this.physics.overlap(this.player, this.exit, this.onForestGateEnter, null, this);
    this.physics.overlap(
      this.enemiesGroup,
      this.projectilesGroup,
      this.onEnemyHit,
      null,
      this,
    );
    // Crops are Images (not physics bodies) â€” pulse via proximity in update
  }

  pulseNearbyCrops() {
    this.plantedCrops.forEach((crop) => {
      if (!crop?.active || !crop.isReady() || crop._pulsing) return;
      const d = Phaser.Math.Distance.Between(
        crop.x,
        crop.y,
        this.player.x,
        this.player.y,
      );
      if (d > TILE_SIZE * 1.35) return;
      crop._pulsing = true;
      this.tweens.add({
        targets: crop,
        scaleX: crop.fullScale * 1.12,
        scaleY: crop.fullScale * 1.12,
        yoyo: true,
        duration: 200,
        onComplete: () => {
          crop._pulsing = false;
        },
      });
    });
  }

  onForestGateEnter() {
    if (!this.forestUnlocked) return;
    this.clearAllCrops({ silent: true });
    if (isLearningPathLinked()) {
      ForestGameBridge.emit(FARM_EVENTS.CHAPTER_GAME_COMPLETE, {
        levelId: this.levelId || 1,
        startingMoney: this.currentMoney || 0,
        currentMoney: this.currentMoney || 0,
      });
      return;
    }
    const nextLevelId = (this.levelId || 1) + 1;
    saveFarmProgress({
      currentLevelId: nextLevelId,
      cash: this.currentMoney || 0,
    });
    ForestGameBridge.emit(FARM_EVENTS.START_FARM_LEVEL, {
      levelId: nextLevelId,
      startingMoney: this.currentMoney || 0,
    });
  }

  onEnemyHit(enemy, shot) {
    enemy.destroy();
    shot.destroy();

    const { playerModel } = this.player;
    playerModel.kills += 1;
    this.audioEnemyDeath.play();

    if (playerModel.kills >= KILLS_TO_OPEN_EXIT && !this.forestUnlocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'combat_progress',
        kills: playerModel.kills,
      });
    }
  }

  hurtPlayer(player) {
    if (
      this.isQuestScrollOpen() ||
      this.isUnlockShopOpen() ||
      this.isMotivationOpen() ||
      this.isPauseOpen() ||
      this.isAvatarOpen() ||
      this.physics?.world?.isPaused
    ) {
      return;
    }
    const { playerModel } = player;
    if (playerModel.hurtFlag) return;

    // High frustration → some contacts glance off (softer attacks)
    const damageChance =
      this.enemyDamageChance != null ? Number(this.enemyDamageChance) : 1;
    if (damageChance < 1 && Math.random() > damageChance) {
      player.setAlpha(0.75);
      this.time.delayedCall(350, () => {
        if (player?.active) player.setAlpha(1);
      });
      return;
    }

    playerModel.hurtFlag = true;
    const invuln = Math.round(
      HURT_INVULN_MS * (Number(this.hurtInvulnMult) || 1),
    );
    this.time.delayedCall(invuln, () => {
      playerModel.hurtFlag = false;
      player.setAlpha(1);
    });

    player.setAlpha(0.5);
    playerModel.health = Math.max(0, playerModel.health - 1);
    this.enemyHits = (this.enemyHits || 0) + 1;
    this.audioHurt.play();
    this.emitFarmState();
  }

  gameOver(reason = 'wrong_answers') {
    if (!this.sys?.isActive()) return;
    if (reason === 'wrong_answers') {
      void terminateAssessmentSession({
        reason: 'wrong_answers_exhausted',
        source: 'component_3',
      });
    } else {
      clearAssessmentSession();
    }
    this.farmInputLocked = true;
    this._runEnded = true;
    clearFarmRun();
    this.clearAllCrops({ silent: true });
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'gameover' });
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'game_over',
      reason,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      maxWrongAnswers: MAX_WRONG_ANSWERS,
      levelId: this.farmLevel?.id,
      earnings: this.currentMoney,
    });
    this.scene.start('GameOverScene', {
      score: this.player?.playerModel?.scoreCalc ?? 0,
      reason,
      quizCorrect: this.quizCorrect ?? 0,
      quizIncorrect: this.quizIncorrect ?? 0,
      maxWrong: MAX_WRONG_ANSWERS,
      levelId: this.farmLevel?.id ?? 1,
      earnings: this.currentMoney ?? 0,
    });
  }

  animateEnemies() {
    this.enemiesGroup.getChildren().forEach((enemy) => {
      const { velocity } = enemy.body;
      if (velocity.x > 0) {
        enemy.play('tree-side', true);
        enemy.setFlipX(false);
      } else if (velocity.x < 0) {
        enemy.play('tree-side', true);
        enemy.setFlipX(true);
      } else if (velocity.y < 0) {
        enemy.play('mole-back', true);
      } else if (velocity.y > 0) {
        enemy.play('mole-front', true);
      }
    });
  }

  cullOffscreenArrows() {
    this.projectilesGroup.getChildren().forEach((arrow) => {
      if (!this.cameras.main.worldView.contains(arrow.x, arrow.y)) {
        arrow.destroy();
      }
    });
  }
}

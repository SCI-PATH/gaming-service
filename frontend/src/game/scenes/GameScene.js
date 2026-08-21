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
  PLAYER_SPEED,
  SCORE_TIME_OFFSET_SEC,
  TILE_SIZE,
  FARM_CAMERA_ZOOM,
} from '../config/constants';
import { ForestGameBridge, FARM_EVENTS } from '../EventBus';
import { getFarmLevel, pickScienceQuestion } from '../../data/farmLevels';
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
import {
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
  UNLOCK_WORLD_SLOTS,
  UNLOCK_BUILDING_SLOTS,
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
  isLoadingTile,
  LOADING_ZONE,
  loadingZoneCenter,
  PLANT_PLOTS,
} from '../../data/plantPlots.js';
import { getCreature } from '../../data/assetLibrary.js';
import { getStorylineProp } from '../../storyline/storylineVisuals.js';
import WorldChallengeLayer from '../world/WorldChallengeLayer.js';
import AnimalPaddockLayer from '../world/AnimalPaddockLayer.js';
import CleaningYardLayer from '../world/CleaningYardLayer.js';
import {
  ANIMAL_CHALLENGE_COUNT,
  animalCollectTarget,
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
  cleaningSweepTarget,
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
  pickCountForChallenge,
  vegetableGoalText,
} from '../../data/cropChallenges.js';
import {
  advanceCropChallengeIndex,
  getCropChallengeIndex,
  setCropChallengeIndex,
} from '../../data/cropChallengeStore.js';

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
  }

  create() {
    this.farmLevel = getFarmLevel(this.levelId);
    this.baseCropValue = this.farmLevel.cropValue;
    this.currentMoney = this.devStartingMoney || 0;
    this.earnings = 0;
    this.harvestedItemsCount = 0; // crops loaded into cart (sellable)
    this.carriedCount = 0; // crops on the runner's back (not yet unloaded)
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
    this.unloadUnlocked = false;
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
    this.cartStack = [];
    const patch = plantPatchFromMastery(this.mastery);

    // Adaptive GAMEPLAY (enemies / timers / retries / hints) â€” not question DDA
    const gameplayStart = getGameplayForLevelStart(this.levelId);
    this.gameplayBand = gameplayStart.band;
    this.gameplaySettings = gameplayStart.settings;
    this.gameplayPreviousLevel = gameplayStart.previousLevel;
    this.gameplayAppliedBonus = null;
    this.levelTargetCompletionMs = this.gameplaySettings.levelTargetTimeMs;
    this.answerTimerMs = this.gameplaySettings.answerTimerMs;

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
    this.createLoadingZoneMarker();
    this.createHarvestCart();
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

    this.emitFarmState();
    this.emitPlayerMapPos();

    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: true });
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

  /**
   * Advance to the next farm without tearing down Phaser.
   * scene.restart() / start() on a live GameScene kills arrow keys.
   */
  beginNextLevel(data = {}) {
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
    this.unloadUnlocked = false;
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
    this.cartStack = [];
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
    this.gameplayPreviousLevel = gameplayStart.previousLevel;
    this.gameplayAppliedBonus = null;
    this.levelTargetCompletionMs = this.gameplaySettings.levelTargetTimeMs;
    this.answerTimerMs = this.gameplaySettings.answerTimerMs;

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
    this.refreshHarvestCartVisual?.();

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
        Phaser.Input.Keyboard.KeyCodes.E,
        Phaser.Input.Keyboard.KeyCodes.Q,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
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
   * True when focus is in React text fields / overlays (avatar, quiz, shopâ€¦).
   * Prevents Phaser from eating Space, E, Q, and other letters while typing.
   */
  shouldIgnoreGameKeys(event = null) {
    const el = event?.target || document.activeElement;
    if (this.isTypingTarget(el)) return true;
    if (this.uiInputLocked) {
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el?.isContentEditable) return true;
      if (
        el?.closest?.(
          [
            '.avatar-assistant-overlay',
            '.science-quiz-overlay',
            '.unlock-shop-overlay',
            '.student-login',
          ].join(','),
        )
      ) {
        return true;
      }
    }
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
        if (this.isTypingTarget(event.target || document.activeElement)) return;
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

  /** True while a modal should freeze combat (quiz, quest scroll, shop, motivation). */
  isFarmCombatFrozen() {
    return Boolean(
      this.pendingQuizMode ||
        this.isScienceQuizOpen() ||
        this.isQuestScrollOpen() ||
        this.isUnlockShopOpen() ||
        this.isMotivationOpen(),
    );
  }

  /** Freeze player + enemies while quiz / quest scroll / shop owns the screen. */
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
  }

  /**
   * Shop / missed quiz close can leave Arcade paused and the hero wedged.
   * Walking is restored whenever quiz / quest scroll are not on screen.
   */
  releaseStaleFarmLocks() {
    if (this.isFarmCombatFrozen()) return;
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
    };
    this._onTestChallenge = (payload = {}) => {
      if (!this.sys?.isActive()) return;
      this.jumpToTestChallenge(payload);
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
        // Freeze Arcade for quiz / quest scroll / shop so enemies cannot end the run.
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
        if (this._uiOwnedWorldPause) {
          this.thawFarmCombat();
        }
        this._uiOwnedWorldPause = false;
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
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UI_INPUT_LOCK);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.START_ITEM_CHALLENGE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SYNC_STUDENT_STATE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SET_TEST_CHALLENGE);
    // NOTE: do NOT removeAllListeners(START_FARM_LEVEL) â€” ForestRPGCanvas owns that

    ForestGameBridge.on(FARM_EVENTS.PLANT_CROP, this._onPlant);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
    ForestGameBridge.on(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
    ForestGameBridge.on(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
    ForestGameBridge.on(FARM_EVENTS.UI_INPUT_LOCK, this._onUiInputLock);
    ForestGameBridge.on(
      FARM_EVENTS.START_ITEM_CHALLENGE,
      this._onStartItemChallenge,
    );
    ForestGameBridge.on(FARM_EVENTS.SYNC_STUDENT_STATE, this._onStudentState);
    ForestGameBridge.on(FARM_EVENTS.SET_TEST_CHALLENGE, this._onTestChallenge);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.PLANT_CROP, this._onPlant);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
      ForestGameBridge.off(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
      ForestGameBridge.off(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
      ForestGameBridge.off(FARM_EVENTS.UI_INPUT_LOCK, this._onUiInputLock);
      ForestGameBridge.off(
        FARM_EVENTS.START_ITEM_CHALLENGE,
        this._onStartItemChallenge,
      );
      ForestGameBridge.off(FARM_EVENTS.SYNC_STUDENT_STATE, this._onStudentState);
      ForestGameBridge.off(FARM_EVENTS.SET_TEST_CHALLENGE, this._onTestChallenge);
    });
  }

  syncMoneyAliases() {
    this.earnings = this.currentMoney;
    this.inventory = this.harvestedItemsCount;
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
      cartCount: this.harvestedItemsCount,
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
      animalGoalText: this.animalChallenge
        ? animalGoalText(this.animalChallenge, this.animalCollectTarget)
        : '',
      cleanMessName: this.cleaningChallenge?.messName || 'mess',
      cleanWasteName: this.cleaningChallenge?.wasteName || 'waste',
      cleanVerb: this.cleaningChallenge?.verb || 'Clean',
      cleaningChallengeIndex: 0,
      cleaningChallengeTotal: 1,
      cleanSweepTarget: this.cleanSweepTarget,
      cleanSweptTotal: this.cleanSweptTotal || 0,
      cleanSoldThisChallenge: this.cleanSoldThisChallenge || 0,
      cleanStarted: Boolean(this.cleanStarted),
      cleanGoalText: this.cleaningChallenge
        ? cleaningGoalText(this.cleaningChallenge, this.cleanSweepTarget)
        : '',
      cropValue: this.farmLevel.cropValue,
      goalText: this.farmLevel.goalText,
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
      gameplaySettings: this.gameplaySettings,
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
    const payload = {
      playerMapX: x / TILE_SIZE,
      playerMapY: y / TILE_SIZE,
      playerTileX: Math.floor(x / TILE_SIZE),
      playerTileY: Math.floor(y / TILE_SIZE),
      mapWidth: this.map?.width ?? 100,
      mapHeight: this.map?.height ?? 75,
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
    };
  }

  persistLevelMastery() {
    const avgMs = this.levelAvgResponseMs() || null;

    return saveLevelPerformance(this.levelId, {
      attempts: this.levelAttempts,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      avgResponseMs: avgMs,
      timeTargetMs: this.timeTargetMs,
    });
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

  /** Attach gameplay-assist fields to science quiz payloads (not question pick). */
  withGameplayQuizMeta(payload = {}) {
    const settings = this.gameplaySettings || getGameplaySettings('medium');
    return {
      ...payload,
      answerTimerMs: this.answerTimerMs,
      hintLevel: settings.hintLevel,
      maxRetriesPerQuestion: settings.maxRetriesPerQuestion,
      gameplayBand: this.gameplayBand,
      gameplayAssist: {
        answerTimerMs: this.answerTimerMs,
        hintLevel: settings.hintLevel,
        maxRetriesPerQuestion: settings.maxRetriesPerQuestion,
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

  /** Vegetable challenge for the gold plant beds — one crop at a time. */
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
    const harvestTarget = pickCountForChallenge(challenge, this.mastery);
    this.cropChallenge = challenge;
    this.harvestTarget = harvestTarget;
    if (resetProgress) {
      this.cropsHarvestedTotal = 0;
      this.cropsSoldThisChallenge = 0;
      // New vegetable challenge → one plant allowed again for the new type
      this.plantDoneForChallenge = false;
      this.harvestUnlocked = false;
      this.loadUnlocked = false;
      this.unloadUnlocked = false;
      this.harvestArmedUntil = 0;
    }
    this.farmLevel = {
      ...this.farmLevel,
      cropId: challenge.cropId,
      cropName: challenge.cropName,
      harvestTarget,
      goalText: vegetableGoalText(challenge, harvestTarget),
    };
  }

  syncVegetableGoalText() {
    if (this.forestUnlocked || !this.cropChallenge) return;
    this.farmLevel = {
      ...this.farmLevel,
      goalText: vegetableGoalText(this.cropChallenge, this.harvestTarget),
    };
  }

  cropCarryTextureKey() {
    const produce = this.cropChallenge?.produce;
    const ready = this.cropChallenge?.ready;
    if (produce && this.textures.exists(produce)) return produce;
    if (ready && this.textures.exists(ready)) return ready;
    if (
      this.farmLevel?.cropId === 'corn' &&
      this.textures.exists('crop_corn')
    ) {
      return 'crop_corn';
    }
    if (this.textures.exists('crop_flower')) return 'crop_flower';
    return produce || 'crop_flower';
  }

  cropSpriteScale(key, fallback) {
    const tex = this.textures.get(key);
    const src = tex?.getSourceImage?.();
    const w = Number(src?.width) || 32;
    return w <= 20 ? fallback * 1.7 : fallback;
  }

  advanceVegetableChallenge() {
    if (this.forestUnlocked) return;
    if (!this.libraryOverride && this.levelCropComplete) return;
    const finished = this.cropChallenge;
    if (!this.libraryOverride && this.levelPlan?.cropIndexes?.length) {
      const nextSlot = (this.levelCropSlot || 0) + 1;
      if (nextSlot >= this.levelPlan.cropIndexes.length) {
        this.levelCropComplete = true;
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
      this.levelCropSlot = nextSlot;
      setCropChallengeIndex(this.levelPlan.cropIndexes[nextSlot]);
    } else {
      advanceCropChallengeIndex();
    }
    this.clearAllCrops({ silent: true });
    this.applyCurrentCropChallenge({ resetProgress: true });
    this.createPlantPlotMarkers();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'crop_challenge_next',
      previousId: finished?.id,
      previousName: finished?.cropName,
      cropId: this.farmLevel.cropId,
      cropName: this.farmLevel.cropName,
      harvestTarget: this.harvestTarget,
      challengeIndex: this.levelCropSlot ?? getCropChallengeIndex(),
      challengeTotal: this.levelPlan?.cropIndexes?.length || CROP_CHALLENGE_COUNT,
    });
  }

  applyCurrentAnimalChallenge({ resetProgress = false } = {}) {
    if (!this.libraryOverride && this.levelPlan) {
      setAnimalChallengeIndex(this.levelPlan.animalIndex || 0);
    }
    const index = getAnimalChallengeIndex();
    const challenge = getAnimalChallenge(index);
    const collectTarget = animalCollectTarget(challenge, this.mastery);
    this.animalChallenge = challenge;
    this.animalCollectTarget = collectTarget;
    if (resetProgress) {
      this.animalCollectedTotal = 0;
      this.animalSoldThisChallenge = 0;
      this.animalTended = false;
      this.animalCollectUnlocked = false;
      this.animalCollectArmedUntil = 0;
    }
    this.animalLayer?.spawn?.(challenge);
  }

  advanceAnimalChallenge() {
    if (this.forestUnlocked) return;
    const finished = this.animalChallenge;
    if (!this.libraryOverride) {
      if (this.levelAnimalComplete) return;
      this.levelAnimalComplete = true;
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
    const sweepTarget = cleaningSweepTarget(challenge, this.mastery);
    this.cleaningChallenge = challenge;
    this.cleanSweepTarget = sweepTarget;
    if (resetProgress) {
      this.cleanSweptTotal = 0;
      this.cleanSoldThisChallenge = 0;
      this.cleanStarted = false;
      this.cleanSweepArmedUntil = 0;
      this.cleanSweepUnlocked = false;
    }
    this.cleaningLayer?.spawn?.(challenge);
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

  jumpToTestChallenge(payload = {}) {
    const kind =
      payload.kind === 'animal' ||
      payload.kind === 'clean'
        ? payload.kind
        : 'crop';
    const index = Math.max(0, Number(payload.index) || 0);
    this.libraryOverride = true;
    if (kind === 'animal') {
      setAnimalChallengeIndex(index);
      this.applyCurrentAnimalChallenge({ resetProgress: true });
    } else if (kind === 'clean') {
      setCleaningChallengeIndex(index);
      this.applyCurrentCleaningChallenge({ resetProgress: true });
    } else {
      setCropChallengeIndex(index);
      this.clearAllCrops({ silent: true });
      this.applyCurrentCropChallenge({ resetProgress: true });
      this.createPlantPlotMarkers();
    }
    this.emitFarmState();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'test_challenge_jump',
      kind,
      index,
      cropName: this.farmLevel?.cropName,
      animalName: this.animalChallenge?.animalName,
      produceName: this.animalChallenge?.produceName,
      messName: this.cleaningChallenge?.messName,
      wasteName: this.cleaningChallenge?.wasteName,
    });
  }

  canPlantMore() {
    // Free replant stays available until the level is finished
    return !this.forestUnlocked;
  }

  /** Level complete after question quota or all library jobs for this level. */
  checkTargetReached() {
    if (this.forestUnlocked) return;

    const answered = this.quizCorrect + this.quizIncorrect;
    const quotaMet = answered >= DDA_CONFIG.maxQuestions;
    const jobsDone =
      Boolean(this.levelCropComplete) &&
      Boolean(this.levelAnimalComplete) &&
      Boolean(this.levelCleanComplete);
    if (!quotaMet && !jobsDone) {
      this.syncVegetableGoalText();
      this.emitFarmState();
      return;
    }

    this.forestUnlocked = true;
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
      goalText: `Level complete!${timeNote}${bonusNote} Unlock shop is open — bought items stay on your farm.`,
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

  /** World cart at the loading dock â€” fills when unload quiz succeeds. */
  createHarvestCart() {
    const center = loadingZoneCenter(TILE_SIZE);
    const x = center.x;
    const y = center.y + TILE_SIZE;
    if (this.textures.exists('unlock_cart')) {
      this.harvestCart = this.add.image(x, y, 'unlock_cart');
      this.harvestCart.setScale(0.28);
      this.harvestCart.setDepth(4);
    } else {
      this.harvestCart = null;
    }

    this.harvestCartCrops = this.add.container(x - 6, y - 10);
    this.harvestCartCrops.setDepth(5);
    this.refreshHarvestCartVisual();
  }

  createLoadingZoneMarker() {
    if (this.loadingZoneMarker) this.loadingZoneMarker.destroy(true);
    this.loadingZoneMarker = this.add.container(0, 0);
    this.loadingZoneMarker.setDepth(1.5);

    const z = LOADING_ZONE;
    const px = z.x * TILE_SIZE;
    const py = z.y * TILE_SIZE;
    const pw = z.w * TILE_SIZE;
    const ph = z.h * TILE_SIZE;

    const g = this.add.graphics();
    g.fillStyle(0x1a4a6e, 0.35);
    g.fillRect(px, py, pw, ph);
    g.lineStyle(2, 0x7ec8ff, 0.95);
    g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    const label = this.add
      .text(px + pw / 2, py - 4, 'LOAD', {
        fontFamily: 'Courier New, monospace',
        fontSize: '8px',
        color: '#7ec8ff',
        stroke: '#061018',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    this.loadingZoneMarker.add([g, label]);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.7, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  refreshHarvestCartVisual() {
    if (!this.harvestCartCrops) return;
    this.harvestCartCrops.removeAll(true);

    const cropKey = this.cropCarryTextureKey();
    if (!this.textures.exists(cropKey)) return;

    const n = Math.min(8, this.harvestedItemsCount || 0);
    const scale = this.cropSpriteScale(cropKey, 0.55);
    for (let i = 0; i < n; i += 1) {
      const img = this.add.image(
        (i % 4) * 7 - 10,
        -Math.floor(i / 4) * 8,
        cropKey,
      );
      img.setScale(scale);
      this.harvestCartCrops.add(img);
    }
  }

  /** Long vertical stack of harvested crops carried behind the runner. */
  syncCarryTrail() {
    const cropKey = this.cropCarryTextureKey();
    if (!this.textures.exists(cropKey) || !this.player) return;

    const need = this.carriedCount || 0;
    const scale = this.cropSpriteScale(cropKey, 0.7);
    while (this.carrySprites.length < need) {
      const img = this.add.image(this.player.x, this.player.y, cropKey);
      img.setScale(scale);
      img.setDepth(6);
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

    this.carrySprites.forEach((sprite, i) => {
      if (!sprite?.active) return;
      sprite.setPosition(
        this.player.x + backX,
        this.player.y + backY - (i + 1) * 7,
      );
      sprite.setDepth(6 + i * 0.01);
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

    PLANT_PLOTS.forEach((plot) => {
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

      const def = cropDefForPlot(plot.id, this.cropChallenge);
      const labelText = String(def.cropName || 'plant').toUpperCase();
      const label = this.add
        .text(px + pw / 2, py - 6, labelText, {
          fontFamily: 'Courier New, monospace',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffe08a',
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
    this.refreshHarvestCartVisual?.();
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
  }

  /** Owned shop items appear starting the level after purchase (no quests). */
  shouldShowOwnedUnlock(itemId) {
    if (!itemId || SKIP_UNLOCK_ITEMS.has(itemId)) return false;
    const levelId = Math.max(1, Number(this.levelId) || 1);
    const purchasedAt = Number(getUnlockMeta(itemId)?.purchasedAtLevel) || 0;
    if (purchasedAt > 0 && levelId <= purchasedAt) return false;
    return true;
  }

  placeOwnedUnlocks() {
    if (!this.placedUnlockIds) this.placedUnlockIds = new Set();
    if (!this.unlockSprites) this.unlockSprites = new Map();
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
    this.freezeFarmForQuiz();

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

    const owned = getOwnedUnlockIds();
    const buildings = owned.filter((id) => {
      const it = getUnlockItem(id);
      return it?.category === 'building';
    });
    const others = owned.filter((id) => !buildings.includes(id));

    let slot;
    if (item.category === 'building') {
      const bi = Math.max(0, buildings.indexOf(itemId));
      slot = UNLOCK_BUILDING_SLOTS[bi % UNLOCK_BUILDING_SLOTS.length];
    } else {
      const oi = Math.max(0, others.indexOf(itemId));
      slot = UNLOCK_WORLD_SLOTS[oi % UNLOCK_WORLD_SLOTS.length];
    }

    const x = slot.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = slot.tileY * TILE_SIZE + TILE_SIZE / 2;

    let sprite;
    if (this.textures.exists(item.textureKey)) {
      sprite = item.frameWidth
        ? this.add.sprite(x, y, item.textureKey, 0)
        : this.add.image(x, y, item.textureKey);
      const src = this.textures.get(item.textureKey)?.getSourceImage?.();
      const scale = resolveUnlockDisplayScale(
        item,
        src?.width || sprite.width || item.frameWidth,
        src?.height || sprite.height || item.frameHeight,
        TILE_SIZE,
      );
      sprite.setScale(scale);
    } else {
      // Texture missing â€” still show a marker so unlocks are never "invisible"
      sprite = this.add.rectangle(x, y, 40, 40, 0x3d6b45, 0.95);
      sprite.setStrokeStyle(2, 0xd4a017);
    }

    sprite.setDepth(item.category === 'building' ? 6 : 5);
    sprite.setData('unlockId', itemId);

    const labelY =
      y - Math.max(28, (sprite.displayHeight || 48) / 2 + 10);
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
      .setDepth(7);

    // Invisible click zone. Scaled building PNGs often miss Phaser sprite hit-tests.
    const hitW = Math.max(
      TILE_SIZE * 4,
      (Number(sprite.displayWidth) || 40) + TILE_SIZE,
    );
    const hitH = Math.max(
      TILE_SIZE * 4,
      (Number(sprite.displayHeight) || 40) + TILE_SIZE,
    );
    const hit = this.add
      .rectangle(x, y, hitW, hitH, 0x000000, 0.001)
      .setDepth(9);
    hit.setData('unlockId', itemId);
    hit.setData('label', label);
    hit.setData('baseLabel', baseName);
    hit.setData('visual', sprite);
    // Shop unlocks are decorative — no item quests

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
    this.freezeFarmForQuiz();

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
    this.freezeFarmForQuiz();

    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'world_challenge',
    );
    this.lastQuestionId = question.id;

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

    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'world_challenge',
        challenge: 'world_challenge',
        challengeId: task.challengeId,
        challengeType: task.challengeType,
        question,
        questionData: {
          ...question,
          rp: question.rp ?? task.reward?.rp ?? 15,
        },
        rp: question.rp ?? task.reward?.rp ?? 15,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
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

  /** E: load dock, nearby world task, plant bed, or unlock-item challenge. */
  handleInteractKey() {
    if (!this.player) return;
    if (this.farmInputLocked) return;
    if (!this.guardFarmAction('interact')) return;

    const cell = this.getPlayerGridCell();
    if (isLoadingTile(cell.gridX, cell.gridY)) {
      this.handleLoadingAttempt({ skipGuard: true });
      return;
    }

    if (this.animalLayer?.isNear(this.player.x, this.player.y)) {
      this.beginAnimalTend();
      return;
    }

    if (this.cleaningLayer?.isNear(this.player.x, this.player.y)) {
      this.beginCleaningStart();
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
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'plant',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'animal_tend',
        challenge: 'animal_tend',
        animalName: this.animalChallenge?.animalName,
        cropName: this.animalChallenge?.animalName,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  openAnimalCollectQuestion() {
    if (!this.player || this.farmInputLocked) return;
    this.pendingQuizMode = 'animal_collect';
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'harvest',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'animal_collect',
        challenge: 'animal_collect',
        animalName: this.animalChallenge?.animalName,
        cropName: this.animalChallenge?.produceName,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  collectAnimalProduceUnderfoot() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.animalLayer?.tended) return;
    if ((this.animalLayer.remainingProduce?.() || 0) < 1) return;

    const reach = TILE_SIZE * 1.25;
    const near = this.animalLayer.produce?.some(
      (p) =>
        p.collectable &&
        p.visual?.active &&
        Phaser.Math.Distance.Between(
          p.visual.x,
          p.visual.y,
          this.player.x,
          this.player.y,
        ) <= reach,
    );
    if (!near) return;

    // One collect quiz per animal challenge, then free collecting
    if (!this.animalCollectUnlocked) {
      this.openAnimalCollectQuestion();
      return;
    }

    const n = this.animalLayer.collectNear(
      this.player.x,
      this.player.y,
      reach,
    );
    if (n < 1) return;
    for (let i = 0; i < n; i += 1) this.carryStack.push('animal');
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
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'plant',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'clean_start',
        challenge: 'clean_start',
        messName: this.cleaningChallenge?.messName,
        cropName: this.cleaningChallenge?.messName,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  openCleanSweepQuestion() {
    if (!this.player || this.farmInputLocked) return;
    this.pendingQuizMode = 'clean_sweep';
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'harvest',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'clean_sweep',
        challenge: 'clean_sweep',
        messName: this.cleaningChallenge?.messName,
        cropName: this.cleaningChallenge?.wasteName,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  sweepCleaningUnderfoot() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.cleaningLayer?.started) return;
    if ((this.cleaningLayer.remainingMess?.() || 0) < 1) return;

    const reach = TILE_SIZE * 1.25;
    const near = this.cleaningLayer.mess?.some(
      (item) =>
        item.collectable &&
        item.visual?.active &&
        Phaser.Math.Distance.Between(
          item.visual.x,
          item.visual.y,
          this.player.x,
          this.player.y,
        ) <= reach,
    );
    if (!near) return;

    // One sweep quiz per cleaning challenge, then free sweeping
    if (!this.cleanSweepUnlocked) {
      this.openCleanSweepQuestion();
      return;
    }

    const n = this.cleaningLayer.sweepNear(
      this.player.x,
      this.player.y,
      reach,
    );
    if (n < 1) return;
    for (let i = 0; i < n; i += 1) this.carryStack.push('clean');
    this.carriedCount = (this.carriedCount || 0) + n;
    this.cleanSweptTotal = (this.cleanSweptTotal || 0) + n;
    this.syncCarryTrail();
    this.updateCarryTrailPositions();
    this.showHarvestingBanner(n);
    this.emitFarmState();
  }

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
    if (!isLoadingTile(cell.gridX, cell.gridY)) {
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

    // One load quiz per challenge cycle, then free unloading to cart
    if (this.loadUnlocked) {
      this.finishLoadToCart({ rp: 0 });
      return;
    }

    this.pendingQuizMode = 'load';
    this.freezeFarmForQuiz();

    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'load',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();

    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'load',
        challenge: 'load',
        carriedCount: this.carriedCount,
        tileX: cell.gridX,
        tileY: cell.gridY,
        cropType: this.farmLevel.cropId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  finishLoadToCart({ rp = 0 } = {}) {
    const unloaded = this.carriedCount || 0;
    if (unloaded < 1) return;
    this.harvestedItemsCount += unloaded;
    this.cartStack = [
      ...(this.cartStack || []),
      ...(this.carryStack || []),
    ];
    this.carryStack = [];
    this.clearCarryTrail();
    this.refreshHarvestCartVisual();
    this.loadUnlocked = true;
    this.pendingQuizMode = null;
    this.audioItem?.play();
    this.cameras.main.flash(180, 120, 200, 255);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'load_success',
      unloaded,
      cartCount: this.harvestedItemsCount,
      rp,
    });
    this.emitFarmState();
    this.checkTargetReached();
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

    if (this.plantDoneForChallenge) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'already_planted',
        cropType: this.farmLevel?.cropId,
        cropName: this.farmLevel?.cropName,
      });
      return;
    }

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
    this.freezeFarmForQuiz();

    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'plant',
    );
    this.lastQuestionId = question.id;

    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'plant',
        challenge: 'plant',
        tileX: cell.gridX,
        tileY: cell.gridY,
        gridKey: cell.key,
        plotId: plot?.id,
        patchSize: patchCells.length,
        patchCols: this.farmLevel.plantPatchCols ?? 4,
        patchRows: this.farmLevel.plantPatchRows ?? 3,
        cropType: this.farmLevel.cropId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );

    this.emitFarmState();
  }

  /** Spawn the pending patch after a correct plant quiz (once per crop type). */
  finishPlanting({ rp = 0 } = {}) {
    const crops = this.spawnCropAtTarget();
    const planted = Array.isArray(crops) ? crops : crops ? [crops] : [];

    if (planted.length > 0) {
      this.plantDoneForChallenge = true;
      // One planting = that patch is the whole vegetable job; selling it unlocks the next type
      this.harvestTarget = planted.length;
      this.cropsHarvestedTotal = 0;
      this.cropsSoldThisChallenge = 0;
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
  spawnCropAtCell(cell, staggerMs = 0) {
    if (!cell || this.plantedGridKeys.has(cell.key)) return null;
    if (!isPlantableTile(cell.gridX, cell.gridY)) return null;

    const worldX = cell.x ?? cell.gridX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = cell.y ?? cell.gridY * TILE_SIZE + TILE_SIZE / 2;

    const plot = findPlotAt(cell.gridX, cell.gridY);
    const def = cropDefForPlot(plot?.id, this.cropChallenge);
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
   * Harvest requires one science question per vegetable challenge.
   * After a correct answer, picking that crop is free for the rest of the challenge.
   */
  harvestCropsUnderfoot() {
    if (this.farmInputLocked || !this.player) return;

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

    // One harvest quiz per vegetable challenge, then free picking
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
    // Harvested crops ride on the runner's back until unloaded at the LOAD dock
    this.carriedCount = (this.carriedCount || 0) + 1;
    this.cropsHarvestedTotal = (this.cropsHarvestedTotal || 0) + 1;
    this.carryStack.push('crop');
    this.syncCarryTrail();
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
   * Science question that unlocks harvesting for a short window.
   */
  openHarvestQuestion() {
    if (!this.player || this.farmInputLocked) return;
    this.pendingQuizMode = 'harvest';
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'harvest',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'harvest',
        challenge: 'harvest',
        cropType: this.farmLevel.cropId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
  }

  /**
   * Science question required before selling the cart (unload).
   */
  openUnloadQuestion() {
    if (!this.player || this.farmInputLocked) return;
    if ((this.harvestedItemsCount || 0) < 1) return;
    this.pendingQuizMode = 'unload';
    this.freezeFarmForQuiz();
    const question = pickScienceQuestion(
      this.farmLevel,
      this.lastQuestionId,
      'unload',
    );
    this.lastQuestionId = question.id;
    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'unload',
        challenge: 'unload',
        cartCount: this.harvestedItemsCount,
        cropType: this.farmLevel.cropId,
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
      }),
    );
    this.emitFarmState();
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
        this.completeSellInventory();
        this.emitFarmState();
        this.checkTargetReached();
        return;
      }

      if (mode === 'load') {
        this.finishLoadToCart({ rp: payload.rp ?? 0 });
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
    } finally {
      this.resumeAfterQuiz();
    }
  }

  /**
   * Q key / Sell Inventory button — one science question per challenge, then cash.
   */
  handleSellInventory() {
    if (!this.sys?.isActive()) return;
    if (this.pendingQuizMode && this.pendingQuizMode !== 'unload') return;
    if (!this.guardFarmAction('sell')) return;

    if (this.harvestedItemsCount <= 0) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'sell_blocked',
        reason: 'empty_inventory',
      });
      return;
    }

    // One sell quiz per challenge cycle, then free selling
    if (this.unloadUnlocked) {
      this.completeSellInventory();
      this.emitFarmState();
      this.checkTargetReached();
      return;
    }

    this.openUnloadQuestion();
  }

  completeSellInventory() {
    if (!this.sys?.isActive()) return;
    const harvestedItemsCount = this.harvestedItemsCount;
    if (harvestedItemsCount <= 0) return;

    const mult = this.gameplaySettings?.cashRewardMultiplier ?? 1;
    const unitValue = Math.max(
      1,
      Math.round(this.farmLevel.cropValue * mult),
    );
    const coinsEarned = harvestedItemsCount * unitValue;
    this.harvestedItemsCount = 0;
    this.currentMoney += coinsEarned;
    this.syncMoneyAliases();
    this.refreshHarvestCartVisual();
    const soldKinds = this.cartStack || [];
    const animalSold = soldKinds.filter((k) => k === 'animal').length;
    const cleanSold = soldKinds.filter((k) => k === 'clean').length;
    const cropSold = Math.max(0, harvestedItemsCount - animalSold - cleanSold);
    this.cropsSoldThisChallenge =
      (this.cropsSoldThisChallenge || 0) + cropSold;
    this.animalSoldThisChallenge =
      (this.animalSoldThisChallenge || 0) + animalSold;
    this.cleanSoldThisChallenge =
      (this.cleanSoldThisChallenge || 0) + cleanSold;
    this.cartStack = [];

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
      !this.forestUnlocked &&
      (this.cropsSoldThisChallenge || 0) >= this.harvestTarget
    ) {
      this.advanceVegetableChallenge();
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
    // Keep the map pin tracking even while a quiz locks farm input
    this.emitPlayerMapPos();
    this.worldLayer?.update(
      this.farmInputLocked || !this.player ? -9999 : this.player.x,
      this.player?.y || 0,
      time,
    );
    this.animalLayer?.update(time);
    this.cleaningLayer?.update(time);

    if (
      this.pendingQuizMode ||
      this.isQuestScrollOpen() ||
      this.isUnlockShopOpen() ||
      this.isMotivationOpen()
    ) {
      this.freezeFarmForQuiz();
      return;
    }
    if (this.isScienceQuizOpen()) {
      this.player?.setVelocity(0);
      return;
    }
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
    const settings = this.gameplaySettings || getGameplaySettings('medium');
    this.enemySpeed = settings.enemySpeed;
    this.enemyDistanceTiles = settings.enemyDistanceTiles;
    this.enemyCountFactor = settings.enemyCountFactor;

    this.spawnEnemiesByGid(MOLE_GID, true, 'idle/mole-idle-front');
    this.spawnEnemiesByGid(TREANT_GID, false, 'idle/treant-idle-front');
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

    if (this.isScienceQuizOpen()) {
      player.setVelocity(0);
      return;
    }

    this.releaseStaleFarmLocks();

    const right = this.moveKeys.right || Boolean(cursors?.right?.isDown);
    const left = this.moveKeys.left || Boolean(cursors?.left?.isDown);
    const up = this.moveKeys.up || Boolean(cursors?.up?.isDown);
    const down = this.moveKeys.down || Boolean(cursors?.down?.isDown);

    if (right) {
      this.movePlayer(PLAYER_SPEED, 0, DIRECTIONS.RIGHT, 'walk-side', false);
    } else if (left) {
      this.movePlayer(-PLAYER_SPEED, 0, DIRECTIONS.LEFT, 'walk-side', true);
    } else if (up) {
      this.movePlayer(0, -PLAYER_SPEED, DIRECTIONS.UP, 'walk-back', false);
    } else if (down) {
      this.movePlayer(0, PLAYER_SPEED, DIRECTIONS.DOWN, 'walk-front', false);
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
      this.isMotivationOpen()
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
    ForestGameBridge.emit(FARM_EVENTS.START_FARM_LEVEL, {
      levelId: (this.levelId || 1) + 1,
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
      this.farmInputLocked ||
      this.pendingQuizMode ||
      this.isScienceQuizOpen() ||
      this.isQuestScrollOpen() ||
      this.isUnlockShopOpen() ||
      this.isMotivationOpen() ||
      this.physics?.world?.isPaused
    ) {
      return;
    }
    const { playerModel } = player;
    if (playerModel.hurtFlag) return;

    playerModel.hurtFlag = true;
    this.time.delayedCall(HURT_INVULN_MS, () => {
      playerModel.hurtFlag = false;
      player.setAlpha(1);
    });

    player.setAlpha(0.5);
    playerModel.health -= 1;
    this.enemyHits = (this.enemyHits || 0) + 1;
    this.audioHurt.play();

    if (playerModel.health < 1) {
      playerModel.scoreCalc -= 200;
      this.enemyDeaths = (this.enemyDeaths || 0) + 1;
      this.levelRestarts = (this.levelRestarts || 0) + 1;
      this.registry.set('enemyDeaths', this.enemyDeaths);
      this.registry.set('levelRestarts', this.levelRestarts);
      this.gameOver();
    }
  }

  gameOver() {
    this.clearAllCrops({ silent: true });
    this.scene.start('GameOverScene', {
      score: this.player.playerModel.scoreCalc,
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

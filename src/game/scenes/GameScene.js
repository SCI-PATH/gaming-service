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
} from '../config/constants';
import { ForestGameBridge, FARM_EVENTS } from '../EventBus';
import { isEggCollectStage } from '../../data/eggCollect.js';
import {
  isCalfFeedStage,
  getCalfFeedSettings,
  pickCalfFeedQuestion,
} from '../../data/calfFeed.js';
import { getFarmLevel, pickScienceQuestion } from '../../data/farmLevels';
import {
  DDA_CONFIG,
  averageScore,
  formatResponseTime,
  goalTextForQuestions,
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
  resolveUnlockDisplayScale,
  isUnlocked,
  markUnlocked,
  advanceChallengeProgress,
  getChallengeProgress,
  shopBandFromPerformance,
  UNLOCK_WORLD_SLOTS,
  UNLOCK_BUILDING_SLOTS,
  CALF_PEN_SLOT,
  HEN_HOUSE_SLOT,
} from '../../data/unlockShop.js';
import {
  buildActiveChallenges,
  getNextChallengeStep,
} from '../../data/challengeRuntime.js';
import { getStage } from '../../data/unlockChallenges.js';
import {
  findPlotAt,
  freeCellsInPlotAt,
  isPlantableTile,
  isLoadingTile,
  LOADING_ZONE,
  loadingZoneCenter,
  PLANT_PLOTS,
} from '../../data/plantPlots.js';

const MOLE_GID = 6;
const TREANT_GID = 5;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    this.levelId = data?.levelId ?? 1;
    this.devTest = data?.devTest || null;
    this.devStartingMoney =
      Number(data?.startingMoney) > 0 ? Number(data.startingMoney) : 0;
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
    this.forestUnlocked = false;
    this.farmInputLocked = false;
    this.currentTargetTile = null;
    this.pendingGridKey = null;
    this.pendingPatchCells = [];
    this.plantedCrops = [];
    this.plantedGridKeys = new Set();
    this.lastQuestionId = null;

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
    const patch = plantPatchFromMastery(this.mastery);

    // Adaptive GAMEPLAY (enemies / timers / retries / hints) — not question DDA
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

    this.addAudios();
    this.createMap();
    this.createGroups();
    this.createExit();
    // Starting level = plain background; owned unlocks appear only after purchase
    this.placedUnlockIds = new Set();
    this.unlockSprites = new Map();
    this.calfPen = null;
    this.calfFeedRound = null;
    this.activeChallenges = [];
    this.pendingItemChallenge = null;
    this.placeOwnedUnlocks();
    this.refreshActiveChallenges();
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
    this.focusGameCanvas();

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

    if (this.devTest) {
      this.time.delayedCall(200, () => this.applyDevTest(this.devTest));
    }
  }

  /** Skip-the-grind shortcuts for local house testing. */
  applyDevTest(mode) {
    if (!this.sys?.isActive()) return;

    if (mode === 'buy_house') {
      this.currentMoney = Math.max(this.currentMoney, 2000);
      this.syncMoneyAliases();
      this.quizCorrect = DDA_CONFIG.maxQuestions;
      this.forestUnlocked = true;
      this.farmLevel = {
        ...this.farmLevel,
        goalText:
          'DEV TEST: Unlock shop open — buy the Farm House, then close shop for level 2.',
      };
      this.emitFarmState();
      const shopPerf = this.buildShopPerformance?.() || {
        attemptScores: [],
        avgResponseMs: 0,
        performanceBand: this.performanceBand,
        questionsAnswered: DDA_CONFIG.maxQuestions,
      };
      ForestGameBridge.emit(FARM_EVENTS.GOAL_COMPLETED, {
        earnings: this.currentMoney,
        currentMoney: this.currentMoney,
        target: this.timeTargetMs,
        timeTargetMs: this.timeTargetMs,
        timeTargetLabel: formatResponseTime(this.timeTargetMs),
        beatTimeTarget: true,
        maxQuestions: DDA_CONFIG.maxQuestions,
        levelId: this.farmLevel.id,
        goalText: this.farmLevel.goalText,
        performanceBand: this.performanceBand,
        mastery: this.mastery,
        openUnlockShop: true,
        ...shopPerf,
      });
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'dev_test',
        mode: 'buy_house',
        cash: this.currentMoney,
      });
      return;
    }

    if (mode === 'house_challenge') {
      this.currentMoney = Math.max(this.currentMoney, 500);
      this.syncMoneyAliases();
      this.refreshActiveChallenges();
      this.emitFarmState();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'dev_test',
        mode: 'house_challenge',
        cash: this.currentMoney,
        challenges: this.activeChallenges?.length || 0,
      });
    }

    if (mode === 'egg_challenge') {
      this.currentMoney = Math.max(this.currentMoney, 500);
      this.syncMoneyAliases();
      this.refreshActiveChallenges();
      this.emitFarmState();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'dev_test',
        mode: 'egg_challenge',
        cash: this.currentMoney,
        challenges: this.activeChallenges?.length || 0,
      });
    }
  }

  createGroups() {
    this.enemiesGroup = this.add.group();
    this.projectilesGroup = this.add.group();
    this.cropsGroup = this.add.group();
  }

  bindKeys() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyPlant = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.sellKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keySell = this.sellKey;
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.E,
      Phaser.Input.Keyboard.KeyCodes.Q,
    ]);

    this.sellKey.off('down');
    this.keyPlant.off('down');
    this.sellKey.on('down', () => {
      if (this.sys?.isActive()) this.handleSellInventory();
    });
    this.keyPlant.on('down', () => {
      if (this.sys?.isActive()) this.handleInteractKey();
    });
  }

  /**
   * Capture-phase window keys so Q/E work after React UI steals canvas focus.
   * Q is NEVER blocked by farmInputLocked (stuck quiz lock was swallowing sells).
   */
  bindWindowKeys() {
    this._onWindowKeyDown = (event) => {
      if (!this.sys?.isActive()) return;
      if (event.repeat) return;

      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.target?.closest?.('.science-quiz-overlay')) return;
      if (event.target?.closest?.('.unlock-shop-overlay')) return;
      if (event.target?.closest?.('.challenge-panel')) return;
      if (event.target?.closest?.('.quest-scroll-overlay')) return;
      if (event.target?.closest?.('.house-interior-overlay')) return;
      if (event.target?.closest?.('.egg-collect-overlay')) return;
      if (event.target?.closest?.('.calf-feed-overlay')) return;

      if (event.code === 'KeyQ') {
        event.preventDefault();
        this.handleSellInventory();
        return;
      }
      if (event.code === 'KeyE') {
        if (this.farmInputLocked) return;
        event.preventDefault();
        this.handleInteractKey();
      }
    };

    window.addEventListener('keydown', this._onWindowKeyDown, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this._onWindowKeyDown, true);
    });
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
      this.beginItemChallenge(payload);
    };
    this._onShopOpen = () => {
      if (!this.sys?.isActive()) return;
      this.farmInputLocked = true;
      this.player?.setVelocity(0);
      this.physics.world.pause();
    };
    this._onShopClose = () => {
      if (!this.sys?.isActive()) return;
      this.farmInputLocked = false;
      this.physics.world.resume();
      this.focusGameCanvas();
    };
    this._onHouseInteriorDone = () => {
      if (!this.sys?.isActive()) return;
      this.finishHouseChallengeStage();
    };
    this._onHouseInteriorCancel = () => {
      if (!this.sys?.isActive()) return;
      this.cancelHouseInterior();
    };
    this._onHouseStepCorrect = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onHouseStepCorrect(payload);
    };
    this._onHouseStepWrong = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onHouseStepWrong(payload);
    };
    this._onEggCollectDone = (payload) => {
      if (!this.sys?.isActive()) return;
      this.finishEggCollectStage(payload);
    };
    this._onEggCollectCancel = () => {
      if (!this.sys?.isActive()) return;
      this.cancelEggCollect();
    };
    this._onEggProtectCorrect = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onEggProtectCorrect(payload);
    };
    this._onEggProtectWrong = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onEggProtectWrong(payload);
    };
    this._onCalfFeedDone = (payload) => {
      if (!this.sys?.isActive()) return;
      this.finishCalfFeedStage(payload);
    };
    this._onCalfFeedCancel = () => {
      if (!this.sys?.isActive()) return;
      this.cancelCalfFeed();
    };
    this._onCalfFeedCorrect = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onCalfFeedCorrect(payload);
    };
    this._onCalfFeedWrong = (payload) => {
      if (!this.sys?.isActive()) return;
      this.onCalfFeedWrong(payload);
    };

    // Drop stale handlers from HMR / StrictMode so dead scenes cannot eat events
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PLANT_CROP);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_FAILURE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SELL_INVENTORY_ACTION);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PURCHASE_UNLOCK);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_OPEN);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_CLOSE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.START_ITEM_CHALLENGE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.HOUSE_INTERIOR_DONE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.HOUSE_INTERIOR_CANCEL);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.HOUSE_STEP_CORRECT);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.HOUSE_STEP_WRONG);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.EGG_COLLECT_DONE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.EGG_COLLECT_CANCEL);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.EGG_PROTECT_CORRECT);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.EGG_PROTECT_WRONG);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.CALF_FEED_DONE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.CALF_FEED_CANCEL);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.CALF_FEED_CORRECT);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.CALF_FEED_WRONG);
    // NOTE: do NOT removeAllListeners(START_FARM_LEVEL) — ForestRPGCanvas owns that

    ForestGameBridge.on(FARM_EVENTS.PLANT_CROP, this._onPlant);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
    ForestGameBridge.on(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
    ForestGameBridge.on(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
    ForestGameBridge.on(
      FARM_EVENTS.START_ITEM_CHALLENGE,
      this._onStartItemChallenge,
    );
    ForestGameBridge.on(
      FARM_EVENTS.HOUSE_INTERIOR_DONE,
      this._onHouseInteriorDone,
    );
    ForestGameBridge.on(
      FARM_EVENTS.HOUSE_INTERIOR_CANCEL,
      this._onHouseInteriorCancel,
    );
    ForestGameBridge.on(
      FARM_EVENTS.HOUSE_STEP_CORRECT,
      this._onHouseStepCorrect,
    );
    ForestGameBridge.on(FARM_EVENTS.HOUSE_STEP_WRONG, this._onHouseStepWrong);
    ForestGameBridge.on(FARM_EVENTS.EGG_COLLECT_DONE, this._onEggCollectDone);
    ForestGameBridge.on(FARM_EVENTS.EGG_COLLECT_CANCEL, this._onEggCollectCancel);
    ForestGameBridge.on(
      FARM_EVENTS.EGG_PROTECT_CORRECT,
      this._onEggProtectCorrect,
    );
    ForestGameBridge.on(FARM_EVENTS.EGG_PROTECT_WRONG, this._onEggProtectWrong);
    ForestGameBridge.on(FARM_EVENTS.CALF_FEED_DONE, this._onCalfFeedDone);
    ForestGameBridge.on(FARM_EVENTS.CALF_FEED_CANCEL, this._onCalfFeedCancel);
    ForestGameBridge.on(FARM_EVENTS.CALF_FEED_CORRECT, this._onCalfFeedCorrect);
    ForestGameBridge.on(FARM_EVENTS.CALF_FEED_WRONG, this._onCalfFeedWrong);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.PLANT_CROP, this._onPlant);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
      ForestGameBridge.off(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
      ForestGameBridge.off(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
      ForestGameBridge.off(
        FARM_EVENTS.START_ITEM_CHALLENGE,
        this._onStartItemChallenge,
      );
      ForestGameBridge.off(
        FARM_EVENTS.HOUSE_INTERIOR_DONE,
        this._onHouseInteriorDone,
      );
      ForestGameBridge.off(
        FARM_EVENTS.HOUSE_INTERIOR_CANCEL,
        this._onHouseInteriorCancel,
      );
      ForestGameBridge.off(
        FARM_EVENTS.HOUSE_STEP_CORRECT,
        this._onHouseStepCorrect,
      );
      ForestGameBridge.off(FARM_EVENTS.HOUSE_STEP_WRONG, this._onHouseStepWrong);
      ForestGameBridge.off(FARM_EVENTS.EGG_COLLECT_DONE, this._onEggCollectDone);
      ForestGameBridge.off(
        FARM_EVENTS.EGG_COLLECT_CANCEL,
        this._onEggCollectCancel,
      );
      ForestGameBridge.off(
        FARM_EVENTS.EGG_PROTECT_CORRECT,
        this._onEggProtectCorrect,
      );
      ForestGameBridge.off(FARM_EVENTS.EGG_PROTECT_WRONG, this._onEggProtectWrong);
      ForestGameBridge.off(FARM_EVENTS.CALF_FEED_DONE, this._onCalfFeedDone);
      ForestGameBridge.off(FARM_EVENTS.CALF_FEED_CANCEL, this._onCalfFeedCancel);
      ForestGameBridge.off(FARM_EVENTS.CALF_FEED_CORRECT, this._onCalfFeedCorrect);
      ForestGameBridge.off(FARM_EVENTS.CALF_FEED_WRONG, this._onCalfFeedWrong);
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
      harvestProgressLabel: `${this.cropsHarvestedTotal}/${this.harvestTarget} crops`,
      levelId: this.farmLevel.id,
      cropName: this.farmLevel.cropName,
      cropId: this.farmLevel.cropId,
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
          : '—',
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
    });
  }

  /** Live map pin — also mirrors to window so the React map cannot miss updates. */
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
      avgAnswerTimeSec: this.levelAvgResponseMs()
        ? Math.round((this.levelAvgResponseMs() / 1000) * 10) / 10
        : null,
      gameplayBand: this.gameplayBand,
    });

    const answered = this.quizCorrect + this.quizIncorrect;
    this.farmLevel = {
      ...this.farmLevel,
      goalText: goalTextForQuestions(
        answered,
        DDA_CONFIG.maxQuestions,
        this.timeTargetMs,
      ),
    };
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
    const settings = this.gameplaySettings || getGameplaySettings('average');

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
    const settings = this.gameplaySettings || getGameplaySettings('average');
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
    };
  }

  canPlantMore() {
    // Stop planting once level question limit is reached
    if (this.forestUnlocked) return false;
    const answered = this.quizCorrect + this.quizIncorrect;
    return answered < DDA_CONFIG.maxQuestions;
  }

  /** Level complete after max questions (no cash goal). */
  checkTargetReached() {
    if (this.forestUnlocked) return;

    const answered = this.quizCorrect + this.quizIncorrect;
    if (answered < DDA_CONFIG.maxQuestions) {
      this.farmLevel = {
        ...this.farmLevel,
        goalText: goalTextForQuestions(
          answered,
          DDA_CONFIG.maxQuestions,
          this.timeTargetMs,
        ),
      };
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
    this.openForestGate();
    this.decorateNextLevelGround();

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

  /** World cart at the loading dock — fills when unload quiz succeeds. */
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

    const cropKey =
      this.farmLevel.cropId === 'corn' ? 'crop_corn' : 'crop_flower';
    if (!this.textures.exists(cropKey)) return;

    const n = Math.min(8, this.harvestedItemsCount || 0);
    for (let i = 0; i < n; i += 1) {
      const img = this.add.image(
        (i % 4) * 7 - 10,
        -Math.floor(i / 4) * 8,
        cropKey,
      );
      img.setScale(0.55);
      this.harvestCartCrops.add(img);
    }
  }

  /** Long vertical stack of harvested crops carried behind the runner. */
  syncCarryTrail() {
    const cropKey =
      this.farmLevel.cropId === 'corn' ? 'crop_corn' : 'crop_flower';
    if (!this.textures.exists(cropKey) || !this.player) return;

    const need = this.carriedCount || 0;
    while (this.carrySprites.length < need) {
      const img = this.add.image(this.player.x, this.player.y, cropKey);
      img.setScale(0.7);
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
      g.fillStyle(0x5a3a1a, 0.38);
      g.fillRect(px, py, pw, ph);
      g.lineStyle(1.5, 0xe8c56a, 0.85);
      g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      // Inner dashed feel via second lighter rect
      g.lineStyle(1, 0x9ccc6a, 0.35);
      g.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

      const label = this.add
        .text(px + pw / 2, py - 4, 'PLANT', {
          fontFamily: 'Courier New, monospace',
          fontSize: '8px',
          color: '#e8c56a',
          stroke: '#1a1208',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(1.6);

      this.plantPlotMarkers.add([g, label]);

      this.tweens.add({
        targets: g,
        alpha: { from: 0.75, to: 1 },
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  /** Remove every crop — unharvested plants never carry to the next level. */
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

  placeOwnedUnlocks() {
    for (const id of getOwnedUnlockIds()) {
      this.placeUnlockSprite(id);
    }
  }

  placeUnlockSprite(itemId) {
    if (!itemId || this.placedUnlockIds?.has(itemId)) return null;
    const item = getUnlockItem(itemId);
    if (!item) return null;

    // Calf → full fenced pen with herd + buckets (away from house / hen house)
    if (itemId === 'calf') {
      return this.placeCalfPen();
    }

    const owned = getOwnedUnlockIds();
    const buildings = owned.filter((id) => {
      const it = getUnlockItem(id);
      return it?.category === 'building';
    });
    const others = owned.filter((id) => !buildings.includes(id));

    let slot;
    if (itemId === 'hen_house') {
      slot = HEN_HOUSE_SLOT;
    } else if (item.category === 'building') {
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
      // Texture missing — still show a marker so unlocks are never "invisible"
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

    // Invisible click zone (same pattern as calf pen). Scaled building PNGs
    // often miss Phaser sprite hit-tests — this keeps House / Hen House clickable.
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
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    hit.setData('unlockId', itemId);
    hit.setData('label', label);
    hit.setData('baseLabel', baseName);
    hit.setData('visual', sprite);
    hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      if (!this.sys?.isActive()) return;
      event?.stopPropagation?.();
      this.tryStartUnlockChallenge(itemId);
    });

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
   * Build a fenced calf pasture on the map (separate from house / hen house).
   * Clicking the pen starts normal science quizzes that fill water/food buckets.
   */
  placeCalfPen() {
    if (this.calfPen?.container) {
      this.placedUnlockIds.add('calf');
      return this.calfPen.hit;
    }

    const slot = CALF_PEN_SLOT;
    const cx = slot.tileX * TILE_SIZE + TILE_SIZE / 2;
    const cy = slot.tileY * TILE_SIZE + TILE_SIZE / 2;
    const band = this.gameplayBand || 'average';
    const settings = getCalfFeedSettings(band);
    const half = Math.ceil(settings.fillsNeeded / 2);

    const container = this.add.container(cx, cy).setDepth(6);
    // Roomier pen so the herd can spread out (tiles are 16px)
    const penW = TILE_SIZE * 14;
    const penH = TILE_SIZE * 10;

    // Pasture floor
    const floor = this.add
      .rectangle(0, 0, penW, penH, 0x5a8a42, 0.92)
      .setStrokeStyle(3, 0x6b4423);
    container.add(floor);
    const dirt = this.add.ellipse(0, 8, penW * 0.78, penH * 0.6, 0xc4a574, 0.45);
    container.add(dirt);

    // Fence posts around the pen (behind animals)
    const fenceKey = this.textures.exists('calf_fence_gate')
      ? 'calf_fence_gate'
      : null;
    const placeFence = (x, y, rot = 0) => {
      if (fenceKey) {
        const f = this.add.image(x, y, fenceKey).setScale(1.15).setAngle(rot);
        container.add(f);
      } else {
        container.add(
          this.add.rectangle(x, y, 10, 22, 0x8b5a2b).setStrokeStyle(1, 0x3a2410),
        );
      }
    };
    const fenceCols = 9;
    const fenceRows = 6;
    for (let i = 0; i < fenceCols; i += 1) {
      const x = -penW / 2 + 14 + (i * (penW - 28)) / (fenceCols - 1);
      placeFence(x, -penH / 2 + 10);
      placeFence(x, penH / 2 - 10);
    }
    for (let i = 1; i < fenceRows - 1; i += 1) {
      const y = -penH / 2 + 10 + (i * (penH - 20)) / (fenceRows - 1);
      placeFence(-penW / 2 + 12, y, 90);
      placeFence(penW / 2 - 12, y, 90);
    }

    // Spread calves on a grid with clear gaps (sprites are large vs tile size)
    const calves = [];
    const calfKey = this.textures.exists('unlock_calf') ? 'unlock_calf' : null;
    this.ensureCalfAnimations();
    const herdCount = Math.min(8, Math.max(5, settings.calfCount || 6));
    const calfScale = 0.9;
    const minSpacing = 46;
    const herdCols = herdCount <= 6 ? 3 : 4;
    const herdRows = Math.ceil(herdCount / herdCols);
    const gapX = Math.max(minSpacing, (penW - 70) / Math.max(1, herdCols));
    const gapY = Math.max(minSpacing, (penH - 90) / Math.max(1, herdRows));
    const startX = -((herdCols - 1) * gapX) / 2;
    const startY = -((herdRows - 1) * gapY) / 2 - 10;
    for (let i = 0; i < herdCount; i += 1) {
      const col = i % herdCols;
      const row = Math.floor(i / herdCols);
      // Tiny jitter only — keep clear personal space
      const ox = startX + col * gapX + (Math.random() * 4 - 2);
      const oy = startY + row * gapY + (Math.random() * 4 - 2);
      let sprite;
      if (calfKey) {
        sprite = this.add
          .sprite(ox, oy, calfKey, i % 6)
          .setScale(calfScale)
          .setDepth(1);
      } else {
        sprite = this.add.circle(ox, oy, 10, 0xf0e6d8).setStrokeStyle(2, 0x333);
      }
      container.add(sprite);
      calves.push(sprite);
    }

    // Water + food buckets at the front (smaller so calves stay the focus)
    const bucketKey = this.textures.exists('calf_bucket') ? 'calf_bucket' : null;
    const foodKey = this.textures.exists('calf_food_crate')
      ? 'calf_food_crate'
      : null;
    const bucketY = penH / 2 - 36;

    const waterBucket = bucketKey
      ? this.add.image(-64, bucketY, bucketKey).setScale(0.28)
      : this.add.rectangle(-64, bucketY, 22, 26, 0x8b5a2b);
    const foodBucket = bucketKey
      ? this.add.image(64, bucketY, bucketKey).setScale(0.28)
      : this.add.rectangle(64, bucketY, 22, 26, 0x8b5a2b);
    container.add(waterBucket);
    container.add(foodBucket);

    const waterFill = this.add
      .rectangle(-64, bucketY + 6, 14, 4, 0x3a9fd8, 0.95)
      .setOrigin(0.5, 1);
    const foodPile = foodKey
      ? this.add.image(64, bucketY - 6, foodKey).setScale(0.65).setAlpha(0.15)
      : this.add.rectangle(64, bucketY - 6, 14, 8, 0x7a9a40, 0.15);
    container.add(waterFill);
    container.add(foodPile);

    const waterLabel = this.add
      .text(-64, penH / 2 - 22, 'Water 0/' + half, {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#d8f0ff',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const foodLabel = this.add
      .text(64, penH / 2 - 22, 'Food 0/' + (settings.fillsNeeded - half), {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#ffe9a8',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add(waterLabel);
    container.add(foodLabel);

    const title = this.add
      .text(0, -penH / 2 - 16, 'Calf Pen', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#f0e6c8',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add(title);

    // Click target covering the whole pen
    const hit = this.add
      .rectangle(cx, cy, penW, penH, 0x000000, 0.001)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      if (!this.sys?.isActive()) return;
      event?.stopPropagation?.();
      this.tryStartUnlockChallenge('calf');
    });
    hit.setData('label', title);
    hit.setData('baseLabel', 'Calf Pen');

    this.calfPen = {
      container,
      hit,
      calves,
      waterBucket,
      foodBucket,
      waterFill,
      foodPile,
      waterLabel,
      foodLabel,
      waterMax: half,
      foodMax: Math.max(1, settings.fillsNeeded - half),
      fillsNeeded: settings.fillsNeeded,
      minSpacing,
      wanderBounds: {
        minX: -penW / 2 + 32,
        maxX: penW / 2 - 32,
        minY: -penH / 2 + 28,
        maxY: penH / 2 - 48,
      },
    };

    this.unlockSprites?.set('calf', hit);
    this.placedUnlockIds.add('calf');

    // Start each calf wandering at a staggered time so the herd feels alive
    calves.forEach((sprite, i) => {
      if (!sprite?.play) return;
      this.time.delayedCall(200 + i * 180 + Math.random() * 400, () => {
        this.wanderCalfStep(sprite);
      });
    });

    // Restore fill if stage already complete
    const progress = getChallengeProgress('calf', 'feed_calves');
    if (progress?.done) {
      this.calfFeedRound = {
        waterLevel: half,
        foodLevel: this.calfPen.foodMax,
        correctCount: settings.fillsNeeded,
        nextFill: 'food',
        usedQuestionIds: [],
      };
      this.refreshCalfPenBuckets();
    } else {
      this.calfFeedRound = {
        waterLevel: 0,
        foodLevel: 0,
        correctCount: 0,
        nextFill: 'water',
        usedQuestionIds: [],
      };
    }

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'unlock_placed',
      itemId: 'calf',
      tileX: slot.tileX,
      tileY: slot.tileY,
      hasTexture: Boolean(calfKey),
    });

    return hit;
  }

  /**
   * Walk-cycle anims from unlock_calf sheet (6×8 of 64px frames).
   * Rows 0–3: down / up / side / side.
   */
  ensureCalfAnimations() {
    if (!this.textures.exists('unlock_calf')) return;
    const defs = [
      { key: 'calf-walk-down', start: 0, end: 5 },
      { key: 'calf-walk-up', start: 6, end: 11 },
      { key: 'calf-walk-side', start: 12, end: 17 },
    ];
    for (const d of defs) {
      if (this.anims.exists(d.key)) continue;
      this.anims.create({
        key: d.key,
        frames: this.anims.generateFrameNumbers('unlock_calf', {
          start: d.start,
          end: d.end,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  /** True if (x,y) keeps minSpacing from every other calf. */
  isCalfSpotFree(x, y, self, minSpacing) {
    const herd = this.calfPen?.calves || [];
    for (const other of herd) {
      if (!other?.active || other === self) continue;
      if (Math.hypot(other.x - x, other.y - y) < minSpacing) return false;
    }
    return true;
  }

  /** Pick a nearby free spot in the pen and walk there with a facing walk cycle. */
  wanderCalfStep(sprite) {
    if (!this.sys?.isActive() || !sprite?.active || !this.calfPen) return;
    if (sprite.getData('crying')) {
      this.time.delayedCall(500, () => this.wanderCalfStep(sprite));
      return;
    }

    const bounds = this.calfPen.wanderBounds;
    if (!bounds) return;
    const minSpacing = this.calfPen.minSpacing || 44;

    let tx = sprite.x;
    let ty = sprite.y;
    let found = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reach = 24 + Math.random() * 40;
      const angle = Math.random() * Math.PI * 2;
      const nx = Phaser.Math.Clamp(
        sprite.x + Math.cos(angle) * reach,
        bounds.minX,
        bounds.maxX,
      );
      const ny = Phaser.Math.Clamp(
        sprite.y + Math.sin(angle) * reach,
        bounds.minY,
        bounds.maxY,
      );
      if (this.isCalfSpotFree(nx, ny, sprite, minSpacing)) {
        tx = nx;
        ty = ny;
        found = true;
        break;
      }
    }

    if (!found) {
      // Stay put a moment rather than walking into the herd
      this.time.delayedCall(500 + Math.random() * 900, () =>
        this.wanderCalfStep(sprite),
      );
      return;
    }

    const dx = tx - sprite.x;
    const dy = ty - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      this.time.delayedCall(300 + Math.random() * 700, () =>
        this.wanderCalfStep(sprite),
      );
      return;
    }

    if (sprite.play) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        sprite.setFlipX(dx < 0);
        sprite.play('calf-walk-side', true);
      } else if (dy < 0) {
        sprite.setFlipX(false);
        sprite.play('calf-walk-up', true);
      } else {
        sprite.setFlipX(false);
        sprite.play('calf-walk-down', true);
      }
    }

    const speed = 14 + Math.random() * 10;
    const duration = Math.max(450, (dist / speed) * 1000);
    const existing = sprite.getData('wanderTween');
    if (existing?.stop) existing.stop();

    const tween = this.tweens.add({
      targets: sprite,
      x: tx,
      y: ty,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!sprite?.active) return;
        sprite.anims?.stop();
        const idleFrame =
          Math.abs(dx) >= Math.abs(dy) ? 12 : dy < 0 ? 6 : 0;
        if (sprite.setFrame) sprite.setFrame(idleFrame);
        this.tweens.add({
          targets: sprite,
          y: sprite.y - 1.2,
          duration: 280,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
        this.time.delayedCall(400 + Math.random() * 1200, () =>
          this.wanderCalfStep(sprite),
        );
      },
    });
    sprite.setData('wanderTween', tween);
  }

  refreshCalfPenBuckets() {
    const pen = this.calfPen;
    const round = this.calfFeedRound;
    if (!pen || !round) return;
    const wMax = pen.waterMax || 1;
    const fMax = pen.foodMax || 1;
    const wPct = Math.min(1, round.waterLevel / wMax);
    const fPct = Math.min(1, round.foodLevel / fMax);
    if (pen.waterFill?.setDisplaySize) {
      pen.waterFill.setDisplaySize(18, Math.max(4, 22 * wPct));
      pen.waterFill.setFillStyle(0x3a9fd8, wPct > 0 ? 0.95 : 0.25);
    }
    if (pen.foodPile?.setAlpha) {
      pen.foodPile.setAlpha(0.12 + fPct * 0.88);
    }
    pen.waterLabel?.setText(`Water ${round.waterLevel}/${wMax}`);
    pen.foodLabel?.setText(`Food ${round.foodLevel}/${fMax}`);
  }

  makeCalfCry() {
    const calves = this.calfPen?.calves || [];
    if (!calves.length) return;
    const hungry = calves.filter((c) => c?.active);
    const target = hungry[Math.floor(Math.random() * hungry.length)];
    if (!target) return;

    target.setData('crying', true);
    const wanderTween = target.getData('wanderTween');
    if (wanderTween?.stop) wanderTween.stop();
    target.anims?.stop();

    this.tweens.add({
      targets: target,
      x: target.x + 4,
      duration: 80,
      yoyo: true,
      repeat: 5,
    });
    target.setTint?.(0x88aaff);
    const tear = this.add
      .text(
        this.calfPen.container.x + target.x + 10,
        this.calfPen.container.y + target.y - 18,
        'baa…',
        {
          fontFamily: 'Georgia, serif',
          fontSize: '12px',
          color: '#9fd4ff',
          stroke: '#0a1208',
          strokeThickness: 3,
        },
      )
      .setDepth(12);
    this.time.delayedCall(900, () => {
      tear.destroy();
      target.clearTint?.();
      target.setData('crying', false);
      this.wanderCalfStep(target);
    });
  }

  refreshActiveChallenges() {
    this.activeChallenges = buildActiveChallenges(this.levelId);
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
    const open = (this.activeChallenges || []).filter((c) => !c.done);
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
        label.setText(`${base} — Quest`);
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
  }

  focusCameraOnUnlock(itemId) {
    const spr = this.unlockSprites?.get(itemId);
    if (!spr || !this.cameras?.main) return;
    this.cameras.main.pan(spr.x, spr.y, 450, 'Sine.easeInOut');
  }

  findNearestChallengeItem(maxDist = TILE_SIZE * 4.5) {
    if (!this.player || !this.unlockSprites) return null;
    let best = null;
    let bestD = maxDist;
    for (const [itemId, sprite] of this.unlockSprites.entries()) {
      if (!sprite?.active) continue;
      const hasOpen = this.activeChallenges?.some(
        (c) => c.itemId === itemId && !c.done,
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
   * Clears a stuck input lock (no pending modal) so house / hen / calf stay clickable.
   */
  tryStartUnlockChallenge(itemId) {
    if (!itemId) return false;
    if (this.farmInputLocked) {
      const busy =
        Boolean(this.pendingQuizMode) || Boolean(this.pendingItemChallenge);
      if (busy) {
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'challenge_blocked',
          reason: 'input_locked',
          itemId,
          hint: 'Finish or close the open window first, then try again.',
        });
        return false;
      }
      // Stuck lock from a previous modal — free input so clicks work again
      this.farmInputLocked = false;
      this.physics?.world?.resume();
    }
    return this.startChallengeForUnlock(itemId);
  }

  /**
   * Start the next open challenge for a placed unlock (house, hen house, …).
   * Used by clicking the sprite or pressing E nearby.
   */
  startChallengeForUnlock(itemId) {
    if (!itemId) return false;
    if (this.farmInputLocked) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_blocked',
        reason: 'input_locked',
        itemId,
        hint: 'Finish or close the open window first, then try again.',
      });
      return false;
    }
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
        hint:
          itemId === 'hen_house'
            ? 'No egg challenge yet — buy chicks on a previous level, then return.'
            : itemId === 'house'
              ? 'No house challenge open right now.'
              : itemId === 'calf'
                ? 'No calf feed challenge yet — buy a calf on a previous level, then play the next level.'
                : `${item?.name || itemId}: no open challenge.`,
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

    // Modal mini-games open without needing a quiz step payload first
    if (
      challenge.mode === 'egg_collect' ||
      isEggCollectStage(challenge.itemId, challenge.stageId)
    ) {
      this.pendingQuizMode = 'item_challenge';
      this.pendingItemChallenge = {
        itemId: challenge.itemId,
        stageId: challenge.stageId,
        stepIndex: challenge.stepIndex || 0,
        rewardRp: challenge.rewardRp || 0,
        rewardCash: challenge.rewardCash || 0,
        totalSteps: challenge.steps?.length || 1,
        title: challenge.title,
        step: getNextChallengeStep(challenge),
      };
      this.farmInputLocked = true;
      this.player?.setVelocity(0);
      this.physics.world.pause();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_opening',
        itemId: challenge.itemId,
        hint: 'Opening Hen House…',
      });
      ForestGameBridge.emit(FARM_EVENTS.OPEN_EGG_COLLECT, {
        itemId: challenge.itemId,
        stageId: challenge.stageId,
        title: challenge.title,
        gameplayBand: this.gameplayBand || 'average',
        rewardRp: challenge.rewardRp || 0,
        rewardCash: challenge.rewardCash || 0,
      });
      return;
    }

    if (
      challenge.mode === 'calf_feed' ||
      isCalfFeedStage(challenge.itemId, challenge.stageId)
    ) {
      if (!this.calfPen) this.placeCalfPen();
      const settings = getCalfFeedSettings(this.gameplayBand || 'average');
      const half = Math.ceil(settings.fillsNeeded / 2);
      if (!this.calfFeedRound) {
        this.calfFeedRound = {
          waterLevel: 0,
          foodLevel: 0,
          correctCount: 0,
          nextFill: 'water',
          usedQuestionIds: [],
        };
      }
      if (this.calfPen) {
        this.calfPen.waterMax = half;
        this.calfPen.foodMax = Math.max(1, settings.fillsNeeded - half);
        this.calfPen.fillsNeeded = settings.fillsNeeded;
      }
      this.pendingQuizMode = 'calf_feed';
      this.pendingItemChallenge = {
        itemId: challenge.itemId,
        stageId: challenge.stageId || 'feed_calves',
        stepIndex: challenge.stepIndex || 0,
        rewardRp: challenge.rewardRp || 0,
        rewardCash: challenge.rewardCash || 0,
        totalSteps: settings.fillsNeeded,
        title: challenge.title || 'Feed the Calves',
      };
      this.openCalfFeedQuestion();
      return;
    }

    const step = getNextChallengeStep(challenge);
    if (!step && challenge.itemId !== 'house') {
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

    // House: open empty room — furniture appears as answers are correct
    if (challenge.itemId === 'house') {
      this.farmInputLocked = true;
      this.player?.setVelocity(0);
      this.physics.world.pause();
      const progress = getChallengeProgress(challenge.itemId, challenge.stageId);
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'challenge_opening',
        itemId: 'house',
        hint: 'Opening Farm House…',
      });
      ForestGameBridge.emit(FARM_EVENTS.OPEN_HOUSE_INTERIOR, {
        itemId: challenge.itemId,
        stageId: challenge.stageId,
        title: challenge.title,
        step: step || null,
        placed: progress?.placed || [],
        stepIndex: challenge.stepIndex || 0,
        gameplayBand: this.gameplayBand || 'average',
        luxuryBand: this.gameplayBand || 'average',
        houseLevel:
          this.gameplayBand === 'strong'
            ? 'Luxury furniture'
            : this.gameplayBand === 'weak'
              ? 'Poor furniture'
              : 'Average luxury',
        question: step
          ? {
              id: step.id,
              prompt: step.prompt,
              options: step.options,
              correctIndex: step.correctIndex,
              hint: step.hint,
              rp: challenge.rewardRp || 20,
              topic: challenge.title,
            }
          : null,
      });
      return;
    }

    this.farmInputLocked = true;
    this.player?.setVelocity(0);
    this.physics.world.pause();
    this.quizOpenedAt = Date.now();

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

  openCalfFeedQuestion() {
    if (!this.sys?.isActive()) return;
    const round = this.calfFeedRound || { usedQuestionIds: [] };
    const q = pickCalfFeedQuestion(round.usedQuestionIds || []);
    const pending = this.pendingItemChallenge || {};
    const filled =
      (round.waterLevel || 0) + (round.foodLevel || 0);
    const need = this.calfPen?.fillsNeeded || pending.totalSteps || 4;

    this.farmInputLocked = true;
    this.player?.setVelocity(0);
    this.physics.world.pause();
    this.quizOpenedAt = Date.now();
    this.pendingQuizMode = 'calf_feed';

    const question = {
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      hint: q.hint,
      rp: pending.rewardRp || 20,
      topic: pending.title || 'Feed the Calves',
    };

    ForestGameBridge.emit(
      FARM_EVENTS.TRIGGER_SCIENCE_QUIZ,
      this.withGameplayQuizMeta({
        mode: 'calf_feed',
        challenge: 'calf_feed',
        itemId: 'calf',
        stageId: pending.stageId || 'feed_calves',
        question,
        questionData: question,
        rp: question.rp,
        levelId: this.farmLevel.id,
        openedAt: this.quizOpenedAt,
        calfProgress: `${filled}/${need} fills`,
      }),
    );

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'calf_feed_quiz',
      filled,
      need,
      waterLevel: round.waterLevel || 0,
      foodLevel: round.foodLevel || 0,
    });
  }

  resolveCalfFeedSuccess(payload = {}) {
    const settings = getCalfFeedSettings(this.gameplayBand || 'average');
    const pen = this.calfPen;
    const half = pen?.waterMax || Math.ceil(settings.fillsNeeded / 2);
    const foodMax = pen?.foodMax || Math.max(1, settings.fillsNeeded - half);
    const fillsNeeded = pen?.fillsNeeded || settings.fillsNeeded;

    if (!this.calfFeedRound) {
      this.calfFeedRound = {
        waterLevel: 0,
        foodLevel: 0,
        correctCount: 0,
        nextFill: 'water',
        usedQuestionIds: [],
      };
    }
    const round = this.calfFeedRound;
    const qid = payload.questionId || payload.question?.id;
    if (qid && !round.usedQuestionIds.includes(qid)) {
      round.usedQuestionIds.push(qid);
    }

    const fillKind = round.nextFill === 'food' ? 'food' : 'water';
    if (fillKind === 'water') {
      round.waterLevel = Math.min(half, round.waterLevel + 1);
    } else {
      round.foodLevel = Math.min(foodMax, round.foodLevel + 1);
    }
    round.correctCount += 1;
    round.nextFill =
      round.waterLevel >= half
        ? 'food'
        : round.foodLevel >= foodMax
          ? 'water'
          : fillKind === 'water'
            ? 'food'
            : 'water';

    this.refreshCalfPenBuckets();
    this.audioItem?.play();

    const floatX =
      (this.calfPen?.container?.x || 0) + (fillKind === 'water' ? -48 : 48);
    const floatY = (this.calfPen?.container?.y || 0) + 20;
    const pop = this.add
      .text(floatX, floatY, fillKind === 'water' ? '+ water' : '+ food', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: fillKind === 'water' ? '#9fd4ff' : '#ffe9a8',
        stroke: '#0a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(14);
    this.tweens.add({
      targets: pop,
      y: floatY - 28,
      alpha: 0,
      duration: 900,
      onComplete: () => pop.destroy(),
    });

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'calf_feed',
      correct: true,
      fillKind,
      waterLevel: round.waterLevel,
      foodLevel: round.foodLevel,
    });

    const done =
      round.waterLevel >= half &&
      round.foodLevel >= foodMax &&
      round.correctCount >= fillsNeeded;

    if (done) {
      this.finishCalfFeedStage({
        correctCount: round.correctCount,
        waterLevel: round.waterLevel,
        foodLevel: round.foodLevel,
      });
      return;
    }

    // Next question after a short beat
    this.time.delayedCall(450, () => {
      if (!this.sys?.isActive()) return;
      this.openCalfFeedQuestion();
    });
  }

  resolveCalfFeedWrong(payload = {}) {
    if (!this.calfFeedRound) {
      this.calfFeedRound = {
        waterLevel: 0,
        foodLevel: 0,
        correctCount: 0,
        nextFill: 'water',
        usedQuestionIds: [],
      };
    }
    const qid = payload.questionId || payload.question?.id;
    if (qid && !this.calfFeedRound.usedQuestionIds.includes(qid)) {
      this.calfFeedRound.usedQuestionIds.push(qid);
    }
    this.makeCalfCry();
    this.audioHurt?.play();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'calf_feed',
      correct: false,
    });
    this.time.delayedCall(700, () => {
      if (!this.sys?.isActive()) return;
      this.openCalfFeedQuestion();
    });
  }

  /** After house interior fully furnished — complete the stage. */
  finishHouseChallengeStage() {
    const pending = this.pendingItemChallenge;
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    if (!pending) {
      this.resumeAfterQuiz();
      return;
    }

    const stage = getStage(pending.itemId, pending.stageId);
    const placed = getChallengeProgress(pending.itemId, pending.stageId)?.placed || [];
    advanceChallengeProgress(pending.itemId, pending.stageId, {
      stepIndex: stage?.steps?.length || pending.totalSteps || 0,
      done: true,
      placed,
    });

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
    this.refreshActiveChallenges();
    this.emitFarmState();
    this.checkTargetReached();
    this.resumeAfterQuiz();
  }

  /** One correct furniture-placement answer inside the house. */
  onHouseStepCorrect(payload = {}) {
    const pending = this.pendingItemChallenge;
    if (!pending) return;

    this.recordQuizAttempt(true, payload.responseTimeMs);
    const nextStep = (payload.stepIndex ?? pending.stepIndex ?? 0) + 1;
    const prevPlaced =
      getChallengeProgress(pending.itemId, pending.stageId)?.placed || [];
    const extras = Array.isArray(payload.bonusKeys) ? payload.bonusKeys : [];
    const placed = payload.furnitureKey
      ? [...new Set([...prevPlaced, payload.furnitureKey, ...extras])]
      : prevPlaced;

    advanceChallengeProgress(pending.itemId, pending.stageId, {
      stepIndex: nextStep,
      done: false,
      placed,
    });

    this.pendingItemChallenge = {
      ...pending,
      stepIndex: nextStep,
    };

    this.audioItem?.play();
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'challenge_step',
      itemId: pending.itemId,
      stageId: pending.stageId,
      stepIndex: nextStep,
      title: pending.title,
      placeLabel: payload.placeLabel,
      furnitureKey: payload.furnitureKey,
      rp: 0,
    });

    this.refreshActiveChallenges();
    this.emitFarmState();
  }

  onHouseStepWrong(payload = {}) {
    this.recordQuizAttempt(false, payload.responseTimeMs);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'challenge_fail',
      itemId: this.pendingItemChallenge?.itemId,
    });
    this.emitFarmState();
    this.checkTargetReached();
  }

  cancelHouseInterior() {
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    this.resumeAfterQuiz();
  }

  /** After egg-collect round succeeds — complete the chick stage. */
  finishEggCollectStage(payload = {}) {
    const pending = this.pendingItemChallenge;
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    if (!pending) {
      this.resumeAfterQuiz();
      return;
    }

    const stage = getStage(pending.itemId, pending.stageId);
    advanceChallengeProgress(pending.itemId, pending.stageId, {
      stepIndex: stage?.steps?.length || pending.totalSteps || 1,
      done: true,
      placed: [],
    });

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
      eggsCollected: payload.collected || 0,
      earnings: this.currentMoney,
    });
    this.refreshActiveChallenges();
    this.emitFarmState();
    this.checkTargetReached();
    this.resumeAfterQuiz();
  }

  onEggProtectCorrect(payload = {}) {
    this.recordQuizAttempt(true, payload.responseTimeMs);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'egg_protect',
      correct: true,
      itemId: this.pendingItemChallenge?.itemId,
    });
    this.emitFarmState();
  }

  onEggProtectWrong(payload = {}) {
    this.recordQuizAttempt(false, payload.responseTimeMs);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'egg_protect',
      correct: false,
      itemId: this.pendingItemChallenge?.itemId,
    });
    this.emitFarmState();
  }

  cancelEggCollect() {
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    this.resumeAfterQuiz();
  }

  /** After calf-feed round succeeds — complete the feed stage. */
  finishCalfFeedStage(payload = {}) {
    const pending = this.pendingItemChallenge;
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    if (!pending) {
      this.resumeAfterQuiz();
      return;
    }

    const stage = getStage(pending.itemId, pending.stageId);
    advanceChallengeProgress(pending.itemId, pending.stageId, {
      stepIndex: stage?.steps?.length || pending.totalSteps || 1,
      done: true,
      placed: [],
    });

    if (pending.rewardCash) {
      this.currentMoney += pending.rewardCash;
      this.syncMoneyAliases();
    }
    this.audioItem?.play();
    this.cameras.main.flash(200, 180, 220, 255);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'challenge_complete',
      itemId: pending.itemId,
      stageId: pending.stageId,
      title: pending.title,
      rp: pending.rewardRp || 0,
      rewardCash: pending.rewardCash || 0,
      calfFills: payload.correctCount || 0,
      earnings: this.currentMoney,
    });
    this.refreshActiveChallenges();
    this.emitFarmState();
    this.checkTargetReached();
    this.resumeAfterQuiz();
  }

  onCalfFeedCorrect(payload = {}) {
    this.recordQuizAttempt(true, payload.responseTimeMs);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'calf_feed',
      correct: true,
      itemId: this.pendingItemChallenge?.itemId,
    });
    this.emitFarmState();
  }

  onCalfFeedWrong(payload = {}) {
    this.recordQuizAttempt(false, payload.responseTimeMs);
    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'calf_feed',
      correct: false,
      itemId: this.pendingItemChallenge?.itemId,
    });
    this.emitFarmState();
  }

  cancelCalfFeed() {
    this.pendingQuizMode = null;
    this.pendingItemChallenge = null;
    this.resumeAfterQuiz();
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
      this.placeUnlockSprite(itemId);
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
    this.placeUnlockSprite(itemId);
    // Chick purchase also unlocks hen house — place it on the farm
    if (itemId === 'chick' && isUnlocked('hen_house')) {
      this.placeUnlockSprite('hen_house');
    }
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
   * Planting outside beds is not allowed.
   */
  getPlantPatchCells(originGridX, originGridY) {
    if (!isPlantableTile(originGridX, originGridY)) return [];

    const cols = this.farmLevel.plantPatchCols ?? 4;
    const rows = this.farmLevel.plantPatchRows ?? 3;
    const maxCells = cols * rows;

    return freeCellsInPlotAt(originGridX, originGridY, {
      occupiedKeys: this.plantedGridKeys,
      maxCells,
      tileSize: TILE_SIZE,
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

  /** E: plant bed, load dock, or nearby unlock-item challenge. */
  handleInteractKey() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.guardFarmAction('interact')) return;

    const cell = this.getPlayerGridCell();
    if (isLoadingTile(cell.gridX, cell.gridY)) {
      this.handleLoadingAttempt({ skipGuard: true });
      return;
    }
    if (isPlantableTile(cell.gridX, cell.gridY)) {
      this.handlePlantingAttempt({ skipGuard: true });
      return;
    }

    const nearItem = this.findNearestChallengeItem();
    if (nearItem) {
      this.tryStartUnlockChallenge(nearItem);
      return;
    }

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'plant_blocked',
      reason: 'not_plot',
    });
  }

  /**
   * At LOAD dock with crops on your back → load quiz → unload into cart.
   */
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

    this.pendingQuizMode = 'load';
    this.farmInputLocked = true;
    this.player.setVelocity(0);
    this.physics.world.pause();

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

  /**
   * E on plant bed → plant quiz → plant a multi-row/column crop PATCH.
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

    this.pendingQuizMode = 'plant';
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
    this.farmInputLocked = true;
    this.player.setVelocity(0);
    this.physics.world.pause();

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

  /**
   * Spawn one independent crop Image at a grid cell (does not clear others).
   */
  spawnCropAtCell(cell, staggerMs = 0) {
    if (!cell || this.plantedGridKeys.has(cell.key)) return null;
    if (!isPlantableTile(cell.gridX, cell.gridY)) return null;

    const worldX = cell.x ?? cell.gridX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = cell.y ?? cell.gridY * TILE_SIZE + TILE_SIZE / 2;

    const crop = new Crop(this, worldX, worldY, {
      cropType: this.farmLevel.cropId,
      value: this.farmLevel.cropValue,
      growMs: this.farmLevel.growMs,
      gridKey: cell.key,
      gridX: cell.gridX,
      gridY: cell.gridY,
      staggerMs,
    });

    this.cropsGroup.add(crop);
    this.plantedCrops.push(crop);
    this.plantedGridKeys.add(cell.key);
    return crop;
  }

  /**
   * On correct quiz: plant a full multi-row × multi-column patch of sunflowers/corn.
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
   * Auto-harvest: while the runner moves over ready crops, pick them up
   * and show a "Harvesting!" label above the player.
   */
  harvestCropsUnderfoot() {
    if (this.farmInputLocked || !this.player) return;

    const reach = TILE_SIZE * 0.95;
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

    hit.forEach((crop) => this.harvestCrop(crop, { silent: true }));
    this.showHarvestingBanner(hit.length);
    this.emitInventoryUpdated();

    // Light feedback while running through the patch (not a full-screen flash spam)
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
    this.physics.world.resume();
    this.focusGameCanvas();
  }

  onScienceCorrect(payload = {}) {
    try {
      this.recordQuizAttempt(true, payload.responseTimeMs);
      const mode = this.pendingQuizMode || payload.mode || 'plant';

      if (mode === 'calf_feed') {
        this.resolveCalfFeedSuccess(payload);
        return;
      }

      if (mode === 'item_challenge') {
        this.resolveItemChallengeSuccess();
        return;
      }

      if (mode === 'load') {
        const unloaded = this.carriedCount || 0;
        this.harvestedItemsCount += unloaded;
        this.clearCarryTrail();
        this.refreshHarvestCartVisual();
        this.pendingQuizMode = null;
        this.audioItem?.play();
        this.cameras.main.flash(180, 120, 200, 255);
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'load_success',
          unloaded,
          cartCount: this.harvestedItemsCount,
          rp: payload.rp ?? 0,
        });
        this.emitFarmState();
        this.checkTargetReached();
        return;
      }

      const crops = this.spawnCropAtTarget();
      const planted = Array.isArray(crops) ? crops : crops ? [crops] : [];

      if (planted.length > 0) {
        this.audioItem?.play();
        this.cameras.main.flash(180, 120, 220, 100);
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'plant_success',
          cropType: this.farmLevel.cropId,
          cropId: planted[0]?.cropId,
          plantedCount: this.plantedCrops.filter((c) => c?.active).length,
          patchPlanted: planted.length,
          rp: payload.rp ?? 0,
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
    } finally {
      this.resumeAfterQuiz();
    }
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

  onScienceIncorrect(payload = {}) {
    try {
      this.recordQuizAttempt(false, payload.responseTimeMs);
      const mode = this.pendingQuizMode || payload.mode || 'plant';

      if (mode === 'calf_feed') {
        // Keep calf feed going — cry, then next question
        this.resolveCalfFeedWrong(payload);
        return;
      }

      this.pendingQuizMode = null;
      this.pendingItemChallenge = null;

      if (mode === 'plant') {
        this.currentTargetTile = null;
        this.pendingGridKey = null;
        this.pendingPatchCells = [];
      }

      this.audioHurt?.play();
      this.cameras.main.flash(300, 255, 0, 0);
      this.cameras.main.shake(160, 0.008);

      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type:
          mode === 'load'
            ? 'load_fail'
            : mode === 'item_challenge'
              ? 'challenge_fail'
              : 'plant_fail',
        dda: true,
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
   * Q key / Sell Inventory button — convert harvested crops into cash.
   * Does NOT require farmInputLocked=false (stuck quiz lock previously ate sells).
   */
  handleSellInventory() {
    if (!this.sys?.isActive()) return;
    if (!this.guardFarmAction('sell')) return;

    if (this.harvestedItemsCount <= 0) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'sell_blocked',
        reason: 'empty_inventory',
      });
      return;
    }

    const harvestedItemsCount = this.harvestedItemsCount;
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
    // Cash is for the unlock shop only — selling does not complete the level
    this.focusGameCanvas();
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
    // Keep the map pin tracking even while a quiz locks farm input
    this.emitPlayerMapPos();

    if (this.farmInputLocked) {
      this.player?.setVelocity(0);
      return;
    }
    this.handlePlayerInput();
    this.handleCollisions();
    this.harvestCropsUnderfoot();
    this.updateHarvestingBanner();
    this.updateCarryTrailPositions();
    this.pulseNearbyCrops();
    this.cullOffscreenArrows();
    this.animateEnemies();
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
    const map = this.make.tilemap({ key: 'map' });
    const terrain = map.addTilesetImage('tileset');
    const objects = map.addTilesetImage('objects');
    const collisions = map.addTilesetImage('collisions');

    const ground = map.createLayer('Tile Layer', [objects, terrain]);
    const decor = map.createLayer('Tile Layer 2', [objects, terrain]);
    ground?.setDepth(0);
    decor?.setDepth(1);

    this.colLayer = map.createLayer('Collisions Layer', [collisions]);
    this.colLayer.setVisible(false);
    this.colLayer.setDepth(2);
    map.setCollision([0, 1]);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.map = map;
  }

  createExit() {
    this.exit = this.add.sprite(47.5 * TILE_SIZE, 28.5 * TILE_SIZE, 'exit');
    this.exit.setAlpha(0);
  }

  populateEnemies() {
    const settings = this.gameplaySettings || getGameplaySettings('average');
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
  }

  createCamera() {
    this.cameras.main.setRoundPixels(true);
    // Lower zoom so more of the farm is visible while running
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player);
    if (this.map) {
      this.cameras.main.setBounds(
        0,
        0,
        this.map.widthInPixels,
        this.map.heightInPixels,
      );
    }
  }

  handlePlayerInput() {
    const { player, cursors } = this;
    const model = player.playerModel;
    player.walking = false;

    if (this.farmInputLocked) {
      player.setVelocity(0);
      return;
    }

    if (cursors.right.isDown) {
      this.movePlayer(PLAYER_SPEED, 0, DIRECTIONS.RIGHT, 'walk-side', false);
    } else if (cursors.left.isDown) {
      this.movePlayer(-PLAYER_SPEED, 0, DIRECTIONS.LEFT, 'walk-side', true);
    } else if (cursors.up.isDown) {
      this.movePlayer(0, -PLAYER_SPEED, DIRECTIONS.UP, 'walk-back', false);
    } else if (cursors.down.isDown) {
      this.movePlayer(0, PLAYER_SPEED, DIRECTIONS.DOWN, 'walk-front', false);
    } else {
      player.setVelocity(0);
      player.setFrame(player.frameMap[model.direction]);
      player.setFlipX(model.direction === DIRECTIONS.LEFT);
    }

    if (Phaser.Input.Keyboard.JustDown(cursors.space)) {
      player.setVelocity(0);
      const shot = new Arrow(this);
      this.projectilesGroup.add(shot);
      this.audioSlash.play();
      model.shots += 1;
    }

    // E / Q handled by key.on('down') + window capture (bindKeys / bindWindowKeys)
  }

  movePlayer(vx, vy, direction, animKey, flipX) {
    const { player } = this;
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
    // Crops are Images (not physics bodies) — pulse via proximity in update
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
      if (d > TILE_SIZE * 1.2) return;
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
    // Unharvested crops never carry into the next level
    this.clearAllCrops({ silent: true });
    this.scene.start('GameOverScene', {
      score: this.earnings + (this.player.playerModel.scoreCalc || 0),
      forestUnlocked: true,
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
    const { playerModel } = player;
    if (playerModel.hurtFlag) return;

    playerModel.hurtFlag = true;
    this.time.delayedCall(HURT_INVULN_MS, () => {
      playerModel.hurtFlag = false;
      player.setAlpha(1);
    });

    player.setAlpha(0.5);
    playerModel.health -= 1;
    this.audioHurt.play();

    if (playerModel.health < 1) {
      playerModel.scoreCalc -= 200;
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

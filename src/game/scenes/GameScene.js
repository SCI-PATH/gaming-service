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
  saveLevelPerformance,
} from '../../data/masteryModel';
import {
  getOwnedUnlockIds,
  getUnlockItem,
  isUnlocked,
  markUnlocked,
  shopBandFromPerformance,
  UNLOCK_WORLD_SLOTS,
} from '../../data/unlockShop.js';
import {
  findPlotAt,
  freeCellsInPlotAt,
  isPlantableTile,
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
  }

  create() {
    this.farmLevel = getFarmLevel(this.levelId);
    this.baseCropValue = this.farmLevel.cropValue;
    this.currentMoney = 0;
    this.earnings = 0;
    this.harvestedItemsCount = 0;
    this.inventory = 0;
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
    this.quizOpenedAt = 0;

    // Time target at level start from previous level avg / mastery (no cash goal)
    const prior = getMasteryForLevelStart(this.levelId);
    this.mastery = prior.mastery;
    this.masterySource = prior.source;
    this.masteryFromLevelId = prior.fromLevelId;
    this.performanceBand = prior.band;
    this.timeTargetMs = prior.timeTargetMs;
    this.cashTarget = null; // cash is for unlock shop only, not level completion
    this.ddaCalibrated = true;

    this.farmLevel = {
      ...this.farmLevel,
      targetEarnings: null,
      timeTargetMs: this.timeTargetMs,
      maxQuestions: DDA_CONFIG.maxQuestions,
      cropValue: cropValueFromMastery(this.baseCropValue, this.mastery),
      goalText: goalTextFromMastery(this.timeTargetMs, this.mastery),
    };

    this.addAudios();
    this.createMap();
    this.createGroups();
    this.createExit();
    // Starting level = plain background; owned unlocks appear only after purchase
    this.placedUnlockIds = new Set();
    this.placeOwnedUnlocks();
    this.createPlantPlotMarkers();
    this.populateEnemies();
    this.createPlayer();
    this.bindKeys();
    this.createCamera();
    createGameAnimations(this);
    this.startTime = this.time.now;
    this.bindFarmBridge();
    this.bindWindowKeys();
    this.focusGameCanvas();
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
      source: this.masterySource,
      fromLevelId: this.masteryFromLevelId,
      levelId: this.levelId,
    });
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

    // Drop stale handlers from HMR / StrictMode so dead scenes cannot eat events
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PLANT_CROP);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_FAILURE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SELL_INVENTORY_ACTION);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PURCHASE_UNLOCK);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_OPEN);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.UNLOCK_SHOP_CLOSE);

    ForestGameBridge.on(FARM_EVENTS.PLANT_CROP, this._onPlant);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
    ForestGameBridge.on(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
    ForestGameBridge.on(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
    ForestGameBridge.on(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.PLANT_CROP, this._onPlant);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
      ForestGameBridge.off(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
      ForestGameBridge.off(FARM_EVENTS.PURCHASE_UNLOCK, this._onPurchaseUnlock);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_OPEN, this._onShopOpen);
      ForestGameBridge.off(FARM_EVENTS.UNLOCK_SHOP_CLOSE, this._onShopClose);
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
      levelId: this.farmLevel.id,
      cropName: this.farmLevel.cropName,
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
      playerTileX: this.player
        ? Math.floor(this.player.x / TILE_SIZE)
        : 48,
      playerTileY: this.player
        ? Math.floor(this.player.y / TILE_SIZE)
        : 32,
      mapWidth: this.map?.width ?? 100,
      mapHeight: this.map?.height ?? 75,
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
    else this.quizIncorrect += 1;

    const attempt = { wasCorrect, responseTimeMs: ms };
    this.levelAttempts.push(attempt);

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

  canPlantMore() {
    // Max 20 questions — stop planting once level is complete
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

    this.farmLevel = {
      ...this.farmLevel,
      goalText: `Level complete!${timeNote} Unlock shop is open — bought items stay on your farm.`,
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
    };
    ForestGameBridge.emit(FARM_EVENTS.GOAL_COMPLETED, payload);
    this.emitFarmState();
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
    this.cropsGroup?.clear(true, true);
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
    if (!item || !this.textures.exists(item.textureKey)) return null;

    const owned = getOwnedUnlockIds();
    const index = Math.max(0, owned.indexOf(itemId));
    const slot = UNLOCK_WORLD_SLOTS[index % UNLOCK_WORLD_SLOTS.length];
    const x = slot.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = slot.tileY * TILE_SIZE + TILE_SIZE / 2;

    const sprite = item.frameWidth
      ? this.add.sprite(x, y, item.textureKey, 0)
      : this.add.image(x, y, item.textureKey);

    sprite.setScale(item.displayScale ?? 1);
    sprite.setDepth(item.category === 'building' ? 6 : 5);
    sprite.setData('unlockId', itemId);

    this.placedUnlockIds.add(itemId);
    return sprite;
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
    markUnlocked(itemId);
    this.placeUnlockSprite(itemId);
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

  /** E opens plant quiz only — harvesting is done by running over ready crops. */
  handleInteractKey() {
    if (this.farmInputLocked || !this.player) return;
    if (!this.guardFarmAction('interact')) return;
    this.handlePlantingAttempt({ skipGuard: true });
  }

  /**
   * E on farm ground → science quiz → plant a multi-row/column crop PATCH.
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

    // Reserve every cell in the patch while the quiz is open
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

    const question = pickScienceQuestion(this.farmLevel, this.lastQuestionId);
    this.lastQuestionId = question.id;

    this.quizOpenedAt = Date.now();
    ForestGameBridge.emit(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, {
      mode: 'plant',
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
    });

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
    const label = count > 1 ? `Harvesting! +${count}` : 'Harvesting!';

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
    this.harvestedItemsCount += 1;

    if (crop.gridKey) this.plantedGridKeys.delete(crop.gridKey);
    this.plantedCrops = this.plantedCrops.filter((c) => c !== crop && c?.active);

    if (!options.silent) {
      this.audioItem?.play();
      this.cameras.main.flash(200, 80, 200, 120);
      this.emitInventoryUpdated();
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'harvest',
        inventory: this.harvestedItemsCount,
        harvestedCount: this.harvestedItemsCount,
        harvestedItemsCount: this.harvestedItemsCount,
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
      this.emitFarmState();
      this.checkTargetReached();
    } finally {
      this.resumeAfterQuiz();
    }
  }

  onScienceIncorrect(payload = {}) {
    try {
      this.recordQuizAttempt(false, payload.responseTimeMs);
      this.currentTargetTile = null;
      this.pendingGridKey = null;
      this.pendingPatchCells = [];

      this.audioHurt?.play();
      this.cameras.main.flash(300, 255, 0, 0);
      this.cameras.main.shake(160, 0.008);

      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_fail',
        dda: true,
        questionId: payload.questionId,
        selectedIndex: payload.selectedIndex,
        performanceBand: this.performanceBand,
        timeTargetMs: this.timeTargetMs,
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
    const coinsEarned = harvestedItemsCount * this.farmLevel.cropValue;
    this.harvestedItemsCount = 0;
    this.currentMoney += coinsEarned;
    this.syncMoneyAliases();

    this.audioItem?.play();
    this.cameras.main.flash(180, 255, 220, 80);

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'sell',
      sold: harvestedItemsCount,
      gained: coinsEarned,
      coinsEarned,
      coinsGained: coinsEarned,
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
    this.spawnEnemiesByGid(MOLE_GID, true, 'idle/mole-idle-front');
    this.spawnEnemiesByGid(TREANT_GID, false, 'idle/treant-idle-front');
  }

  spawnEnemiesByGid(gid, verticalMove, idleFrame) {
    const objectLayer = this.map.getObjectLayer('Object Layer');
    if (!objectLayer) return;

    objectLayer.objects
      .filter((obj) => obj.gid === gid)
      .forEach((obj) => {
        const enemy = new Enemy(
          this,
          obj.x / TILE_SIZE,
          obj.y / TILE_SIZE,
          verticalMove,
          idleFrame,
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

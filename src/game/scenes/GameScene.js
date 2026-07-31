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
  scoreAttempt,
} from '../../data/dda';
import {
  cropValueFromMastery,
  getMasteryForLevelStart,
  goalTextFromMastery,
  saveLevelPerformance,
} from '../../data/masteryModel';

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

    // Cash goal at level start from previous mastery / external model
    const prior = getMasteryForLevelStart(this.levelId);
    this.mastery = prior.mastery;
    this.masterySource = prior.source;
    this.masteryFromLevelId = prior.fromLevelId;
    this.performanceBand = prior.band;
    this.cashTarget = prior.cashGoal;
    this.ddaCalibrated = true; // goal is known from the start

    this.farmLevel = {
      ...this.farmLevel,
      targetEarnings: this.cashTarget,
      cropValue: cropValueFromMastery(this.baseCropValue, this.mastery),
      goalText: goalTextFromMastery(this.cashTarget, this.mastery),
    };

    this.addAudios();
    this.createMap();
    this.createGroups();
    this.createExit();
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

    ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
      type: 'mastery_goal_set',
      mastery: this.mastery,
      masteryPercent: Math.round(this.mastery * 100),
      performanceBand: this.performanceBand,
      target: this.cashTarget,
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

    // Drop stale handlers from HMR / StrictMode so dead scenes cannot eat events
    ForestGameBridge.removeAllListeners(FARM_EVENTS.PLANT_CROP);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SCIENCE_QUIZ_FAILURE);
    ForestGameBridge.removeAllListeners(FARM_EVENTS.SELL_INVENTORY_ACTION);

    ForestGameBridge.on(FARM_EVENTS.PLANT_CROP, this._onPlant);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
    ForestGameBridge.on(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.PLANT_CROP, this._onPlant);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, this._onQuizSuccess);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, this._onQuizFailure);
      ForestGameBridge.off(FARM_EVENTS.SELL_INVENTORY_ACTION, this._onSell);
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
    ForestGameBridge.emit(FARM_EVENTS.FARM_STATE, {
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
      target: this.cashTarget,
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
      avgResponseMs: avgMs,
      avgResponseLabel: avgMs ? formatResponseTime(avgMs) : '—',
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
      target: this.cashTarget,
      cropValue: this.farmLevel.cropValue,
      performanceBand: this.performanceBand,
      mastery: this.mastery,
    });
    this.emitFarmState();
  }

  /**
   * Record this level's quiz attempt (for next level mastery).
   * Cash goal stays fixed from level-start mastery.
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
      target: this.cashTarget,
      mastery: this.mastery,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
    });
  }

  persistLevelMastery() {
    const avgMs =
      this.responseTimesMs.length > 0
        ? Math.round(
            this.responseTimesMs.reduce((a, b) => a + b, 0) /
              this.responseTimesMs.length,
          )
        : null;

    return saveLevelPerformance(this.levelId, {
      attempts: this.levelAttempts,
      quizCorrect: this.quizCorrect,
      quizIncorrect: this.quizIncorrect,
      avgResponseMs: avgMs,
    });
  }

  canPlantMore() {
    return this.currentMoney < this.cashTarget;
  }

  checkTargetReached() {
    if (this.forestUnlocked) return;
    if (this.cashTarget == null || this.cashTarget <= 0) return;
    if (this.currentMoney < this.cashTarget) return;

    this.forestUnlocked = true;
    this.persistLevelMastery();
    this.farmLevel = {
      ...this.farmLevel,
      goalText: `Target Reached ($${this.cashTarget})! Proceed to the Forest Entrance!`,
    };
    this.openForestGate();

    const payload = {
      earnings: this.currentMoney,
      currentMoney: this.currentMoney,
      target: this.cashTarget,
      levelId: this.farmLevel.id,
      goalText: this.farmLevel.goalText,
      performanceBand: this.performanceBand,
      mastery: this.mastery,
    };
    ForestGameBridge.emit(FARM_EVENTS.GOAL_COMPLETED, payload);
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
   * Build a multi-row × multi-column patch of free tiles centered on the player.
   * Skips walls and already-planted cells.
   */
  getPlantPatchCells(originGridX, originGridY) {
    const cols = this.farmLevel.plantPatchCols ?? 10;
    const rows = this.farmLevel.plantPatchRows ?? 3;
    const startX = originGridX - Math.floor(cols / 2);
    const startY = originGridY - Math.floor(rows / 2);
    const cells = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const gridX = startX + col;
        const gridY = startY + row;
        const key = this.gridKey(gridX, gridY);

        const colTile = this.colLayer?.getTileAt(gridX, gridY);
        if (colTile?.collides) continue;
        if (this.plantedGridKeys.has(key)) continue;

        cells.push({
          gridX,
          gridY,
          key,
          x: gridX * TILE_SIZE + TILE_SIZE / 2,
          y: gridY * TILE_SIZE + TILE_SIZE / 2,
          tileOriginX: gridX * TILE_SIZE,
          tileOriginY: gridY * TILE_SIZE,
          patchCol: col,
          patchRow: row,
        });
      }
    }
    return cells;
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
    const patchCells = this.getPlantPatchCells(cell.gridX, cell.gridY);

    if (patchCells.length < 1) {
      ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
        type: 'plant_blocked',
        reason: 'tile_occupied',
        tileX: cell.gridX,
        tileY: cell.gridY,
        gridKey: cell.key,
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
      patchSize: patchCells.length,
      patchCols: this.farmLevel.plantPatchCols ?? 10,
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
          target: this.cashTarget,
        });
      } else {
        this.pendingGridKey = null;
        this.pendingPatchCells = [];
      }
      this.emitFarmState();
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
        target: this.cashTarget,
      });

      this.emitFarmState();
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
    this.checkTargetReached();
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
    this.cameras.main.setZoom(3.5);
    this.cameras.main.startFollow(this.player);
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

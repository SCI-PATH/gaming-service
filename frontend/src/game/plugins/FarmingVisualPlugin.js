/**
 * Scene plugin: paint farm beds from student performance, then recover them
 * when a story challenge is answered correctly.
 */
import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import { PLANT_PLOTS } from '../../data/plantPlots.js';
import {
  farmConditionFromPerformance,
  plotStateForSituation,
  situationForPlotState,
} from '../../data/farmConditionPresets.js';
import { SITUATIONS } from '../../storyline/storylineSituations.js';
import { resolveUnlockDisplayScale } from '../../data/unlockShop.js';

export default class FarmingVisualPlugin extends Phaser.Plugins.ScenePlugin {
  constructor(scene, pluginManager, pluginKey) {
    super(scene, pluginManager, pluginKey);
    this.beds = new Map();
    this.condition = null;
  }

  boot() {
    this.systems.events.once('destroy', this.shutdown, this);
  }

  shutdown() {
    this.clear();
  }

  clear() {
    for (const bed of this.beds.values()) {
      for (const sprite of bed.sprites || []) {
        this.scene?.tweens?.killTweensOf(sprite);
        sprite.destroy?.();
      }
    }
    this.beds.clear();
  }

  paintFromStudent({
    performanceBand,
    gameplayBand,
    frustrationLevel,
    completedCount = 0,
  } = {}) {
    if (!this.scene) return null;
    this.condition = farmConditionFromPerformance({
      performanceBand,
      gameplayBand,
      frustrationLevel,
    });
    this.clear();
    for (const plot of PLANT_PLOTS) {
      const state = this.condition.plotStates[plot.id] || 'healthy';
      this.beds.set(plot.id, {
        plotId: plot.id,
        state,
        recovered: false,
        sprites: this.spawnBedCrops(plot, state),
      });
    }
    const problemIds = PLANT_PLOTS.map((p) => p.id).filter(
      (id) => this.beds.get(id)?.state !== 'healthy',
    );
    const already = Math.max(0, Number(completedCount) || 0);
    for (let i = 0; i < already && i < problemIds.length; i += 1) {
      this.recoverPlot(problemIds[i], { instant: true });
    }
    return this.condition;
  }

  recoverForSituation(situationId, { instant = false } = {}) {
    const want = plotStateForSituation(situationId);
    const match = [...this.beds.values()].find(
      (bed) => !bed.recovered && bed.state === want,
    );
    const fallback = [...this.beds.values()].find(
      (bed) => !bed.recovered && bed.state !== 'healthy',
    );
    const bed = match || fallback;
    if (!bed) return false;
    this.recoverPlot(bed.plotId, { instant });
    return true;
  }

  recoverPlot(plotId, { instant = false } = {}) {
    const bed = this.beds.get(plotId);
    if (!bed || bed.recovered) return;
    bed.recovered = true;
    const spec = this.specForState('healthy');
    for (const sprite of bed.sprites || []) {
      if (instant) {
        this.applySpec(sprite, spec);
        continue;
      }
      const start = sprite.scaleX || 1;
      this.scene.tweens.add({
        targets: sprite,
        scaleX: start * 0.72,
        scaleY: start * 0.72,
        duration: 120,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (!sprite.active) return;
          this.applySpec(sprite, spec);
          const next = sprite.getData('baseScale') || start;
          sprite.setScale(next);
          this.scene.tweens.add({
            targets: sprite,
            scaleX: next * 1.14,
            scaleY: next * 1.14,
            duration: 160,
            yoyo: true,
            ease: 'Sine.easeOut',
          });
        },
      });
    }
  }

  spawnBedCrops(plot, state) {
    const spec = this.specForState(state);
    const sprites = [];
    const rowY = plot.y + plot.h;
    const count = Math.min(4, plot.w);
    for (let i = 0; i < count; i += 1) {
      const tileX = plot.x + i;
      const x = tileX * TILE_SIZE + TILE_SIZE / 2;
      const y = rowY * TILE_SIZE + TILE_SIZE / 2;
      const sprite = this.addCrop(x, y, spec, 3);
      sprites.push(sprite);
    }
    return sprites;
  }

  specForState(state) {
    const situationId = situationForPlotState(state);
    const def = SITUATIONS[situationId] || SITUATIONS.wilted_flower;
    return state === 'healthy' ? def.after : def.before;
  }

  addCrop(x, y, spec, depth = 3) {
    const key = spec?.textureKey;
    let sprite;
    if (key && this.scene.textures.exists(key)) {
      sprite = this.scene.add.image(x, y, key);
    } else {
      sprite = this.scene.add.rectangle(x, y, 14, 18, 0x6b5344, 0.9);
    }
    this.applySpec(sprite, spec);
    sprite.setDepth(depth);
    return sprite;
  }

  applySpec(sprite, spec) {
    if (!sprite || !spec) return 1;
    const key = spec.textureKey;
    if (key && sprite.setTexture && this.scene.textures.exists(key)) {
      sprite.setTexture(key);
    }
    if (spec.tint != null && spec.tint !== 0xffffff) {
      sprite.setTint?.(spec.tint);
    } else {
      sprite.clearTint?.();
    }
    if (spec.angle != null) sprite.setAngle?.(spec.angle);
    const src =
      (key && this.scene.textures.exists(key)
        ? this.scene.textures.get(key)?.getSourceImage?.()
        : null) || null;
    const scale =
      resolveUnlockDisplayScale(
        { mapTileWidth: spec.mapTileWidth || 1.6 },
        src?.width || sprite.width || 16,
        src?.height || sprite.height || 16,
        TILE_SIZE,
      ) * (spec.scaleMul || 1);
    sprite.setScale?.(scale);
    sprite.setData?.('baseScale', scale);
    return scale;
  }
}

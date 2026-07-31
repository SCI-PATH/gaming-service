import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';

export const CROP_STATE = {
  GROWING: 'growing',
  READY: 'readyToHarvest',
  HARVESTED: 'harvested',
};

const CROP_TEXTURES = {
  flowers: { sprout: 'crop_flower_sprout', ready: 'crop_flower' },
  corn: { sprout: 'crop_corn_sprout', ready: 'crop_corn' },
};

function resolveTextures(scene, cropType) {
  const keys = CROP_TEXTURES[cropType] || CROP_TEXTURES.flowers;
  const sprout = scene.textures.exists(keys.sprout) ? keys.sprout : keys.ready;
  const ready = scene.textures.exists(keys.ready) ? keys.ready : sprout;
  return { sprout, ready };
}

/**
 * Independent crop instance — plain Image (not a recycled physics pool object)
 * so each plant keeps its own world position forever.
 */
export default class Crop extends Phaser.GameObjects.Image {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} worldX
   * @param {number} worldY
   * @param {{ cropType: string, value: number, growMs: number, gridKey: string, gridX: number, gridY: number }} config
   */
  constructor(scene, worldX, worldY, config) {
    const textures = resolveTextures(scene, config.cropType);
    super(scene, worldX, worldY, textures.sprout);

    scene.add.existing(this);

    this.cropId = `crop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.cropType = config.cropType;
    this.value = config.value;
    this.growMs = config.growMs ?? 2000;
    this.gridKey = config.gridKey;
    this.gridX = config.gridX;
    this.gridY = config.gridY;
    this.tileX = config.gridX;
    this.tileY = config.gridY;
    this.cropState = CROP_STATE.GROWING;
    this.textureKeys = textures;

    this.setName(this.cropId);
    this.setOrigin(0.5, 0.5);
    this.setDepth(20);
    this.clearTint();

    const texW = Math.max(this.width, 1);
    const texH = Math.max(this.height, 1);
    const fit = (TILE_SIZE * 1.4) / Math.max(texW, texH);
    this.fullScale = fit;
    this.sproutScale = fit * 0.75;

    const stagger = config.staggerMs ?? 0;
    this.setScale(0);
    this.setAlpha(0);

    scene.tweens.add({
      targets: this,
      scaleX: this.sproutScale,
      scaleY: this.sproutScale,
      alpha: 1,
      duration: 280,
      delay: stagger,
      ease: 'Back.easeOut',
    });

    this._growTimer = scene.time.delayedCall(this.growMs + stagger, () => {
      if (this.active) this.markReady();
    });
  }

  markReady() {
    if (!this.active || this.cropState === CROP_STATE.READY) return;

    this.setTexture(this.textureKeys.ready);
    this.setOrigin(0.5, 0.5);
    this.setDepth(20);
    this.setScale(this.fullScale);
    this.cropState = CROP_STATE.READY;

    this.scene.tweens.add({
      targets: this,
      scaleX: this.fullScale * 1.12,
      scaleY: this.fullScale * 1.12,
      yoyo: true,
      duration: 160,
    });
  }

  isReady() {
    return this.active && this.cropState === CROP_STATE.READY;
  }

  playHarvestFx() {
    this.cropState = CROP_STATE.HARVESTED;
    if (this._growTimer) this._growTimer.remove(false);
    this.scene.tweens.killTweensOf(this);

    // Pop + float up so running-over harvest is obvious
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 14,
      scaleX: this.fullScale * 1.45,
      scaleY: this.fullScale * 1.45,
      angle: Phaser.Math.Between(-25, 25),
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (this.active) this.destroy();
      },
    });
  }

  destroy(fromScene) {
    if (this._growTimer) this._growTimer.remove(false);
    this.scene?.tweens?.killTweensOf(this);
    super.destroy(fromScene);
  }
}

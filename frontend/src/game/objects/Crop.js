import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import { getCropTextures } from '../../data/cropChallenges.js';

export const CROP_STATE = {
  GROWING: 'growing',
  READY: 'readyToHarvest',
  HARVESTED: 'harvested',
};

/** Grown plant size — fills its tile with a little soil showing between plants. */
const READY_SIZE_PX = TILE_SIZE * 1.22;

function resolveTextures(scene, cropType) {
  const keys = getCropTextures(cropType);
  const sprout = scene.textures.exists(keys.sprout)
    ? keys.sprout
    : scene.textures.exists(keys.ready)
      ? keys.ready
      : 'crop_flower';
  const ready = scene.textures.exists(keys.ready) ? keys.ready : sprout;
  const produce =
    keys.produce && scene.textures.exists(keys.produce)
      ? keys.produce
      : ready;
  return { sprout, ready, produce, tint: keys.tint || null };
}

function texturePx(scene, key) {
  const img = scene.textures.get(key)?.getSourceImage?.();
  return {
    w: Math.max(img?.width || 16, 1),
    h: Math.max(img?.height || 16, 1),
  };
}

function scaleToFit(scene, key, targetPx) {
  const { w, h } = texturePx(scene, key);
  return targetPx / Math.max(w, h);
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

    scene.textures.get(textures.sprout)?.setFilter?.(
      Phaser.Textures.FilterMode.NEAREST,
    );
    scene.textures.get(textures.ready)?.setFilter?.(
      Phaser.Textures.FilterMode.NEAREST,
    );
    scene.textures.get(textures.produce)?.setFilter?.(
      Phaser.Textures.FilterMode.NEAREST,
    );

    this.setName(this.cropId);
    this.setOrigin(0.5, 0.7);
    this.setDepth(20);
    this.clearTint();
    this.cropTint = config.tint ?? textures.tint ?? null;
    if (this.cropTint) this.setTint(this.cropTint);

    this.fullScale = scaleToFit(scene, textures.ready, READY_SIZE_PX);
    this.sproutScale = scaleToFit(scene, textures.sprout, READY_SIZE_PX * 0.62);

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

    const readyKey = this.textureKeys.ready;
    this.setTexture(readyKey);
    this.fullScale = scaleToFit(this.scene, readyKey, READY_SIZE_PX);
    this.setOrigin(0.5, 0.7);
    this.setDepth(20);
    this.setScale(this.fullScale);
    if (this.cropTint) this.setTint(this.cropTint);
    else this.clearTint();
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

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 18,
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

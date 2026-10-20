/**
 * Preloads farm art, the tilemap, shop customers, and audio, then
 * starts the soundtrack and opens the menu.
 */
import Phaser from 'phaser';
import { createBrandLoadBar } from '../ui/menuBackdrop.js';
import { LIBRARY_LOAD_ITEMS } from '../../data/assetLibrary.js';
import { SITUATION_LOAD_ITEMS } from '../../storyline/storylineSituations.js';
import { GROUND_TILE_KEYS, UNLOCK_ITEMS } from '../../data/unlockShop.js';
import { HARVEST_LOAD_ITEMS } from '../../data/harvestAssets.js';
import { FARM_LIFE_LOAD_ITEMS } from '../../data/farmLifeAssets.js';
import { FARM_SHOP_LOAD_ITEMS } from '../../data/farmShopAssets.js';

export default class LoadScene extends Phaser.Scene {
  /** Phaser key LoadScene. */
  constructor() {
    super({ key: 'LoadScene' });
  }

  /** Draw the brand progress bar and queue images, maps, and sounds. */
  preload() {
    createBrandLoadBar(this);
    this.loadImages();
    this.loadMaps();
    this.loadAudio();
  }

  /** Start looping music, keep pixel art sharp, then open the menu. */
  create() {
    this.soundtrack = this.sound.add('music', {
      volume: 0.5,
      loop: true,
    });

    this.game.registry.set('musicEnabled', true);
    this.game.registry.set('soundtrack', this.soundtrack);
    this.soundtrack.play();
    try {
      const keys =
        this.textures.getTextureKeys?.() ||
        Object.keys(this.textures.list || {});
      for (const key of keys) {
        this.textures.get(key)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    } catch {
      /* skip */
    }
    this.scene.start('MenuScene');
  }

  /** Title art plus crops, harvests, shop, and storyline images. */
  loadImages() {
    this.load.image('title-bg', '/assets/sprites/title-screen-bg.png');
    this.load.image('enter', '/assets/sprites/press-enter-text.png');
    this.load.image('instructions', '/assets/sprites/instructions.png');
    this.load.image('mute', '/assets/sprites/mute.png');
    this.load.image('sound', '/assets/sprites/sound.png');
    this.load.image('exit', '/assets/environment/exit-open.png');

    // Custom crop PNGs (visible on top of tilemap after science-quiz plant)
    this.load.image('crop_corn', '/assets/crops/corn_crop.png');
    this.load.image('crop_flower', '/assets/crops/flower_crop.png');
    this.load.image('crop_corn_sprout', '/assets/crops/corn_crop_sprout.png');
    this.load.image('crop_flower_sprout', '/assets/crops/flower_crop_sprout.png');

    this.loadUnlockShopAssets();
    this.loadHarvestAssets();
    this.loadFarmLifeAssets();
    this.loadFarmShopAssets();
    this.loadAssetLibrary();
    this.loadStorylineSituationAssets();
  }

  /** Produce icons used on the carry stack and shop bubbles. */
  loadHarvestAssets() {
    for (const item of HARVEST_LOAD_ITEMS) {
      if (item.frameWidth && item.frameHeight) {
        this.load.spritesheet(item.textureKey, item.image, {
          frameWidth: item.frameWidth,
          frameHeight: item.frameHeight,
        });
      } else {
        this.load.image(item.textureKey, item.image);
      }
    }
  }

  /** Animals, fences, and yard props for paddock and cleaning. */
  loadFarmLifeAssets() {
    for (const item of FARM_LIFE_LOAD_ITEMS) {
      this.load.image(item.textureKey, item.image);
    }
  }

  /** Stall, counter, and the customer sheet for the farm shop. */
  loadFarmShopAssets() {
    for (const item of FARM_SHOP_LOAD_ITEMS) {
      if (item.frameWidth && item.frameHeight) {
        this.load.spritesheet(item.textureKey, item.image, {
          frameWidth: item.frameWidth,
          frameHeight: item.frameHeight,
        });
      } else {
        this.load.image(item.textureKey, item.image);
      }
    }
  }

  /** Shared creature and prop art used by world pens. */
  loadAssetLibrary() {
    for (const item of LIBRARY_LOAD_ITEMS) {
      this.load.image(item.textureKey, item.image);
    }
  }

  /** Before and after sprites for struggling story beds. */
  loadStorylineSituationAssets() {
    for (const item of SITUATION_LOAD_ITEMS) {
      this.load.image(item.textureKey, item.image);
    }
  }

  /** Animals (spritesheets), props, and ground tiles for unlock shop / next levels. */
  loadUnlockShopAssets() {
    for (const item of UNLOCK_ITEMS) {
      if (item.frameWidth && item.frameHeight) {
        this.load.spritesheet(item.textureKey, item.image, {
          frameWidth: item.frameWidth,
          frameHeight: item.frameHeight,
        });
      } else {
        this.load.image(item.textureKey, item.image);
      }
    }

    // Subset of summer ground tiles for next-level path decor near the gate
    const groundSubset = GROUND_TILE_KEYS.filter((_, i) =>
      [0, 4, 9, 18, 19, 24, 33, 43, 49, 55].includes(i),
    );
    for (const tile of groundSubset) {
      this.load.image(tile.key, tile.path);
    }
  }

  /** Looping music plus hurt, slash, item, and enemy-death cues. */
  loadAudio() {
    this.load.audio('music', [
      '/assets/sound/ancient_path.ogg',
      '/assets/sound/ancient_path.mp3',
    ]);
    this.load.audio('hurt', ['/assets/sound/hurt.ogg', '/assets/sound/hurt.mp3']);
    this.load.audio('slash', [
      '/assets/sound/slash.ogg',
      '/assets/sound/slash.mp3',
    ]);
    this.load.audio('item', ['/assets/sound/item.ogg', '/assets/sound/item.mp3']);
    this.load.audio('enemy-death', [
      '/assets/sound/enemy-death.ogg',
      '/assets/sound/enemy-death.mp3',
    ]);
  }

  /** Tiled farm map, collision art, and the hero and enemy atlas. */
  loadMaps() {
    this.load.image('tileset', '/assets/environment/tileset.png');
    this.load.image('objects', '/assets/environment/objects.png');
    this.load.image('collisions', '/assets/environment/collisions.png');
    this.load.tilemapTiledJSON('map', '/assets/maps/map.json');
    this.load.atlas(
      'atlas',
      '/assets/atlas/atlas.png',
      '/assets/atlas/atlas.json',
    );
    this.load.atlas(
      'atlas-props',
      '/assets/atlas/atlas-props.png',
      '/assets/atlas/atlas-props.json',
    );
  }
}

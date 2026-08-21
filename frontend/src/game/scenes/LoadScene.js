import Phaser from 'phaser';
import { LIBRARY_LOAD_ITEMS } from '../../data/assetLibrary.js';
import { SITUATION_LOAD_ITEMS } from '../../storyline/storylineSituations.js';
import { GROUND_TILE_KEYS, UNLOCK_ITEMS } from '../../data/unlockShop.js';
import { HARVEST_LOAD_ITEMS } from '../../data/harvestAssets.js';
import { FARM_LIFE_LOAD_ITEMS } from '../../data/farmLifeAssets.js';

export default class LoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadScene' });
  }

  preload() {
    this.add
      .text(400, 200, 'SCI_PATH', {
        fontFamily: 'Impact, Haettenschweiler, Arial Black, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#5aaf45',
        stroke: '#0a1208',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setShadow(3, 3, '#000000', 0, false, true);
    this.createLoadBar();
    this.loadImages();
    this.loadMaps();
    this.loadAudio();
  }

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

  createLoadBar() {
    const bar = this.add.graphics({ fillStyle: { color: 0xffffff } });

    this.load.on('progress', (percent) => {
      bar.clear();
      bar.fillStyle(0xffffff, 1);
      bar.fillRect(0, this.scale.height / 2, this.scale.width * percent, 50);
    });
  }

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
    this.loadAssetLibrary();
    this.loadStorylineSituationAssets();
  }

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

  loadFarmLifeAssets() {
    for (const item of FARM_LIFE_LOAD_ITEMS) {
      this.load.image(item.textureKey, item.image);
    }
  }

  loadAssetLibrary() {
    for (const item of LIBRARY_LOAD_ITEMS) {
      this.load.image(item.textureKey, item.image);
    }
  }

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

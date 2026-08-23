import Phaser from 'phaser';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';
import { bindPressEnter } from '../ui/bindPressEnter.js';

export default class GuideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GuideScene' });
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'guide' });

    this.soundtrack = this.game.registry.get('soundtrack');
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');
    this.emitMusicState();

    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.enterKey = this.input.keyboard.addKeys('enter, m');
    this._started = false;
    this.startFarm = () => {
      if (this._started || !this.sys?.isActive()) return;
      this._started = true;
      const levelId = this.game.registry.get('farmLevelId') || 1;
      this.scene.start('GameScene', {
        levelId,
        storyline: this.game.registry.get('storyline') || null,
      });
    };

    bindPressEnter(this, this.startFarm);
    ForestGameBridge.on(FARM_EVENTS.MENU_START, this.startFarm);
    ForestGameBridge.on(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.MENU_START, this.startFarm);
      ForestGameBridge.off(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);
    });
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.enterKey.m)) {
      this.toggleMusic();
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey.enter)) {
      this.startFarm();
    }
  }

  toggleMusic() {
    this.game.registry.set('musicEnabled', !this.isMusicEnabled());
    this.emitMusicState();
    if (!this.soundtrack) return;
    if (this.isMusicEnabled()) {
      if (!this.soundtrack.isPlaying) this.soundtrack.play();
    } else {
      this.soundtrack.stop();
    }
  }

  isMusicEnabled() {
    return this.game.registry.get('musicEnabled') !== false;
  }

  emitMusicState() {
    ForestGameBridge.emit(FARM_EVENTS.MUSIC_STATE, {
      enabled: this.isMusicEnabled(),
    });
  }
}

import Phaser from 'phaser';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';

/**
 * Cinematic backdrop only — React GameOverOverlay renders the UI.
 */
export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data = {}) {
    this.runData = data;
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'gameover' });

    const w = this.scale.width || 800;
    const h = this.scale.height || 600;

    if (this.textures.exists('title-bg')) {
      this.add.tileSprite(w / 2, h / 2, w, h, 'title-bg').setDepth(0);
    } else {
      this.cameras.main.setBackgroundColor('#0a1220');
    }

    this.add.rectangle(w / 2, h / 2, w, h, 0x060a14, 0.78).setDepth(1);

    ForestGameBridge.emit(FARM_EVENTS.GAME_OVER, {
      ...(this.runData || {}),
    });

    if (this.input?.keyboard) this.input.keyboard.enabled = true;

    this._returnToMenu = () => {
      if (!this.sys?.isActive()) return;
      ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'menu' });
      this.scene.start('MenuScene');
    };

    ForestGameBridge.on(FARM_EVENTS.RETURN_TO_MENU, this._returnToMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.RETURN_TO_MENU, this._returnToMenu);
    });
  }
}

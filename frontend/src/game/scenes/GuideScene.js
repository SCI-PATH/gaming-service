/**
 * Instruction backdrop. React still owns entering the farm. This
 * scene keeps the title art and the music toggle.
 */
import Phaser from 'phaser';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';

export default class GuideScene extends Phaser.Scene {
  /** Phaser key GuideScene. */
  constructor() {
    super({ key: 'GuideScene' });
  }

  /** Mark the guide phase and listen for the music toggle. */
  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'guide' });
    ForestGameBridge.emit(FARM_EVENTS.READY);

    this.soundtrack = this.game.registry.get('soundtrack');
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');
    this.emitMusicState();

    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.enterKey = this.input.keyboard.addKeys('m');

    // React GameLobbyOverlay owns Enter the Farm — avoid dual Phaser starts.
    ForestGameBridge.on(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);
    });
  }

  /** M toggles the soundtrack from the guide screen. */
  update() {
    if (Phaser.Input.Keyboard.JustDown(this.enterKey.m)) {
      this.toggleMusic();
    }
  }

  /** Flip the registry flag and start or stop the soundtrack. */
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

  /** Music stays on unless the registry explicitly turns it off. */
  isMusicEnabled() {
    return this.game.registry.get('musicEnabled') !== false;
  }

  /** Push the soundtrack flag to the React shell. */
  emitMusicState() {
    ForestGameBridge.emit(FARM_EVENTS.MUSIC_STATE, {
      enabled: this.isMusicEnabled(),
    });
  }
}

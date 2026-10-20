/**
 * Title backdrop. React owns Play. This scene reports that the farm
 * is ready and handles music plus the leaderboard key.
 */
import Phaser from 'phaser';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';

export default class MenuScene extends Phaser.Scene {
  /** Phaser key MenuScene. */
  constructor() {
    super({ key: 'MenuScene' });
  }

  /** Tell React the menu is up. Do not start the farm from Phaser Enter. */
  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'menu' });
    // Assets + menu are live — safe for React Continue (do not READY during LoadScene).
    ForestGameBridge.emit(FARM_EVENTS.READY);

    this.soundtrack = this.game.registry.get('soundtrack');
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');

    this.emitMusicState();

    this.menuKeys = this.input.keyboard.addKeys('enter, m, l');
    if (this.input?.keyboard) this.input.keyboard.enabled = true;

    // React GameLobbyOverlay owns Play/Continue. Do not start GameScene from
    // Phaser Enter / MENU_START — dual starts after Exit race and leave React
    // thinking the farm never opened.
    this.openLeaderboard = () => {
      if (!this.sys?.isActive()) return;
      ForestGameBridge.emit(FARM_EVENTS.LEADERBOARD_OPEN);
    };

    ForestGameBridge.on(FARM_EVENTS.MENU_LEADERBOARD, this.openLeaderboard);
    ForestGameBridge.on(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.MENU_LEADERBOARD, this.openLeaderboard);
      ForestGameBridge.off(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);
    });
  }

  /** M toggles music. L asks React to open the leaderboard. */
  update() {
    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.m)) {
      this.toggleMusic();
    }

    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.l)) {
      this.openLeaderboard();
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

import Phaser from 'phaser';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';
import { bindPressEnter } from '../ui/bindPressEnter.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'menu' });

    this.soundtrack = this.game.registry.get('soundtrack');
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');

    this.emitMusicState();

    this.menuKeys = this.input.keyboard.addKeys('enter, m, l');
    if (this.input?.keyboard) this.input.keyboard.enabled = true;

    this._started = false;
    this._canStartLobby = true;

    this.applyLobbyGate = (payload = {}) => {
      this._canStartLobby = payload.canStart !== false;
    };

    this.startGuide = () => {
      if (this._started || !this.sys?.isActive() || !this._canStartLobby) return;
      this._started = true;
      this.scene.start('GuideScene');
    };

    this.openLeaderboard = () => {
      if (!this.sys?.isActive()) return;
      ForestGameBridge.emit(FARM_EVENTS.LEADERBOARD_OPEN);
    };

    bindPressEnter(this, this.startGuide);

    ForestGameBridge.on(FARM_EVENTS.MENU_START, this.startGuide);
    ForestGameBridge.on(FARM_EVENTS.LOBBY_GATE, this.applyLobbyGate);
    ForestGameBridge.on(FARM_EVENTS.MENU_LEADERBOARD, this.openLeaderboard);
    ForestGameBridge.on(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ForestGameBridge.off(FARM_EVENTS.MENU_START, this.startGuide);
      ForestGameBridge.off(FARM_EVENTS.LOBBY_GATE, this.applyLobbyGate);
      ForestGameBridge.off(FARM_EVENTS.MENU_LEADERBOARD, this.openLeaderboard);
      ForestGameBridge.off(FARM_EVENTS.MENU_TOGGLE_MUSIC, this.toggleMusic, this);
    });
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.m)) {
      this.toggleMusic();
    }

    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.l)) {
      this.openLeaderboard();
    }

    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.enter)) {
      this.startGuide();
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

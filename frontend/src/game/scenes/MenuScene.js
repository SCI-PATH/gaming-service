import Phaser from 'phaser';
import { menuStyle, brandTitleStyle, brandTaglineStyle } from '../ui/textStyles';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';
import { bindPressEnter, makeEnterImageClickable } from '../ui/bindPressEnter.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    this.soundtrack = this.game.registry.get('soundtrack');

    this.add.tileSprite(400, 300, 800, 600, 'title-bg');

    this.add
      .text(400, 175, 'SCI_PATH', brandTitleStyle)
      .setOrigin(0.5)
      .setShadow(4, 4, '#000000', 0, false, true);

    this.add
      .text(
        400,
        255,
        'Solve science challenges, cultivate your farm,\nand earn passage into the deep forest!',
        brandTaglineStyle,
      )
      .setOrigin(0.5);

    const enterImg = this.add.image(400, 400, 'enter').setScale(3);

    this.muteIcon = this.add.image(40, 40, 'mute').setScale(0.1).setAlpha(0);
    this.syncMuteIcon();

    this.add.text(400, 500, "Press 'L' for the local leaderboard", menuStyle).setOrigin(0.5);
    this.add.text(400, 540, "Press 'M' to mute", menuStyle).setOrigin(0.5);

    this.menuKeys = this.input.keyboard.addKeys('enter, m, l');
    if (this.input?.keyboard) this.input.keyboard.enabled = true;

    this._started = false;
    this.startGuide = () => {
      if (this._started || !this.sys?.isActive()) return;
      this._started = true;
      this.scene.start('GuideScene');
    };
    bindPressEnter(this, this.startGuide);
    makeEnterImageClickable(this, enterImg, this.startGuide);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.m)) {
      this.toggleMusic();
    }

    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.l)) {
      this.scene.start('LeaderBoardScene');
    }

    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.enter)) {
      this.startGuide();
    }
  }

  toggleMusic() {
    this.game.registry.set('musicEnabled', !this.isMusicEnabled());
    this.syncMuteIcon();

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

  syncMuteIcon() {
    this.muteIcon.setAlpha(this.isMusicEnabled() ? 0 : 1);
  }
}

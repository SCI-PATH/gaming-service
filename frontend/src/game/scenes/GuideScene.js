import Phaser from 'phaser';
import { bodyStyle } from '../ui/textStyles';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';
import { bindPressEnter, makeEnterImageClickable } from '../ui/bindPressEnter.js';

export default class GuideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GuideScene' });
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');
    this.add.image(400, 225, 'instructions').setScale(3.5);
    const enterImg = this.add.image(400, 525, 'enter').setScale(3);

    this.add.text(
      400,
      415,
      'Plant quiz on gold beds · harvest onto your back.',
      bodyStyle,
    ).setOrigin(0.5);

    this.add.text(
      400,
      450,
      'Blue LOAD dock: load quiz unloads crops into the cart.',
      bodyStyle,
    ).setOrigin(0.5);

    this.enterKey = this.input.keyboard.addKeys('enter');
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
    makeEnterImageClickable(this, enterImg, this.startFarm);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.enterKey.enter)) {
      this.startFarm();
    }
  }
}

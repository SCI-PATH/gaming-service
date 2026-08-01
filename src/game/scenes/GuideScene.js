import Phaser from 'phaser';
import { bodyStyle } from '../ui/textStyles';
import { ForestGameBridge, FARM_EVENTS } from '../ForestGameBridge.js';

export default class GuideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GuideScene' });
  }

  create() {
    ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: false });
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');
    this.add.image(400, 225, 'instructions').setScale(3.5);
    this.add.image(400, 525, 'enter').setScale(3);

    this.add.text(
      400,
      415,
      'Stand on a marked PLANT bed — press E to quiz-plant.',
      bodyStyle,
    ).setOrigin(0.5);

    this.add.text(
      400,
      450,
      'Finish 20 questions · unharvested crops clear next level.',
      bodyStyle,
    ).setOrigin(0.5);

    this.enterKey = this.input.keyboard.addKeys('enter');
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.enterKey.enter)) {
      this.scene.start('GameScene');
    }
  }
}

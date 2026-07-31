import Phaser from 'phaser';
import { bodyStyle } from '../ui/textStyles';

export default class GuideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GuideScene' });
  }

  create() {
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');
    this.add.image(400, 225, 'instructions').setScale(3.5);
    this.add.image(400, 525, 'enter').setScale(3);

    this.add.text(
      400,
      415,
      'Press E on empty ground — answer a science quiz to plant.',
      bodyStyle,
    ).setOrigin(0.5);

    this.add.text(
      400,
      450,
      'Sell with Q — earn $100 to unlock the forest bridge.',
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

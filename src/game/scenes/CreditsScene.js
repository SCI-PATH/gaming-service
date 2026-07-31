import Phaser from 'phaser';
import {
  bodyStyle,
  brandTitleStyle,
  brandTaglineStyle,
  menuStyle,
} from '../ui/textStyles';

export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CreditsScene' });
  }

  create() {
    this.add.tileSprite(400, 300, 800, 600, 'title-bg');

    this.add
      .text(400, 160, 'SCI_PATH', brandTitleStyle)
      .setOrigin(0.5)
      .setShadow(4, 4, '#000000', 0, false, true);

    this.add
      .text(
        400,
        240,
        'Solve science challenges, cultivate your farm,\nand earn passage into the deep forest!',
        brandTaglineStyle,
      )
      .setOrigin(0.5);

    this.add.image(400, 525, 'enter').setScale(3);

    this.add.text(400, 360, 'Art pack by Ansimuz', bodyStyle).setOrigin(0.5);
    this.add.text(400, 395, 'Music by Pascal Belisle', bodyStyle).setOrigin(0.5);
    this.add
      .text(400, 450, 'Press ENTER to return', menuStyle)
      .setOrigin(0.5)
      .setFontSize(18);

    this.menuKeys = this.input.keyboard.addKeys('enter');
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.menuKeys.enter)) {
      this.scene.start('MenuScene');
    }
  }
}

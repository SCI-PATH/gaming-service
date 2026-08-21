import Phaser from 'phaser';
import PlayerModel from './PlayerModel';
import { IDLE_FRAMES, TILE_SIZE } from '../config/constants';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, tileX, tileY, texture, frame) {
    super(scene, tileX * TILE_SIZE, tileY * TILE_SIZE, texture, frame);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Must stay movable — immovable + tile overlap wedges the hero in place
    // after a scene restart (shop → next level).
    this.setImmovable(false);
    this.setCollideWorldBounds(true);
    this.body?.setAllowGravity?.(false);
    if (this.body) {
      this.body.moves = true;
      this.body.enable = true;
      this.body.pushable = true;
    }

    this.playerModel = new PlayerModel();
    this.walking = false;
    this.frameMap = { ...IDLE_FRAMES };
  }
}

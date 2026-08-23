import Phaser from 'phaser';
import { ENEMY_SPEED, TILE_SIZE } from '../config/constants';

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, tileX, tileY, verticalMove, atlasSprite, speed = ENEMY_SPEED) {
    super(scene, tileX * TILE_SIZE, tileY * TILE_SIZE, 'atlas', atlasSprite);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setImmovable(true);
    this.setCollideWorldBounds(true);
    this.body.bounce.set(1);

    this.verticalMove = Boolean(verticalMove);
    const moveSpeed = Number.isFinite(speed) ? speed : ENEMY_SPEED;
    this.basePatrolSpeed = moveSpeed;
    this.patrolVx = this.verticalMove ? 0 : moveSpeed;
    this.patrolVy = this.verticalMove ? moveSpeed : 0;
    if (this.verticalMove) {
      this.body.velocity.y = moveSpeed;
    } else {
      this.body.velocity.x = moveSpeed;
    }
  }

  /**
   * Dynamically change patrol speed (frustration / DDA pressure).
   * Preserves direction of current motion when possible.
   */
  setPatrolSpeed(speed) {
    const moveSpeed = Math.max(12, Number(speed) || ENEMY_SPEED);
    this.basePatrolSpeed = moveSpeed;
    if (!this.body) {
      this.patrolVx = this.verticalMove ? 0 : moveSpeed;
      this.patrolVy = this.verticalMove ? moveSpeed : 0;
      return;
    }

    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    if (this.verticalMove) {
      const dir = vy === 0 ? Math.sign(this.patrolVy) || 1 : Math.sign(vy) || 1;
      this.patrolVx = 0;
      this.patrolVy = dir * moveSpeed;
      if (this.body.moves) this.setVelocity(0, this.patrolVy);
    } else {
      const dir = vx === 0 ? Math.sign(this.patrolVx) || 1 : Math.sign(vx) || 1;
      this.patrolVx = dir * moveSpeed;
      this.patrolVy = 0;
      if (this.body.moves) this.setVelocity(this.patrolVx, 0);
    }
  }

  /** Restore bounce-patrol motion after a quiz / quest-scroll freeze. */
  resumePatrol(savedVx, savedVy) {
    if (!this.body) return;
    this.body.moves = true;
    const hasSaved =
      Number.isFinite(savedVx) &&
      Number.isFinite(savedVy) &&
      (savedVx !== 0 || savedVy !== 0);
    if (hasSaved) {
      this.setVelocity(savedVx, savedVy);
      return;
    }
    this.setVelocity(this.patrolVx || 0, this.patrolVy || 0);
  }
}

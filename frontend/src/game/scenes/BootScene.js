/**
 * First scene. Loads the logo, then hands off to LoadScene for the
 * farm atlas, maps, and audio.
 */
import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  /** Phaser key BootScene. */
  constructor() {
    super({ key: 'BootScene' });
  }

  /** Only the logo. The farm assets load in the next scene. */
  preload() {
    this.load.image('logo', '/assets/sprites/logo.png');
  }

  /** Boot does not show a menu. LoadScene owns the progress bar. */
  create() {
    this.scene.start('LoadScene');
  }
}

import Phaser from 'phaser';

/**
 * Event bus connecting React (Science Quiz) ↔ ForestRPG Phaser scenes.
 *
 * React → Phaser:
 *   ON_SCIENCE_CORRECT
 *   ON_SCIENCE_INCORRECT  { questionId, selectedIndex }
 *
 * Phaser → React:
 *   GAME_READY
 *   GAME_INTERACTION     { type, detail }
 */
export const EventBus = new Phaser.Events.EventEmitter();

export const SCIENCE_EVENTS = {
  CORRECT: 'ON_SCIENCE_CORRECT',
  INCORRECT: 'ON_SCIENCE_INCORRECT',
  READY: 'GAME_READY',
  INTERACTION: 'GAME_INTERACTION',
};

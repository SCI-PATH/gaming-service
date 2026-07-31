import Phaser from 'phaser';

/**
 * ForestGameBridge — React ↔ Phaser event bus for the
 * Science-Gated Farming & Forest Unlock loop.
 */
export const ForestGameBridge = new Phaser.Events.EventEmitter();

export const EventBus = ForestGameBridge;

export const FARM_EVENTS = {
  READY: 'GAME_READY',
  PLANT_CROP: 'PLANT_CROP',
  ATTEMPT_HARVEST: 'ATTEMPT_HARVEST',
  TRIGGER_SCIENCE_QUIZ: 'TRIGGER_SCIENCE_QUIZ',
  SCIENCE_QUIZ_SUCCESS: 'SCIENCE_QUIZ_SUCCESS',
  SCIENCE_QUIZ_FAILURE: 'SCIENCE_QUIZ_FAILURE',
  /** Spec aliases used by ScienceQuizModal */
  SCIENCE_CORRECT: 'SCIENCE_CORRECT',
  SCIENCE_INCORRECT: 'SCIENCE_INCORRECT',
  SELL_CROPS: 'SELL_CROPS',
  /** Spec channel for React Sell Inventory button + Q key */
  SELL_INVENTORY_ACTION: 'SELL_INVENTORY_ACTION',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  FARM_STATE: 'FARM_STATE',
  TARGET_REACHED: 'TARGET_REACHED',
  LEVEL_GOAL_REACHED: 'LEVEL_GOAL_REACHED',
  GOAL_COMPLETED: 'GOAL_COMPLETED',
  INTERACTION: 'GAME_INTERACTION',
};

export const SCIENCE_EVENTS = {
  CORRECT: FARM_EVENTS.SCIENCE_CORRECT,
  INCORRECT: FARM_EVENTS.SCIENCE_INCORRECT,
  READY: FARM_EVENTS.READY,
  INTERACTION: FARM_EVENTS.INTERACTION,
};

// Keep success/failure channels in sync with SCIENCE_CORRECT / INCORRECT
ForestGameBridge.on(FARM_EVENTS.SCIENCE_CORRECT, (payload) => {
  ForestGameBridge.emit(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, payload);
});
ForestGameBridge.on(FARM_EVENTS.SCIENCE_INCORRECT, (payload) => {
  ForestGameBridge.emit(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, payload);
});

// Legacy SELL_CROPS → canonical sell action (scene listens only to SELL_INVENTORY_ACTION)
ForestGameBridge.on(FARM_EVENTS.SELL_CROPS, (payload) => {
  ForestGameBridge.emit(FARM_EVENTS.SELL_INVENTORY_ACTION, payload);
});

// Goal aliases → React TARGET_REACHED HUD
ForestGameBridge.on(FARM_EVENTS.LEVEL_GOAL_REACHED, (payload) => {
  ForestGameBridge.emit(FARM_EVENTS.TARGET_REACHED, payload);
});
ForestGameBridge.on(FARM_EVENTS.GOAL_COMPLETED, (payload) => {
  ForestGameBridge.emit(FARM_EVENTS.TARGET_REACHED, payload);
});

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
  /** Live player pin for the farm map HUD (fractional tile coords) */
  PLAYER_MAP_POS: 'PLAYER_MAP_POS',
  /** true while GameScene (farm) is active — hide map on menu/opening */
  FARM_SCENE_ACTIVE: 'FARM_SCENE_ACTIVE',
  /** Phaser scene phase for React lobby overlays */
  GAME_PHASE: 'GAME_PHASE',
  /** Phaser → React: run ended with stats */
  GAME_OVER: 'GAME_OVER',
  /** React → Phaser: return to title / menu */
  RETURN_TO_MENU: 'RETURN_TO_MENU',
  /** React → Phaser menu / lobby actions */
  MENU_START: 'MENU_START',
  /** React → Phaser: whether menu can advance (aptitude complete) */
  LOBBY_GATE: 'LOBBY_GATE',
  MENU_LEADERBOARD: 'MENU_LEADERBOARD',
  /** React opens global leaderboard modal */
  LEADERBOARD_OPEN: 'LEADERBOARD_OPEN',
  MENU_TOGGLE_MUSIC: 'MENU_TOGGLE_MUSIC',
  /** Phaser → React soundtrack state */
  MUSIC_STATE: 'MUSIC_STATE',
  TARGET_REACHED: 'TARGET_REACHED',
  LEVEL_GOAL_REACHED: 'LEVEL_GOAL_REACHED',
  GOAL_COMPLETED: 'GOAL_COMPLETED',
  INTERACTION: 'GAME_INTERACTION',
  /** Spend cash on unlock shop item (React → Phaser) */
  PURCHASE_UNLOCK: 'PURCHASE_UNLOCK',
  /** Lock farm input while unlock shop is open */
  UNLOCK_SHOP_OPEN: 'UNLOCK_SHOP_OPEN',
  UNLOCK_SHOP_CLOSE: 'UNLOCK_SHOP_CLOSE',
  /** Physical farm shop unload panel (walk to shop + E/Q) */
  OPEN_FARM_CUSTOMER_SHOP: 'OPEN_FARM_CUSTOMER_SHOP',
  CLOSE_FARM_CUSTOMER_SHOP: 'CLOSE_FARM_CUSTOMER_SHOP',
  FARM_CUSTOMER_SHOP_RESULT: 'FARM_CUSTOMER_SHOP_RESULT',
  /** React → Phaser: unload cart item(s) into shop stock */
  FARM_SHOP_UNLOAD: 'FARM_SHOP_UNLOAD',
  /** Phaser → React: live shop stock / queue snapshot */
  FARM_SHOP_STATE: 'FARM_SHOP_STATE',
  /** Phaser → React: shop telemetry events */
  FARM_SHOP_TELEMETRY: 'FARM_SHOP_TELEMETRY',
  /** Start / restart GameScene at a farm level id */
  START_FARM_LEVEL: 'START_FARM_LEVEL',
  /** React → Phaser: remember next playable level before the lobby starts */
  SET_FARM_RESUME: 'SET_FARM_RESUME',
  /** Active unlock-item challenges for this level */
  CHALLENGES_STATE: 'CHALLENGES_STATE',
  /** Begin an unlock-item challenge step (React → Phaser or reverse) */
  START_ITEM_CHALLENGE: 'START_ITEM_CHALLENGE',
  ITEM_CHALLENGE_RESULT: 'ITEM_CHALLENGE_RESULT',
  /** Lock farm keyboard while React overlays (avatar, typed inputs) are focused.
   * GameScene also pauses physics + music while locked. */
  UI_INPUT_LOCK: 'UI_INPUT_LOCK',
  SYNC_STUDENT_STATE: 'SYNC_STUDENT_STATE',
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

/**
 * Shared canvas size, speeds, and combat limits for the farm scene.
 */
/** Width and height of the Phaser canvas inside React. */
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

/** Hero, arrow, and default patrol speeds in pixels per second. */
export const PLAYER_SPEED = 110;
export const ARROW_SPEED = 270;
export const ENEMY_SPEED = 60;

/** Tiled map cell size in pixels. */
export const TILE_SIZE = 16;
/** Follow-cam zoom for the farm. */
export const FARM_CAMERA_ZOOM = 2.15;
/** Kill count still tracked from the forest bow. Wrong answers end the run. */
export const KILLS_TO_OPEN_EXIT = 6;
/** How long a second enemy bump is ignored. */
export const HURT_INVULN_MS = 2000;
/** Seconds removed before the old time-based score. */
export const SCORE_TIME_OFFSET_SEC = 5;

/** How many local scores the leaderboard list shows. */
export const LEADERBOARD_DISPLAY_COUNT = 10;

/** Wrong science answers before the run ends (enemy hits no longer end the run). */
export const MAX_WRONG_ANSWERS = 6;

/** Hearts on the leftover combat model. */
export const PLAYER_MAX_HEALTH = 3;

/** Facing stored on the hero and used to aim arrows. */
export const DIRECTIONS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
});

/** Atlas frame shown when the hero stops. */
export const IDLE_FRAMES = Object.freeze({
  [DIRECTIONS.UP]: 'idle/hero-idle-back/hero-idle-back',
  [DIRECTIONS.DOWN]: 'idle/hero-idle-front/hero-idle-front',
  [DIRECTIONS.LEFT]: 'idle/hero-idle-side/hero-idle-side',
  [DIRECTIONS.RIGHT]: 'idle/hero-idle-side/hero-idle-side',
});

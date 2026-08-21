import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createForestGame } from '../game/config/gameConfig.js';
import { PLAYER_SPEED, DIRECTIONS } from '../game/config/constants.js';
import {
  ForestGameBridge,
  FARM_EVENTS,
} from './ForestGameBridge.js';

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    if (
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset'
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function overlayBlocksWalk() {
  return Boolean(
    document.querySelector('.science-quiz-overlay') ||
      document.querySelector('.quest-scroll-overlay') ||
      document.querySelector('.unlock-shop-overlay') ||
      document.querySelector('.motivation-overlay'),
  );
}

/**
 * React host for ForestRPG (Phaser 3) with farm-loop bridge hooks.
 */
export default function ForestRPGCanvas({
  onReady,
  onFarmState,
  onPlayerMapPos,
  onFarmSceneActive,
  onTriggerQuiz,
  onTargetReached,
  onInteraction,
  onChallengesState,
  storyline = null,
}) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const cbs = useRef({});
  const storylineRef = useRef(storyline);
  const [ready, setReady] = useState(false);
  storylineRef.current = storyline;

  cbs.current = {
    onReady,
    onFarmState,
    onPlayerMapPos,
    onFarmSceneActive,
    onTriggerQuiz,
    onTargetReached,
    onInteraction,
    onChallengesState,
  };

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent || gameRef.current) return undefined;

    parent.innerHTML = '';
    const game = createForestGame(parent);
    gameRef.current = game;
    game.registry.set('storyline', storylineRef.current || null);

    const handleReady = () => {
      setReady(true);
      cbs.current.onReady?.();
    };
    const handleFarmState = (state) => cbs.current.onFarmState?.(state);
    const handleInventory = (state) => cbs.current.onFarmState?.(state);
    const handlePlayerMapPos = (payload) =>
      cbs.current.onPlayerMapPos?.(payload);
    const handleFarmSceneActive = (payload) =>
      cbs.current.onFarmSceneActive?.(payload);
    const handleQuiz = (payload) => cbs.current.onTriggerQuiz?.(payload);
    const handleTarget = (payload) => cbs.current.onTargetReached?.(payload);
    const handleInteraction = (detail) => cbs.current.onInteraction?.(detail);
    const handleChallenges = (payload) =>
      cbs.current.onChallengesState?.(payload);

    /** Next farm level keeps this GameScene alive — restarting it kills arrows. */
    const handleStartFarmLevel = (payload = {}) => {
      const levelId = Math.max(1, Number(payload.levelId) || 1);
      const nextStoryline = payload.storyline ?? storylineRef.current ?? null;
      game.registry.set('farmLevelId', levelId);
      game.registry.set('storyline', nextStoryline);
      const startData = {
        levelId,
        startingMoney: Number(payload.startingMoney) || 0,
        storyline: nextStoryline,
      };
      ['GameOverScene', 'LeaderBoardScene', 'MenuScene', 'GuideScene'].forEach(
        (key) => {
          try {
            if (game.scene.isActive(key) || game.scene.isPaused(key)) {
              game.scene.stop(key);
            }
          } catch {
            /* ignore */
          }
        },
      );
      ForestGameBridge.emit(FARM_EVENTS.UI_INPUT_LOCK, { locked: false });
      const gameScene = game.scene.getScene('GameScene');
      const canSoftReset =
        gameScene &&
        typeof gameScene.beginNextLevel === 'function' &&
        gameScene.player &&
        (game.scene.isActive('GameScene') || game.scene.isPaused('GameScene'));
      if (canSoftReset) {
        try {
          if (game.scene.isPaused('GameScene')) game.scene.resume('GameScene');
          gameScene.beginNextLevel(startData);
          return;
        } catch (err) {
          console.warn('beginNextLevel failed, falling back to start', err);
        }
      }
      game.scene.start('GameScene', startData);
    };

    const farmMove = { up: false, down: false, left: false, right: false };
    const setFarmMove = (code, isDown) => {
      if (code === 'ArrowUp' || code === 'KeyW') farmMove.up = isDown;
      else if (code === 'ArrowDown' || code === 'KeyS') farmMove.down = isDown;
      else if (code === 'ArrowLeft' || code === 'KeyA') farmMove.left = isDown;
      else if (code === 'ArrowRight' || code === 'KeyD') farmMove.right = isDown;
    };
    const onFarmKeyDown = (event) => {
      const { code } = event;
      const isMove =
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD';
      if (!isMove) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
        return;
      }
      const scene = game.scene.getScene('GameScene');
      if (
        overlayBlocksWalk() ||
        scene?.pendingQuizMode ||
        scene?.farmInputLocked
      ) {
        return;
      }
      event.preventDefault();
      setFarmMove(code, true);
    };
    const onFarmKeyUp = (event) => {
      setFarmMove(event.code, false);
    };
    const applyFarmMove = () => {
      const scene = game.scene.getScene('GameScene');
      if (!scene?.sys?.isActive?.() || !scene.player) return;
      if (
        overlayBlocksWalk() ||
        scene.pendingQuizMode ||
        scene.farmInputLocked
      ) {
        scene.player.setVelocity?.(0);
        return;
      }
      try {
        scene.physics?.world?.resume?.();
      } catch {
        /* ignore */
      }
      if (scene.input?.keyboard) scene.input.keyboard.enabled = true;
      if (scene.player.body) {
        scene.player.body.enable = true;
        scene.player.body.moves = true;
        scene.player.body.pushable = true;
      }
      scene.player.setImmovable?.(false);
      if (scene.moveKeys) {
        scene.moveKeys.up = farmMove.up;
        scene.moveKeys.down = farmMove.down;
        scene.moveKeys.left = farmMove.left;
        scene.moveKeys.right = farmMove.right;
      }
      const moving =
        farmMove.up || farmMove.down || farmMove.left || farmMove.right;
      if (!moving) return;
      scene.farmInputLocked = false;
      scene.uiInputLocked = false;
      if (typeof scene.movePlayer === 'function') {
        if (farmMove.right) {
          scene.movePlayer(PLAYER_SPEED, 0, DIRECTIONS.RIGHT, 'walk-side', false);
        } else if (farmMove.left) {
          scene.movePlayer(-PLAYER_SPEED, 0, DIRECTIONS.LEFT, 'walk-side', true);
        } else if (farmMove.up) {
          scene.movePlayer(0, -PLAYER_SPEED, DIRECTIONS.UP, 'walk-back', false);
        } else if (farmMove.down) {
          scene.movePlayer(0, PLAYER_SPEED, DIRECTIONS.DOWN, 'walk-front', false);
        }
      } else {
        scene.player.setVelocity(
          farmMove.right ? PLAYER_SPEED : farmMove.left ? -PLAYER_SPEED : 0,
          farmMove.down ? PLAYER_SPEED : farmMove.up ? -PLAYER_SPEED : 0,
        );
      }
    };

    window.addEventListener('keydown', onFarmKeyDown, true);
    window.addEventListener('keyup', onFarmKeyUp, true);
    game.events.on(Phaser.Core.Events.POST_STEP, applyFarmMove);

    ForestGameBridge.on(FARM_EVENTS.READY, handleReady);
    ForestGameBridge.on(FARM_EVENTS.FARM_STATE, handleFarmState);
    ForestGameBridge.on(FARM_EVENTS.INVENTORY_UPDATED, handleInventory);
    ForestGameBridge.on(FARM_EVENTS.PLAYER_MAP_POS, handlePlayerMapPos);
    ForestGameBridge.on(FARM_EVENTS.FARM_SCENE_ACTIVE, handleFarmSceneActive);
    ForestGameBridge.on(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, handleQuiz);
    ForestGameBridge.on(FARM_EVENTS.TARGET_REACHED, handleTarget);
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, handleInteraction);
    ForestGameBridge.on(FARM_EVENTS.CHALLENGES_STATE, handleChallenges);
    ForestGameBridge.on(FARM_EVENTS.START_FARM_LEVEL, handleStartFarmLevel);

    // Focus canvas on click so Phaser keys work after React UI usage
    const focusCanvas = () => {
      const canvas = parent.querySelector('canvas');
      if (canvas) {
        canvas.setAttribute('tabindex', '0');
        canvas.focus({ preventScroll: true });
      }
    };
    parent.addEventListener('pointerdown', focusCanvas);

    const t = window.setTimeout(() => {
      ForestGameBridge.emit(FARM_EVENTS.READY);
      focusCanvas();
    }, 300);

    return () => {
      window.clearTimeout(t);
      parent.removeEventListener('pointerdown', focusCanvas);
      window.removeEventListener('keydown', onFarmKeyDown, true);
      window.removeEventListener('keyup', onFarmKeyUp, true);
      game.events.off(Phaser.Core.Events.POST_STEP, applyFarmMove);
      ForestGameBridge.off(FARM_EVENTS.READY, handleReady);
      ForestGameBridge.off(FARM_EVENTS.FARM_STATE, handleFarmState);
      ForestGameBridge.off(FARM_EVENTS.INVENTORY_UPDATED, handleInventory);
      ForestGameBridge.off(FARM_EVENTS.PLAYER_MAP_POS, handlePlayerMapPos);
      ForestGameBridge.off(FARM_EVENTS.FARM_SCENE_ACTIVE, handleFarmSceneActive);
      ForestGameBridge.off(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, handleQuiz);
      ForestGameBridge.off(FARM_EVENTS.TARGET_REACHED, handleTarget);
      ForestGameBridge.off(FARM_EVENTS.INTERACTION, handleInteraction);
      ForestGameBridge.off(FARM_EVENTS.CHALLENGES_STATE, handleChallenges);
      ForestGameBridge.off(FARM_EVENTS.START_FARM_LEVEL, handleStartFarmLevel);
      game.destroy(true);
      gameRef.current = null;
      parent.innerHTML = '';
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('storyline', storyline || null);
  }, [storyline]);

  return (
    <div className="forest-stage">
      <div ref={hostRef} className="phaser-host" id="forest-game-root" />
      {!ready && <div className="forest-loading">Loading SCI_PATH…</div>}
    </div>
  );
}

export function emitPlantCrop() {
  ForestGameBridge.emit(FARM_EVENTS.PLANT_CROP);
}

export function emitScienceQuizSuccess(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, payload);
}

export function emitScienceQuizFailure(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SCIENCE_QUIZ_FAILURE, payload);
}

/** Sell harvested inventory — preferred React button channel. */
export function emitSellCrops() {
  ForestGameBridge.emit(FARM_EVENTS.SELL_INVENTORY_ACTION);
}

/** Buy an unlock-shop item (sheep, well, …). */
export function emitPurchaseUnlock(payload) {
  ForestGameBridge.emit(FARM_EVENTS.PURCHASE_UNLOCK, payload);
}

export function emitUnlockShopOpen() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_OPEN);
}

export function emitUnlockShopClose() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_CLOSE);
}

/** Lock Phaser keyboard + pause farm physics/music while React overlays are open. */
export function emitUiInputLock(locked, options = {}) {
  ForestGameBridge.emit(FARM_EVENTS.UI_INPUT_LOCK, {
    locked: Boolean(locked),
    freezeCombat: Boolean(options?.freezeCombat),
  });
}

/** Advance / restart the farm at a given level id. */
export function emitStartFarmLevel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_FARM_LEVEL, payload);
}

/** Start an unlock-item challenge step from the React panel. */
export function emitStartItemChallenge(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_ITEM_CHALLENGE, payload);
}

export function emitSyncStudentState(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SYNC_STUDENT_STATE, payload);
}

/** Jump the farm to a vegetable or animal challenge (test catalog). */
export function emitSetTestChallenge(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SET_TEST_CHALLENGE, payload);
}

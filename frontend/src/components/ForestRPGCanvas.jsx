import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createForestGame } from '../game/config/gameConfig.js';
import { PLAYER_SPEED, DIRECTIONS } from '../game/config/constants.js';
import {
  ForestGameBridge,
  FARM_EVENTS,
} from './ForestGameBridge.js';

/** Typed quiz fields must receive letters. Movement keys stay with the farm. */
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

/** Same overlays App locks. Walking is ignored while any of them is in the DOM. */
function overlayBlocksWalk() {
  return Boolean(
    document.querySelector('.science-quiz-overlay') ||
      document.querySelector('.quest-scroll-overlay') ||
      document.querySelector('.unlock-shop-overlay') ||
      document.querySelector('.motivation-overlay') ||
      document.querySelector('.game-over-overlay') ||
      document.querySelector('.farm-pause-overlay') ||
      document.querySelector('.avatar-assistant-overlay'),
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
  resumeLevelId = 1,
  startingMoney = 0,
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

  /** Create the Phaser game once and fan its events out to App. */
  useEffect(() => {
    const parent = hostRef.current;
    if (!parent || gameRef.current) return undefined;

    parent.innerHTML = '';
    const game = createForestGame(parent);
    gameRef.current = game;
    game.registry.set('storyline', storylineRef.current || null);
    game.registry.set('farmLevelId', Math.max(1, Number(resumeLevelId) || 1));
    game.registry.set(
      'farmStartingMoney',
      Math.max(0, Number(startingMoney) || 0),
    );

    let phaserReady = false;
    const handleReady = () => {
      phaserReady = true;
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
      const startData = {
        levelId,
        startingMoney: Number(payload.startingMoney) || 0,
        storyline: nextStoryline,
        resume: payload.resume === true,
      };
      const fromLobby = payload.fromLobby === true || payload.resume === true;

      const liveGame = () => {
        const g = gameRef.current;
        if (!g || g.destroyed) return null;
        return g;
      };

      const stopScene = (g, key) => {
        try {
          if (
            g.scene.isActive(key) ||
            g.scene.isPaused(key) ||
            g.scene.isSleeping?.(key)
          ) {
            g.scene.stop(key);
            return true;
          }
        } catch {
          /* ignore */
        }
        return false;
      };

      const markFarmOpen = () => {
        ForestGameBridge.emit(FARM_EVENTS.FARM_SCENE_ACTIVE, { active: true });
        ForestGameBridge.emit(FARM_EVENTS.GAME_PHASE, { phase: 'farm' });
      };

      const failStart = (err) => {
        if (err) console.error('Failed to start GameScene', err);
        ForestGameBridge.emit(FARM_EVENTS.INTERACTION, {
          type: 'farm_start_failed',
          message: 'Could not open the farm. Try Continue again.',
        });
      };

      /**
       * Lobby Continue after logout must wait for Load/Menu — starting GameScene
       * during Boot/Load throws and showed "Could not open the farm".
       */
      const hardStart = (attempt = 0) => {
        const g = liveGame();
        if (!g) {
          if (attempt < 5) {
            window.setTimeout(() => hardStart(attempt + 1), 120 * (attempt + 1));
            return;
          }
          failStart();
          return;
        }

        g.registry.set('farmLevelId', levelId);
        g.registry.set(
          'farmStartingMoney',
          Math.max(0, Number(payload.startingMoney) || 0),
        );
        g.registry.set('storyline', nextStoryline);
        ForestGameBridge.emit(FARM_EVENTS.UI_INPUT_LOCK, { locked: false });

        // Still booting assets — wait, do not fail yet
        if (g.scene.isActive('BootScene') || g.scene.isActive('LoadScene')) {
          if (attempt < 20) {
            window.setTimeout(() => hardStart(attempt + 1), 200);
            return;
          }
          failStart();
          return;
        }

        stopScene(g, 'GameOverScene');
        stopScene(g, 'MenuScene');
        stopScene(g, 'GuideScene');

        const launch = () => {
          const g2 = liveGame();
          if (!g2) {
            if (attempt < 5) {
              window.setTimeout(() => hardStart(attempt + 1), 150);
              return;
            }
            failStart();
            return;
          }
          try {
            if (g2.scene.isActive('GameScene') && !startData.resume && !fromLobby) {
              markFarmOpen();
              return;
            }
            stopScene(g2, 'GameScene');
            g2.scene.start('GameScene', startData);
            // Backup signal if create is slow; create also emits active:true
            window.setTimeout(() => {
              const g3 = liveGame();
              if (!g3) return;
              if (g3.scene.isActive('GameScene')) {
                markFarmOpen();
                return;
              }
              if (attempt < 4) {
                hardStart(attempt + 1);
                return;
              }
              failStart();
            }, 280);
          } catch (err) {
            if (attempt < 4) {
              window.setTimeout(() => hardStart(attempt + 1), 200);
              return;
            }
            failStart(err);
          }
        };

        window.setTimeout(launch, attempt === 0 ? 80 : 40);
      };

      const gNow = liveGame() || game;
      let leftMenu = false;
      ['GameOverScene', 'MenuScene', 'GuideScene'].forEach((key) => {
        if (stopScene(gNow, key)) leftMenu = true;
      });

      // Lobby Continue / resume must always hard-start
      if (fromLobby || leftMenu || startData.resume) {
        hardStart(0);
        return;
      }

      const gameScene = gNow.scene.getScene('GameScene');
      const canSoftReset =
        gameScene &&
        typeof gameScene.beginNextLevel === 'function' &&
        gameScene.player &&
        (gNow.scene.isActive('GameScene') || gNow.scene.isPaused('GameScene'));
      if (canSoftReset) {
        try {
          if (gNow.scene.isPaused('GameScene')) gNow.scene.resume('GameScene');
          gameScene.beginNextLevel(startData);
          markFarmOpen();
          return;
        } catch (err) {
          console.warn('beginNextLevel failed, falling back to start', err);
        }
      }
      hardStart(0);
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
      if (scene?.shouldPassKeysToDom?.(event)) return;
      if (
        overlayBlocksWalk() ||
        scene?.pendingQuizMode ||
        scene?.isScienceQuizOpen?.() ||
        scene?.isAvatarOpen?.()
      ) {
        return;
      }
      // Sticky farmInputLocked alone must not swallow WASD after overlays close
      event.preventDefault();
      setFarmMove(code, true);
    };
    const onFarmKeyUp = (event) => {
      setFarmMove(event.code, false);
    };
    const applyFarmMove = () => {
      const scene = game.scene.getScene('GameScene');
      if (!scene?.sys?.isActive?.() || !scene.player) return;
      // Let GameScene release orphaned locks before we decide to zero velocity
      scene.releaseStaleFarmLocks?.();
      const blocked =
        overlayBlocksWalk() ||
        Boolean(scene.pendingQuizMode) ||
        Boolean(scene.isScienceQuizOpen?.()) ||
        Boolean(scene.isAvatarOpen?.()) ||
        Boolean(scene.isQuestScrollOpen?.()) ||
        Boolean(scene.isUnlockShopOpen?.()) ||
        Boolean(scene.isMotivationOpen?.()) ||
        Boolean(scene.isPauseOpen?.());
      if (blocked) {
        scene.player.setVelocity?.(0);
        return;
      }
      // Sticky farmInputLocked with no overlay — clear so WASD recovers without refresh
      if (scene.farmInputLocked) {
        scene.farmInputLocked = false;
        scene.uiInputLocked = false;
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

    const handleSetFarmResume = (payload = {}) => {
      const levelId = Math.max(1, Number(payload.levelId) || 1);
      game.registry.set('farmLevelId', levelId);
      if (payload.startingMoney != null) {
        game.registry.set(
          'farmStartingMoney',
          Math.max(0, Number(payload.startingMoney) || 0),
        );
      }
    };

    const handleReturnToMenu = () => {
      if (!gameRef.current) return;
      const game = gameRef.current;
      try {
        if (game.scene.isActive('GameScene')) game.scene.stop('GameScene');
      } catch {
        /* ignore */
      }
      ForestGameBridge.emit(FARM_EVENTS.UI_INPUT_LOCK, { locked: false });
      game.scene.start('MenuScene');
    };

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
    ForestGameBridge.on(FARM_EVENTS.SET_FARM_RESUME, handleSetFarmResume);
    ForestGameBridge.on(FARM_EVENTS.RETURN_TO_MENU, handleReturnToMenu);

    // Focus canvas on click so Phaser keys work after React UI usage
    const focusCanvas = () => {
      if (overlayBlocksWalk() || isTypingTarget(document.activeElement)) return;
      const canvas = parent.querySelector('canvas');
      if (canvas) {
        canvas.setAttribute('tabindex', '0');
        canvas.focus({ preventScroll: true });
      }
    };
    parent.addEventListener('pointerdown', focusCanvas);

    // Do NOT emit READY here — LoadScene may still be running. MenuScene/GuideScene
    // emit READY when the lobby is actually safe to Continue. Fallback only if stuck.
    const readyFallback = window.setTimeout(() => {
      if (gameRef.current && !phaserReady) {
        ForestGameBridge.emit(FARM_EVENTS.READY);
        focusCanvas();
      }
    }, 12000);

    return () => {
      window.clearTimeout(readyFallback);
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
      ForestGameBridge.off(FARM_EVENTS.SET_FARM_RESUME, handleSetFarmResume);
      ForestGameBridge.off(FARM_EVENTS.RETURN_TO_MENU, handleReturnToMenu);
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

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('farmLevelId', Math.max(1, Number(resumeLevelId) || 1));
    game.registry.set(
      'farmStartingMoney',
      Math.max(0, Number(startingMoney) || 0),
    );
  }, [resumeLevelId, startingMoney, ready]);

  return (
    <div className="forest-stage">
      <div ref={hostRef} className="phaser-host" id="forest-game-root" />
      {!ready && <div className="forest-loading forest-loading--minimal" aria-hidden />}
    </div>
  );
}

/** App and the quiz emit farm actions through the shared bridge. */
export function emitPlantCrop() {
  ForestGameBridge.emit(FARM_EVENTS.PLANT_CROP);
}

/** Forward a correct quiz result. The quiz modal emits SCIENCE_CORRECT, which the bridge aliases here. */
export function emitScienceQuizSuccess(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SCIENCE_QUIZ_SUCCESS, payload);
}

/** Tell Phaser the science action failed so the farm can react. */
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

/** Pause the farm scene while the unlock shop is open. */
export function emitUnlockShopOpen() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_OPEN);
}

/** Resume the farm after the unlock shop closes. */
export function emitUnlockShopClose() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_CLOSE);
}

/** Customer-shop result from the React stall panel back into Phaser. */
export function emitFarmCustomerShopResult(payload) {
  ForestGameBridge.emit(FARM_EVENTS.FARM_CUSTOMER_SHOP_RESULT, payload);
}

/** Ask Phaser to unload carried harvest at the stall. Customer sales run in the farm scene. */
export function emitFarmShopUnload(payload) {
  ForestGameBridge.emit(FARM_EVENTS.FARM_SHOP_UNLOAD, payload);
}

/** Lock Phaser keyboard + pause farm physics/music while React overlays are open. */
export function emitUiInputLock(locked, options = {}) {
  ForestGameBridge.emit(FARM_EVENTS.UI_INPUT_LOCK, {
    locked: Boolean(locked),
    freezeCombat: Boolean(options?.freezeCombat),
  });
}

/** Remember next playable level on the Phaser registry (lobby → farm). */
export function emitSetFarmResume(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SET_FARM_RESUME, payload);
}

/** Advance / restart the farm at a given level id. */
export function emitStartFarmLevel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_FARM_LEVEL, payload);
}

/** Start an unlock-item challenge step from the React panel. */
export function emitStartItemChallenge(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_ITEM_CHALLENGE, payload);
}

/** Push the signed-in student's frustration into the running farm scene. */
export function emitSyncStudentState(payload) {
  ForestGameBridge.emit(FARM_EVENTS.SYNC_STUDENT_STATE, payload);
}

/** Pause leave and game-over continue: back to the menu without destroying the game. */
export function emitReturnToMenu() {
  ForestGameBridge.emit(FARM_EVENTS.RETURN_TO_MENU);
}

/** Ask Phaser to write the current run before pause, Sage, or logout. */
export function emitSaveFarmRun() {
  ForestGameBridge.emit(FARM_EVENTS.SAVE_FARM_RUN);
}

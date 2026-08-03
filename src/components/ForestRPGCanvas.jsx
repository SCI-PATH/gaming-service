import { useEffect, useRef, useState } from 'react';
import { createForestGame } from '../game/config/gameConfig.js';
import {
  ForestGameBridge,
  FARM_EVENTS,
} from './ForestGameBridge.js';

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
  onOpenHouseInterior,
  onOpenEggCollect,
  onOpenCalfFeed,
}) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const cbs = useRef({});
  const [ready, setReady] = useState(false);

  cbs.current = {
    onReady,
    onFarmState,
    onPlayerMapPos,
    onFarmSceneActive,
    onTriggerQuiz,
    onTargetReached,
    onInteraction,
    onChallengesState,
    onOpenHouseInterior,
    onOpenEggCollect,
    onOpenCalfFeed,
  };

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent || gameRef.current) return undefined;

    parent.innerHTML = '';
    const game = createForestGame(parent);
    gameRef.current = game;

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
    const handleHouseInterior = (payload) =>
      cbs.current.onOpenHouseInterior?.(payload);
    const handleEggCollect = (payload) =>
      cbs.current.onOpenEggCollect?.(payload);
    const handleCalfFeed = (payload) =>
      cbs.current.onOpenCalfFeed?.(payload);

    /** Survive GameScene listener gaps during shop → next level. */
    const handleStartFarmLevel = (payload = {}) => {
      const levelId = Math.max(1, Number(payload.levelId) || 1);
      game.registry.set('farmLevelId', levelId);
      const scenePlugin = game.scene;
      if (scenePlugin.isActive('GameScene') || scenePlugin.isPaused('GameScene')) {
        const scene = scenePlugin.getScene('GameScene');
        scene?.scene.restart({
          levelId,
          startingMoney: Number(payload.startingMoney) || 0,
          devTest: payload.devTest || null,
        });
      } else {
        scenePlugin.start('GameScene', {
          levelId,
          startingMoney: Number(payload.startingMoney) || 0,
          devTest: payload.devTest || null,
        });
      }
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
    ForestGameBridge.on(FARM_EVENTS.OPEN_HOUSE_INTERIOR, handleHouseInterior);
    ForestGameBridge.on(FARM_EVENTS.OPEN_EGG_COLLECT, handleEggCollect);
    ForestGameBridge.on(FARM_EVENTS.OPEN_CALF_FEED, handleCalfFeed);
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
      ForestGameBridge.off(FARM_EVENTS.READY, handleReady);
      ForestGameBridge.off(FARM_EVENTS.FARM_STATE, handleFarmState);
      ForestGameBridge.off(FARM_EVENTS.INVENTORY_UPDATED, handleInventory);
      ForestGameBridge.off(FARM_EVENTS.PLAYER_MAP_POS, handlePlayerMapPos);
      ForestGameBridge.off(FARM_EVENTS.FARM_SCENE_ACTIVE, handleFarmSceneActive);
      ForestGameBridge.off(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, handleQuiz);
      ForestGameBridge.off(FARM_EVENTS.TARGET_REACHED, handleTarget);
      ForestGameBridge.off(FARM_EVENTS.INTERACTION, handleInteraction);
      ForestGameBridge.off(FARM_EVENTS.CHALLENGES_STATE, handleChallenges);
      ForestGameBridge.off(FARM_EVENTS.OPEN_HOUSE_INTERIOR, handleHouseInterior);
      ForestGameBridge.off(FARM_EVENTS.OPEN_EGG_COLLECT, handleEggCollect);
      ForestGameBridge.off(FARM_EVENTS.OPEN_CALF_FEED, handleCalfFeed);
      ForestGameBridge.off(FARM_EVENTS.START_FARM_LEVEL, handleStartFarmLevel);
      game.destroy(true);
      gameRef.current = null;
      parent.innerHTML = '';
      setReady(false);
    };
  }, []);

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

/** Buy an unlock-shop item (sheep, house, calf, …). */
export function emitPurchaseUnlock(payload) {
  ForestGameBridge.emit(FARM_EVENTS.PURCHASE_UNLOCK, payload);
}

export function emitUnlockShopOpen() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_OPEN);
}

export function emitUnlockShopClose() {
  ForestGameBridge.emit(FARM_EVENTS.UNLOCK_SHOP_CLOSE);
}

/** Advance / restart the farm at a given level id. */
export function emitStartFarmLevel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_FARM_LEVEL, payload);
}

/** Start an unlock-item challenge step from the React panel. */
export function emitStartItemChallenge(payload) {
  ForestGameBridge.emit(FARM_EVENTS.START_ITEM_CHALLENGE, payload);
}

export function emitHouseInteriorDone(payload) {
  ForestGameBridge.emit(FARM_EVENTS.HOUSE_INTERIOR_DONE, payload);
}

export function emitHouseInteriorCancel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.HOUSE_INTERIOR_CANCEL, payload);
}

export function emitHouseStepCorrect(payload) {
  ForestGameBridge.emit(FARM_EVENTS.HOUSE_STEP_CORRECT, payload);
}

export function emitHouseStepWrong(payload) {
  ForestGameBridge.emit(FARM_EVENTS.HOUSE_STEP_WRONG, payload);
}

export function emitEggCollectDone(payload) {
  ForestGameBridge.emit(FARM_EVENTS.EGG_COLLECT_DONE, payload);
}

export function emitEggCollectCancel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.EGG_COLLECT_CANCEL, payload);
}

export function emitEggProtectCorrect(payload) {
  ForestGameBridge.emit(FARM_EVENTS.EGG_PROTECT_CORRECT, payload);
}

export function emitEggProtectWrong(payload) {
  ForestGameBridge.emit(FARM_EVENTS.EGG_PROTECT_WRONG, payload);
}

export function emitCalfFeedDone(payload) {
  ForestGameBridge.emit(FARM_EVENTS.CALF_FEED_DONE, payload);
}

export function emitCalfFeedCancel(payload) {
  ForestGameBridge.emit(FARM_EVENTS.CALF_FEED_CANCEL, payload);
}

export function emitCalfFeedCorrect(payload) {
  ForestGameBridge.emit(FARM_EVENTS.CALF_FEED_CORRECT, payload);
}

export function emitCalfFeedWrong(payload) {
  ForestGameBridge.emit(FARM_EVENTS.CALF_FEED_WRONG, payload);
}

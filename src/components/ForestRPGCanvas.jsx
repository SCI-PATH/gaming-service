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
  onTriggerQuiz,
  onTargetReached,
  onInteraction,
}) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const cbs = useRef({});
  const [ready, setReady] = useState(false);

  cbs.current = {
    onReady,
    onFarmState,
    onTriggerQuiz,
    onTargetReached,
    onInteraction,
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
    const handleQuiz = (payload) => cbs.current.onTriggerQuiz?.(payload);
    const handleTarget = (payload) => cbs.current.onTargetReached?.(payload);
    const handleInteraction = (detail) => cbs.current.onInteraction?.(detail);

    ForestGameBridge.on(FARM_EVENTS.READY, handleReady);
    ForestGameBridge.on(FARM_EVENTS.FARM_STATE, handleFarmState);
    ForestGameBridge.on(FARM_EVENTS.INVENTORY_UPDATED, handleInventory);
    ForestGameBridge.on(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, handleQuiz);
    ForestGameBridge.on(FARM_EVENTS.TARGET_REACHED, handleTarget);
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, handleInteraction);

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
      ForestGameBridge.off(FARM_EVENTS.TRIGGER_SCIENCE_QUIZ, handleQuiz);
      ForestGameBridge.off(FARM_EVENTS.TARGET_REACHED, handleTarget);
      ForestGameBridge.off(FARM_EVENTS.INTERACTION, handleInteraction);
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

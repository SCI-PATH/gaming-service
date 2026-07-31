import { useEffect, useRef, useState } from 'react';
import { createForestGame } from '../game/config/gameConfig.js';
import { EventBus, SCIENCE_EVENTS } from '../game/EventBus.js';

/**
 * Mounts the ForestRPG Phaser 3 game inside React.
 */
export default function ForestGameCanvas({ onReady, onInteraction }) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onInteractionRef = useRef(onInteraction);
  const [ready, setReady] = useState(false);

  onReadyRef.current = onReady;
  onInteractionRef.current = onInteraction;

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent || gameRef.current) return undefined;

    parent.innerHTML = '';
    const game = createForestGame(parent);
    gameRef.current = game;

    const handleReady = () => {
      setReady(true);
      onReadyRef.current?.();
    };
    const handleInteraction = (detail) => {
      onInteractionRef.current?.(detail);
    };

    EventBus.on(SCIENCE_EVENTS.READY, handleReady);
    EventBus.on(SCIENCE_EVENTS.INTERACTION, handleInteraction);

    // BootScene starts immediately; mark ready after a short tick
    const t = window.setTimeout(() => {
      EventBus.emit(SCIENCE_EVENTS.READY);
    }, 300);

    return () => {
      window.clearTimeout(t);
      EventBus.off(SCIENCE_EVENTS.READY, handleReady);
      EventBus.off(SCIENCE_EVENTS.INTERACTION, handleInteraction);
      game.destroy(true);
      gameRef.current = null;
      parent.innerHTML = '';
      setReady(false);
    };
  }, []);

  return (
    <div className="forest-stage">
      <div ref={hostRef} className="phaser-host" id="forest-game-root" />
      {!ready && <div className="forest-loading">Loading Forest RPG…</div>}
    </div>
  );
}

export function emitScienceCorrect() {
  EventBus.emit(SCIENCE_EVENTS.CORRECT);
}

export function emitScienceIncorrect(questionId, selectedIndex) {
  EventBus.emit(SCIENCE_EVENTS.INCORRECT, { questionId, selectedIndex });
}

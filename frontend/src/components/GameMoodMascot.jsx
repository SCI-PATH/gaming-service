import { useEffect, useState } from 'react';
import { FARM_EVENTS, ForestGameBridge } from '../game/ForestGameBridge.js';

/**
 * HUD mascot. Happy on a correct answer, encouraging when the answer is missed.
 */
export default function GameMoodMascot() {
  const [mood, setMood] = useState('ready');

  useEffect(() => {
    const onCorrect = () => {
      setMood('happy');
      window.setTimeout(() => setMood('ready'), 1400);
    };
    const onMiss = () => {
      setMood('encouraging');
      window.setTimeout(() => setMood('ready'), 1600);
    };
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_CORRECT, onCorrect);
    ForestGameBridge.on(FARM_EVENTS.SCIENCE_INCORRECT, onMiss);
    return () => {
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_CORRECT, onCorrect);
      ForestGameBridge.off(FARM_EVENTS.SCIENCE_INCORRECT, onMiss);
    };
  }, []);

  const face = mood === 'happy' ? '😄' : mood === 'encouraging' ? '🤗' : '🙂';
  const label =
    mood === 'happy' ? 'Nice work' : mood === 'encouraging' ? 'Try the next one' : 'Ready';

  return (
    <div
      className={`game-mood-mascot is-${mood}`}
      role="status"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: mood === 'happy' ? '#e7f6ec' : mood === 'encouraging' ? '#fff4ea' : '#fffaf0',
        border: '2px solid #2a3220',
        fontWeight: 700,
        transform: mood === 'happy' ? 'translateY(-2px) scale(1.05)' : 'none',
        transition: 'transform 160ms ease, background 160ms ease',
      }}
    >
      <span aria-hidden style={{ fontSize: 22 }}>{face}</span>
      <span>{label}</span>
    </div>
  );
}

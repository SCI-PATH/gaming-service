/**
 * Pause overlay — freeze the farm and keep the run saved for later.
 */
export default function FarmPauseOverlay({
  open = false,
  levelId = 1,
  onResume,
  onLeave,
}) {
  if (!open) return null;

  return (
    <div
      className="farm-pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Game paused"
    >
      <div className="farm-pause-card">
        <p className="farm-pause-kicker">Paused</p>
        <h2>Take a break</h2>
        <p>
          Your farm is saved on Level {levelId}. When you come back, you will
          start from this same spot — planted crops, harvest on your back, and
          shop stock stay.
        </p>
        <div className="farm-pause-actions">
          <button type="button" className="farm-pause-resume" onClick={onResume}>
            Resume farm
          </button>
          <button type="button" className="farm-pause-leave" onClick={onLeave}>
            Save and leave
          </button>
        </div>
        <p className="farm-pause-hint">Press Esc to resume</p>
      </div>
    </div>
  );
}

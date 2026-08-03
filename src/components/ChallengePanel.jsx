/**
 * Lists unlock-item challenges from prior-level purchases.
 * Go → pans camera and starts the challenge; map clicks still work too.
 */
export default function ChallengePanel({
  challenges = [],
  onStartChallenge,
  visible = true,
  levelId,
  disabled = false,
}) {
  if (!visible) return null;

  const open = challenges.filter((c) => !c.done);
  const done = challenges.filter((c) => c.done);

  return (
    <aside className="challenge-panel" aria-label="Unlock item challenges">
      <div className="challenge-panel-head">
        <strong>Open Challenges</strong>
        <span>
          {levelId ? `Level ${levelId}` : 'This level'} — from unlocks you bought
          earlier
        </span>
      </div>

      {open.length < 1 && done.length < 1 && (
        <p className="challenge-panel-empty">
          Finish a level, buy unlocks in the shop, then play the next level.
          Open challenges will list here with a Go button.
        </p>
      )}

      <ul className="challenge-list">
        {open.map((c) => {
          const step = c.steps?.[c.stepIndex];
          const isHouse = c.itemId === 'house';
          const isHen = c.itemId === 'hen_house';
          const isCalf = c.itemId === 'calf';
          return (
            <li key={`${c.itemId}-${c.stageId}`} className="challenge-card">
              <div className="challenge-card-top">
                <strong>{c.itemLabel}</strong>
                <span>{c.title}</span>
              </div>
              <p>{c.description}</p>
              <p className="challenge-step">
                Step {(c.stepIndex || 0) + 1}/{c.steps.length}
                {step ? `: ${step.label}` : ''}
              </p>
              <button
                type="button"
                disabled={disabled || !onStartChallenge}
                onClick={() =>
                  onStartChallenge?.({
                    itemId: c.itemId,
                    stageId: c.stageId,
                  })
                }
              >
                Go
              </button>
              <p className="challenge-go-hint">
                {isHouse
                  ? 'Or click the Farm House on the map'
                  : isHen
                    ? 'Or click the Hen House on the map'
                    : isCalf
                      ? 'Or click the Calf Pen (SW pasture)'
                      : 'Or click the unlock / press E nearby'}
              </p>
            </li>
          );
        })}
      </ul>

      {done.length > 0 && (
        <ul className="challenge-list is-done">
          {done.map((c) => (
            <li
              key={`done-${c.itemId}-${c.stageId}`}
              className="challenge-card is-complete"
            >
              <strong>{c.itemLabel}</strong>
              <span>{c.title} — complete</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

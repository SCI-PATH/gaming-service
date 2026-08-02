/**
 * Lists unlock-item challenges active on this farm level.
 * House / hen house challenges start by clicking those buildings on the farm
 * (not from panel buttons).
 */
export default function ChallengePanel({
  challenges = [],
  visible = true,
  levelId,
}) {
  if (!visible) return null;

  const open = challenges.filter((c) => !c.done);
  const done = challenges.filter((c) => c.done);

  return (
    <aside className="challenge-panel" aria-label="Unlock item challenges">
      <div className="challenge-panel-head">
        <strong>Item Challenges</strong>
        <span>
          {levelId ? `Level ${levelId}` : 'This level'} — click buildings on the
          farm
        </span>
      </div>

      {open.length < 1 && done.length < 1 && (
        <p className="challenge-panel-empty">
          Finish a level, buy unlocks in the shop, then play the next level.
          Click the Farm House or Hen House on the map to start their challenges.
        </p>
      )}

      <ul className="challenge-list">
        {open.map((c) => {
          const step = c.steps?.[c.stepIndex];
          const isHouse = c.itemId === 'house';
          const isHen = c.itemId === 'hen_house';
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
              <p className="challenge-go-hint">
                {isHouse
                  ? '→ Click the Farm House on the farm to enter'
                  : isHen
                    ? '→ Click the Hen House on the farm to collect eggs'
                    : '→ Walk near the item and press E, or click it'}
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

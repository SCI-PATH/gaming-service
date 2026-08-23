/**
 * Shows today's CSF-personalized farm activities (primary jobs + micro goals).
 * Kid-safe wording — never mentions frustration scores.
 */
export default function PersonalizedActivitiesPanel({
  board = null,
  compact = false,
}) {
  if (!board || (!board.primary?.length && !board.microActivities?.length)) {
    return null;
  }

  const micros = board.microActivities || [];
  const primary = board.primary || [];

  return (
    <aside
      className={`personalized-activities${compact ? ' is-compact' : ''}`}
      aria-label="Personalized farm activities"
    >
      <div className="pa-head">
        <strong>Your farm today</strong>
        <span>{board.summary}</span>
      </div>

      {primary.length > 0 ? (
        <ul className="pa-list">
          {primary.map((act) => (
            <li key={act.type} className={`pa-item pa-${act.type}`}>
              <span className="pa-label">{act.label}</span>
              <p>{act.goalText}</p>
              {act.harvestTarget != null ? (
                <small>Pick target: {act.harvestTarget}</small>
              ) : null}
              {act.collectTarget != null ? (
                <small>Collect target: {act.collectTarget}</small>
              ) : null}
              {act.sweepTarget != null ? (
                <small>Clean target: {act.sweepTarget}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {micros.length > 0 ? (
        <>
          <p className="pa-micro-title">Optional side activities</p>
          <ul className="pa-micro">
            {micros.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>
                <span>{m.description}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

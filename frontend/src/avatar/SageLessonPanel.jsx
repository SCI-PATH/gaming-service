/**
 * One card per teaching job so SAGE never dumps a single repetitive paragraph.
 */
export default function SageLessonPanel({ sections = [] }) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return (
    <ol className="sage-lesson" aria-label="Sage teaching steps">
      {sections.map((s) => (
        <li key={s.id || s.title} className={`sage-lesson-block is-${s.id || 'part'}`}>
          <h3 className="sage-lesson-title">{s.title}</h3>
          {s.quote ? <p className="sage-lesson-quote">{s.quote}</p> : null}
          {s.id === 'difference' && (s.studentPurpose || s.correctPurpose) ? (
            <ul className="sage-lesson-diff">
              {s.studentPurpose ? (
                <li>
                  <span>Your answer</span>
                  <strong>{s.studentPurpose}</strong>
                </li>
              ) : null}
              {s.correctPurpose ? (
                <li>
                  <span>Correct answer</span>
                  <strong>{s.correctPurpose}</strong>
                </li>
              ) : null}
            </ul>
          ) : null}
          <p className="sage-lesson-body">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

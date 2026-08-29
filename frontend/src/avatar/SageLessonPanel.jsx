/**
 * One card per teaching job: describe the student's science, describe the
 * correct science, then compare. Do not dump a single repetitive paragraph.
 */
export default function SageLessonPanel({ sections = [] }) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return (
    <ol className="sage-lesson" aria-label="Sage teaching steps">
      {sections.map((s) => (
        <li key={s.id || s.title} className={`sage-lesson-block is-${s.id || 'part'}`}>
          <h3 className="sage-lesson-title">{s.title}</h3>
          {s.quote ? <p className="sage-lesson-quote">{s.quote}</p> : null}
          {s.id === 'difference' ? (
            <>
              {s.similarity ? <p className="sage-lesson-body">{s.similarity}</p> : null}
              {s.wrongConcept || s.correctConcept || s.studentPurpose || s.correctPurpose ? (
                <ul className="sage-lesson-diff">
                  {s.wrongConcept || s.studentPurpose ? (
                    <li>
                      <span>Your answer</span>
                      <strong>{s.wrongConcept || s.studentPurpose}</strong>
                    </li>
                  ) : null}
                  {s.correctConcept || s.correctPurpose ? (
                    <li>
                      <span>Correct answer</span>
                      <strong>{s.correctConcept || s.correctPurpose}</strong>
                    </li>
                  ) : null}
                </ul>
              ) : null}
              <p className="sage-lesson-body">
                {s.difference ? `So the scientific difference is ${s.difference}` : s.body}
              </p>
            </>
          ) : (
            <p className="sage-lesson-body">{s.body}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

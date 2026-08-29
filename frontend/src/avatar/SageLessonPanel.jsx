/**
 * Structured SAGE teaching: define both answers, then compare by name.
 */
export default function SageLessonPanel({ sections = [], lesson = null }) {
  const list = Array.isArray(sections) && sections.length
    ? sections
    : Array.isArray(lesson?.sections)
      ? lesson.sections
      : [];
  if (!list.length) return null;

  return (
    <ol className="sage-lesson" aria-label="Sage teaching steps">
      {list.map((s) => (
        <li key={s.id || s.title} className={`sage-lesson-block is-${s.id || 'part'}`}>
          <h3 className="sage-lesson-title">{s.title}</h3>
          {s.quote ? <p className="sage-lesson-quote">{s.quote}</p> : null}
          {s.id === 'your_answer' || s.id === 'correct_answer' ? (
            <>
              {s.scientificDefinition || s.body ? (
                <>
                  <p className="sage-lesson-kicker">Scientifically</p>
                  <p className="sage-lesson-body">{s.scientificDefinition || s.body}</p>
                </>
              ) : null}
              {s.scientificFunction || s.function ? (
                <>
                  <p className="sage-lesson-kicker">Function</p>
                  <p className="sage-lesson-body">{s.scientificFunction || s.function}</p>
                </>
              ) : null}
            </>
          ) : s.id === 'difference' ? (
            <>
              <ul className="sage-lesson-diff">
                {s.studentConcept ? (
                  <li>
                    <span>{s.studentConcept}</span>
                    <strong>→ {s.studentConceptFunction || s.studentPurpose}</strong>
                  </li>
                ) : null}
                {s.correctConcept ? (
                  <li>
                    <span>{s.correctConcept}</span>
                    <strong>→ {s.correctConceptFunction || s.correctPurpose}</strong>
                  </li>
                ) : null}
              </ul>
              <p className="sage-lesson-kicker">Key difference</p>
              <p className="sage-lesson-body">
                {s.keyScientificDifference || s.difference || s.body}
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

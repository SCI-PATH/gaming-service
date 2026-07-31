import { useState } from 'react';

/** Side-panel science quiz that drives the Escape-the-Dragon tension loop */
export default function ScienceQuizPanel({
  question,
  disabled = false,
  onCorrect,
  onIncorrect,
}) {
  const [selected, setSelected] = useState(null);
  const [resolved, setResolved] = useState(null);
  const [showHint, setShowHint] = useState(false);

  const handlePick = (index) => {
    if (disabled || resolved === 'correct') return;
    setSelected(index);
    if (index === question.correctIndex) {
      setResolved('correct');
      setShowHint(false);
      onCorrect();
    } else {
      setResolved('wrong');
      setShowHint(true);
      onIncorrect(index);
    }
  };

  return (
    <section className="escape-quiz">
      <header className="escape-quiz-head">
        <p className="escape-quiz-topic">{question.topic}</p>
        <h3>Science Challenge</h3>
      </header>

      <p className="escape-quiz-prompt">{question.prompt}</p>

      <div className="escape-quiz-options">
        {question.options.map((opt, i) => {
          let cls = 'escape-opt';
          if (selected === i && resolved === 'correct') cls += ' is-correct';
          if (selected === i && resolved === 'wrong') cls += ' is-wrong';
          return (
            <button
              key={opt}
              type="button"
              className={cls}
              disabled={disabled || resolved === 'correct'}
              onClick={() => handlePick(i)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {showHint && resolved === 'wrong' && (
        <p className="escape-quiz-hint">Hint: {question.hint}</p>
      )}

      {resolved === 'correct' && (
        <p className="escape-quiz-success">
          Correct! Overhead trap released — clear the path!
        </p>
      )}
    </section>
  );
}

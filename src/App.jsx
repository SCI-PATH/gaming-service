import { useCallback, useState } from 'react';
import ForestGameCanvas, {
  emitScienceCorrect,
  emitScienceIncorrect,
} from './components/ForestGameCanvas.jsx';
import ScienceQuizPanel from './components/ScienceQuizPanel.jsx';
import { SCIENCE_QUESTIONS } from './data/scienceQuestions.js';

/**
 * ForestRPG (Phaser 3) + Science Quiz overlay.
 */
export default function App() {
  const [gameReady, setGameReady] = useState(false);
  const [quizOpen, setQuizOpen] = useState(true);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [quizKey, setQuizKey] = useState(0);
  const [ddaMisses, setDdaMisses] = useState(0);
  const [lastInteraction, setLastInteraction] = useState(null);
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);

  const question =
    SCIENCE_QUESTIONS[questionIndex % SCIENCE_QUESTIONS.length];

  const handleReady = useCallback(() => setGameReady(true), []);

  const handleInteraction = useCallback((detail) => {
    setLastInteraction(detail);
  }, []);

  const handleCorrect = () => {
    setAnsweredCorrectly(true);
    emitScienceCorrect();
    setQuizOpen(false);
  };

  const handleIncorrect = (selectedIndex) => {
    setDdaMisses((n) => n + 1);
    emitScienceIncorrect(question.id, selectedIndex);
    window.setTimeout(() => {
      setQuestionIndex((i) => i + 1);
      setQuizKey((k) => k + 1);
    }, 800);
  };

  return (
    <div className="app-shell forest-app">
      <header className="forest-header">
        <div>
          <h1>Forest RPG</h1>
          <p>
            Explore the forest — answer science questions to heal and earn
            score.
          </p>
        </div>
        <div className="forest-stats">
          <span className="forest-chip">
            {gameReady ? 'Game Ready' : 'Loading…'}
          </span>
          <span>DDA misses: {ddaMisses}</span>
          {lastInteraction?.type && (
            <span>Last: {lastInteraction.type}</span>
          )}
        </div>
      </header>

      <div className="forest-stage-wrap">
        <ForestGameCanvas
          onReady={handleReady}
          onInteraction={handleInteraction}
        />

        {/* Science Quiz overlay — sits above the Phaser canvas */}
        {quizOpen && (
          <div className="science-quiz-overlay" role="dialog" aria-modal="true">
            <div className="science-quiz-card">
              <ScienceQuizPanel
                key={`${question.id}-${quizKey}`}
                question={question}
                disabled={!gameReady || answeredCorrectly}
                onCorrect={handleCorrect}
                onIncorrect={handleIncorrect}
              />
              <button
                type="button"
                className="quiz-dismiss"
                onClick={() => setQuizOpen(false)}
              >
                Play without answering
              </button>
            </div>
          </div>
        )}

        {!quizOpen && !answeredCorrectly && (
          <button
            type="button"
            className="quiz-reopen"
            onClick={() => setQuizOpen(true)}
          >
            Science Quiz
          </button>
        )}
      </div>
    </div>
  );
}

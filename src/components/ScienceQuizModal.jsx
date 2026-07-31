import { ForestGameBridge } from '../game/ForestGameBridge.js';

/**
 * Harvest-lock science quiz modal.
 * Emits SCIENCE_CORRECT / SCIENCE_INCORRECT on the game bridge.
 */
export default function ScienceQuizModal({ questionData, cropId, onClose }) {
  if (!questionData) return null;

  const options = questionData.options.map((opt, idx) => {
    if (typeof opt === 'string') {
      return {
        text: opt,
        isCorrect: idx === questionData.correctIndex,
      };
    }
    return opt;
  });

  const handleAnswer = (isCorrect, selectedIndex) => {
    if (isCorrect) {
      ForestGameBridge.emit('SCIENCE_CORRECT', {
        cropId,
        rp: questionData.rp ?? 0,
      });
    } else {
      ForestGameBridge.emit('SCIENCE_INCORRECT', {
        cropId,
        questionId: questionData.id,
        selectedIndex,
      });
    }
    onClose?.(isCorrect);
  };

  return (
    <div
      className="science-quiz-overlay"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 1000 }}
    >
      <div
        style={{
          position: 'relative',
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          border: '2px solid #2e7d32',
          borderRadius: '12px',
          padding: '24px',
          color: '#fff',
          textAlign: 'center',
          width: 'min(92vw, 450px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
        }}
      >
        <h3 style={{ color: '#4caf50', marginTop: 0 }}>
          Science Challenge (Plant Lock)
        </h3>
        {questionData.rp != null && (
          <p style={{ color: '#c9a227', margin: '0 0 8px', fontWeight: 700 }}>
            +{questionData.rp} RP
          </p>
        )}
        <p style={{ fontSize: '16px', margin: '15px 0' }}>
          {questionData.prompt || questionData.question}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map((option, idx) => (
            <button
              key={`${option.text}-${idx}`}
              type="button"
              onClick={() => handleAnswer(option.isCorrect, idx)}
              style={{
                padding: '10px 15px',
                backgroundColor: '#2e2e2e',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                textAlign: 'left',
              }}
            >
              {option.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

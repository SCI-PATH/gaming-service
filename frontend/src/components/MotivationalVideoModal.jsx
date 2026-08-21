import { useEffect, useState } from 'react';
import { suggestMotivationalVideo } from '../data/motivationalVideos.js';

/**
 * Interactive end-of-level story: tap to advance, make choices, reflect.
 */
export default function MotivationalVideoModal({
  open,
  frustrationScore = 0,
  frustrationLevel = 'low',
  studentId = '',
  levelId = 1,
  onContinue,
}) {
  const [suggestion, setSuggestion] = useState(null);
  const [phase, setPhase] = useState('cover'); // cover | play | done
  const [stepIndex, setStepIndex] = useState(0);
  const [choiceId, setChoiceId] = useState(null);
  const [choiceReply, setChoiceReply] = useState(null);

  useEffect(() => {
    if (!open) {
      setSuggestion(null);
      setPhase('cover');
      setStepIndex(0);
      setChoiceId(null);
      setChoiceReply(null);
      return;
    }
    setSuggestion(
      suggestMotivationalVideo({
        frustrationScore,
        frustrationLevel,
        studentId,
        levelId,
      }),
    );
    setPhase('cover');
    setStepIndex(0);
    setChoiceId(null);
    setChoiceReply(null);
  }, [open, frustrationScore, frustrationLevel, studentId, levelId]);

  if (!open || !suggestion?.video) return null;

  const { video, score, levelLabel } = suggestion;
  const steps = video.steps || [];
  const step = steps[stepIndex] || null;
  const progress = steps.length
    ? Math.round(((stepIndex + (phase === 'done' ? 1 : 0)) / steps.length) * 100)
    : 0;
  const accent = video.accent || '#c9a227';

  const begin = () => {
    setPhase('play');
    setStepIndex(0);
    setChoiceId(null);
    setChoiceReply(null);
  };

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      setPhase('done');
      return;
    }
    setStepIndex((i) => i + 1);
    setChoiceId(null);
    setChoiceReply(null);
  };

  const pickChoice = (choice) => {
    setChoiceId(choice.id);
    setChoiceReply(choice.reply || null);
    if (step?.type === 'reflect' || !choice.reply) {
      window.setTimeout(() => {
        if (stepIndex >= steps.length - 1) setPhase('done');
        else {
          setStepIndex((i) => i + 1);
          setChoiceId(null);
          setChoiceReply(null);
        }
      }, 280);
    }
  };

  const canAdvanceNarrate =
    step?.type === 'narrate' && phase === 'play';
  const waitingOnChoice =
    (step?.type === 'choice' || step?.type === 'reflect') && !choiceId;

  return (
    <div
      className="motivation-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="motivation-title"
    >
      <div
        className={`motivation-story mood-${step?.mood || 'hope'}`}
        style={{ '--story-accent': accent }}
      >
        <div className="motivation-story-top">
          <div>
            <p className="motivation-kicker">Interactive story</p>
            <h2 id="motivation-title">{video.person}</h2>
            <p className="motivation-meta">
              {video.era === 'living' ? 'Living' : 'History'} · {video.field}
            </p>
          </div>
          <div className="motivation-frust-pill">
            Frustration {score}/100
            <span>{levelLabel}</span>
          </div>
        </div>

        <div className="motivation-progress" aria-hidden>
          <div
            className="motivation-progress-fill"
            style={{ width: `${Math.max(phase === 'cover' ? 4 : progress, 4)}%` }}
          />
        </div>

        {phase === 'cover' && (
          <div className="motivation-cover">
            <p className="motivation-cover-title">{video.title}</p>
            <p className="motivation-message">{video.message}</p>
            <p className="motivation-reason">
              <strong>Why this for you:</strong> {video.linkReason}
            </p>
            <button type="button" className="motivation-play-btn" onClick={begin}>
              Start interactive story
            </button>
            <p className="motivation-hint">Tap choices · advance the story yourself</p>
          </div>
        )}

        {phase === 'play' && step && (
          <div className="motivation-play" key={`${stepIndex}-${step.title}`}>
            <div className={`motivation-hero mood-${step.mood}`}>
              <span className="motivation-hero-icon" aria-hidden>
                {step.icon}
              </span>
              <span className="motivation-hero-label">{step.title}</span>
            </div>

            <p className="motivation-step-text">{step.text}</p>

            {step.type === 'narrate' && (
              <button
                type="button"
                className="motivation-tap"
                onClick={goNext}
              >
                Tap to continue →
              </button>
            )}

            {(step.type === 'choice' || step.type === 'reflect') && (
              <div className="motivation-choices">
                {(step.choices || []).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={`motivation-choice${
                      choiceId === choice.id ? ' is-picked' : ''
                    }`}
                    disabled={Boolean(choiceId) && choiceId !== choice.id}
                    onClick={() => pickChoice(choice)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}

            {choiceReply && (
              <div className="motivation-reply">
                <p>{choiceReply}</p>
                {step.type === 'choice' && (
                  <button
                    type="button"
                    className="motivation-tap"
                    onClick={goNext}
                  >
                    Continue story →
                  </button>
                )}
              </div>
            )}

            {canAdvanceNarrate ? null : null}
            {waitingOnChoice ? (
              <p className="motivation-hint">Pick one to continue</p>
            ) : null}
          </div>
        )}

        {phase === 'done' && (
          <div className="motivation-cover">
            <p className="motivation-cover-title">Story complete</p>
            <p className="motivation-message">
              Take {video.person}’s lesson into the unlock shop — then the next
              farm level.
            </p>
            <button
              type="button"
              className="motivation-continue"
              onClick={onContinue}
            >
              Continue to unlock shop
            </button>
          </div>
        )}

        {phase !== 'done' && (
          <footer className="motivation-foot">
            <button
              type="button"
              className="motivation-skip"
              onClick={onContinue}
            >
              Skip to shop
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

/**
 * Always-visible next-step coach while the student is on the farm.
 */
export default function PlayWizard({ step, hidden = false }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!step?.id) return;
    setCollapsed(false);
  }, [step?.id]);

  if (hidden || !step) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="play-wizard is-collapsed"
        onClick={() => setCollapsed(false)}
        aria-expanded="false"
        aria-label={`Farm guide: ${step.title}. Show next step.`}
      >
        <span className="play-wizard-hat" aria-hidden>
          ✦
        </span>
        <span className="play-wizard-collapsed-text">
          Next: {step.title}
        </span>
      </button>
    );
  }

  return (
    <aside
      className={`play-wizard${step.quiet ? ' is-quiet' : ''}`}
      aria-label="Farm guide — what to do next"
    >
      <header className="play-wizard-head">
        <p className="play-wizard-kicker">Farm guide</p>
        <button
          type="button"
          className="play-wizard-hide"
          onClick={() => setCollapsed(true)}
          aria-label="Hide farm guide"
        >
          Hide
        </button>
      </header>
      <p className="play-wizard-title" aria-live="polite">
        {step.title}
      </p>
      <p className="play-wizard-how">{step.how}</p>
      {step.key ? (
        <p className="play-wizard-keys">
          <kbd>{step.key}</kbd>
          <span>WASD to move</span>
        </p>
      ) : (
        <p className="play-wizard-keys">
          <span>WASD to move · E to interact</span>
        </p>
      )}
    </aside>
  );
}

import { useEffect, useState } from 'react';

const SAGE_SRC = '/assets/avatar/sage.png';

/**
 * In-world Sage guide: portrait + speech bubble, not a dashboard card.
 */
export default function PlayWizard({
  step,
  hidden = false,
  frustrationLevel = 'moderate',
  groveNote = '',
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!step?.id) return;
    setCollapsed(false);
    if (step.quiet) return undefined;
    const t = window.setTimeout(() => setCollapsed(true), 9000);
    return () => window.clearTimeout(t);
  }, [step?.id]);

  if (hidden || !step) return null;

  const line = groveNote || step.say || step.title;
  const pin = step.pin?.label;

  if (collapsed) {
    return (
      <button
        type="button"
        className="sage-guide is-collapsed"
        onClick={() => setCollapsed(false)}
        aria-expanded="false"
        aria-label={`Sage: ${line}. Show again.`}
      >
        <img className="sage-guide-photo" src={SAGE_SRC} alt="" />
        <span className="sage-guide-chip">{step.title}</span>
      </button>
    );
  }

  return (
    <aside
      className={`sage-guide${step.quiet ? ' is-quiet' : ''} is-${String(frustrationLevel || 'moderate').replace('_', '-')}`}
      aria-label="Sage — what to do next"
    >
      <img className="sage-guide-photo is-lg" src={SAGE_SRC} alt="Sage" />
      <div className="sage-guide-bubble">
        <p className="sage-guide-name">Sage</p>
        <p className="sage-guide-say" aria-live="polite">
          {line}
        </p>
        {pin ? (
          <p className="sage-guide-pin">
            <span aria-hidden>➤</span> {pin}
          </p>
        ) : null}
        {step.key ? (
          <p className="sage-guide-keys">
            <kbd>{step.key}</kbd>
            <span>WASD to move</span>
          </p>
        ) : null}
        <button
          type="button"
          className="sage-guide-gotit"
          onClick={() => setCollapsed(true)}
        >
          Got it
        </button>
      </div>
    </aside>
  );
}

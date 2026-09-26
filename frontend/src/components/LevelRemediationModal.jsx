/**
 * Shown when the level clock or question quota ends in a repeat-topic decision.
 */
export default function LevelRemediationModal({
  open,
  decision,
  onPracticeAgain,
  onReviewMindMap,
  onReturnToPath,
}) {
  if (!open || !decision) return null;
  const mastery = Number(decision.masteryPercentage);
  const masteryLabel = Number.isFinite(mastery)
    ? `${Math.round(mastery * 100)}%`
    : null;
  const explanation = String(decision.explanation || '').trim();

  return (
    <div
      className="motivation-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remediation-title"
    >
      <div className="motivation-story mood-hope">
        <div className="motivation-story-top">
          <div>
            <p className="motivation-kicker">Sage</p>
            <h2 id="remediation-title">Let&apos;s master this topic before moving on!</h2>
            <p className="motivation-meta">
              Frustration {Math.round(Number(decision.frustrationScore) || 0)}
              {masteryLabel ? ` · mastery ${masteryLabel}` : ''}
            </p>
          </div>
        </div>
        <p className="remediation-copy">
          {decision.mentorReply ||
            'The next level stays locked until this topic feels steadier. Review the explanation, then try the farm again.'}
        </p>
        {explanation ? (
          <div className="remediation-explain">
            <p className="motivation-kicker">Explanation</p>
            <p>{explanation}</p>
          </div>
        ) : null}
        <div className="remediation-actions">
          <button type="button" className="motivation-next" onClick={onReviewMindMap}>
            Review mind map
          </button>
          <button type="button" className="motivation-next" onClick={onPracticeAgain}>
            Practice this topic again
          </button>
          {onReturnToPath ? (
            <button type="button" className="motivation-next" onClick={onReturnToPath}>
              Back to learning path — this chapter stays open
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

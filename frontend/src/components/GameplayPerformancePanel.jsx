/**
 * Side panel: adaptive gameplay performance metrics (not question DDA).
 */
import {
  formatDurationSec,
  formatGameplaySettingsSummary,
  GAMEPLAY_BAND_LABELS,
} from '../data/gameplayPerformance.js';

export default function GameplayPerformancePanel({
  visible = true,
  gameplay,
}) {
  if (!visible || !gameplay) return null;

  const settings = gameplay.settings || gameplay.nextGameplaySettings;
  const prev = gameplay.previousLevel;
  const bonus = gameplay.appliedBonus || gameplay.pendingBonus;
  const live = gameplay.live || {};

  return (
    <aside className="gameplay-perf-panel" aria-label="Gameplay performance">
      <div className="gameplay-perf-head">
        <strong>Gameplay Performance</strong>
        <span>Adaptive enemies / timers (not question difficulty)</span>
      </div>

      <dl className="gameplay-perf-grid">
        <div>
          <dt>Current level</dt>
          <dd className={`gp-band gp-${gameplay.band || 'medium'}`}>
            {gameplay.label ||
              GAMEPLAY_BAND_LABELS[gameplay.band] ||
              'Medium'}
          </dd>
        </div>
        <div>
          <dt>Previous level</dt>
          <dd>
            {prev
              ? `${prev.classificationLabel || prev.classification}${
                  prev.gradeLabel ? ` · ${prev.gradeLabel}` : ''
                }`
              : '— (first level)'}
          </dd>
        </div>
        <div>
          <dt>Avg answer time</dt>
          <dd>
            {live.avgAnswerTimeSec != null
              ? formatDurationSec(live.avgAnswerTimeSec)
              : prev?.avgAnswerTimeSec != null
                ? formatDurationSec(prev.avgAnswerTimeSec)
                : '—'}
            {prev?.avgAnswerTimeSec != null && live.avgAnswerTimeSec != null ? (
              <span className="gp-muted">
                {' '}
                (prev {formatDurationSec(prev.avgAnswerTimeSec)})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Retries</dt>
          <dd>
            {live.retries != null ? live.retries : prev?.retries ?? '—'}
            {settings?.maxRetriesPerQuestion != null ? (
              <span className="gp-muted">
                {' '}
                / max {settings.maxRetriesPerQuestion} per try
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Level time</dt>
          <dd>
            {live.levelElapsedSec != null
              ? formatDurationSec(live.levelElapsedSec)
              : '—'}
            {settings?.levelTargetTimeMs ? (
              <span className="gp-muted">
                {' '}
                / target{' '}
                {formatDurationSec(settings.levelTargetTimeMs / 1000)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Performance bonus</dt>
          <dd>
            {bonus
              ? `+$${bonus.performanceCash ?? 0} (${Math.round(
                  (bonus.performanceBonusPct || 0) * 100,
                )}% · ${bonus.gradeLabel || '—'})`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Improvement bonus</dt>
          <dd>
            {bonus
              ? `+$${bonus.improvementCash ?? 0} (${Math.round(
                  (bonus.improvementBonusPct || 0) * 100,
                )}%)`
              : '—'}
          </dd>
        </div>
        <div className="gp-span">
          <dt>Next-level gameplay settings</dt>
          <dd className="gp-settings">
            {formatGameplaySettingsSummary(
              gameplay.nextGameplaySettings || settings,
            )}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

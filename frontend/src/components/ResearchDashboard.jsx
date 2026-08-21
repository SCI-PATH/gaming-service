import { useMemo, useState } from 'react';
import {
  buildResearchDashboardSnapshot,
  downloadResearchCsv,
  downloadResearchJson,
} from '../data/researchDashboardData.js';

/**
 * Research / instructor dashboard: lesson progression, unlocks, frustration.
 */
export default function ResearchDashboard({
  student,
  farm,
  telemetrySession,
  behavioralMetrics,
  rpEarned = 0,
  ddaMisses = 0,
  onBackToFarm,
}) {
  const [tab, setTab] = useState('overview');

  const snapshot = useMemo(
    () =>
      buildResearchDashboardSnapshot({
        farm,
        telemetrySession,
        behavioralMetrics,
        rpEarned,
        ddaMisses,
      }),
    [farm, telemetrySession, behavioralMetrics, rpEarned, ddaMisses],
  );

  const { summary, frustration, lessonProgress, unlocks, gameplayHistory } =
    snapshot;

  const maxMasteryBar = Math.max(
    1,
    ...lessonProgress.map((r) => r.masteryPct || 0),
  );

  return (
    <div className="research-dash">
      <header className="research-dash-head">
        <div>
          <p className="research-dash-kicker">SCI_PATH · Research console</p>
          <h2>
            {student?.displayName || 'Student'}{' '}
            <span className="research-dash-id">({student?.id})</span>
          </h2>
          <p className="research-dash-sub">
            Lesson progression, unlock inventory, and affective telemetry for
            analysis export.
          </p>
        </div>
        <div className="research-dash-actions">
          <button
            type="button"
            className="research-btn research-btn-ghost"
            onClick={() => downloadResearchCsv(snapshot)}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="research-btn research-btn-ghost"
            onClick={() => downloadResearchJson(snapshot)}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="research-btn research-btn-primary"
            onClick={onBackToFarm}
          >
            Back to farm
          </button>
        </div>
      </header>

      <section className="research-kpi-grid" aria-label="Summary metrics">
        <Kpi
          label="Current level"
          value={String(summary.currentLevel)}
          hint={
            summary.highestCompletedLevel
              ? `Highest saved: L${summary.highestCompletedLevel}`
              : 'No completed levels yet'
          }
        />
        <Kpi
          label="Overall mastery"
          value={
            summary.overallMasteryPct != null
              ? `${summary.overallMasteryPct}%`
              : '—'
          }
          hint={`${summary.levelsCompleted} level record(s)`}
        />
        <Kpi
          label="Quiz accuracy"
          value={
            summary.overallAccuracyPct != null
              ? `${summary.overallAccuracyPct}%`
              : '—'
          }
          hint={`${summary.totalCorrect} correct · ${summary.totalIncorrect} incorrect`}
        />
        <Kpi
          label="Frustration"
          value={`${frustration.score}`}
          hint={frustrationLabel(frustration.level)}
          tone={frustrationTone(frustration.level)}
        />
        <Kpi
          label="Unlocks owned"
          value={String(summary.unlockCount)}
          hint={`Cash $${summary.cash} · RP ${summary.rpEarned}`}
        />
        <Kpi
          label="Live session"
          value={`${summary.liveQuestionsAnswered} Q`}
          hint={
            summary.liveMasteryLabel
              ? `Band: ${summary.liveMasteryLabel}`
              : 'In-progress farm metrics'
          }
        />
      </section>

      <nav className="research-tabs" aria-label="Dashboard sections">
        {[
          ['overview', 'Overview'],
          ['lessons', 'Lesson path'],
          ['unlocks', 'Unlocks'],
          ['affect', 'Frustration'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`research-tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="research-panels">
          <article className="research-panel">
            <header className="research-panel-head">
              <h3>Lesson mastery path</h3>
              <p>Mastery % by completed farm level</p>
            </header>
            {lessonProgress.length === 0 ? (
              <p className="research-empty">
                Complete a level to populate the progression path.
              </p>
            ) : (
              <ul className="research-bars">
                {lessonProgress.map((row) => (
                  <li key={row.levelId}>
                    <div className="research-bar-meta">
                      <strong>Level {row.levelId}</strong>
                      <span>
                        {row.masteryPct}% · {row.bandLabel}
                      </span>
                    </div>
                    <div className="research-bar-track">
                      <div
                        className={`research-bar-fill band-${row.band || 'medium'}`}
                        style={{
                          width: `${Math.max(
                            4,
                            (row.masteryPct / maxMasteryBar) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="research-panel">
            <header className="research-panel-head">
              <h3>Affective state</h3>
              <p>Live frustration model (0–100)</p>
            </header>
            <FrustrationMeter frustration={frustration} />
            <dl className="research-dl">
              <div>
                <dt>Consecutive fails</dt>
                <dd>{frustration.consecutiveFails}</dd>
              </div>
              <div>
                <dt>Mentor triggers</dt>
                <dd>{frustration.triggerCount}</dd>
              </div>
              <div>
                <dt>Last reason</dt>
                <dd>{frustration.lastTriggerReason || '—'}</dd>
              </div>
              <div>
                <dt>Intervention</dt>
                <dd>{frustration.lastInterventionMode || '—'}</dd>
              </div>
            </dl>
          </article>

          <article className="research-panel research-panel-wide">
            <header className="research-panel-head">
              <h3>Recent unlocks</h3>
              <p>Shop purchases that persist across levels</p>
            </header>
            {unlocks.length === 0 ? (
              <p className="research-empty">No unlocks purchased yet.</p>
            ) : (
              <ul className="research-unlock-grid">
                {unlocks.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.category}
                      {item.purchasedAtLevel
                        ? ` · after L${item.purchasedAtLevel}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}

      {tab === 'lessons' && (
        <article className="research-panel research-panel-full">
          <header className="research-panel-head">
            <h3>Lesson progression table</h3>
            <p>Per-level mastery, accuracy, timing, and gameplay adaptation</p>
          </header>
          {lessonProgress.length === 0 ? (
            <p className="research-empty">No saved lesson records yet.</p>
          ) : (
            <div className="research-table-wrap">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Mastery</th>
                    <th>Band</th>
                    <th>Correct</th>
                    <th>Incorrect</th>
                    <th>Accuracy</th>
                    <th>Avg RT</th>
                    <th>Target</th>
                    <th>Beat target</th>
                    <th>Gameplay</th>
                    <th>Grade</th>
                    <th>Retries</th>
                  </tr>
                </thead>
                <tbody>
                  {lessonProgress.map((row) => (
                    <tr key={row.levelId}>
                      <td>{row.levelId}</td>
                      <td>{row.masteryPct}%</td>
                      <td>{row.bandLabel}</td>
                      <td>{row.quizCorrect}</td>
                      <td>{row.quizIncorrect}</td>
                      <td>
                        {row.accuracyPct != null ? `${row.accuracyPct}%` : '—'}
                      </td>
                      <td>{row.avgResponseLabel}</td>
                      <td>{row.timeTargetLabel}</td>
                      <td>
                        {row.beatTimeTarget == null
                          ? '—'
                          : row.beatTimeTarget
                            ? 'Yes'
                            : 'No'}
                      </td>
                      <td>{row.gameplayLabel || '—'}</td>
                      <td>{row.grade || '—'}</td>
                      <td>{row.retries ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gameplayHistory.length > 0 && (
            <>
              <header className="research-panel-head research-panel-head-spaced">
                <h3>Gameplay adaptation history</h3>
                <p>Rolling window used for next-level enemy / timer settings</p>
              </header>
              <div className="research-table-wrap">
                <table className="research-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Classification</th>
                      <th>Grade</th>
                      <th>Avg answer (s)</th>
                      <th>Retries</th>
                      <th>Composite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameplayHistory.map((h, i) => (
                      <tr key={`${h.levelId}-${i}`}>
                        <td>{h.levelId}</td>
                        <td>{h.label || h.classification}</td>
                        <td>{h.grade || '—'}</td>
                        <td>
                          {h.avgAnswerTimeSec != null
                            ? Number(h.avgAnswerTimeSec).toFixed(1)
                            : '—'}
                        </td>
                        <td>{h.retries ?? '—'}</td>
                        <td>
                          {h.compositeScore != null
                            ? Math.round(h.compositeScore)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      )}

      {tab === 'unlocks' && (
        <article className="research-panel research-panel-full">
          <header className="research-panel-head">
            <h3>Owned unlock inventory</h3>
            <p>
              Items purchased in the end-of-level shop — shown on subsequent
              farms
            </p>
          </header>
          {unlocks.length === 0 ? (
            <p className="research-empty">No unlocks owned for this student.</p>
          ) : (
            <ul className="research-unlock-grid research-unlock-grid-lg">
              {unlocks.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span className="research-unlock-cat">{item.category}</span>
                  <span>
                    {item.purchasedAtLevel
                      ? `Purchased after level ${item.purchasedAtLevel}`
                      : 'Purchase level unknown'}
                  </span>
                  {item.price != null && <span>Base price ${item.price}</span>}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {tab === 'affect' && (
        <div className="research-panels">
          <article className="research-panel">
            <header className="research-panel-head">
              <h3>Frustration score</h3>
              <p>Weighted multi-signal model for mentoring interventions</p>
            </header>
            <FrustrationMeter frustration={frustration} large />
            <ul className="research-range-list">
              {Object.entries(frustration.ranges || {}).map(([key, range]) => (
                <li
                  key={key}
                  className={
                    key === frustration.level ? 'is-current' : undefined
                  }
                >
                  <strong>{frustrationLabel(key)}</strong>
                  <span>
                    {range[0]}–{range[1]}
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article className="research-panel">
            <header className="research-panel-head">
              <h3>Session telemetry</h3>
              <p>Signals feeding the live frustration estimate</p>
            </header>
            <dl className="research-dl">
              <div>
                <dt>Score</dt>
                <dd>{frustration.score}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{frustrationLabel(frustration.level)}</dd>
              </div>
              <div>
                <dt>Correct (session)</dt>
                <dd>{frustration.metrics.correctAnswers ?? '—'}</dd>
              </div>
              <div>
                <dt>Incorrect (session)</dt>
                <dd>{frustration.metrics.incorrectAnswers ?? '—'}</dd>
              </div>
              <div>
                <dt>Avg time / Q (s)</dt>
                <dd>
                  {frustration.metrics.avgTimeSec != null
                    ? Number(frustration.metrics.avgTimeSec).toFixed(1)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Hints used</dt>
                <dd>{frustration.metrics.hintUsage ?? '—'}</dd>
              </div>
              <div>
                <dt>Retries</dt>
                <dd>{frustration.metrics.retries ?? '—'}</dd>
              </div>
              <div>
                <dt>Misses (UI)</dt>
                <dd>{summary.ddaMisses}</dd>
              </div>
            </dl>
          </article>
        </div>
      )}

      <footer className="research-dash-foot">
        Snapshot ready for export · {snapshot.exportedAt}
      </footer>
    </div>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`research-kpi${tone ? ` tone-${tone}` : ''}`}>
      <span className="research-kpi-label">{label}</span>
      <strong className="research-kpi-value">{value}</strong>
      {hint ? <span className="research-kpi-hint">{hint}</span> : null}
    </div>
  );
}

function FrustrationMeter({ frustration, large = false }) {
  const score = Math.max(0, Math.min(100, Number(frustration.score) || 0));
  return (
    <div className={`research-frust-meter${large ? ' is-large' : ''}`}>
      <div className="research-frust-score">
        <strong>{score}</strong>
        <span>/ 100 · {frustrationLabel(frustration.level)}</span>
      </div>
      <div className="research-frust-track" aria-hidden>
        <div
          className={`research-frust-fill tone-${frustrationTone(frustration.level)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function frustrationLabel(level) {
  const key = String(level || 'low').toLowerCase();
  if (key === 'very_high') return 'Very high';
  if (key === 'high') return 'High';
  if (key === 'moderate') return 'Moderate';
  return 'Low';
}

function frustrationTone(level) {
  const key = String(level || 'low').toLowerCase();
  if (key === 'very_high') return 'critical';
  if (key === 'high') return 'warn';
  if (key === 'moderate') return 'caution';
  return 'ok';
}

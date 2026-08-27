import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildResearchDashboardSnapshot,
  downloadResearchCsv,
  downloadResearchJson,
} from '../data/researchDashboardData.js';
import {
  buildFrustrationChartModel,
  frustrationByTopic,
  frustrationPerformancePoints,
  learningStreak,
  seedHistoryFromLessons,
} from '../data/frustrationHistoryStore.js';
import { buildSageDashboardAdvice } from '../data/sageDashboardAdvice.js';
import { frustrationLevelFromScore } from '../data/frustrationModel.js';
import SageAvatar from '../avatar/SageAvatar.jsx';
import { createSpeechEngine } from '../avatar/createSpeechEngine.js';
import { friendlyStudentName } from '../avatar/kidFriendlySpeech.js';
import {
  AccuracyRing,
  FrustrationLineChart,
  FrustrationPerformanceChart,
  TopicBarChart,
} from './studentDashboardCharts.jsx';

/**
 * Student learning dashboard: frustration story, topics, progress, Sage advice.
 */
export default function ResearchDashboard({
  student,
  farm,
  telemetrySession,
  behavioralMetrics,
  misconceptions = [],
  rpEarned = 0,
  ddaMisses = 0,
  onBackToFarm,
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const speechRef = useRef(null);

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

  const { summary, frustration, lessonProgress } = snapshot;
  const liveScore = Math.max(0, Math.min(100, Number(frustration.score) || 0));
  const liveLevel =
    frustration.level || frustrationLevelFromScore(liveScore);

  const metrics = frustration.metrics || {};
  const sessionAnswered =
    (Number(metrics.correctAnswers) || 0) +
    (Number(metrics.incorrectAnswers) || 0);
  const answered = summary.totalAnswered || sessionAnswered || 0;
  const correct = summary.totalAnswered
    ? summary.totalCorrect
    : Number(metrics.correctAnswers) || 0;
  const incorrect = summary.totalAnswered
    ? summary.totalIncorrect
    : Number(metrics.incorrectAnswers) || 0;
  const accuracyPct =
    summary.overallAccuracyPct ??
    (sessionAnswered
      ? Math.round(
          ((Number(metrics.correctAnswers) || 0) / sessionAnswered) * 100,
        )
      : null);

  const lessonFingerprint = `${(lessonProgress || []).length}:${(lessonProgress || [])
    .map((row) => `${row.levelId}:${row.savedAt || ''}`)
    .join('|')}`;

  useEffect(() => {
    seedHistoryFromLessons(lessonProgress, liveScore);
    setHistoryTick((n) => n + 1);
    // lessonProgress identity changes every snapshot; fingerprint is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonFingerprint, liveScore]);

  const chartModel = useMemo(
    () =>
      buildFrustrationChartModel({
        score: liveScore,
        level: liveLevel,
        answered,
        correct,
        incorrect,
        accuracyPct,
      }),
    [liveScore, liveLevel, answered, correct, incorrect, accuracyPct, historyTick],
  );

  const topicRows = useMemo(
    () => frustrationByTopic(misconceptions),
    [misconceptions, historyTick],
  );
  const perfPoints = useMemo(() => {
    const pts = frustrationPerformancePoints();
    if (pts.some((p) => p.accuracyPct != null)) return pts;
    if (accuracyPct != null) {
      return [
        {
          at: Date.now(),
          score: liveScore,
          accuracyPct,
          retries: metrics.retries ?? summary.ddaMisses ?? 0,
          avgTimeSec: metrics.avgTimeSec,
        },
      ];
    }
    return pts;
  }, [liveScore, accuracyPct, metrics.retries, metrics.avgTimeSec, summary.ddaMisses, historyTick]);
  const streak = useMemo(() => learningStreak(), [historyTick]);
  const stickyTopic = topicRows[0]?.topic || null;
  const advice = useMemo(
    () =>
      buildSageDashboardAdvice({
        name:
          friendlyStudentName(student?.displayName || student?.username) ||
          student?.displayName,
        score: liveScore,
        level: liveLevel,
        consecutiveFails: frustration.consecutiveFails,
        accuracyPct,
        avgTimeSec: metrics.avgTimeSec,
        hints: metrics.hintUsage,
        retries: metrics.retries ?? summary.ddaMisses,
        stickyTopic,
        streak,
      }),
    [
      student,
      liveScore,
      liveLevel,
      frustration.consecutiveFails,
      accuracyPct,
      metrics.avgTimeSec,
      metrics.hintUsage,
      metrics.retries,
      summary.ddaMisses,
      stickyTopic,
      streak,
    ],
  );

  useEffect(() => {
    const engine = createSpeechEngine({
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
    speechRef.current = engine;
    const line = String(advice.spoken || '').slice(0, 320);
    const t = window.setTimeout(() => {
      engine.speak(line).catch(() => setSpeaking(false));
    }, 400);
    return () => {
      window.clearTimeout(t);
      engine.stop();
      speechRef.current = null;
    };
    // One greeting per dashboard visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedTopics = Math.max(
    summary.levelsCompleted || 0,
    topicRows.filter((t) => (t.answered || 0) > 0).length,
  );
  const band = advice.band;

  return (
    <div className="research-dash student-dash">
      <header className="research-dash-head student-dash-head">
        <div>
          <p className="research-dash-kicker">Discovery Grove · Your learning</p>
          <h2>{student?.displayName || 'Student'}&apos;s dashboard</h2>
          <p className="research-dash-sub">
            See how your frustration score changes, which topics feel sticky, and
            what Sage recommends next.
          </p>
        </div>
        <button
          type="button"
          className="research-btn research-btn-primary"
          onClick={onBackToFarm}
        >
          Back to farm
        </button>
      </header>

      <section className="sage-dash-card" aria-label="Sage advice">
        <SageAvatar
          speaking={speaking}
          mood={advice.mood}
          size="md"
          figureOnly
          onStop={() => {
            speechRef.current?.stop();
            setSpeaking(false);
          }}
        />
        <div className="sage-dash-copy" aria-live="polite">
          <p className="sage-dash-kicker">
            Sage&apos;s advice · frustration {liveScore}/100 ({bandLabel(band)})
          </p>
          <h3>{advice.headline}</h3>
          <p>{advice.body}</p>
          <p className="sage-dash-next">
            <strong>Next step:</strong> {advice.nextAction}
          </p>
          <p className="sage-dash-why">{advice.whyItMatters}</p>
        </div>
      </section>

      <section className="dash-story" aria-label="How frustration guides learning">
        <StoryStep
          n="1"
          title="Your performance"
          text={
            accuracyPct != null
              ? `${accuracyPct}% correct so far`
              : 'Play to build your quiz story'
          }
        />
        <span className="dash-story-arrow" aria-hidden>
          →
        </span>
        <StoryStep
          n="2"
          title="Frustration score"
          text={`${liveScore} · ${bandLabel(band)}`}
          tone={band}
        />
        <span className="dash-story-arrow" aria-hidden>
          →
        </span>
        <StoryStep n="3" title="Sage advice" text="Personalized for this score" />
        <span className="dash-story-arrow" aria-hidden>
          →
        </span>
        <StoryStep n="4" title="What to do" text={shortAction(advice.nextAction)} />
      </section>

      <section className="dash-hero-frust" aria-label="Current frustration score">
        <div className={`dash-score-orb is-${band}`}>
          <span>Now</span>
          <strong>{liveScore}</strong>
          <em>/ 100</em>
        </div>
        <div className="dash-score-copy">
          <h3>Frustration score</h3>
          <p>
            This number goes up when questions feel heavy (misses, long waits,
            extra retries) and comes down when you recover.
          </p>
          {frustration.journey?.headline ? (
            <p className="research-journey-headline">{frustration.journey.headline}</p>
          ) : null}
          <ul className="dash-band-pills">
            <li className={band === 'low' ? 'is-on is-low' : 'is-low'}>
              Low 0–30
            </li>
            <li className={band === 'moderate' ? 'is-on is-moderate' : 'is-moderate'}>
              Moderate 31–60
            </li>
            <li className={band === 'high' ? 'is-on is-high' : 'is-high'}>
              High 61–100
            </li>
          </ul>
        </div>
      </section>

      <div className="research-panels student-dash-grid">
        <article className="research-panel">
          <header className="research-panel-head">
            <h3>Frustration over time</h3>
            <p>{chartModel.subtitle}</p>
          </header>
          <FrustrationLineChart series={chartModel.series} />
          {chartModel.note ? (
            <p className="dash-chart-note">{chartModel.note}</p>
          ) : null}
          <ul className="dash-chart-legend" aria-hidden>
            <li className="is-low">Low 0–30</li>
            <li className="is-moderate">Moderate 31–60</li>
            <li className="is-high">High 61–100</li>
          </ul>
        </article>

        <article className="research-panel">
          <header className="research-panel-head">
            <h3>Frustration by topic</h3>
            <p>Higher bars mean that chapter felt heavier</p>
          </header>
          <TopicBarChart rows={topicRows} />
        </article>
      </div>

      <section aria-label="Learning progress">
        <header className="research-panel-head dash-section-head">
          <h3>Learning progress</h3>
          <p>Simple stats from your farm quizzes</p>
        </header>
        <div className="dash-stat-grid">
          <article className="dash-stat">
            <span>Questions answered</span>
            <strong>{answered}</strong>
          </article>
          <article className="dash-stat dash-stat-ring">
            <AccuracyRing correct={correct} incorrect={incorrect} />
            <div>
              <span>Correct vs incorrect</span>
              <p>
                {correct} right · {incorrect} to retry
              </p>
            </div>
          </article>
          <article className="dash-stat">
            <span>Retry attempts</span>
            <strong>{metrics.retries ?? summary.ddaMisses ?? 0}</strong>
          </article>
          <article className="dash-stat">
            <span>Hints used</span>
            <strong>{metrics.hintUsage ?? 0}</strong>
          </article>
          <article className="dash-stat">
            <span>Average answer time</span>
            <strong>
              {metrics.avgTimeSec != null
                ? `${Number(metrics.avgTimeSec).toFixed(1)}s`
                : '—'}
            </strong>
          </article>
          <article className="dash-stat">
            <span>Completed topics</span>
            <strong>{completedTopics}</strong>
          </article>
          <article className="dash-stat">
            <span>Learning streak</span>
            <strong>
              {streak} day{streak === 1 ? '' : 's'}
            </strong>
          </article>
        </div>
      </section>

      <article className="research-panel research-panel-full">
        <header className="research-panel-head">
          <h3>Frustration and performance</h3>
          <p>
            Each dot is a recent quiz moment. Left = lower accuracy. Up = higher
            frustration.
          </p>
        </header>
        {perfPoints.some((p) => p.accuracyPct != null) ? (
          <FrustrationPerformanceChart points={perfPoints} />
        ) : (
          <p className="research-empty">
            After a few farm questions, dots will show whether misses and slow
            answers lift your frustration score.
          </p>
        )}
        <ul className="dash-insights">
          <li>
            {performanceInsight(
              perfPoints,
              metrics.retries ?? summary.ddaMisses,
              metrics.avgTimeSec,
            )}
          </li>
          <li>
            Repeated misses in a row currently: {frustration.consecutiveFails || 0}
          </li>
          <li>
            Sage opened {frustration.triggerCount || 0} time
            {(frustration.triggerCount || 0) === 1 ? '' : 's'} this session to help
          </li>
          {stickyTopic ? (
            <li>
              Stickiest topic right now: <strong>{stickyTopic}</strong>
            </li>
          ) : null}
        </ul>
      </article>

      <footer className="research-dash-foot student-dash-foot">
        <button
          type="button"
          className="research-btn research-btn-ghost"
          onClick={() => setExportOpen((v) => !v)}
        >
          {exportOpen ? 'Hide' : 'Show'} research export
        </button>
        {exportOpen ? (
          <div className="student-dash-export">
            <p>For your project log — CSV and JSON of this snapshot.</p>
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
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function StoryStep({ n, title, text, tone }) {
  return (
    <div className={`dash-story-step${tone ? ` is-${tone}` : ''}`}>
      <span>{n}</span>
      <strong>{title}</strong>
      <em>{text}</em>
    </div>
  );
}

function bandLabel(band) {
  if (band === 'high') return 'High';
  if (band === 'moderate') return 'Moderate';
  return 'Low';
}

function shortAction(text) {
  const t = String(text || '');
  return t.length > 52 ? `${t.slice(0, 51).trim()}…` : t;
}

function performanceInsight(points, retries, avgTime) {
  const pts = (points || []).filter((p) => p && p.accuracyPct != null);
  if (pts.length >= 3) {
    const high = pts.filter((p) => p.score >= 50);
    const low = pts.filter((p) => p.score < 50);
    if (high.length && low.length) {
      const avgHigh =
        high.reduce((s, p) => s + Number(p.accuracyPct), 0) / high.length;
      const avgLow =
        low.reduce((s, p) => s + Number(p.accuracyPct), 0) / low.length;
      if (avgHigh < avgLow - 4) {
        return 'When your accuracy drops, your frustration score often rises. That is the signal Sage uses to slow the farm down.';
      }
    }
  }
  if ((Number(retries) || 0) >= 2) {
    return 'Extra retries tend to lift frustration. Sage treats that as “this question was tough,” not as a failing grade.';
  }
  if (Number.isFinite(Number(avgTime)) && Number(avgTime) >= 25) {
    return 'Longer answer times often travel with a higher frustration score. A short pause can bring both down.';
  }
  return 'Frustration score is the bridge between how you perform and how Sage helps you next.';
}

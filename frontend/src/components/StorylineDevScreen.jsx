import { useEffect, useMemo, useState } from 'react';
import {
  buildFrustrationProfile,
  clearStoredStoryline,
  clearStorylineProgress,
  getAptitudePerformance,
  loadStoredStoryline,
  requestLevelStoryline,
  saveStoredStoryline,
} from '../storyline/index.js';

/**
 * Development screen: mock aptitude → frustration profile → Grok Level 1 storyline.
 */
export default function StorylineDevScreen({ student, onContinue, onLogout }) {
  const performance = useMemo(
    () => getAptitudePerformance(student?.id),
    [student?.id],
  );
  const profile = useMemo(
    () => (performance ? buildFrustrationProfile(performance) : null),
    [performance],
  );

  const [record, setRecord] = useState(() =>
    loadStoredStoryline(student?.id),
  );
  const [requestId, setRequestId] = useState(0);
  const [status, setStatus] = useState(
    loadStoredStoryline(student?.id) ? 'ready' : 'idle',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return undefined;
    if (requestId === 0) {
      const cached = loadStoredStoryline(student?.id);
      if (cached?.storyline) {
        setRecord(cached);
        setStatus('ready');
        return undefined;
      }
    }

    let cancelled = false;

    async function run() {
      setStatus('generating');
      setError('');
      try {
        const result = await requestLevelStoryline({
          studentId: profile.studentId,
          studentName: profile.studentName,
          grade: profile.grade,
          level: 1,
          scienceTopic: profile.scienceTopic,
          frustrationScore: profile.frustrationScore,
          frustrationLevel: profile.frustrationLevel,
          metrics: profile.metrics,
          dominantIndicators: profile.dominantIndicators,
        });
        if (cancelled) return;
        const storyline = result?.storyline;
        if (!storyline) {
          setError(result?.error || 'Storyline response was empty.');
          setStatus('error');
          return;
        }
        const saved = saveStoredStoryline({
          studentId: profile.studentId,
          studentName: profile.studentName,
          level: 1,
          frustrationScore: profile.frustrationScore,
          frustrationLevel: profile.frustrationLevel,
          frustrationMetrics: profile.metrics,
          dominantIndicators: profile.dominantIndicators,
          storyline,
          createdAt: new Date().toISOString(),
          provider: result.provider,
          fallback: result.fallback,
        });
        setRecord(saved);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [profile, requestId, student?.id]);

  const regenerate = () => {
    clearStoredStoryline(student?.id);
    clearStorylineProgress(student?.id);
    setRecord(null);
    setError('');
    setRequestId((n) => n + 1);
  };

  if (!performance || !profile) {
    return (
      <div className="storyline-dev">
        <div className="storyline-dev-card">
          <p className="student-login-kicker">SCI_PATH · Storyline prototype</p>
          <h1>No mock aptitude data</h1>
          <p>This login is not one of the three mock aptitude profiles.</p>
          <button type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  const story = record?.storyline;
  const indicators = profile.dominantIndicators || [];

  return (
    <div className="storyline-dev">
      <div className="storyline-dev-card">
        <p className="student-login-kicker">SCI_PATH · Storyline prototype</p>
        <header className="storyline-dev-head">
          <div>
            <h1>Student: {profile.studentName}</h1>
            <p>Grade {profile.grade} · {profile.scienceTopic}</p>
          </div>
          <button type="button" className="student-logout" onClick={onLogout}>
            Log out
          </button>
        </header>

        <section className="storyline-dev-panel">
          <h2>Performance Profile</h2>
          <p>{profile.performanceLabel}</p>
        </section>

        <section className="storyline-dev-panel">
          <h2>Frustration Score</h2>
          <p className="storyline-dev-score">
            {profile.frustrationScore} / 100
          </p>
          <p>
            Frustration Level: <strong>{profile.frustrationLevel}</strong>
          </p>
          <p className="storyline-dev-note">
            Calculated from mock aptitude-test metrics — not assigned by hand.
          </p>
        </section>

        <section className="storyline-dev-panel">
          <h2>Top Indicators</h2>
          {indicators.length === 0 ? (
            <p>None significant</p>
          ) : (
            <ul>
              {indicators.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <hr className="storyline-dev-rule" />

        {status === 'generating' && (
          <p className="storyline-dev-status">Generating Level 1 Storyline…</p>
        )}
        {status === 'error' && (
          <p className="student-login-error">{error}</p>
        )}
        {record?.fallback && (
          <p className="storyline-dev-note">
            Offline / fallback storyline (Grok API unreachable or returned invalid JSON).
          </p>
        )}

        {story && (
          <section className="storyline-dev-story">
            <h2>Level {story.level || 1} Storyline</h2>
            <p>
              <strong>Title:</strong> {story.title}
            </p>
            <p>
              <strong>Setting:</strong> {story.setting || story.theme}
            </p>
            <p>
              <strong>Tone:</strong> {story.narrativeTone}
            </p>
            {story.levelSummary && (
              <p>
                <strong>Level summary:</strong> {story.levelSummary}
              </p>
            )}
            <p className="storyline-dev-body">
              <strong>Introduction</strong>
              <br />
              {story.introduction || story.story}
            </p>
            {story.mainProblem && (
              <p>
                <strong>Main problem:</strong> {story.mainProblem}
              </p>
            )}
            <p>
              <strong>Main objective:</strong>{' '}
              {story.mainObjective || story.objective}
            </p>

            {(story.storyProgression || []).length > 0 && (
              <>
                <p>
                  <strong>Story progression</strong>
                </p>
                <ol className="storyline-dev-stages">
                  {story.storyProgression.map((step) => (
                    <li key={step.stage || step.title}>
                      <strong>
                        Stage {step.stage}: {step.title}
                      </strong>
                      <p>{step.narrative}</p>
                      <p>
                        <em>Stage objective:</em> {step.objective}
                      </p>
                      {step.transition && (
                        <p>
                          <em>Because of this…</em> {step.transition}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}

            {story.complication && (
              <p className="storyline-dev-body">
                <strong>Complication</strong>
                <br />
                {story.complication.description}
                {story.complication.impactOnStory && (
                  <>
                    <br />
                    <em>Impact:</em> {story.complication.impactOnStory}
                  </>
                )}
              </p>
            )}

            {story.climax && (
              <p className="storyline-dev-body">
                <strong>Climax</strong>
                <br />
                {story.climax.description}
                {story.climax.objective && (
                  <>
                    <br />
                    <em>Climax objective:</em> {story.climax.objective}
                  </>
                )}
              </p>
            )}

            {story.resolution && (
              <p className="storyline-dev-body">
                <strong>Resolution</strong>
                <br />
                {story.resolution}
              </p>
            )}

            {story.ending && (
              <p className="storyline-dev-body">
                <strong>Ending</strong>
                <br />
                {story.ending}
              </p>
            )}

            {Array.isArray(story.progression) &&
              story.progression.length > 0 &&
              !story.storyProgression && (
                <ol>
                  {story.progression.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
          </section>
        )}

        <div className="storyline-dev-actions">
          <button type="button" onClick={regenerate} disabled={status === 'generating'}>
            Regenerate storyline
          </button>
          <button
            type="button"
            className="storyline-dev-continue"
            onClick={() => onContinue?.(story)}
            disabled={!story}
          >
            Continue to farm
          </button>
        </div>
      </div>
    </div>
  );
}

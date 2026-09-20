import { useMemo, useState } from 'react';
import { generateScienceMindMap, GRADES } from '../data/scienceMindMapApi.js';
import ScienceMindMapCanvas from './ScienceMindMapCanvas.jsx';

function defaultGrade(student) {
  const n = Number(student?.grade);
  return GRADES.includes(n) ? n : 6;
}

export default function ScienceMindMapView({ student, telemetrySession }) {
  const [grade, setGrade] = useState(() => defaultGrade(student));
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const liveScore = telemetrySession?.frustrationScore;
  const hint = useMemo(() => {
    if (liveScore == null) return 'Uses your saved farm frustration score. If none exists, the map uses a moderate default.';
    return `Your current farm frustration score is ${liveScore}. That only changes how simple the map looks — not the Science facts.`;
  }, [liveScore]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = await generateScienceMindMap({
        grade,
        question,
        studentId: student?.id,
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the mind map');
    } finally {
      setBusy(false);
    }
  };

  const map = result?.mind_map;

  return (
    <section className="science-mindmap-view">
      <div className="science-mindmap-intro">
        <p className="science-mindmap-kicker">Grade {grade} Science</p>
        <h2>Personalized mind map</h2>
        <p>{hint}</p>
      </div>

      <form className="science-mindmap-form" onSubmit={onSubmit}>
        <label>
          Grade
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {GRADES.map((item) => (
              <option key={item} value={item}>
                Grade {item}
              </option>
            ))}
          </select>
        </label>
        <label className="science-mindmap-question">
          What do you want to understand?
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Why do plants need sunlight?"
          />
        </label>
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? 'Building map…' : 'Generate mind map'}
        </button>
      </form>

      {error ? <p className="science-mindmap-error">{error}</p> : null}

      {result?.status === 'insufficient_context' ? (
        <div className="science-mindmap-empty">
          <h3>Not enough textbook content</h3>
          <p>{result.message}</p>
        </div>
      ) : null}

      {map ? (
        <div className="science-mindmap-result">
          <ScienceMindMapCanvas mindMap={map} />
          {map.summary ? <p className="science-mindmap-summary">{map.summary}</p> : null}
          {map.one_sentence_summary ? (
            <p className="science-mindmap-one-liner">
              <strong>In one sentence:</strong> {map.one_sentence_summary}
            </p>
          ) : null}

          <div className="science-mindmap-branches">
            {map.branches.map((branch) => (
              <article key={branch.id}>
                <h3>{branch.title}</h3>
                <ul>
                  {(branch.points || []).map((point) => (
                    <li key={point.id}>{point.text}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {map.key_terms?.length ? (
            <div className="science-mindmap-terms">
              <h3>Key terms</h3>
              <ul>
                {map.key_terms.map((item) => (
                  <li key={item.term}>
                    <strong>{item.term}</strong>
                    {item.meaning ? ` — ${item.meaning}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {map.examples?.length ? (
            <div>
              <h3>Examples</h3>
              <ul>
                {map.examples.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {map.remember_this?.length ? (
            <div>
              <h3>Remember this</h3>
              <ul>
                {map.remember_this.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.sources?.length ? (
            <div className="science-mindmap-sources">
              <h3>Textbook sources</h3>
              <ul>
                {result.sources.map((source) => (
                  <li key={source.chunk_id}>
                    {source.textbook}
                    {source.chapter ? ` · ${source.chapter}` : ''}
                    {source.page != null ? ` · p.${source.page}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

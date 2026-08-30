/**
 * Lightweight SVG charts for the student dashboard (no chart library).
 */
import { buildQuizRoundRows } from './studentDashboardQuestions.js';

function pickTickIndices(n) {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n <= 6) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / 5);
  const ticks = [0];
  for (let i = step; i < n - 1; i += step) ticks.push(i);
  const last = n - 1;
  if (last - ticks[ticks.length - 1] < 2) ticks[ticks.length - 1] = last;
  else ticks.push(last);
  return ticks;
}

export function FrustrationLineChart({ series = [], height = 220 }) {
  const width = 640;
  const pad = { l: 40, r: 64, t: 16, b: 36 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const rows = series || [];
  const points = rows.map((row, i) => ({
    ...row,
    i,
    x: pad.l + (rows.length <= 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW),
    y:
      row.score == null
        ? null
        : pad.t + innerH - (Math.max(0, Math.min(100, row.score)) / 100) * innerH,
  }));
  const known = points.filter((p) => p.y != null);

  if (!known.length) {
    return (
      <p className="research-empty">
        Play a farm quiz and your frustration line will appear here.
      </p>
    );
  }

  const path = known
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const ticks = new Set(pickTickIndices(points.length));
  const lastTick = points.length - 1;

  const yFor = (score) => pad.t + innerH - (score / 100) * innerH;

  const band = (from, to, color) => {
    const y1 = yFor(to);
    const h = ((to - from) / 100) * innerH;
    return (
      <rect
        x={pad.l}
        y={y1}
        width={innerW}
        height={h}
        fill={color}
      />
    );
  };

  return (
    <svg
      className="dash-line-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Frustration score over time. Green band is low, gold is moderate, coral is high."
    >
      {band(0, 30, 'rgba(88, 176, 80, 0.16)')}
      {band(30, 60, 'rgba(232, 176, 48, 0.16)')}
      {band(60, 100, 'rgba(220, 96, 64, 0.14)')}
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={yFor(30)}
        y2={yFor(30)}
        className="dash-chart-guide"
      />
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={yFor(60)}
        y2={yFor(60)}
        className="dash-chart-guide"
      />
      {path ? <path d={path} className="dash-line-path" fill="none" /> : null}
      {known.map((p) => (
        <circle key={p.date || p.i} cx={p.x} cy={p.y} r="5" className="dash-line-dot" />
      ))}
      {points.map((p, i) => {
        if (!ticks.has(i)) return null;
        const anchor =
          i === 0 && lastTick > 0 ? 'start' : i === lastTick && lastTick > 0 ? 'end' : 'middle';
        return (
          <text
            key={`l-${p.date || i}`}
            x={p.x}
            y={height - 8}
            textAnchor={anchor}
            className="dash-chart-label"
          >
            {p.label}
          </text>
        );
      })}
      <text x={4} y={pad.t + 10} className="dash-chart-axis">
        100
      </text>
      <text x={width - 8} y={yFor(80) + 4} textAnchor="end" className="dash-chart-axis">
        High
      </text>
      <text x={width - 8} y={yFor(45) + 4} textAnchor="end" className="dash-chart-axis">
        Moderate
      </text>
      <text x={width - 8} y={yFor(15) + 4} textAnchor="end" className="dash-chart-axis">
        Low
      </text>
      <text x={8} y={pad.t + innerH + 4} className="dash-chart-axis">
        0
      </text>
    </svg>
  );
}

export function TopicBarChart({ rows = [] }) {
  if (!rows.length) {
    return (
      <p className="research-empty">
        Answer farm questions to see which science chapters feel easier or harder.
      </p>
    );
  }
  const max = Math.max(100, ...rows.map((r) => Number(r.avgScore) || 0));
  return (
    <ul className="dash-bars">
      {rows.map((row) => {
        const score = Math.max(0, Math.min(100, Number(row.avgScore) || 0));
        const width = Math.max(8, (score / max) * 100);
        const tone =
          score >= 61 ? 'high' : score >= 31 ? 'moderate' : 'low';
        return (
          <li key={row.topicId || row.topic}>
            <div className="dash-bar-meta">
              <strong>{row.topic}</strong>
              <span>
                {score} · {row.misses || 0} miss{row.misses === 1 ? '' : 'es'}
              </span>
            </div>
            <div className="dash-bar-track">
              <div
                className={`dash-bar-fill is-${tone}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AccuracyRing({ correct = 0, incorrect = 0 }) {
  const c = Number(correct) || 0;
  const w = Number(incorrect) || 0;
  const total = c + w;
  const pct = total ? Math.round((c / total) * 100) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="dash-ring">
      <svg viewBox="0 0 96 96" aria-hidden>
        <circle className="dash-ring-bg" cx="48" cy="48" r={r} />
        <circle
          className="dash-ring-fg"
          cx="48"
          cy="48"
          r={r}
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 48 48)"
        />
      </svg>
      <div className="dash-ring-label">
        <strong>{total ? `${pct}%` : '—'}</strong>
        <span>correct</span>
      </div>
    </div>
  );
}

export function FrustrationPerformanceChart({
  points = [],
  misconceptions = [],
  liveHistory = [],
}) {
  const rows = buildQuizRoundRows(points, misconceptions, liveHistory);

  if (!rows.length) {
    return (
      <p className="research-empty">
        Play a farm quiz and each question will show up here: the type, the
        question, how it felt, and whether you got it right.
      </p>
    );
  }

  return (
    <div className="dash-quiz-rounds-wrap">
    <p className="dash-quiz-round-count">
      {rows.length} question{rows.length === 1 ? '' : 's'} from this play
    </p>
    <ol className="dash-quiz-rounds" aria-label="Every farm question you faced">
      {rows.map((row) => (
        <li
          key={row.key}
          className={`dash-quiz-round is-${row.mood.band}${row.latest ? ' is-latest' : ''}`}
        >
          <span className="dash-quiz-round-face" aria-hidden>
            {row.mood.emoji}
          </span>
          <div className="dash-quiz-round-body">
            <div className="dash-quiz-round-meta">
              <em className="dash-quiz-round-type">{row.typeLabel}</em>
              <strong>
                Question {row.n}
                {row.latest ? ' · latest' : ''}
              </strong>
              <span>
                {row.correct === true
                  ? 'Got it right'
                  : row.correct === false
                    ? 'Missed'
                    : `Felt ${row.mood.label.toLowerCase()}`}
              </span>
            </div>
            {row.prompt ? (
              <p className="dash-quiz-round-prompt">{row.prompt}</p>
            ) : (
              <p className="dash-quiz-round-prompt is-missing">
                Question text was not saved for this round.
              </p>
            )}
            <p className="dash-quiz-round-answer">
              <span>Your answer</span>
              <strong>
                {row.studentAnswer ||
                  (row.correct === false
                    ? 'No answer recorded'
                    : '—')}
              </strong>
            </p>
            {row.correct === false && row.correctAnswer ? (
              <p className="dash-quiz-round-answer is-key">
                <span>Correct answer</span>
                <strong>{row.correctAnswer}</strong>
              </p>
            ) : null}
            <div
              className="dash-quiz-round-meter"
              role="img"
              aria-label={`How hard it felt: ${row.feel} out of 100`}
            >
              <div
                className={`dash-quiz-round-fill is-${row.mood.band}`}
                style={{ width: `${Math.max(8, row.feel)}%` }}
              />
            </div>
            <p className="dash-quiz-round-stats">
              Felt {row.mood.label.toLowerCase()} · {row.feel} / 100
            </p>
          </div>
        </li>
      ))}
    </ol>
    <p className="dash-quiz-round-types-note">
      Types: MCQ · True / False · Fill in the blanks · Typed answer
    </p>
    </div>
  );
}

/**
 * Lightweight SVG charts for the student dashboard (no chart library).
 */

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
        Answer farm questions to see which science topics feel easier or harder.
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
          <li key={row.topic}>
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

export function FrustrationPerformanceChart({ points = [] }) {
  const width = 640;
  const height = 260;
  const pad = { l: 56, r: 18, t: 36, b: 44 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const pts = (points || []).filter(
    (p) => p && p.score != null && p.accuracyPct != null,
  );

  const xy = pts.map((p, i) => ({
    ...p,
    i,
    x: pad.l + (Math.max(0, Math.min(100, p.accuracyPct)) / 100) * innerW,
    y: pad.t + innerH - (Math.max(0, Math.min(100, p.score)) / 100) * innerH,
    mood: moodForScore(p.score),
  }));

  const path = xy
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  if (!xy.length) {
    return (
      <p className="research-empty">
        After a few farm questions, this playground fills with faces that show
        how each quiz felt.
      </p>
    );
  }

  return (
    <div className="dash-feel-board">
      <svg
        className="dash-scatter-chart dash-feel-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="How quizzes felt versus how many questions you got right"
      >
        <rect
          x={pad.l}
          y={pad.t}
          width={innerW}
          height={innerH / 2}
          className="dash-feel-zone is-high"
        />
        <rect
          x={pad.l}
          y={pad.t + innerH / 2}
          width={innerW}
          height={innerH / 2}
          className="dash-feel-zone is-low"
        />
        <line
          x1={pad.l + innerW / 2}
          x2={pad.l + innerW / 2}
          y1={pad.t}
          y2={pad.t + innerH}
          className="dash-chart-guide"
        />
        <text x={pad.l + 8} y={pad.t + 16} className="dash-feel-hint">
          Tough round 😣
        </text>
        <text
          x={pad.l + innerW - 8}
          y={pad.t + innerH - 10}
          textAnchor="end"
          className="dash-feel-hint is-good"
        >
          Nailed it! 🌟
        </text>
        {path ? <path d={path} className="dash-feel-path" fill="none" /> : null}
        {xy.map((p) => (
          <g key={p.at || p.i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="14"
              className={`dash-feel-blob is-${p.mood.band}`}
            />
            <text
              x={p.x}
              y={p.y + 5}
              textAnchor="middle"
              className="dash-feel-emoji"
            >
              {p.mood.emoji}
            </text>
            <title>
              {p.mood.label}: frustration {Math.round(p.score)} · quiz{' '}
              {Math.round(p.accuracyPct)}%
            </title>
          </g>
        ))}
        <text x={12} y={pad.t + 14} className="dash-chart-axis">
          Stuck
        </text>
        <text x={14} y={pad.t + 32} className="dash-feel-axis-emoji">
          😤
        </text>
        <text x={14} y={pad.t + innerH / 2 + 6} className="dash-feel-axis-emoji">
          😐
        </text>
        <text x={8} y={pad.t + innerH - 8} className="dash-chart-axis">
          Calm
        </text>
        <text x={14} y={pad.t + innerH + 10} className="dash-feel-axis-emoji">
          😊
        </text>
        <text
          x={width / 2}
          y={height - 10}
          textAnchor="middle"
          className="dash-chart-label"
        >
          Quiz stars → more right answers
        </text>
      </svg>
      <ul className="dash-feel-legend" aria-hidden>
        <li className="is-low">😊 Calm 0–30</li>
        <li className="is-moderate">😐 A bit stuck 31–60</li>
        <li className="is-high">😣 Whoa 61–100</li>
      </ul>
    </div>
  );
}

function moodForScore(score) {
  const n = Number(score) || 0;
  if (n <= 30) return { emoji: '😊', band: 'low', label: 'Calm' };
  if (n <= 60) return { emoji: '😐', band: 'moderate', label: 'A bit stuck' };
  return { emoji: '😣', band: 'high', label: 'Whoa' };
}

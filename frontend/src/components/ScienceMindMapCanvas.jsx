function polar(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wrapLabel(text, max = 22) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * SVG Science mind map — central concept with radiating branches.
 */
export default function ScienceMindMapCanvas({ mindMap }) {
  if (!mindMap) return null;
  const branches = Array.isArray(mindMap.branches) ? mindMap.branches : [];
  const width = 920;
  const height = Math.max(420, 220 + branches.length * 70);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;
  const angleStep = branches.length ? 360 / branches.length : 0;

  return (
    <div className="science-mindmap-canvas-wrap">
      <svg
        className="science-mindmap-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={mindMap.central_concept || mindMap.title || 'Science mind map'}
      >
        {branches.map((branch, index) => {
          const angle = index * angleStep;
          const end = polar(cx, cy, radius, angle);
          const label = wrapLabel(branch.title);
          return (
            <g key={branch.id || index}>
              <line
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                className="science-mindmap-edge"
              />
              <circle cx={end.x} cy={end.y} r="54" className="science-mindmap-branch" />
              {label.map((line, lineIndex) => (
                <text
                  key={line}
                  x={end.x}
                  y={end.y - ((label.length - 1) * 7) + lineIndex * 14}
                  textAnchor="middle"
                  className="science-mindmap-branch-label"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="72" className="science-mindmap-hub" />
        {wrapLabel(mindMap.central_concept || mindMap.title, 18).map((line, index, all) => (
          <text
            key={line}
            x={cx}
            y={cy - ((all.length - 1) * 8) + index * 16}
            textAnchor="middle"
            className="science-mindmap-hub-label"
          >
            {line}
          </text>
        ))}
      </svg>
    </div>
  );
}

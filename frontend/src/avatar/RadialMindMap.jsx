/**
 * Sports-style radial keyword mind map used for every Science question.
 */
import { useMemo } from 'react';
import { layoutRadialMap, toRadialModel } from './radialMindMap.js';
import './radialMindMap.css';

function TextLines({ x, y, lines, size, fill }) {
  const start = y - ((lines.length - 1) * (size + 2)) / 2 + size / 3;
  return (
    <text
      x={x}
      y={start}
      textAnchor="middle"
      fontSize={size}
      fill={fill}
    >
      {lines.map((line, i) => (
        <tspan key={`${line}-${i}`} x={x} dy={i ? size + 2 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function matchesSpeech(label, speechWord) {
  const a = String(label || '').toLowerCase();
  const b = String(speechWord || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!a || !b || b.length < 3) return false;
  return a.includes(b) || b.includes(a.replace(/[^a-z0-9]+/g, '').slice(0, 12));
}

export default function RadialMindMap({
  map = null,
  branches = [],
  activeId = null,
  speechWord = '',
  compact = false,
  onHubSelect = null,
}) {
  const model = useMemo(() => toRadialModel(map, branches), [map, branches]);
  const layout = useMemo(
    () =>
      layoutRadialMap(model, {
        width: compact ? 640 : 920,
        height: compact ? 460 : 640,
      }),
    [model, compact],
  );

  if (!layout.hubs.length) return null;

  const { width, height, cx, cy, center, hubs } = layout;

  return (
    <div className={`rmm${compact ? ' is-compact' : ''}`} aria-label="Science mind map">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {hubs.map((hub) => (
          <g key={`${hub.id}-lines`}>
            <line className="rmm-line" x1={cx} y1={cy} x2={hub.x} y2={hub.y} />
            {hub.children.map((leaf) => (
              <line
                key={`${leaf.id}-line`}
                className="rmm-leaf-line"
                x1={hub.x}
                y1={hub.y}
                x2={leaf.x}
                y2={leaf.y}
              />
            ))}
          </g>
        ))}
        {hubs.map((hub) => (
          <g key={hub.id}>
            {hub.children.map((leaf) => {
              const speech = matchesSpeech(leaf.label, speechWord);
              return (
                <g
                  key={leaf.id}
                  className={`rmm-node${speech ? ' is-speech' : ''}`}
                >
                  <circle
                    cx={leaf.x}
                    cy={leaf.y}
                    r={leaf.r}
                    fill={leaf.color.fill}
                    stroke={leaf.color.stroke}
                    strokeWidth="2"
                  />
                  <TextLines
                    x={leaf.x}
                    y={leaf.y}
                    lines={leaf.lines}
                    size={11}
                    fill={leaf.color.text}
                  />
                </g>
              );
            })}
            <g
              className={`rmm-node${hub.branchId === activeId ? ' is-on' : ''}${
                matchesSpeech(hub.label, speechWord) ? ' is-speech' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                const branch = branches.find((b) => b.id === hub.branchId);
                if (branch) onHubSelect?.(branch);
              }}
            >
              <circle
                cx={hub.x}
                cy={hub.y}
                r={hub.r}
                fill={hub.color.fill}
              />
              <TextLines
                x={hub.x}
                y={hub.y}
                lines={hub.lines}
                size={13}
                fill={hub.color.text}
              />
            </g>
          </g>
        ))}
        <g
          className={`rmm-node${matchesSpeech(center.label, speechWord) ? ' is-speech' : ''}`}
        >
          <circle cx={cx} cy={cy} r={center.r} fill={center.color.fill} />
          <TextLines
            x={cx}
            y={cy}
            lines={center.lines}
            size={16}
            fill={center.color.text}
          />
        </g>
      </svg>
    </div>
  );
}

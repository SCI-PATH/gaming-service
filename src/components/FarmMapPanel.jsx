import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PLANT_PLOTS } from '../data/plantPlots.js';
import {
  ForestGameBridge,
  FARM_EVENTS,
} from './ForestGameBridge.js';

/** Full farm map size in tiles (matches public/assets/maps/map.json). */
export const FARM_MAP_TILES = { width: 100, height: 75 };

/**
 * Farm map where the YOU pin blinks and moves with the student in real time.
 */
export default function FarmMapPanel({
  playerMapX,
  playerMapY,
  compact = false,
}) {
  const { width, height } = FARM_MAP_TILES;
  const pinRef = useRef(null);
  const guideRef = useRef(null);
  const [pos, setPos] = useState({
    x: Number.isFinite(playerMapX) ? playerMapX : 48,
    y: Number.isFinite(playerMapY) ? playerMapY : 32,
  });

  // Live feed directly from Phaser (also accepts props from App)
  useEffect(() => {
    const apply = (xRaw, yRaw) => {
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) return;
      const x = clamp(xRaw, 0, width - 0.01);
      const y = clamp(yRaw, 0, height - 0.01);
      setPos({ x, y });
      movePin(pinRef.current, guideRef.current, x, y, width, height);
    };

    const onBridge = (payload = {}) => {
      apply(Number(payload.playerMapX), Number(payload.playerMapY));
    };

    const onWindow = (event) => {
      const d = event.detail || {};
      apply(Number(d.playerMapX), Number(d.playerMapY));
    };

    ForestGameBridge.on(FARM_EVENTS.PLAYER_MAP_POS, onBridge);
    window.addEventListener('scipath-player-map', onWindow);

    return () => {
      ForestGameBridge.off(FARM_EVENTS.PLAYER_MAP_POS, onBridge);
      window.removeEventListener('scipath-player-map', onWindow);
    };
  }, [width, height]);

  // Props path (App → panel) stays in sync too
  useLayoutEffect(() => {
    if (!Number.isFinite(playerMapX) || !Number.isFinite(playerMapY)) return;
    const x = clamp(playerMapX, 0, width - 0.01);
    const y = clamp(playerMapY, 0, height - 0.01);
    setPos({ x, y });
    movePin(pinRef.current, guideRef.current, x, y, width, height);
  }, [playerMapX, playerMapY, width, height]);

  const px = pos.x;
  const py = pos.y;
  const tileX = Math.floor(px);
  const tileY = Math.floor(py);
  const nearest = nearestBed(px, py);
  const guide = nearest ? directionGuide(px, py, nearest) : null;

  return (
    <aside
      className={`farm-map-panel${compact ? ' is-compact' : ''}`}
      aria-label="Farm map — your blinking location moves as you run"
    >
      <div className="farm-map-head">
        <strong>Farm Map</strong>
        <span>Green blink moves with you</span>
      </div>

      <div
        className="farm-map-canvas"
        role="img"
        aria-label={`You are moving at column ${tileX}, row ${tileY}`}
      >
        <div className="farm-map-grid">
          <svg
            ref={guideRef}
            className="farm-map-guide"
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
          >
            {nearest && (
              <line
                x1={px}
                y1={py}
                x2={nearest.x + nearest.w / 2}
                y2={nearest.y + nearest.h / 2}
                className="farm-map-guide-line"
              />
            )}
          </svg>

          {PLANT_PLOTS.map((plot) => {
            const cx = ((plot.x + plot.w / 2) / width) * 100;
            const cy = ((plot.y + plot.h / 2) / height) * 100;
            const isClosest = nearest?.id === plot.id;
            return (
              <div
                key={plot.id}
                className={`farm-map-bed${isClosest ? ' is-closest' : ''}`}
                style={{ left: `${cx}%`, top: `${cy}%` }}
                title={plot.label}
              >
                <span>{shortLabel(plot)}</span>
              </div>
            );
          })}

          {/* left/top owned by JS — do not bind to React style or re-renders fight movement */}
          <div
            ref={pinRef}
            className="farm-map-you is-blinking"
            title="You — moves as you run"
          >
            <span className="farm-map-you-ring" />
            <span className="farm-map-you-dot" />
            <span className="farm-map-you-label">YOU</span>
          </div>
        </div>
      </div>

      <p className="farm-map-location">
        <span className="farm-map-location-dot is-blinking" />
        You are here
        <strong>
          col {tileX} · row {tileY}
        </strong>
      </p>

      <ul className="farm-map-legend">
        <li>
          <i className="farm-map-key farm-map-key-you is-blinking" /> You
        </li>
        <li>
          <i className="farm-map-key farm-map-key-bed" /> Plant bed
        </li>
      </ul>

      {nearest && guide && (
        <p className="farm-map-hint">
          Go to <strong>{nearest.label}</strong>: {guide.arrow} {guide.text}
        </p>
      )}
    </aside>
  );
}

function movePin(pinEl, guideEl, x, y, mapW, mapH) {
  if (pinEl) {
    pinEl.style.left = `${(x / mapW) * 100}%`;
    pinEl.style.top = `${(y / mapH) * 100}%`;
  }
  if (guideEl) {
    const line = guideEl.querySelector('line');
    if (line) {
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(y));
    }
  }
}

function shortLabel(plot) {
  if (plot.id.includes('west') && plot.id.includes('south')) return 'SW';
  if (plot.id.includes('east') && plot.id.includes('south')) return 'SE';
  if (plot.id.includes('west')) return 'W';
  if (plot.id.includes('east')) return 'E';
  return 'P';
}

function nearestBed(tileX, tileY) {
  let best = null;
  let bestDist = Infinity;
  for (const plot of PLANT_PLOTS) {
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const d = (cx - tileX) ** 2 + (cy - tileY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = plot;
    }
  }
  return best;
}

function directionGuide(tileX, tileY, plot) {
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const dx = cx - tileX;
  const dy = cy - tileY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < 2 && absY < 2) {
    return { arrow: '★', text: 'You’re on a plant bed — press E!' };
  }

  if (absX >= absY) {
    return dx < 0
      ? { arrow: '←', text: 'keep walking left' }
      : { arrow: '→', text: 'keep walking right' };
  }
  return dy < 0
    ? { arrow: '↑', text: 'keep walking up' }
    : { arrow: '↓', text: 'keep walking down' };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

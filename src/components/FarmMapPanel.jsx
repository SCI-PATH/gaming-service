import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LOADING_ZONE, PLANT_PLOTS } from '../data/plantPlots.js';
import {
  ForestGameBridge,
  FARM_EVENTS,
} from './ForestGameBridge.js';

/** Full farm map size in tiles (matches public/assets/maps/map.json). */
export const FARM_MAP_TILES = { width: 100, height: 75 };

/**
 * Farm map: plant beds (gold), load dock (blue), live YOU pin.
 */
export default function FarmMapPanel({
  playerMapX,
  playerMapY,
  harvestTarget = 24,
  cropsHarvestedTotal = 0,
  performanceBand = 'developing',
  cropName = 'crops',
  compact = false,
}) {
  const { width, height } = FARM_MAP_TILES;
  const pinRef = useRef(null);
  const guideRef = useRef(null);
  const [pos, setPos] = useState({
    x: Number.isFinite(playerMapX) ? playerMapX : 48,
    y: Number.isFinite(playerMapY) ? playerMapY : 32,
  });

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
  const nearest = nearestTarget(px, py);

  const loadCx = ((LOADING_ZONE.x + LOADING_ZONE.w / 2) / width) * 100;
  const loadCy = ((LOADING_ZONE.y + LOADING_ZONE.h / 2) / height) * 100;

  return (
    <aside
      className={`farm-map-panel${compact ? ' is-compact' : ''}`}
      aria-label="Farm map with plant beds and loading dock"
    >
      <div className="farm-map-head">
        <strong>Farm Map</strong>
        <span>Gold = plant · Blue = load</span>
      </div>

      <div
        className="farm-map-canvas"
        role="img"
        aria-label={`You are at column ${tileX}, row ${tileY}`}
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
                x2={nearest.cx}
                y2={nearest.cy}
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
                <span>{shortPlantLabel(plot)}</span>
              </div>
            );
          })}

          <div
            className={`farm-map-load${
              nearest?.id === LOADING_ZONE.id ? ' is-closest' : ''
            }`}
            style={{ left: `${loadCx}%`, top: `${loadCy}%` }}
            title="Load Dock — unload crops here"
          >
            <span>LOAD</span>
          </div>

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
          <i className="farm-map-key farm-map-key-bed" /> Plant
        </li>
        <li>
          <i className="farm-map-key farm-map-key-load" /> Load
        </li>
      </ul>

      <div className="farm-map-crop-target" aria-live="polite">
        <strong>Harvest target</strong>
        <span>
          {bandCropLabel(performanceBand)}: collect{' '}
          <em>
            {cropsHarvestedTotal}/{harvestTarget}
          </em>{' '}
          {cropName.toLowerCase()}
        </span>
        <div className="farm-map-crop-track">
          <div
            className="farm-map-crop-fill"
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  (Number(cropsHarvestedTotal) /
                    Math.max(1, Number(harvestTarget))) *
                    100,
                ),
              )}%`,
            }}
          />
        </div>
      </div>
    </aside>
  );
}

function bandCropLabel(band) {
  switch (band) {
    case 'strong':
      return 'Challenge load (many crops)';
    case 'emerging':
      return 'Supported load (fewer crops)';
    default:
      return 'Standard load';
  }
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

function shortPlantLabel(plot) {
  if (plot.id.includes('west') && plot.id.includes('south')) return 'SW';
  if (plot.id.includes('east') && plot.id.includes('south')) return 'SE';
  if (plot.id.includes('west')) return 'W';
  if (plot.id.includes('east')) return 'E';
  return 'P';
}

function nearestTarget(tileX, tileY) {
  const targets = [
    ...PLANT_PLOTS.map((p) => ({
      id: p.id,
      label: p.label,
      cx: p.x + p.w / 2,
      cy: p.y + p.h / 2,
      kind: 'plant',
    })),
    {
      id: LOADING_ZONE.id,
      label: LOADING_ZONE.label,
      cx: LOADING_ZONE.x + LOADING_ZONE.w / 2,
      cy: LOADING_ZONE.y + LOADING_ZONE.h / 2,
      kind: 'load',
    },
  ];

  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = (t.cx - tileX) ** 2 + (t.cy - tileY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

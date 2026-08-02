import { useMemo } from 'react';
import {
  HOUSE_FURNITURE,
  HOUSE_LAYOUT_SLOTS,
  HOUSE_TILES,
} from '../data/houseInterior.js';

/**
 * Top-down house floor plan matching the furnished reference layout.
 * Structure (walls/floor/doors/windows) is always shown; furniture fills in when placed.
 */
export default function HouseFloorPlan({
  placedKeys = [],
  highlightSlot = null,
  justPlaced = null,
  showCompleteReference = false,
  luxuryBand = 'average',
}) {
  const occupied = useMemo(() => {
    const map = {};
    for (const key of placedKeys) {
      const furn = HOUSE_FURNITURE[key];
      if (furn) map[furn.slot] = key;
    }
    return map;
  }, [placedKeys]);

  const slotIds = Object.keys(HOUSE_LAYOUT_SLOTS);

  if (showCompleteReference && placedKeys.length > 0) {
    // optional full art when fully furnished — kept for later polish
  }

  return (
    <div
      className={`house-plan house-plan--${luxuryBand || 'average'}`}
      aria-label="Farm house interior"
    >
      {/* Floor */}
      <div
        className="house-plan-floor"
        style={{ backgroundImage: `url(${HOUSE_TILES.floor})` }}
      />

      {/* Outer cream frame */}
      <div className="house-plan-frame" />

      {/* Back stone wall */}
      <div
        className="house-plan-backwall"
        style={{ backgroundImage: `url(${HOUSE_TILES.wallStone})` }}
      >
        <img src={HOUSE_TILES.window} alt="" className="house-plan-win" />
        <img src={HOUSE_TILES.window} alt="" className="house-plan-win" />
      </div>

      {/* Inner partitions */}
      <div className="house-plan-wall wall-bedroom" />
      <div className="house-plan-wall wall-pantry" />
      <div className="house-plan-wall wall-alchemy" />
      <div className="house-plan-wall wall-entry" />

      {/* Stairs block */}
      <div className="house-plan-stairs" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      {/* Doors */}
      <div className="house-plan-door door-alchemy">
        <img src={HOUSE_TILES.doorClosed} alt="Door" />
      </div>
      <div className="house-plan-door door-entry">
        <img src={HOUSE_TILES.wallArch} alt="Doorway" />
      </div>

      {/* Room labels when empty */}
      <span className="house-room-label label-bed">Bedroom</span>
      <span className="house-room-label label-pantry">Pantry</span>
      <span className="house-room-label label-dining">Main room</span>
      <span className="house-room-label label-side">Side room</span>

      {/* Furniture slots */}
      {slotIds.map((slot) => {
        const style = HOUSE_LAYOUT_SLOTS[slot];
        const key = occupied[slot];
        const furn = key ? HOUSE_FURNITURE[key] : null;
        const isGhost = !furn;
        const isHi = highlightSlot === slot;
        const isPop = justPlaced && furn && justPlaced === key;

        return (
          <div
            key={slot}
            className={`house-plan-slot ${isGhost ? 'is-empty' : 'is-filled'} ${
              isHi ? 'is-target' : ''
            } ${isPop ? 'is-pop' : ''}`}
            style={style}
            data-slot={slot}
          >
            {isGhost ? (
              <span className="house-plan-ghost">{slot.replace(/_/g, ' ')}</span>
            ) : (
              <img src={furn.src} alt={furn.label} />
            )}
          </div>
        );
      })}
    </div>
  );
}

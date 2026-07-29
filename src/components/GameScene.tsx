import { useCallback, useState } from 'react';
import type { GameItem, Hotspot, Scene } from '../types/game';

interface GameSceneProps {
  scene: Scene;
  discoveredItemIds: Set<string>;
  onNavigate: (sceneId: string) => void;
  /** Opens the science quiz modal (does not unlock yet) */
  onInspectItem: (item: GameItem) => void;
}

/** Subtle semi-transparent blend so items look hidden but identifiable */
const ROOM_ITEM_FILTER =
  'brightness(0.6) opacity(0.7) drop-shadow(0px 0px 4px rgba(255, 215, 0, 0.4))';

/** Soft golden outline on hover */
const ROOM_ITEM_HOVER_FILTER =
  'brightness(0.85) opacity(0.95) drop-shadow(0px 0px 8px rgba(255, 215, 0, 0.85)) drop-shadow(0px 0px 14px rgba(255, 200, 80, 0.55))';

/** Renders the 16:9 scene viewport with hotspots and semi-transparent discovery targets */
export default function GameScene({
  scene,
  discoveredItemIds,
  onNavigate,
  onInspectItem,
}: GameSceneProps) {
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const handleItemClick = useCallback(
    (item: GameItem) => {
      if (discoveredItemIds.has(item.id)) return;
      onInspectItem(item);
    },
    [discoveredItemIds, onInspectItem],
  );

  const hiddenTargets = scene.items.filter((item) => !discoveredItemIds.has(item.id));
  const isSubScene = Boolean(scene.parentSceneId);

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-brass-600/60 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <img
          src={scene.backgroundPath}
          alt={scene.name}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {isSubScene && scene.parentSceneId && (
          <button
            type="button"
            onClick={() => onNavigate(scene.parentSceneId!)}
            className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-md border border-brass-400/50 bg-black/70 px-3 py-1.5 text-sm font-medium text-brass-200 shadow-lg backdrop-blur-sm transition hover:border-brass-300 hover:bg-black/85 hover:text-brass-100"
          >
            <span aria-hidden="true">←</span>
            Back to Main Room
          </button>
        )}

        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-brass-500/30 bg-black/50 px-3 py-1 text-xs uppercase tracking-widest text-brass-300/90 backdrop-blur-sm">
          {scene.name}
        </div>

        {scene.hotspots.map((hotspot) => (
          <HotspotZone
            key={hotspot.id}
            hotspot={hotspot}
            isHovered={hoveredHotspotId === hotspot.id}
            onEnter={() => setHoveredHotspotId(hotspot.id)}
            onLeave={() => setHoveredHotspotId(null)}
            onClick={() => onNavigate(hotspot.targetSceneId)}
          />
        ))}

        {/* Semi-transparent hidden objects — identifiable shapes nestled in the scene */}
        {hiddenTargets.map((item) => {
          const isHovered = hoveredItemId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-label="Investigate a hidden science object"
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              onFocus={() => setHoveredItemId(item.id)}
              onBlur={() => setHoveredItemId(null)}
              className="group absolute z-10 cursor-pointer transition-transform duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}%`,
                height: `${item.height}%`,
              }}
            >
              {/* Soft golden hover glow outline */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-[-22%] rounded-full transition duration-200 ${
                  isHovered
                    ? 'bg-[radial-gradient(circle,rgba(255,215,0,0.35)_0%,transparent_70%)] opacity-100'
                    : 'opacity-0'
                }`}
              />
              <img
                src={item.iconPath}
                alt=""
                aria-hidden="true"
                className="relative z-10 h-full w-full object-contain transition duration-200"
                style={{
                  filter: isHovered ? ROOM_ITEM_HOVER_FILTER : ROOM_ITEM_FILTER,
                }}
                draggable={false}
              />
            </button>
          );
        })}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/20" />
      </div>
    </div>
  );
}

interface HotspotZoneProps {
  hotspot: Hotspot;
  isHovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}

function HotspotZone({ hotspot, isHovered, onEnter, onLeave, onClick }: HotspotZoneProps) {
  return (
    <button
      type="button"
      aria-label={hotspot.label ?? 'Interactive area'}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`absolute z-20 rounded-sm border-2 transition-all duration-200 ${
        isHovered
          ? 'cursor-pointer border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
          : 'cursor-pointer border-transparent bg-transparent hover:border-cyan-400/40 hover:bg-cyan-400/5'
      }`}
      style={{
        left: `${hotspot.x}%`,
        top: `${hotspot.y}%`,
        width: `${hotspot.width}%`,
        height: `${hotspot.height}%`,
      }}
    />
  );
}

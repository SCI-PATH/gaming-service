import type { InventorySlotItem } from '../types/game';

interface InventoryBarProps {
  /** Checklist items for the active room (always shown) */
  checklist: InventorySlotItem[];
  maxSlots?: number;
  /** Slot currently playing the lighting-up flash */
  lightingUpItemId?: string | null;
  /** True when every checklist item for this scene is discovered */
  isSceneComplete?: boolean;
}

/** High-contrast dark silhouette — shape stays readable */
const SILHOUETTE_FILTER =
  'brightness(0) opacity(0.35) drop-shadow(0px 0px 2px rgba(255,255,255,0.2))';

/** Fixed bottom HUD — recognizable shadow checklist that lights up when discovered */
export default function InventoryBar({
  checklist,
  maxSlots = 8,
  lightingUpItemId = null,
  isSceneComplete = false,
}: InventoryBarProps) {
  const discoveredCount = checklist.filter((item) => item.isDiscovered).length;
  const remaining = Math.max(0, checklist.length - discoveredCount);

  const slots: Array<InventorySlotItem | null> = [
    ...checklist.slice(0, maxSlots),
    ...Array.from({ length: Math.max(0, maxSlots - checklist.length) }, () => null),
  ];

  return (
    <footer
      className={`fixed inset-x-0 bottom-0 z-40 border-t-2 bg-gradient-to-t from-[#1a1208] via-[#2a1f0e] to-[#1a1208]/95 shadow-[0_-8px_32px_rgba(0,0,0,0.7)] backdrop-blur-sm transition duration-500 ${
        isSceneComplete
          ? 'animate-inventory-complete-glow border-amber-300/90'
          : 'border-brass-600/80'
      }`}
    >
      {/* Status / completion banner */}
      <div
        className={`relative overflow-hidden border-b px-4 py-1.5 text-center transition duration-500 ${
          isSceneComplete
            ? 'border-amber-400/50 bg-gradient-to-r from-amber-950/80 via-brass-700/40 to-amber-950/80'
            : 'border-brass-700/40 bg-black/35'
        }`}
      >
        {isSceneComplete && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className="absolute h-1 w-1 rounded-full bg-amber-200 animate-complete-spark"
                style={{
                  left: `${5 + i * 10}%`,
                  top: '50%',
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}

        <p
          className={`relative text-[11px] sm:text-xs ${
            isSceneComplete
              ? 'font-semibold tracking-wide text-amber-200 drop-shadow-[0_0_8px_rgba(255,215,0,0.7)]'
              : 'text-brass-300/90'
          }`}
        >
          {isSceneComplete
            ? '✔ ALL SCENE ITEMS DISCOVERED'
            : `Items to find: ${remaining} remaining — match these shapes in the scene!`}
        </p>
      </div>

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="hidden shrink-0 flex-col sm:flex">
          <span className="text-[10px] uppercase tracking-[0.2em] text-brass-500">
            Checklist
          </span>
          <span
            className={`font-mono text-xs ${
              isSceneComplete ? 'text-amber-300' : 'text-brass-300'
            }`}
          >
            {discoveredCount}/{checklist.length}
          </span>
        </div>

        <div className="hidden h-10 w-px bg-gradient-to-b from-transparent via-brass-500/60 to-transparent sm:block" />

        <div className="flex flex-1 items-center justify-center gap-2 sm:gap-3">
          {slots.map((entry, index) => {
            if (!entry) {
              return (
                <div
                  key={`empty-${index}`}
                  className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 border-brass-800/40 bg-[#120e08]/80 sm:h-16 sm:w-16"
                >
                  <span className="font-mono text-xs text-brass-800/60">{index + 1}</span>
                </div>
              );
            }

            const isLightingUp = lightingUpItemId === entry.id;
            const isDiscovered = entry.isDiscovered;

            return (
              <div
                key={entry.id}
                className={`group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 bg-gradient-to-br from-[#3d2e14] to-[#1a1408] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)] transition sm:h-16 sm:w-16 ${
                  isLightingUp
                    ? 'animate-slot-light-up border-amber-300'
                    : isDiscovered
                      ? 'border-brass-400/90 shadow-[0_0_14px_rgba(255,215,0,0.4)]'
                      : 'border-brass-700/50'
                }`}
              >
                <div className="absolute inset-1 rounded-sm border border-brass-700/40" />

                {isLightingUp && (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[-10px] rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.55)_0%,rgba(34,211,238,0.25)_45%,transparent_70%)] animate-slot-radial-flash"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[-4px] rounded-lg ring-2 ring-amber-300/80 animate-pulse"
                    />
                  </>
                )}

                <img
                  src={entry.iconPath}
                  alt={isDiscovered ? entry.name : `Find: ${entry.name}`}
                  className={`relative z-10 h-[72%] w-[72%] object-contain transition duration-300 ${
                    isLightingUp
                      ? 'animate-inventory-reveal'
                      : isDiscovered
                        ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] group-hover:scale-110'
                        : ''
                  }`}
                  style={
                    isLightingUp
                      ? undefined
                      : isDiscovered
                        ? { filter: 'none' }
                        : { filter: SILHOUETTE_FILTER }
                  }
                  draggable={false}
                />

                <span
                  className={`absolute -right-1 -top-1 z-20 h-2.5 w-2.5 rounded-full border border-black/40 ${
                    isDiscovered
                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                      : 'bg-brass-800'
                  }`}
                />

                <span className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded border border-brass-500/50 bg-black/90 px-2 py-0.5 text-[10px] text-brass-200 group-hover:block">
                  {isDiscovered ? entry.name : `Find: ${entry.name}`}
                </span>

                <span className="absolute left-0.5 top-0.5 h-1 w-1 rounded-full bg-brass-500/60" />
                <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-brass-500/60" />
                <span className="absolute bottom-0.5 left-0.5 h-1 w-1 rounded-full bg-brass-500/60" />
                <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-brass-500/60" />
              </div>
            );
          })}
        </div>
      </div>
    </footer>
  );
}

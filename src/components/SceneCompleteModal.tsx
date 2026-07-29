import type { SceneCompletionStats } from '../types/game';

interface SceneCompleteModalProps {
  stats: SceneCompletionStats;
  onProceed: () => void;
}

/** Retro-futuristic victory overlay when all scene artifacts are recovered */
export default function SceneCompleteModal({ stats, onProceed }: SceneCompleteModalProps) {
  const accuracyPct =
    stats.totalItems === 0
      ? 0
      : Math.round((stats.firstTryCorrect / stats.totalItems) * 100);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-complete-title"
    >
      <div className="animate-modal-in relative w-full max-w-md overflow-hidden rounded-xl border-2 border-brass-400/80 bg-gradient-to-b from-[#3a2a10] via-[#1a1408] to-[#0c0904] shadow-[0_0_50px_rgba(255,215,0,0.35),inset_0_1px_0_rgba(255,215,0,0.25)]">
        {/* Celebratory spark particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-amber-300 animate-complete-spark"
              style={{
                left: `${8 + (i * 7) % 84}%`,
                top: `${10 + (i * 11) % 70}%`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>

        <div className="relative border-b border-brass-500/50 bg-black/40 px-5 py-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-brass-500">
            Mission Status // Clearance Granted
          </p>
          <h2
            id="scene-complete-title"
            className="mt-1 text-xl font-bold tracking-wide text-brass-100 sm:text-2xl"
          >
            SCENE COMPLETED!
          </h2>
          <p className="mt-1 text-sm text-brass-300">All Artifacts Recovered</p>
          <p className="mt-2 text-xs uppercase tracking-widest text-brass-500">
            {stats.sceneName}
          </p>
        </div>

        <div className="relative space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-brass-600/50 bg-black/35 px-3 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-brass-500">
                Total Items Found
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-brass-200">
                {stats.itemsFound}
                <span className="text-base text-brass-500"> / {stats.totalItems}</span>
              </p>
            </div>
            <div className="rounded-lg border border-brass-600/50 bg-black/35 px-3 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-brass-500">
                Science Accuracy
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-cyan-300">
                {accuracyPct}%
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2.5 text-center text-sm text-cyan-100/90">
            Questions Correct on First Try:{' '}
            <span className="font-mono font-semibold text-cyan-200">
              {stats.firstTryCorrect}/{stats.totalItems}
            </span>
          </div>

          {stats.isFinalScene ? (
            <p className="text-center text-xs text-brass-400">
              The escape door seals are powering down. Proceed to finish the lesson.
            </p>
          ) : (
            <p className="text-center text-xs text-brass-400">
              Next chamber unlocked. Recover the remaining science artifacts.
            </p>
          )}

          <button
            type="button"
            onClick={onProceed}
            className="w-full rounded-md border-2 border-amber-300/80 bg-gradient-to-b from-amber-500/50 to-brass-700/60 px-4 py-3 text-sm font-bold uppercase tracking-wide text-brass-100 shadow-[0_0_24px_rgba(255,215,0,0.4)] transition hover:from-amber-400/60 hover:to-brass-600/70 hover:shadow-[0_0_32px_rgba(255,215,0,0.55)]"
          >
            {stats.ctaLabel}
          </button>
        </div>

        <span className="pointer-events-none absolute left-2 top-2 h-2 w-2 rounded-full bg-brass-400/80" />
        <span className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-brass-400/80" />
        <span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 rounded-full bg-brass-400/80" />
        <span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 rounded-full bg-brass-400/80" />
      </div>
    </div>
  );
}

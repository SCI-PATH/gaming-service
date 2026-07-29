import type { ToastMessage } from '../types/game';

interface ToastProps {
  toast: ToastMessage | null;
}

/** Brief top-center notification for discovery / access-denied feedback */
export default function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  const isDenied = toast.variant === 'denied';

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className={`animate-toast-in pointer-events-none fixed left-1/2 top-6 z-[60] max-w-md -translate-x-1/2 rounded-lg px-5 py-2.5 text-sm font-medium backdrop-blur-sm ${
        isDenied
          ? 'border border-amber-500/40 bg-black/80 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
          : 'border border-brass-400/60 bg-black/85 text-brass-100 shadow-[0_0_24px_rgba(212,175,55,0.3)]'
      }`}
    >
      <span className={isDenied ? 'text-amber-400' : 'text-brass-400'}>
        {isDenied ? '!' : '✦'}
      </span>{' '}
      {toast.text}
    </div>
  );
}

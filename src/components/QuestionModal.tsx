import { useEffect, useState } from 'react';
import type { GameItem } from '../types/game';

interface QuestionModalProps {
  item: GameItem;
  onCorrect: (item: GameItem) => void;
  /** Soft Access Denied toast — item stays locked in the room */
  onIncorrect: (item: GameItem) => void;
  onClose: () => void;
}

type FeedbackState = 'idle' | 'denied' | 'granted';

const PREVIEW_SILHOUETTE =
  'brightness(0) opacity(0.4) drop-shadow(0px 0px 2px rgba(255,255,255,0.25))';

/**
 * Retro-futuristic brass quiz overlay.
 * Correct → unlock + inventory light-up. Incorrect → soft denied toast; item stays in room.
 */
export default function QuestionModal({
  item,
  onCorrect,
  onIncorrect,
  onClose,
}: QuestionModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedIndex(null);
    setFeedback('idle');
    setIsSubmitting(false);
  }, [item.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && feedback !== 'granted') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [feedback, onClose]);

  const handleSubmit = () => {
    if (selectedIndex === null || isSubmitting) return;

    setIsSubmitting(true);
    const isCorrect = selectedIndex === item.quiz.correctIndex;

    if (!isCorrect) {
      setFeedback('denied');
      setIsSubmitting(false);
      onIncorrect(item);
      return;
    }

    setFeedback('granted');
    window.setTimeout(() => onCorrect(item), 550);
  };

  const handleRetry = () => {
    setSelectedIndex(null);
    setFeedback('idle');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-title"
    >
      <button
        type="button"
        aria-label="Close quiz"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (feedback !== 'granted') onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border-2 border-brass-500/70 bg-gradient-to-b from-[#2a1f0e] via-[#1a1408] to-[#0e0a05] shadow-[0_0_40px_rgba(212,175,55,0.25),inset_0_1px_0_rgba(212,175,55,0.2)]">
        <div className="flex items-center justify-between border-b border-brass-600/50 bg-black/40 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-brass-500">
              Security Protocol // Science Gate
            </p>
            <h2 id="quiz-title" className="text-base font-semibold text-brass-200 sm:text-lg">
              Identify: {item.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={feedback === 'granted'}
            className="rounded border border-brass-600/60 px-2 py-1 text-xs text-brass-400 transition hover:border-brass-400 hover:text-brass-200 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-lg border border-brass-600/40 bg-black/50 shadow-inner">
            <img
              src={item.iconPath}
              alt=""
              aria-hidden="true"
              className="h-14 w-14 object-contain"
              style={{
                filter: feedback === 'granted' ? 'none' : PREVIEW_SILHOUETTE,
              }}
              draggable={false}
            />
          </div>

          <p className="text-sm leading-relaxed text-brass-100/90 sm:text-base">
            {item.quiz.question}
          </p>

          <ul className="space-y-2">
            {item.quiz.options.map((option, index) => {
              const isSelected = selectedIndex === index;
              const showCorrect =
                feedback === 'granted' && index === item.quiz.correctIndex;
              const showWrong =
                feedback === 'denied' && isSelected && index !== item.quiz.correctIndex;

              return (
                <li key={option}>
                  <button
                    type="button"
                    disabled={feedback === 'granted' || isSubmitting}
                    onClick={() => {
                      if (feedback === 'denied') setFeedback('idle');
                      setSelectedIndex(index);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition ${
                      showCorrect
                        ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-100'
                        : showWrong
                          ? 'border-amber-400/50 bg-amber-500/10 text-amber-100'
                          : isSelected
                            ? 'border-brass-400 bg-brass-500/20 text-brass-100'
                            : 'border-brass-700/60 bg-black/30 text-brass-200 hover:border-brass-500/70 hover:bg-brass-900/30'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/40 font-mono text-xs">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span>{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {feedback === 'denied' && (
            <p className="text-center text-xs text-brass-400">
              Soft tip shown above — try another answer. The object stays in the room.
            </p>
          )}

          {feedback === 'granted' && (
            <div
              role="status"
              className="animate-toast-in rounded-md border border-emerald-400/50 bg-emerald-950/50 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-emerald-200"
            >
              Access Granted — Lighting up checklist…
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {feedback === 'denied' && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-md border border-brass-600/60 px-4 py-2 text-sm text-brass-300 transition hover:border-brass-400 hover:text-brass-100"
              >
                Try Again
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedIndex === null || feedback === 'granted' || isSubmitting}
              className="rounded-md border border-brass-400/80 bg-gradient-to-b from-brass-500/40 to-brass-700/40 px-4 py-2 text-sm font-semibold text-brass-100 shadow-[0_0_12px_rgba(212,175,55,0.25)] transition hover:from-brass-400/50 hover:to-brass-600/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Submit Answer
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-brass-500/70" />
        <div className="pointer-events-none absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-brass-500/70" />
        <div className="pointer-events-none absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-brass-500/70" />
        <div className="pointer-events-none absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brass-500/70" />
      </div>
    </div>
  );
}

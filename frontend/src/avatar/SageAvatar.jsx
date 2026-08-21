/**
 * Sage — professional circular AI agent portrait.
 * Clean photo + ring status (no face overlays).
 */
const SAGE_SRC = '/assets/avatar/sage.png';

export default function SageAvatar({
  speaking = false,
  listening = false,
  /** Current subtitle phrase (sentence-sized) */
  subtitle = '',
  caption = '',
  mood = 'empathetic',
  muted = false,
  onToggleMute = null,
  onStop = null,
  size = 'md',
  figureOnly = false,
  /** Voice shell: big subtitles while talking only; no idle filler text */
  voiceOnly = false,
}) {
  const line = String(subtitle || '').trim();
  const fallbackCaption = String(caption || '').trim();
  // While speaking: progressive subtitle, then fall back to full caption
  const displaySubtitle = speaking
    ? line || fallbackCaption
    : listening
      ? ''
      : '';

  return (
    <div
      className={`sage-avatar size-${size}${speaking ? ' is-speaking' : ''}${listening ? ' is-listening' : ''}${muted ? ' is-muted' : ''}${figureOnly ? ' is-figure-only' : ''}${voiceOnly ? ' is-voice-only' : ''}`}
      data-mood={mood}
    >
      <div className="sage-agent" aria-hidden={!figureOnly}>
        <div className="sage-orbs" aria-hidden>
          <span className="sage-orb sage-orb-outer" />
          <span className="sage-orb sage-orb-mid" />
        </div>

        <div className="sage-frame">
          <img
            className="sage-photo"
            src={SAGE_SRC}
            alt="Sage, your AI science mentor"
            draggable={false}
          />
          <div className="sage-frame-sheen" aria-hidden />
          <div className="sage-status-ring" aria-hidden />
        </div>

        {speaking ? (
          <div className="sage-status-chip" aria-live="polite">
            <span className="sage-wave" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Speaking
          </div>
        ) : listening ? (
          <div className="sage-status-chip is-listen">Listening</div>
        ) : (
          <div className="sage-status-chip is-idle">Online</div>
        )}
      </div>

      {figureOnly && (onToggleMute || onStop) ? (
        <div className="sage-float-controls">
          {onToggleMute ? (
            <button
              type="button"
              className="sage-ctrl"
              onClick={onToggleMute}
              aria-pressed={muted}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          ) : null}
          {onStop && speaking ? (
            <button type="button" className="sage-ctrl is-stop" onClick={onStop}>
              Stop
            </button>
          ) : null}
        </div>
      ) : null}

      {figureOnly ? (
        <p className="sage-subtitle" aria-live="polite">
          {displaySubtitle || '\u00a0'}
        </p>
      ) : (
        <div className="sage-meta">
          <div className="sage-name-row">
            <strong>Sage</strong>
            <span className="sage-role">Science mentor</span>
          </div>

          <div
            className={`sage-caption is-subtitle${voiceOnly ? ' is-voice-sub' : ''}`}
            aria-live="polite"
          >
            {speaking && displaySubtitle ? (
              <span className="sage-caption-line">{displaySubtitle}</span>
            ) : voiceOnly ? (
              <span className="sage-caption-idle">
                {muted ? 'Muted' : listening ? '…' : '\u00a0'}
              </span>
            ) : (
              <span className="sage-caption-idle">
                {muted
                  ? 'Voice muted — unmute to hear me.'
                  : 'I can talk through your mind map and answer questions.'}
              </span>
            )}
          </div>

          <div className="sage-controls">
            {onToggleMute ? (
              <button
                type="button"
                className="sage-ctrl"
                onClick={onToggleMute}
                aria-pressed={muted}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
            ) : null}
            {onStop && speaking ? (
              <button type="button" className="sage-ctrl is-stop" onClick={onStop}>
                Stop
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

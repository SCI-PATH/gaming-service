/**
 * Continuous browser speech capture (Web Speech API).
 * Live interim text + final phrases for real-time student voice input.
 */

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Probe the mic once so Chrome/Edge show the permission prompt and recognition can start.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function ensureMicrophonePermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // SpeechRecognition may still work without getUserMedia on some setups
    return { ok: true };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        ok: false,
        error:
          'Microphone permission denied. Allow the mic for this site, then try again.',
      };
    }
    if (name === 'NotFoundError') {
      return {
        ok: false,
        error: 'No microphone found. Plug one in or enable it in system settings.',
      };
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not access the microphone.',
    };
  }
}

/**
 * @param {object} opts
 * @param {(state: { listening: boolean, interim: string, finals: string[], fullText: string }) => void} opts.onUpdate
 * @param {(err: string) => void} [opts.onError]
 * @param {string} [opts.lang]
 */
export function createRealtimeSpeechCapture({
  onUpdate,
  onError,
  lang = 'en-US',
} = {}) {
  const SR = getSpeechRecognitionCtor();
  if (!SR) {
    return {
      supported: false,
      start() {
        onError?.(
          'Voice capture needs Chrome or Edge (Web Speech API not available).',
        );
      },
      stop() {},
      resetText() {},
      isListening: () => false,
      getFullText: () => '',
    };
  }

  let recognition = null;
  let wantListen = false;
  let interim = '';
  /** @type {string[]} */
  let finals = [];
  let restartTimer = null;
  let starting = false;

  const emit = () => {
    const fullText = [finals.join(' '), interim].filter(Boolean).join(' ').trim();
    onUpdate?.({
      listening: wantListen,
      interim,
      finals: [...finals],
      fullText,
    });
  };

  const clearRestart = () => {
    if (restartTimer) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const hardStopRec = () => {
    const rec = recognition;
    recognition = null;
    if (!rec) return;
    try {
      rec.onstart = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onresult = null;
      rec.stop();
    } catch {
      /* */
    }
    try {
      rec.abort?.();
    } catch {
      /* */
    }
  };

  const wire = (rec) => {
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      starting = false;
      wantListen = true;
      emit();
    };

    rec.onerror = (event) => {
      const code = event?.error || 'unknown';
      // Browser ends session with "no-speech" regularly — restart if still live
      if (code === 'no-speech' || code === 'aborted') {
        if (wantListen) scheduleRestart();
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        wantListen = false;
        starting = false;
        onError?.(
          'Microphone blocked. Allow mic access in the browser, then try again.',
        );
        emit();
        return;
      }
      if (code === 'audio-capture') {
        wantListen = false;
        starting = false;
        onError?.(
          'No microphone capture. Check system permissions and try Mic again.',
        );
        emit();
        return;
      }
      if (code === 'network') {
        onError?.(
          'Speech service network error. Check your connection and try Mic again.',
        );
        if (wantListen) scheduleRestart();
        return;
      }
      if (code === 'language-not-supported') {
        wantListen = false;
        starting = false;
        onError?.('Speech language not supported in this browser.');
        emit();
        return;
      }
      // "already-started" — ignore; keep listening state
      if (code === 'already-started') return;
      onError?.(`Speech capture error: ${code}`);
      if (wantListen) scheduleRestart();
    };

    rec.onend = () => {
      starting = false;
      // Chrome stops after phrases — keep live session going while user wants mic on
      if (wantListen) scheduleRestart();
      else emit();
    };

    rec.onresult = (event) => {
      let nextInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          const clean = piece.trim();
          if (clean) finals.push(clean);
        } else {
          nextInterim += piece;
        }
      }
      interim = nextInterim.trim();
      emit();
    };
  };

  const scheduleRestart = () => {
    clearRestart();
    restartTimer = window.setTimeout(() => {
      if (!wantListen || starting) return;
      try {
        if (recognition) {
          recognition.start();
          return;
        }
      } catch {
        /* already started or dead — recreate */
      }
      try {
        hardStopRec();
        recognition = new SR();
        wire(recognition);
        starting = true;
        recognition.start();
      } catch {
        starting = false;
        if (wantListen) {
          // Retry again shortly
          scheduleRestart();
        }
      }
    }, 280);
  };

  return {
    supported: true,
    start() {
      clearRestart();
      wantListen = true;
      interim = '';
      hardStopRec();
      try {
        // TTS + STT often conflict — stop browser speech if any
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* */
          }
        }
        recognition = new SR();
        wire(recognition);
        starting = true;
        recognition.start();
        emit();
      } catch (err) {
        wantListen = false;
        starting = false;
        onError?.(
          err instanceof Error
            ? err.message
            : 'Could not start microphone capture.',
        );
        emit();
      }
    },
    stop() {
      wantListen = false;
      starting = false;
      clearRestart();
      // Keep last interim folded into finals so stop captures trailing speech
      if (interim.trim()) {
        finals.push(interim.trim());
        interim = '';
      }
      hardStopRec();
      emit();
    },
    resetText() {
      finals = [];
      interim = '';
      emit();
    },
    isListening: () => wantListen,
    /** Captured speech so far (finals + interim). */
    getFullText: () =>
      [finals.join(' '), interim].filter(Boolean).join(' ').trim(),
  };
}

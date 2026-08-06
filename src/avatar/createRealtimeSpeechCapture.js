/**
 * Continuous browser speech capture (Web Speech API).
 * Live interim text + final phrases for real-time student voice input.
 */

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
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
        onError?.('Voice capture is not supported in this browser. Try Chrome.');
      },
      stop() {},
      isListening: () => false,
    };
  }

  let recognition = null;
  let wantListen = false;
  let interim = '';
  /** @type {string[]} */
  let finals = [];
  let restartTimer = null;

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

  const wire = (rec) => {
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
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
      if (code === 'not-allowed') {
        wantListen = false;
        onError?.(
          'Microphone blocked. Allow mic access in the browser, then try again.',
        );
        emit();
        return;
      }
      onError?.(`Speech capture error: ${code}`);
      if (wantListen) scheduleRestart();
    };

    rec.onend = () => {
      // Chrome stops after phrases — keep live session going
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
      if (!wantListen) return;
      try {
        recognition?.start();
      } catch {
        /* already started */
      }
    }, 180);
  };

  return {
    supported: true,
    start() {
      clearRestart();
      wantListen = true;
      interim = '';
      try {
        recognition?.stop();
      } catch {
        /* */
      }
      recognition = new SR();
      wire(recognition);
      try {
        recognition.start();
        emit();
      } catch (err) {
        wantListen = false;
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
      clearRestart();
      interim = '';
      try {
        recognition?.stop();
      } catch {
        /* */
      }
      recognition = null;
      emit();
    },
    resetText() {
      finals = [];
      interim = '';
      emit();
    },
    isListening: () => wantListen,
  };
}

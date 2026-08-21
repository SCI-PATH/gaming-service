/**
 * Speech → mind-map highlight: only the word(s) currently being spoken.
 * No durable "read trail" and no lighting every match of a vocabulary word.
 */

/**
 * @param {string} w
 */
export function normalizeSpeechToken(w) {
  return String(w || '')
    .toLowerCase()
    .replace(/[^a-z0-9'’]/gi, '')
    .replace(/[’']/g, "'")
    .replace(/'s$/i, '')
    .trim();
}

/**
 * @param {string} a
 * @param {string} b
 */
export function speechWordsMatch(a, b) {
  const na = normalizeSpeechToken(a);
  const nb = normalizeSpeechToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Soft match for plurals / clipped TTS endings
  if (na.length >= 5 && nb.length >= 5) {
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
  }
  return false;
}

/**
 * @param {string} text
 * @returns {{ word: string, sep: string }[]}
 */
export function tokenizeMapText(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const re = /(\S+)(\s*)/g;
  /** @type {{ word: string, sep: string }[]} */
  const out = [];
  let m;
  while ((m = re.exec(raw))) {
    out.push({ word: m[1], sep: m[2] || '' });
  }
  return out;
}

/**
 * @param {string} spoken
 * @returns {string[]}
 */
export function tokenizeSpeech(spoken) {
  return String(spoken || '')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, '').trim())
    .filter((w) => normalizeSpeechToken(w).length > 0);
}

/**
 * Align spoken word stream to a timeline of map tokens.
 * Returns the global index of the word currently being spoken (or -1).
 *
 * @param {{ word: string }[]} mapTokens - concatenated tokens (order of reading)
 * @param {string[]} spokenWords - words spoken so far in this utterance, last = current
 */
export function findCurrentSpeechIndex(mapTokens, spokenWords) {
  if (!mapTokens?.length || !spokenWords?.length) return -1;

  let cursor = 0;
  /** last map index matched by speech */
  let lastMatch = -1;

  for (const sw of spokenWords) {
    let found = -1;
    // Prefer forward match near cursor (reading flow)
    const lookAhead = Math.min(mapTokens.length, cursor + 18);
    for (let j = cursor; j < lookAhead; j++) {
      if (speechWordsMatch(mapTokens[j].word, sw)) {
        found = j;
        break;
      }
    }
    // Longer skip if narrator rephrases around this field
    if (found < 0) {
      for (let j = cursor; j < mapTokens.length; j++) {
        if (speechWordsMatch(mapTokens[j].word, sw)) {
          found = j;
          break;
        }
      }
    }
    // Do NOT search behind cursor for "any match on the map" — that causes simultaneous multi-hits
    if (found < 0) {
      // Spoken filler / off-map word (e.g. "about", "Miss") — keep cursor
      continue;
    }
    lastMatch = found;
    cursor = found + 1;
  }

  return lastMatch;
}

/**
 * Only the currently spoken token is highlighted (optional tiny phrase window).
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.spokenSoFar]
 * @param {string} [opts.currentWord]
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.globalCurrentIndex] - when set, this field is a slice of a larger timeline
 * @param {number} [opts.tokenOffset] - this field's start index in the global timeline
 * @param {number} [opts.phraseWindow] - how many trailing spoken words can stay lit (1 = word-only)
 */
export function alignSpeechToText({
  text,
  spokenSoFar = '',
  currentWord = '',
  enabled = true,
  globalCurrentIndex = null,
  tokenOffset = 0,
  phraseWindow = 1,
}) {
  const tokens = tokenizeMapText(text);
  const n = tokens.length;
  /** @type {('unread'|'current'|'phrase')[]} */
  const states = Array.from({ length: n }, () => 'unread');

  if (!enabled || !n) {
    return { tokens, states };
  }

  let activeGlobal = -1;

  if (globalCurrentIndex != null && globalCurrentIndex >= 0) {
    activeGlobal = globalCurrentIndex;
  } else {
    const spoken = tokenizeSpeech(spokenSoFar);
    if (currentWord) {
      const bare = String(currentWord).replace(/[.,!?;:]+$/g, '');
      const last = spoken[spoken.length - 1];
      if (!last || !speechWordsMatch(last, bare)) {
        spoken.push(bare);
      }
    }
    activeGlobal = findCurrentSpeechIndex(tokens, spoken);
    // local-only mode: indices are field-local
    if (activeGlobal >= 0) {
      for (let i = 0; i < n; i++) states[i] = 'unread';
      // phrase window trailing earlier spoken matches on THIS field only
      const spoken = tokenizeSpeech(spokenSoFar);
      if (currentWord) spoken.push(String(currentWord).replace(/[.,!?;:]+$/g, ''));
      const window = Math.max(1, phraseWindow);
      // re-walk with full spoken, collect only last `window` matches
      const matches = [];
      let cursor = 0;
      for (const sw of spoken) {
        let found = -1;
        for (let j = cursor; j < n; j++) {
          if (speechWordsMatch(tokens[j].word, sw)) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          matches.push(found);
          cursor = found + 1;
        }
      }
      const tail = matches.slice(-window);
      tail.forEach((idx, k) => {
        if (idx < 0 || idx >= n) return;
        states[idx] = k === tail.length - 1 ? 'current' : 'phrase';
      });
      return { tokens, states };
    }
  }

  if (activeGlobal < 0) {
    return { tokens, states };
  }

  // Map global index into this field's local range
  const localStart = tokenOffset;
  const localEnd = tokenOffset + n;
  const window = Math.max(1, phraseWindow);

  for (let w = 0; w < window; w++) {
    const g = activeGlobal - (window - 1 - w);
    if (g < localStart || g >= localEnd) continue;
    const local = g - localStart;
    states[local] = w === window - 1 ? 'current' : 'phrase';
  }

  return { tokens, states };
}

/**
 * Build a single reading timeline for the focused map region.
 * @param {{ key: string, text: string }[]} fields
 * @returns {{ tokens: { word: string, sep: string, fieldKey: string, localIndex: number }[], offsets: Record<string, number> }}
 */
export function buildReadingTimeline(fields) {
  /** @type {{ word: string, sep: string, fieldKey: string, localIndex: number }[]} */
  const tokens = [];
  /** @type {Record<string, number>} */
  const offsets = {};

  for (const f of fields) {
    const key = f.key;
    const parts = tokenizeMapText(f.text);
    offsets[key] = tokens.length;
    parts.forEach((p, localIndex) => {
      tokens.push({
        word: p.word,
        sep: p.sep,
        fieldKey: key,
        localIndex,
      });
    });
  }

  return { tokens, offsets };
}

/**
 * @param {object} opts
 * @param {{ word: string }[]} opts.timelineTokens
 * @param {string} opts.spokenSoFar
 * @param {string} opts.currentWord
 * @param {string} [opts.activePhrase] - current subtitle sentence (optional filter)
 * @returns {number} global index of currently spoken map word, or -1
 */
export function resolveLiveSpeechIndex({
  timelineTokens,
  spokenSoFar,
  currentWord,
  activePhrase = '',
}) {
  let spoken = tokenizeSpeech(spokenSoFar);
  if (currentWord) {
    const bare = String(currentWord).replace(/[.,!?;:]+$/g, '');
    if (!spoken.length || !speechWordsMatch(spoken[spoken.length - 1], bare)) {
      spoken = [...spoken, bare];
    }
  }

  // Restrict spoken stream to the words that belong to the current on-screen subtitle
  if (activePhrase) {
    const phraseWords = tokenizeSpeech(activePhrase);
    if (phraseWords.length) {
      // Intersection in order: keep spoken words that appear in phrase order
      const filtered = [];
      let pi = 0;
      for (const sw of spoken) {
        for (let j = pi; j < phraseWords.length; j++) {
          if (speechWordsMatch(phraseWords[j], sw)) {
            filtered.push(sw);
            pi = j + 1;
            break;
          }
        }
      }
      // Always keep the latest current word if it is in the phrase
      const cur = spoken[spoken.length - 1];
      if (
        cur &&
        phraseWords.some((pw) => speechWordsMatch(pw, cur)) &&
        (!filtered.length || !speechWordsMatch(filtered[filtered.length - 1], cur))
      ) {
        filtered.push(cur);
      }
      if (filtered.length) spoken = filtered;
    }
  }

  return findCurrentSpeechIndex(timelineTokens, spoken);
}

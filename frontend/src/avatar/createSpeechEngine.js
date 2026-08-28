/**
 * Browser text-to-speech with per-word callbacks (Chrome/Edge friendly).
 */
function pickVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const prefer =
    voices.find((v) => /en-US|en_US/i.test(v.lang) && /female|Samantha|Google US English|Zira|Aria/i.test(v.name)) ||
    voices.find((v) => /en-?US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0];
  return prefer || null;
}

export function createSpeechEngine({
  onWord = null,
  onStart = null,
  onEnd = null,
  onError = null,
  /** Fires with each estimated phone for lip-sync consumers */
  onViseme = null,
} = {}) {
  let supported =
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance === 'function';

  let cancelled = false;
  let speaking = false;
  let currentUtter = null;
  let fullText = '';
  let words = [];

  // Warm voice list in some browsers
  if (supported) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  function stop() {
    cancelled = true;
    speaking = false;
    currentUtter = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /**
   * Speak text aloud. Highlights each word via onWord.
   * @returns {Promise<void>}
   */
  function speak(text, { rate = 0.95, pitch = 1.05, volume = 1 } = {}) {
    if (!supported) {
      onError?.('Speech synthesis is not available in this browser.');
      return Promise.resolve({ spoken: false, reason: 'unsupported' });
    }

    const clean = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return Promise.resolve({ spoken: false, reason: 'empty' });

    stop();
    cancelled = false;
    fullText = clean;
    words = clean.split(/\s+/).filter(Boolean);

    return new Promise((resolve) => {
      // cancel() can mute next utterance in Chrome — tiny delay
      window.setTimeout(() => {
        if (cancelled) {
          resolve({ spoken: false, reason: 'cancelled' });
          return;
        }

        const utter = new window.SpeechSynthesisUtterance(clean);
        const voice = pickVoice();
        if (voice) utter.voice = voice;
        utter.rate = rate;
        utter.pitch = pitch;
        utter.volume = volume;
        utter.lang = voice?.lang || 'en-US';
        currentUtter = utter;

        let wordIndex = 0;
        let lastWordForViseme = '';
        let phoneIdx = 0;
        let phoneSeq = [];

        function armVisemesForWord(word) {
          lastWordForViseme = word;
          phoneIdx = 0;
          // Lightweight phone stream for external listeners (avatar also runs its own)
          const letters = String(word || '')
            .toLowerCase()
            .replace(/[^a-z]/g, '');
          phoneSeq = letters.split('') || ['a'];
          onViseme?.({ viseme: letters[0] || 'rest', word, charIndex: 0 });
        }

        const fallBackTick = window.setInterval(() => {
          // Fallback if browser skips boundary events
          if (!speaking || cancelled) return;
          if (wordIndex < words.length) {
            const w = words[wordIndex];
            onWord?.({
              word: w,
              index: wordIndex,
              total: words.length,
              text: fullText,
            });
            armVisemesForWord(w);
            wordIndex += 1;
          }
        }, Math.max(180, 220 / rate));

        // Sub-word viseme ticks while a word is active
        const phoneTick = window.setInterval(() => {
          if (!speaking || cancelled || !phoneSeq.length) return;
          phoneIdx = (phoneIdx + 1) % Math.max(phoneSeq.length, 1);
          const ch = phoneSeq[phoneIdx] || 'a';
          onViseme?.({
            viseme: ch,
            word: lastWordForViseme,
            charIndex: phoneIdx,
          });
        }, Math.max(55, 70 / rate));

        utter.onstart = () => {
          speaking = true;
          onStart?.({ text: fullText, words });
          if (words[0]) {
            onWord?.({
              word: words[0],
              index: 0,
              total: words.length,
              text: fullText,
            });
            armVisemesForWord(words[0]);
            wordIndex = 1;
          }
        };

        utter.onboundary = (event) => {
          if (event.name !== 'word' && event.name !== 'Word') return;
          // Prefer boundary indices when available
          const slice = fullText.slice(event.charIndex || 0);
          const w = slice.split(/\s+/)[0] || '';
          if (!w) return;
          // Count words by char index
          const prefix = fullText.slice(0, event.charIndex || 0);
          const idx = prefix.trim() ? prefix.trim().split(/\s+/).length : 0;
          wordIndex = Math.min(idx + 1, words.length);
          const bare = w.replace(/[.,!?;:]+$/, '');
          onWord?.({
            word: bare,
            index: Math.min(idx, words.length - 1),
            total: words.length,
            text: fullText,
          });
          armVisemesForWord(bare);
        };

        const finish = (reason) => {
          window.clearInterval(fallBackTick);
          window.clearInterval(phoneTick);
          speaking = false;
          currentUtter = null;
          onViseme?.({ viseme: 'rest', word: '', charIndex: 0 });
          onEnd?.({ reason, text: fullText });
          resolve({ spoken: reason === 'end', reason });
        };

        utter.onend = () => finish(cancelled ? 'cancelled' : 'end');
        utter.onerror = (e) => {
          if (e?.error === 'interrupted' || e?.error === 'canceled') {
            finish('cancelled');
            return;
          }
          onError?.(e?.error || 'speech error');
          finish('error');
        };

        try {
          window.speechSynthesis.speak(utter);
        } catch (err) {
          window.clearInterval(fallBackTick);
          window.clearInterval(phoneTick);
          onError?.(err instanceof Error ? err.message : 'speak failed');
          finish('error');
        }
      }, 60);
    });
  }

  /** Speak multiple paragraphs in sequence. Parts may be strings or { text }. */
  async function speakQueue(parts, opts = {}) {
    const list = (parts || [])
      .map((p) => {
        if (p == null) return '';
        if (typeof p === 'string') return p.trim();
        return String(p.text || '').trim();
      })
      .filter(Boolean);
    for (const part of list) {
      if (cancelled) break;
      const res = await speak(part, opts);
      if (res.reason === 'cancelled' || res.reason === 'error') break;
      await new Promise((r) => setTimeout(r, 180));
    }
  }

  return {
    get supported() {
      return supported;
    },
    get speaking() {
      return speaking;
    },
    speak,
    speakQueue,
    stop,
    /**
     * Soft resume fix for Chrome (speech can "pause" after tab idle).
     */
    tick() {
      try {
        if (window.speechSynthesis?.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Turn a mind map into short, student-friendly narration chunks.
 * Returns segments with focus targets so the map can highlight while speaking.
 * @returns {{ text: string, kind: string, branchId?: string|null, highlights: string[] }[]}
 */
export function buildMindMapNarration(map) {
  if (!map) return [];
  const branches = map.branches || [];
  const n = map.missCount || branches.length || 0;
  /** @type {{ text: string, kind: string, branchId?: string|null, highlights: string[] }[]} */
  const parts = [];

  const rootTerms = uniqueHighlightTerms([
    map.root,
    map.title,
    map.topic,
    'incorrect',
    'mind map',
  ]);

  parts.push({
    kind: 'intro',
    branchId: null,
    highlights: rootTerms,
    text: `Hi, I'm Sage, your farm science mentor. You have ${n} incorrect answer${n === 1 ? '' : 's'} on this mind map. Explore any card while I talk — the map still works.`,
  });

  if (map.bigPicture || map.summary) {
    const overviewText = String(map.bigPicture || map.summary);
    parts.push({
      kind: 'overview',
      branchId: null,
      highlights: uniqueHighlightTerms([
        overviewText,
        map.centralIdea,
        map.topic,
        map.root,
      ]),
      text: overviewText,
    });
  }

  branches.forEach((b, i) => {
    const miss = b.index || i + 1;
    const topic = b.topic || b.label || 'Science';
    const q = b.prompt || b.question || '';
    const wrong = b.studentAnswer || 'your pick';
    const right = b.correctAnswer || 'the correct idea';
    const why = b.why || b.why_wrong || '';
    const key = b.keyExplain || b.key_concept_explain || b.keyConcept || '';
    const branchId = b.id || `miss-${i}`;

    let line = `Miss ${miss}, about ${topic}.`;
    if (q) line += ` The question was: ${clip(q, 140)}.`;
    line += ` You picked ${clip(wrong, 60)}.`;
    if (why) line += ` Here's why that mix-up happens: ${clip(why, 320)}.`;
    if (key && key !== right && key !== why) {
      line += ` Here's why the science is true: ${clip(key, 280)}.`;
    }
    if (b.farmLink || b.farm_link) {
      line += ` On the farm: ${clip(b.farmLink || b.farm_link, 140)}.`;
    }

    parts.push({
      kind: 'branch',
      branchId,
      highlights: uniqueHighlightTerms([
        topic,
        wrong,
        right,
        b.keyConcept,
        key,
        why,
        b.farmLink || b.farm_link,
        `Miss ${miss}`,
        ...clip(q, 100)
          .split(/\s+/)
          .filter((w) => w.length > 4)
          .slice(0, 6),
      ]),
      text: line,
    });
  });

  parts.push({
    kind: 'outro',
    branchId: null,
    highlights: [],
    text: 'Tap any card on the mind map if you want me to explain that miss again. You can also ask me a question with your voice or the chat box.',
  });

  return parts;
}

/**
 * Extract short highlightable phrases from a field list.
 * @param {(string|null|undefined)[]} fields
 */
export function uniqueHighlightTerms(fields) {
  const out = [];
  const seen = new Set();
  for (const raw of fields) {
    const s = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) continue;
    // Whole short phrase (≤ 5 words) or first meaningful chunks
    const words = s.split(/\s+/);
    if (words.length <= 5 && s.length <= 48) {
      const k = s.toLowerCase();
      if (!seen.has(k) && s.length >= 2) {
        seen.add(k);
        out.push(s);
      }
    }
    // Also individual significant words (≥ 5 letters, not stop-ish)
    for (const w of words) {
      const bare = w.replace(/[^\w'-]/g, '');
      if (bare.length < 5) continue;
      if (/^(about|which|their|there|these|those|would|could|should|because|through)$/i.test(bare)) {
        continue;
      }
      const k = bare.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(bare);
      if (out.length >= 14) return out;
    }
  }
  return out.slice(0, 14);
}

/**
 * Whether a highlight term is currently "active" given spoken text so far.
 * @param {string} term
 * @param {string} spokenSoFar
 */
export function isTermSpoken(term, spokenSoFar) {
  const t = String(term || '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const s = String(spokenSoFar || '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || !s) return false;
  if (s.includes(t)) return true;
  // multi-word: all content words present (order-light match for TTS lag)
  const parts = t.split(' ').filter((w) => w.length >= 3);
  if (parts.length > 1) return parts.every((w) => s.includes(w));
  return false;
}

export function buildMissCardNarration(branch) {
  if (!branch) return null;
  const miss = branch.index || '';
  const topic = branch.topic || 'Science';
  const wrong = branch.studentAnswer || 'that choice';
  const right = branch.correctAnswer || 'the better idea';
  const why = branch.why || '';
  const farm = branch.farmLink || branch.farm_link || '';
  const text = [
    `Let's look at miss ${miss} on ${topic}.`,
    `You chose ${clip(wrong, 80)}.`,
    why ? `Here's why that mix-up happens: ${clip(why, 320)}.` : '',
    branch.keyExplain || branch.key_concept_explain
      ? `Here's why the science is true: ${clip(branch.keyExplain || branch.key_concept_explain, 280)}.`
      : '',
    farm ? `On the farm: ${clip(farm, 140)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    kind: 'branch',
    branchId: branch.id || null,
    highlights: uniqueHighlightTerms([
      topic,
      wrong,
      right,
      branch.keyConcept,
      why,
      branch.keyExplain || branch.key_concept_explain,
      farm,
      `Miss ${miss}`,
    ]),
    text,
  };
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/**
 * Split spoken text into subtitle phrases (sentence / clause chunks, not one word).
 * Each cue has global word indices [start, end).
 * @param {string} text
 * @param {{ maxWords?: number, minWords?: number }} [opts]
 * @returns {{ text: string, start: number, end: number }[]}
 */
export function buildSubtitleCues(text, { maxWords = 12, minWords = 4 } = {}) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];

  // Prefer natural stops: end of sentence, then clause
  const clauses = clean
    .split(/(?<=[.!?])\s+|(?<=[;:])\s+|(?<=,)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces = clauses.length ? clauses : [clean];
  /** @type {{ text: string, start: number, end: number }[]} */
  const cues = [];
  let wordCursor = 0;

  function pushCue(words) {
    if (!words.length) return;
    const start = wordCursor;
    const end = start + words.length;
    cues.push({
      text: words.join(' '),
      start,
      end,
    });
    wordCursor = end;
  }

  for (const piece of pieces) {
    const words = piece.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      pushCue(words);
      continue;
    }
    // Long clause → pack into ~maxWords with soft break on commas/connectors
    let buf = [];
    for (let i = 0; i < words.length; i++) {
      buf.push(words[i]);
      const atEnd = i === words.length - 1;
      const soft =
        /[,;:—-]$/.test(words[i]) ||
        /^(and|but|or|so|then|because|which|that)$/i.test(words[i]);
      if (
        atEnd ||
        buf.length >= maxWords ||
        (buf.length >= minWords && soft && i < words.length - 1)
      ) {
        pushCue(buf);
        buf = [];
      }
    }
    if (buf.length) pushCue(buf);
  }

  // Merge tiny trailing fragments into previous cue
  for (let i = cues.length - 1; i > 0; i--) {
    const cur = cues[i];
    const prev = cues[i - 1];
    const curLen = cur.end - cur.start;
    if (curLen < minWords && curLen + (prev.end - prev.start) <= maxWords + 2) {
      prev.text = `${prev.text} ${cur.text}`.trim();
      prev.end = cur.end;
      cues.splice(i, 1);
    }
  }

  return cues;
}

/**
 * @param {{ text: string, start: number, end: number }[]} cues
 * @param {number} wordIndex
 */
export function cueAtWordIndex(cues, wordIndex) {
  if (!cues?.length) return '';
  const i = Math.max(0, Number(wordIndex) || 0);
  const hit =
    cues.find((c) => i >= c.start && i < c.end) ||
    cues[Math.min(cues.length - 1, cues.length - 1)];
  return hit?.text || '';
}

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
 * Speaks the scientific lesson, then the map relationships — never "you chose X" alone.
 * Returns segments with focus targets so the map can highlight while speaking.
 * @returns {{ text: string, kind: string, branchId?: string|null, highlights: string[] }[]}
 */
export function buildMindMapNarration(map) {
  if (!map) return [];
  const branches = map.branches || [];
  const n = map.missCount || branches.length || 0;
  const band = String(map.frustrationLevel || 'moderate').toLowerCase();
  /** @type {{ text: string, kind: string, branchId?: string|null, highlights: string[] }[]} */
  const parts = [];

  const root = map.root || map.topic || map.title || 'this science idea';
  const rootTerms = uniqueHighlightTerms([
    root,
    map.centralIdea,
    map.topic,
    'mind map',
  ]);

  parts.push({
    kind: 'intro',
    branchId: null,
    highlights: rootTerms,
    text:
      band === 'very_high' || band === 'high'
        ? `Let's look at the mind map. The main idea is ${clip(root, 40)}.`
        : `Let's look at the mind map. The main concept here is ${clip(root, 48)}. You have ${n} miss${n === 1 ? '' : 'es'} to repair.`,
  });

  branches.forEach((b, i) => {
    const segment = buildMissCardNarration(b, { frustrationLevel: band, index: i });
    if (segment?.text) parts.push(segment);
  });

  if (band !== 'very_high') {
    parts.push({
      kind: 'outro',
      branchId: null,
      highlights: [],
      text: 'The arrows show how your idea connects to the correct idea. Use that connection when you try again.',
    });
  }

  return parts.filter((p) => p.text && !isShallowChoiceLine(p.text));
}

function isShallowChoiceLine(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (/^you (chose|picked|selected)\s+.+\.?$/i.test(s) && s.length < 64) return true;
  if (/this question is asking for\b/i.test(s) && s.length < 80) return true;
  return false;
}

function clipByFrustration(text, band) {
  const n =
    band === 'very_high' ? 140 : band === 'high' ? 200 : band === 'low' ? 360 : 280;
  return clip(text, n);
}

function lessonSectionSpeech(section, band) {
  if (!section) return '';
  const def = section.scientificDefinition || section.body || '';
  const title = String(section.title || '').toLowerCase();
  if (section.id === 'your_answer' || /your answer/.test(title)) {
    return clipByFrustration(
      `Your answer. ${def || section.quote || ''}`,
      band,
    );
  }
  if (section.id === 'correct_answer' || /correct/.test(title)) {
    return clipByFrustration(
      `Correct idea. ${def || section.quote || ''}`,
      band,
    );
  }
  if (section.id === 'difference' || /comparison/.test(title)) {
    const diff =
      section.keyScientificDifference ||
      section.difference ||
      section.body ||
      '';
    const named = [
      section.studentConcept && section.studentConceptFunction
        ? `${section.studentConcept} → ${section.studentConceptFunction}`
        : '',
      section.correctConcept && section.correctConceptFunction
        ? `${section.correctConcept} → ${section.correctConceptFunction}`
        : '',
    ]
      .filter(Boolean)
      .join('. ');
    return clipByFrustration(
      `Scientific comparison. ${named}${named && diff ? '. ' : ''}${diff}`.trim(),
      band,
    );
  }
  if (section.id === 'connection' || /connection/.test(title)) {
    return clipByFrustration(`Key connection. ${section.body || ''}`, band);
  }
  if (section.id === 'check' && (band === 'low' || band === 'moderate' || !band)) {
    return clipByFrustration(`Quick check. ${section.body || ''}`, band);
  }
  return '';
}

function mindMapRelationshipSpeech(branch, band) {
  const graph = branch?.audioGraph;
  const root = graph?.rootConcept || branch?.topic || 'this science idea';
  const rels = Array.isArray(graph?.relationships) ? graph.relationships : [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const lines = [];
  if (band !== 'very_high') {
    lines.push(`On the map, the main concept is ${clip(root, 40)}.`);
  }
  const student = nodes.find((n) => n.id === 'student');
  const correct = nodes.find((n) => n.id === 'correct');
  if (student?.label && student.description && band !== 'very_high') {
    lines.push(
      `${clip(student.label, 32)} is your idea: ${clipByFrustration(student.description, band)}`,
    );
  }
  if (correct?.label && correct.description) {
    lines.push(
      `${clip(correct.label, 32)} is the idea that fits this question: ${clipByFrustration(correct.description, band)}`,
    );
  }
  if (rels[0]?.relationship && band !== 'very_high') {
    const rel = rels[0];
    lines.push(
      `The important connection is: ${clip(rel.from, 28)} to ${clip(rel.to, 28)}. ${clipByFrustration(rel.relationship, band)}`,
    );
  }
  return lines.filter(Boolean).join(' ');
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

export function buildMissCardNarration(branch, voice = {}) {
  if (!branch) return null;
  const band = String(voice.frustrationLevel || 'moderate').toLowerCase();
  const miss = branch.index || voice.index + 1 || '';
  const topic = branch.topic || 'Science';
  const wrong = branch.studentAnswer || '';
  const right = branch.correctAnswer || '';
  const lesson = branch.lesson;
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];

  const chunks = [];
  if (wrong && band !== 'very_high') {
    chunks.push(
      `You chose ${clip(wrong, 48)}. Let's see what that means scientifically.`,
    );
  } else {
    chunks.push("Let's look at this miss on the mind map.");
  }

  if (sections.length) {
    const wanted =
      band === 'very_high'
        ? ['your_answer', 'correct_answer']
        : band === 'high'
          ? ['your_answer', 'correct_answer', 'connection']
          : ['your_answer', 'correct_answer', 'difference', 'connection'];
    for (const id of wanted) {
      const section = sections.find((s) => s.id === id) || sections.find((s) => {
        if (id === 'your_answer') return /your answer/i.test(s.title || '');
        if (id === 'correct_answer') return /correct/i.test(s.title || '');
        if (id === 'difference') return /comparison/i.test(s.title || '');
        if (id === 'connection') return /connection/i.test(s.title || '');
        return false;
      });
      const spoken = lessonSectionSpeech(section, band);
      if (spoken) chunks.push(spoken);
    }
    if (band === 'low') {
      const check = sections.find((s) => s.id === 'check');
      const spoken = lessonSectionSpeech(check, band);
      if (spoken) chunks.push(spoken);
    }
  } else {
    const explain = branch.keyExplain || branch.rightExplain || '';
    if (explain && !isShallowChoiceLine(explain) && !/this question is asking for/i.test(explain)) {
      chunks.push(clipByFrustration(explain, band));
    }
  }

  const mapLine = mindMapRelationshipSpeech(branch, band);
  if (mapLine) chunks.push(mapLine);

  const text = chunks
    .map((c) => String(c || '').replace(/\s+/g, ' ').trim())
    .filter((c) => c && !isShallowChoiceLine(c))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  return {
    kind: 'branch',
    branchId: branch.id || null,
    highlights: uniqueHighlightTerms([
      topic,
      wrong,
      right,
      branch.keyConcept,
      lesson?.studentAnswer?.concept,
      lesson?.correctAnswer?.concept,
      branch.audioGraph?.rootConcept,
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

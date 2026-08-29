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
  let speakGen = 0;
  let keepAliveTimer = null;

  // Warm voice list in some browsers
  if (supported) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  function clearKeepAlive() {
    if (keepAliveTimer) {
      window.clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function stop() {
    speakGen += 1;
    cancelled = true;
    speaking = false;
    currentUtter = null;
    clearKeepAlive();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /**
   * Speak text aloud. Highlights each word via onWord.
   * Long text is split into Chrome-safe chunks without cancel() between them.
   * @returns {Promise<{ spoken: boolean, reason: string }>}
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
    const gen = speakGen;
    fullText = clean;
    words = clean.split(/\s+/).filter(Boolean);

    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (cancelled || gen !== speakGen) {
          resolve({ spoken: false, reason: 'cancelled' });
          return;
        }

        const chunks = splitForTts(clean);
        let chunkIndex = 0;
        let settled = false;
        let wordIndex = 0;
        let lastWordForViseme = '';
        let phoneIdx = 0;
        let phoneSeq = [];

        function armVisemesForWord(word) {
          lastWordForViseme = word;
          phoneIdx = 0;
          const letters = String(word || '')
            .toLowerCase()
            .replace(/[^a-z]/g, '');
          phoneSeq = letters.split('') || ['a'];
          onViseme?.({ viseme: letters[0] || 'rest', word, charIndex: 0 });
        }

        const fallBackTick = window.setInterval(() => {
          if (!speaking || cancelled || gen !== speakGen) return;
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

        const keepAlive = window.setInterval(() => {
          try {
            if (window.speechSynthesis?.speaking) window.speechSynthesis.resume();
          } catch {
            /* ignore */
          }
        }, 5000);

        const finish = (reason) => {
          if (settled) return;
          settled = true;
          window.clearInterval(fallBackTick);
          window.clearInterval(phoneTick);
          window.clearInterval(keepAlive);
          // A superseded speak() must not wipe the new utterance's state
          if (gen === speakGen) {
            speaking = false;
            currentUtter = null;
            onViseme?.({ viseme: 'rest', word: '', charIndex: 0 });
            onEnd?.({ reason, text: fullText });
          }
          resolve({ spoken: reason === 'end', reason });
        };

        function queueChunk() {
          if (cancelled || gen !== speakGen) {
            finish('cancelled');
            return;
          }
          if (chunkIndex >= chunks.length) {
            finish('end');
            return;
          }
          const chunk = chunks[chunkIndex];
          const utter = new window.SpeechSynthesisUtterance(chunk);
          const voice = pickVoice();
          if (voice) utter.voice = voice;
          utter.rate = rate;
          utter.pitch = pitch;
          utter.volume = volume;
          utter.lang = voice?.lang || 'en-US';
          currentUtter = utter;
          let chunkAdvanced = false;

          const advance = () => {
            if (chunkAdvanced) return;
            chunkAdvanced = true;
            chunkIndex += 1;
            window.setTimeout(queueChunk, 50);
          };

          utter.onstart = () => {
            speaking = true;
            if (chunkIndex === 0) {
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
            }
            try {
              window.speechSynthesis.resume();
            } catch {
              /* ignore */
            }
          };

          utter.onboundary = (event) => {
            if (event.name !== 'word' && event.name !== 'Word') return;
            const prior = chunks.slice(0, chunkIndex).join(' ');
            const slice = chunk.slice(event.charIndex || 0);
            const w = slice.split(/\s+/)[0] || '';
            if (!w) return;
            const prefix = `${prior} ${chunk.slice(0, event.charIndex || 0)}`;
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

          utter.onend = () => {
            if (cancelled || gen !== speakGen) {
              finish('cancelled');
              return;
            }
            advance();
          };
          utter.onerror = (e) => {
            if (e?.error === 'interrupted' || e?.error === 'canceled') {
              if (cancelled || gen !== speakGen) {
                finish('cancelled');
                return;
              }
              advance();
              return;
            }
            onError?.(e?.error || 'speech error');
            finish('error');
          };

          try {
            window.speechSynthesis.speak(utter);
          } catch (err) {
            onError?.(err instanceof Error ? err.message : 'speak failed');
            finish('error');
          }
        }

        queueChunk();
      }, 140);
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
        if (window.speechSynthesis?.speaking) {
          window.speechSynthesis.resume();
        }
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Chrome/Edge often drop long SpeechSynthesis utterances after the first
 * sentence. Split on sentence boundaries into short chunks.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitForTts(text, maxLen = 180) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const limit = Math.max(80, Number(maxLen) || 180);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = sentences.length ? sentences : [clean];
  /** @type {string[]} */
  const chunks = [];
  let buf = '';
  for (const sentence of source) {
    if (sentence.length > limit) {
      if (buf) {
        chunks.push(buf.trim());
        buf = '';
      }
      let rest = sentence;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(' ', limit);
        if (cut < 40) cut = limit;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) buf = rest;
      continue;
    }
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length <= limit) {
      buf = next;
    } else {
      if (buf) chunks.push(buf.trim());
      buf = sentence;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks.length ? chunks : [clean];
}

const WEAK_MAP_LINE =
  /^(see the lesson key idea|the idea in this farm question|your pick|that choice|the correct idea|the better idea|science)$/i;

function speakableMapLine(value, max = 420) {
  const t = clip(value, max);
  if (!t || WEAK_MAP_LINE.test(t)) return '';
  return t.replace(/[.…]+$/u, '').trim();
}

function buildMissCardScript(branch, index = 0) {
  if (!branch) return '';
  const miss = branch.index || index + 1;
  const topic = speakableMapLine(branch.topic || branch.label, 80);
  const question = speakableMapLine(branch.prompt || branch.question, 420);
  const wrong = speakableMapLine(branch.studentAnswer, 180);
  const right = speakableMapLine(branch.correctAnswer, 180);
  const key = speakableMapLine(
    branch.keyConcept || branch.key_concept,
    280,
  );
  const look = speakableMapLine(
    branch.keyExplain ||
      branch.key_concept_explain ||
      branch.rightExplain,
    520,
  );
  const why = speakableMapLine(branch.why || branch.why_wrong, 400);
  const farm = speakableMapLine(branch.farmLink || branch.farm_link, 280);

  const bits = [`Miss ${miss}${topic ? `, about ${topic}` : ''}.`];
  if (question) {
    bits.push(
      `The question was: ${/[.!?]$/.test(question) ? question : `${question}.`}`,
    );
  }
  if (wrong) bits.push(`You picked ${wrong}.`);
  if (right) bits.push(`The correct idea is ${right}.`);
  if (key && key.toLowerCase() !== String(right).toLowerCase()) {
    bits.push(`Key idea: ${key}.`);
  }
  if (look && look.toLowerCase() !== String(key).toLowerCase()) {
    bits.push(`Let's look. ${look}`);
  } else if (why) {
    bits.push(why);
  }
  if (farm && farm.toLowerCase() !== String(look).toLowerCase()) {
    bits.push(farm);
  }
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Turn a mind map into student-friendly narration that reads each card.
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
    text: `Hi, I'm Sage, your farm science mentor. You have ${n} incorrect answer${n === 1 ? '' : 's'} on this mind map. I'll read every card. Explore while I talk — the map still works.`,
  });

  if (map.bigPicture || map.summary) {
    const overviewText = speakableMapLine(map.bigPicture || map.summary, 360);
    if (overviewText) {
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
  }

  branches.forEach((b, i) => {
    const miss = b.index || i + 1;
    const topic = b.topic || b.label || 'Science';
    const q = b.prompt || b.question || '';
    const wrong = b.studentAnswer || '';
    const right = b.correctAnswer || '';
    const why = b.why || b.why_wrong || '';
    const key = b.keyExplain || b.key_concept_explain || b.keyConcept || '';
    const branchId = b.id || `miss-${i}`;
    const line = buildMissCardScript(b, i);
    if (!line) return;

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
    text: "That's the whole map. Tap a card if you want me to read that miss again.",
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
  const wrong = branch.studentAnswer || '';
  const right = branch.correctAnswer || '';
  const why = branch.why || '';
  const farm = branch.farmLink || branch.farm_link || '';
  const text = buildMissCardScript(branch);

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

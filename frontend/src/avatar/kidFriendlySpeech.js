/**
 * Child-friendly speech helpers for Sage.
 * Never expose ability labels; keep language warm and clear.
 */

const FORBIDDEN_ABILITY =
  /\b(weak|smart|average|advanced|beginner|expert|dumb|slow learner|gifted|tier|band|performance level|developing)\b/gi;

/** Technical codes that must never be spoken aloud. */
const CODEISH =
  /\b(REPEATED_[A-Z_]+|SAME_CONCEPT_[A-Z_]+|COMPOUND_[A-Z_]+|ESCALATED_[A-Z_]+|DDA_[A-Z_]+|SUPPORT_AND_SCAFFOLD|ENRICHMENT_AND_CHALLENGE|CONGRATULATE_AND_ADVANCE|STRUGGLING_OR_FRUSTRATED|NON_WRONG_[A-Z_]+)\b/g;

/**
 * Clean a name for speech (no ranks, slashes, codes glued to the name).
 * "Chris · Weak" / "Alex · Smart" → "Chris" / "Alex"
 */
export function friendlyStudentName(raw) {
  let n = String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return null;

  // Drop demo/dev ability tails: "Chris · Weak", "Bella | Average", "Alex / Smart"
  n = n.split(/[·|]/)[0].trim();
  n = n.replace(/\s*\/\s*.+$/, '').trim();

  // Drop ability words if they were ever stored as a username quirk
  n = n.replace(FORBIDDEN_ABILITY, '').replace(/\s+/g, ' ').trim();

  // Reject pure codes or pure ability usernames (e.g. login user "weak")
  if (!n || /^[A-Z_]{4,}$/.test(n)) return null;
  if (/^(friend|student|user|player)$/i.test(n)) return null;
  if (n.length < 1 || n.length > 32) return null;

  // Title case first word only for natural "Hi Maya"
  const parts = n.split(' ').filter(Boolean);
  const first = parts[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Pull a plain farm-question string from quiz payloads (objects leak as "[object Object]").
 */
export function asQuestionText(raw, maxLen = 120) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t || t === '[object Object]') return null;
    return t.length > maxLen ? `${t.slice(0, maxLen - 1).trim()}…` : t;
  }
  if (typeof raw === 'object') {
    const nested =
      raw.prompt ||
      raw.question ||
      raw.question_text ||
      raw.text ||
      raw.label ||
      raw.title ||
      null;
    if (nested && nested !== raw) return asQuestionText(nested, maxLen);
  }
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s || s === '[object Object]') return null;
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trim()}…` : s;
}

/**
 * Kid-safe wording for a wrong choice / timeout.
 */
export function friendlyWrongAnswer(raw, maxLen = 40) {
  const t = asQuestionText(raw, maxLen);
  if (!t) return null;
  if (/timed\s*out|no\s*selection|no\s*answer|\(no selection\)/i.test(t)) {
    return 'ran out of time before picking';
  }
  return t;
}

/**
 * Never dump raw API / rate-limit JSON into the UI.
 */
export function softProviderNote(errorOrNote) {
  const s = String(errorOrNote || '').trim();
  if (!s) return null;
  if (/rate.?limit|tokens per day|429|TPD|too many requests/i.test(s)) {
    return 'Cloud mentor is resting — Sage still answers with local science help';
  }
  if (/timeout|timed out|network|ECONN|fetch failed/i.test(s)) {
    return 'Connection lag — using local mentor help';
  }
  if (/GROQ_API_KEY|missing|OFFLINE/i.test(s)) {
    return 'Offline mentor mode';
  }
  // Strip huge JSON blobs
  if (s.length > 90 || s.includes('{"error"') || s.includes('org_')) {
    return 'Using local mentor help';
  }
  return s;
}

/**
 * Final guard before TTS / chat bubble.
 */
export function sanitizeKidSpeech(text) {
  let s = String(text || '');
  // Never speak tech dumps
  s = s.replace(/\[object Object\]/gi, '');
  s = s.replace(/\(timed\s*out[^)]*\)/gi, 'no answer yet');
  s = s.replace(/\(no selection\)/gi, 'no answer yet');
  // Rank slash-chains first (WEAK/SMART, STRONG/SMART, etc.)
  s = s.replace(
    /\b(weak|smart|average|advanced|strong|developing|beginner|expert)(\s*\/\s*(weak|smart|average|advanced|strong|developing|beginner|expert))+\b/gi,
    '',
  );
  s = s.replace(CODEISH, '');
  s = s.replace(FORBIDDEN_ABILITY, '');
  // Other slash pairings → softer “or”
  s = s.replace(/\b[A-Za-z]+\/[A-Za-z]+(\/[A-Za-z]+)*\b/g, (m) =>
    m.replace(/\//g, ' or '),
  );
  // Middle-dot rank tails leftover after name cleanup
  s = s.replace(/\s*[·|]+\s*/g, ' ');
  // Em/en dash → plain pause (not periods — those break explainers)
  s = s.replace(/\s*[—–]\s*/g, ', ');
  // Collapse junk from removals
  s = s
    .replace(/\s*\/+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([.!?])\1+/g, '$1')
    .replace(/^\s*[,.:;\-–—]+\s*/g, '')
    .trim();
  return s;
}

/**
 * Short, kid-friendly label for why Sage opened (spoken / UI).
 */
export function friendlyWhyOpened(code) {
  const c = String(code || '').toUpperCase();
  if (c.includes('SAME_CONCEPT') || c.includes('CONCEPT_MISCONCEPTION')) {
    return 'this science idea has been tricky on a few questions';
  }
  if (c.includes('SLOW_AND_WRONG')) {
    return 'some answers took a while and were not quite right';
  }
  if (c.includes('REPEATED_WRONG') || c.includes('REPEATED_INCORRECT')) {
    return 'a few answers in a row were not quite right';
  }
  if (c.includes('REPEATED_SLOW')) {
    return 'a few farm questions took a longer time';
  }
  if (c.includes('SELECTION') || c.includes('SWITCH')) {
    return 'you changed your answer choice a few times';
  }
  if (c.includes('HINT')) {
    return 'you used several helpful hints';
  }
  if (c.includes('LONG_PAUSE') || c.includes('IDLE')) {
    return 'there were some longer quiet moments on the farm';
  }
  if (c.includes('PERFORMANCE_DROP') || c.includes('DECLIN')) {
    return 'this stretch felt harder than earlier ones';
  }
  if (c.includes('DDA')) {
    return 'the farm got a bit tougher just now';
  }
  if (c.includes('ESCALAT')) {
    return 'this idea still feels sticky after we talked';
  }
  if (c.includes('COMPOUND')) {
    return 'a few learning signals showed up together';
  }
  if (c.includes('MANUAL')) {
    return 'you asked me for help';
  }
  if (c.includes('ENRICH') || c.includes('BORED')) {
    return 'you are ready for a little extra challenge';
  }
  if (c.includes('CONGRATUL') || c.includes('MILESTONE')) {
    return 'you just had a great farm moment';
  }
  return 'your farm play showed a place we can grow';
}

/**
 * Concrete, evidence-backed reason Sage appeared (prefer facts kids recognize).
 * e.g. "you spent about 45 seconds on each of the last few questions"
 */
export function concreteWhyOpened(code, evidence = {}) {
  const c = String(code || '').toUpperCase();
  const avg =
    evidence.avg_sec != null && Number(evidence.avg_sec) > 0
      ? Math.round(Number(evidence.avg_sec))
      : evidence.time_per_question_avg_sec != null &&
          Number(evidence.time_per_question_avg_sec) > 0
        ? Math.round(Number(evidence.time_per_question_avg_sec))
        : null;
  const hints =
    evidence.hint_count != null
      ? Number(evidence.hint_count)
      : evidence.hints_used != null
        ? Number(evidence.hints_used)
        : null;
  const switches =
    evidence.switch_count != null
      ? Number(evidence.switch_count)
      : evidence.selection_switch_count != null
        ? Number(evidence.selection_switch_count)
        : null;
  const fails =
    evidence.consecutive_fails != null
      ? Number(evidence.consecutive_fails)
      : null;
  const incorrect =
    evidence.incorrect_total != null
      ? Number(evidence.incorrect_total)
      : evidence.incorrect_answers != null
        ? Number(evidence.incorrect_answers)
        : null;
  const miss =
    evidence.miss_count != null ? Number(evidence.miss_count) : null;

  if (c.includes('SLOW_AND_WRONG')) {
    const t =
      avg != null
        ? `you spent a lot more time (about ${avg} seconds per question)`
        : 'you spent a lot more time on some questions';
    return `${t}, and those answers were not quite right`;
  }
  if (c.includes('REPEATED_SLOW')) {
    return avg != null
      ? `you spent a lot more time on farm questions — about ${avg} seconds each on the last few`
      : 'you spent a lot more time on a few farm questions in a row';
  }
  if (c.includes('SELECTION') || c.includes('SWITCH')) {
    return switches != null && switches > 0
      ? `you changed your answer about ${switches} times before choosing`
      : 'you changed your answer choice several times';
  }
  if (c.includes('HINT') && !c.includes('COMPOUND')) {
    return hints != null && hints > 0
      ? `you used about ${hints} hints recently`
      : 'you used several hints in a short time';
  }
  if (c.includes('LONG_PAUSE') || c.includes('IDLE')) {
    return avg != null
      ? `there were long quiet pauses (around ${avg} seconds on questions)`
      : 'there were long quiet pauses on the farm';
  }
  if (c.includes('REPEATED_WRONG') || c.includes('REPEATED_INCORRECT')) {
    if (fails != null && fails >= 2) {
      return `a few answers in a row were not quite right (${fails} misses just now)`;
    }
    if (incorrect != null && incorrect >= 2) {
      return `several recent answers were not quite right (about ${incorrect} misses)`;
    }
    return 'a few answers in a row were not quite right';
  }
  if (c.includes('SAME_CONCEPT') || c.includes('CONCEPT_MISCONCEPTION')) {
    return miss != null && miss >= 2
      ? `the same science idea has been tricky about ${miss} times`
      : 'the same science idea has been tricky more than once';
  }
  if (c.includes('PERFORMANCE_DROP') || c.includes('DECLIN')) {
    return avg != null
      ? `this stretch felt harder than earlier (you are also taking about ${avg}s per question)`
      : 'this stretch felt harder than earlier ones';
  }
  if (c.includes('DDA')) {
    const bits = ['the farm just got tougher (difficulty went up)'];
    if (avg != null && avg >= 25) {
      bits.push(`you are spending more time now (about ${avg}s per question)`);
    }
    if (fails != null && fails >= 1) {
      bits.push('a couple of answers missed after the jump');
    }
    if (hints != null && hints >= 2) {
      bits.push(`you reached for hints (about ${hints})`);
    }
    return bits.length > 1 ? bits.join(', and ') : bits[0];
  }
  if (c.includes('COMPOUND_SLOW') || (c.includes('COMPOUND') && c.includes('HINT'))) {
    const parts = [];
    if (avg != null) parts.push(`more time (~${avg}s each)`);
    if (hints != null) parts.push(`several hints${hints ? ` (~${hints})` : ''}`);
    return parts.length
      ? `both time and hints were high (${parts.join(' + ')})`
      : 'both slower answers and extra hints showed up together';
  }
  if (c.includes('COMPOUND')) {
    return 'a few different struggle signs showed up at once';
  }
  if (c.includes('ESCALAT')) {
    return 'this still felt sticky after we already talked';
  }
  if (c.includes('MANUAL')) {
    return 'you asked me for help';
  }
  if (c.includes('ENRICH') || c.includes('BORED')) {
    return 'you look ready for a little extra challenge';
  }
  if (c.includes('CONGRATUL') || c.includes('MILESTONE')) {
    return 'you just had a great farm moment';
  }

  if (avg != null && avg >= 30) {
    return `you spent more time on recent questions (about ${avg} seconds each)`;
  }
  if (switches != null && switches >= 2) {
    return `you changed answers several times (about ${switches} switches)`;
  }
  if (hints != null && hints >= 2) {
    return `you used several hints (about ${hints})`;
  }
  return friendlyWhyOpened(code);
}

/**
 * Behavior-first intervention diagnostics.
 *
 * Flow:
 *   Performance issue → Name trigger → Problem-focused A–D probe
 *   → Analyze chosen reason → Appropriate support
 * Science content only when the reason is concept-related (or trigger is concept struggle).
 */

import {
  CONCEPT_CATALOG,
  inferConceptFromText,
  kidConceptLabel,
  mixUpLabel,
  resolveTopicKey,
} from './conceptMaps.js';
import { asQuestionText } from './kidFriendlySpeech.js';

/** Keep in sync with INTERVENTION_FOCUS_CODES (avoid circular imports). */
const C = {
  ESCALATED_SCAFFOLDING: 'ESCALATED_SCAFFOLDING',
  SAME_CONCEPT_STRUGGLE: 'SAME_CONCEPT_STRUGGLE',
  COMPOUND_MULTI_PROBLEM: 'COMPOUND_MULTI_PROBLEM',
  SLOW_AND_WRONG: 'SLOW_AND_WRONG',
  REPEATED_WRONG: 'REPEATED_WRONG',
  PERFORMANCE_DROP: 'PERFORMANCE_DROP',
  DDA_DIFFICULTY_STRUGGLE: 'DDA_DIFFICULTY_STRUGGLE',
  REPEATED_SLOW_ANSWERS: 'REPEATED_SLOW_ANSWERS',
  FREQUENT_HINT_USAGE: 'FREQUENT_HINT_USAGE',
  REPEATED_SELECTION_SWITCHES: 'REPEATED_SELECTION_SWITCHES',
  REPEATED_LONG_PAUSES: 'REPEATED_LONG_PAUSES',
  COMPOUND_SLOW_HINT: 'COMPOUND_SLOW_HINT',
  MANUAL: 'MANUAL',
  ENRICHMENT: 'ENRICHMENT',
  CONGRATULATE: 'CONGRATULATE',
};

/** Root cause tags from student option picks */
export const REASON_KEYS = {
  DONT_KNOW_START: 'dont_know_start',
  NEED_MORE_TIME: 'need_more_time',
  DISTRACTED: 'distracted',
  ACCIDENTAL_PAUSE: 'accidental_pause',
  NOT_CONFIDENT: 'not_confident',
  MISUNDERSTOOD_Q: 'misunderstood_q',
  GUESSING: 'guessing',
  SELECTION_MISTAKE: 'selection_mistake',
  HELP_UNDERSTAND_Q: 'help_understand_q',
  CONFIRM_ONLY: 'confirm_only',
  DIFFICULTY_HIGH: 'difficulty_high',
  CONCEPT_GAP: 'concept_gap',
  MIXES_IDEAS: 'mixes_ideas',
  FEELS_RUSHED: 'feels_rushed',
  TIRED: 'tired',
  WANTS_EXPLAIN: 'wants_explain',
  WANTS_READING_HELP: 'wants_reading_help',
  WANTS_CONFIDENCE: 'wants_confidence',
  CHECK_IN: 'check_in',
  READY_STRETCH: 'ready_stretch',
  CELEBRATE: 'celebrate',
};

/** Reasons that may unlock science concept support */
const CONCEPT_REASONS = new Set([
  REASON_KEYS.CONCEPT_GAP,
  REASON_KEYS.MIXES_IDEAS,
  REASON_KEYS.WANTS_EXPLAIN,
  REASON_KEYS.DONT_KNOW_START, // may need soft start + maybe concept
  REASON_KEYS.DIFFICULTY_HIGH,
]);

function opt(letter, label, reason_key) {
  return { letter, label, reason_key, id: `${letter}_${reason_key}` };
}

/**
 * Trigger → problem-focused MCQ.
 * When wrong answers / concept misses exist, always probe the learning hang-up
 * (not pure difficulty fluff), and name the concept + last wrong when known.
 *
 * @param {string} code
 * @param {{ concept?: string, last_wrong?: string, miss_count?: number, farm_question?: string }} [evidence]
 */
export function getBehaviorProbe(code, evidence = {}) {
  let c = String(code || '').toUpperCase();
  const concept = kidConceptLabel(evidence);
  const mixLabel = mixUpLabel(evidence);
  const wrong = String(
    evidence.last_wrong || evidence.wrongAnswer || evidence.last_wrong_answer || '',
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  const missN = Number(evidence.miss_count || evidence.concept_miss_count || 0);
  const hasWrongEvidence = Boolean(wrong) || missN >= 1;

  // Mind-map / wrong-answer path wins over DDA/soft probes when real misses exist
  if (
    hasWrongEvidence &&
    (c === C.DDA_DIFFICULTY_STRUGGLE ||
      c === C.PERFORMANCE_DROP ||
      c === C.COMPOUND_MULTI_PROBLEM ||
      c === C.COMPOUND_SLOW_HINT)
  ) {
    c = missN >= 2 ? C.SAME_CONCEPT_STRUGGLE : C.REPEATED_WRONG;
  }

  if (c === C.REPEATED_SLOW_ANSWERS || c === C.REPEATED_LONG_PAUSES) {
    return {
      prompt: 'Are you unsure about how to approach this question?',
      options: [
        opt('A', "Yes, I don't know where to start", REASON_KEYS.DONT_KNOW_START),
        opt('B', 'I understand, but I need more time', REASON_KEYS.NEED_MORE_TIME),
        opt('C', 'I am distracted', REASON_KEYS.DISTRACTED),
        opt('D', 'I accidentally paused', REASON_KEYS.ACCIDENTAL_PAUSE),
      ],
    };
  }

  if (c === C.REPEATED_SELECTION_SWITCHES) {
    return {
      prompt: 'What makes you change your answer frequently?',
      options: [
        opt('A', 'I am not confident with my choice', REASON_KEYS.NOT_CONFIDENT),
        opt('B', 'I misunderstood the question', REASON_KEYS.MISUNDERSTOOD_Q),
        opt('C', 'I am guessing between options', REASON_KEYS.GUESSING),
        opt('D', 'I made a typing/selection mistake', REASON_KEYS.SELECTION_MISTAKE),
      ],
    };
  }

  if (c === C.FREQUENT_HINT_USAGE) {
    return {
      prompt: 'Why do you need hints frequently?',
      options: [
        opt('A', 'I need help understanding the question', REASON_KEYS.HELP_UNDERSTAND_Q),
        opt('B', 'I know the concept but need confirmation', REASON_KEYS.CONFIRM_ONLY),
        opt('C', 'I am not sure how to start', REASON_KEYS.DONT_KNOW_START),
        opt('D', 'I am finding the difficulty level high', REASON_KEYS.DIFFICULTY_HIGH),
      ],
    };
  }

  if (c === C.SLOW_AND_WRONG) {
    return {
      prompt: hasWrongEvidence
        ? `Some answers about ${concept} took time and were not quite right${wrong ? ` (you tried "${wrong}")` : ''}. What felt most true?`
        : 'Some answers took a while and were not quite right. What felt most true?',
      options: [
        opt('A', "I didn't know where to start", REASON_KEYS.DONT_KNOW_START),
        opt('B', 'I almost got it, but the choices confused me', REASON_KEYS.NOT_CONFIDENT),
        opt('C', 'I ran out of time or felt rushed', REASON_KEYS.FEELS_RUSHED),
        opt('D', `I am still learning ${concept}`, REASON_KEYS.CONCEPT_GAP),
      ],
    };
  }

  if (c === C.REPEATED_WRONG) {
    const farmQ = String(evidence.farm_question || evidence.questionText || '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      prompt: farmQ
        ? `What feels most true about this farm question${wrong ? ` (your pick: "${wrong}")` : ''}?`
        : hasWrongEvidence
          ? `A few answers about ${concept} were not quite right${wrong ? ` — you tried "${wrong}"` : ''}. What feels most true?`
          : 'A few answers were not quite right. What feels most true?',
      options: [
        opt('A', `I still need help understanding ${concept}`, REASON_KEYS.CONCEPT_GAP),
        opt('B', mixLabel, REASON_KEYS.MIXES_IDEAS),
        opt('C', 'I was guessing', REASON_KEYS.GUESSING),
        opt('D', 'The farm question wording was hard', REASON_KEYS.MISUNDERSTOOD_Q),
      ],
    };
  }

  if (c === C.SAME_CONCEPT_STRUGGLE) {
    const farmQ = String(evidence.farm_question || evidence.questionText || '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      prompt: farmQ
        ? `What is hardest about this question${wrong ? ` (your pick: "${wrong}")` : ''}?`
        : `This idea about ${concept} still feels sticky${wrong ? ` (last try: "${wrong}")` : ''}. What is hardest right now?`,
      options: [
        opt('A', `Explain ${concept} simply for me`, REASON_KEYS.WANTS_EXPLAIN),
        opt('B', mixLabel, REASON_KEYS.MIXES_IDEAS),
        opt('C', 'The farm questions are worded in a tricky way', REASON_KEYS.MISUNDERSTOOD_Q),
        opt('D', 'I need more time on each question', REASON_KEYS.NEED_MORE_TIME),
      ],
    };
  }

  if (c === C.DDA_DIFFICULTY_STRUGGLE) {
    return {
      prompt: 'When the farm got harder, what felt most true for you?',
      options: [
        opt('A', 'The new level feels too hard right now', REASON_KEYS.DIFFICULTY_HIGH),
        opt('B', 'I know the idea, but the questions got fancier', REASON_KEYS.HELP_UNDERSTAND_Q),
        opt('C', 'I feel rushed or take more time now', REASON_KEYS.FEELS_RUSHED),
        opt('D', "I'm not sure what the tougher questions ask", REASON_KEYS.DONT_KNOW_START),
      ],
    };
  }

  if (c === C.PERFORMANCE_DROP) {
    return {
      prompt: 'This stretch felt harder than earlier. What changed for you?',
      options: [
        opt('A', 'The science ideas felt new or tricky', REASON_KEYS.CONCEPT_GAP),
        opt('B', "I'm tired or distracted", REASON_KEYS.TIRED),
        opt('C', "I'm not sure how to approach these", REASON_KEYS.DONT_KNOW_START),
        opt('D', 'The pace or timer feels rough', REASON_KEYS.FEELS_RUSHED),
      ],
    };
  }

  if (c === C.COMPOUND_SLOW_HINT || c === C.COMPOUND_MULTI_PROBLEM) {
    return {
      prompt: hasWrongEvidence
        ? `A few signals showed up on ${concept}. What is the main hang-up?`
        : 'A few tough signals showed up together. What is the main hang-up?',
      options: [
        opt('A', "I don't know where to start", REASON_KEYS.DONT_KNOW_START),
        opt('B', `I need ${concept} explained`, REASON_KEYS.CONCEPT_GAP),
        opt('C', 'The difficulty feels high', REASON_KEYS.DIFFICULTY_HIGH),
        opt('D', 'I second-guess myself a lot', REASON_KEYS.NOT_CONFIDENT),
      ],
    };
  }

  if (c === C.ESCALATED_SCAFFOLDING) {
    return {
      prompt: "I'm back to help again. What do you need most this time?",
      options: [
        opt('A', 'Explain the idea in tinier steps', REASON_KEYS.WANTS_EXPLAIN),
        opt('B', 'Help me approach the farm question', REASON_KEYS.DONT_KNOW_START),
        opt('C', 'Help me feel sure when I pick', REASON_KEYS.NOT_CONFIDENT),
        opt('D', 'I need a calmer restart', REASON_KEYS.CHECK_IN),
      ],
    };
  }

  if (c === C.MANUAL) {
    return {
      prompt: 'You called me over. What kind of help do you want?',
      options: [
        opt('A', 'Explain the science idea simply', REASON_KEYS.WANTS_EXPLAIN),
        opt('B', 'Help me read the farm question', REASON_KEYS.WANTS_READING_HELP),
        opt('C', 'Help me feel more confident choosing', REASON_KEYS.WANTS_CONFIDENCE),
        opt('D', 'Just a calm check-in', REASON_KEYS.CHECK_IN),
      ],
    };
  }

  if (c === C.ENRICHMENT) {
    return {
      prompt: 'You are ready for a stretch. What sounds good?',
      options: [
        opt('A', 'A harder farm challenge', REASON_KEYS.READY_STRETCH),
        opt('B', 'A puzzle that uses this idea in a new way', REASON_KEYS.READY_STRETCH),
        opt('C', 'Keep practicing at this level a bit', REASON_KEYS.CONFIRM_ONLY),
        opt('D', 'Tell me what I am doing well', REASON_KEYS.CELEBRATE),
      ],
    };
  }

  if (c === C.CONGRATULATE) {
    return {
      prompt: 'Wonderful farm work! What should we do next?',
      options: [
        opt('A', 'Celebrate and keep going', REASON_KEYS.CELEBRATE),
        opt('B', 'Try a slightly harder challenge', REASON_KEYS.READY_STRETCH),
        opt('C', 'Review one idea quickly', REASON_KEYS.CONFIRM_ONLY),
        opt('D', 'Just a high five and back to the farm', REASON_KEYS.CHECK_IN),
      ],
    };
  }

  // Default: if wrongs exist, concept probe; else generic process
  if (hasWrongEvidence) {
    return {
      prompt: `What is getting in the way with ${concept}?`,
      options: [
        opt('A', `I need ${concept} explained`, REASON_KEYS.CONCEPT_GAP),
        opt('B', 'I misread the farm question', REASON_KEYS.MISUNDERSTOOD_Q),
        opt('C', 'I was guessing', REASON_KEYS.GUESSING),
        opt('D', 'I feel rushed or distracted', REASON_KEYS.DISTRACTED),
      ],
    };
  }

  return {
    prompt: 'What is getting in the way right now?',
    options: [
      opt('A', "I don't know where to start", REASON_KEYS.DONT_KNOW_START),
      opt('B', 'I need the science idea explained', REASON_KEYS.CONCEPT_GAP),
      opt('C', 'The question wording feels hard', REASON_KEYS.MISUNDERSTOOD_Q),
      opt('D', 'I feel rushed or distracted', REASON_KEYS.DISTRACTED),
    ],
  };
}

export function formatDiagnosticText(probe) {
  if (!probe?.prompt) return '';
  const lines = [probe.prompt, ''];
  for (const o of probe.options || []) {
    lines.push(`${o.letter}. ${o.label}`);
  }
  return lines.join('\n');
}

/**
 * Full diagnostic payload for focus + session.
 */
export function buildBehaviorDiagnostic(code, evidence = {}) {
  const probe = getBehaviorProbe(code, {
    concept: evidence.concept || evidence.concept_topic,
    concept_topic: evidence.concept_topic || evidence.concept,
    last_wrong:
      evidence.last_wrong || evidence.wrongAnswer || evidence.last_wrong_answer,
    miss_count: evidence.miss_count || evidence.missCount || evidence.concept_miss_count,
    farm_question: evidence.questionText || evidence.farm_question,
    questionText: evidence.questionText || evidence.farm_question,
    skill: evidence.skill,
    sub_concept: evidence.sub_concept,
    chapter_name: evidence.chapter_name || evidence.chapter,
    chapter: evidence.chapter || evidence.chapter_name,
  });
  const text = formatDiagnosticText(probe);
  const farmQ = asQuestionText(evidence.questionText || evidence.farm_question, 70);
  return {
    phase: 'behavior_probe',
    prompt: probe.prompt,
    options: probe.options,
    diagnostic_question: text,
    spoken_probe: probe.prompt,
    farm_question_context: farmQ,
    diagnostic_code: code,
  };
}

/**
 * Match student free text / letter / full option to a reason.
 */
export function parseBehaviorChoice(studentMessage, options = []) {
  const raw = String(studentMessage || '').trim();
  if (!raw || !options.length) return null;

  const lower = raw.toLowerCase();

  // Pure letter: A / a / A. / option A
  const letterOnly = raw.match(/^\s*(?:option\s*)?([A-Da-d])(?:[.)\s]|$)/);
  if (letterOnly) {
    const L = letterOnly[1].toUpperCase();
    const hit = options.find((o) => o.letter === L);
    if (hit) return { ...hit, matched_via: 'letter' };
  }

  // "A. label..." or starting with letter + label fragment
  const letterLead = raw.match(/^\s*([A-Da-d])[.)\s:-]+(.+)$/);
  if (letterLead) {
    const L = letterLead[1].toUpperCase();
    const hit = options.find((o) => o.letter === L);
    if (hit) return { ...hit, matched_via: 'letter_lead' };
  }

  // Full label containment / keyword overlap
  let best = null;
  let bestScore = 0;
  for (const o of options) {
    const lab = String(o.label || '').toLowerCase();
    if (!lab) continue;
    if (lower === lab || lower.includes(lab) || lab.includes(lower)) {
      return { ...o, matched_via: 'label' };
    }
    const words = lab.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => lower.includes(w)).length;
    const score = words.length ? hits / words.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (best && bestScore >= 0.5) {
    return { ...best, matched_via: 'fuzzy' };
  }

  // Free-text keyword map when options not matched cleanly
  const free = freeTextReason(lower);
  if (free) {
    const matchOpt = options.find((o) => o.reason_key === free);
    return matchOpt
      ? { ...matchOpt, matched_via: 'free_text' }
      : {
          letter: null,
          label: raw.slice(0, 80),
          reason_key: free,
          matched_via: 'free_text_key',
        };
  }

  return null;
}

function freeTextReason(lower) {
  if (/\b(don'?t know|where to start|how to start|no idea|stuck)\b/.test(lower)) {
    return REASON_KEYS.DONT_KNOW_START;
  }
  if (/\b(more time|need time|too fast|slow down)\b/.test(lower)) {
    return REASON_KEYS.NEED_MORE_TIME;
  }
  if (/\b(distract|phone|noise|focus)\b/.test(lower)) return REASON_KEYS.DISTRACTED;
  if (/\b(accident|oops|paused|afk)\b/.test(lower)) return REASON_KEYS.ACCIDENTAL_PAUSE;
  if (/\b(not sure|not confident|second.?guess|unsure)\b/.test(lower)) {
    return REASON_KEYS.NOT_CONFIDENT;
  }
  if (/\b(misread|wording|confusing question|didn'?t understand the question)\b/.test(lower)) {
    return REASON_KEYS.MISUNDERSTOOD_Q;
  }
  if (/\b(guess|random|lucky)\b/.test(lower)) return REASON_KEYS.GUESSING;
  if (/\b(wrong click|typo|mistake|mis.?click)\b/.test(lower)) {
    return REASON_KEYS.SELECTION_MISTAKE;
  }
  if (/\b(hard|difficult|too tough|level)\b/.test(lower)) {
    return REASON_KEYS.DIFFICULTY_HIGH;
  }
  if (/\b(explain|teach|what is|from the begin|beginning|concept|science)\b/.test(lower)) {
    return REASON_KEYS.WANTS_EXPLAIN;
  }
  if (/\b(mix|confus(e|ing) with|same as)\b/.test(lower)) return REASON_KEYS.MIXES_IDEAS;
  if (/\b(rush|timer|time.?out)\b/.test(lower)) return REASON_KEYS.FEELS_RUSHED;
  if (/\b(tired|sleepy|brain fog)\b/.test(lower)) return REASON_KEYS.TIRED;
  if (/\b(hint|confirm)\b/.test(lower)) return REASON_KEYS.CONFIRM_ONLY;
  return null;
}

export function needsScienceSupport(reasonKey, code = '') {
  if (CONCEPT_REASONS.has(reasonKey)) return true;
  const c = String(code || '').toUpperCase();
  // Even with these triggers, only if they chose concept_gap-ish
  if (c === C.SAME_CONCEPT_STRUGGLE && reasonKey === REASON_KEYS.DONT_KNOW_START) {
    return true;
  }
  return false;
}

function softConceptBite(topic, farmQuestion = null) {
  const fromQ = inferConceptFromText(farmQuestion);
  const key = fromQ || resolveTopicKey(topic) || topic;
  const catalog = CONCEPT_CATALOG[key];
  if (
    key === 'Plant Diversity' ||
    /monocot|dicot|cotyledon|taproot|fibrous root/i.test(String(farmQuestion || ''))
  ) {
    return (
      'Tiny science note: monocots usually have fibrous roots (many thin threads). ' +
      'Dicots usually have a taproot (one thick main root). That is a key root-system difference.'
    );
  }
  if (/photo/i.test(String(key))) {
    return (
      'Tiny science note: plants build food in their leaves using light, water, and carbon dioxide — ' +
      'not from soil food. Leaves are the main “kitchen.”'
    );
  }
  if (catalog?.summary) return `Tiny science note: ${String(catalog.summary).slice(0, 140)}`;
  if (catalog?.nodes?.[0]) {
    const n = catalog.nodes[0];
    return `Tiny science note: "${n.label}" is about ${String(n.explanation || n.role || 'one plant job').slice(0, 100)}.`;
  }
  return null;
}

/**
 * Support reply after student chooses a behavior option.
 * Science only when the underlying issue is conceptual (or they asked for it).
 */
export function buildBehaviorSupportReply({
  name = 'friend',
  why = 'farm play needed a little help',
  concept = 'this science idea',
  reasonKey,
  choiceLabel = '',
  code = '',
  farmQuestion = null,
} = {}) {
  const who = name || 'friend';
  const idea = kidConceptLabel({
    farm_question: farmQuestion,
    concept,
    concept_topic: concept,
  });
  const heard = choiceLabel
    ? `I hear you: "${String(choiceLabel).slice(0, 70)}".`
    : 'Thanks for telling me.';
  const farmBit = farmQuestion
    ? ` When you return to the farm question, read it once slowly.`
    : '';
  const science = softConceptBite(idea, farmQuestion);
  const useScience = needsScienceSupport(reasonKey, code);

  const supportByReason = {
    [REASON_KEYS.DONT_KNOW_START]:
      `${who}, ${heard} Starting is often the hard part — not “being bad at science.” ` +
      `Try this approach: (1) mark the question words (what / which / why), ` +
      `(2) put the farm situation in your own words, (3) drop any choice that does not match that idea. ` +
      `We opened because ${why}. No science test from me right now — just a calmer starting plan.${farmBit}`,

    [REASON_KEYS.NEED_MORE_TIME]:
      `${who}, ${heard} Extra thinking time is okay. ` +
      `Plan: pause, breathe, re-read the last sentence of the farm question, then pick once. ` +
      `You do not have to race. I came over because ${why}.${farmBit}`,

    [REASON_KEYS.DISTRACTED]:
      `${who}, ${heard} Let's reset focus: one deep breath, hide extra tabs/noise if you can, ` +
      `and give the next farm question only 30 honest seconds of attention. ` +
      `I came because ${why}. You can call me anytime you need a calm restart.`,

    [REASON_KEYS.ACCIDENTAL_PAUSE]:
      `${who}, ${heard} No problem — that was just a pause, not a stuck-forever moment. ` +
      `When you go back, re-read the question once and choose when ready. ` +
      `I still checked in because ${why}, but you are fine.`,

    [REASON_KEYS.NOT_CONFIDENT]:
      `${who}, ${heard} Switching a lot often means careful thinking, not failure. ` +
      `Strategy: drop two answers that clearly do not fit, compare the last two on ONE difference only, then lock in. ` +
      `I came because ${why}. Confidence grows with a clear “why I picked this.”${farmBit}`,

    [REASON_KEYS.MISUNDERSTOOD_Q]:
      `${who}, ${heard} Tricky wording can look like a science miss. ` +
      `Help: restate the farm question as “The question is really asking: …” in one short sentence, ` +
      `then choose. I opened because ${why}. We can fix process first${useScience && science ? `; also: ${science}` : '.'}${farmBit}`,

    [REASON_KEYS.GUESSING]:
      `${who}, ${heard} Guessing is a signal to slow the choice process. ` +
      `Rule: no pure guess — first mark ⛔ two options that cannot work, then decide between the rest. ` +
      `I came because ${why}.${farmBit}`,

    [REASON_KEYS.SELECTION_MISTAKE]:
      `${who}, ${heard} Accidental clicks happen. Next time: hover, read the choice once more, then press. ` +
      `If the farm lets you change before submit, do a two-second double-check. ` +
      `I checked in because ${why}, but this may not be a learning problem at all.`,

    [REASON_KEYS.HELP_UNDERSTAND_Q]:
      `${who}, ${heard} Let's treat the farm question like a short story. ` +
      `Pull out: who/what is in the scene, what is the one thing to decide, which words are science words. ` +
      `I came because ${why}.${farmBit}`,

    [REASON_KEYS.CONFIRM_ONLY]:
      `${who}, ${heard} Wanting a check is thoughtful, not a problem. ` +
      `After you choose, say one reason out loud (“I picked this because…”). If you can say a reason, you are ready without a hint. ` +
      `I stopped by because ${why}.`,

    [REASON_KEYS.DIFFICULTY_HIGH]:
      `${who}, ${heard} When difficulty jumps, shrink the job: ignore fancy words for ten seconds and ask “what is this really about?” ` +
      `${useScience && science ? science + ' ' : ''}` +
      `I came because ${why}. You can take one easier mental step, then return to the farm.${farmBit}`,

    [REASON_KEYS.CONCEPT_GAP]:
      `${who}, ${heard} Thanks — that helps. The underlying issue looks like the science idea itself. ` +
      `${science || `Let's keep ${idea} super simple for now.`} ` +
      `I came because ${why}. When you go back, look for the choice that matches that tiny idea.${farmBit}`,

    [REASON_KEYS.MIXES_IDEAS]:
      `${who}, ${heard} Mixing similar ideas is common. ` +
      `${science || `Pick one label for ${idea} and stick to its job only.`} ` +
      `I opened because ${why}. Before answering, ask: “Is this the same idea, or a cousin idea?”${farmBit}`,

    [REASON_KEYS.FEELS_RUSHED]:
      `${who}, ${heard} Rush makes even good thinkers miss. ` +
      `Pace plan: first 5 seconds only read, next 10 seconds decide, last click is the commit. ` +
      `I came because ${why}. Speed is not the goal — a clear choice is.`,

    [REASON_KEYS.TIRED]:
      `${who}, ${heard} Tired brains need kindness. Try one farm question with a water/stretch break first if you can. ` +
      `I checked in because ${why}. Come back when your focus feels 10% better — that is enough.`,

    [REASON_KEYS.WANTS_EXPLAIN]:
      `${who}, ${heard} Happy to explain simply. ` +
      `${science || `Think of ${idea} as one farm job the plant or soil must do.`} ` +
      `I came because ${why}. Tell me if you want an even tinier step.`,

    [REASON_KEYS.WANTS_READING_HELP]:
      `${who}, ${heard} Reading support: break the farm sentence at commas, cover half the choices, and underline “not / most / mainly.” ` +
      `I came because ${why}.${farmBit}`,

    [REASON_KEYS.WANTS_CONFIDENCE]:
      `${who}, ${heard} Confidence kit: drop two options that do not fit, name one reason for your pick, then stick with it unless you find a hard fact against it. ` +
      `I came because ${why}.`,

    [REASON_KEYS.CHECK_IN]:
      `${who}, ${heard} You’re doing fine taking a breath. ` +
      `I showed up because ${why}. When you’re ready, return to the farm — I’m nearby if you want more help.`,

    [REASON_KEYS.READY_STRETCH]:
      `${who}, ${heard} Love that energy. Try one tougher farm goal that still uses the same idea, and explain your pick in one sentence. You’ve got this.`,

    [REASON_KEYS.CELEBRATE]:
      `${who}, ${heard} High five — your farm work shows real effort. Keep that curious brain going!`,
  };

  return (
    supportByReason[reasonKey] ||
    `${who}, ${heard} I came because ${why}. ` +
      `I'll help with the process first: re-read the farm question, say what it asks in your words, then choose. ` +
      (useScience && science ? science : 'We only dig deeper into the science if you say the idea itself is fuzzy.')
  );
}

export function reasonNeedsMindMap(reasonKey) {
  return (
    reasonKey === REASON_KEYS.CONCEPT_GAP ||
    reasonKey === REASON_KEYS.MIXES_IDEAS ||
    reasonKey === REASON_KEYS.WANTS_EXPLAIN
  );
}

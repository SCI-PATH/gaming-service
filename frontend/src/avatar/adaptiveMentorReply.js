/**
 * Adaptive mentor follow-ups for real conversational flow:
 * Avatar question → student answer → evaluate understanding → guidance / next question.
 */

import { CONCEPT_CATALOG, resolveTopicKey } from './conceptMaps.js';
import {
  friendlyStudentName,
  friendlyWhyOpened,
  sanitizeKidSpeech,
} from './kidFriendlySpeech.js';
import { INTERVENTION_FOCUS_CODES } from './interventionFocus.js';

/**
 * @typedef {'understood'|'partial'|'misconception'|'unsure'|'ask_hint'|'reading'|'timing'|'ready'|'short'|'off_topic'} UnderstandingLevel
 */

function conceptEntry(topic) {
  const key = resolveTopicKey(topic) || topic;
  return { key, catalog: CONCEPT_CATALOG[key] || null };
}

function conceptKeywords(topic) {
  const { key, catalog } = conceptEntry(topic);
  const words = new Set();
  const add = (s) => {
    String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .forEach((w) => words.add(w));
  };
  add(key);
  add(catalog?.summary);
  add(catalog?.root);
  for (const n of catalog?.nodes || []) {
    add(n.label);
    add(n.role);
    add(n.explanation);
  }
  // Concept-specific anchors
  if (/photo/i.test(String(key))) {
    ['leaf', 'leaves', 'light', 'sun', 'sunlight', 'chlorophyll', 'sugar', 'glucose', 'carbon', 'co2', 'water', 'energy', 'food'].forEach((w) => words.add(w));
  }
  return words;
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'how',
  'what',
  'when',
  'which',
  'into',
  'they',
  'their',
  'them',
  'plant',
  'plants',
  'farm',
]);

const MISCONCEPTION_HINTS = [
  {
    test: /\b(roots?\s+(make|do|create|produce)\s+([a-z]+\s+){0,3}(food|sugar)|roots?\s+(absorb|take\s*in)\s+(sun|light)|roots?\s+photosynth)/i,
    tip: 'Roots mostly take in water and minerals. Leaves are the main place plants make food with light.',
  },
  {
    test: /\b(plants?\s+(eat|breathe\s+in)\s+oxygen|plants?\s+take\s+in\s+oxygen\s+to\s+make\s+food)/i,
    tip: 'During photosynthesis, plants take in carbon dioxide and release oxygen. Oxygen is more about their night/respiration needs.',
  },
  {
    test: /\b(sun(light)?\s+(is\s+)?(food|the\s+food)|plants?\s+eat\s+sun|sun\s+is\s+the\s+food)/i,
    tip: 'Sunlight is energy, not the food itself. Plants use light energy to make sugar (their food).',
  },
  {
    test: /\b(only\s+water|just\s+water|water\s+alone)\b/i,
    tip: 'Water is one ingredient. Plants also need light and carbon dioxide to make food.',
  },
];

/**
 * Classify what the student just said, including level of science understanding.
 * @returns {{ level: UnderstandingLevel, matchedKeywords: string[], misconceptionTip: string|null }}
 */
export function evaluateStudentAnswer(raw = '', topic = null, evidence = {}) {
  const text = String(raw || '').trim();
  const s = text.toLowerCase();
  if (!s) {
    return { level: 'short', matchedKeywords: [], misconceptionTip: null };
  }

  if (
    /\b(explain|start over|from the (very )?begin|teach me|tell me (about|how)|what is (photosynthesis|it)|go back to the start|basics)\b/i.test(
      s,
    )
  ) {
    return { level: 'want_explainer', matchedKeywords: [], misconceptionTip: null };
  }

  if (
    /\b(idk|i don't know|i dont know|no idea|not sure|confused|dunno|help|stuck|fuzzy|lost|no clue)\b/.test(
      s,
    )
  ) {
    return { level: 'unsure', matchedKeywords: [], misconceptionTip: null };
  }
  if (
    /\b(hint|clue|tell me|give me|what'?s the answer|what is the answer|just say)\b/.test(
      s,
    )
  ) {
    return { level: 'ask_hint', matchedKeywords: [], misconceptionTip: null };
  }
  if (
    /\b(read|reading|wording|words were hard|didn't understand the question|long question|didn't get the question)\b/.test(
      s,
    )
  ) {
    return { level: 'reading', matchedKeywords: [], misconceptionTip: null };
  }
  if (
    /\b(slow|took long|taking long|time|timer|rushed|too little time|ran out of time)\b/.test(
      s,
    )
  ) {
    return { level: 'timing', matchedKeywords: [], misconceptionTip: null };
  }
  if (
    /\b(ready|ok|okay|got it|i get it|makes sense|thanks|thank you|i understand|try again|i see)\b/.test(
      s,
    ) &&
    s.split(/\s+/).length <= 8
  ) {
    return { level: 'ready', matchedKeywords: [], misconceptionTip: null };
  }

  for (const m of MISCONCEPTION_HINTS) {
    if (m.test.test(s)) {
      return {
        level: 'misconception',
        matchedKeywords: [],
        misconceptionTip: m.tip,
      };
    }
  }

  const wrong = String(evidence.wrongAnswer || evidence.last_wrong_answer || '')
    .toLowerCase()
    .trim();
  if (wrong && wrong.length > 2 && s.includes(wrong.slice(0, 24))) {
    // Student restated the wrong choice without correcting it
    if (!/\b(not|wrong|mistake|instead|actually|no)\b/.test(s)) {
      return {
        level: 'misconception',
        matchedKeywords: [],
        misconceptionTip:
          'That choice is a common mix-up. Let’s rebuild the idea with a smaller science fact.',
      };
    }
  }

  const keys = conceptKeywords(topic);
  const tokens = s
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const matched = tokens.filter((t) => keys.has(t));
  const uniqueMatched = [...new Set(matched)];

  if (tokens.length <= 2 && uniqueMatched.length === 0) {
    return { level: 'short', matchedKeywords: [], misconceptionTip: null };
  }

  // Keywords + causal language → understood or partial
  const causal =
    /\b(because|since|so that|makes|helps|is for|means|used for|need|needs|turns?|uses?)\b/.test(
      s,
    );
  if (uniqueMatched.length >= 2 && (causal || tokens.length >= 6)) {
    return {
      level: 'understood',
      matchedKeywords: uniqueMatched.slice(0, 4),
      misconceptionTip: null,
    };
  }
  if (uniqueMatched.length >= 1 || causal || tokens.length >= 5) {
    return {
      level: 'partial',
      matchedKeywords: uniqueMatched.slice(0, 4),
      misconceptionTip: null,
    };
  }

  // Talked a bit but not on concept
  if (tokens.length >= 4) {
    return { level: 'off_topic', matchedKeywords: [], misconceptionTip: null };
  }
  return { level: 'short', matchedKeywords: [], misconceptionTip: null };
}

function conceptTip(topic) {
  const { key, catalog } = conceptEntry(topic);
  if (catalog?.summary) return String(catalog.summary).slice(0, 150);
  const node = catalog?.nodes?.[0];
  if (node?.label && node?.explanation) {
    return `${node.label}: ${String(node.explanation).slice(0, 110)}`;
  }
  return `Think about what ${key || 'this farm idea'} does for plants or soil on the farm.`;
}

function softerNodeCheck(topic) {
  const { catalog, key } = conceptEntry(topic);
  const node = catalog?.nodes?.[0];
  if (node?.label) {
    return `Quick check: what does "${node.label}" help with for ${key || 'this idea'}?`;
  }
  return `In your own words, what is one job of ${key || 'this science idea'}?`;
}

/**
 * True if a model reply looks like a frozen re-open (ignored the student).
 */
export function looksLikeIgnoredStudentReply(
  reply = '',
  studentMessage = '',
  focus = {},
) {
  const r = String(reply || '').trim().toLowerCase();
  const student = String(studentMessage || '').trim().toLowerCase();
  if (!r) return true;
  if (!student) return false;

  const opener = String(focus.spoken_opener || '').trim().toLowerCase();
  if (opener) {
    const a = r.replace(/\s+/g, ' ').slice(0, 90);
    const b = opener.replace(/\s+/g, ' ').slice(0, 90);
    if (a === b) return true;
    if (a.length > 40 && b.includes(a.slice(20, 70))) return true;
  }

  // Re-greeting + re-stating why without acknowledging the student’s words
  const greetsAgain = /^hi\b/.test(r) && /i came over because/.test(r);
  const studentWords = student
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  const anyStudentWord =
    studentWords.length === 0 ||
    studentWords.some((w) => r.includes(w));
  const quotesStudent = r.includes('"') && studentWords.some((w) => r.includes(w));
  const acknowledges =
    /\b(i hear you|you said|you shared|thanks for|great thinking|that idea|your idea|building on|you mentioned|i noticed you)\b/.test(
      r,
    ) ||
    quotesStudent ||
    anyStudentWord;

  if (greetsAgain && !acknowledges) return true;
  if (/preferred opening|auto-signal|private coach only/i.test(r)) return true;
  return false;
}

/**
 * Offline adaptive path — still trigger/concept locked (wraps session when possible).
 */
export function buildAdaptiveFollowUp({
  studentMessage = '',
  context = {},
  chatHistory = [],
} = {}) {
  // Prefer the stronger performance-session mentor when available
  try {
    // Lazy path via dynamic import pattern not needed — keep self-contained for callers
    const focus = context?.intervention_focus || {};
    // Import is circular if we import mentorConversationSession here from adaptive
    // which already imports evaluate from adaptive. Inline lightweight version:
    return buildAdaptiveFollowUpCore({
      studentMessage,
      context,
      chatHistory,
    });
  } catch {
    return buildAdaptiveFollowUpCore({
      studentMessage,
      context,
      chatHistory,
    });
  }
}

function buildAdaptiveFollowUpCore({
  studentMessage = '',
  context = {},
  chatHistory = [],
} = {}) {
  const focus = context?.intervention_focus || {};
  const name =
    friendlyStudentName(
      context?.student_profile?.display_name ||
        context?.student_profile?.username,
    ) || 'friend';
  const concept =
    focus.concept_topic ||
    context?.current_question?.topic ||
    context?.mind_map?.topic ||
    'this science idea';
  const code =
    focus.underlying_code ||
    focus.code ||
    context?.non_wrong_scenario_code ||
    '';
  const why =
    focus.friendly_why ||
    focus.problem_statement_friendly ||
    friendlyWhyOpened(code);
  const tip = conceptTip(concept);
  const check = softerNodeCheck(concept);

  const evaluation = evaluateStudentAnswer(studentMessage, concept, {
    wrongAnswer:
      focus.last_wrong_answer ||
      context?.current_question?.student_last_wrong_answer ||
      null,
  });

  const snippet =
    String(studentMessage).length > 80
      ? `${String(studentMessage).slice(0, 77).trim()}…`
      : String(studentMessage).trim();

  const farmQRaw =
    focus.current_question ||
    context?.current_question?.question_text ||
    '';
  const farmBit = farmQRaw
    ? ` Remember the farm question was about: "${String(farmQRaw).slice(0, 64)}".`
    : '';

  const priorUserTurns = (chatHistory || []).filter(
    (m) => m?.role === 'user',
  ).length;
  const turnNudge =
    priorUserTurns >= 2
      ? ' You are making thoughtful progress.'
      : '';

  let reply;
  switch (evaluation.level) {
    case 'understood': {
      const bits = evaluation.matchedKeywords.length
        ? ` You used solid ideas like ${evaluation.matchedKeywords.join(', ')}.`
        : '';
      reply = `${name}, I hear you: "${snippet}". That shows real understanding of ${concept}.${bits} Because we opened for ${why}, here is one tight check: ${check}`;
      break;
    }
    case 'partial':
      reply = `${name}, I hear you: "${snippet}". Good start on ${concept}! Let me fill a small gap: ${tip}${farmBit} Now: ${check}`;
      break;
    case 'misconception':
      reply = `${name}, I hear you: "${snippet}". That is a common mix-up for ${concept}. ${evaluation.misconceptionTip || tip}${farmBit} Try this gentler step: ${check}`;
      break;
    case 'unsure':
      reply = `${name}, thank you for being honest. I came over because ${why}. Here is a gentle clue about ${concept}: ${tip}${farmBit} ${check}`;
      break;
    case 'ask_hint':
      reply = `${name}, I can nudge without giving the quiz answer letter. For ${concept}: ${tip} Using that, ${check}`;
      break;
    case 'reading':
      reply = `${name}, great self-check — wording can slow us down. Slow down on the science words for ${concept}.${farmBit} Restate the question in five words, then ${check}`;
      break;
    case 'timing':
      reply = `${name}, we can slow the science down. I came over because ${why}. First lock one idea: ${tip} Then ${check}`;
      break;
    case 'ready':
      reply = `${name}, love that energy! Since we opened for ${why}, try one more check on ${concept}: ${check}`;
      break;
    case 'off_topic':
      reply = `${name}, thanks for sharing: "${snippet}". Let’s steer back to ${concept}, which is why I came over (${why}). Soft clue: ${tip} ${check}`;
      break;
    case 'short':
    default:
      reply = `${name}, I heard "${snippet || 'a short note'}". Can you add one more detail about ${concept}? For example: ${tip} ${check}`;
      break;
  }

  if (turnNudge) reply += turnNudge;
  return sanitizeKidSpeech(reply);
}

/** @deprecated use evaluateStudentAnswer().level */
export function classifyStudentIntent(raw = '', topic = null) {
  return evaluateStudentAnswer(raw, topic).level;
}

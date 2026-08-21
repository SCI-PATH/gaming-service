/**
 * Behavior monitor — detects trigger scenarios for focused avatar intervention.
 * Single incorrect answers alone never open the mentor.
 * Returns the highest-priority focused problem (trigger reason).
 */

import {
  INTERVENTION_FOCUS_CODES,
  focusPriority,
  pickMainProblem,
} from './interventionFocus.js';

export const NON_WRONG_SCENARIOS = {
  REPEATED_SLOW_ANSWERS: INTERVENTION_FOCUS_CODES.REPEATED_SLOW_ANSWERS,
  REPEATED_SELECTION_SWITCHES: INTERVENTION_FOCUS_CODES.REPEATED_SELECTION_SWITCHES,
  FREQUENT_HINT_USAGE: INTERVENTION_FOCUS_CODES.FREQUENT_HINT_USAGE,
  REPEATED_LONG_PAUSES: INTERVENTION_FOCUS_CODES.REPEATED_LONG_PAUSES,
  DDA_DIFFICULTY_STRUGGLE: INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE,
  COMPOUND_SLOW_HINT: INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT,
  SLOW_AND_WRONG: INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG,
  REPEATED_WRONG: INTERVENTION_FOCUS_CODES.REPEATED_WRONG,
  PERFORMANCE_DROP: INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP,
  SAME_CONCEPT_STRUGGLE: INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE,
  COMPOUND_MULTI_PROBLEM: INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM,
  ESCALATED_SCAFFOLDING: INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING,
};

export const DEFAULT_NON_WRONG_THRESHOLDS = {
  slowQuestionSec: 45,
  consecutiveSlowCount: 3,
  consecutiveSlowCountStrong: 4,
  selectionSwitchMin: 4,
  selectionSwitchQuestions: 3,
  hintWindowSize: 5,
  hintCountThreshold: 3,
  longPauseSec: 90,
  consecutiveLongPauseCount: 2,
  ddaStruggleSlowSec: 40,
  ddaStruggleMinAnswers: 2,
  compoundSlowHintCount: 2,
  consecutiveWrongCount: 3,
  consecutiveSlowWrongCount: 2,
  sameConceptMisses: 3,
  performanceDropWindow: 4,
  performanceDropMinPriorCorrect: 2,
  recentWindowSize: 10,
};

/**
 * @param {object[]} events - chronological, newest last
 * @param {object} [opts]
 */
export function evaluateNonWrongBehaviors(events = [], opts = {}) {
  const t = { ...DEFAULT_NON_WRONG_THRESHOLDS, ...(opts.thresholds || {}) };
  const forceEscalated = Boolean(opts.forceEscalated);
  const list = Array.isArray(events) ? events : [];
  const window = list.slice(-(t.recentWindowSize || 10));
  const misconceptions = opts.misconceptions || [];

  if (forceEscalated) {
    return buildHit(NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING, {
      confidence: 0.92,
      indicators: ['post_help_continued_struggle'],
      offerMindMap: Boolean(opts.priorFocus?.require_mind_map),
    });
  }

  /** @type {{ code: string, confidence: number, indicators: string[], offerMindMap?: boolean }[]} */
  const candidates = [];

  // 8. Same concept repeatedly
  const topConcept = [...misconceptions].sort(
    (a, b) => (b.missCount || 0) - (a.missCount || 0),
  )[0];
  if (topConcept && (topConcept.missCount || 0) >= (t.sameConceptMisses || 3)) {
    candidates.push({
      code: NON_WRONG_SCENARIOS.SAME_CONCEPT_STRUGGLE,
      confidence: 0.93,
      indicators: [`same_concept_${topConcept.topic}_x${topConcept.missCount}`],
      offerMindMap: true,
      topic: topConcept.topic,
    });
  }

  // 10. Compound combinations (collect base signals first)
  const signals = [];
  const consecutiveWrong = consecutiveAnswerFlag(
    window,
    (e) => e.type === 'answer' && e.isCorrect === false,
  );
  const consecutiveSlow = consecutiveAnswerFlag(
    window,
    (e) => e.type === 'answer' && e.slow === true,
  );
  const consecutiveSlowWrong = consecutiveAnswerFlag(
    window,
    (e) => e.type === 'answer' && e.slow === true && e.isCorrect === false,
  );
  const switchScore = sumSelectionSwitches(
    window,
    t.selectionSwitchQuestions || 3,
  );
  const hintHits = countHintsInQuestionWindow(window, t.hintWindowSize || 5);
  const compoundSlowHint = countCompoundSlowHint(window);
  const consecutivePause = consecutivePauseCount(window);
  const perfDrop = detectPerformanceDrop(window, t);
  const dda = detectDdaStruggle(window, t);

  if (consecutiveSlowWrong >= (t.consecutiveSlowWrongCount || 2)) {
    signals.push(NON_WRONG_SCENARIOS.SLOW_AND_WRONG);
    candidates.push({
      code: NON_WRONG_SCENARIOS.SLOW_AND_WRONG,
      confidence: 0.9,
      indicators: ['slow_answer', 'wrong_answer', 'compound'],
    });
  }
  if (consecutiveWrong >= (t.consecutiveWrongCount || 3)) {
    signals.push(NON_WRONG_SCENARIOS.REPEATED_WRONG);
    candidates.push({
      code: NON_WRONG_SCENARIOS.REPEATED_WRONG,
      confidence: 0.9,
      indicators: [`consecutive_wrong_x${consecutiveWrong}`],
      offerMindMap: true,
    });
  }
  if (consecutiveSlow >= (t.consecutiveSlowCount || 3)) {
    signals.push(NON_WRONG_SCENARIOS.REPEATED_SLOW_ANSWERS);
    candidates.push({
      code: NON_WRONG_SCENARIOS.REPEATED_SLOW_ANSWERS,
      confidence:
        consecutiveSlow >= (t.consecutiveSlowCountStrong || 4) ? 0.9 : 0.82,
      indicators: [`consecutive_slow_x${consecutiveSlow}`],
    });
  }
  if (hintHits >= (t.hintCountThreshold || 3)) {
    signals.push(NON_WRONG_SCENARIOS.FREQUENT_HINT_USAGE);
    candidates.push({
      code: NON_WRONG_SCENARIOS.FREQUENT_HINT_USAGE,
      confidence: 0.85,
      indicators: [`hints_${hintHits}_in_${t.hintWindowSize}`],
    });
  }
  if (switchScore >= (t.selectionSwitchMin || 4)) {
    signals.push(NON_WRONG_SCENARIOS.REPEATED_SELECTION_SWITCHES);
    candidates.push({
      code: NON_WRONG_SCENARIOS.REPEATED_SELECTION_SWITCHES,
      confidence: 0.8,
      indicators: ['selection_flips', 'retries'],
    });
  }
  if (consecutivePause >= (t.consecutiveLongPauseCount || 2)) {
    signals.push(NON_WRONG_SCENARIOS.REPEATED_LONG_PAUSES);
    candidates.push({
      code: NON_WRONG_SCENARIOS.REPEATED_LONG_PAUSES,
      confidence: 0.84,
      indicators: ['repeated_idle'],
    });
  }
  if (dda) {
    signals.push(NON_WRONG_SCENARIOS.DDA_DIFFICULTY_STRUGGLE);
    candidates.push({
      code: NON_WRONG_SCENARIOS.DDA_DIFFICULTY_STRUGGLE,
      confidence: 0.86,
      indicators: ['dda_up', 'post_dda_slow_or_stall'],
    });
  }
  if (perfDrop) {
    signals.push(NON_WRONG_SCENARIOS.PERFORMANCE_DROP);
    candidates.push({
      code: NON_WRONG_SCENARIOS.PERFORMANCE_DROP,
      confidence: 0.87,
      indicators: ['performance_drop', 'prior_strong', 'recent_struggle'],
    });
  }
  if (compoundSlowHint >= (t.compoundSlowHintCount || 2)) {
    signals.push(NON_WRONG_SCENARIOS.COMPOUND_SLOW_HINT);
    candidates.push({
      code: NON_WRONG_SCENARIOS.COMPOUND_SLOW_HINT,
      confidence: 0.88,
      indicators: ['slow_answer', 'hint_usage', 'compound'],
    });
  }

  // Wrong + retry, wrong + hint, etc. → compound multi
  const answers = window.filter((e) => e.type === 'answer');
  const wrongWithRetry = answers.filter(
    (e) => e.isCorrect === false && (e.selectionSwitches || 0) >= 2,
  ).length;
  const wrongWithHint = answers.filter(
    (e) => e.isCorrect === false && e.usedHint,
  ).length;
  const wrongHintRetry = answers.filter(
    (e) =>
      e.isCorrect === false &&
      e.usedHint &&
      (e.selectionSwitches || 0) >= 1,
  ).length;

  if (wrongWithRetry >= 2) signals.push('WRONG_AND_RETRY');
  if (wrongWithHint >= 2) signals.push('WRONG_AND_HINT');
  if (wrongHintRetry >= 1) signals.push('WRONG_HINT_RETRY');

  const uniqueSignalCodes = [
    ...new Set(
      signals.filter((s) => Object.values(NON_WRONG_SCENARIOS).includes(s)),
    ),
  ];

  if (
    uniqueSignalCodes.length >= 2 ||
    wrongWithRetry >= 2 ||
    wrongWithHint >= 2 ||
    wrongHintRetry >= 1
  ) {
    const main = pickMainProblem(
      uniqueSignalCodes.length
        ? uniqueSignalCodes
        : [NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM],
    );
    candidates.push({
      code: NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM,
      confidence: 0.91,
      indicators: [
        'compound_multi',
        ...signals.slice(0, 6),
        main ? `main_${main}` : 'main_unknown',
      ],
      mainProblem: main || NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM,
      compoundSignals: signals,
    });
  }

  if (!candidates.length) return null;

  candidates.sort(
    (a, b) =>
      focusPriority(a.code) - focusPriority(b.code) ||
      (b.confidence || 0) - (a.confidence || 0),
  );

  const best = candidates[0];
  // Prefer elevating main problem under multi when compound multi wins and we know main
  let finalCode = best.code;
  if (
    finalCode === NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM &&
    best.mainProblem
  ) {
    // Keep COMPOUND_MULTI as focus code but underlying main is in indicators
  }

  return buildHit(finalCode, {
    confidence: best.confidence,
    indicators: best.indicators,
    offerMindMap: Boolean(best.offerMindMap),
    topic: best.topic || topConcept?.topic || null,
    compoundSignals: best.compoundSignals || signals,
    mainProblem: best.mainProblem || null,
  });
}

function buildHit(
  scenarioCode,
  {
    confidence,
    indicators,
    offerMindMap = false,
    topic = null,
    compoundSignals = [],
    mainProblem = null,
  },
) {
  return {
    scenarioCode,
    reason: String(scenarioCode).toLowerCase(),
    scenario: mapScenarioUi(scenarioCode),
    intervention_mode: 'SUPPORT_AND_SCAFFOLD',
    perceived_state:
      scenarioCode === NON_WRONG_SCENARIOS.REPEATED_LONG_PAUSES
        ? 'STEADY'
        : 'STRUGGLING_OR_FRUSTRATED',
    confidence,
    indicators,
    offerMindMap,
    generate_mind_map: offerMindMap,
    topic,
    compoundSignals,
    mainProblem,
    non_wrong_scenario_code: scenarioCode,
  };
}

function mapScenarioUi(code) {
  switch (code) {
    case NON_WRONG_SCENARIOS.REPEATED_SLOW_ANSWERS:
      return 'repeated_slow';
    case NON_WRONG_SCENARIOS.REPEATED_SELECTION_SWITCHES:
      return 'selection_thrash';
    case NON_WRONG_SCENARIOS.FREQUENT_HINT_USAGE:
      return 'hint_heavy';
    case NON_WRONG_SCENARIOS.REPEATED_LONG_PAUSES:
      return 'idle_stall';
    case NON_WRONG_SCENARIOS.DDA_DIFFICULTY_STRUGGLE:
      return 'dda_struggle';
    case NON_WRONG_SCENARIOS.COMPOUND_SLOW_HINT:
      return 'slow_and_hint';
    case NON_WRONG_SCENARIOS.SLOW_AND_WRONG:
      return 'slow_and_wrong';
    case NON_WRONG_SCENARIOS.REPEATED_WRONG:
      return 'repeated_wrong';
    case NON_WRONG_SCENARIOS.PERFORMANCE_DROP:
      return 'performance_drop';
    case NON_WRONG_SCENARIOS.SAME_CONCEPT_STRUGGLE:
      return 'struggling_concept';
    case NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM:
      return 'compound_multi';
    case NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING:
      return 'escalated_support';
    default:
      return 'focused_support';
  }
}

function consecutiveAnswerFlag(events, pred) {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type !== 'answer') continue;
    if (pred(e)) n += 1;
    else break;
  }
  return n;
}

function consecutivePauseCount(events) {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (
      e.longPause === true ||
      e.type === 'long_pause' ||
      e.type === 'idle_pulse'
    ) {
      n += 1;
    } else if (e.type === 'answer' && !e.longPause) {
      break;
    }
  }
  return n;
}

function countCompoundSlowHint(events) {
  let n = 0;
  for (const e of events) {
    if (e.type === 'answer' && e.slow && e.usedHint) n += 1;
  }
  return n;
}

function countHintsInQuestionWindow(events, questionWindow) {
  const answers = events
    .filter((e) => e.type === 'answer')
    .slice(-questionWindow);
  const hintEvents = events
    .filter((e) => e.type === 'hint')
    .slice(-questionWindow);
  const usedOnAnswers = answers.filter((a) => a.usedHint).length;
  return Math.max(hintEvents.length, usedOnAnswers);
}

function sumSelectionSwitches(events, questionCount) {
  const answers = events
    .filter((e) => e.type === 'answer')
    .slice(-questionCount);
  let sum = answers.reduce(
    (a, e) => a + (Number(e.selectionSwitches) || 0),
    0,
  );
  const switches = events
    .filter((e) => e.type === 'selection_switch')
    .slice(-questionCount * 3);
  sum += switches.reduce(
    (a, e) => a + (Number(e.selectionSwitches) || 1),
    0,
  );
  return sum;
}

function detectDdaStruggle(events, t) {
  let lastDdaUpAt = 0;
  for (const e of events) {
    if (e.type === 'dda_up') lastDdaUpAt = e.at;
  }
  if (!lastDdaUpAt) return false;
  const after = events.filter((e) => e.at >= lastDdaUpAt);
  const struggleAnswers = after.filter(
    (e) =>
      e.type === 'answer' &&
      (e.slow ||
        e.longPause ||
        e.isCorrect === false ||
        (e.timeSec || 0) >= (t.ddaStruggleSlowSec || 40)),
  );
  const stall = after.some(
    (e) => e.type === 'long_pause' || e.type === 'idle_pulse',
  );
  return (
    struggleAnswers.length >= (t.ddaStruggleMinAnswers || 2) ||
    (struggleAnswers.length >= 1 && stall)
  );
}

/** Prior stretch strong, recent stretch weak */
function detectPerformanceDrop(events, t) {
  const answers = events.filter((e) => e.type === 'answer');
  const w = t.performanceDropWindow || 4;
  if (answers.length < w * 2) return false;
  const prior = answers.slice(-(w * 2), -w);
  const recent = answers.slice(-w);
  const priorCorrect = prior.filter((a) => a.isCorrect).length;
  const recentWrong = recent.filter((a) => a.isCorrect === false).length;
  const recentSlow = recent.filter((a) => a.slow).length;
  if (priorCorrect < (t.performanceDropMinPriorCorrect || 2)) return false;
  return recentWrong >= 2 && (recentSlow >= 1 || recentWrong >= 3);
}

export function labelNonWrongScenario(code) {
  const map = {
    [NON_WRONG_SCENARIOS.REPEATED_SLOW_ANSWERS]:
      'Repeatedly taking too long on questions',
    [NON_WRONG_SCENARIOS.REPEATED_SELECTION_SWITCHES]:
      'Repeatedly switching / retrying answer choices',
    [NON_WRONG_SCENARIOS.FREQUENT_HINT_USAGE]: 'Frequent hint usage',
    [NON_WRONG_SCENARIOS.REPEATED_LONG_PAUSES]:
      'Repeated long pauses / inactivity',
    [NON_WRONG_SCENARIOS.DDA_DIFFICULTY_STRUGGLE]:
      'Difficulty increased and student is struggling',
    [NON_WRONG_SCENARIOS.COMPOUND_SLOW_HINT]:
      'Slow answers combined with hint use',
    [NON_WRONG_SCENARIOS.SLOW_AND_WRONG]:
      'Slow answers combined with wrong answers',
    [NON_WRONG_SCENARIOS.REPEATED_WRONG]: 'Repeated wrong answers',
    [NON_WRONG_SCENARIOS.PERFORMANCE_DROP]: 'Sudden performance drop',
    [NON_WRONG_SCENARIOS.SAME_CONCEPT_STRUGGLE]:
      'Same science concept repeatedly causes problems',
    [NON_WRONG_SCENARIOS.COMPOUND_MULTI_PROBLEM]:
      'Multiple struggle indicators together',
    [NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING]:
      'Escalated scaffolding after continued struggle',
  };
  return map[code] || code || 'Focused learning support';
}

export function isNonWrongScenarioCode(code) {
  const u = String(code || '').toUpperCase();
  return Object.values(NON_WRONG_SCENARIOS).includes(u);
}

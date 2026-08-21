import {
  asQuestionText,
  concreteWhyOpened,
  friendlyStudentName,
  friendlyWhyOpened,
  friendlyWrongAnswer,
  sanitizeKidSpeech,
} from './kidFriendlySpeech.js';
import { resolveTopicKey } from './conceptMaps.js';
import {
  buildBehaviorDiagnostic,
  getBehaviorProbe,
} from './behaviorDiagnostics.js';

/**
 * Focused intervention catalog.
 * Avatar opens for evidence of need; first probes the *behavior* that triggered help,
 * then supports that issue (science only when the student signals a concept gap).
 *
 * Pipeline: Detected trigger → Name problem → Behavior probe (A–D) → Analyze reason → Targeted support.
 */

/** Priority: lower number wins when multiple problems fire together. */
export const INTERVENTION_FOCUS_CODES = {
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

const PRIORITY = {
  [INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING]: 1,
  [INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE]: 2,
  [INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM]: 3,
  [INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG]: 4,
  [INTERVENTION_FOCUS_CODES.REPEATED_WRONG]: 5,
  [INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP]: 6,
  [INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE]: 7,
  [INTERVENTION_FOCUS_CODES.REPEATED_SLOW_ANSWERS]: 8,
  [INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT]: 9,
  [INTERVENTION_FOCUS_CODES.FREQUENT_HINT_USAGE]: 10,
  [INTERVENTION_FOCUS_CODES.REPEATED_SELECTION_SWITCHES]: 11,
  [INTERVENTION_FOCUS_CODES.REPEATED_LONG_PAUSES]: 12,
  [INTERVENTION_FOCUS_CODES.MANUAL]: 50,
  [INTERVENTION_FOCUS_CODES.ENRICHMENT]: 60,
  [INTERVENTION_FOCUS_CODES.CONGRATULATE]: 70,
};

export function describeFocusCode(code) {
  const map = {
    [INTERVENTION_FOCUS_CODES.REPEATED_SLOW_ANSWERS]:
      'Repeatedly taking too long on consecutive questions',
    [INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG]:
      'Repeated long response times combined with incorrect answers',
    [INTERVENTION_FOCUS_CODES.REPEATED_WRONG]:
      'Repeated incorrect answers in a short sequence',
    [INTERVENTION_FOCUS_CODES.REPEATED_SELECTION_SWITCHES]:
      'Repeated answer-choice changes / retries before committing',
    [INTERVENTION_FOCUS_CODES.FREQUENT_HINT_USAGE]:
      'Frequent hint usage across recent questions',
    [INTERVENTION_FOCUS_CODES.REPEATED_LONG_PAUSES]:
      'Repeated long pauses / inactivity across questions',
    [INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP]:
      'Sudden drop after previously stronger performance',
    [INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE]:
      'Same science concept repeatedly causing problems',
    [INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE]:
      'Difficulty increased (DDA) and student is struggling',
    [INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT]:
      'Compound problem: slow answers plus heavy hint use',
    [INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM]:
      'Multiple struggle signals together (main learning problem prioritized)',
    [INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING]:
      'Continued struggle after earlier mentor help — stronger scaffolding',
    [INTERVENTION_FOCUS_CODES.MANUAL]: 'Student opened the mentor for help',
    [INTERVENTION_FOCUS_CODES.ENRICHMENT]: 'High mastery / under-challenged (enrichment)',
    [INTERVENTION_FOCUS_CODES.CONGRATULATE]: 'Mastery milestone celebration',
  };
  return map[code] || code || 'Learning support needed';
}

export function mentorBriefForCode(code, concept = null) {
  const c = concept || 'the science idea in the current farm question';
  const map = {
    [INTERVENTION_FOCUS_CODES.REPEATED_SLOW_ANSWERS]:
      `Ask why response time is high (approach / time / distract / pause). Do NOT quiz science first. Support the chosen reason.`,
    [INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG]:
      `Probe whether lag + misses come from approach, confusion, rush, or concept gap. Support reason; science only if they pick concept gap.`,
    [INTERVENTION_FOCUS_CODES.REPEATED_WRONG]:
      `Probe WHY wrong answers happen (concept / misread / guess / difficulty). Science help only if concept is the reason.`,
    [INTERVENTION_FOCUS_CODES.REPEATED_SELECTION_SWITCHES]:
      `Ask why they switch choices (confidence / misread / guessing / misclick). Process support first.`,
    [INTERVENTION_FOCUS_CODES.FREQUENT_HINT_USAGE]:
      `Ask why they need hints (understand question / confirm / start / difficulty). Match support to that reason.`,
    [INTERVENTION_FOCUS_CODES.REPEATED_LONG_PAUSES]:
      `Probe pause cause (uncertain approach / needs time / distracted / accidental). Not a science quiz.`,
    [INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP]:
      `Ask what changed (new science / tired / approach / pace). Support the human reason first.`,
    [INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE]:
      `Still start with problem focus: concept gap vs wording vs mix-up vs time. Only dig ${c} if they pick a concept reason.`,
    [INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE]:
      `Probe reaction to tougher DDA level (too hard / fancy wording / rush / unclear ask). Not a knowledge test first.`,
    [INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT]:
      `Ask main hang-up among start / concept / difficulty / second-guessing. Support that one issue.`,
    [INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM]:
      `Pick one main human hang-up with A–D; stay on trigger, not open chat.`,
    [INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING]:
      `Ask what they need most now (explain steps / approach / confidence / restart).`,
  };
  return (
    map[code] ||
    `Identify the trigger problem, ask a behavior A–D probe, support the chosen reason. Stay off science quizzing unless they mark a concept gap (${c}).`
  );
}

export function resolveFocusCode({
  scenarioCode = null,
  reason = null,
  scenario = null,
  indicators = [],
  evaluation = null,
} = {}) {
  const raw = String(
    scenarioCode ||
      evaluation?.non_wrong_scenario_code ||
      evaluation?.scenarioCode ||
      reason ||
      scenario ||
      '',
  )
    .toUpperCase()
    .replace(/-/g, '_');

  if (raw.includes('ESCALAT')) return INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING;
  if (
    raw.includes('SAME_CONCEPT') ||
    raw === 'CONCEPT_MISCONCEPTIONS' ||
    scenario === 'struggling_concept'
  ) {
    return INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE;
  }
  if (raw.includes('SLOW_AND_WRONG') || raw.includes('SLOW_WRONG')) {
    return INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG;
  }
  if (
    raw.includes('REPEATED_WRONG') ||
    raw === 'REPEATED_INCORRECT' ||
    raw.includes('CONSECUTIVE_FAIL')
  ) {
    return INTERVENTION_FOCUS_CODES.REPEATED_WRONG;
  }
  if (raw.includes('PERFORMANCE_DROP') || raw.includes('DECLINING')) {
    return INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP;
  }
  if (raw.includes('DDA')) return INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE;
  if (raw.includes('REPEATED_SLOW') || raw.includes('SLOW_ANSWER')) {
    return INTERVENTION_FOCUS_CODES.REPEATED_SLOW_ANSWERS;
  }
  if (raw.includes('COMPOUND_MULTI') || raw.includes('MULTI_PROBLEM')) {
    return INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM;
  }
  if (raw.includes('COMPOUND') || raw.includes('SLOW_HINT')) {
    return INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT;
  }
  if (raw.includes('HINT')) return INTERVENTION_FOCUS_CODES.FREQUENT_HINT_USAGE;
  if (raw.includes('SELECTION') || raw.includes('RETRY') || raw.includes('SWITCH')) {
    return INTERVENTION_FOCUS_CODES.REPEATED_SELECTION_SWITCHES;
  }
  if (raw.includes('LONG_PAUSE') || raw.includes('IDLE') || raw.includes('PAUSE')) {
    return INTERVENTION_FOCUS_CODES.REPEATED_LONG_PAUSES;
  }
  if (raw === 'MANUAL') return INTERVENTION_FOCUS_CODES.MANUAL;
  if (raw.includes('BORED') || scenario === 'bored') {
    return INTERVENTION_FOCUS_CODES.ENRICHMENT;
  }
  if (raw.includes('MILESTONE') || raw.includes('CONGRATUL')) {
    return INTERVENTION_FOCUS_CODES.CONGRATULATE;
  }
  if (raw.includes('FRUSTRAT') || raw.includes('STRUGGLING')) {
    const inds = indicators || evaluation?.indicators || [];
    if (inds.some((i) => String(i).includes('same_concept'))) {
      return INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE;
    }
    if (
      inds.some(
        (i) =>
          String(i).includes('declining') || String(i).includes('performance_drop'),
      )
    ) {
      return INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP;
    }
    return INTERVENTION_FOCUS_CODES.REPEATED_WRONG;
  }
  return raw || INTERVENTION_FOCUS_CODES.MANUAL;
}

export function focusPriority(code) {
  return PRIORITY[code] ?? 40;
}

function scoreTopics({ misconceptions = [], events = [], quiz = null, mindMap = null }) {
  const map = new Map();

  const bump = (topicRaw, pts, extras = {}) => {
    if (!topicRaw) return;
    const topic =
      resolveTopicKey(topicRaw) || String(topicRaw).trim() || 'Science';
    const cur = map.get(topic) || {
      topic,
      score: 0,
      prompts: [],
      wrongs: [],
      missCount: 0,
    };
    cur.score += pts;
    if (extras.prompt) cur.prompts.push(extras.prompt);
    if (extras.wrong) cur.wrongs.push(extras.wrong);
    if (extras.missCount) cur.missCount = Math.max(cur.missCount, extras.missCount);
    map.set(topic, cur);
  };

  for (const m of misconceptions || []) {
    bump(m.topic, 40 + (m.missCount || 0) * 15, {
      missCount: m.missCount || 0,
      prompt: (m.prompts || m.sample_prompts || [])[0],
      wrong: (m.wrongAnswers || m.recent_wrong_answers || [])[0],
    });
  }

  for (const e of events || []) {
    if (!e.topic && !e.concept) continue;
    let pts = 2;
    if (e.isCorrect === false) pts += 12;
    if (e.slow) pts += 8;
    if (e.usedHint) pts += 5;
    if ((e.selectionSwitches || 0) >= 2) pts += 4;
    if (e.longPause) pts += 3;
    bump(e.topic || e.concept, pts, {
      prompt: e.prompt || null,
      wrong: e.selectedText || null,
      missCount: e.isCorrect === false ? 1 : 0,
    });
  }

  const qTopic = quiz?.topic || quiz?.questionData?.topic || mindMap?.topic;
  if (qTopic) {
    bump(qTopic, 6, {
      prompt: quiz?.prompt || quiz?.question || quiz?.questionData?.prompt || null,
    });
  }

  return [...map.values()].sort(
    (a, b) => b.score - a.score || b.missCount - a.missCount,
  );
}

export function pickFocusConcept({
  misconceptions = [],
  events = [],
  quiz = null,
  mindMap = null,
  lastWrongAnswer = null,
} = {}) {
  // Prefer the concept of the most recent struggle event (wrong / slow / hint)
  // so performance mentoring targets the current difficulty, not an old tally.
  const recentEvents = [...(events || [])].slice(-12).reverse();
  const recentStruggle = recentEvents.find(
    (e) =>
      (e.topic || e.concept) &&
      (e.isCorrect === false || e.slow || e.usedHint || e.longPause),
  );
  if (recentStruggle) {
    const topic =
      resolveTopicKey(recentStruggle.topic || recentStruggle.concept) ||
      recentStruggle.topic ||
      recentStruggle.concept;
    const mc = (misconceptions || []).find(
      (m) => resolveTopicKey(m.topic) === topic || m.topic === topic,
    );
    return {
      topic,
      missCount: Math.max(mc?.missCount || 0, recentStruggle.isCorrect === false ? 1 : 0),
      samplePrompts: [
        recentStruggle.prompt,
        quiz?.prompt || quiz?.question || quiz?.questionData?.prompt,
        ...(mc?.prompts || mc?.sample_prompts || []),
      ]
        .filter(Boolean)
        .slice(0, 3),
      wrongAnswers: [
        recentStruggle.selectedText,
        lastWrongAnswer,
        ...(mc?.wrongAnswers || mc?.recent_wrong_answers || []),
      ]
        .filter(Boolean)
        .slice(0, 3),
    };
  }

  const ranked = scoreTopics({ misconceptions, events, quiz, mindMap });
  if (ranked[0]) {
    const top = ranked[0];
    const mc = (misconceptions || []).find(
      (m) => resolveTopicKey(m.topic) === top.topic || m.topic === top.topic,
    );
    return {
      topic: top.topic,
      missCount: Math.max(top.missCount, mc?.missCount || 0),
      samplePrompts: [
        ...(mc?.prompts || mc?.sample_prompts || []),
        ...top.prompts,
      ]
        .filter(Boolean)
        .slice(-3),
      wrongAnswers: [
        ...(mc?.wrongAnswers || mc?.recent_wrong_answers || []),
        ...top.wrongs,
        lastWrongAnswer,
      ]
        .filter(Boolean)
        .slice(-3),
    };
  }

  const qTopic =
    quiz?.topic || quiz?.questionData?.topic || mindMap?.topic || null;
  if (qTopic) {
    return {
      topic: resolveTopicKey(qTopic) || qTopic,
      missCount: 0,
      samplePrompts: [
        quiz?.prompt || quiz?.question || quiz?.questionData?.prompt || null,
      ].filter(Boolean),
      wrongAnswers: lastWrongAnswer ? [lastWrongAnswer] : [],
    };
  }
  return {
    topic: mindMap?.topic || 'this farm science idea',
    missCount: 0,
    samplePrompts: [],
    wrongAnswers: lastWrongAnswer ? [lastWrongAnswer] : [],
  };
}

/**
 * Behavior-first diagnostic (problem that caused open), with A–D choices.
 * Science concept tests are intentionally NOT the default first question.
 */
export function buildDiagnosticQuestion(code, topic, questionText = null, evidence = {}) {
  const diag = buildBehaviorDiagnostic(code, {
    ...evidence,
    questionText,
    farm_question: questionText,
  });
  return diag.diagnostic_question;
}

/** Full structured diagnostic for focus/session freeze. */
export function buildStructuredDiagnostic(code, questionText = null, evidence = {}) {
  return buildBehaviorDiagnostic(code, {
    ...evidence,
    questionText,
    farm_question: questionText,
  });
}

/**
 * Warm first line: name + concrete why (evidence) + one problem probe.
 * A–D options are shown in chat + buttons (not all read aloud).
 */
export function buildFocusedSpokenOpener(focus = {}, opts = {}) {
  const name = friendlyStudentName(opts.name || focus.student_name);
  const hi = name ? `Hi ${name}! ` : 'Hi there! ';
  const code = focus.code || focus.focus_code || INTERVENTION_FOCUS_CODES.MANUAL;
  const diagCode =
    focus.underlying_code &&
    focus.underlying_code !== INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING
      ? focus.underlying_code
      : code;

  const evidence = {
    avg_sec:
      focus.metrics_snapshot?.time_per_question_avg_sec ??
      focus.evidence?.avg_sec ??
      null,
    hint_count: focus.evidence?.hint_count ?? null,
    switch_count: focus.evidence?.switch_count ?? null,
    consecutive_fails: focus.metrics_snapshot?.consecutive_fails ?? null,
    incorrect_total: focus.metrics_snapshot?.incorrect_answers ?? null,
    miss_count: focus.concept_miss_count ?? focus.evidence?.miss_count ?? null,
    concept: focus.concept_topic,
    concept_topic: focus.concept_topic,
    last_wrong: focus.last_wrong_answer || focus.evidence?.last_wrong,
    ...(opts.evidence || {}),
  };

  const why = concreteWhyOpened(diagCode, evidence);
  const probe =
    focus.diagnostic_prompt || getBehaviorProbe(diagCode, evidence).prompt;

  if (code === INTERVENTION_FOCUS_CODES.ENRICHMENT) {
    return sanitizeKidSpeech(
      `${hi}You are doing great! I stopped by because ${why}. What sounds good next? Tap A–D below.`,
    );
  }
  if (code === INTERVENTION_FOCUS_CODES.CONGRATULATE) {
    return sanitizeKidSpeech(
      `${hi}Wonderful farm work — I came because ${why}. What should we do next? Tap A–D below.`,
    );
  }

  // One clear problem statement + probe (no repeated "farm got tougher" loop)
  return sanitizeKidSpeech(
    `${hi}I came over because ${why}. ${probe} Say A, B, C, or D — or type it.`,
  );
}

export function buildTargetedGuidance(focus = {}) {
  return sanitizeKidSpeech(
    `First find what is getting in the way (time, confidence, wording, or the science idea). Support that hang-up, then return to the farm when ready.`,
  );
}

export function buildInterventionFocus(input = {}) {
  const {
    scenarioCode = null,
    reason = null,
    scenario = null,
    indicators = [],
    evaluation = null,
    misconceptions = [],
    events = [],
    quiz = null,
    mindMap = null,
    lastWrongAnswer = null,
    metrics = null,
    priorFocus = null,
    isEscalation = false,
    compoundSignals = [],
    studentName = null,
  } = input;

  let code = resolveFocusCode({
    scenarioCode,
    reason,
    scenario,
    indicators,
    evaluation,
  });

  if (isEscalation || code === INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING) {
    const priorCode =
      priorFocus?.code ||
      priorFocus?.focus_code ||
      priorFocus?.underlying_code ||
      null;
    if (priorCode && priorCode !== INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING) {
      const concept = pickFocusConcept({
        misconceptions,
        events,
        quiz,
        mindMap:
          mindMap ||
          (priorFocus?.concept_topic ? { topic: priorFocus.concept_topic } : null),
        lastWrongAnswer,
      });
      return finalizeFocus({
        code: INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING,
        underlying_code: priorCode,
        concept,
        indicators,
        compoundSignals: compoundSignals.length
          ? compoundSignals
          : priorFocus?.compound_signals || [],
        mindMap,
        metrics,
        quiz,
        lastWrongAnswer,
        assistance_level: 'escalated',
        studentName,
      });
    }
  }

  const concept = pickFocusConcept({
    misconceptions,
    events,
    quiz,
    mindMap,
    lastWrongAnswer,
  });

  return finalizeFocus({
    code,
    underlying_code: code,
    concept,
    indicators,
    compoundSignals,
    mindMap,
    metrics,
    quiz,
    lastWrongAnswer,
    assistance_level: isEscalation ? 'escalated' : 'standard',
    requireMindMap:
      code === INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE ||
      (isEscalation && concept.missCount >= 2),
    studentName,
  });
}

function finalizeFocus({
  code,
  underlying_code,
  concept,
  indicators,
  compoundSignals,
  mindMap,
  metrics,
  quiz,
  lastWrongAnswer,
  assistance_level,
  requireMindMap = false,
  studentName = null,
}) {
  const topic = concept.topic;
  const problem = describeFocusCode(code);
  const underlyingProblem =
    underlying_code && underlying_code !== code
      ? describeFocusCode(underlying_code)
      : problem;

  const questionText = asQuestionText(
    quiz?.prompt ||
      quiz?.question ||
      quiz?.questionData?.prompt ||
      quiz?.questionData?.question ||
      concept.samplePrompts?.[0] ||
      null,
  );

  const lastWrong = friendlyWrongAnswer(
    lastWrongAnswer || concept.wrongAnswers?.[0] || null,
  );

  const diagCodeBase =
    underlying_code &&
    underlying_code !== INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING
      ? underlying_code
      : code;

  // When wrong answers / concept misses exist, diagnose THAT — not pure DDA fluff
  let diagCode = diagCodeBase;
  if (
    (concept.missCount >= 1 || lastWrong) &&
    (diagCode === INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE ||
      diagCode === INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP ||
      diagCode === INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM)
  ) {
    diagCode =
      concept.missCount >= 2
        ? INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE
        : INTERVENTION_FOCUS_CODES.REPEATED_WRONG;
  }

  const structured = buildBehaviorDiagnostic(diagCode, {
    missCount: concept.missCount || 0,
    miss_count: concept.missCount || 0,
    concept_miss_count: concept.missCount || 0,
    concept: topic,
    concept_topic: topic,
    avgSec:
      metrics?.time_per_question_avg_sec ??
      metrics?.time_per_question ??
      metrics?.time_per_question_current_sec ??
      null,
    wrongAnswer: lastWrong,
    last_wrong: lastWrong,
    hintCount:
      metrics?.hints_used_recent ??
      metrics?.hint_count ??
      metrics?.hints_used ??
      null,
    switchCount:
      metrics?.selection_switch_count ??
      metrics?.answer_switches ??
      metrics?.option_switches ??
      null,
    questionText,
    farm_question: questionText,
  });
  const diagnostic_question = structured.diagnostic_question;

  const focusCore = {
    focus_code: code,
    code,
    underlying_code: underlying_code || code,
    problem_statement: problem,
    underlying_problem: underlyingProblem,
    concept_topic: topic,
    concept_miss_count: concept.missCount || 0,
    sample_prompts: (concept.samplePrompts || [])
      .map((p) => asQuestionText(p))
      .filter(Boolean),
    recent_wrong_answers: (concept.wrongAnswers || [])
      .map((w) => friendlyWrongAnswer(w) || asQuestionText(w))
      .filter(Boolean),
    last_wrong_answer: lastWrong,
    current_question: questionText,
    diagnostic_question,
    diagnostic_prompt: structured.prompt,
    diagnostic_options: structured.options,
    conversation_phase: 'behavior_probe',
    indicators: indicators || [],
    compound_signals: compoundSignals || [],
    assistance_level: assistance_level || 'standard',
    student_name: studentName || null,
    require_mind_map: Boolean(
      requireMindMap ||
        code === INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE ||
        code === INTERVENTION_FOCUS_CODES.REPEATED_WRONG ||
        code === INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG ||
        (underlying_code === INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE) ||
        (underlying_code === INTERVENTION_FOCUS_CODES.REPEATED_WRONG) ||
        Boolean(concept.missCount >= 2),
    ),
    mind_map_topic: mindMap?.topic || topic,
    mind_map_highlight_node: topic,
    mentor_brief: mentorBriefForCode(diagCode, topic),
    stay_on_concept_rule:
      `Stay on trigger "${problem}". Path: name problem → A–D probe (concept-facing when wrongs exist) → AI reply matches their pick. ` +
      `Mind map / wrongs: teach the concept when they show a gap. Concept: ${topic}. No letter-key answers.`,
    metrics_snapshot: {
      accuracy_percentage: metrics?.accuracy_percentage ?? null,
      time_per_question_avg_sec:
        metrics?.time_per_question_avg_sec ?? metrics?.time_per_question ?? null,
      consecutive_fails:
        metrics?.consecutive_fails ?? metrics?.level_retries_count ?? null,
      incorrect_answers: metrics?.incorrect_answers ?? null,
      evaluated_tier: null, // never expose ranks in speech context
    },
  };

  // Pass full metrics into opener evidence
  focusCore.spoken_opener = sanitizeKidSpeech(
    buildFocusedSpokenOpener(focusCore, {
      name: studentName || null,
      evidence: {
        avg_sec:
          metrics?.time_per_question_avg_sec ??
          metrics?.time_per_question ??
          null,
        hint_count:
          metrics?.hints_used_recent ??
          metrics?.hint_count ??
          metrics?.hints_used ??
          null,
        switch_count:
          metrics?.selection_switch_count ??
          metrics?.answer_switches ??
          metrics?.option_switches ??
          null,
        consecutive_fails:
          metrics?.consecutive_fails ?? metrics?.level_retries_count ?? null,
        incorrect_total: metrics?.incorrect_answers ?? null,
        miss_count: concept.missCount || 0,
        concept,
        concept_topic: topic,
        last_wrong: lastWrong,
      },
    }),
  );
  focusCore.targeted_guidance = buildTargetedGuidance(focusCore);
  focusCore.friendly_why = concreteWhyOpened(diagCode, {
    avg_sec: focusCore.metrics_snapshot?.time_per_question_avg_sec,
    consecutive_fails: focusCore.metrics_snapshot?.consecutive_fails,
    incorrect_total: focusCore.metrics_snapshot?.incorrect_answers,
    miss_count: concept.missCount || 0,
    concept,
    last_wrong: lastWrong,
    hint_count:
      metrics?.hints_used_recent ??
      metrics?.hint_count ??
      metrics?.hints_used ??
      null,
    switch_count:
      metrics?.selection_switch_count ??
      metrics?.answer_switches ??
      null,
  });
  focusCore.problem_statement_friendly = focusCore.friendly_why;
  focusCore.coach_auto_signal = buildCoachAutoSignal({
    code: focusCore.underlying_code || code,
    topic,
    problem,
    questionText,
    assistance_level,
    lastWrongAnswer: focusCore.last_wrong_answer,
    metrics,
    diagnostic_question,
    spoken_opener: focusCore.spoken_opener,
  });
  focusCore.evidence_lines = buildEvidenceLines(focusCore);

  return focusCore;
}

function buildEvidenceLines(focus) {
  const lines = [];
  if (focus.problem_statement) lines.push(`Trigger: ${focus.problem_statement}`);
  if (focus.concept_topic) lines.push(`Concept: ${focus.concept_topic}`);
  if (focus.concept_miss_count > 0) {
    lines.push(`Misses on concept: ${focus.concept_miss_count}`);
  }
  if (focus.metrics_snapshot?.time_per_question_avg_sec) {
    lines.push(
      `Avg time/question: ~${Math.round(
        Number(focus.metrics_snapshot.time_per_question_avg_sec),
      )}s`,
    );
  }
  if (focus.metrics_snapshot?.incorrect_answers != null) {
    lines.push(`Incorrect total: ${focus.metrics_snapshot.incorrect_answers}`);
  }
  if (focus.last_wrong_answer) {
    lines.push(`Recent wrong: ${String(focus.last_wrong_answer).slice(0, 80)}`);
  }
  if (focus.current_question) {
    lines.push(
      `Related question: ${String(focus.current_question).slice(0, 120)}`,
    );
  }
  return lines;
}

export function buildCoachAutoSignal({
  code,
  topic,
  problem,
  questionText,
  assistance_level,
  lastWrongAnswer,
  metrics,
  diagnostic_question = null,
  spoken_opener = null,
} = {}) {
  const qBit = questionText
    ? ` Related question: "${String(questionText).slice(0, 180)}".`
    : '';
  const wrongBit = lastWrongAnswer
    ? ` Recent wrong choice: "${String(lastWrongAnswer).slice(0, 80)}".`
    : '';
  const diagBit = diagnostic_question
    ? ` Required diagnostic: "${diagnostic_question}".`
    : '';
  const escalateBit =
    assistance_level === 'escalated'
      ? ' Stronger/simpler scaffold on the SAME difficulty only.'
      : '';
  const scriptBit = spoken_opener
    ? ` PREFERRED OPENING (keep trigger + concept + diagnostic): "${spoken_opener}"`
    : '';

  return (
    `Auto-signal for private coach only (never say ability ranks). ` +
    `Speak warmly like a kind teacher for ages 11 to 14. Use the student's first name only. ` +
    `Why you appeared: ${problem}. Science idea: ${topic}.${qBit}${wrongBit}${diagBit} ` +
    `${mentorBriefForCode(code, topic)}${escalateBit} ` +
    `MUST: (1) greet with the student's name kindly, (2) say why you came in simple words, ` +
    `(3) ask one soft science question about ${topic}, (4) one short encouraging tip. ` +
    `Never say strength ranks, ability ranks, or words like those ranks. Never use slash labels. ` +
    `Never reveal quiz answer keys.` +
    scriptBit
  );
}

export function pickMainProblem(codes = []) {
  const list = [...new Set((codes || []).filter(Boolean))];
  if (!list.length) return null;
  list.sort((a, b) => focusPriority(a) - focusPriority(b));
  return list[0];
}

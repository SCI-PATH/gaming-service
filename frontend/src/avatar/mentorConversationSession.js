/**

 * Performance-personalized mentor conversation session.

 *

 * Freezes the intervention cause at open, then drives follow-ups from:

 *   trigger problem → behavior A–D probe → analyze reason → support

 *

 * Science content only after the student signals a concept-related reason

 * (or free-text like "explain from the beginning").

 */



import {

  asQuestionText,

  concreteWhyOpened,

  friendlyStudentName,

  friendlyWhyOpened,

  friendlyWrongAnswer,

  sanitizeKidSpeech,

} from './kidFriendlySpeech.js';

import {

  INTERVENTION_FOCUS_CODES,

  buildDiagnosticQuestion,

} from './interventionFocus.js';

import {

  buildBehaviorDiagnostic,

  buildBehaviorSupportReply,

  parseBehaviorChoice,

  reasonNeedsMindMap,

  needsScienceSupport,

  REASON_KEYS,

} from './behaviorDiagnostics.js';

import {

  evaluateStudentAnswer,

  looksLikeIgnoredStudentReply,

} from './adaptiveMentorReply.js';

import { CONCEPT_CATALOG, resolveTopicKey } from './conceptMaps.js';



/** Guidance ladder after a reason is known */

export const GUIDANCE_LEVELS = {

  DIAGNOSTIC: 0, // behavior probe open

  SCAFFOLD: 1, // process / approach support

  REPAIR: 2, // deeper fix (concept if needed)

  MICROSTEP: 3, // tiny piece only

};



/**

 * Snapshot immutable intervention cause at the moment Sage opens.

 */

export function freezeInterventionSession(focus = {}, extras = {}) {

  const code =

    focus.underlying_code ||

    focus.code ||

    focus.focus_code ||

    extras.code ||

    null;

  const topCode = focus.code || focus.focus_code || code;

  const concept =

    resolveTopicKey(focus.concept_topic || extras.concept) ||

    focus.concept_topic ||

    extras.concept ||

    'this science idea';

  const metrics = focus.metrics_snapshot || extras.metrics || {};

  const evidence = {

    farm_question: asQuestionText(

      focus.current_question || extras.farmQuestion || null,

    ),

    last_wrong: friendlyWrongAnswer(

      focus.last_wrong_answer ||

        focus.recent_wrong_answers?.[0] ||

        extras.lastWrong ||

        null,

    ),

    miss_count: focus.concept_miss_count || 0,

    avg_sec:

      metrics.time_per_question_avg_sec ??

      metrics.time_per_question ??

      null,

    accuracy: metrics.accuracy_percentage ?? null,

    consecutive_fails: metrics.consecutive_fails ?? null,

    incorrect_total: metrics.incorrect_answers ?? null,

    hint_count:

      metrics.hints_used_recent ??

      metrics.hint_count ??

      extras.hintCount ??

      null,

    switch_count:

      metrics.selection_switch_count ??

      metrics.answer_switches ??

      extras.switchCount ??

      null,

  };



  // Prefer concept/wrong probes when wrong-answer evidence exists, even if DDA options arrived
  const hasWrongSignal =
    Boolean(evidence.last_wrong) || Number(evidence.miss_count || 0) >= 1;
  let diagCode = code;
  const ddaLike = [
    INTERVENTION_FOCUS_CODES.DDA_DIFFICULTY_STRUGGLE,
    INTERVENTION_FOCUS_CODES.PERFORMANCE_DROP,
    INTERVENTION_FOCUS_CODES.COMPOUND_MULTI_PROBLEM,
    INTERVENTION_FOCUS_CODES.COMPOUND_SLOW_HINT,
  ];
  if (hasWrongSignal && ddaLike.includes(diagCode)) {
    diagCode =
      Number(evidence.miss_count || 0) >= 2
        ? INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE
        : INTERVENTION_FOCUS_CODES.REPEATED_WRONG;
  }

  const looksLikePureDda = (opts = []) =>
    opts.some((o) =>
      /new level feels too hard|questions got fancier|tougher questions/i.test(
        String(o?.label || ''),
      ),
    );

  const shouldRebuild =
    hasWrongSignal ||
    focus.require_mind_map ||
    !focus.diagnostic_options?.length ||
    looksLikePureDda(focus.diagnostic_options || []);

  const structured = shouldRebuild
    ? buildBehaviorDiagnostic(diagCode, {
        ...evidence,
        concept,
        concept_topic: concept,
        questionText: evidence.farm_question,
      })
    : {
        prompt: focus.diagnostic_prompt,
        options: focus.diagnostic_options,
        diagnostic_question: focus.diagnostic_question,
      };



  return {

    session_id: extras.sessionId || `sess_${Date.now()}`,

    opened_at: Date.now(),

    code: hasWrongSignal && ddaLike.includes(code) ? diagCode : code,

    top_code: topCode,

    underlying_code:
      hasWrongSignal && ddaLike.includes(code)
        ? diagCode
        : focus.underlying_code || code,

    problem_statement:
      focus.problem_statement_friendly ||
      focus.friendly_why ||
      concreteWhyOpened(code, evidence) ||
      focus.problem_statement ||
      friendlyWhyOpened(code),
    friendly_why:
      focus.friendly_why ||
      concreteWhyOpened(code, evidence) ||
      friendlyWhyOpened(code),

    concept_topic: concept,

    evidence,

    diagnostic_question:

      structured.diagnostic_question ||

      focus.diagnostic_question ||

      buildDiagnosticQuestion(code, concept, evidence.farm_question, evidence),

    diagnostic_prompt: structured.prompt || focus.diagnostic_prompt || null,

    diagnostic_options:

      structured.options || focus.diagnostic_options || [],

    spoken_opener: focus.spoken_opener || null,

    targeted_guidance: focus.targeted_guidance || null,

    assistance_level: focus.assistance_level || 'standard',

    require_mind_map: Boolean(
      focus.require_mind_map ||
        hasWrongSignal ||
        diagCode === INTERVENTION_FOCUS_CODES.REPEATED_WRONG ||
        diagCode === INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE ||
        diagCode === INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG,
    ),

    student_name:

      friendlyStudentName(focus.student_name || extras.studentName) || null,

    // Mutable turn state

    phase: focus.conversation_phase || 'behavior_probe',

    student_reason_key: null,

    student_reason_label: null,

    guidance_level:

      focus.assistance_level === 'escalated'

        ? GUIDANCE_LEVELS.SCAFFOLD

        : GUIDANCE_LEVELS.DIAGNOSTIC,

    turn_index: 0,

    evaluations: [],

    last_student_message: null,

    last_mentor_message: focus.spoken_opener || null,

  };

}



export function nextGuidanceLevel(current = 0, understanding = 'partial') {

  const c = Number(current) || 0;

  switch (understanding) {

    case 'behavior_answered':

      return Math.max(c, GUIDANCE_LEVELS.SCAFFOLD);

    case 'want_explainer':

    case 'concept_gap':

      return Math.min(GUIDANCE_LEVELS.MICROSTEP, Math.max(c, GUIDANCE_LEVELS.REPAIR));

    case 'understood':

    case 'ready':

      return Math.max(GUIDANCE_LEVELS.DIAGNOSTIC, Math.min(c, GUIDANCE_LEVELS.SCAFFOLD));

    case 'misconception':

      return Math.min(GUIDANCE_LEVELS.MICROSTEP, Math.max(c, GUIDANCE_LEVELS.REPAIR));

    case 'unsure':

    case 'ask_hint':

    case 'partial':

    case 'reading':

    case 'timing':

    case 'short':

      return Math.min(GUIDANCE_LEVELS.MICROSTEP, Math.max(c, GUIDANCE_LEVELS.SCAFFOLD));

    default:

      return Math.min(GUIDANCE_LEVELS.MICROSTEP, c + 1);

  }

}



function softConceptBite(topic) {

  const key = resolveTopicKey(topic) || topic;

  const catalog = CONCEPT_CATALOG[key];

  if (/photo/i.test(String(key))) {

    return (

      'Photosynthesis: leaves make food from light, water, and carbon dioxide. ' +

      'Soil nutrients help growth but are not the plant’s sugar. Sunlight is energy, not the food itself.'

    );

  }

  if (catalog?.summary) return String(catalog.summary).slice(0, 180);

  return `Keep ${key} simple: one clear job plants or soil do on the farm.`;

}



function processFollowUpAfterSupport(session, studentMessage = '') {

  const name = session.student_name || 'friend';

  const why = session.friendly_why || friendlyWhyOpened(session.code);

  const concept = session.concept_topic || 'this science idea';

  const reason = session.student_reason_key;

  const snippet =

    String(studentMessage).length > 80

      ? `${String(studentMessage).slice(0, 77).trim()}…`

      : String(studentMessage || '').trim();

  const lower = snippet.toLowerCase();



  // Explicit science ask after process support

  if (

    /\b(explain|from the begin|beginning|what is|teach|science|photosynthesis|concept)\b/i.test(

      lower,

    )

  ) {

    return {

      reply: sanitizeKidSpeech(

        `${name}, happy to go into the science now. We first learned your hang-up was about ${why}. ` +

          `${softConceptBite(concept)} When you return to the farm, match the choice to that tiny idea.`,

      ),

      understanding: 'want_explainer',

      guidance_level: GUIDANCE_LEVELS.REPAIR,

      phase: 'support',

    };

  }



  if (/\b(ready|ok|okay|thanks|got it|back to farm|try again)\b/i.test(lower)) {

    return {

      reply: sanitizeKidSpeech(

        `${name}, great. Remember the plan we made because ${why}. ` +

          `Go try the farm question with that approach — I'm proud you paused to figure out the real issue.`,

      ),

      understanding: 'ready',

      guidance_level: GUIDANCE_LEVELS.SCAFFOLD,

      phase: 'closing',

    };

  }



  // Light adaptive science eval only if prior reason was conceptual

  if (needsScienceSupport(reason, session.code)) {

    const evaluation = evaluateStudentAnswer(studentMessage, concept, {

      wrongAnswer: session.evidence?.last_wrong,

    });

    const tip = softConceptBite(concept);

    if (evaluation.level === 'understood' || evaluation.level === 'partial') {

      return {

        reply: sanitizeKidSpeech(

          `${name}, I hear you: "${snippet}". That helps with ${concept}. ` +

            `Because we opened for ${why}, try the farm again using this idea: ${tip}`,

        ),

        understanding: evaluation.level,

        guidance_level: GUIDANCE_LEVELS.SCAFFOLD,

        phase: 'support',

        evaluation,

      };

    }

    return {

      reply: sanitizeKidSpeech(

        `${name}, thanks for "${snippet}". Stay with ${concept}: ${tip} ` +

          `Then return to the farm with one clear reason for your pick.`,

      ),

      understanding: evaluation.level,

      guidance_level: GUIDANCE_LEVELS.REPAIR,

      phase: 'support',

      evaluation,

    };

  }



  return {

    reply: sanitizeKidSpeech(

      `${name}, I hear you: "${snippet || '…'}". Let's stick with the hang-up we found (${why}). ` +

        `Re-read the farm question, restate it in your words, then pick once. ` +

        `If the science idea itself feels fuzzy, say "explain the idea" and we will go there.`,

    ),

    understanding: 'process_followup',

    guidance_level: GUIDANCE_LEVELS.SCAFFOLD,

    phase: 'support',

  };

}



/**

 * Build the next mentor reply from frozen session + student answer.

 */

export function buildSessionFollowUp(session, studentMessage = '') {

  const name = session.student_name || 'friend';

  const why = session.friendly_why || friendlyWhyOpened(session.code);

  const concept = session.concept_topic || 'this science idea';

  const raw = String(studentMessage || '').trim();

  const options = session.diagnostic_options || [];

  const phase = session.phase || 'behavior_probe';



  // ——— Phase 1: must understand WHY they are struggling ———

  if (phase === 'behavior_probe' || !session.student_reason_key) {

    const choice = parseBehaviorChoice(raw, options);



    // Free-text "explain science" bypasses to concept when intentional

    if (

      !choice &&

      /\b(explain|from the begin|beginning|what is photosynthesis|teach me)\b/i.test(

        raw,

      )

    ) {

      const reply = sanitizeKidSpeech(

        `${name}, I came because ${why}. You asked for the science idea — I'll share it simply. ` +

          `${softConceptBite(concept)} ` +

          `If you also want help with reading, timing, or confidence, say so and we can cover that too.`,

      );

      return finalizeTurn(session, raw, reply, {

        understanding: 'want_explainer',

        reason_key: REASON_KEYS.WANTS_EXPLAIN,

        reason_label: raw.slice(0, 80),

        guidance_level: GUIDANCE_LEVELS.REPAIR,

        phase: 'support',

        show_options: false,

      });

    }



    if (choice?.reason_key) {

      const reply = sanitizeKidSpeech(

        buildBehaviorSupportReply({

          name,

          why,

          concept,

          reasonKey: choice.reason_key,

          choiceLabel: choice.label || raw,

          code: session.code,

          farmQuestion: session.evidence?.farm_question,

        }),

      );

      return finalizeTurn(session, raw, reply, {

        understanding: 'behavior_answered',

        reason_key: choice.reason_key,

        reason_label: choice.label || raw,

        letter: choice.letter,

        guidance_level: nextGuidanceLevel(

          session.guidance_level,

          'behavior_answered',

        ),

        phase: 'support',

        show_options: false,

        offer_mind_map: reasonNeedsMindMap(choice.reason_key),

      });

    }



    // Unclear free text during probe — gently re-prompt options, no science quiz

    const prompt =

      session.diagnostic_prompt ||

      'What is getting in the way right now?';

    const reply = sanitizeKidSpeech(

      `${name}, I came because ${why}. I heard "${raw.slice(0, 60) || '…'}". ` +

        `Before any science quiz, help me understand the problem. ${prompt} ` +

        `Please tap A, B, C, or D, or say the letter.`,

    );

    return finalizeTurn(session, raw, reply, {

      understanding: 'need_choice',

      guidance_level: GUIDANCE_LEVELS.DIAGNOSTIC,

      phase: 'behavior_probe',

      show_options: true,

    });

  }



  // ——— Phase 2+: support follow-ups ———

  const after = processFollowUpAfterSupport(session, raw);

  return finalizeTurn(session, raw, after.reply, {

    understanding: after.understanding,

    guidance_level: after.guidance_level,

    phase: after.phase || 'support',

    show_options: false,

    evaluation: after.evaluation,

  });

}



function finalizeTurn(session, studentMessage, reply, meta = {}) {

  const nextSession = {

    ...session,

    phase: meta.phase || session.phase,

    student_reason_key: meta.reason_key ?? session.student_reason_key,

    student_reason_label: meta.reason_label ?? session.student_reason_label,

    guidance_level: meta.guidance_level ?? session.guidance_level,

    turn_index: (session.turn_index || 0) + 1,

    last_student_message: studentMessage,

    last_mentor_message: reply,

    show_options: meta.show_options !== false && meta.phase === 'behavior_probe',

    offer_mind_map: Boolean(meta.offer_mind_map || session.offer_mind_map),

    evaluations: [

      ...(session.evaluations || []),

      {

        at: Date.now(),

        student: String(studentMessage).slice(0, 80),

        understanding: meta.understanding,

        reason_key: meta.reason_key ?? session.student_reason_key,

        letter: meta.letter || null,

        guidance_level: meta.guidance_level,

      },

    ].slice(-8),

  };



  return {

    reply,

    session: nextSession,

    evaluation: meta.evaluation || {

      level: meta.understanding,

      reason_key: meta.reason_key,

    },

    understanding: meta.understanding,

    guidance_level: meta.guidance_level,

    pending_options:

      nextSession.phase === 'behavior_probe'

        ? nextSession.diagnostic_options || []

        : [],

  };

}



/**

 * Pick the best available reply: model only if it respects student + session phase.

 */

export function resolvePerformanceReply({
  studentMessage = '',
  session = null,
  modelReply = '',
  focus = {},
  history = [],
} = {}) {
  const frozen =
    session ||
    freezeInterventionSession(focus, {
      studentName: focus.student_name,
    });

  // Always advance session state from local parse (A–D / intent)
  const adaptive = buildSessionFollowUp(frozen, studentMessage);
  const model = sanitizeKidSpeech(String(modelReply || '').trim());

  if (!String(studentMessage || '').trim()) {
    return {
      reply: frozen.spoken_opener || adaptive.reply,
      session: frozen,
      source: 'opener',
      pending_options: frozen.diagnostic_options || [],
    };
  }

  // Prefer live AI whenever it is responsive and student-aware.
  // Local adaptive is the offline safety net only.
  const modelOk =
    Boolean(model) &&
    model.length > 24 &&
    !looksLikeIgnoredStudentReply(model, studentMessage, {
      spoken_opener: frozen.spoken_opener,
      ...focus,
    }) &&
    modelTouchesPerformance(model, studentMessage, adaptive.session || frozen);

  if (modelOk) {
    return {
      reply: model,
      session: {
        ...(adaptive.session || frozen),
        last_mentor_message: model,
        last_student_message: studentMessage,
      },
      source: 'model',
      evaluation: adaptive.evaluation,
      pending_options: adaptive.pending_options,
    };
  }

  // Soft re-prompt only when we still need an A–D pick
  if (adaptive.understanding === 'need_choice') {
    return {
      reply: adaptive.reply,
      session: adaptive.session,
      source: 'session_behavior',
      evaluation: adaptive.evaluation,
      pending_options: adaptive.pending_options,
    };
  }

  return {
    reply: adaptive.reply,
    session: adaptive.session,
    source:
      adaptive.understanding === 'behavior_answered'
        ? 'session_behavior'
        : 'session_adaptive',
    evaluation: adaptive.evaluation,
    pending_options: adaptive.pending_options,
  };
}

function modelTouchesPerformance(reply, studentMessage, session) {
  const r = String(reply || '').toLowerCase();
  const student = String(studentMessage || '').toLowerCase();
  const sWords = student
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  const mentionsStudent =
    sWords.length === 0 ||
    sWords.some((w) => r.includes(w)) ||
    /\b(i hear|you said|you shared|your idea|thanks for|you picked|you chose|letter [a-d])\b/i.test(
      r,
    );
  const concept = String(session?.concept_topic || '').toLowerCase();
  const mentionsConcept =
    !concept ||
    concept.split(/[^a-z0-9]+/).some((w) => w.length > 3 && r.includes(w)) ||
    /photosynthesis|pollination|plant|soil|leaf|root|energy|water|farm|science|idea/.test(
      r,
    );
  const mentionsProblem =
    /\b(start|time|distract|hint|switch|guess|confiden|read|rush|difficulty|approach|wrong|mix|explain|concept|map)\b/i.test(
      r,
    ) ||
    String(session?.friendly_why || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((w) => w.length > 4 && r.includes(w));
  // AI is good if it touches student OR concept OR problem
  return mentionsStudent || mentionsConcept || mentionsProblem;
}

export function sessionToFocusPatch(session) {

  if (!session) return {};

  return {

    code: session.code,

    focus_code: session.code,

    underlying_code: session.underlying_code || session.code,

    concept_topic: session.concept_topic,

    concept_miss_count: session.evidence?.miss_count || 0,

    friendly_why: session.friendly_why,

    problem_statement: session.problem_statement,

    problem_statement_friendly: session.friendly_why,

    diagnostic_question: session.diagnostic_question,

    diagnostic_prompt: session.diagnostic_prompt,

    diagnostic_options: session.diagnostic_options,

    conversation_phase: session.phase,

    student_reason_key: session.student_reason_key,

    spoken_opener: session.spoken_opener,

    last_wrong_answer: session.evidence?.last_wrong || null,

    current_question: session.evidence?.farm_question || null,

    assistance_level:

      session.guidance_level >= GUIDANCE_LEVELS.MICROSTEP

        ? 'escalated'

        : session.assistance_level || 'standard',

    guidance_level: session.guidance_level,

    turn_index: session.turn_index,

    conversation_mode: 'performance_mentor_behavior_first',

    stay_on_concept_rule:

      `LOCKED behavior-first mentor. Cause: ${session.friendly_why}. ` +

      `Phase: ${session.phase}. Student reason: ${session.student_reason_key || 'pending'}. ` +

      `Do not science-quiz unless reason is conceptual. Never general chat.`,

  };

}



export { looksLikeIgnoredStudentReply, evaluateStudentAnswer };



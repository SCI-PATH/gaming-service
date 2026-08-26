/**
 * Builds the dynamic Groq context payload for the personalized AI mentor.
 * Every support open includes intervention_focus: trigger → concept → guidance lock.
 */
import {
  formatPerformanceDelta,
  INTERVENTION_MODES,
  PERCEIVED_STATES,
  trendFromDelta,
} from './avatarConstants.js';
import { summarizeMindMapForLlm } from './buildMindMap.js';
import { formatPreferencesForPayload } from './learningPreferences.js';
import {
  classifyPerformanceTier,
  PERFORMANCE_TIERS,
  shouldGenerateMindMap,
} from './performanceTier.js';
import {
  labelNonWrongScenario,
  NON_WRONG_SCENARIOS,
} from './nonWrongBehaviorMonitor.js';
import {
  buildInterventionFocus,
  INTERVENTION_FOCUS_CODES,
} from './interventionFocus.js';
import { friendlyStudentName } from './kidFriendlySpeech.js';
import { asQuestionText, friendlyWrongAnswer } from './kidFriendlySpeech.js';
import {
  buildFrustrationAdaptation,
  calculateFrustrationScore,
} from '../data/frustrationModel.js';

/**
 * @param {object} input
 * @returns {object} context payload for /api/avatar-chat
 */
export function buildContextPayload({
  student = null,
  farm = {},
  gameplay = {},
  telemetry = {},
  metrics: metricsIn = null,
  quiz = null,
  triggerReason = null,
  interventionMode = null,
  perceivedState = null,
  misconceptions = [],
  learningPrefs = null,
  mindMap = null,
  evaluatedTier: tierIn = null,
  nonWrongScenarioCode: nonWrongIn = null,
  interventionFocus: focusIn = null,
} = {}) {
  const m = metricsIn || telemetry.metrics || {};
  const grade = student?.gradeLevel || student?.grade || 'Grade 7';
  const displayName =
    friendlyStudentName(student?.displayName || student?.username) || 'friend';

  const correct =
    m.correct_answers ?? m.answer_accuracy_counts?.correct ?? 0;
  const incorrect =
    m.incorrect_answers ?? m.answer_accuracy_counts?.incorrect ?? 0;
  const total = correct + incorrect;
  const accuracyPct =
    m.accuracy_percentage != null
      ? Number(m.accuracy_percentage)
      : total > 0
        ? Math.round((correct / total) * 100)
        : 100;

  const deltaPts =
    m.performance_delta_points != null
      ? Number(m.performance_delta_points)
      : 0;
  const performanceDelta =
    m.performance_delta || formatPerformanceDelta(deltaPts);
  const trend =
    m.overall_progress_trend || trendFromDelta(deltaPts, accuracyPct);

  const story =
    farm.goalText ||
    (farm.cropName
      ? `Farm Level ${farm.levelId}: ${farm.cropName} harvest`
      : `Farm Level ${farm.levelId || 1}`);

  const levelElapsedSec = Math.max(
    Number(m.level_elapsed_sec) || 0,
    Number(gameplay.live?.levelElapsedSec) || 0,
  );
  const timeInLevelMin = Math.max(
    0,
    Math.round((levelElapsedSec / 60) * 10) / 10,
  );

  const mode =
    interventionMode ||
    telemetry.lastInterventionMode ||
    telemetry.intervention_mode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;

  const perceived =
    perceivedState ||
    telemetry.perceived_state ||
    mapPerceivedFromMode(mode);

  const questionText = asQuestionText(
    quiz?.prompt ||
      quiz?.question ||
      quiz?.questionData?.prompt ||
      quiz?.questionData?.question ||
      quiz?.question_text ||
      focusIn?.current_question ||
      telemetry.lastQuestionText ||
      null,
    280,
  );

  const lastWrong = friendlyWrongAnswer(
    telemetry.lastWrongAnswer ||
      quiz?.studentLastWrongAnswer ||
      quiz?.selectedText ||
      null,
  );

  const safeCorrect = (raw) => {
    const s = asQuestionText(raw, 200);
    if (!s) return null;
    if (/grading failed|model_not_found|error code|does not exist/i.test(s)) {
      return null;
    }
    return s;
  };

  const knownCorrect = safeCorrect(
    quiz?.correctAnswer ||
      quiz?.questionData?.correctAnswer ||
      focusIn?.correct_answer ||
      telemetry.lastCorrectAnswer ||
      null,
  );

  const answerHistory = (
    Array.isArray(telemetry.answerHistory)
      ? telemetry.answerHistory
      : Array.isArray(m.answer_history)
        ? m.answer_history
        : []
  )
    .slice(-8)
    .map((h) => ({
      question: asQuestionText(h.question || h.prompt, 160),
      student_answer: friendlyWrongAnswer(h.student_answer || h.selectedText, 60),
      is_correct: Boolean(h.is_correct ?? h.isCorrect),
      correct_answer: safeCorrect(h.correct_answer || h.correctAnswer),
      topic: h.topic || null,
      time_sec: h.time_sec ?? h.timeSec ?? null,
    }))
    .filter((h) => h.question || h.student_answer);

  const timePerQ =
    m.time_per_question_avg_sec != null
      ? Number(m.time_per_question_avg_sec)
      : telemetry.timeOnQuestionMs
        ? Math.round(telemetry.timeOnQuestionMs / 1000)
        : Number(gameplay.live?.avgAnswerTimeSec) || 0;

  const conceptMisses = (misconceptions || []).map((c) => ({
    topic: c.topic,
    miss_count: c.missCount,
    recent_wrong_answers: (c.wrongAnswers || []).slice(-3),
    sample_prompts: (c.prompts || []).slice(-2),
  }));

  const band =
    farm.performanceBand || gameplay.band || farm.gameplayBand || null;
  const evaluated_tier =
    tierIn ||
    m.evaluated_tier ||
    classifyPerformanceTier(m, { band: band || undefined });

  const non_wrong_scenario_code =
    nonWrongIn ||
    telemetry.non_wrong_scenario_code ||
    telemetry.scenarioCode ||
    m.non_wrong_scenario_code ||
    null;

  const focus =
    focusIn ||
    telemetry.intervention_focus ||
    m.intervention_focus ||
    buildInterventionFocus({
      scenarioCode: non_wrong_scenario_code,
      reason: triggerReason || telemetry.lastTriggerReason,
      scenario: telemetry.scenario,
      misconceptions,
      quiz,
      mindMap: mindMap || telemetry.mindMap,
      lastWrongAnswer: lastWrong,
      metrics: { ...m, evaluated_tier },
    });

  const isNonWrongTrigger = Boolean(
    non_wrong_scenario_code ||
      Object.values(NON_WRONG_SCENARIOS).includes(
        String(triggerReason || '').toUpperCase(),
      ) ||
      Object.values(NON_WRONG_SCENARIOS)
        .map((c) => c.toLowerCase())
        .includes(String(triggerReason || '').toLowerCase()),
  );

  // Mind maps when required by focus (same concept) or incorrect-answer support
  const requireMap =
    Boolean(focus?.require_mind_map) ||
    focus?.code === INTERVENTION_FOCUS_CODES.SAME_CONCEPT_STRUGGLE ||
    focus?.code === INTERVENTION_FOCUS_CODES.ESCALATED_SCAFFOLDING ||
    Boolean(telemetry.offerMindMap);

  const allowMindMap =
    requireMap ||
    (!isNonWrongTrigger &&
      shouldGenerateMindMap({
        interventionMode: mode,
        triggerReason: triggerReason || telemetry.lastTriggerReason,
        scenario: telemetry.scenario,
        incorrectCount: incorrect,
        misconceptionCount: conceptMisses.length,
        offerMindMap: telemetry.offerMindMap,
      })) ||
    (isNonWrongTrigger &&
      incorrect >= 1 &&
      conceptMisses.length > 0 &&
      (focus?.code === INTERVENTION_FOCUS_CODES.REPEATED_WRONG ||
        focus?.code === INTERVENTION_FOCUS_CODES.SLOW_AND_WRONG));

  const mindMapSummary = allowMindMap
    ? summarizeMindMapForLlm(mindMap || telemetry.mindMap || null)
    : null;

  const scenarioCode =
    non_wrong_scenario_code ||
    focus?.code ||
    (isNonWrongTrigger ? String(triggerReason || '').toUpperCase() : null);

  const frComputed = calculateFrustrationScore(m);
  // Prefer LIVE telemetry/session score; always recompute adaptation from that score.
  const frustrationScore = Number(
    telemetry.frustrationScore ??
      m.frustration_score ??
      frComputed?.score ??
      0,
  );
  const frustrationLevel = String(
    telemetry.frustrationLevel ||
      m.frustration_level ||
      frComputed?.level ||
      'low',
  ).toLowerCase();
  const frustrationSignals =
    telemetry.frustrationSignals ||
    m.frustration_signals ||
    frComputed?.signals ||
    [];
  const frustrationAdaptation = buildFrustrationAdaptation(
    frustrationScore,
    frustrationSignals,
  );

  return {
    student_profile: {
      grade_level: grade,
      display_name: displayName,
      // Intentionally no ability ranks / tiers in mentor payload
      overall_progress_trend: trend,
      historical_accuracy_pct: accuracyPct,
    },
    frustration_score: frustrationScore,
    frustration_level: frustrationLevel,
    frustration_signals: frustrationSignals,
    frustration_adaptation: frustrationAdaptation,
    sage_adaptation: frustrationAdaptation.sage,
    mind_map_adaptation: frustrationAdaptation.mindMap,
    metrics: {
      level_retries_count:
        m.level_retries_count ??
        telemetry.consecutiveFails ??
        gameplay.live?.retries ??
        farm.retries ??
        0,
      question_attempts: m.question_attempts ?? 0,
      time_per_question_avg_sec: timePerQ,
      time_per_question_current_sec:
        m.time_per_question_current_sec ??
        (telemetry.timeOnQuestionMs
          ? Math.round(telemetry.timeOnQuestionMs / 1000)
          : 0),
      correct_answers: correct,
      incorrect_answers: incorrect,
      answer_accuracy_counts: { correct, incorrect },
      accuracy_percentage: accuracyPct,
      click_pattern_density: m.click_pattern_density || 'Low/Calm',
      performance_delta: performanceDelta,
      performance_delta_points: deltaPts,
      overall_progress_trend: trend,
      frustration_score: frustrationScore,
      frustration_level: frustrationLevel,
    },
    intervention_focus: focus,
    non_wrong_scenario_code: scenarioCode,
    non_wrong_scenario_label: scenarioCode
      ? labelNonWrongScenario(scenarioCode)
      : focus?.problem_statement || null,
    trigger_event: {
      type: allowMindMap
        ? 'FOCUSED_CONCEPT_SUPPORT'
        : isNonWrongTrigger
          ? 'FOCUSED_BEHAVIOR_SUPPORT'
          : mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE
            ? 'TEMPORAL_STAGNATION'
            : 'LEVEL_MILESTONE',
      non_wrong_scenario_code: scenarioCode,
      focus_code: focus?.code || null,
      concept_topic: focus?.concept_topic || null,
      problem_statement: focus?.problem_statement || null,
      reason: triggerReason || telemetry.lastTriggerReason || null,
    },
    misconceptions: allowMindMap ? conceptMisses : [],
    mind_map: mindMapSummary,
    generate_mind_map: Boolean(allowMindMap),
    mind_map_highlight_node:
      focus?.mind_map_highlight_node || focus?.concept_topic || null,
    learning_preferences: formatPreferencesForPayload(
      learningPrefs || telemetry.learningPrefs || {},
    ),
    game_state: {
      current_story: story,
      level_id: farm.levelId ?? 1,
      crop_name: farm.cropName || null,
      time_in_current_level_min: timeInLevelMin,
      time_spent: `${timeInLevelMin} min`,
      perceived_state: perceived,
      trigger_reason: triggerReason || telemetry.lastTriggerReason || null,
      gameplay_band: band || 'average',
      frustration_level: frustrationLevel,
    },
    current_question: questionText
      ? {
          question_text: questionText,
          student_last_wrong_answer: lastWrong,
          correct_answer:
            knownCorrect ||
            safeCorrect(mindMapSummary?.correctAnswer) ||
            null,
          mode: quiz?.mode || quiz?.questionData?.mode || null,
          topic:
            focus?.concept_topic ||
            quiz?.topic ||
            quiz?.questionData?.topic ||
            mindMapSummary?.topic ||
            null,
        }
      : {
          question_text: asQuestionText(focus?.current_question, 280),
          student_last_wrong_answer: lastWrong,
          correct_answer:
            knownCorrect ||
            safeCorrect(focus?.correct_answer) ||
            safeCorrect(mindMapSummary?.correctAnswer) ||
            null,
          mode: null,
          topic: focus?.concept_topic || mindMapSummary?.topic || null,
        },
    answer_history: answerHistory,
    performance_snapshot: {
      correct_answers: correct,
      incorrect_answers: incorrect,
      accuracy_percentage: accuracyPct,
      consecutive_fails:
        m.consecutive_fails ?? telemetry.consecutiveFails ?? 0,
      recent_correct_streak: m.recent_correct_streak ?? 0,
      time_per_question_avg_sec: timePerQ,
      frustration_score: frustrationScore,
      frustration_level: frustrationLevel,
    },
    intervention_mode: mode,
    mentor_goals: [
      'focused_intervention_only',
      'trigger_reason_to_concept_lock',
      'ground_reply_in_active_farm_question',
      'reveal_correct_answer_when_known',
      'use_live_frustration_each_turn',
      'no_general_chatbot',
      'frustration_aware_tone_private',
      allowMindMap
        ? 'concept_repair_via_mind_map'
        : 'targeted_dialogue_no_mind_map',
      focus?.assistance_level === 'escalated'
        ? 'escalated_scaffolding_same_difficulty'
        : 'standard_scaffolding',
    ],
  };
}

function mapBandFromTier(tier) {
  if (tier === PERFORMANCE_TIERS.WEAK) return 'weak';
  if (tier === PERFORMANCE_TIERS.SMART) return 'advanced';
  return 'average';
}

function mapPerceivedFromMode(mode) {
  switch (mode) {
    case INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE:
      return PERCEIVED_STATES.BORED_OR_EASY;
    case INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE:
      return PERCEIVED_STATES.HIGH_PERFORMING;
    case INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD:
      return PERCEIVED_STATES.STRUGGLING;
    default:
      return PERCEIVED_STATES.STEADY;
  }
}

export function buildLlamaMessages(contextPayload, studentMessage) {
  return [
    {
      role: 'user',
      content: JSON.stringify({
        context: contextPayload,
        student_message: studentMessage,
      }),
    },
  ];
}

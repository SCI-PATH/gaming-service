/**
 * Builds the dynamic Groq context payload for the personalized AI mentor.
 */
import {
  formatPerformanceDelta,
  INTERVENTION_MODES,
  PERCEIVED_STATES,
  trendFromDelta,
} from './avatarConstants.js';
import { summarizeMindMapForLlm } from './buildMindMap.js';
import { formatPreferencesForPayload } from './learningPreferences.js';

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
} = {}) {
  const m = metricsIn || telemetry.metrics || {};
  const grade = student?.gradeLevel || student?.grade || 'Grade 7';
  const displayName =
    student?.displayName || student?.username || 'Student';

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

  const questionText =
    quiz?.prompt ||
    quiz?.question ||
    quiz?.questionData?.prompt ||
    quiz?.questionData?.question ||
    null;

  const lastWrong =
    telemetry.lastWrongAnswer ||
    quiz?.studentLastWrongAnswer ||
    null;

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

  const mindMapSummary = summarizeMindMapForLlm(
    mindMap || telemetry.mindMap || null,
  );

  return {
    student_profile: {
      grade_level: grade,
      display_name: displayName,
      overall_progress_trend: trend,
      historical_accuracy_pct: accuracyPct,
      mastery_band:
        farm.performanceBand || gameplay.band || farm.gameplayBand || 'average',
    },
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
    },
    misconceptions: conceptMisses,
    mind_map: mindMapSummary,
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
      gameplay_band: gameplay.band || farm.gameplayBand || 'average',
    },
    current_question: questionText
      ? {
          question_text: questionText,
          student_last_wrong_answer: lastWrong,
          mode: quiz?.mode || null,
          topic:
            quiz?.topic ||
            quiz?.questionData?.topic ||
            mindMapSummary?.topic ||
            null,
        }
      : {
          question_text: null,
          student_last_wrong_answer: lastWrong,
          mode: null,
          topic: mindMapSummary?.topic || null,
        },
    intervention_mode: mode,
    mentor_goals: [
      'motivation_and_confidence',
      'concept_repair_via_mind_map',
      'hints_not_answers',
      'format_preference_personalization',
    ],
  };
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

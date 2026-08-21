/**
 * Structured per-question performance records + rolling aggregates.
 */
import { classifyPerformanceCategory } from './performanceCategories.js';
import { calculateFrustrationScore } from './frustrationModel.js';

export function createEmptyQuestionRecord() {
  return {
    questionId: null,
    mode: null,
    correct: false,
    answerTimeMs: 0,
    attempts: 1,
    retries: 0,
    hintsUsed: 0,
    answerChanges: 0,
    mouseMovement: 0,
    mouseClicks: 0,
    mouseInactivityMs: 0,
    skipped: false,
    timestamp: Date.now(),
  };
}

export function createEmptyAggregate() {
  return {
    accuracy: 100,
    averageAnswerTime: 0,
    medianAnswerTime: 0,
    longestAnswerTime: 0,
    shortestAnswerTime: 0,
    retryRate: 0,
    hintUsageRate: 0,
    errorRate: 0,
    interactionRate: 0,
    performanceTrend: 0,
    previousAccuracy: null,
    previousAverageAnswerTime: null,
    previousRetryRate: null,
    frustrationScore: 0,
    frustrationLevel: 'low',
    performanceCategory: 'medium',
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    questionsSkipped: 0,
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeRecords(records = [], extras = {}) {
  const list = Array.isArray(records) ? records : [];
  const times = list.map((r) => Number(r.answerTimeMs) || 0).filter((t) => t > 0);
  const correct = list.filter((r) => r.correct).length;
  const incorrect = list.filter((r) => !r.correct && !r.skipped).length;
  const skipped = list.filter((r) => r.skipped).length;
  const total = list.length;
  const retries = list.reduce((s, r) => s + (Number(r.retries) || 0), 0);
  const hints = list.reduce((s, r) => s + (Number(r.hintsUsed) || 0), 0);
  const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const accuracy = total > 0 ? (correct / Math.max(1, correct + incorrect)) * 100 : 100;

  let consecutiveIncorrect = 0;
  let consecutiveCorrect = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].skipped) continue;
    if (list[i].correct) {
      if (consecutiveIncorrect) break;
      consecutiveCorrect += 1;
    } else {
      if (consecutiveCorrect) break;
      consecutiveIncorrect += 1;
    }
  }

  const prevAcc = extras.previousAccuracy;
  const trend = prevAcc != null ? accuracy - prevAcc : 0;

  const frustration = calculateFrustrationScore({
    incorrect_answers: incorrect,
    correct_answers: correct,
    consecutive_fails: consecutiveIncorrect,
    retries,
    level_retries_count: retries,
    hint_count: hints,
    answer_switches: list.reduce((s, r) => s + (Number(r.answerChanges) || 0), 0),
    time_per_question_avg_sec: avgTime / 1000,
    previous_avg_answer_time_sec:
      extras.previousAverageAnswerTime != null
        ? extras.previousAverageAnswerTime / 1000
        : 0,
    performance_delta_points: trend,
    click_pattern_density: extras.clickPattern || 'Low/Calm',
    rapid_click_count: extras.rapidClickCount || 0,
    inactivity_sec: extras.inactivitySec || 0,
    enemy_hits: extras.enemyHits || 0,
    level_restarts: extras.levelRestarts || 0,
    questions_skipped: skipped,
    mouse_erratic_score: extras.mouseErraticScore || 0,
  });

  const category = classifyPerformanceCategory({
    accuracyPct: accuracy,
    correct,
    incorrect,
    consecutiveIncorrect,
    retries,
    avgAnswerTimeMs: avgTime,
    baselineAnswerTimeMs: extras.previousAverageAnswerTime || 0,
  });

  return {
    accuracy: Math.round(accuracy * 10) / 10,
    averageAnswerTime: Math.round(avgTime),
    medianAnswerTime: Math.round(median(times)),
    longestAnswerTime: times.length ? Math.max(...times) : 0,
    shortestAnswerTime: times.length ? Math.min(...times) : 0,
    retryRate: total > 0 ? retries / total : 0,
    hintUsageRate: total > 0 ? hints / total : 0,
    errorRate: total > 0 ? incorrect / Math.max(1, correct + incorrect) : 0,
    interactionRate: extras.interactionCount || 0,
    performanceTrend: Math.round(trend * 10) / 10,
    previousAccuracy: prevAcc ?? null,
    previousAverageAnswerTime: extras.previousAverageAnswerTime ?? null,
    previousRetryRate: extras.previousRetryRate ?? null,
    frustrationScore: frustration.score,
    frustrationLevel: frustration.level,
    frustrationSignals: frustration.signals,
    performanceCategory: category,
    consecutiveCorrect,
    consecutiveIncorrect,
    correctAnswers: correct,
    incorrectAnswers: incorrect,
    questionsSkipped: skipped,
  };
}

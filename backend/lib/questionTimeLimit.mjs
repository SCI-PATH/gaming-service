/**
 * Same timing table as frontend/src/data/questionTimeLimit.js
 * so API/validation can share the intended limit.
 */

export const QUESTION_TYPE_BASE_MS = Object.freeze({
  TrueFalse: 12000,
  MCQ: 18000,
  MultiBlank: 32000,
  ShortAnswer: 45000,
});

export const QUESTION_TYPE_CLAMP_MS = Object.freeze({
  TrueFalse: Object.freeze({ min: 8000, max: 28000 }),
  MCQ: Object.freeze({ min: 12000, max: 40000 }),
  MultiBlank: Object.freeze({ min: 20000, max: 70000 }),
  ShortAnswer: Object.freeze({ min: 28000, max: 90000 }),
});

const BAND_TIME_MULT = Object.freeze({
  weak: 1.22,
  medium: 1,
  smart: 0.88,
});

const FRUSTRATION_TIMER_MULT = Object.freeze({
  low: 0.9,
  moderate: 1.15,
  high: 1.45,
  very_high: 1.75,
});

function frustrationLevelFromScore(score) {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (s <= 30) return 'low';
  if (s <= 60) return 'moderate';
  if (s <= 80) return 'high';
  return 'very_high';
}

export function getQuestionTimeLimit(
  questionType,
  frustrationScore = 0,
  difficulty = 'medium',
) {
  const type = String(questionType || 'MCQ').replace(/[_\s-]/g, '');
  const key =
    /^truefalse|^tf$/i.test(type)
      ? 'TrueFalse'
      : /^short|^typed/i.test(type)
        ? 'ShortAnswer'
        : /^multi|^fill/i.test(type)
          ? 'MultiBlank'
          : 'MCQ';
  const base = QUESTION_TYPE_BASE_MS[key] || QUESTION_TYPE_BASE_MS.MCQ;
  const band = String(difficulty || 'medium').toLowerCase();
  const bandMult = BAND_TIME_MULT[band] ?? 1;
  const level =
    typeof frustrationScore === 'string'
      ? frustrationScore
      : frustrationLevelFromScore(frustrationScore);
  const timerMult = FRUSTRATION_TIMER_MULT[level] || 1;
  const bounds = QUESTION_TYPE_CLAMP_MS[key];
  const ms = Math.round(base * bandMult * timerMult);
  return Math.max(bounds.min, Math.min(bounds.max, ms));
}

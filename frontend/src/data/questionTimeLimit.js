/**
 * Per-question countdown: Assessment Engine type + CSF frustration + gameplay band.
 * Calculated when the question is presented and frozen (deadline) so reload
 * cannot reset the clock.
 */

import { farmQuestionType } from '../assessmentEngine/assessmentQuizSession.js';
import { buildFrustrationAdaptation } from './frustrationModel.js';
import { normalizePerformanceCategory } from './performanceCategories.js';

export const QUESTION_TIME_MIN_MS = 8000;
export const QUESTION_TIME_MAX_MS = 90000;

/** Base thinking time by Assessment Engine type — not a shared band timer. */
export const QUESTION_TYPE_BASE_MS = Object.freeze({
  TrueFalse: 12000,
  MCQ: 18000,
  MultiBlank: 32000,
  ShortAnswer: 45000,
});

/** Type-specific clamps so frustration cannot collapse all types to one duration. */
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

const DEADLINE_PREFIX = 'scipath_question_deadline:';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function resolveQuizQuestionType(questionOrType) {
  if (typeof questionOrType === 'string') {
    return farmQuestionType({ questionType: questionOrType }) || 'MCQ';
  }
  return farmQuestionType(questionOrType || {}) || 'MCQ';
}

/**
 * Authoritative time limit for one presented question.
 * High frustration lengthens the type's own window; it does not apply one
 * global multiplier to a single shared base.
 */
export function getQuestionTimeLimit(
  questionType,
  frustrationScore = 0,
  difficulty = 'medium',
  question = null,
) {
  const type = resolveQuizQuestionType(
    question && typeof question === 'object' ? question : questionType,
  );
  const base = QUESTION_TYPE_BASE_MS[type] || QUESTION_TYPE_BASE_MS.MCQ;
  const band = normalizePerformanceCategory(difficulty);
  const bandMult = BAND_TIME_MULT[band] ?? 1;
  const adapt = buildFrustrationAdaptation(
    Number.isFinite(Number(frustrationScore))
      ? Number(frustrationScore)
      : frustrationScore || 'moderate',
  );
  const timerMult = Number(adapt.gameplay?.timerMult) || 1;
  const bounds = QUESTION_TYPE_CLAMP_MS[type] || {
    min: QUESTION_TIME_MIN_MS,
    max: QUESTION_TIME_MAX_MS,
  };
  const ms = Math.round(base * bandMult * timerMult);
  return clamp(ms, bounds.min, bounds.max);
}

export function questionDeadlineStorageKey(questionId) {
  return `${DEADLINE_PREFIX}${String(questionId || '').trim()}`;
}

export function rememberQuestionDeadline(questionId, deadlineAt) {
  const id = String(questionId || '').trim();
  const at = Number(deadlineAt);
  if (!id || !Number.isFinite(at)) return;
  try {
    sessionStorage.setItem(questionDeadlineStorageKey(id), String(Math.round(at)));
  } catch {
    /* private mode */
  }
}

export function readQuestionDeadline(questionId) {
  const id = String(questionId || '').trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(questionDeadlineStorageKey(id));
    const at = Number(raw);
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

export function clearQuestionDeadline(questionId) {
  const id = String(questionId || '').trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(questionDeadlineStorageKey(id));
  } catch {
    /* ignore */
  }
}

/**
 * Freeze the clock the first time this question is shown; reuse on remount/reload.
 */
export function freezeQuestionDeadline(questionId, timeLimitMs, now = Date.now()) {
  const existing = readQuestionDeadline(questionId);
  if (existing && existing > now) return existing;
  const deadlineAt = now + Math.max(1000, Number(timeLimitMs) || 0);
  rememberQuestionDeadline(questionId, deadlineAt);
  return deadlineAt;
}

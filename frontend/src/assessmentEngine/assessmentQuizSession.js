/**
 * Assessment Engine quiz session for the farm science quiz UI.
 * Call order: post-lesson → next → answer → next → … → terminate on quiz game-over.
 * Science quiz text comes only from /next (local mock banks are disabled).
 */

import {
  ASSESSMENT_PATHS,
  getAssessmentBaseCandidates,
} from './assessmentEngine.js';
import { getCurrentStudent } from '../data/mockStudents.js';

const FETCH_TIMEOUT_MS = 6000;
const AE_LOG = '[AssessmentEngine]';

function aeLog(label, detail) {
  if (detail !== undefined) {
    console.log(AE_LOG, label, detail);
  } else {
    console.log(AE_LOG, label);
  }
}

function aeWarn(label, detail) {
  if (detail !== undefined) {
    console.warn(AE_LOG, label, detail);
  } else {
    console.warn(AE_LOG, label);
  }
}

/** @type {string | null} */
let sessionId = null;
/** @type {object | null} cached /next payload already mapped for UI */
let cachedQuestion = null;
/** @type {boolean} both bases failed for post-lesson — no science quiz this run */
let assessmentUnavailable = false;
/** @type {boolean} /next returned 409 — stop calling Assessment Engine */
let nextStopped = false;
/** @type {boolean} session finished via answer is_complete */
let sessionComplete = false;
/** @type {string | null} last working API base */
let activeBase = null;
/** In-flight ensure / next so parallel farm triggers share one session */
let ensurePromise = null;
let nextPromise = null;

const STRIP_KEYS = new Set([
  'correct_answer',
  'ideal_answer',
  'answers',
  'keywords',
  'option_diagnostics',
]);

function shouldStripKey(key) {
  const k = String(key || '');
  if (STRIP_KEYS.has(k)) return true;
  if (k.startsWith('distractor_')) return true;
  return false;
}

function stripSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(stripSecrets);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (shouldStripKey(key)) continue;
      out[key] = stripSecrets(val);
    }
    return out;
  }
  return value;
}

function normalizeGrade(student) {
  const raw = student?.grade ?? student?.gradeLevel ?? null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 6 && n <= 9) return Math.trunc(n);
  return null;
}

/**
 * Map Assessment Engine /next question into ScienceQuizModal shape.
 * Keeps letter → text for answer submit; never exposes correct answers.
 */
export function mapAssessmentQuestion(rawQuestion) {
  const q = stripSecrets(rawQuestion || {});
  const payload = q.payload && typeof q.payload === 'object' ? q.payload : {};
  const questionType = String(
    q.question_type || q.questionType || payload.question_type || 'MCQ',
  );
  const stem =
    payload.question ||
    payload.prompt ||
    q.question ||
    q.prompt ||
    '';

  /** @type {string[]} */
  const optionLetters = [];
  /** @type {string[]} */
  const options = [];

  const typeLower = questionType.toLowerCase().replace(/[_\s-]/g, '');
  const isTrueFalse =
    typeLower === 'truefalse' ||
    typeLower === 'tf' ||
    typeLower === 'boolean';

  if (isTrueFalse) {
    optionLetters.push('True', 'False');
    options.push('True', 'False');
  } else {
    const rawOpts = payload.options ?? q.options;
    if (rawOpts && typeof rawOpts === 'object' && !Array.isArray(rawOpts)) {
      const letters = Object.keys(rawOpts).sort();
      for (const letter of letters) {
        optionLetters.push(String(letter));
        options.push(String(rawOpts[letter] ?? letter));
      }
    } else if (Array.isArray(rawOpts)) {
      rawOpts.forEach((opt, idx) => {
        if (opt && typeof opt === 'object') {
          const letter = String(
            opt.letter || opt.key || opt.id || String.fromCharCode(65 + idx),
          );
          const text = String(
            opt.text ?? opt.label ?? opt.value ?? opt.option ?? letter,
          );
          optionLetters.push(letter);
          options.push(text);
        } else {
          const letter = String.fromCharCode(65 + idx);
          optionLetters.push(letter);
          options.push(String(opt ?? letter));
        }
      });
    }
  }

  if (!options.length) {
    aeWarn('map /next skipped — no options after strip', {
      questionType,
      stem,
      payloadKeys: Object.keys(payload),
    });
    return null;
  }

  const mapped = {
    id: String(q.id || ''),
    prompt: String(stem),
    question: String(stem),
    options,
    optionLetters,
    questionType,
    remoteGrade: true,
    source: 'assessment_engine',
  };
  aeLog('mapped /next → quiz UI', mapped);
  return mapped;
}

function clearRuntime({ keepUnavailable = false } = {}) {
  sessionId = null;
  cachedQuestion = null;
  sessionComplete = false;
  nextStopped = false;
  activeBase = null;
  ensurePromise = null;
  nextPromise = null;
  if (!keepUnavailable) {
    assessmentUnavailable = false;
  }
}

/** Clear session_id (level restart / after terminate). */
export function clearAssessmentSession() {
  clearRuntime();
}

export function getAssessmentSessionId() {
  return sessionId;
}

export function isAssessmentQuestion(questionData) {
  return Boolean(
    questionData?.remoteGrade || questionData?.source === 'assessment_engine',
  );
}

async function fetchWithBases(pathBuilder, { method = 'GET', body, label } = {}) {
  // Once a base creates the session, stay on that host only.
  // session_id from localhost is invalid on the deployed engine (and vice versa).
  const bases = activeBase
    ? [activeBase]
    : getAssessmentBaseCandidates();

  let lastError = null;
  for (const base of bases) {
    const url = `${base.replace(/\/+$/, '')}${pathBuilder()}`;
    aeLog(`${method} ${label || url} → request`, {
      url,
      body: body ?? null,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body != null ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      aeLog(`${method} ${label || url} ← ${res.status}`, {
        url,
        ok: res.ok,
        status: res.status,
        response: data,
      });
      if (res.status === 409) {
        return { ok: false, status: 409, data, base };
      }
      if (!res.ok) {
        lastError = { status: res.status, data, base };
        continue;
      }
      activeBase = base;
      return { ok: true, status: res.status, data, base };
    } catch (err) {
      lastError = { error: err, base };
      aeWarn(`${method} ${label || url} failed`, {
        url,
        error: err?.name === 'AbortError'
          ? `timeout after ${FETCH_TIMEOUT_MS}ms`
          : String(err?.message || err),
      });
    } finally {
      clearTimeout(timer);
    }
  }
  aeWarn('all bases failed', { label, lastError, stickyBase: activeBase });
  return { ok: false, status: 0, data: null, lastError };
}

async function postLesson(student) {
  const studentId = student?.id;
  if (!studentId) return null;

  const body = { student_id: String(studentId) };
  const grade = normalizeGrade(student);
  if (grade != null) {
    body.grade = grade;
  }

  const result = await fetchWithBases(ASSESSMENT_PATHS.postLesson, {
    method: 'POST',
    body,
    label: 'POST /quizzes/post-lesson',
  });
  if (!result.ok) {
    aeWarn('post-lesson failed — no Assessment Engine questions', result.lastError || result.data);
    return null;
  }

  const id =
    result.data?.session_id ||
    result.data?.sessionId ||
    result.data?.id ||
    null;
  if (!id) return null;

  sessionId = String(id);
  sessionComplete = false;
  nextStopped = false;
  aeLog('session started', {
    session_id: sessionId,
    max_questions: result.data?.max_questions,
    status: result.data?.status,
  });
  return sessionId;
}

async function ensureSession() {
  if (assessmentUnavailable || nextStopped || sessionComplete) return null;
  if (sessionId) return sessionId;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const student = getCurrentStudent();
    const id = await postLesson(student);
    if (!id) {
      assessmentUnavailable = true;
      return null;
    }
    return id;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

async function fetchNextMapped() {
  if (assessmentUnavailable || nextStopped || sessionComplete) return null;
  if (!sessionId) return null;
  if (cachedQuestion) {
    const q = cachedQuestion;
    cachedQuestion = null;
    return q;
  }
  if (nextPromise) return nextPromise;

  nextPromise = (async () => {
    const sid = sessionId;
    const result = await fetchWithBases(() => ASSESSMENT_PATHS.next(sid), {
      method: 'GET',
      label: `GET /quizzes/${sid}/next`,
    });

    if (result.status === 409) {
      nextStopped = true;
      aeWarn('/next 409 — stop fetching engine questions, farm stays playable');
      return null;
    }
    if (!result.ok) {
      aeWarn('/next failed', result.lastError || result.data);
      return null;
    }

    const data = result.data || {};
    if (
      data.is_complete === true ||
      String(data.status || '').toLowerCase() === 'complete' ||
      String(data.status || '').toLowerCase() === 'completed'
    ) {
      sessionComplete = true;
      aeLog('/next session complete — no more engine questions');
      return null;
    }

    const rawQ = data.question || data;
    aeLog('/next raw question', rawQ);
    const mapped = mapAssessmentQuestion(rawQ);
    if (!mapped?.id || !mapped.options?.length) {
      aeWarn('/next could not map question into quiz UI', rawQ);
      return null;
    }
    return mapped;
  })().finally(() => {
    nextPromise = null;
  });

  return nextPromise;
}

/**
 * Resolve the next science question from Assessment Engine /next only.
 * @param {object} [_level]
 * @param {string} [_avoidId]
 * @param {string} [_mode]
 * @returns {Promise<object | null>}
 */
export async function resolveScienceQuestion(_level, _avoidId, _mode = 'plant') {
  if (assessmentUnavailable || nextStopped || sessionComplete) {
    aeWarn('no Assessment Engine question', {
      reason: assessmentUnavailable
        ? 'assessment unavailable'
        : nextStopped
          ? '/next 409'
          : 'session complete',
    });
    return null;
  }

  try {
    const sid = await ensureSession();
    if (!sid) {
      aeWarn('no session_id from post-lesson — cannot open science quiz');
      return null;
    }
    const remote = await fetchNextMapped();
    if (remote) {
      aeLog('quiz will show Assessment Engine question', {
        id: remote.id,
        prompt: remote.prompt,
        options: remote.options,
        optionLetters: remote.optionLetters,
      });
      return remote;
    }
    aeWarn('no mapped /next question for quiz UI');
    return null;
  } catch (err) {
    aeWarn('resolveScienceQuestion threw', err);
    return null;
  }
}

/**
 * Submit answer for the question currently on screen.
 * Awaits /answer before any subsequent /next (prefetch).
 */
export async function submitAssessmentAnswer({
  questionId,
  studentAnswer,
  timeTakenSeconds,
} = {}) {
  if (!sessionId || !questionId) {
    aeWarn('skip /answer — no session or question id', { sessionId, questionId });
    return { ok: false, isCorrect: false, isComplete: true };
  }

  const body = {
    question_id: String(questionId),
    student_answer: String(studentAnswer),
    time_taken_seconds: Number(timeTakenSeconds) || 0,
  };
  const result = await fetchWithBases(() => ASSESSMENT_PATHS.answer(sessionId), {
    method: 'POST',
    body,
    label: `POST /quizzes/${sessionId}/answer`,
  });

  if (!result.ok) {
    aeWarn('/answer failed', result.lastError || result.data);
    return { ok: false, isCorrect: false, isComplete: false, data: result.data };
  }

  const data = result.data || {};
  const grade = data.grade && typeof data.grade === 'object' ? data.grade : data;
  const isCorrect = Boolean(
    grade?.is_correct ?? grade?.isCorrect ?? data.is_correct,
  );
  const isComplete = Boolean(
    data.is_complete === true ||
      String(data.status || '').toLowerCase() === 'complete' ||
      String(data.status || '').toLowerCase() === 'completed',
  );

  aeLog('/answer grade', {
    is_correct: isCorrect,
    is_complete: isComplete,
    grade: data.grade ?? data,
  });

  if (isComplete) {
    sessionComplete = true;
    cachedQuestion = null;
  } else if (!nextStopped && !assessmentUnavailable) {
    try {
      const next = await fetchNextMapped();
      if (next) cachedQuestion = next;
    } catch {
      /* ignore prefetch errors */
    }
  }

  return { ok: true, isCorrect, isComplete, data };
}

/**
 * Terminate Assessment Engine session (quiz wrong-answer game over).
 */
export async function terminateAssessmentSession({
  reason = 'wrong_answers_exhausted',
  source = 'component_3',
} = {}) {
  const sid = sessionId;
  if (!sid) {
    aeLog('skip /terminate — no session');
    clearAssessmentSession();
    return { ok: false, skipped: true };
  }

  const result = await fetchWithBases(() => ASSESSMENT_PATHS.terminate(sid), {
    method: 'POST',
    body: { reason, source },
    label: `POST /quizzes/${sid}/terminate`,
  });

  clearAssessmentSession();
  return { ok: result.ok, status: result.status, data: result.data };
}

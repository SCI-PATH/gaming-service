/**
 * Assessment Engine quiz session for the farm science quiz UI.
 * Call order: post-lesson → next → answer → next → … → terminate on quiz game-over.
 * Farm E-key challenges load question text only from Assessment Engine /next.
 */

import {
  ASSESSMENT_PATHS,
  getAssessmentBaseCandidates,
} from './assessmentEngine.js';
import { getCurrentStudent } from '../data/mockStudents.js';

const FETCH_TIMEOUT_MS = 15000;
const ANSWER_TIMEOUT_MS = 20000;
const FAIL_COOLDOWN_MS = 4000;
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
/** Bumps when a question is taken for the on-screen quiz so warmup cannot recache it. */
let fetchGeneration = 0;

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
 * Real IAE catalog id only (e.g. G7_C2). Never invent G{n}_C8 —
 * omitting chapter_id lets C2 resolve via C1 /progress.
 * @returns {string | null}
 */
function resolveChapterId(student) {
  const raw = String(
    student?.chapterId ||
      student?.chapter_id ||
      student?.topicId ||
      student?.topic_id ||
      '',
  ).trim();
  const match = raw.match(/^G([6-9])_C(\d+)$/i);
  if (!match) return null;
  return `G${match[1]}_C${match[2]}`;
}

/** Canonical Assessment Engine types: MCQ | TrueFalse | ShortAnswer | MultiBlank */
export function asQuestionType(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const normalized = value.replace(/[_\s-]/g, '').toLowerCase();
  if (normalized === 'mcq' || normalized === 'multiplechoice') return 'MCQ';
  if (
    normalized === 'truefalse' ||
    normalized === 'tf' ||
    normalized === 'boolean'
  ) {
    return 'TrueFalse';
  }
  if (normalized === 'shortanswer') return 'ShortAnswer';
  if (
    normalized === 'multiblank' ||
    normalized === 'fillintheblank' ||
    normalized === 'fillblank' ||
    normalized === 'fillintheblanks'
  ) {
    return 'MultiBlank';
  }
  return undefined;
}

function asPromptString(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.question === 'string') return value.question;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.prompt === 'string') return value.prompt;
    if (typeof value.paragraph === 'string') return value.paragraph;
  }
  return '';
}

function resolveBody(q) {
  if (q.prompt != null) return q.prompt;
  if (q.payload != null) return q.payload;
  if (q.question != null && typeof q.question === 'object') return q.question;
  return null;
}

function parseChoiceOptions(rawOpts) {
  /** @type {string[]} */
  const optionLetters = [];
  /** @type {string[]} */
  const options = [];

  const isChoiceLetter = (raw) => {
    const s = String(raw || '').trim();
    return /^[A-D]$/i.test(s) || /^(true|false)$/i.test(s);
  };

  const optionTextFromObject = (opt, fallbackLetter) => {
    if (!opt || typeof opt !== 'object') {
      return String(opt ?? fallbackLetter ?? '');
    }
    const text = String(
      opt.text ??
        opt.label ??
        opt.value ??
        opt.option ??
        opt.Text ??
        opt.Label ??
        opt.Value ??
        '',
    ).trim();
    if (text) return text;
    return String(fallbackLetter || '');
  };

  if (rawOpts && typeof rawOpts === 'object' && !Array.isArray(rawOpts)) {
    // Only real choice keys (A–D / True / False). Ignore Id, Guid, metadata.
    const letters = Object.keys(rawOpts)
      .filter((k) => isChoiceLetter(k))
      .sort((a, b) => a.localeCompare(b));
    for (const letter of letters) {
      const text = String(rawOpts[letter] ?? '').trim() || letter;
      // Skip metadata values that look like ids/guids
      if (/^[0-9a-f-]{8,}$/i.test(text) && text === String(rawOpts[letter])) {
        continue;
      }
      optionLetters.push(String(letter));
      options.push(text);
    }
  } else if (Array.isArray(rawOpts)) {
    rawOpts.forEach((opt, idx) => {
      if (opt && typeof opt === 'object') {
        const letterRaw =
          opt.letter || opt.key || opt.Letter || opt.Key || null;
        const letter = isChoiceLetter(letterRaw)
          ? String(letterRaw)
          : String.fromCharCode(65 + idx);
        const text = optionTextFromObject(opt, letter);
        if (!text || /^id$/i.test(text)) return;
        optionLetters.push(letter);
        options.push(text);
      } else {
        const letter = String.fromCharCode(65 + idx);
        const text = String(opt ?? letter).trim();
        if (!text || /^id$/i.test(text)) return;
        optionLetters.push(letter);
        options.push(text);
      }
    });
  }
  return { optionLetters, options };
}

function countBlanks(text, fallback = 2) {
  const matches = String(text || '').match(/_{2,}|\{\{blank\}\}|\[blank\]/gi);
  return matches?.length ? matches.length : fallback;
}

function inferTopicFromStem(stem) {
  const prompt = String(stem || '');
  if (/photosynth|chlorophyll|light.*plant/i.test(prompt)) return 'Photosynthesis';
  if (/pollinat|pollen|bee/i.test(prompt)) return 'Pollination';
  if (/physical change|chemical change/i.test(prompt)) {
    return 'Physical & Chemical Changes';
  }
  if (/soil|nutrient|fertiliz/i.test(prompt)) return 'Soil Science';
  if (/water cycle|evaporat|condens/i.test(prompt)) return 'Water Cycle';
  if (/food chain|ecosystem|habitat/i.test(prompt)) return 'Ecology';
  return null;
}

/**
 * MultiBlank answers are joined with " | " for the API string field.
 */
export function serializeStudentAnswer(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).join(' | ');
  return String(value);
}

/**
 * True when the farm quiz UI can show this mapped / local question.
 * Choice types need options; ShortAnswer / MultiBlank only need a stem.
 */
export function isRenderableQuizQuestion(question) {
  if (!question) return false;
  const stem = String(question.prompt || question.question || '').trim();
  if (!stem) return false;
  const type =
    asQuestionType(question.questionType) ||
    asQuestionType(question.question_type);
  if (type === 'ShortAnswer' || type === 'MultiBlank') return true;
  if (type === 'TrueFalse') return true;
  return Array.isArray(question.options) && question.options.length > 0;
}

/**
 * Map Assessment Engine /next question into ScienceQuizModal shape.
 * Supports MCQ, TrueFalse, ShortAnswer, and MultiBlank.
 * Keeps letter → text for MCQ submit; never exposes correct answers.
 */
export function mapAssessmentQuestion(rawQuestion) {
  const q = stripSecrets(rawQuestion || {});
  const body = resolveBody(q);
  const bodyObj = body && typeof body === 'object' ? body : null;
  const payload = q.payload && typeof q.payload === 'object' ? q.payload : {};

  let questionType =
    asQuestionType(q.question_type) ||
    asQuestionType(q.questionType) ||
    asQuestionType(q.type) ||
    asQuestionType(bodyObj?.type) ||
    asQuestionType(bodyObj?.question_type) ||
    asQuestionType(payload.question_type) ||
    asQuestionType(payload.type);

  const paragraph =
    (bodyObj && typeof bodyObj.paragraph === 'string' && bodyObj.paragraph) ||
    (typeof payload.paragraph === 'string' && payload.paragraph) ||
    (typeof q.paragraph === 'string' && q.paragraph) ||
    '';

  const stem =
    (questionType === 'MultiBlank' && paragraph) ||
    asPromptString(body) ||
    asPromptString(q.question) ||
    asPromptString(q.prompt) ||
    asPromptString(payload.question) ||
    asPromptString(payload.prompt) ||
    paragraph ||
    '';

  const rawOpts = bodyObj?.options ?? payload.options ?? q.options;
  let { optionLetters, options } = parseChoiceOptions(rawOpts);

  if (!questionType) {
    questionType = options.length ? 'MCQ' : 'ShortAnswer';
  }

  if (questionType === 'TrueFalse') {
    optionLetters = ['True', 'False'];
    options = ['True', 'False'];
  }

  let blanks = q.blanks ?? payload.blanks ?? bodyObj?.blanks ?? undefined;
  if (questionType === 'MultiBlank') {
    const n = Number(blanks);
    blanks = Number.isFinite(n) && n > 0 ? Math.trunc(n) : countBlanks(paragraph || stem, 2);
  }

  const id = String(q.id || q.question_id || '');
  if (!id || !String(stem).trim()) {
    aeWarn('map /next skipped — missing id or stem', {
      questionType,
      id,
      stem,
      payloadKeys: Object.keys(payload),
      bodyKeys: bodyObj ? Object.keys(bodyObj) : [],
    });
    return null;
  }

  if (questionType === 'MCQ' && !options.length) {
    aeWarn('map /next skipped — MCQ has no options', {
      questionType,
      stem,
      payloadKeys: Object.keys(payload),
    });
    return null;
  }

  const mapped = {
    id,
    prompt: String(stem),
    question: String(stem),
    paragraph: paragraph || undefined,
    options,
    optionLetters,
    questionType,
    blanks: questionType === 'MultiBlank' ? blanks : undefined,
    topic: inferTopicFromStem(stem) || q.topic || payload.topic || null,
    remoteGrade: true,
    source: 'assessment_engine',
  };
  aeLog('mapped /next → quiz UI', {
    id: mapped.id,
    questionType: mapped.questionType,
    prompt: mapped.prompt?.slice?.(0, 80),
    optionCount: mapped.options?.length ?? 0,
  });
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

/** Start post-lesson (and first /next) so the first farm quiz is not blocked on C4. */
export async function warmupAssessmentSession() {
  const gen = ++fetchGeneration;
  try {
    const sid = await ensureSession();
    if (!sid || cachedQuestion || nextStopped || sessionComplete) return sid;
    if (gen !== fetchGeneration) return sid;
    const next = await fetchNextMapped();
    if (next && gen === fetchGeneration && !cachedQuestion) {
      cachedQuestion = next;
    }
    return sid;
  } catch (err) {
    aeWarn('warmup failed', err);
    return null;
  }
}

export function isAssessmentQuestion(questionData) {
  return Boolean(
    questionData?.remoteGrade || questionData?.source === 'assessment_engine',
  );
}

function isJsonPayload(contentType, data) {
  if (String(contentType || '').toLowerCase().includes('json')) return true;
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length);
}

/**
 * Once a host creates the session, stick to it.
 * Only explore all candidates when there is no activeBase yet (post-lesson).
 */
function basesToTry() {
  if (activeBase) return [activeBase];
  return getAssessmentBaseCandidates();
}

async function fetchWithBases(pathBuilder, { method = 'GET', body, label, timeoutMs } = {}) {
  const bases = basesToTry();
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : FETCH_TIMEOUT_MS;
  const tag = label || method;

  let lastError = null;
  for (const base of bases) {
    const url = `${base.replace(/\/+$/, '')}${pathBuilder()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
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
      const contentType = String(res.headers.get('content-type') || '');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        aeWarn(`${tag} ← ${res.status}`, { url, body: body ?? null, response: data });
        lastError = { status: res.status, data, base };
        if (res.status === 409) {
          return { ok: false, status: 409, data, base };
        }
        // Sticky host: do not spray other bases for session-bound calls.
        if (activeBase) {
          return { ok: false, status: res.status, data, base, lastError };
        }
        // First contact (post-lesson): skip dead proxies, try next candidate.
        if (res.status >= 400 && res.status < 500 && res.status !== 404) {
          return { ok: false, status: res.status, data, base, lastError };
        }
        continue;
      }
      if (!isJsonPayload(contentType, data)) {
        lastError = { status: res.status, data: 'non-json response', base };
        aeWarn(`${tag} skipped — not JSON`, { url, contentType });
        if (activeBase) {
          return { ok: false, status: res.status, data: null, base, lastError };
        }
        continue;
      }
      activeBase = base;
      aeLog(`${tag} ← ${res.status}`, { url, sticky: activeBase });
      return { ok: true, status: res.status, data, base };
    } catch (err) {
      lastError = { error: err, base };
      aeWarn(`${tag} failed`, {
        url,
        error: err?.name === 'AbortError'
          ? `timeout after ${timeout}ms`
          : String(err?.message || err),
      });
      if (activeBase) {
        return { ok: false, status: 0, data: null, base, lastError };
      }
    } finally {
      clearTimeout(timer);
    }
  }
  aeWarn('all bases failed', { label: tag, lastError });
  return { ok: false, status: 0, data: null, lastError };
}

async function postLesson(student) {
  const studentId = student?.id;
  if (!studentId) return null;

  /** @type {Record<string, unknown>} */
  const body = { student_id: String(studentId) };
  const grade = normalizeGrade(student);
  if (grade != null) {
    body.grade = grade;
  }
  // Only real catalog ids (G7_C2…). Never invent G{n}_C8 — omit so C2 uses C1.
  const chapterId = resolveChapterId(student);
  if (chapterId) {
    body.chapter_id = chapterId;
  }

  aeLog('POST /quizzes/post-lesson →', body);
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
    base: activeBase,
    max_questions: result.data?.max_questions,
    status: result.data?.status,
    chapter_id: chapterId || '(omitted — C2/C1 resolve)',
  });
  return sessionId;
}

async function ensureSession() {
  if (nextStopped || sessionComplete) return null;
  if (sessionId) return sessionId;
  if (ensurePromise) return ensurePromise;

  if (assessmentUnavailable) {
    const since = Date.now() - (ensureSession._failedAt || 0);
    if (since < FAIL_COOLDOWN_MS) return null;
    assessmentUnavailable = false;
  }

  ensurePromise = (async () => {
    const student = getCurrentStudent();
    const id = await postLesson(student);
    if (!id) {
      assessmentUnavailable = true;
      ensureSession._failedAt = Date.now();
      return null;
    }
    assessmentUnavailable = false;
    return id;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

async function fetchNextOnce() {
  const sid = sessionId;
  if (!sid) return { status: 'empty' };
  const result = await fetchWithBases(() => ASSESSMENT_PATHS.next(sid), {
    method: 'GET',
    label: `GET /quizzes/${sid}/next`,
  });

  if (result.status === 404) {
    aeWarn('/next 404 — Assessment Engine session was lost');
    sessionId = null;
    cachedQuestion = null;
    activeBase = null;
    return { status: 'lost' };
  }
  if (result.status === 409) {
    nextStopped = true;
    aeWarn('/next 409 — this session has no more items');
    return { status: 'stop' };
  }
  if (!result.ok) {
    aeWarn('/next failed', result.lastError || result.data);
    return { status: 'fail' };
  }

  const data = result.data || {};
  if (
    data.is_complete === true ||
    String(data.status || '').toLowerCase() === 'complete' ||
    String(data.status || '').toLowerCase() === 'completed'
  ) {
    sessionComplete = true;
    aeLog('/next session complete — no more engine questions');
    return { status: 'stop' };
  }

  const rawQ = data.question || data;
  const mapped = mapAssessmentQuestion(rawQ);
  if (!isRenderableQuizQuestion(mapped)) {
    aeWarn('/next could not map question into quiz UI — skipping item', {
      id: rawQ?.id,
      type: rawQ?.question_type || rawQ?.questionType,
    });
    return { status: 'skip' };
  }
  return { status: 'ok', question: mapped };
}

async function fetchNextMapped() {
  if (nextStopped || sessionComplete) return null;
  if (!sessionId && !cachedQuestion) return null;
  if (cachedQuestion) {
    const q = cachedQuestion;
    cachedQuestion = null;
    return q;
  }
  if (nextPromise) return nextPromise;

  nextPromise = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (nextStopped || sessionComplete || !sessionId) return null;
      const result = await fetchNextOnce();
      if (result.status === 'ok') return result.question;
      if (result.status === 'skip') continue;
      return null;
    }
    return null;
  })().finally(() => {
    nextPromise = null;
  });

  return nextPromise;
}

async function takeEngineQuestion() {
  const sid = await ensureSession();
  if (!sid) return null;
  const remote = await fetchNextMapped();
  return isRenderableQuizQuestion(remote) ? remote : null;
}

/**
 * Resolve the next science question from Assessment Engine /next.
 * One post-lesson per session; new post-lesson only when session ended or lost.
 */
export async function resolveScienceQuestion(_level, _avoidId, _mode = 'plant') {
  fetchGeneration += 1;

  if (nextStopped || sessionComplete) {
    aeLog('Assessment Engine session ended — starting a new post-lesson session');
    clearRuntime();
  }

  try {
    const remote = await takeEngineQuestion();
    if (remote) {
      aeLog('quiz will show Assessment Engine question', {
        id: remote.id,
        prompt: remote.prompt,
        questionType: remote.questionType,
      });
      return remote;
    }
    // Session may have been cleared by /next 404 inside fetchNextOnce — one retry only.
    if (!sessionId && !assessmentUnavailable && !nextStopped && !sessionComplete) {
      aeLog('session lost — one recovery post-lesson');
      const recovered = await takeEngineQuestion();
      if (recovered) return recovered;
    }
    aeWarn('Assessment Engine returned no usable question');
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
    return { ok: false, isCorrect: false, isComplete: false };
  }

  const body = {
    question_id: String(questionId),
    student_answer: serializeStudentAnswer(studentAnswer),
    time_taken_seconds: Number(timeTakenSeconds) || 0,
  };
  const result = await fetchWithBases(() => ASSESSMENT_PATHS.answer(sessionId), {
    method: 'POST',
    body,
    label: `POST /quizzes/${sessionId}/answer`,
    timeoutMs: ANSWER_TIMEOUT_MS,
  });

  if (!result.ok) {
    aeWarn('/answer failed', result.lastError || result.data);
    if (result.status === 404) {
      sessionId = null;
      cachedQuestion = null;
      activeBase = null;
    }
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
    const gen = fetchGeneration;
    void fetchNextMapped()
      .then((next) => {
        if (next && fetchGeneration === gen && !cachedQuestion) {
          cachedQuestion = next;
        }
      })
      .catch(() => {
        /* ignore prefetch errors */
      });
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

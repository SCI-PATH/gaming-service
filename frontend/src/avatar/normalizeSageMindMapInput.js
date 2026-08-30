/**
 * Shared SAGE mind-map input normalizer.
 *
 * MCQ, True/False, Fill-in-the-Blank, and Typed Answer emit the same analysis
 * shape. Fill-in-the-Blank is NEVER treated as an MCQ. Typed Answer is NEVER
 * treated as Fill-in-the-Blank: the full student sentence is preserved.
 */
import { inferConceptFromText, resolveTopicKey } from './conceptMaps.js';
import { isGradeStatusText } from './kidFriendlySpeech.js';

export const SAGE_QUESTION_TYPES = {
  MCQ: 'MCQ',
  TrueFalse: 'TrueFalse',
  FILL_IN_THE_BLANK: 'FILL_IN_THE_BLANK',
  TYPED_ANSWER: 'TYPED_ANSWER',
  ShortAnswer: 'TYPED_ANSWER',
};

/** SAGE / Grok-facing types. Fill-in and typed stay distinct from MCQ. */
export const SAGE_ASSESSMENT_TYPES = {
  MCQ: 'MCQ',
  TrueFalse: 'TrueFalse',
  FillInTheBlank: 'FillInTheBlank',
  ShortAnswer: 'ShortAnswer',
};

export function toSageAssessmentType(kind) {
  const raw = String(kind || '')
    .replace(/[_\s-]/g, '')
    .toLowerCase();
  if (
    raw === 'multiblank' ||
    raw === 'fillintheblank' ||
    raw === 'fillblank' ||
    raw === 'fillintheblanks' ||
    raw === 'cloze'
  ) {
    return SAGE_ASSESSMENT_TYPES.FillInTheBlank;
  }
  if (
    raw === 'shortanswer' ||
    raw === 'typedanswer' ||
    raw === 'typed' ||
    raw === 'answertyping' ||
    raw === 'constructedresponse' ||
    raw === 'freetext' ||
    raw === 'openended'
  ) {
    return SAGE_ASSESSMENT_TYPES.ShortAnswer;
  }
  if (raw === 'truefalse' || raw === 'tf' || raw === 'boolean') {
    return SAGE_ASSESSMENT_TYPES.TrueFalse;
  }
  if (raw === 'mcq' || raw === 'multiplechoice') {
    return SAGE_ASSESSMENT_TYPES.MCQ;
  }
  if (kind === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK) {
    return SAGE_ASSESSMENT_TYPES.FillInTheBlank;
  }
  if (kind === SAGE_QUESTION_TYPES.TYPED_ANSWER) {
    return SAGE_ASSESSMENT_TYPES.ShortAnswer;
  }
  if (kind === SAGE_QUESTION_TYPES.TrueFalse) {
    return SAGE_ASSESSMENT_TYPES.TrueFalse;
  }
  return SAGE_ASSESSMENT_TYPES.MCQ;
}

const FILL_IN_ALIASES = new Set([
  'multiblank',
  'fillintheblank',
  'fillblank',
  'fillintheblanks',
  'cloze',
]);

const TYPED_ANSWER_ALIASES = new Set([
  'shortanswer',
  'typedanswer',
  'typed',
  'answertyping',
  'constructedresponse',
  'freetext',
  'openended',
]);

function compactSpaces(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return compactSpaces(opt);
  return compactSpaces(
    opt.text || opt.label || opt.value || opt.option || '',
  );
}

function explicitKind(raw) {
  const explicit = String(raw || '')
    .replace(/[_\s-]/g, '')
    .toLowerCase();
  if (!explicit) return null;
  if (explicit === 'mcq' || explicit === 'multiplechoice') {
    return SAGE_QUESTION_TYPES.MCQ;
  }
  if (
    explicit === 'truefalse' ||
    explicit === 'tf' ||
    explicit === 'boolean'
  ) {
    return SAGE_QUESTION_TYPES.TrueFalse;
  }
  if (FILL_IN_ALIASES.has(explicit)) {
    return SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK;
  }
  if (TYPED_ANSWER_ALIASES.has(explicit)) {
    return SAGE_QUESTION_TYPES.TYPED_ANSWER;
  }
  return null;
}

/**
 * Normalize Fill-in-the-Blank / typed text for SAGE.
 * Trims, collapses whitespace, lowercases. Does NOT synonym-replace concepts.
 */
export function normalizeFillInAnswerText(raw) {
  return compactSpaces(raw)
    .replace(/[.,;:]+$/g, '')
    .toLowerCase();
}

export function isFillInQuestionType(typeOrInput) {
  if (typeOrInput && typeof typeOrInput === 'object') {
    return detectSageQuestionKind(typeOrInput) === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK;
  }
  return explicitKind(typeOrInput) === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK;
}

export function isTypedAnswerQuestionType(typeOrInput) {
  if (typeOrInput && typeof typeOrInput === 'object') {
    return detectSageQuestionKind(typeOrInput) === SAGE_QUESTION_TYPES.TYPED_ANSWER;
  }
  return explicitKind(typeOrInput) === SAGE_QUESTION_TYPES.TYPED_ANSWER;
}

/** Fill-in and Typed Answer keep the student's own text (never MCQ options). */
export function usesSageFreeTextAnswer(typeOrInput) {
  return isFillInQuestionType(typeOrInput) || isTypedAnswerQuestionType(typeOrInput);
}

export function detectSageQuestionKind(input = {}) {
  const q = input.questionData && typeof input.questionData === 'object'
    ? input.questionData
    : {};
  const fromExplicit =
    explicitKind(input.questionType) ||
    explicitKind(input.question_type) ||
    explicitKind(input.type) ||
    explicitKind(q.questionType) ||
    explicitKind(q.question_type) ||
    explicitKind(q.type);
  if (fromExplicit) return fromExplicit;

  const opts = Array.isArray(input.options)
    ? input.options
    : Array.isArray(q.options)
      ? q.options
      : [];
  const labels = opts.map(optionText).filter(Boolean);
  if (
    labels.length === 2 &&
    labels.every((o) => /^(true|false|t|f|yes|no)$/i.test(o))
  ) {
    return SAGE_QUESTION_TYPES.TrueFalse;
  }
  if (labels.length >= 3) return SAGE_QUESTION_TYPES.MCQ;

  const prompt = String(
    input.question ||
      input.prompt ||
      input.questionText ||
      q.prompt ||
      q.question ||
      q.paragraph ||
      '',
  );
  if (/_{2,}|\{\{blank\}\}|\[blank\]|fill in|blank/i.test(prompt)) {
    return SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK;
  }
  if (
    /^(true|false|t|f|yes|no)$/i.test(compactSpaces(input.studentAnswer)) &&
    /^(true|false|t|f|yes|no)$/i.test(compactSpaces(input.correctAnswer))
  ) {
    return SAGE_QUESTION_TYPES.TrueFalse;
  }
  if (labels.length === 2) return SAGE_QUESTION_TYPES.MCQ;
  return SAGE_QUESTION_TYPES.MCQ;
}

function splitFillInParts(raw) {
  const s = compactSpaces(raw);
  if (!s) return [];
  const unlabeled = s
    .replace(/blank\s*\d+\s*:\s*/gi, '')
    .replace(/\s*·\s*/g, ' | ');
  if (/\s*\|\s*/.test(unlabeled)) {
    return unlabeled.split(/\s*\|\s*/).map((part) => normalizeFillInAnswerText(part));
  }
  return [normalizeFillInAnswerText(unlabeled)];
}

/**
 * Pull the student's actual typed value. Never reads options / selectedIndex.
 */
export function extractFillInStudentAnswer(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const candidates = [
    source.blanks,
    source.studentAnswer,
    source.typedAnswer,
    source.inputAnswer,
    source.blankAnswer,
    source.userAnswer,
    source.response,
    source.selectedText,
    q.studentAnswer,
    q.blanks,
    q.typedAnswer,
    q.inputAnswer,
    q.blankAnswer,
  ];

  for (const value of candidates) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      const parts = value.map((item) => normalizeFillInAnswerText(item));
      while (parts.length && !parts[parts.length - 1]) parts.pop();
      if (!parts.length) continue;
      return parts.length === 1 ? parts[0] : parts.join(' | ');
    }
    if (typeof value === 'object') continue;
    const joined = splitFillInParts(value)
      .filter((part, idx, arr) => part || idx < arr.length - 1);
    while (joined.length && !joined[joined.length - 1]) joined.pop();
    if (!joined.length) continue;
    return joined.length === 1 ? joined[0] : joined.join(' | ');
  }
  return '';
}

function listFromUnknown(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeFillInAnswerText(item))
      .filter(Boolean);
  }
  if (typeof raw === 'object') {
    return Object.keys(raw)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => normalizeFillInAnswerText(raw[key]))
      .filter(Boolean);
  }
  return splitFillInParts(raw).filter(Boolean);
}

function stripGraderPrefix(raw) {
  let s = compactSpaces(raw);
  if (!s) return '';
  s = s.replace(/^incorrect\.\s*/i, '');
  s = s.replace(/^the blanks? are:\s*/i, '');
  s = s.replace(/^expected blanks?:\s*/i, '');
  s = s.replace(/^right answer is\s*/i, '');
  return s;
}

/**
 * Canonical / accepted Fill-in-the-Blank answers from grade or question payload.
 * Preserves multiple accepted answers when the engine already provides them.
 */
export function extractFillInCorrectAnswer(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const grade =
    source.grade ||
    source.gradePayload ||
    q.grade ||
    q.gradePayload ||
    null;

  const acceptedBags = [
    source.acceptedAnswers,
    source.accepted_answers,
    q.acceptedAnswers,
    q.accepted_answers,
    source.answers,
    q.answers,
    grade?.acceptedAnswers,
    grade?.accepted_answers,
    grade?.answers,
  ];

  let acceptedAnswers = [];
  for (const bag of acceptedBags) {
    const list = listFromUnknown(bag);
    if (list.length) {
      acceptedAnswers = list;
      break;
    }
  }

  const missed = listFromUnknown(
    source.missed_blanks ||
      source.missedBlanks ||
      grade?.missed_blanks ||
      grade?.missedBlanks ||
      q.missed_blanks,
  );

  const fromExpected = [
    source.detailed_explanation,
    source.detailedExplanation,
    grade?.detailed_explanation,
    grade?.detailedExplanation,
    source.feedback,
    grade?.feedback,
  ]
    .map((text) => compactSpaces(text))
    .map((text) => {
      const match = text.match(/(?:expected blanks?|blanks? are):\s*(.+)$/i);
      return match?.[1] ? stripGraderPrefix(match[1]) : '';
    })
    .find(Boolean);

  const direct = [
    source.canonicalCorrectAnswer,
    source.correctAnswer,
    source.correct_answer,
    q.canonicalCorrectAnswer,
    q.correctAnswer,
    q.correct_answer,
    grade?.correct_answer,
    grade?.correctAnswer,
  ]
    .map((value) => {
      if (Array.isArray(value)) return listFromUnknown(value).join(' | ');
      const cleaned = stripGraderPrefix(value);
      if (!cleaned || isGradeStatusText(cleaned)) return '';
      return cleaned;
    })
    .find(Boolean);

  const expectedList = fromExpected ? listFromUnknown(fromExpected) : [];
  const directList = direct ? listFromUnknown(direct) : [];
  if (!acceptedAnswers.length) {
    if (directList.length && directList.length >= missed.length) {
      acceptedAnswers = directList;
    } else if (expectedList.length && expectedList.length >= missed.length) {
      acceptedAnswers = expectedList;
    } else if (directList.length) {
      acceptedAnswers = directList;
    } else if (expectedList.length) {
      acceptedAnswers = expectedList;
    } else if (missed.length) {
      acceptedAnswers = missed;
    }
  }

  const uniqueAccepted = [];
  for (const item of acceptedAnswers) {
    if (!uniqueAccepted.includes(item)) uniqueAccepted.push(item);
  }

  const canonicalCorrectAnswer = uniqueAccepted[0] || '';
  const correctAnswer =
    uniqueAccepted.length > 1
      ? uniqueAccepted.join(' | ')
      : canonicalCorrectAnswer;

  return {
    correctAnswer: correctAnswer || '',
    canonicalCorrectAnswer: canonicalCorrectAnswer || correctAnswer || '',
    acceptedAnswers: uniqueAccepted,
  };
}

function listKeywords(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => compactSpaces(item)).filter(Boolean);
  }
  if (typeof raw === 'object') {
    return Object.values(raw)
      .map((item) => compactSpaces(item))
      .filter(Boolean);
  }
  return compactSpaces(raw)
    .split(/\s*,\s*/)
    .map((item) => compactSpaces(item))
    .filter(Boolean);
}

/**
 * Student's complete typed sentence. Preserve wording; do not lowercase,
 * split on blanks, or rewrite into MCQ options.
 */
export function extractTypedStudentAnswer(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const candidates = [
    source.studentAnswer,
    source.typedAnswer,
    source.inputAnswer,
    source.response,
    source.selectedText,
    q.studentAnswer,
    q.typedAnswer,
    q.inputAnswer,
  ];

  for (const value of candidates) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      const joined = value.map((item) => compactSpaces(item)).filter(Boolean).join(' ');
      if (joined) return joined;
      continue;
    }
    if (typeof value === 'object') continue;
    const text = compactSpaces(value);
    if (text) return text;
  }
  return '';
}

/**
 * Model / ideal answer for Typed Answer. Never reads MCQ options.
 */
export function extractTypedCorrectAnswer(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const grade =
    source.grade ||
    source.gradePayload ||
    q.grade ||
    q.gradePayload ||
    null;

  const direct = [
    source.canonicalCorrectAnswer,
    source.ideal_answer,
    source.idealAnswer,
    source.correctAnswer,
    source.correct_answer,
    q.ideal_answer,
    q.idealAnswer,
    q.correctAnswer,
    q.correct_answer,
    grade?.ideal_answer,
    grade?.idealAnswer,
    grade?.grade?.ideal_answer,
    grade?.grade?.idealAnswer,
    grade?.model_answer,
    grade?.correct_answer,
    grade?.correctAnswer,
  ]
    .map((value) => {
      if (Array.isArray(value)) {
        return value.map((item) => compactSpaces(item)).filter(Boolean).join(' ');
      }
      const cleaned = compactSpaces(value);
      if (!cleaned || isGradeStatusText(cleaned)) return '';
      return cleaned;
    })
    .find(Boolean);

  return {
    correctAnswer: direct || '',
    canonicalCorrectAnswer: direct || '',
    acceptedAnswers: direct ? [direct] : [],
  };
}

function typedCompleteness(source, isCorrect) {
  if (isCorrect) return 'correct';
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const grade =
    source.grade ||
    source.gradePayload ||
    q.grade ||
    q.gradePayload ||
    {};
  const score = Number(
    source.accuracyScore ??
      source.accuracy_score ??
      grade.accuracy_score ??
      grade.accuracyScore,
  );
  const missing = listKeywords(
    source.missingKeywords ||
      source.missing_keywords ||
      grade.missing_keywords ||
      grade.missingKeywords,
  );
  const category = String(
    source.errorCategory ||
      source.error_category ||
      grade.error_category ||
      grade.errorCategory ||
      '',
  ).toUpperCase();
  if (category.includes('MISSING_KEYWORD') && missing.length) return 'partial';
  if (Number.isFinite(score) && score >= 0.35 && score < 0.8) return 'partial';
  if (source.completeness === 'partial' || q.completeness === 'partial') return 'partial';
  return 'incorrect';
}

function stripChoiceLetterPrefix(text) {
  return compactSpaces(text)
    .replace(/^(?:option\s*)?\(?[A-Da-d]\)?\s*[.)]\s+/i, '')
    .replace(/^(?:option\s*)?[A-Da-d]\s*[—–\-:]+\s+/i, '');
}

function letterOnlyIndex(text) {
  const m = compactSpaces(text).match(/^(?:option\s*)?([A-Da-d])(?:[.)]\s*)?$/i);
  if (!m) return -1;
  return m[1].toUpperCase().charCodeAt(0) - 65;
}

function resolveChoiceToOptionText(trimmed, options) {
  if (!trimmed) return '';
  const idx = letterOnlyIndex(trimmed);
  if (idx >= 0 && options[idx]) {
    return optionText(options[idx]) || compactSpaces(options[idx]?.text);
  }
  const lead = trimmed.match(/^[A-Da-d](?:[.)]|[\s]*[—–\-:]+)\s+(.+)$/);
  if (lead) return compactSpaces(lead[1]);
  return trimmed;
}

/**
 * Grok-facing label: "C — Resistor" when options are known, else the raw answer.
 * Used for teaching context, not for deciding correctness.
 */
export function formatGroundTruthChoice(raw, options = []) {
  const labels = (Array.isArray(options) ? options : [])
    .map((opt) => optionText(opt))
    .filter(Boolean);
  const trimmed = compactSpaces(raw);
  if (!trimmed) return '';

  const letterOnly = trimmed.match(/^(?:option\s*)?([A-Da-d])(?:[.)]\s*)?$/i);
  if (letterOnly && labels.length) {
    const idx = letterOnly[1].toUpperCase().charCodeAt(0) - 65;
    const text = stripChoiceLetterPrefix(labels[idx] || '');
    if (text) return `${letterOnly[1].toUpperCase()} — ${text}`;
  }

  const lead = trimmed.match(/^([A-Da-d])[.)\s:—–-]+(.+)$/);
  if (lead && compactSpaces(lead[2])) {
    return `${lead[1].toUpperCase()} — ${compactSpaces(lead[2])}`;
  }

  const idx = labels.findIndex((label) => {
    const a = stripChoiceLetterPrefix(label).toLowerCase();
    const b = stripChoiceLetterPrefix(trimmed).toLowerCase();
    if (!a || !b) return false;
    return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
  });
  if (idx >= 0) {
    return `${String.fromCharCode(65 + idx)} — ${stripChoiceLetterPrefix(labels[idx])}`;
  }
  return trimmed;
}

function extractChoiceStudentAnswer(source, options) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const direct =
    source.selectedText ||
    source.selectedOptionText ||
    (typeof source.studentAnswer === 'string' ? source.studentAnswer : '') ||
    (typeof q.studentAnswer === 'string' ? q.studentAnswer : '') ||
    '';
  const trimmed = compactSpaces(direct);
  if (trimmed) {
    return resolveChoiceToOptionText(trimmed, options) || trimmed;
  }

  const idx =
    typeof source.selectedIndex === 'number'
      ? source.selectedIndex
      : typeof q.selectedIndex === 'number'
        ? q.selectedIndex
        : -1;
  if (idx >= 0 && options[idx]) return optionText(options[idx]);
  return '';
}

function extractChoiceCorrectAnswer(source, options) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const direct =
    source.correctAnswer ||
    source.correct_answer ||
    q.correctAnswer ||
    q.correct_answer ||
    '';
  const trimmed = compactSpaces(
    typeof direct === 'string' ? direct : optionText(direct),
  );
  if (trimmed && !isGradeStatusText(trimmed)) {
    return resolveChoiceToOptionText(trimmed, options) || trimmed;
  }

  const correctIndex =
    typeof source.correctIndex === 'number'
      ? source.correctIndex
      : typeof q.correctIndex === 'number'
        ? q.correctIndex
        : options.findIndex((opt) => opt && opt.isCorrect);
  if (correctIndex >= 0 && options[correctIndex]) {
    return optionText(options[correctIndex]);
  }
  const marked = options.find((opt) => opt && opt.isCorrect);
  return marked ? optionText(marked) : '';
}

function resolvePrompt(source) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  return compactSpaces(
    source.question ||
      source.prompt ||
      source.questionText ||
      q.paragraph ||
      q.prompt ||
      q.question ||
      '',
  );
}

function resolveTopic(source, prompt) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  return (
    inferConceptFromText(prompt) ||
    inferConceptFromText(source.skill || q.skill || source.chapter_name || q.chapter_name) ||
    resolveTopicKey(source.topic || q.topic) ||
    source.topic ||
    q.topic ||
    'Science'
  );
}

/**
 * Common SAGE / mind-map input for every farm question type.
 *
 * @returns {{
 *   questionType: string,
 *   question: string,
 *   studentAnswer: string,
 *   correctAnswer: string,
 *   canonicalCorrectAnswer: string,
 *   acceptedAnswers: string[],
 *   isCorrect: boolean,
 *   topic: string,
 *   concept: string,
 *   verifiedKnowledge: array,
 *   frustrationScore: number|null,
 *   options: string[],
 *   correctIndex: number,
 *   misconception: string,
 * }}
 */
export function normalizeSageMindMapInput(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const questionType = detectSageQuestionKind(source);
  const question = resolvePrompt(source);
  const topic = resolveTopic(source, question);
  const concept = compactSpaces(
    source.concept ||
      q.concept ||
      q.sub_concept ||
      q.skill ||
      topic,
  );
  const frustrationScore = Number(
    source.frustrationScore ?? q.frustrationScore ?? source.frustration_score,
  );
  const verifiedKnowledge = Array.isArray(source.verifiedKnowledge)
    ? source.verifiedKnowledge
    : Array.isArray(q.verifiedKnowledge)
      ? q.verifiedKnowledge
      : [];

  const rawOptions = Array.isArray(source.options)
    ? source.options
    : Array.isArray(q.options)
      ? q.options
      : [];
  const options = rawOptions.map((opt, idx) => {
    if (typeof opt === 'string') {
      return { text: opt, isCorrect: idx === (source.correctIndex ?? q.correctIndex) };
    }
    return {
      text: optionText(opt),
      isCorrect: Boolean(opt?.isCorrect) || idx === (source.correctIndex ?? q.correctIndex),
    };
  });

  const isCorrect = Boolean(
    source.isCorrect ?? source.is_correct ?? q.isCorrect ?? false,
  );

  if (questionType === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK) {
    const studentAnswer = extractFillInStudentAnswer(source);
    const correct = extractFillInCorrectAnswer(source);
    return {
      questionType: SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK,
      question,
      studentAnswer,
      correctAnswer: correct.correctAnswer,
      canonicalCorrectAnswer: correct.canonicalCorrectAnswer,
      acceptedAnswers: correct.acceptedAnswers,
      isCorrect,
      completeness: isCorrect ? 'correct' : 'incorrect',
      topic,
      concept,
      misconception: '',
      verifiedKnowledge,
      frustrationScore: Number.isFinite(frustrationScore) ? frustrationScore : null,
      options: [],
      correctIndex: -1,
    };
  }

  if (questionType === SAGE_QUESTION_TYPES.TYPED_ANSWER) {
    const studentAnswer = extractTypedStudentAnswer(source);
    const correct = extractTypedCorrectAnswer(source);
    const completeness = typedCompleteness(source, isCorrect);
    const grade =
      source.grade ||
      source.gradePayload ||
      q.grade ||
      q.gradePayload ||
      {};
    const missingKeywords = listKeywords(
      source.missingKeywords ||
        source.missing_keywords ||
        grade.missing_keywords ||
        grade.missingKeywords,
    );
    const accuracyScore = Number(
      source.accuracyScore ??
        source.accuracy_score ??
        grade.accuracy_score ??
        grade.accuracyScore,
    );
    const errorCategory = compactSpaces(
      source.errorCategory ||
        source.error_category ||
        grade.error_category ||
        grade.errorCategory ||
        '',
    );
    return {
      questionType: SAGE_QUESTION_TYPES.TYPED_ANSWER,
      question,
      studentAnswer,
      correctAnswer: correct.correctAnswer,
      canonicalCorrectAnswer: correct.canonicalCorrectAnswer,
      acceptedAnswers: correct.acceptedAnswers,
      isCorrect,
      completeness,
      missingKeywords,
      accuracyScore: Number.isFinite(accuracyScore) ? accuracyScore : null,
      errorCategory: errorCategory || null,
      topic,
      concept,
      misconception: compactSpaces(source.misconception || q.misconception || ''),
      verifiedKnowledge,
      frustrationScore: Number.isFinite(frustrationScore) ? frustrationScore : null,
      options: [],
      correctIndex: -1,
    };
  }

  const studentAnswer = extractChoiceStudentAnswer(source, options);
  const correctAnswer = extractChoiceCorrectAnswer(source, options);
  const correctIndex =
    typeof source.correctIndex === 'number'
      ? source.correctIndex
      : typeof q.correctIndex === 'number'
        ? q.correctIndex
        : options.findIndex((opt) => opt.isCorrect);

  return {
    questionType,
    question,
    studentAnswer,
    correctAnswer,
    canonicalCorrectAnswer: correctAnswer,
    acceptedAnswers: correctAnswer ? [correctAnswer] : [],
    isCorrect,
    completeness: isCorrect ? 'correct' : 'incorrect',
    topic,
    concept,
    misconception: '',
    verifiedKnowledge,
    frustrationScore: Number.isFinite(frustrationScore) ? frustrationScore : null,
    options: options.map((opt) => opt.text).filter(Boolean),
    correctIndex,
  };
}

/**
 * One SAGE assessment object for every farm question type.
 * MCQ letters become "C — Resistor" when options exist. True/False stays
 * True/False. Fill-in and typed keep the student's actual text.
 */
export function buildSageAssessment(source = {}) {
  const normalized = normalizeSageMindMapInput(source);
  const questionType = toSageAssessmentType(normalized.questionType);
  const options = Array.isArray(normalized.options) ? normalized.options : [];
  const studentConcept = compactSpaces(normalized.studentAnswer);
  const correctConcept = compactSpaces(
    normalized.correctAnswer || normalized.canonicalCorrectAnswer,
  );
  const studentAnswer =
    questionType === SAGE_ASSESSMENT_TYPES.MCQ
      ? formatGroundTruthChoice(studentConcept, options) || studentConcept
      : studentConcept;
  const correctAnswer =
    questionType === SAGE_ASSESSMENT_TYPES.MCQ
      ? formatGroundTruthChoice(correctConcept, options) || correctConcept
      : correctConcept;

  return {
    questionText: compactSpaces(normalized.question),
    questionType,
    studentAnswer,
    correctAnswer,
    isCorrect: Boolean(normalized.isCorrect),
    options:
      questionType === SAGE_ASSESSMENT_TYPES.MCQ ||
      questionType === SAGE_ASSESSMENT_TYPES.TrueFalse
        ? options
        : [],
    studentConcept,
    correctConcept,
    completeness: normalized.completeness || (normalized.isCorrect ? 'correct' : 'incorrect'),
    missingKeywords: normalized.missingKeywords || [],
    acceptedAnswers: normalized.acceptedAnswers || [],
    missedBlanks: source.missedBlanks || source.missed_blanks || [],
  };
}

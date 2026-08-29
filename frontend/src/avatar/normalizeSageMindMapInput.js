/**
 * Shared SAGE mind-map input normalizer.
 *
 * MCQ, True/False, and Fill-in-the-Blank all emit the same analysis shape.
 * Fill-in-the-Blank is NEVER treated as an MCQ: no selectedOption / options[i].
 */
import { inferConceptFromText, resolveTopicKey } from './conceptMaps.js';
import { isGradeStatusText } from './kidFriendlySpeech.js';

export const SAGE_QUESTION_TYPES = {
  MCQ: 'MCQ',
  TrueFalse: 'TrueFalse',
  FILL_IN_THE_BLANK: 'FILL_IN_THE_BLANK',
  ShortAnswer: 'ShortAnswer',
};

const FILL_IN_ALIASES = new Set([
  'multiblank',
  'fillintheblank',
  'fillblank',
  'fillintheblanks',
  'cloze',
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
  if (explicit === 'shortanswer') return SAGE_QUESTION_TYPES.ShortAnswer;
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

  if (!acceptedAnswers.length && missed.length) {
    acceptedAnswers = missed;
  }
  if (!acceptedAnswers.length && fromExpected) {
    acceptedAnswers = listFromUnknown(fromExpected);
  }
  if (!acceptedAnswers.length && direct) {
    acceptedAnswers = listFromUnknown(direct);
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
  if (trimmed) return trimmed;

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
  if (trimmed && !isGradeStatusText(trimmed)) return trimmed;

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

  if (
    questionType === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK ||
    questionType === SAGE_QUESTION_TYPES.ShortAnswer
  ) {
    const studentAnswer = extractFillInStudentAnswer(source);
    const correct = extractFillInCorrectAnswer(source);
    return {
      questionType:
        questionType === SAGE_QUESTION_TYPES.ShortAnswer
          ? SAGE_QUESTION_TYPES.ShortAnswer
          : SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK,
      question,
      studentAnswer,
      correctAnswer: correct.correctAnswer,
      canonicalCorrectAnswer: correct.canonicalCorrectAnswer,
      acceptedAnswers: correct.acceptedAnswers,
      isCorrect,
      topic,
      concept,
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
    topic,
    concept,
    verifiedKnowledge,
    frustrationScore: Number.isFinite(frustrationScore) ? frustrationScore : null,
    options: options.map((opt) => opt.text).filter(Boolean),
    correctIndex,
  };
}

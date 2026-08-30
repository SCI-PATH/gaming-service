/**
 * Unified assessment → mind-map pipeline.
 *
 * Assessment Result → Normalize Question/Answers → Identify Exact Miss
 * → Optional catalog enrichment → Lesson → Mind Map → Validate
 *
 * The assessment engine is the only source of truth for correctAnswer.
 * Catalog / regex / Groq may enrich explanations, never replace the key.
 */
import {
  SAGE_QUESTION_TYPES,
  SAGE_ASSESSMENT_TYPES,
  detectSageQuestionKind,
  isFillInQuestionType,
  isTypedAnswerQuestionType,
  normalizeSageMindMapInput,
  toSageAssessmentType,
} from './normalizeSageMindMapInput.js';
import {
  composeFiveStepLesson,
  looksLikeSymbolicTypedAnswer,
  scienceKeyIdea,
  validateStructuredLesson,
} from './explainMisconception.js';

export { SAGE_QUESTION_TYPES, SAGE_ASSESSMENT_TYPES };

export function compactText(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function answersEquivalent(a, b) {
  const left = compactText(a)
    .toLowerCase()
    .replace(/[.,;:]+$/g, '');
  const right = compactText(b)
    .toLowerCase()
    .replace(/[.,;:]+$/g, '');
  return Boolean(left) && left === right;
}

export function splitAnswerParts(raw) {
  const s = compactText(raw)
    .replace(/blank\s*\d+\s*:\s*/gi, '')
    .replace(/\s*·\s*/g, ' | ');
  if (!s) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => compactText(item));
  }
  if (/\s*\|\s*/.test(s)) {
    return s.split(/\s*\|\s*/).map((part) => compactText(part));
  }
  return [s];
}

function missedBlankMap(raw) {
  if (raw == null || raw === '') return {};
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((item, i) => {
      if (item && typeof item === 'object') {
        const idx = Number(item.blankIndex ?? item.index ?? i);
        const key = Number.isFinite(idx) && idx > 0 ? idx - 1 : i;
        out[key] = compactText(item.correctAnswer || item.correct || item.value);
      } else {
        out[i] = compactText(item);
      }
    });
    return out;
  }
  if (typeof raw === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const idx = Number(key);
      if (!Number.isFinite(idx)) continue;
      out[idx] = compactText(value);
    }
    return out;
  }
  return {};
}

function sourceGrade(source = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  return (
    source.grade ||
    source.gradePayload ||
    q.grade ||
    q.gradePayload ||
    {}
  );
}

/**
 * Align student blanks with the engine key. One entry per missed blank.
 */
export function alignFillInMisses(source = {}, normalized = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const grade = sourceGrade(source);
  const missedRaw =
    source.missedBlanks ||
    source.missed_blanks ||
    grade.missed_blanks ||
    grade.missedBlanks ||
    q.missed_blanks ||
    q.missedBlanks;
  const missedMap = missedBlankMap(missedRaw);
  const studentParts = splitAnswerParts(normalized.studentAnswer || source.studentAnswer);
  const fromAccepted = Array.isArray(normalized.acceptedAnswers)
    ? normalized.acceptedAnswers.filter(Boolean)
    : [];
  const correctParts =
    fromAccepted.length > 1
      ? fromAccepted
      : splitAnswerParts(normalized.correctAnswer || source.correctAnswer);
  const hasMissedMap = Object.keys(missedMap).length > 0;
  if (
    !hasMissedMap &&
    studentParts.length <= 1 &&
    correctParts.length > 1
  ) {
    if (!answersEquivalent(normalized.studentAnswer, normalized.correctAnswer)) {
      return [
        {
          blankIndex: 1,
          studentAnswer: compactText(normalized.studentAnswer || source.studentAnswer),
          correctAnswer: compactText(normalized.correctAnswer),
        },
      ];
    }
    return [];
  }
  const indexes = new Set([
    ...Object.keys(missedMap).map(Number),
    ...studentParts.map((_, i) => i),
    ...correctParts.map((_, i) => i),
  ]);
  const max = indexes.size ? Math.max(...indexes, -1) + 1 : 0;
  const misses = [];
  for (let i = 0; i < max; i += 1) {
    const student = compactText(studentParts[i] || '');
    const expected = compactText(correctParts[i] || missedMap[i] || '');
    if (!student && !expected) continue;
    if (answersEquivalent(student, expected)) continue;
    if (hasMissedMap && missedMap[i] == null) continue;
    misses.push({
      blankIndex: i + 1,
      studentAnswer: student,
      correctAnswer: expected,
    });
  }
  if (!misses.length && (normalized.studentAnswer || normalized.correctAnswer)) {
    if (!answersEquivalent(normalized.studentAnswer, normalized.correctAnswer)) {
      misses.push({
        blankIndex: 1,
        studentAnswer: compactText(normalized.studentAnswer),
        correctAnswer: compactText(normalized.correctAnswer),
      });
    }
  }
  return misses.filter((row) => compactText(row.correctAnswer) || compactText(row.studentAnswer));
}

function questionIdOf(source = {}, normalized = {}) {
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  return (
    source.questionId ||
    source.id ||
    q.id ||
    q.questionId ||
    normalized.questionId ||
    null
  );
}

/**
 * Normalize any assessment result into one internal miss record.
 * Never infers a different correctAnswer from stem keywords.
 */
export function normalizeAssessmentMiss(source = {}) {
  const normalized = normalizeSageMindMapInput(source);
  const q = source.questionData && typeof source.questionData === 'object'
    ? source.questionData
    : {};
  const grade = sourceGrade(source);
  const questionType = normalized.questionType || detectSageQuestionKind(source);
  const sageType = toSageAssessmentType(questionType);
  const missedBlanks = isFillInQuestionType(questionType)
    ? alignFillInMisses(source, normalized)
    : [];
  const excerpt = compactText(
    source.excerpt || q.excerpt || source.context || q.context || '',
  );
  const chapter = compactText(
    source.chapter ||
      source.chapter_name ||
      q.chapter_name ||
      q.chapter ||
      '',
  );
  const subject = compactText(source.subject || q.subject || 'Science');
  return {
    questionId: questionIdOf(source, normalized),
    questionType,
    sageType,
    question: normalized.question,
    prompt: normalized.question,
    studentAnswer: normalized.studentAnswer,
    correctAnswer: normalized.correctAnswer,
    canonicalCorrectAnswer: normalized.canonicalCorrectAnswer || normalized.correctAnswer,
    acceptedAnswers: normalized.acceptedAnswers || [],
    missedBlanks,
    options: Array.isArray(normalized.options) ? normalized.options : [],
    explanation: compactText(
      source.explanation ||
        grade.detailed_explanation ||
        grade.detailedExplanation ||
        grade.feedback ||
        '',
    ),
    excerpt,
    subject,
    topic: normalized.topic || 'Science',
    chapter,
    isCorrect: Boolean(normalized.isCorrect),
    completeness: normalized.completeness || (normalized.isCorrect ? 'correct' : 'incorrect'),
    missingKeywords: normalized.missingKeywords || [],
    accuracyScore: normalized.accuracyScore ?? null,
    errorCategory: normalized.errorCategory || null,
    hint: compactText(source.hint || q.hint || ''),
    blankIndex: source.blankIndex || null,
  };
}

/**
 * One mind-map miss per question, except fill-in: one miss per missed blank.
 */
export function expandAssessmentMisses(miss) {
  if (!miss || miss.isCorrect) return [];
  if (answersEquivalent(miss.studentAnswer, miss.correctAnswer) && !miss.missedBlanks?.length) {
    return [];
  }
  const fillIn = isFillInQuestionType(miss.questionType);
  if (fillIn && miss.missedBlanks.length > 1) {
    return miss.missedBlanks.map((blank) => ({
      ...miss,
      questionId: miss.questionId
        ? `${miss.questionId}:blank-${blank.blankIndex}`
        : `${miss.question}:blank-${blank.blankIndex}`,
      studentAnswer: blank.studentAnswer,
      correctAnswer: blank.correctAnswer,
      canonicalCorrectAnswer: blank.correctAnswer,
      blankIndex: blank.blankIndex,
      missedBlanks: [blank],
    }));
  }
  if (fillIn && miss.missedBlanks.length === 1) {
    const blank = miss.missedBlanks[0];
    return [
      {
        ...miss,
        studentAnswer: blank.studentAnswer || miss.studentAnswer,
        correctAnswer: blank.correctAnswer || miss.correctAnswer,
        canonicalCorrectAnswer: blank.correctAnswer || miss.canonicalCorrectAnswer,
        blankIndex: blank.blankIndex || 1,
      },
    ];
  }
  return [miss];
}

export function collectAssessmentMisses(body = {}) {
  const raw = [];
  const attempts = body.attempts || body.sourceAttempts || [];
  if (Array.isArray(attempts)) {
    for (const a of attempts) {
      if (!a) continue;
      raw.push(a);
    }
  }
  const misc = body.misconceptions || [];
  if (Array.isArray(misc)) {
    for (const m of misc) {
      if (Array.isArray(m.attempts)) {
        for (const a of m.attempts) {
          raw.push({ ...a, topic: a.topic || m.topic });
        }
      }
    }
  }
  const seen = new Set();
  const expanded = [];
  for (const item of raw) {
    const miss = normalizeAssessmentMiss(item);
    if (!miss.question && !miss.correctAnswer) continue;
    for (const row of expandAssessmentMisses(miss)) {
      const key = `${row.question}|${row.studentAnswer}|${row.correctAnswer}|${row.blankIndex || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push(row);
    }
  }
  return expanded.slice(0, 12);
}

function clip(text, n = 160) {
  const s = compactText(text);
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
}

function typeLayout(questionType) {
  const sage = toSageAssessmentType(questionType);
  if (sage === SAGE_ASSESSMENT_TYPES.TrueFalse) return 'true_false';
  if (sage === SAGE_ASSESSMENT_TYPES.FillInTheBlank) return 'fill_in';
  if (sage === SAGE_ASSESSMENT_TYPES.ShortAnswer) return 'short_answer';
  return 'mcq';
}

function remapLessonForType(lesson, miss, voice = {}) {
  if (!lesson || !validateStructuredLesson(lesson)) return lesson;
  const layout = typeLayout(miss.questionType);
  const studentQuote = compactText(miss.studentAnswer) || lesson.studentAnswer?.concept;
  const correctQuote = compactText(miss.correctAnswer) || lesson.correctAnswer?.concept;
  const sections = Array.isArray(lesson.sections) ? lesson.sections.slice() : [];
  const byId = (id) => sections.find((s) => s.id === id);
  const your = byId('your_answer');
  const correct = byId('correct_answer');
  const diff = byId('difference');
  const connection = byId('connection');
  const check = byId('check');
  if (your) your.quote = studentQuote;
  if (correct) correct.quote = correctQuote;

  if (layout === 'true_false') {
    if (your) your.title = 'YOUR ANSWER';
    if (correct) correct.title = 'CORRECT ANSWER';
    if (diff) diff.title = 'WHY';
  }
  if (layout === 'fill_in' && miss.blankIndex) {
    if (your) your.title = `BLANK ${miss.blankIndex} — YOUR ANSWER`;
    if (correct) correct.title = `BLANK ${miss.blankIndex} — CORRECT`;
  }
  if (layout === 'short_answer') {
    const partial =
      miss.completeness === 'partial' ||
      (Array.isArray(miss.missingKeywords) && miss.missingKeywords.length);
    if (partial && your) {
      your.title = 'YOUR RESPONSE';
      const missing = (miss.missingKeywords || []).join(', ');
      const extra = [
        {
          id: 'what_right',
          title: 'WHAT YOU GOT RIGHT',
          body: clip(your.scientificDefinition || your.body, 220),
        },
        {
          id: 'what_missing',
          title: 'WHAT WAS MISSING',
          body: missing
            ? `Add: ${missing}.`
            : clip(diff?.keyScientificDifference || diff?.body, 220),
        },
      ];
      if (correct) correct.title = 'MODEL ANSWER';
      const kept = sections.filter((s) => s.id !== 'difference');
      const idx = kept.findIndex((s) => s.id === 'your_answer');
      kept.splice(idx + 1, 0, ...extra);
      lesson.sections = kept;
      lesson.layout = layout;
      return lesson;
    }
    if (your) your.title = 'YOUR RESPONSE';
    if (correct) correct.title = 'MODEL ANSWER';
  }
  lesson.layout = layout;
  if (connection) connection.title = 'KEY CONCEPT';
  if (check && voice?.omitCheck) {
    lesson.sections = sections.filter((s) => s.id !== 'check');
  }
  return lesson;
}

function deterministicWhy(miss) {
  const student = compactText(miss.studentAnswer) || 'that pick';
  const correct = compactText(miss.correctAnswer) || 'the scored idea';
  const q = compactText(miss.question);
  const sage = toSageAssessmentType(miss.questionType);
  if (sage === SAGE_ASSESSMENT_TYPES.TrueFalse) {
    const rightTrue = /^(true|t|yes)$/i.test(correct);
    return rightTrue
      ? `The statement is true. “${student}” does not match the science in the sentence.`
      : `The statement is false. “${student}” would treat an incorrect claim as true.`;
  }
  if (looksLikeSymbolicTypedAnswer(student)) {
    return `This question is asking for “${correct}”.`;
  }
  return `“${student}” can be a real science idea, but it does not answer this question${q ? ` (“${clip(q, 90)}”)` : ''}. “${correct}” is the idea the assessment engine scored.`;
}

function deterministicCorrectWhy(miss) {
  const correct = compactText(miss.correctAnswer);
  if (!correct) return scienceKeyIdea(miss) || 'This is the idea the question is scoring.';
  return `“${correct}” fits this question because it is the assessment-engine answer for this item.`;
}

/**
 * Type-aware lesson. Catalog may enrich wording; quotes stay on AE strings.
 */
export function buildTypeAwareLesson(miss, voice = {}) {
  const student = compactText(miss.studentAnswer);
  const correct = compactText(miss.correctAnswer);
  if (!correct) return null;
  const sage = toSageAssessmentType(miss.questionType);
  const tf = sage === SAGE_ASSESSMENT_TYPES.TrueFalse;
  if (!tf && looksLikeSymbolicTypedAnswer(student)) return null;
  const attempt = {
    prompt: miss.question,
    question: miss.question,
    questionType: miss.questionType,
    studentAnswer: student,
    correctAnswer: correct,
    topic: miss.topic,
    hint: miss.hint,
    completeness: miss.completeness,
    missingKeywords: miss.missingKeywords,
    options: miss.options,
  };
  let lesson = composeFiveStepLesson(attempt, voice);
  if (!validateStructuredLesson(lesson)) {
    const why = deterministicWhy(miss);
    const rightWhy = deterministicCorrectWhy(miss);
    lesson = {
      insufficientKnowledge: false,
      layout: typeLayout(miss.questionType),
      selected: why,
      correct: rightWhy,
      comparison: why,
      connection: scienceKeyIdea(attempt) || correct,
      check: `Can you say why “${clip(correct, 40)}” fits this question?`,
      studentAnswer: {
        title: 'Your Answer',
        concept: student || 'no pick',
        scientificDefinition: why,
        scientificFunction: 'your idea for this question',
        example: student,
      },
      correctAnswer: {
        title: 'Correct Answer',
        concept: correct,
        scientificDefinition: rightWhy,
        scientificFunction: 'the idea this question is scoring',
        example: correct,
      },
      comparisonFields: {
        studentConcept: student,
        studentConceptFunction: 'your idea for this question',
        correctConcept: correct,
        correctConceptFunction: 'the scored idea',
        keyScientificDifference: why,
        whyCorrectAnswerFitsQuestion: rightWhy,
        body: why,
      },
      sections: [
        {
          id: 'your_answer',
          title: 'YOUR ANSWER',
          quote: student,
          scientificDefinition: why,
          scientificFunction: 'your idea for this question',
          body: why,
        },
        {
          id: 'correct_answer',
          title: 'CORRECT ANSWER',
          quote: correct,
          scientificDefinition: rightWhy,
          scientificFunction: 'the idea this question is scoring',
          body: rightWhy,
        },
        {
          id: 'difference',
          title: 'WHY',
          keyScientificDifference: why,
          studentConcept: student,
          correctConcept: correct,
          body: why,
        },
        {
          id: 'connection',
          title: 'KEY CONCEPT',
          body: scienceKeyIdea(attempt) || correct,
        },
      ],
      fullText: `${why} ${rightWhy}`,
    };
  }
  lesson = remapLessonForType(lesson, miss, voice);
  if (lesson?.studentAnswer) lesson.studentAnswer.concept = student || lesson.studentAnswer.concept;
  if (lesson?.correctAnswer) lesson.correctAnswer.concept = correct || lesson.correctAnswer.concept;
  return lesson;
}

function promptFingerprint(text) {
  return compactText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 120);
}

function branchCorrectAllowed(branch, miss) {
  const got = compactText(branch.correctAnswer || branch.correct_answer);
  if (!got) return false;
  if (answersEquivalent(got, miss.correctAnswer)) return true;
  if (answersEquivalent(got, miss.canonicalCorrectAnswer)) return true;
  if ((miss.acceptedAnswers || []).some((item) => answersEquivalent(got, item))) return true;
  if ((miss.missedBlanks || []).some((item) => answersEquivalent(got, item.correctAnswer))) {
    return true;
  }
  return false;
}

function branchStudentAllowed(branch, miss) {
  const got = compactText(branch.studentAnswer || branch.student_answer);
  if (!got) return true;
  if (answersEquivalent(got, miss.studentAnswer)) return true;
  if ((miss.missedBlanks || []).some((item) => answersEquivalent(got, item.studentAnswer))) {
    return true;
  }
  return false;
}

/**
 * Reject maps that swapped the engine key, question, or student answer.
 */
export function validateMindMapAgainstAssessments(map, assessments = []) {
  const branches = Array.isArray(map?.branches) ? map.branches : [];
  if (!assessments.length) {
    return { ok: true, reason: 'no_assessment' };
  }
  for (const branch of branches) {
    const prompt = promptFingerprint(branch.prompt || branch.question || branch.question_text);
    const miss =
      assessments.find((row) => {
        if (row.questionId && branch.questionId && String(row.questionId) === String(branch.questionId)) {
          return true;
        }
        if (row.blankIndex && branch.blankIndex && row.blankIndex === branch.blankIndex) {
          const sameQ = promptFingerprint(row.question) === prompt;
          if (sameQ) return true;
        }
        return promptFingerprint(row.question) === prompt && prompt;
      }) ||
      assessments.find((row) => answersEquivalent(row.correctAnswer, branch.correctAnswer || branch.correct_answer));
    if (!miss) {
      return { ok: false, reason: 'unrelated_question' };
    }
    if (!branchCorrectAllowed(branch, miss)) {
      return { ok: false, reason: 'correct_answer_changed' };
    }
    if (!branchStudentAllowed(branch, miss)) {
      return { ok: false, reason: 'student_answer_changed' };
    }
    const branchPrompt = promptFingerprint(branch.prompt || branch.question);
    if (prompt && branchPrompt && promptFingerprint(miss.question) !== branchPrompt) {
      return { ok: false, reason: 'question_changed' };
    }
  }
  return { ok: true };
}

export function isTypedOrShort(questionType) {
  return isTypedAnswerQuestionType(questionType);
}

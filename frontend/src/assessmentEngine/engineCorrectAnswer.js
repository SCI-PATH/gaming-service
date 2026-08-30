/**
 * Pull the Assessment Engine's exact correct answer from a grade payload.
 * Never invent a key from the textbook, a lesson catalog, or Groq.
 */
import { isGradeStatusText } from '../avatar/kidFriendlySpeech.js';

function compact(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return compact(opt);
  return compact(opt.text || opt.label || opt.value || opt.option || '');
}

function letterIndex(token) {
  const m = compact(token).match(/^(?:option\s*)?([A-Da-d])(?:[.)]\s*)?$/i);
  if (!m) return -1;
  return m[1].toUpperCase().charCodeAt(0) - 65;
}

function resolveMcqDisplay(raw, questionData = {}) {
  const trimmed = compact(raw);
  if (!trimmed) return '';
  const options = Array.isArray(questionData.options) ? questionData.options : [];
  const letters = Array.isArray(questionData.optionLetters)
    ? questionData.optionLetters
    : [];
  const idx = letterIndex(trimmed);
  if (idx >= 0) {
    const fromLetters = letters.length
      ? letters.findIndex(
          (letter) => String(letter).toUpperCase() === String.fromCharCode(65 + idx),
        )
      : idx;
    const opt = options[fromLetters >= 0 ? fromLetters : idx];
    const text = optionText(opt);
    if (text) {
      const letter = String.fromCharCode(65 + idx);
      return `${letter} — ${text}`;
    }
  }
  return trimmed;
}

function fromExpectedBlanks(text) {
  const s = compact(text);
  const match = s.match(/(?:expected blanks?|blanks? are):\s*(.+)$/i);
  return match?.[1] ? compact(match[1]) : '';
}

function fromMissedBlanks(missed) {
  if (!missed || typeof missed !== 'object') return '';
  if (Array.isArray(missed)) {
    return missed
      .map((item) =>
        compact(
          item && typeof item === 'object'
            ? item.correctAnswer || item.correct || item.value
            : item,
        ),
      )
      .filter(Boolean)
      .join(' | ');
  }
  const entries = Object.entries(missed)
    .map(([k, v]) => [Number(k), compact(v)])
    .filter(([, v]) => v)
    .sort((a, b) => a[0] - b[0]);
  return entries.map(([, v]) => v).join(' | ');
}

/**
 * @returns {string} Engine key, or empty when the grade did not include one.
 */
export function extractAuthoritativeCorrectAnswer(gradePayload, questionData = {}) {
  if (!gradePayload || typeof gradePayload !== 'object') return '';

  const nested =
    gradePayload.grade && typeof gradePayload.grade === 'object'
      ? gradePayload.grade
      : null;
  const grade = nested || gradePayload;

  const accepted = grade.accepted_answers || grade.acceptedAnswers;
  if (Array.isArray(accepted) && accepted.length) {
    const joined = accepted.map((item) => compact(item)).filter(Boolean).join(' | ');
    if (joined) return joined;
  }

  const direct = [
    grade.correct_answer,
    grade.correctAnswer,
    nested?.correct_answer,
    nested?.correctAnswer,
  ]
    .map((value) => compact(value))
    .find((value) => value && !isGradeStatusText(value));
  if (direct) return resolveMcqDisplay(direct, questionData);

  const ideal = [
    grade.ideal_answer,
    grade.idealAnswer,
    nested?.ideal_answer,
    nested?.idealAnswer,
  ]
    .map((value) => compact(value))
    .find((value) => value && !isGradeStatusText(value));
  if (ideal) return ideal;

  const expected =
    fromExpectedBlanks(grade.detailed_explanation || grade.detailedExplanation) ||
    fromExpectedBlanks(grade.feedback);
  if (expected && !isGradeStatusText(expected)) return expected;

  const fromMissed = fromMissedBlanks(grade.missed_blanks || grade.missedBlanks);
  if (fromMissed) return fromMissed;

  const letterMatch = compact(grade.feedback).match(
    /right answer is\s*([A-D]|True|False)\b/i,
  );
  if (letterMatch) {
    return resolveMcqDisplay(letterMatch[1], questionData) || letterMatch[1];
  }
  const statementMatch = compact(grade.feedback).match(
    /statement is\s*(True|False)/i,
  );
  if (statementMatch) return statementMatch[1];

  return '';
}

export function hasAuthoritativeCorrectAnswer(value) {
  const s = compact(value);
  if (!s) return false;
  if (isGradeStatusText(s)) return false;
  if (/^(id|guid|uuid|null|undefined)$/i.test(s)) return false;
  return true;
}

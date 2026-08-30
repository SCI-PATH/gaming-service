/**
 * Build the dashboard "every question you faced" list.
 */
import { farmQuestionTypeLabel } from '../assessmentEngine/assessmentQuizSession.js';

export function formatDashboardAnswer(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((part) => formatDashboardAnswer(part))
      .filter(Boolean)
      .join(' · ');
  }
  if (typeof value === 'object') {
    return formatDashboardAnswer(
      value.text ?? value.answer ?? value.label ?? value.studentAnswer,
    );
  }
  let t = String(value)
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/\s*\|\s*/g, ' · ');
  if (
    !t ||
    /^(no pick|no selection|no answer|timed out|unclear|\(no selection\)|\(timed out)/i.test(
      t,
    )
  ) {
    return '';
  }
  return t;
}

function answersFrom(row = {}) {
  return {
    studentAnswer: formatDashboardAnswer(
      row.studentAnswer ??
        row.student_answer ??
        row.selectedText ??
        row.selected_text ??
        row.wrongAnswer ??
        row.wrong_answer,
    ),
    correctAnswer: formatDashboardAnswer(
      row.correctAnswer ?? row.correct_answer ?? row.key,
    ),
  };
}

function findExistingPoint(out, prompt, at, correct) {
  return out.find((p) => {
    const sameTime = at && p.at && Math.abs(Number(p.at) - at) < 2000;
    const pp = String(p.prompt || p.question || '').trim();
    const samePrompt = prompt && pp && pp === prompt;
    const sameOutcome =
      correct == null ||
      p.isCorrect === correct ||
      (p.incorrect === 1 && correct === false) ||
      (p.incorrect === 0 && correct === true);
    return (
      (sameTime && (samePrompt || !prompt)) ||
      (samePrompt && sameOutcome && (!at || !p.at))
    );
  });
}

export function mergeQuestionPoints(points = [], liveHistory = []) {
  const out = (Array.isArray(points) ? points : []).filter(Boolean).map((p) => {
    const answers = answersFrom(p);
    return {
      ...p,
      studentAnswer: answers.studentAnswer || p.studentAnswer || '',
      correctAnswer: answers.correctAnswer || p.correctAnswer || '',
    };
  });
  for (const h of liveHistory || []) {
    const prompt = String(h.question || h.prompt || '').trim();
    const at = Number(h.at) || 0;
    const correct =
      typeof h.is_correct === 'boolean'
        ? h.is_correct
        : typeof h.isCorrect === 'boolean'
          ? h.isCorrect
          : null;
    const answers = answersFrom(h);
    const already = findExistingPoint(out, prompt, at, correct);
    if (already) {
      if (!formatDashboardAnswer(already.studentAnswer) && answers.studentAnswer) {
        already.studentAnswer = answers.studentAnswer;
      }
      if (!formatDashboardAnswer(already.correctAnswer) && answers.correctAnswer) {
        already.correctAnswer = answers.correctAnswer;
      }
      continue;
    }
    if (!prompt && correct == null && h.score == null && !answers.studentAnswer) {
      continue;
    }
    out.push({
      at: at || Date.now(),
      score: h.frustration_score ?? h.score ?? null,
      prompt: prompt || null,
      question: prompt || null,
      questionType: h.questionType || h.question_type || h.questionTypeLabel,
      options: h.options,
      isCorrect: correct,
      incorrect: correct === false ? 1 : correct === true ? 0 : undefined,
      studentAnswer: answers.studentAnswer,
      correctAnswer: answers.correctAnswer,
    });
  }
  return out.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}

export function buildQuizRoundRows(points = [], misconceptions = [], liveHistory = []) {
  const attempts = (misconceptions || []).flatMap((m) =>
    (m.attempts || []).map((a) => ({
      at: Number(a.at) || 0,
      prompt: a.prompt || a.question || '',
      questionType: a.questionType || a.question_type || '',
      options: a.options || [],
      studentAnswer: formatDashboardAnswer(a.studentAnswer || a.student_answer),
      correctAnswer: formatDashboardAnswer(a.correctAnswer || a.correct_answer),
      used: false,
    })),
  );

  const merged = mergeQuestionPoints(points, liveHistory).filter(
    (p) =>
      p &&
      (p.score != null ||
        p.isCorrect === true ||
        p.isCorrect === false ||
        p.incorrect === 0 ||
        p.incorrect === 1 ||
        String(p.prompt || p.question || '').trim()),
  );

  return merged.map((p, i, list) => {
    const fromPoint = String(p.prompt || p.question || '').trim();
    let prompt = fromPoint;
    let questionType = p.questionType || p.question_type || '';
    let options = Array.isArray(p.options) ? p.options : [];
    let studentAnswer = formatDashboardAnswer(p.studentAnswer || p.student_answer);
    let correctAnswer = formatDashboardAnswer(p.correctAnswer || p.correct_answer);
    const looksMissed = p.isCorrect === false || p.incorrect === 1;
    if (!prompt || !questionType || !studentAnswer) {
      const at = Number(p.at) || 0;
      const hit =
        attempts.find(
          (a) => !a.used && a.at && at && Math.abs(a.at - at) < 8000,
        ) || (looksMissed ? attempts.find((a) => !a.used && a.prompt) : null);
      if (hit) {
        hit.used = true;
        prompt = prompt || String(hit.prompt || '').trim();
        questionType = questionType || hit.questionType;
        if (!options.length && Array.isArray(hit.options)) options = hit.options;
        if (!studentAnswer) studentAnswer = hit.studentAnswer;
        if (!correctAnswer) correctAnswer = hit.correctAnswer;
      }
    }
    const mood = moodForScore(p.score);
    const correct =
      typeof p.isCorrect === 'boolean'
        ? p.isCorrect
        : p.incorrect === 1
          ? false
          : p.incorrect === 0
            ? true
            : null;
    const typeLabel =
      farmQuestionTypeLabel({
        questionType,
        question_type: questionType,
        prompt,
        options,
      }) || 'Question';
    return {
      ...p,
      i,
      n: i + 1,
      key: `${p.at || 'q'}-${i}-${(prompt || '').slice(0, 24)}`,
      latest: i === list.length - 1,
      mood,
      prompt: clipQuestionLine(prompt, 480),
      typeLabel,
      correct,
      studentAnswer,
      correctAnswer,
      feel: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))),
    };
  });
}

function clipQuestionLine(text, max = 480) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function moodForScore(score) {
  const n = Number(score) || 0;
  if (n <= 30) return { emoji: '😊', band: 'low', label: 'Calm' };
  if (n <= 60) return { emoji: '😐', band: 'moderate', label: 'A bit stuck' };
  return { emoji: '😣', band: 'high', label: 'Whoa' };
}

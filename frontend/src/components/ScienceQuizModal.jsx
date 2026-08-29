import { useEffect, useRef, useState } from 'react';
import { ForestGameBridge } from '../game/ForestGameBridge.js';
import {
  asQuestionType,
  isAssessmentQuestion,
  serializeStudentAnswer,
  submitAssessmentAnswer,
} from '../assessmentEngine/assessmentQuizSession.js';
import {
  isFillInQuestionType,
  normalizeSageMindMapInput,
  buildSageAssessment,
} from '../avatar/normalizeSageMindMapInput.js';

const TYPE_LABELS = {
  MCQ: 'Multiple choice',
  TrueFalse: 'True or false',
  ShortAnswer: 'Short answer',
  MultiBlank: 'Fill in the blanks',
};

function resolveQuestionType(questionData) {
  const typed =
    asQuestionType(questionData?.questionType) ||
    asQuestionType(questionData?.question_type);
  if (typed) return typed;
  if (Array.isArray(questionData?.options) && questionData.options.length > 0) {
    return 'MCQ';
  }
  return 'ShortAnswer';
}

function hasTypedAnswer(questionType, shortText, blanks) {
  if (questionType === 'MultiBlank') {
    return blanks.some((v) => String(v || '').trim().length > 0);
  }
  return String(shortText || '').trim().length > 0;
}

/** Keep farm WASD / Q / E / Space from eating letters in typed answers. */
function stopGameKeyCapture(event) {
  event.stopPropagation();
}

function isGradeStatusFeedback(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (
    /grading failed|model_not_found|does not exist|invalid_request_error|error code:\s*\d+/i.test(
      s,
    ) ||
    s.includes("{'error'") ||
    s.includes('{"error"')
  ) {
    return true;
  }
  return (
    /^\d+\s+of\s+\d+\s+blanks?\s+correct\.?$/i.test(s) ||
    /^correct\.?$/i.test(s) ||
    /^no answer provided\.?$/i.test(s) ||
    /^no answer was (typed|provided)/i.test(s) ||
    /^matches the ideal answer/i.test(s) ||
    /^we could not fully score/i.test(s)
  );
}

function matchCorrectOptionIndex(correctAnswer, options, letters) {
  if (!correctAnswer || !Array.isArray(options) || options.length === 0) {
    return -1;
  }
  const token = String(correctAnswer).trim();
  const letterMatch = token.match(/^([A-Da-d]|True|False)\b/);
  if (letterMatch && Array.isArray(letters)) {
    const needle = letterMatch[1];
    const idx = letters.findIndex(
      (letter) => String(letter).toLowerCase() === String(needle).toLowerCase(),
    );
    if (idx >= 0) return idx;
  }
  const lower = token.replace(/^[A-D]\s*[.):\-]\s*/i, '').trim().toLowerCase();
  if (!lower) return -1;
  return options.findIndex((opt) => {
    const text = String(opt?.text || '').trim().toLowerCase();
    return Boolean(text) && (text === lower || lower.includes(text) || text.includes(lower));
  });
}

function formatChoiceLabel(text, letter) {
  const body = String(text || '').trim();
  const key = String(letter || '').trim();
  if (!body) return key;
  if (key && /^[A-D]$/i.test(key) && !new RegExp(`^${key}\\b`, 'i').test(body)) {
    return `${key}. ${body}`;
  }
  return body;
}

function blanksFromMissed(missed) {
  if (!missed || typeof missed !== 'object') return null;
  const entries = Object.entries(missed)
    .map(([k, v]) => [Number(k), String(v || '').trim()])
    .filter(([, v]) => v)
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return null;
  return entries.map(([, v]) => v).join(' · ');
}

function extractEngineCorrectAnswer(graded, questionData) {
  const gradePayload =
    graded?.data?.grade && typeof graded.data.grade === 'object'
      ? graded.data.grade
      : graded?.data || null;
  if (!gradePayload) return null;

  const fromBlanks = blanksFromMissed(
    gradePayload.missed_blanks || gradePayload.missedBlanks,
  );
  if (fromBlanks) return fromBlanks;

  const detailed = String(
    gradePayload.detailed_explanation ||
      gradePayload.detailedExplanation ||
      '',
  ).trim();
  const detailedMatch = detailed.match(/Expected blanks:\s*(.+)$/i);
  if (detailedMatch?.[1]) return detailedMatch[1].replace(/\s*\|\s*/g, ' · ');

  const direct =
    gradePayload.ideal_answer ||
    gradePayload.idealAnswer ||
    gradePayload.grade?.ideal_answer ||
    gradePayload.grade?.idealAnswer ||
    gradePayload.correct_answer ||
    gradePayload.correctAnswer ||
    null;
  if (direct && !isGradeStatusFeedback(direct)) return String(direct);

  const feedback = String(gradePayload.feedback || '');
  if (!feedback || isGradeStatusFeedback(feedback)) return null;

  const blanksMatch = feedback.match(
    /(?:blanks? are|expected blanks?):\s*(.+)$/i,
  );
  if (blanksMatch?.[1]) {
    return blanksMatch[1].replace(/\s*\|\s*/g, ' · ').trim();
  }

  const letterMatch = feedback.match(
    /right answer is\s*([A-D]|True|False)\b/i,
  );
  if (letterMatch) {
    const token = letterMatch[1];
    const letters = questionData?.optionLetters;
    const options = questionData?.options;
    if (Array.isArray(letters) && Array.isArray(options)) {
      const idx = letters.findIndex(
        (letter) =>
          String(letter).toLowerCase() === String(token).toLowerCase(),
      );
      if (idx >= 0) {
        const raw = options[idx];
        const text =
          typeof raw === 'string'
            ? raw
            : String(raw?.text || raw?.label || raw?.value || '').trim();
        return text ? `${token}. ${text}` : String(token);
      }
    }
    return String(token);
  }
  const statementMatch = feedback.match(/statement is\s*(True|False)/i);
  if (statementMatch) return statementMatch[1];

  // Do not dump raw grader status / empty-answer notes into "correct"
  if (/incorrect\.\s*/i.test(feedback)) {
    const cleaned = feedback.replace(/^incorrect\.\s*/i, '').trim();
    if (cleaned && !isGradeStatusFeedback(cleaned)) return cleaned;
  }
  return null;
}

/**
 * Plant / harvest / load / unload quiz.
 * Local items reveal the correct answer; Assessment Engine items use grade.is_correct.
 * Renders Assessment Engine types: MCQ, TrueFalse, ShortAnswer, MultiBlank.
 * Optional gameplayAssist controls answer timer + hint visibility only
 * (does not change question selection / difficulty).
 */
export default function ScienceQuizModal({
  questionData,
  cropId,
  cropName = '',
  mode = 'plant',
  carriedCount = 0,
  gameplayAssist = null,
  loading = false,
  onClose,
  onAnswerAttempt,
  onHintUsed = null,
  onOptionSwitch = null,
}) {
  const openedAtRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onAnswerAttemptRef = useRef(onAnswerAttempt);
  const shortTextRef = useRef('');
  const blanksRef = useRef([]);
  const [result, setResult] = useState(null);
  const [gradeError, setGradeError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shortText, setShortText] = useState('');
  const [blanks, setBlanks] = useState([]);
  const closeTimerRef = useRef(0);
  const remoteGrade = isAssessmentQuestion(questionData);
  const questionType = resolveQuestionType(questionData);
  const isChoiceType = questionType === 'MCQ' || questionType === 'TrueFalse';
  const isLoad = mode === 'load';
  const isHarvest = mode === 'harvest';
  const isUnload = mode === 'unload' || mode === 'sell';
  const isItem = mode === 'item_challenge';
  const isStory = mode === 'storyline';
  const isWorld = mode === 'world_challenge';
  const isAnimalTend = mode === 'animal_tend';
  const isAnimalCollect = mode === 'animal_collect';
  const isCleanStart = mode === 'clean_start';
  const isCleanSweep = mode === 'clean_sweep';

  const assist = gameplayAssist || {};
  const answerTimerMs = Number(assist.answerTimerMs) || 0;
  const hintLevel = assist.hintLevel || 'limited';
  const hintText = questionData?.hint || null;
  const blankCount = Math.max(1, Number(questionData?.blanks) || 2);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onAnswerAttemptRef.current = onAnswerAttempt;
  }, [onAnswerAttempt]);

  useEffect(() => {
    if (!questionData) return;
    if (!remoteGrade) return;
    console.log('[AssessmentEngine] quiz modal showing', {
      id: questionData.id,
      prompt: questionData.prompt || questionData.question,
      questionType,
    });
  }, [questionData?.id, remoteGrade, questionType]);

  useEffect(() => {
    openedAtRef.current = Date.now();
    finishedRef.current = false;
    setResult(null);
    setGradeError(null);
    setBusy(false);
    setShowHint(hintLevel === 'more' && Boolean(hintText));
    setShortText('');
    shortTextRef.current = '';
    const nextBlanks = Array.from({ length: blankCount }, () => '');
    setBlanks(nextBlanks);
    blanksRef.current = nextBlanks;
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = 0;
      }
    };
  }, [
    questionData?.id,
    questionData?.prompt,
    questionData?.question,
    mode,
    hintLevel,
    hintText,
    blankCount,
  ]);

  useEffect(() => {
    if (loading || isChoiceType || !questionData) return undefined;
    const focusInput = () => {
      const el = document.querySelector(
        '.science-quiz-overlay .science-quiz-input:not([disabled])',
      );
      el?.focus?.();
    };
    focusInput();
    const t = window.setTimeout(focusInput, 80);
    return () => window.clearTimeout(t);
  }, [loading, isChoiceType, questionData?.id, questionType]);

  const finish = (isCorrect, responseTimeMs) => {
    if (isCorrect) {
      ForestGameBridge.emit('SCIENCE_CORRECT', {
        cropId,
        mode,
        rp: questionData?.rp ?? 0,
        responseTimeMs,
      });
    } else {
      ForestGameBridge.emit('SCIENCE_INCORRECT', {
        cropId,
        mode,
        questionId: questionData?.id,
        responseTimeMs,
      });
    }
    onCloseRef.current?.(isCorrect, responseTimeMs);
  };

  const gradeAndFinishRef = useRef(null);
  const gradeAndFinish = async ({
    isCorrectLocal,
    selectedIndex,
    selectedText,
    studentAnswer,
    timedOut,
  }) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const responseTimeMs = Math.max(0, Date.now() - openedAtRef.current);
    let isCorrect = Boolean(isCorrectLocal);

    if (remoteGrade && questionData?.id) {
      setBusy(true);
      setGradeError(null);
      try {
        const graded = await submitAssessmentAnswer({
          questionId: questionData.id,
          studentAnswer,
          timeTakenSeconds: responseTimeMs / 1000,
        });
        if (!graded?.ok && !timedOut) {
          finishedRef.current = false;
          setBusy(false);
          setGradeError(
            'Could not check that answer. Check the Assessment Engine and try again.',
          );
          return;
        }
        isCorrect = Boolean(graded?.ok && graded?.isCorrect);
        const engineCorrect =
          extractEngineCorrectAnswer(graded, questionData) ||
          (gradePayload?.ideal_answer &&
          !isGradeStatusFeedback(gradePayload.ideal_answer)
            ? String(gradePayload.ideal_answer)
            : null) ||
          (gradePayload?.idealAnswer &&
          !isGradeStatusFeedback(gradePayload.idealAnswer)
            ? String(gradePayload.idealAnswer)
            : null);
        const gradePayload =
          graded?.data?.grade && typeof graded.data.grade === 'object'
            ? graded.data.grade
            : graded?.data || null;
        const sageInput = normalizeSageMindMapInput({
          questionData: { ...questionData, questionType },
          selectedText,
          studentAnswer: selectedText || serializeStudentAnswer(studentAnswer),
          selectedIndex,
          correctAnswer: engineCorrect || questionData.correctAnswer,
          isCorrect,
          grade: gradePayload,
          options: questionData.options,
        });
        const assessment = buildSageAssessment({
          questionData: { ...questionData, questionType },
          selectedText,
          studentAnswer: selectedText || serializeStudentAnswer(studentAnswer),
          selectedIndex,
          correctAnswer: engineCorrect || questionData.correctAnswer,
          isCorrect,
          grade: gradePayload,
          options: questionData.options,
        });
        const sageStudent = assessment.studentAnswer || sageInput.studentAnswer;
        const sageCorrect = assessment.correctAnswer || sageInput.correctAnswer || engineCorrect || null;
        const rawFeedback = gradePayload?.feedback || null;
        const safeFeedback = isGradeStatusFeedback(rawFeedback)
          ? null
          : rawFeedback;
        onAnswerAttemptRef.current?.({
          isCorrect,
          selectedIndex,
          selectedText: sageStudent,
          studentAnswer: sageStudent,
          responseTimeMs,
          questionData: {
            ...questionData,
            questionType: assessment.questionType || questionType,
            options: assessment.options.length
              ? assessment.options
              : questionData.options,
            correctAnswer: sageCorrect || questionData.correctAnswer || null,
            acceptedAnswers: isFillInQuestionType(questionType)
              ? sageInput.acceptedAnswers
              : undefined,
            studentAnswer: sageStudent,
            sageAssessment: assessment,
            completeness: sageInput.completeness,
            missingKeywords: sageInput.missingKeywords,
            accuracyScore: sageInput.accuracyScore,
            errorCategory: sageInput.errorCategory,
            gradeFeedback: safeFeedback,
            grade: gradePayload,
          },
          mode,
          timedOut: Boolean(timedOut),
          gradeFeedback: safeFeedback,
          correctAnswer: sageCorrect,
        });
        setResult({
          isCorrect,
          selectedIndex,
          selectedText: sageStudent,
          responseTimeMs,
          timedOut: Boolean(timedOut),
          correctAnswer:
            sageCorrect || (isCorrect ? sageStudent : null),
        });
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(() => {
          finish(isCorrect, responseTimeMs);
        }, isCorrect ? 1800 : 2800);
        setBusy(false);
        return;
      } catch {
        if (!timedOut) {
          finishedRef.current = false;
          setBusy(false);
          setGradeError(
            'Could not check that answer. Check the Assessment Engine and try again.',
          );
          return;
        }
        isCorrect = false;
      }
      setBusy(false);
    } else if (timedOut) {
      isCorrect = false;
    }

    const fallbackAssessment = buildSageAssessment({
      questionData: { ...questionData, questionType },
      selectedText,
      studentAnswer: selectedText || serializeStudentAnswer(studentAnswer),
      selectedIndex,
      correctAnswer: questionData?.correctAnswer,
      isCorrect,
      options: questionData?.options,
    });
    const fallbackStudent =
      fallbackAssessment.studentAnswer ||
      serializeStudentAnswer(studentAnswer) ||
      selectedText;
    const fallbackCorrect =
      fallbackAssessment.correctAnswer || questionData?.correctAnswer || null;
    onAnswerAttemptRef.current?.({
      isCorrect,
      selectedIndex,
      selectedText: fallbackStudent,
      studentAnswer: fallbackStudent,
      responseTimeMs,
      questionData: {
        ...questionData,
        questionType: fallbackAssessment.questionType || questionType,
        options: fallbackAssessment.options.length
          ? fallbackAssessment.options
          : questionData?.options,
        studentAnswer: fallbackStudent,
        correctAnswer: fallbackCorrect,
        sageAssessment: fallbackAssessment,
        acceptedAnswers: isFillInQuestionType(questionType)
          ? fallbackAssessment.acceptedAnswers
          : undefined,
        completeness: fallbackAssessment.completeness,
      },
      mode,
      timedOut: Boolean(timedOut),
      correctAnswer: fallbackCorrect,
    });
    setResult({
      isCorrect,
      selectedIndex,
      selectedText: fallbackStudent,
      responseTimeMs,
      timedOut: Boolean(timedOut),
      correctAnswer: fallbackCorrect,
    });
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      finish(isCorrect, responseTimeMs);
    }, isCorrect ? 1800 : 2800);
  };
  gradeAndFinishRef.current = gradeAndFinish;

  useEffect(() => {
    if (loading || !answerTimerMs || !questionData) return undefined;

    setSecondsLeft(Math.ceil(answerTimerMs / 1000));
    const tick = window.setInterval(() => {
      if (finishedRef.current) return;
      const elapsed = Date.now() - openedAtRef.current;
      const left = Math.max(0, Math.ceil((answerTimerMs - elapsed) / 1000));
      setSecondsLeft(left);
      if (elapsed < answerTimerMs) return;

      const typedAnswer =
        questionType === 'MultiBlank'
          ? blanksRef.current
          : questionType === 'ShortAnswer'
            ? shortTextRef.current
            : '';
      void gradeAndFinishRef.current?.({
        isCorrectLocal: false,
        selectedIndex: -1,
        selectedText: serializeStudentAnswer(typedAnswer) || null,
        studentAnswer: typedAnswer,
        timedOut: true,
      });
    }, 250);

    return () => window.clearInterval(tick);
  }, [answerTimerMs, questionData, cropId, mode, loading, questionType]);

  useEffect(() => {
    if (loading || !hintText || hintLevel === 'minimal' || hintLevel === 'more') {
      return undefined;
    }
    if (hintLevel === 'limited' && answerTimerMs > 0) {
      const mid = window.setTimeout(() => {
        setShowHint(true);
        onHintUsed?.();
      }, Math.floor(answerTimerMs * 0.45));
      return () => window.clearTimeout(mid);
    }
    return undefined;
  }, [hintText, hintLevel, answerTimerMs, questionData?.id, onHintUsed, loading]);

  const cropLabel = String(cropName || '').trim().toLowerCase();

  const title = isStory
    ? 'A quick question'
    : isWorld
    ? questionData?.topic || ''
    : isItem
    ? questionData?.topic
      ? `Item Challenge — ${questionData.topic}`
      : 'Item Challenge'
    : isAnimalTend
      ? cropLabel
        ? `Animal Challenge — Feed the ${cropLabel}`
        : 'Animal Challenge — Tend the herd'
      : isAnimalCollect
        ? cropLabel
          ? `Collect Challenge — Pick ${cropLabel}`
          : 'Collect Challenge — Animal produce'
        : isCleanStart
          ? cropLabel
            ? `Cleaning Challenge — Start on ${cropLabel}`
            : 'Cleaning Challenge — Start sweeping'
          : isCleanSweep
            ? cropLabel
              ? `Cleaning Challenge — Sweep ${cropLabel}`
              : 'Cleaning Challenge — Sweep the yard'
        : isUnload
      ? cropLabel
        ? `Sell Challenge — Sell ${cropLabel} at the shop`
        : 'Unload Challenge (Sell Cart)'
      : isLoad
        ? cropLabel
          ? `Load Challenge — Deliver ${cropLabel} to the shop`
          : 'Load Challenge (Deliver to Shop)'
        : isHarvest
          ? cropLabel
            ? `Harvest Challenge — Pick ${cropLabel}`
            : 'Harvest Challenge (Pick Crops)'
          : cropLabel
            ? `Plant Challenge — Plant ${cropLabel}`
            : 'Plant Challenge (Plant Lock)';

  const successBlurb = isStory
    ? ''
    : isWorld
    ? ''
    : isItem
    ? 'Challenge step complete.'
    : isAnimalTend
      ? 'Animals are fed — collect their milk, eggs, or wool.'
      : isAnimalCollect
        ? 'Collect unlocked — run over the produce in the pen.'
        : isCleanStart
          ? 'Yard unlocked — run over the mess to sweep it up.'
          : isCleanSweep
            ? 'Sweeping unlocked — run over the mess in the yard.'
        : isUnload
      ? 'Shop unlocked — customers buy from stock automatically.'
      : isLoad
        ? 'Harvests delivered to the shop — customers will buy automatically.'
        : isHarvest
          ? 'Harvest unlocked — run over ready crops to pick them up.'
          : 'Crops will grow — harvest them onto your back.';

  if (loading) {
    return (
      <div
        className="science-quiz-overlay"
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        style={{ zIndex: 5000 }}
      >
        <div className="science-quiz-card escape-quiz">
          <div className="escape-quiz-head">
            <h3>{title || 'Science challenge'}</h3>
          </div>
          <p className="science-quiz-prompt">Loading question from Assessment Engine…</p>
        </div>
      </div>
    );
  }

  if (!questionData) return null;

  const choiceSource =
    questionType === 'TrueFalse' &&
    (!Array.isArray(questionData.options) || questionData.options.length < 2)
      ? ['True', 'False']
      : questionData.options;
  const choiceLetters =
    questionType === 'TrueFalse' &&
    (!Array.isArray(questionData.optionLetters) ||
      questionData.optionLetters.length < 2)
      ? ['True', 'False']
      : questionData.optionLetters;

  if (isChoiceType && !Array.isArray(choiceSource)) return null;

  const options = isChoiceType
    ? choiceSource.map((opt, idx) => {
        if (typeof opt === 'string') {
          return {
            text: opt,
            isCorrect: remoteGrade ? false : idx === questionData.correctIndex,
          };
        }
        return {
          ...opt,
          isCorrect: remoteGrade
            ? false
            : Boolean(opt.isCorrect) || idx === questionData.correctIndex,
        };
      })
    : [];

  const correctOption =
    options.find((o) => o.isCorrect) ||
    options[questionData.correctIndex] ||
    null;
  const correctText = correctOption?.text ?? '—';

  const revealedCorrectIndex = (() => {
    if (!result || !isChoiceType) return -1;
    if (!remoteGrade) {
      return options.findIndex((o) => o.isCorrect);
    }
    if (result.isCorrect && result.selectedIndex >= 0) {
      return result.selectedIndex;
    }
    return matchCorrectOptionIndex(
      result.correctAnswer,
      options,
      choiceLetters,
    );
  })();

  const revealedCorrectText = (() => {
    if (revealedCorrectIndex >= 0) {
      return formatChoiceLabel(
        options[revealedCorrectIndex]?.text,
        choiceLetters?.[revealedCorrectIndex],
      );
    }
    if (result?.correctAnswer) return String(result.correctAnswer);
    if (!remoteGrade && correctText && correctText !== '—') {
      return formatChoiceLabel(
        correctText,
        choiceLetters?.[questionData.correctIndex],
      );
    }
    if (result?.isCorrect && result.selectedText) return result.selectedText;
    return '';
  })();

  const selectedDisplay =
    result?.selectedIndex >= 0
      ? formatChoiceLabel(
          options[result.selectedIndex]?.text,
          choiceLetters?.[result.selectedIndex],
        )
      : result?.selectedText || '';

  const handleChoice = (selectedIndex) => {
    if (result || finishedRef.current || busy) return;
    const selectedText = options[selectedIndex]?.text ?? null;
    const letter = choiceLetters?.[selectedIndex] ?? null;
    const looksMeta = /^(id|guid|uuid)$/i.test(String(selectedText || ''));
    const answerText = looksMeta
      ? letter || selectedText
      : selectedText || letter;
    const studentAnswer =
      letter && /^[A-D]$/i.test(String(letter))
        ? letter
        : answerText;
    void gradeAndFinish({
      isCorrectLocal: Boolean(options[selectedIndex]?.isCorrect),
      selectedIndex,
      selectedText: answerText,
      studentAnswer,
      timedOut: false,
    });
  };

  const handleTypedSubmit = (event) => {
    event?.preventDefault?.();
    if (result || finishedRef.current || busy) return;
    const value = questionType === 'MultiBlank' ? blanks : shortText;
    if (!hasTypedAnswer(questionType, shortText, blanks)) return;
    void gradeAndFinish({
      isCorrectLocal: false,
      selectedIndex: -1,
      selectedText: serializeStudentAnswer(value),
      studentAnswer: value,
      timedOut: false,
    });
  };

  const updateBlank = (idx, value) => {
    setBlanks((prev) => {
      const next = [...prev];
      next[idx] = value;
      blanksRef.current = next;
      return next;
    });
  };

  const showMcqKeys =
    questionType === 'MCQ' &&
    Array.isArray(choiceLetters) &&
    choiceLetters.length === options.length;

  const promptText =
    questionData.paragraph ||
    questionData.prompt ||
    questionData.question;

  return (
    <div
      className="science-quiz-overlay"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 5000 }}
    >
      <div className="science-quiz-card escape-quiz">
        <div className="escape-quiz-head">
          <h3>{title}</h3>
          {TYPE_LABELS[questionType] && (
            <p className="science-quiz-type">{TYPE_LABELS[questionType]}</p>
          )}
          {questionData.rp != null && (
            <p className="escape-quiz-topic">+{questionData.rp} RP</p>
          )}
          {answerTimerMs > 0 && secondsLeft != null && !result && (
            <p
              className={`science-quiz-timer ${
                secondsLeft <= 5 ? 'is-urgent' : ''
              }`}
            >
              {secondsLeft}s
            </p>
          )}
          {isLoad && (
            <p className="science-quiz-carry">
              Carrying {carriedCount} crop{carriedCount === 1 ? '' : 's'} on your
              back
            </p>
          )}
          {isUnload && (
            <p className="science-quiz-carry">
              Visit the Farm Shop to see customers and stock
            </p>
          )}
        </div>

        <p className="science-quiz-prompt">{promptText}</p>

        {showHint && hintText && !result && (
          <p className="science-quiz-hint" aria-live="polite">
            Hint: {hintText}
          </p>
        )}

        {!showHint && hintText && hintLevel !== 'minimal' && !result && (
          <button
            type="button"
            className="science-quiz-hint-btn"
            onClick={() => {
              setShowHint(true);
              onHintUsed?.();
            }}
          >
            Show hint
          </button>
        )}

        {busy && !result && (
          <p className="science-quiz-checking" aria-live="polite">
            Checking with Assessment Engine…
          </p>
        )}
        {gradeError && !result && (
          <p className="science-quiz-grade-error" role="alert">
            {gradeError}
          </p>
        )}

        {isChoiceType ? (
          <div className="science-quiz-options">
            {options.map((option, idx) => {
              let tone = '';
              if (result) {
                if (idx === revealedCorrectIndex) tone = 'is-correct';
                else if (idx === result.selectedIndex) tone = 'is-wrong';
              }
              return (
                <button
                  key={`${option.text}-${idx}`}
                  type="button"
                  className={`science-quiz-option ${tone}`}
                  disabled={Boolean(result) || busy}
                  onPointerEnter={() => onOptionSwitch?.(idx)}
                  onFocus={() => onOptionSwitch?.(idx)}
                  onClick={() => handleChoice(idx)}
                >
                  {showMcqKeys && (
                    <span className="science-quiz-option-key">
                      {choiceLetters[idx]}
                    </span>
                  )}
                  <span>{option.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <form
            className="science-quiz-typed"
            onSubmit={handleTypedSubmit}
            onKeyDown={stopGameKeyCapture}
            onKeyUp={stopGameKeyCapture}
          >
            {questionType === 'ShortAnswer' && (
              <input
                className="science-quiz-input"
                type="text"
                value={shortText}
                disabled={Boolean(result) || busy}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Type your answer…"
                onKeyDown={stopGameKeyCapture}
                onKeyUp={stopGameKeyCapture}
                onChange={(event) => {
                  const next = event.target.value;
                  shortTextRef.current = next;
                  setShortText(next);
                }}
              />
            )}
            {questionType === 'MultiBlank' &&
              blanks.map((blank, idx) => (
                <label key={idx} className="science-quiz-blank">
                  <span>Blank {idx + 1}</span>
                  <input
                    className="science-quiz-input"
                    type="text"
                    value={blank}
                    disabled={Boolean(result) || busy}
                    autoFocus={idx === 0}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={`Answer for blank ${idx + 1}`}
                    onKeyDown={stopGameKeyCapture}
                    onKeyUp={stopGameKeyCapture}
                    onChange={(event) => updateBlank(idx, event.target.value)}
                  />
                </label>
              ))}
            <button
              type="submit"
              className="science-quiz-submit"
              disabled={
                Boolean(result) ||
                busy ||
                !hasTypedAnswer(questionType, shortText, blanks)
              }
            >
              {busy ? 'Checking…' : 'Submit answer'}
            </button>
          </form>
        )}

        {result && (
          <div
            className={`science-quiz-feedback ${
              result.isCorrect ? 'is-ok' : 'is-miss'
            }`}
            aria-live="polite"
          >
            <strong>
              {result.isCorrect
                ? isStory
                  ? 'Nice!'
                  : 'Correct!'
                : result.timedOut
                  ? 'Time’s up.'
                  : 'Not quite.'}
            </strong>
            {isStory ? (
              <p className="science-quiz-feedback-next">
                {result.isCorrect
                  ? 'You can keep going.'
                  : 'Try that again when you are ready.'}
              </p>
            ) : result.isCorrect ? (
              successBlurb ? (
                <p className="science-quiz-feedback-next">{successBlurb}</p>
              ) : null
            ) : (
              <>
                {selectedDisplay ? (
                  <p className="science-quiz-feedback-line">
                    <span className="science-quiz-feedback-label">
                      Your answer
                    </span>
                    {selectedDisplay}
                  </p>
                ) : null}
                {revealedCorrectText ? (
                  <p className="science-quiz-feedback-line is-key">
                    <span className="science-quiz-feedback-label">
                      Correct answer
                    </span>
                    {revealedCorrectText}
                  </p>
                ) : null}
                <p className="science-quiz-feedback-next">
                  The farm problem is still there — try again.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

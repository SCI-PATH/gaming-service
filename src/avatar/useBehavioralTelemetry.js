/**
 * Continuous multi-metric behavioral tracker + auto intervention triggers.
 *
 * Tracks:
 * 1. level_retries_count
 * 2. question_attempts
 * 3. click_pattern_density
 * 4. time_per_question
 * 5. answer_accuracy_counts
 * 6. accuracy_percentage
 * 7. performance_delta
 * 8. overall_progress_trend
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_THRESHOLDS,
  clickDensityLabel,
  formatPerformanceDelta,
  INTERVENTION_MODES,
  trendFromDelta,
} from './avatarConstants.js';
import { evaluateStudentState } from './evaluateStudentState.js';
import { resolveTopicKey } from './conceptMaps.js';
import {
  emptyPreferences,
  extractLearningPreferences,
} from './learningPreferences.js';
import { buildPersonalizedMindMap, buildMissAttempt } from './buildMindMap.js';

export function useBehavioralTelemetry({
  enabled = true,
  quizOpen = false,
  quizKey = null,
  levelId = null,
  /** Live level elapsed seconds from farm gameplay */
  levelElapsedSec = 0,
  /** Game-reported level retry counter (fallback) */
  externalRetries = 0,
  thresholds = AVATAR_THRESHOLDS,
} = {}) {
  const [session, setSession] = useState(() => emptySession());
  const [metrics, setMetrics] = useState(() => emptyMetrics());
  const [trigger, setTrigger] = useState(null);
  const [misconceptions, setMisconceptions] = useState([]);
  const [learningPrefs, setLearningPrefs] = useState(() => emptyPreferences());
  const [activeMindMap, setActiveMindMap] = useState(null);

  const clicksRef = useRef([]);
  const questionOpenedAtRef = useRef(null);
  const questionAttemptsRef = useRef(0);
  const consecutiveFailsRef = useRef(0);
  const correctRef = useRef(0);
  const incorrectRef = useRef(0);
  const levelRetriesRef = useRef(0);
  const timesSecRef = useRef([]);
  const questionHistoryRef = useRef([]); // { correctFirst, timeSec }
  const levelHistoryRef = useRef([]); // { accuracy, avgTime, retries }
  const priorLevelAccuracyRef = useRef(null);
  const currentLevelIdRef = useRef(levelId);
  const cooldownUntilRef = useRef(0);
  const lastEvalAtRef = useRef(0);
  const raisedForQuizRef = useRef(null);
  const levelEnteredAtRef = useRef(Date.now());
  const stagnationTimerRef = useRef(null);
  const levelStagTimerRef = useRef(null);
  const firstAttemptCorrectStreakRef = useRef(0);
  const milestoneFlagRef = useRef(false);
  const lastTriggerModeRef = useRef(null);
  const lastWrongRef = useRef(null);
  const misconceptionsRef = useRef(new Map()); // topic -> entry
  const mindMapTopicsRaisedRef = useRef(new Set());
  const raiseSeqRef = useRef(0);

  const listMisconceptions = useCallback(() => {
    return [...misconceptionsRef.current.values()]
      .map((e) => ({ ...e }))
      .sort((a, b) => b.missCount - a.missCount);
  }, []);

  const recordMisconception = useCallback(
    (questionData, selectedText) => {
      const attempt = buildMissAttempt(questionData, selectedText);
      const topic =
        resolveTopicKey(attempt.topic) || attempt.topic || 'General Science';

      const prev = misconceptionsRef.current.get(topic) || {
        topic,
        missCount: 0,
        prompts: [],
        wrongAnswers: [],
        correctAnswers: [],
        attempts: [],
        lastAt: 0,
      };

      const next = {
        topic,
        missCount: prev.missCount + 1,
        prompts: [...prev.prompts, attempt.prompt].filter(Boolean).slice(-8),
        wrongAnswers: [
          ...prev.wrongAnswers,
          attempt.studentAnswer || '(no selection)',
        ].slice(-8),
        correctAnswers: [
          ...prev.correctAnswers,
          attempt.correctAnswer,
        ]
          .filter(Boolean)
          .slice(-8),
        attempts: [...(prev.attempts || []), attempt].slice(-8),
        lastAt: Date.now(),
        lastQuestionId: attempt.questionId,
        lastCorrectAnswer: attempt.correctAnswer,
        lastOptions: attempt.options || [],
        hint: attempt.hint || prev.hint || null,
      };
      misconceptionsRef.current.set(topic, next);
      const list = listMisconceptions();
      setMisconceptions(list);

      // Map merges EVERY incorrect attempt across all topics/concepts
      const allAttempts = list.flatMap((m) => m.attempts || []);
      const mindMap = buildPersonalizedMindMap({
        topic,
        questionData,
        studentWrongAnswer: selectedText,
        misconceptions: list,
        attempts: allAttempts,
      });
      setActiveMindMap(mindMap);

      return { entry: next, mindMap, list, attempt };
    },
    [listMisconceptions],
  );

  const updateLearningPreferences = useCallback((message) => {
    setLearningPrefs((prev) => extractLearningPreferences(message, prev));
  }, []);

  const showMindMapForTopic = useCallback(
    (topic = null) => {
      const list = listMisconceptions();
      // Always include all misconceptions so one map covers every struggle
      const allAttempts = list.flatMap((m) => m.attempts || []);
      const map = buildPersonalizedMindMap({
        topic: topic || list[0]?.topic || null,
        misconceptions: list,
        attempts: allAttempts,
      });
      setActiveMindMap(map);
      return map;
    },
    [listMisconceptions],
  );

  const syncMetrics = useCallback(() => {
    const correct = correctRef.current;
    const incorrect = incorrectRef.current;
    const total = correct + incorrect;
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 100;
    const avgTime =
      timesSecRef.current.length > 0
        ? timesSecRef.current.reduce((a, b) => a + b, 0) /
          timesSecRef.current.length
        : 0;
    const currentTimeSec = questionOpenedAtRef.current
      ? (Date.now() - questionOpenedAtRef.current) / 1000
      : 0;

    const prior = priorLevelAccuracyRef.current;
    const deltaPts =
      prior == null || total === 0 ? 0 : accuracyPct - prior;

    const now = Date.now();
    const recentClicks = clicksRef.current.filter(
      (t) => now - t < thresholds.rageClickWindowMs,
    ).length;
    const density = clickDensityLabel(
      recentClicks,
      thresholds.rageClickWindowMs,
      thresholds.rageClickCount,
    );

    const fastCount = timesSecRef.current.filter(
      (s) => s > 0 && s <= thresholds.fastQuestionSec,
    ).length;
    const fastRatio =
      timesSecRef.current.length > 0
        ? fastCount / timesSecRef.current.length
        : 0;

    const levelRetries = Math.max(
      levelRetriesRef.current,
      Number(externalRetries) || 0,
    );

    const conceptEntries = [...misconceptionsRef.current.values()];
    const maxConceptMisses = conceptEntries.reduce(
      (m, e) => Math.max(m, e.missCount || 0),
      0,
    );
    const topMissed =
      conceptEntries.sort((a, b) => (b.missCount || 0) - (a.missCount || 0))[0] ||
      null;

    const next = {
      level_retries_count: levelRetries,
      question_attempts: questionAttemptsRef.current,
      click_pattern_density: density,
      time_per_question_avg_sec: Math.round(avgTime * 10) / 10,
      time_per_question_current_sec: Math.round(currentTimeSec * 10) / 10,
      correct_answers: correct,
      incorrect_answers: incorrect,
      answer_accuracy_counts: { correct, incorrect },
      accuracy_percentage: accuracyPct,
      performance_delta_points: deltaPts,
      performance_delta: formatPerformanceDelta(deltaPts),
      overall_progress_trend: trendFromDelta(deltaPts, accuracyPct),
      first_attempt_correct_streak:
        firstAttemptCorrectStreakRef.current >=
        (thresholds.firstTryStreakForMilestone || 4),
      fast_question_ratio: Math.round(fastRatio * 100) / 100,
      level_elapsed_sec: Math.max(
        Number(levelElapsedSec) || 0,
        (Date.now() - levelEnteredAtRef.current) / 1000,
      ),
      level_completed_recently: false,
      milestone_just_achieved: milestoneFlagRef.current,
      consecutive_fails: consecutiveFailsRef.current,
      max_concept_misses: maxConceptMisses,
      top_missed_concept: topMissed?.topic || null,
    };

    setMetrics(next);
    setSession((prev) => ({
      ...prev,
      consecutiveFails: consecutiveFailsRef.current,
      lastWrongAnswer: prev.lastWrongAnswer,
      frustrationScore: computeFrustration(next),
      timeOnQuestionMs: Math.round(currentTimeSec * 1000),
      metrics: next,
    }));
    return next;
  }, [externalRetries, levelElapsedSec, thresholds]);

  const raiseFromEval = useCallback(
    (evaluation, snapshot, reasonExtra = null) => {
      if (!enabled || !evaluation) return false;
      const now = Date.now();

      // Cooldown after student closes mentor
      if (now < cooldownUntilRef.current) {
        return false;
      }

      // Soft throttle only for enrichment re-pop; never block struggle help
      if (now - lastEvalAtRef.current < thresholds.reevalMinIntervalMs) {
        const isEnrich =
          evaluation.intervention_mode ===
          INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE;
        if (isEnrich && lastTriggerModeRef.current === evaluation.intervention_mode) {
          return false;
        }
      }

      // Do NOT block support interventions with per-quiz guard —
      // multi-question streaks must be able to open across quiz keys.
      const isSupport =
        evaluation.intervention_mode ===
        INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;
      if (
        !isSupport &&
        evaluation.reason !== 'manual' &&
        raisedForQuizRef.current === quizKey &&
        quizKey != null
      ) {
        return false;
      }

      lastEvalAtRef.current = now;
      lastTriggerModeRef.current = evaluation.intervention_mode;
      if (quizKey != null && !isSupport) {
        raisedForQuizRef.current = quizKey;
      }

      const triggerId = (raiseSeqRef.current += 1);
      const payload = {
        id: triggerId,
        reason: reasonExtra || evaluation.reason,
        intervention_mode: evaluation.intervention_mode,
        perceived_state: evaluation.perceived_state,
        confidence: evaluation.confidence,
        scenario: evaluation.scenario || null,
        indicators: evaluation.indicators || [],
        offerMindMap: Boolean(evaluation.offerMindMap),
        at: now,
        consecutiveFails: consecutiveFailsRef.current,
        frustrationScore: computeFrustration(snapshot),
        timeOnQuestionMs: Math.round(
          (snapshot.time_per_question_current_sec || 0) * 1000,
        ),
        lastWrongAnswer: lastWrongRef.current,
        metrics: snapshot,
        mindMap: evaluation.mindMap || null,
      };

      setTrigger(payload);
      setSession((prev) => ({
        ...prev,
        lastTriggerReason: payload.reason,
        lastInterventionMode: evaluation.intervention_mode,
        frustrationScore: payload.frustrationScore,
        consecutiveFails: consecutiveFailsRef.current,
        lastWrongAnswer: lastWrongRef.current,
        timeOnQuestionMs: payload.timeOnQuestionMs,
        triggerCount: prev.triggerCount + 1,
        metrics: snapshot,
      }));
      milestoneFlagRef.current = false;
      return true;
    },
    [enabled, quizKey, thresholds.reevalMinIntervalMs],
  );

  const runEvaluation = useCallback(
    (opts = {}) => {
      if (!enabled) return null;
      const snapshot = syncMetrics();
      const evaluation = evaluateStudentState(snapshot, {
        ...opts,
        thresholds,
      });
      if (evaluation) {
        raiseFromEval(evaluation, snapshot);
      }
      return evaluation;
    },
    [enabled, raiseFromEval, syncMetrics, thresholds],
  );

  const clearTrigger = useCallback(() => {
    setTrigger(null);
    cooldownUntilRef.current = Date.now() + thresholds.cooldownMs;
  }, [thresholds.cooldownMs]);

  const resetSession = useCallback(() => {
    consecutiveFailsRef.current = 0;
    correctRef.current = 0;
    incorrectRef.current = 0;
    levelRetriesRef.current = 0;
    questionAttemptsRef.current = 0;
    timesSecRef.current = [];
    questionHistoryRef.current = [];
    levelHistoryRef.current = [];
    priorLevelAccuracyRef.current = null;
    firstAttemptCorrectStreakRef.current = 0;
    milestoneFlagRef.current = false;
    clicksRef.current = [];
    raisedForQuizRef.current = null;
    lastTriggerModeRef.current = null;
    lastWrongRef.current = null;
    misconceptionsRef.current = new Map();
    mindMapTopicsRaisedRef.current = new Set();
    levelEnteredAtRef.current = Date.now();
    setSession(emptySession());
    setMetrics(emptyMetrics());
    setMisconceptions([]);
    setLearningPrefs(emptyPreferences());
    setActiveMindMap(null);
    setTrigger(null);
  }, []);

  // Level change → archive prior accuracy for performance_delta + trend
  useEffect(() => {
    if (levelId == null) return;
    if (currentLevelIdRef.current === levelId) return;

    const correct = correctRef.current;
    const incorrect = incorrectRef.current;
    const total = correct + incorrect;
    if (total > 0) {
      const accuracyPct = Math.round((correct / total) * 100);
      const avgTime =
        timesSecRef.current.length > 0
          ? timesSecRef.current.reduce((a, b) => a + b, 0) /
            timesSecRef.current.length
          : 0;
      levelHistoryRef.current = [
        ...levelHistoryRef.current.slice(-8),
        {
          levelId: currentLevelIdRef.current,
          accuracy: accuracyPct,
          avgTime,
          retries: levelRetriesRef.current,
        },
      ];
      priorLevelAccuracyRef.current = accuracyPct;

      // Rapid completion celebration on level change with strong metrics
      if (
        accuracyPct >= 85 &&
        (Date.now() - levelEnteredAtRef.current) / 1000 <=
          thresholds.rapidLevelSec &&
        levelRetriesRef.current <= 1
      ) {
        milestoneFlagRef.current = true;
      }
    }

    currentLevelIdRef.current = levelId;
    levelRetriesRef.current = 0;
    questionAttemptsRef.current = 0;
    timesSecRef.current = [];
    correctRef.current = 0;
    incorrectRef.current = 0;
    consecutiveFailsRef.current = 0;
    levelEnteredAtRef.current = Date.now();
    raisedForQuizRef.current = null;
    syncMetrics();
    if (milestoneFlagRef.current) {
      window.setTimeout(() => runEvaluation({ forceEval: true }), 80);
    }
  }, [levelId, runEvaluation, syncMetrics, thresholds.rapidLevelSec]);

  const recordAnswer = useCallback(
    ({ isCorrect, selectedText = null, questionData = null } = {}) => {
      if (!enabled) return;
      const opened = questionOpenedAtRef.current;
      const elapsedSec = opened ? (Date.now() - opened) / 1000 : 0;
      if (elapsedSec > 0) {
        timesSecRef.current = [...timesSecRef.current.slice(-40), elapsedSec];
      }

      questionAttemptsRef.current += 1;
      const attemptsOnThisQ = questionAttemptsRef.current;

      if (isCorrect) {
        correctRef.current += 1;
        consecutiveFailsRef.current = 0;
        if (attemptsOnThisQ === 1) {
          firstAttemptCorrectStreakRef.current += 1;
          if (
            firstAttemptCorrectStreakRef.current >=
            (thresholds.firstTryStreakForMilestone || 4)
          ) {
            // Milestone only after sustained first-try success (not every streak of 3)
            milestoneFlagRef.current = true;
          }
        } else {
          firstAttemptCorrectStreakRef.current = 0;
        }
        questionHistoryRef.current.push({
          correctFirst: attemptsOnThisQ === 1,
          timeSec: elapsedSec,
        });
        questionAttemptsRef.current = 0;
        questionOpenedAtRef.current = Date.now();
        lastWrongRef.current = null;
        setSession((prev) => ({
          ...prev,
          consecutiveFails: 0,
          lastWrongAnswer: null,
        }));
        // Correct answers almost never auto-open mentor mid-level —
        // only true milestones (flagged above) pass forceEval.
        if (!milestoneFlagRef.current) return;
        const snap = syncMetrics();
        const evaluation = evaluateStudentState(snap, {
          forceEval: true,
          thresholds,
        });
        if (evaluation) raiseFromEval(evaluation, snap);
        return;
      }

      incorrectRef.current += 1;
      consecutiveFailsRef.current += 1;
      levelRetriesRef.current += 1;
      firstAttemptCorrectStreakRef.current = 0;
      if (selectedText) lastWrongRef.current = selectedText;
      setSession((prev) => ({
        ...prev,
        consecutiveFails: consecutiveFailsRef.current,
        lastWrongAnswer: lastWrongRef.current,
      }));

      // Always record misconceptions + rebuild map quietly (no popup yet)
      let mindMap = null;
      let conceptEntry = null;
      try {
        if (questionData || selectedText) {
          const recorded = recordMisconception(questionData, selectedText);
          mindMap = recorded.mindMap;
          conceptEntry = recorded.entry;
        }
      } catch {
        /* map builder must not block intervention */
      }

      const snap = syncMetrics();
      const totalWrong = incorrectRef.current;
      const conceptMisses = Math.max(
        conceptEntry?.missCount || 0,
        snap.max_concept_misses || 0,
      );

      // Fire eval once thresholds are reached (total OR consecutive OR retries OR concept)
      const readyForEval =
        totalWrong >= (thresholds.totalIncorrectForSupport || 4) ||
        conceptMisses >= (thresholds.conceptMissesForMindMap || 4) ||
        consecutiveFailsRef.current >= (thresholds.consecutiveFails || 4) ||
        levelRetriesRef.current >= (thresholds.levelRetriesSupport || 4);

      if (!readyForEval) {
        return;
      }

      const evaluation = evaluateStudentState(snap, {
        forceEval: true,
        thresholds,
      });

      if (!evaluation) return;

      // Prefer latest mind map when offering concept help
      const withMap = {
        ...evaluation,
        mindMap:
          evaluation.offerMindMap !== false ? mindMap || null : null,
      };

      raiseFromEval(withMap, snap, evaluation.reason);
    },
    [
      enabled,
      raiseFromEval,
      recordMisconception,
      syncMetrics,
      thresholds,
    ],
  );

  const requestHelp = useCallback(() => {
    if (!enabled) return;
    const snapshot = syncMetrics();
    const classified = evaluateStudentState(snapshot, {
      forceEval: true,
      thresholds,
    });
    const evaluation = classified || {
      intervention_mode: INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
      perceived_state: 'STEADY',
      reason: 'manual',
      confidence: 1,
    };
    // Manual always allowed past quiz guard + cooldown
    raisedForQuizRef.current = null;
    cooldownUntilRef.current = 0;
    lastEvalAtRef.current = 0;
    raiseFromEval(
      { ...evaluation, reason: 'manual' },
      snapshot,
      'manual',
    );
  }, [enabled, raiseFromEval, syncMetrics, thresholds]);

  // Question open → stagnation timer → evaluateStudentState
  useEffect(() => {
    if (!enabled || !quizOpen) {
      questionOpenedAtRef.current = null;
      if (stagnationTimerRef.current) {
        window.clearTimeout(stagnationTimerRef.current);
        stagnationTimerRef.current = null;
      }
      return undefined;
    }

    questionOpenedAtRef.current = Date.now();
    questionAttemptsRef.current = 0;
    raisedForQuizRef.current = null;
    if (stagnationTimerRef.current) {
      window.clearTimeout(stagnationTimerRef.current);
    }
    stagnationTimerRef.current = window.setTimeout(() => {
      runEvaluation({ questionStagnant: true, levelStagnant: false });
    }, thresholds.questionStagnationMs);

    return () => {
      if (stagnationTimerRef.current) {
        window.clearTimeout(stagnationTimerRef.current);
        stagnationTimerRef.current = null;
      }
    };
  }, [
    enabled,
    quizOpen,
    quizKey,
    runEvaluation,
    thresholds.questionStagnationMs,
  ]);

  // Level temporal stagnation (not answering / stuck in level)
  useEffect(() => {
    if (!enabled || !levelId) return undefined;

    if (levelStagTimerRef.current) {
      window.clearTimeout(levelStagTimerRef.current);
    }
    levelStagTimerRef.current = window.setTimeout(() => {
      runEvaluation({ levelStagnant: true });
    }, thresholds.levelStagnationMs);

    return () => {
      if (levelStagTimerRef.current) {
        window.clearTimeout(levelStagTimerRef.current);
        levelStagTimerRef.current = null;
      }
    };
  }, [enabled, levelId, runEvaluation, thresholds.levelStagnationMs]);

  // Periodic metric refresh + click density (when in farm)
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => {
      syncMetrics();
    }, 4000);
    return () => window.clearInterval(id);
  }, [enabled, syncMetrics]);

  // Rage-click density tracking
  useEffect(() => {
    if (!enabled) return undefined;

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.avatar-assistant-overlay')) return;

      const now = Date.now();
      const windowMs = thresholds.rageClickWindowMs;
      clicksRef.current = clicksRef.current
        .filter((t) => now - t < windowMs)
        .concat(now);

      if (clicksRef.current.length >= thresholds.rageClickCount) {
        clicksRef.current = [];
        const snapshot = syncMetrics();
        const forced = {
          ...snapshot,
          click_pattern_density: 'High/Rage',
        };
        // Rage alone is not enough — evaluateStudentState requires companion signals
        const evaluation = evaluateStudentState(forced, {
          forceEval: true,
          thresholds,
        });
        if (evaluation) {
          raiseFromEval(evaluation, forced, evaluation.reason || 'rage_clicks');
        }
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [
    enabled,
    raiseFromEval,
    syncMetrics,
    thresholds,
  ]);

  // Keep session lastWrong when recording wrong answers
  useEffect(() => {
    if (!trigger?.lastWrongAnswer) return;
    setSession((prev) => ({
      ...prev,
      lastWrongAnswer: trigger.lastWrongAnswer,
    }));
  }, [trigger?.lastWrongAnswer]);

  return {
    trigger,
    session,
    metrics,
    misconceptions,
    learningPrefs,
    activeMindMap,
    clearTrigger,
    resetSession,
    recordAnswer,
    requestHelp,
    runEvaluation,
    updateLearningPreferences,
    showMindMapForTopic,
    /** @deprecated alias */
    raise: requestHelp,
  };
}

/** Back-compat export name used by App.jsx */
export const useFrustrationTelemetry = useBehavioralTelemetry;

function emptySession() {
  return {
    consecutiveFails: 0,
    frustrationScore: 0,
    lastWrongAnswer: null,
    lastTriggerReason: null,
    lastInterventionMode: null,
    timeOnQuestionMs: 0,
    triggerCount: 0,
    metrics: emptyMetrics(),
  };
}

function emptyMetrics() {
  return {
    level_retries_count: 0,
    question_attempts: 0,
    click_pattern_density: 'Low/Calm',
    time_per_question_avg_sec: 0,
    time_per_question_current_sec: 0,
    correct_answers: 0,
    incorrect_answers: 0,
    answer_accuracy_counts: { correct: 0, incorrect: 0 },
    accuracy_percentage: 100,
    performance_delta_points: 0,
    performance_delta: '0%',
    overall_progress_trend: 'Stable',
    first_attempt_correct_streak: false,
    fast_question_ratio: 0,
    level_elapsed_sec: 0,
    level_completed_recently: false,
    milestone_just_achieved: false,
    consecutive_fails: 0,
    max_concept_misses: 0,
    top_missed_concept: null,
  };
}

function computeFrustration(m) {
  let score = 0;
  if ((m.accuracy_percentage || 100) < 50) score += 0.35;
  if ((m.level_retries_count || 0) >= 3) score += 0.3;
  if (/high|rage/i.test(m.click_pattern_density || '')) score += 0.25;
  if ((m.performance_delta_points || 0) <= -8) score += 0.15;
  return Math.min(1, score);
}

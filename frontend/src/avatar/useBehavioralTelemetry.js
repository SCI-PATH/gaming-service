/**
 * Continuous multi-metric behavioral tracker + auto intervention triggers.
 *
 * Tracks classic metrics plus non-wrong patterns (slow/hint/selection/pause/DDA)
 * and post-help suppression / escalated scaffolding via InterventionManager.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_THRESHOLDS,
  clickDensityLabel,
  formatPerformanceDelta,
  INTERVENTION_MODES,
  trendFromDelta,
} from './avatarConstants.js';
import { calculateFrustrationScore, shouldOpenFrustrationAgent } from '../data/frustrationModel.js';
import { evaluateStudentState } from './evaluateStudentState.js';
import { resolveTopicKey } from './conceptMaps.js';
import {
  emptyPreferences,
  extractLearningPreferences,
} from './learningPreferences.js';
import { buildPersonalizedMindMap, buildMissAttempt } from './buildMindMap.js';
import { recordIncorrectMindMap } from './mindMapHistoryStore.js';
import { classifyPerformanceTier } from './performanceTier.js';
import {
  DEFAULT_NON_WRONG_THRESHOLDS,
  evaluateNonWrongBehaviors,
  NON_WRONG_SCENARIOS,
} from './nonWrongBehaviorMonitor.js';
import {
  createInterventionManager,
  INTERVENTION_OUTCOMES,
} from './interventionManager.js';
import { buildInterventionFocus } from './interventionFocus.js';

export function useBehavioralTelemetry({
  enabled = true,
  quizOpen = false,
  quizKey = null,
  levelId = null,
  /** Live level elapsed seconds from farm gameplay */
  levelElapsedSec = 0,
  /** Game-reported level retry counter (fallback) */
  externalRetries = 0,
  enemyHits = 0,
  enemyDeaths = 0,
  levelRestarts = 0,
  previousAvgAnswerTimeSec = 0,
  /** Current DDA / gameplay band (e.g. weak | medium | smart) */
  gameplayBand = null,
  mastery = null,
  masteryBand = null,
  masterySource = null,
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
  const behaviorEventsRef = useRef([]);
  const hintUsedThisQuestionRef = useRef(false);
  const selectionSwitchesThisQRef = useRef(0);
  const recentHintsRef = useRef(0);
  const recentSwitchesRef = useRef(0);
  const lastOptionIdxRef = useRef(null);
  const longPauseThisQRef = useRef(false);
  const gameplayBandRef = useRef(gameplayBand);
  const masteryRef = useRef({
    mastery,
    masteryBand,
    masterySource,
    levelId,
  });
  masteryRef.current = { mastery, masteryBand, masterySource, levelId };
  const withMastery = (args) =>
    buildPersonalizedMindMap({
      ...args,
      mastery: masteryRef.current.mastery,
      masteryBand: masteryRef.current.masteryBand,
      masterySource: masteryRef.current.masterySource,
      levelId: masteryRef.current.levelId,
    });
  const interventionMgrRef = useRef(createInterventionManager());
  const lastNonWrongCodeRef = useRef(null);
  const lastFocusRef = useRef(null);
  const lastQuizDataRef = useRef(null);

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
      // Mind maps only exist for incorrect answers — always built + persisted here
      const mindMap = withMastery({
        topic,
        questionData,
        studentWrongAnswer: selectedText,
        misconceptions: list,
        attempts: allAttempts,
      });
      setActiveMindMap(mindMap);

      if (mindMap) {
        recordIncorrectMindMap({
          lessonTopic: topic,
          structuredMap: mindMap,
          studentWrongAnswer: selectedText || null,
          timestamp: Date.now(),
        });
      }

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
      const map = withMastery({
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
      enemy_hits: Number(enemyHits) || 0,
      enemy_deaths: Number(enemyDeaths) || 0,
      level_restarts: Number(levelRestarts) || 0,
      previous_avg_answer_time_sec: Number(previousAvgAnswerTimeSec) || 0,
      baseline_avg_answer_time_sec: Number(previousAvgAnswerTimeSec) || 0,
      // Rolling support for performance-locked diagnostics
      hints_used_recent: recentHintsRef.current,
      hint_count: recentHintsRef.current,
      selection_switch_count: recentSwitchesRef.current,
      answer_switches: recentSwitchesRef.current,
    };
    next.evaluated_tier = classifyPerformanceTier(next);
    next.frustration = calculateFrustrationScore(next);
    next.frustration_score = next.frustration.score;
    next.frustration_level = next.frustration.level;

    setMetrics(next);
    setSession((prev) => ({
      ...prev,
      consecutiveFails: consecutiveFailsRef.current,
      lastWrongAnswer: prev.lastWrongAnswer,
      frustrationScore: next.frustration.score,
      frustrationLevel: next.frustration.level,
      timeOnQuestionMs: Math.round(currentTimeSec * 1000),
      metrics: next,
    }));
    return next;
  }, [externalRetries, levelElapsedSec, thresholds, enemyHits, enemyDeaths, levelRestarts, previousAvgAnswerTimeSec]);

  const raiseFromEval = useCallback(
    (evaluation, snapshot, reasonExtra = null) => {
      if (!enabled || !evaluation) return false;
      const now = Date.now();

      const isEscalation =
        evaluation.scenarioCode === NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING ||
        evaluation.non_wrong_scenario_code ===
          NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING ||
        Boolean(evaluation.isEscalation);
      const hardStruggle = Boolean(
        evaluation.hardStruggle ||
          evaluation.generate_mind_map ||
          evaluation.offerMindMap ||
          String(evaluation.scenarioCode || evaluation.non_wrong_scenario_code || '')
            .toUpperCase()
            .includes('WRONG') ||
          String(evaluation.scenarioCode || evaluation.non_wrong_scenario_code || '')
            .toUpperCase()
            .includes('CONCEPT') ||
          String(evaluation.reason || '').includes('incorrect') ||
          String(evaluation.reason || '').includes('misconception'),
      );
      const gate = interventionMgrRef.current.gateIntervention({
        isEscalation,
        hardStruggle,
      });
      if (!gate.allow && evaluation.reason !== 'manual') {
        return false;
      }

      // Cooldown after student closes mentor — never block hard wrong/concept struggle
      if (now < cooldownUntilRef.current && !hardStruggle && evaluation.reason !== 'manual') {
        return false;
      }

      // Soft throttle only for enrichment re-pop; never block struggle help
      if (now - lastEvalAtRef.current < thresholds.reevalMinIntervalMs) {
        const isEnrich =
          evaluation.intervention_mode ===
          INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE;
        if (
          isEnrich &&
          lastTriggerModeRef.current === evaluation.intervention_mode &&
          !hardStruggle
        ) {
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
      const scenarioCode =
        evaluation.non_wrong_scenario_code ||
        evaluation.scenarioCode ||
        null;

      const misconceptions = listMisconceptions();
      const focus =
        evaluation.intervention_focus ||
        buildInterventionFocus({
          scenarioCode,
          reason: reasonExtra || evaluation.reason,
          scenario: evaluation.scenario,
          indicators: evaluation.indicators || [],
          evaluation,
          misconceptions,
          events: behaviorEventsRef.current,
          quiz: evaluation.quiz || lastQuizDataRef.current,
          mindMap: evaluation.mindMap || null,
          lastWrongAnswer: lastWrongRef.current,
          metrics: {
            ...snapshot,
            consecutive_fails: consecutiveFailsRef.current,
          },
          priorFocus: evaluation.priorFocus || lastFocusRef.current,
          isEscalation,
          compoundSignals: evaluation.compoundSignals || [],
        });

      lastFocusRef.current = focus;

      // Same-concept / repeated-wrong → ensure mind map present and offered
      let mindMap = evaluation.mindMap || null;
      const needMap =
        focus.require_mind_map ||
        focus.code === NON_WRONG_SCENARIOS.SAME_CONCEPT_STRUGGLE ||
        focus.code === NON_WRONG_SCENARIOS.REPEATED_WRONG ||
        focus.code === NON_WRONG_SCENARIOS.SLOW_AND_WRONG ||
        evaluation.offerMindMap ||
        evaluation.generate_mind_map ||
        hardStruggle;
      if (needMap && misconceptions.length) {
        const allAttempts = misconceptions.flatMap((m) => m.attempts || []);
        mindMap =
          mindMap ||
          withMastery({
            topic: focus.concept_topic || misconceptions[0]?.topic,
            misconceptions,
            attempts: allAttempts,
          });
        if (mindMap) setActiveMindMap(mindMap);
      }

      // Stamp mind map requirement onto focus for the modal
      if (needMap) {
        focus.require_mind_map = true;
        focus.offer_mind_map = true;
      }

      const payload = {
        id: triggerId,
        reason: reasonExtra || evaluation.reason || focus.code?.toLowerCase(),
        intervention_mode: evaluation.intervention_mode,
        perceived_state: evaluation.perceived_state,
        confidence: evaluation.confidence,
        scenario: evaluation.scenario || focus.code?.toLowerCase() || null,
        indicators: evaluation.indicators || focus.indicators || [],
        offerMindMap: Boolean(needMap || evaluation.offerMindMap),
        generate_mind_map: Boolean(
          needMap || evaluation.generate_mind_map || evaluation.offerMindMap,
        ),
        non_wrong_scenario_code: scenarioCode || focus.code,
        scenarioCode: scenarioCode || focus.code,
        intervention_focus: focus,
        at: now,
        consecutiveFails: consecutiveFailsRef.current,
        frustrationScore: snapshot.frustration_score ?? calculateFrustrationScore(snapshot).score,
        timeOnQuestionMs: Math.round(
          (snapshot.time_per_question_current_sec || 0) * 1000,
        ),
        lastWrongAnswer: lastWrongRef.current,
        metrics: {
          ...snapshot,
          non_wrong_scenario_code: scenarioCode || focus.code,
          intervention_focus: focus,
        },
        mindMap: mindMap || evaluation.mindMap || null,
      };

      setTrigger(payload);
      setSession((prev) => ({
        ...prev,
        lastTriggerReason: payload.reason,
        lastInterventionMode: evaluation.intervention_mode,
        lastNonWrongScenario: scenarioCode || focus.code,
        lastInterventionFocus: focus,
        frustrationScore: payload.frustrationScore,
        consecutiveFails: consecutiveFailsRef.current,
        lastWrongAnswer: lastWrongRef.current,
        timeOnQuestionMs: payload.timeOnQuestionMs,
        triggerCount: prev.triggerCount + 1,
        metrics: payload.metrics,
      }));
      milestoneFlagRef.current = false;
      if (
        evaluation.intervention_mode === INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD ||
        scenarioCode ||
        focus.code
      ) {
        interventionMgrRef.current.onInterventionDelivered({
          scenarioCode: scenarioCode || focus.code,
          mode: evaluation.intervention_mode,
          focus,
        });
      }
      return true;
    },
    [enabled, quizKey, thresholds.reevalMinIntervalMs, listMisconceptions],
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

  const nwThresholds = {
    ...DEFAULT_NON_WRONG_THRESHOLDS,
    slowQuestionSec: thresholds.nonWrongSlowSec || DEFAULT_NON_WRONG_THRESHOLDS.slowQuestionSec,
    consecutiveSlowCount:
      thresholds.nonWrongConsecutiveSlow ||
      DEFAULT_NON_WRONG_THRESHOLDS.consecutiveSlowCount,
    hintCountThreshold:
      thresholds.nonWrongHintCount || DEFAULT_NON_WRONG_THRESHOLDS.hintCountThreshold,
    longPauseSec:
      thresholds.nonWrongLongPauseSec || DEFAULT_NON_WRONG_THRESHOLDS.longPauseSec,
  };

  const pushBehaviorEvent = useCallback((event) => {
    behaviorEventsRef.current = [
      ...behaviorEventsRef.current.slice(-24),
      { at: Date.now(), ...event },
    ];
  }, []);

  const tryRaiseNonWrong = useCallback(
    (opts = {}) => {
      if (!enabled) return false;
      const misconceptions = listMisconceptions();
      const hit =
        opts.evaluation ||
        evaluateNonWrongBehaviors(behaviorEventsRef.current, {
          thresholds: nwThresholds,
          forceEscalated: Boolean(opts.forceEscalated),
          misconceptions,
          priorFocus: opts.priorFocus || lastFocusRef.current,
        });
      if (!hit) return false;

      const isEscalation =
        hit.scenarioCode === NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING ||
        opts.forceEscalated;
      const gate = interventionMgrRef.current.gateIntervention({
        isEscalation,
      });
      if (!gate.allow) return false;

      // Avoid spam of same non-wrong code within short window
      if (
        !isEscalation &&
        lastNonWrongCodeRef.current === hit.scenarioCode &&
        Date.now() - lastEvalAtRef.current < (thresholds.reevalMinIntervalMs || 8000)
      ) {
        return false;
      }

      const snapshot = syncMetrics();
      snapshot.non_wrong_scenario_code = hit.scenarioCode;
      snapshot.evaluated_tier =
        snapshot.evaluated_tier || classifyPerformanceTier(snapshot);

      const focus = buildInterventionFocus({
        scenarioCode: hit.scenarioCode,
        reason: hit.reason,
        scenario: hit.scenario,
        indicators: hit.indicators || [],
        evaluation: hit,
        misconceptions,
        events: behaviorEventsRef.current,
        quiz: lastQuizDataRef.current,
        mindMap: null,
        lastWrongAnswer: lastWrongRef.current,
        metrics: snapshot,
        priorFocus: opts.priorFocus || lastFocusRef.current,
        isEscalation,
        compoundSignals: hit.compoundSignals || [],
      });

      let mindMap = null;
      if (focus.require_mind_map || hit.offerMindMap) {
        const allAttempts = misconceptions.flatMap((m) => m.attempts || []);
        if (misconceptions.length) {
          mindMap = withMastery({
            topic: focus.concept_topic || hit.topic || misconceptions[0]?.topic,
            misconceptions,
            attempts: allAttempts,
          });
          if (mindMap) setActiveMindMap(mindMap);
        }
      }

      const raised = raiseFromEval(
        {
          intervention_mode:
            hit.intervention_mode || INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
          perceived_state: hit.perceived_state,
          reason: hit.reason || hit.scenarioCode?.toLowerCase(),
          scenario: hit.scenario,
          confidence: hit.confidence,
          indicators: hit.indicators || [],
          offerMindMap: Boolean(focus.require_mind_map || hit.offerMindMap),
          generate_mind_map: Boolean(focus.require_mind_map || hit.offerMindMap),
          scenarioCode: hit.scenarioCode,
          non_wrong_scenario_code: hit.scenarioCode,
          mindMap,
          intervention_focus: focus,
          compoundSignals: hit.compoundSignals || [],
          isEscalation,
          priorFocus: opts.priorFocus || lastFocusRef.current,
        },
        snapshot,
        hit.scenarioCode || hit.reason,
      );
      if (raised) {
        lastNonWrongCodeRef.current = hit.scenarioCode;
      }
      return raised;
    },
    [enabled, nwThresholds, raiseFromEval, syncMetrics, thresholds.reevalMinIntervalMs, listMisconceptions],
  );

  const clearTrigger = useCallback(() => {
    setTrigger(null);
    cooldownUntilRef.current = Date.now() + thresholds.cooldownMs;
    interventionMgrRef.current.onInterventionClosed();
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
    behaviorEventsRef.current = [];
    hintUsedThisQuestionRef.current = false;
    selectionSwitchesThisQRef.current = 0;
    lastOptionIdxRef.current = null;
    longPauseThisQRef.current = false;
    lastNonWrongCodeRef.current = null;
    lastFocusRef.current = null;
    lastQuizDataRef.current = null;
    interventionMgrRef.current.reset();
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
    ({
      isCorrect,
      selectedText = null,
      questionData = null,
      responseTimeMs = null,
    } = {}) => {
      if (!enabled) return;
      const opened = questionOpenedAtRef.current;
      const elapsedSec =
        responseTimeMs != null && responseTimeMs > 0
          ? responseTimeMs / 1000
          : opened
            ? (Date.now() - opened) / 1000
            : 0;
      if (elapsedSec > 0) {
        timesSecRef.current = [...timesSecRef.current.slice(-40), elapsedSec];
      }

      const slowSec = nwThresholds.slowQuestionSec || 45;
      const slow = elapsedSec >= slowSec;
      const usedHint = hintUsedThisQuestionRef.current;
      const selectionSwitches = selectionSwitchesThisQRef.current;
      const longPause = longPauseThisQRef.current;
      const topic =
        resolveTopicKey(questionData?.topic) ||
        questionData?.topic ||
        null;
      if (questionData) lastQuizDataRef.current = questionData;

      pushBehaviorEvent({
        type: 'answer',
        isCorrect: Boolean(isCorrect),
        timeSec: elapsedSec,
        slow,
        usedHint,
        selectionSwitches,
        longPause,
        topic,
        prompt: questionData?.prompt || questionData?.question || null,
        selectedText: selectedText || null,
      });

      // Post-help: allow hard wrong clusters even during soft grace
      // Pre-increment projected counts (this wrong is about to be counted)
      const projectedWrong = incorrectRef.current + (isCorrect ? 0 : 1);
      const projectedConsec = isCorrect
        ? 0
        : consecutiveFailsRef.current + 1;
      const preHard =
        !isCorrect &&
        (projectedConsec >= (thresholds.consecutiveFails || 3) ||
          projectedWrong >= (thresholds.totalIncorrectForSupport || 3));

      const post = interventionMgrRef.current.observePostHelpAnswer({
        isCorrect: Boolean(isCorrect),
        slow,
        usedHint,
        longPause,
        timeSec: elapsedSec,
        hardStruggle: preHard,
      });

      questionAttemptsRef.current += 1;
      const attemptsOnThisQ = questionAttemptsRef.current;

      // Reset per-question flags after capturing
      hintUsedThisQuestionRef.current = false;
      selectionSwitchesThisQRef.current = 0;
      lastOptionIdxRef.current = null;
      longPauseThisQRef.current = false;

      if (post.outcome === INTERVENTION_OUTCOMES.ESCALATE && isCorrect) {
        tryRaiseNonWrong({
          forceEscalated: true,
          priorFocus: post.priorFocus || lastFocusRef.current,
        });
      }

      if (isCorrect) {
        correctRef.current += 1;
        consecutiveFailsRef.current = 0;
        if (attemptsOnThisQ === 1) {
          firstAttemptCorrectStreakRef.current += 1;
          if (
            firstAttemptCorrectStreakRef.current >=
            (thresholds.firstTryStreakForMilestone || 4)
          ) {
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

        // Non-wrong patterns (slow streak, slow+hint compound, etc.)
        if (post.outcome !== INTERVENTION_OUTCOMES.SUPPRESS) {
          tryRaiseNonWrong();
        }

        if (!milestoneFlagRef.current) return;
        if (post.outcome === INTERVENTION_OUTCOMES.SUPPRESS) return;
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

      const readyForEval =
        totalWrong >= (thresholds.totalIncorrectForSupport || 3) ||
        conceptMisses >= (thresholds.conceptMissesForMindMap || 2) ||
        consecutiveFailsRef.current >= (thresholds.consecutiveFails || 3) ||
        levelRetriesRef.current >= (thresholds.levelRetriesSupport || 4);

      // Update post-help with concept-aware hardStruggle if we just crossed thresholds
      const hardStruggle = readyForEval;
      if (
        hardStruggle &&
        post.outcome === INTERVENTION_OUTCOMES.SUPPRESS
      ) {
        // Allow hard wrong re-open even if soft grace was set
        post.outcome = INTERVENTION_OUTCOMES.ALLOW;
        post.reason = 'hard_wrong_threshold';
      }

      if (!readyForEval) {
        // Soft non-wrong only when not yet a hard wrong cluster
        if (post.outcome !== INTERVENTION_OUTCOMES.SUPPRESS) {
          tryRaiseNonWrong();
        }
        return;
      }

      // Prefer concept / repeated-wrong evaluation (with mind map) over soft escalate
      const evaluation = evaluateStudentState(snap, {
        forceEval: true,
        thresholds,
      });

      if (!evaluation) {
        if (post.outcome === INTERVENTION_OUTCOMES.ESCALATE) {
          tryRaiseNonWrong({
            forceEscalated: true,
            priorFocus: post.priorFocus || lastFocusRef.current,
          });
        } else if (post.outcome !== INTERVENTION_OUTCOMES.SUPPRESS) {
          tryRaiseNonWrong();
        }
        return;
      }

      const misconceptionsList = listMisconceptions();
      const allAttempts = misconceptionsList.flatMap((m) => m.attempts || []);
      const mapForRaise =
        mindMap ||
        (allAttempts.length
          ? withMastery({
              topic:
                conceptEntry?.topic ||
                misconceptionsList[0]?.topic ||
                null,
              misconceptions: misconceptionsList,
              attempts: allAttempts,
            })
          : null);

      const withMap = {
        ...evaluation,
        hardStruggle: true,
        offerMindMap: true,
        generate_mind_map: true,
        mindMap: mapForRaise,
      };

      raiseFromEval(withMap, snap, evaluation.reason);
    },
    [
      enabled,
      nwThresholds,
      pushBehaviorEvent,
      raiseFromEval,
      recordMisconception,
      listMisconceptions,
      syncMetrics,
      thresholds,
      tryRaiseNonWrong,
    ],
  );

  const recordHintUsed = useCallback(() => {
    if (!enabled) return;
    hintUsedThisQuestionRef.current = true;
    recentHintsRef.current = Math.min(20, (recentHintsRef.current || 0) + 1);
    pushBehaviorEvent({ type: 'hint' });
    tryRaiseNonWrong();
  }, [enabled, pushBehaviorEvent, tryRaiseNonWrong]);

  const recordSelectionSwitch = useCallback(
    (optionIndex = null) => {
      if (!enabled) return;
      if (
        lastOptionIdxRef.current != null &&
        optionIndex != null &&
        lastOptionIdxRef.current !== optionIndex
      ) {
        selectionSwitchesThisQRef.current += 1;
        recentSwitchesRef.current = Math.min(
          40,
          (recentSwitchesRef.current || 0) + 1,
        );
        pushBehaviorEvent({
          type: 'selection_switch',
          selectionSwitches: 1,
        });
        tryRaiseNonWrong();
      }
      if (optionIndex != null) lastOptionIdxRef.current = optionIndex;
    },
    [enabled, pushBehaviorEvent, tryRaiseNonWrong],
  );

  const recordDdaBandChange = useCallback(
    (nextBand, priorBand = null) => {
      if (!enabled) return;
      const next = String(nextBand || '').toLowerCase();
      const prior = String(priorBand || gameplayBandRef.current || '').toLowerCase();
      gameplayBandRef.current = nextBand;
      const harder =
        (prior === 'weak' && (next === 'average' || next === 'advanced' || next === 'strong')) ||
        (prior === 'average' && (next === 'advanced' || next === 'strong' || next === 'smart')) ||
        (prior === 'developing' && next !== 'developing' && next !== 'weak');
      if (harder || (prior && next && prior !== next && difficultyRank(next) > difficultyRank(prior))) {
        pushBehaviorEvent({
          type: 'dda_up',
          ddaBand: next,
          priorDdaBand: prior,
        });
      }
    },
    [enabled, pushBehaviorEvent],
  );

  // Track DDA/gameplay band increases from props
  useEffect(() => {
    if (!enabled || gameplayBand == null) return;
    const prior = gameplayBandRef.current;
    if (prior != null && prior !== gameplayBand) {
      recordDdaBandChange(gameplayBand, prior);
    } else {
      gameplayBandRef.current = gameplayBand;
    }
  }, [enabled, gameplayBand, recordDdaBandChange]);

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
    hintUsedThisQuestionRef.current = false;
    selectionSwitchesThisQRef.current = 0;
    lastOptionIdxRef.current = null;
    longPauseThisQRef.current = false;
    if (stagnationTimerRef.current) {
      window.clearTimeout(stagnationTimerRef.current);
    }
    stagnationTimerRef.current = window.setTimeout(() => {
      longPauseThisQRef.current = true;
      pushBehaviorEvent({
        type: 'long_pause',
        longPause: true,
      });
      tryRaiseNonWrong();
      runEvaluation({ questionStagnant: true, levelStagnant: false });
    }, Math.min(
      thresholds.questionStagnationMs || 120000,
      (nwThresholds.longPauseSec || 90) * 1000,
    ));

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
    nwThresholds.longPauseSec,
    pushBehaviorEvent,
    tryRaiseNonWrong,
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
    recordHintUsed,
    recordSelectionSwitch,
    recordDdaBandChange,
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
    lastNonWrongScenario: null,
    timeOnQuestionMs: 0,
    triggerCount: 0,
    metrics: emptyMetrics(),
  };
}

function difficultyRank(band) {
  const b = String(band || '').toLowerCase();
  if (b === 'weak' || b === 'developing' || b === 'beginner' || b === 'emerging') return 1;
  if (b === 'average' || b === 'medium' || b === 'mediate' || b === 'proficient') return 2;
  if (b === 'advanced' || b === 'strong' || b === 'smart' || b === 'expert') {
    return 3;
  }
  return 0;
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
    evaluated_tier: 'MEDIUM',
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

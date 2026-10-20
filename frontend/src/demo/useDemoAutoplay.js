/**
 * Scripted demo of Discovery Grove.
 * Starts the farm, waits each profile’s response time, submits that answer,
 * shows Sage once, then either holds the unlock shop or opens the research dashboard.
 */
import { useEffect, useRef, useState } from 'react';
import { ForestGameBridge, FARM_EVENTS } from '../game/ForestGameBridge.js';
import { DEMO_PROFILES } from '../data/demoScenarios.js';
import { planDemoSubmission, shouldPresentDemoSage } from '../data/demoAutoplay.js';

/**
 * Starts the farm, waits each scripted response time, submits that answer,
 * shows Sage once, then leaves the real shop on screen before the dashboard.
 * A shop run buys unlocks and continues to the next level instead.
 */
export function useDemoAutoplay({
  enabled = false,
  shopRun = false,
  profileId = null,
  gameReady = false,
  resumeSettled = false,
  inFarm = false,
  appView = 'farm',
  quizPayload = null,
  questOpen = false,
  shopOpen = false,
  avatarOpen = false,
  frustrationLevel = 'low',
  frustrationScore = 0,
  startFarm,
  closeQuest,
  closeAvatar,
  openDashboard,
  onPrepare,
  presentSage,
}) {
  const attempts = DEMO_PROFILES[profileId]?.attempts || [];
  const [status, setStatus] = useState(
    enabled
      ? shopRun
        ? 'Starting Grade 6. This run buys unlocks, then shows them on the next level.'
        : 'Starting the farm. Answers will be submitted automatically.'
      : '',
  );
  const [demoSubmit, setDemoSubmit] = useState(null);
  const [demoDraft, setDemoDraft] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [stepTick, setStepTick] = useState(0);

  const startedRef = useRef(false);
  const stepRef = useRef(0);
  const submittedRef = useRef(false);
  const hadQuizRef = useRef(false);
  const openingRef = useRef(false);
  const blockedRef = useRef(false);
  const sageShownRef = useRef(false);
  const shopHeldRef = useRef(false);
  const openDashboardRef = useRef(openDashboard);
  openDashboardRef.current = openDashboard;

  useEffect(() => {
    // Boot the farm once the resume check has settled and the view is the farm.
    if (!enabled || startedRef.current) return;
    if (!gameReady || !resumeSettled || appView !== 'farm') return;
    startedRef.current = true;
    onPrepare?.();
    if (!inFarm) startFarm?.();
  }, [enabled, gameReady, resumeSettled, inFarm, appView, onPrepare, startFarm]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onInteraction = (payload = {}) => {
      // Assessment Engine had no question for this grade — stop the script.
      if (payload.type !== 'quiz_blocked') return;
      blockedRef.current = true;
      openingRef.current = false;
      setStatus(payload.hint || 'No science question was available for this grade.');
    };
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, onInteraction);
    return () => ForestGameBridge.off(FARM_EVENTS.INTERACTION, onInteraction);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !inFarm || appView !== 'farm') return undefined;
    // An open quiz, shop, Sage, or quest pauses the script so it does not open a second question.
    if (quizPayload || shopOpen || avatarOpen || questOpen) return undefined;
    if (blockedRef.current || shopHeldRef.current) return undefined;
    if (stepRef.current >= attempts.length) return undefined;
    const timer = window.setTimeout(() => {
      if (blockedRef.current || openingRef.current) return;
      openingRef.current = true;
      closeQuest?.();
      setStatus(`Opening question ${stepRef.current + 1} of ${attempts.length}.`);
      ForestGameBridge.emit(FARM_EVENTS.DEMO_OPEN_QUIZ);
      window.setTimeout(() => {
        openingRef.current = false;
      }, 10000);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    inFarm,
    appView,
    quizPayload,
    questOpen,
    shopOpen,
    avatarOpen,
    stepTick,
    attempts.length,
    closeQuest,
  ]);

  const question = quizPayload?.questionData || quizPayload?.question || null;
  const questionId = question?.id || question?.prompt || null;

  useEffect(() => {
    if (!enabled || !questionId || quizPayload?.loading) return undefined;
    const attempt = attempts[stepRef.current];
    if (!attempt) return undefined;
    const wait = Math.max(1000, Number(attempt.responseTimeMs) || 5000);
    const plan = planDemoSubmission(question, attempt);
    setHighlightIndex(null);
    setDemoSubmit(null);
    setDemoDraft('');
    setStatus(
      `Question ${stepRef.current + 1} of ${attempts.length} · waiting ${Math.round(wait / 1000)}s`,
    );
    let typeTimer = 0;
    // Short answers type out during the scripted wait; choices highlight just before submit.
    if (plan.kind === 'text' && plan.text) {
      const chars = Array.from(plan.text);
      const stepMs = Math.max(40, Math.min(110, Math.floor((wait - 500) / Math.max(chars.length, 1))));
      let count = 0;
      typeTimer = window.setInterval(() => {
        count += 1;
        setDemoDraft(chars.slice(0, count).join(''));
        if (count >= chars.length) window.clearInterval(typeTimer);
      }, stepMs);
    }
    const highlightTimer = window.setTimeout(() => {
      if (plan.kind === 'choice' && plan.index != null) setHighlightIndex(plan.index);
    }, Math.max(0, wait - 800));
    const submitTimer = window.setTimeout(() => {
      submittedRef.current = true;
      setDemoSubmit(plan);
      if (plan.unmatched) {
        setStatus('Answer key was not on this question. A stand-in answer was submitted.');
      } else if (attempt.wasCorrect) {
        setStatus('Submitted a correct answer.');
      } else {
        setStatus('Submitted an incorrect answer.');
      }
    }, wait);
    return () => {
      window.clearInterval(typeTimer);
      window.clearTimeout(highlightTimer);
      window.clearTimeout(submitTimer);
    };
  }, [enabled, questionId, quizPayload?.loading, attempts, question]);

  useEffect(() => {
    if (!enabled) return;
    const loaded = Boolean(questionId && !quizPayload?.loading);
    // Quiz closed after a submit — advance to the next scripted attempt.
    if (hadQuizRef.current && !quizPayload && submittedRef.current) {
      submittedRef.current = false;
      stepRef.current += 1;
      setHighlightIndex(null);
      setDemoSubmit(null);
      setDemoDraft('');
      setStepTick((n) => n + 1);
    }
    hadQuizRef.current = loaded;
    if (quizPayload) openingRef.current = false;
  }, [enabled, quizPayload, questionId]);

  useEffect(() => {
    if (!enabled || !stepTick || sageShownRef.current || avatarOpen) return;
    // Sage appears once, using the live frustration score rather than the demo profile name.
    if (
      !shouldPresentDemoSage({
        profileId,
        answeredCount: stepRef.current,
        liveLevel: frustrationLevel,
        alreadyShown: sageShownRef.current,
      })
    ) {
      return;
    }
    const opened = presentSage?.(frustrationScore);
    if (opened === false) return;
    sageShownRef.current = true;
    setStatus('Sage is here. The tone matches the live frustration score.');
  }, [enabled, stepTick, avatarOpen, profileId, frustrationLevel, frustrationScore, presentSage]);

  useEffect(() => {
    if (!enabled || !avatarOpen) return undefined;
    sageShownRef.current = true;
    // Leave Sage on screen long enough to read, then return to the farm.
    const timer = window.setTimeout(() => closeAvatar?.(), 16000);
    return () => window.clearTimeout(timer);
  }, [enabled, avatarOpen, closeAvatar]);

  useEffect(() => {
    if (!enabled || !shopRun) return undefined;
    const onInteraction = (detail = {}) => {
      if (detail.type === 'unlock_purchased') {
        setStatus(
          `Bought ${detail.itemName || 'an unlock'}. It appears on the next level.`,
        );
      }
      if (detail.type === 'unlock_placed') {
        const name = detail.itemName || 'That purchase';
        setStatus(`${name} is on this level — bought on the previous farm.`);
      }
    };
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, onInteraction);
    return () => ForestGameBridge.off(FARM_EVENTS.INTERACTION, onInteraction);
  }, [enabled, shopRun]);

  useEffect(() => {
    if (!enabled || !shopOpen || shopHeldRef.current) return undefined;
    shopHeldRef.current = true;
    // Shop-run demos stay in the unlock shop so purchases can show on the next level.
    if (shopRun) {
      setStatus('Unlock shop is open. Buying items for the next level.');
      return undefined;
    }
    // Standard demo leaves the priced shop up, then opens the research dashboard.
    setStatus('Shop is open. Item prices follow this run’s live frustration score.');
    window.setTimeout(() => {
      openDashboardRef.current?.();
      setStatus('Research dashboard for this demo run.');
    }, 12000);
    return undefined;
  }, [enabled, shopOpen, shopRun]);

  return {
    active: enabled,
    shopRun,
    status,
    demoSubmit,
    demoDraft,
    highlightIndex,
    // The weak demo profile is the one that surfaces a hint on the open question.
    demoShowHint: enabled && profileId === 'weak' && Boolean(questionId) && !quizPayload?.loading,
  };
}

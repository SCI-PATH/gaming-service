/**
 * InterventionManager — post-help suppression vs escalated scaffolding.
 *
 * After an avatar intervention closes:
 * - Improving students: suppress unnecessary re-triggers.
 * - Continued struggle/stall: fire ESCALATED_SCAFFOLDING.
 */

import { NON_WRONG_SCENARIOS } from './nonWrongBehaviorMonitor.js';

export const INTERVENTION_OUTCOMES = {
  ALLOW: 'ALLOW',
  SUPPRESS: 'SUPPRESS',
  ESCALATE: 'ESCALATE',
};

/**
 * Create a mutable intervention manager (plain object + methods).
 */
export function createInterventionManager(opts = {}) {
  const improveNeed = opts.improveStreakToSuppress ?? 2;
  const struggleNeed = opts.struggleToEscalate ?? 2;
  const suppressMs = opts.suppressMs ?? 120_000;
  const postHelpWindowAnswers = opts.postHelpWindowAnswers ?? 5;

  const state = {
    postHelpActive: false,
    answersSinceHelp: 0,
    improveStreak: 0,
    struggleStreak: 0,
    lastInterventionAt: 0,
    lastScenarioCode: null,
    lastMode: null,
    lastFocus: null,
    escalated: false,
    suppressedUntil: 0,
    helpCount: 0,
  };

  function onInterventionDelivered({
    scenarioCode = null,
    mode = null,
    focus = null,
  } = {}) {
    state.postHelpActive = true;
    state.answersSinceHelp = 0;
    state.improveStreak = 0;
    state.struggleStreak = 0;
    state.lastInterventionAt = Date.now();
    state.lastScenarioCode = scenarioCode;
    state.lastMode = mode;
    if (focus) state.lastFocus = focus;
    state.helpCount += 1;
    state.suppressedUntil = 0;
  }

  function onInterventionClosed() {
    state.postHelpActive = true;
    state.answersSinceHelp = 0;
    state.improveStreak = 0;
    state.struggleStreak = 0;
  }

  /**
   * Observe one completed question after help.
   * @returns {{ outcome: string, scenarioCode?: string, reason?: string }}
   */
  /**
   * After an open intervention, do not suppress further hard wrong-answer signals.
   * Soft (timing/hint) non-wrong re-triggers stay throttled.
   */
  function observePostHelpAnswer(obs = {}) {
    if (!state.postHelpActive) {
      if (Date.now() < state.suppressedUntil) {
        // Hard incorrect streak still allowed after soft suppress window
        if (obs.isCorrect === false && obs.hardStruggle) {
          return { outcome: INTERVENTION_OUTCOMES.ALLOW, reason: 'hard_struggle' };
        }
        return { outcome: INTERVENTION_OUTCOMES.SUPPRESS, reason: 'suppress_window' };
      }
      return { outcome: INTERVENTION_OUTCOMES.ALLOW };
    }

    state.answersSinceHelp += 1;
    const improving =
      obs.isCorrect === true &&
      !obs.slow &&
      !obs.usedHint &&
      !obs.longPause &&
      (obs.timeSec == null || obs.timeSec < 45);

    const struggling =
      obs.isCorrect === false ||
      obs.slow ||
      obs.usedHint ||
      obs.longPause ||
      (obs.timeSec != null && obs.timeSec >= 60);

    if (improving) {
      state.improveStreak += 1;
      state.struggleStreak = 0;
    } else if (struggling) {
      state.struggleStreak += 1;
      state.improveStreak = 0;
    }

    // Wrong-answer hard struggle always allowed after a prior mentor visit
    if (obs.isCorrect === false && obs.hardStruggle) {
      state.postHelpActive = false;
      return {
        outcome: INTERVENTION_OUTCOMES.ALLOW,
        reason: 'hard_wrong_struggle',
      };
    }

    if (state.improveStreak >= improveNeed) {
      state.postHelpActive = false;
      state.escalated = false;
      state.suppressedUntil = Date.now() + suppressMs;
      return { outcome: INTERVENTION_OUTCOMES.SUPPRESS, reason: 'improving' };
    }

    if (state.struggleStreak >= struggleNeed) {
      state.postHelpActive = false;
      state.escalated = true;
      return {
        outcome: INTERVENTION_OUTCOMES.ESCALATE,
        scenarioCode: NON_WRONG_SCENARIOS.ESCALATED_SCAFFOLDING,
        reason: 'continued_struggle',
        priorFocus: state.lastFocus,
        priorScenarioCode: state.lastScenarioCode,
      };
    }

    // Soft grace: only soft (non-wrong) reopens are damped
    if (state.answersSinceHelp < postHelpWindowAnswers && obs.isCorrect !== false) {
      return {
        outcome: INTERVENTION_OUTCOMES.SUPPRESS,
        reason: 'post_help_grace',
      };
    }

    state.postHelpActive = false;
    return { outcome: INTERVENTION_OUTCOMES.ALLOW };
  }

  function gateIntervention({ isEscalation = false, hardStruggle = false } = {}) {
    const now = Date.now();
    if (isEscalation || hardStruggle) {
      return { allow: true, escalate: Boolean(isEscalation), suppress: false };
    }
    if (now < state.suppressedUntil) {
      return { allow: false, escalate: false, suppress: true };
    }
    if (state.postHelpActive && state.answersSinceHelp < postHelpWindowAnswers) {
      return { allow: false, escalate: false, suppress: true };
    }
    return { allow: true, escalate: false, suppress: false };
  }

  function getState() {
    return { ...state };
  }

  function reset() {
    state.postHelpActive = false;
    state.answersSinceHelp = 0;
    state.improveStreak = 0;
    state.struggleStreak = 0;
    state.lastInterventionAt = 0;
    state.lastScenarioCode = null;
    state.lastMode = null;
    state.lastFocus = null;
    state.escalated = false;
    state.suppressedUntil = 0;
    state.helpCount = 0;
  }

  return {
    onInterventionDelivered,
    onInterventionClosed,
    observePostHelpAnswer,
    gateIntervention,
    getState,
    reset,
  };
}

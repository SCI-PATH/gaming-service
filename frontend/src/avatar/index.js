/**
 * Avatar Assistant — personalized learning companion (Groq Cloud).
 */
export { default as AvatarAssistantModal } from './AvatarAssistantModal.jsx';
export { default as ConceptMindMap } from './ConceptMindMap.jsx';
export {
  useBehavioralTelemetry,
  useFrustrationTelemetry,
} from './useBehavioralTelemetry.js';
export { evaluateStudentState, collectSupportIndicators } from './evaluateStudentState.js';
export { buildContextPayload, buildLlamaMessages } from './buildContextPayload.js';
export {
  buildPersonalizedMindMap,
  summarizeMindMapForLlm,
  extractQuestionFacts,
  buildMissAttempt,
  explainWhyWrong,
  explainCorrectIdea,
} from './buildMindMap.js';
export {
  QUESTION_FORMATS,
  extractLearningPreferences,
  formatPreferencesForPayload,
} from './learningPreferences.js';
export { requestAvatarChat, streamAvatarChat } from './avatarChatClient.js';
export { fetchAiMindMap } from './fetchAiMindMap.js';
export { default as SageAvatar } from './SageAvatar.jsx';
export {
  createSpeechEngine,
  buildMindMapNarration,
  buildMissCardNarration,
} from './createSpeechEngine.js';
export { createRealtimeSpeechCapture } from './createRealtimeSpeechCapture.js';
export {
  AVATAR_THRESHOLDS,
  QUICK_PROMPTS,
  DEFAULT_QUICK_PROMPTS,
  ADAPTIVE_PROBES,
  AVATAR_MOODS,
  INTERVENTION_MODES,
  PERCEIVED_STATES,
} from './avatarConstants.js';
export {
  classifyPerformanceTier,
  PERFORMANCE_TIERS,
  shouldGenerateMindMap,
} from './performanceTier.js';
export {
  evaluateNonWrongBehaviors,
  NON_WRONG_SCENARIOS,
  labelNonWrongScenario,
} from './nonWrongBehaviorMonitor.js';
export {
  createInterventionManager,
  INTERVENTION_OUTCOMES,
} from './interventionManager.js';
export {
  buildInterventionFocus,
  buildFocusedSpokenOpener,
  INTERVENTION_FOCUS_CODES,
  describeFocusCode,
} from './interventionFocus.js';
export {
  getBehaviorProbe,
  parseBehaviorChoice,
  buildBehaviorSupportReply,
  REASON_KEYS,
} from './behaviorDiagnostics.js';
export {
  freezeInterventionSession,
  buildSessionFollowUp,
  resolvePerformanceReply,
  GUIDANCE_LEVELS,
} from './mentorConversationSession.js';
export {
  loadMindMapHistory,
  recordIncorrectMindMap,
  clearMindMapHistory,
} from './mindMapHistoryStore.js';
export { default as MindMapHistoryDrawer } from './MindMapHistoryDrawer.jsx';

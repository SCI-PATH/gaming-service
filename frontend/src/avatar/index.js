/**
 * Avatar Assistant — personalized learning companion (Groq Cloud).
 */
/**
 * Farm-lesson barrel for Sage. She speaks beside the quiz, softens her
 * pace when frustration is high, and walks the in-game mind map of misses.
 * That map is built in this folder. It is not the learning-path engine map.
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
  scienceKeyIdea,
} from './buildMindMap.js';
export {
  normalizeSageMindMapInput,
  extractFillInStudentAnswer,
  extractFillInCorrectAnswer,
  extractTypedStudentAnswer,
  extractTypedCorrectAnswer,
  formatGroundTruthChoice,
  buildSageAssessment,
  isFillInQuestionType,
  isTypedAnswerQuestionType,
  usesSageFreeTextAnswer,
  SAGE_QUESTION_TYPES,
  SAGE_ASSESSMENT_TYPES,
} from './normalizeSageMindMapInput.js';
export {
  QUESTION_FORMATS,
  extractLearningPreferences,
  formatPreferencesForPayload,
} from './learningPreferences.js';
export { requestAvatarChat, streamAvatarChat } from './avatarChatClient.js';
export { fetchAiMindMap } from './fetchAiMindMap.js';
/** Portrait, browser speech, and the student's microphone. */
export { default as SageAvatar } from './SageAvatar.jsx';
export {
  createSpeechEngine,
  splitForTts,
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
/** Tutor loop: frustration tone, then a spoken turn locked to the farm miss. */
export {
  composeTutorTurn,
  compactTeachingState,
  detectQuestionType,
  frustrationDelivery,
  guardModelTutorReply,
  NEXT_ACTIONS,
} from './sageTutorLoop.js';
export {
  loadMindMapHistory,
  recordIncorrectMindMap,
  clearMindMapHistory,
} from './mindMapHistoryStore.js';
export { default as MindMapHistoryDrawer } from './MindMapHistoryDrawer.jsx';

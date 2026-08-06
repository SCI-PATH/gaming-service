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

/**
 * Adaptive storyline prototype — public API.
 *
 * MockStudentProvider → AptitudePerformanceData → FrustrationEngine
 *   → FrustrationProfile → StorylineGenerator → Grok → LevelStoryline
 *
 * Later replace MockAptitudeDataProvider via setAptitudePerformanceProvider.
 */

export {
  getAptitudePerformance,
  getAptitudePerformanceProvider,
  setAptitudePerformanceProvider,
  resetAptitudePerformanceProvider,
} from './aptitude/AptitudePerformanceProvider.js';

export {
  MockAptitudeDataProvider,
  RealAptitudeDataProvider,
} from './aptitude/MockAptitudeDataProvider.js';

export {
  MOCK_STORYLINE_STUDENTS,
  MOCK_APTITUDE_DATA,
  DEFAULT_SCIENCE_TOPIC,
  DEFAULT_GRADE,
  getMockStorylineStudent,
} from './aptitude/mockStudentProfiles.js';

export {
  FrustrationEngine,
  buildFrustrationProfile,
  normalizeAptitudeMetrics,
  frustrationLevelFromScore,
  FRUSTRATION_LEVELS,
  FRUSTRATION_WEIGHTS,
  METRIC_LABELS,
} from './frustration/FrustrationEngine.js';

export {
  loadStoredStoryline,
  saveStoredStoryline,
  clearStoredStoryline,
  loadStorylineProgress,
  saveStorylineProgress,
  clearStorylineProgress,
} from './storylineStore.js';

export { requestLevelStoryline } from './storylineClient.js';

export function isMockAptitudeStudent(student) {
  return Boolean(student?.isMockAptitudeStudent || student?.id?.startsWith('mock_student_'));
}

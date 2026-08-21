/**
 * Mock aptitude-test results for three login profiles.
 *
 * These stand in for the real aptitude-test component. Raw behavioral
 * metrics only — frustration scores are NEVER stored here.
 */

export const DEFAULT_SCIENCE_TOPIC = 'Plant Biology';
export const DEFAULT_GRADE = 7;

export const MOCK_STORYLINE_STUDENTS = Object.freeze([
  {
    id: 'mock_student_1',
    username: 'alex',
    displayName: 'Alex',
    grade: DEFAULT_GRADE,
    performanceLabel: 'Strong Performer',
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
  },
  {
    id: 'mock_student_2',
    username: 'jordan',
    displayName: 'Jordan',
    grade: DEFAULT_GRADE,
    performanceLabel: 'Average Performer',
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
  },
  {
    id: 'mock_student_3',
    username: 'sam',
    displayName: 'Sam',
    grade: DEFAULT_GRADE,
    performanceLabel: 'Struggling Performer',
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
  },
]);

/** @type {Record<string, object>} */
export const MOCK_APTITUDE_DATA = Object.freeze({
  mock_student_1: Object.freeze({
    studentId: 'mock_student_1',
    studentName: 'Alex',
    grade: DEFAULT_GRADE,
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
    performanceLabel: 'Strong Performer',
    aptitudeData: {
      totalQuestions: 20,
      correctAnswers: 18,
      incorrectAnswers: 2,
      consecutiveWrongAnswers: 1,
      averageAnswerTime: 6.2,
      baselineAnswerTime: 6.5,
      answerTimeTrend: 0.02,
      retryCount: 1,
      failedAttempts: 1,
      hintUsage: 0,
      answerChanges: 1,
      rapidClickCount: 0,
      mouseMovementScore: 10,
      mouseInactivitySeconds: 5,
      repeatedUIInteractions: 1,
      questionsSkipped: 0,
      activityRestarts: 0,
      levelRestarts: 0,
      enemyDeaths: 0,
      performanceDecline: 0.05,
    },
  }),

  mock_student_2: Object.freeze({
    studentId: 'mock_student_2',
    studentName: 'Jordan',
    grade: DEFAULT_GRADE,
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
    performanceLabel: 'Average Performer',
    aptitudeData: {
      totalQuestions: 20,
      correctAnswers: 10,
      incorrectAnswers: 10,
      consecutiveWrongAnswers: 4,
      averageAnswerTime: 11.8,
      baselineAnswerTime: 6.5,
      answerTimeTrend: 0.34,
      retryCount: 6,
      failedAttempts: 6,
      hintUsage: 5,
      answerChanges: 7,
      rapidClickCount: 11,
      mouseMovementScore: 55,
      mouseInactivitySeconds: 30,
      repeatedUIInteractions: 6,
      questionsSkipped: 3,
      activityRestarts: 2,
      levelRestarts: 2,
      enemyDeaths: 4,
      performanceDecline: 0.36,
    },
  }),

  mock_student_3: Object.freeze({
    studentId: 'mock_student_3',
    studentName: 'Sam',
    grade: DEFAULT_GRADE,
    scienceTopic: DEFAULT_SCIENCE_TOPIC,
    performanceLabel: 'Struggling Performer',
    aptitudeData: {
      totalQuestions: 20,
      correctAnswers: 6,
      incorrectAnswers: 14,
      consecutiveWrongAnswers: 5,
      averageAnswerTime: 14.8,
      baselineAnswerTime: 6.5,
      answerTimeTrend: 0.48,
      retryCount: 9,
      failedAttempts: 10,
      hintUsage: 8,
      answerChanges: 11,
      rapidClickCount: 18,
      mouseMovementScore: 82,
      mouseInactivitySeconds: 48,
      repeatedUIInteractions: 9,
      questionsSkipped: 5,
      activityRestarts: 3,
      levelRestarts: 3,
      enemyDeaths: 6,
      performanceDecline: 0.58,
    },
  }),
});

export function getMockStorylineStudent(id) {
  return MOCK_STORYLINE_STUDENTS.find((s) => s.id === id) || null;
}

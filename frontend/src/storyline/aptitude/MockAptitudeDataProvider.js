/**
 * Mock aptitude-test data provider.
 *
 * Swap this for RealAptitudeDataProvider later:
 *
 *   setAptitudePerformanceProvider(RealAptitudeDataProvider)
 *
 * FrustrationEngine must not import this file.
 */

import {
  MOCK_APTITUDE_DATA,
  getMockStorylineStudent,
} from './mockStudentProfiles.js';

export const MockAptitudeDataProvider = {
  id: 'mock',

  /**
   * @param {string} studentId
   * @returns {object | null} AptitudePerformanceData
   */
  getByStudentId(studentId) {
    const packed = MOCK_APTITUDE_DATA[studentId];
    if (!packed) return null;
    const meta = getMockStorylineStudent(studentId);
    return {
      studentId: packed.studentId,
      studentName: packed.studentName,
      grade: packed.grade,
      scienceTopic: packed.scienceTopic,
      performanceLabel: packed.performanceLabel,
      source: 'mock_aptitude_test',
      aptitudeData: { ...packed.aptitudeData },
      ...(meta ? { username: meta.username } : {}),
    };
  },

  listStudentIds() {
    return Object.keys(MOCK_APTITUDE_DATA);
  },
};

/**
 * Placeholder for the real aptitude-test component.
 * Wire this in without changing FrustrationEngine or StorylineGenerator.
 */
export const RealAptitudeDataProvider = {
  id: 'real',
  getByStudentId() {
    throw new Error(
      'RealAptitudeDataProvider is not connected. Use MockAptitudeDataProvider until the aptitude-test component is wired.',
    );
  },
  listStudentIds() {
    return [];
  },
};

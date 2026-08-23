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
import { readStoredAptitudeResult } from '../../data/aptitudeProgress.js';

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

export const RealAptitudeDataProvider = {
  id: 'real',
  getByStudentId(studentId) {
    if (!studentId) return null;
    return readStoredAptitudeResult(studentId);
  },
  listStudentIds() {
    return [];
  },
};

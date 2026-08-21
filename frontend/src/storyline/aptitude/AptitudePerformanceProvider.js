/**
 * Aptitude performance lookup.
 *
 * Default: MockAptitudeDataProvider
 * Later: setAptitudePerformanceProvider(RealAptitudeDataProvider)
 */

import { MockAptitudeDataProvider } from './MockAptitudeDataProvider.js';

/** @type {{ id: string, getByStudentId: Function, listStudentIds?: Function }} */
let activeProvider = MockAptitudeDataProvider;

export function getAptitudePerformanceProvider() {
  return activeProvider;
}

export function setAptitudePerformanceProvider(provider) {
  if (!provider || typeof provider.getByStudentId !== 'function') {
    throw new Error('Aptitude provider must implement getByStudentId(studentId)');
  }
  activeProvider = provider;
  return activeProvider;
}

export function resetAptitudePerformanceProvider() {
  activeProvider = MockAptitudeDataProvider;
  return activeProvider;
}

/**
 * @param {string} studentId
 * @returns {object | null}
 */
export function getAptitudePerformance(studentId) {
  if (!studentId) return null;
  return activeProvider.getByStudentId(studentId) || null;
}

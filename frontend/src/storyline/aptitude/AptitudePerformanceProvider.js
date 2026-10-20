/**
 * Aptitude performance lookup.
 *
 * Default: MockAptitudeDataProvider
 * Later: setAptitudePerformanceProvider(RealAptitudeDataProvider)
 */

import { MockAptitudeDataProvider } from './MockAptitudeDataProvider.js';

/** @type {{ id: string, getByStudentId: Function, listStudentIds?: Function }} */
let activeProvider = MockAptitudeDataProvider;

/** Active lookup used by the storyline. Starts as the mock provider. */
export function getAptitudePerformanceProvider() {
  return activeProvider;
}

/** Swap in a real aptitude source. It must implement getByStudentId. */
export function setAptitudePerformanceProvider(provider) {
  if (!provider || typeof provider.getByStudentId !== 'function') {
    throw new Error('Aptitude provider must implement getByStudentId(studentId)');
  }
  activeProvider = provider;
  return activeProvider;
}

/** Restore the mock provider (tests and the storyline prototype). */
export function resetAptitudePerformanceProvider() {
  activeProvider = MockAptitudeDataProvider;
  return activeProvider;
}

/** Storyline lookup for this student, or null when the active provider has no row. */
/**
 * @param {string} studentId
 * @returns {object | null}
 */
export function getAptitudePerformance(studentId) {
  if (!studentId) return null;
  return activeProvider.getByStudentId(studentId) || null;
}

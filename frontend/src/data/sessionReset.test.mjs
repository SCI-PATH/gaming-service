import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  clearStudentLocalGameplay,
  consumeFreshLogin,
  markFreshLogin,
} from './sessionReset.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe('session reset', () => {
  beforeEach(() => {
    global.localStorage = memoryStorage();
    global.sessionStorage = memoryStorage();
  });

  it('clears one student without touching another', () => {
    localStorage.setItem('scipath_farm_run__ada', '{"levelId":3}');
    localStorage.setItem('scipath_farm_run__ben', '{"levelId":4}');
    localStorage.setItem('scipath_progress_generation', '6');
    clearStudentLocalGameplay('ada');
    assert.equal(localStorage.getItem('scipath_farm_run__ada'), null);
    assert.equal(localStorage.getItem('scipath_farm_run__ben'), '{"levelId":4}');
    assert.equal(localStorage.getItem('scipath_progress_generation'), '6');
  });

  it('marks the next login as a fresh game and consumes the flag once', () => {
    markFreshLogin('ada');
    assert.equal(consumeFreshLogin('ada'), true);
    assert.equal(consumeFreshLogin('ada'), false);
    assert.equal(consumeFreshLogin('ben'), false);
  });
});

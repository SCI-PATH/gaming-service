import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { consumeFreshLogin, markFreshLogin } from './sessionReset.js';

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

/**
 * Mirrors resolvePlatformLaunch's fresh-login startLevel selection.
 * A prior bug referenced undefined `fresh` and threw ReferenceError.
 */
function resolveStartLevel(studentId, startLevel) {
  const fresh = studentId ? consumeFreshLogin(studentId) : false;
  return fresh ? 1 : startLevel;
}

describe('platform launch fresh login', () => {
  beforeEach(() => {
    global.localStorage = memoryStorage();
    global.sessionStorage = memoryStorage();
  });

  it('uses startLevel 1 when fresh login flag is set', () => {
    markFreshLogin('stu-1');
    assert.equal(resolveStartLevel('stu-1', 4), 1);
  });

  it('keeps requested startLevel when not a fresh login', () => {
    assert.equal(resolveStartLevel('stu-2', 4), 4);
  });
});

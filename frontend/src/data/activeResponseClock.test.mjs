import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createActiveResponseClock } from './activeResponseClock.js';

describe('active response clock', () => {
  it('keeps running past the old countdown limit and stops on submit', () => {
    const clock = createActiveResponseClock(0);
    assert.equal(clock.elapsed(120_000), 120_000);
    assert.equal(clock.stop(125_000), 125_000);
    assert.equal(clock.stop(200_000), 125_000);
  });

  it('does not count time while the question is paused', () => {
    const clock = createActiveResponseClock(0);
    clock.pause(10_000);
    assert.equal(clock.elapsed(40_000), 10_000);
    clock.resume(40_000);
    assert.equal(clock.elapsed(45_000), 15_000);
  });
});

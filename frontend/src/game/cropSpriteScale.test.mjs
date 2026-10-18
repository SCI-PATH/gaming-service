import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cropCarryScale } from './cropSpriteScale.js';

describe('cropCarryScale (potato harvest sizing)', () => {
  it('boosts tiny Kenney produce without shrinking planted crops', () => {
    const tomato = cropCarryScale(16, 16, 0.7, 16);
    assert.ok(Math.abs(tomato - 0.7 * 1.7) < 1e-9);
  });

  it('fits large hm_potato (65×60) to ~tile size, not flat 0.7', () => {
    const potato = cropCarryScale(65, 60, 0.7, 16);
    const tomato = cropCarryScale(16, 16, 0.7, 16);
    const potatoPx = 65 * potato;
    const tomatoPx = 16 * tomato;
    // Display size should be comparable — not ~2.4× tomato
    assert.ok(potato < 0.7, 'large produce must shrink below fallback');
    assert.ok(
      Math.abs(potatoPx - tomatoPx) < 4,
      `potato ~${potatoPx.toFixed(1)}px vs tomato ~${tomatoPx.toFixed(1)}px`,
    );
  });

  it('does not change relative sizing of other small crops', () => {
    assert.equal(cropCarryScale(16, 16, 0.7, 16), cropCarryScale(14, 14, 0.7, 16));
  });
});

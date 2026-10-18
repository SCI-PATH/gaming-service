import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCropInteractPrompt } from './cropInteractPrompt.js';

describe('resolveCropInteractPrompt (walk-over harvest)', () => {
  it('hides the prompt while a quiz or input lock is active', () => {
    assert.equal(
      resolveCropInteractPrompt({
        quizOpen: true,
        hasReadyCrops: true,
        harvestUnlocked: false,
      }),
      null,
    );
    assert.equal(
      resolveCropInteractPrompt({
        farmInputLocked: true,
        hasReadyCrops: true,
        harvestUnlocked: true,
      }),
      null,
    );
  });

  it('does not ask for E on ready crops — walk-over collects them', () => {
    assert.equal(
      resolveCropInteractPrompt({
        hasReadyCrops: true,
        harvestUnlocked: false,
      }),
      null,
    );
    assert.equal(
      resolveCropInteractPrompt({
        hasReadyCrops: true,
        harvestUnlocked: true,
      }),
      null,
    );
  });

  it('keeps shop unload as a separate E action', () => {
    assert.equal(
      resolveCropInteractPrompt({
        nearShop: true,
        carriedCount: 2,
        hasReadyCrops: true,
        harvestUnlocked: true,
      }),
      'Press E to unload',
    );
  });

  it('prompts plant on empty beds without implying auto-harvest', () => {
    assert.equal(
      resolveCropInteractPrompt({
        onPlantableBed: true,
        canPlant: true,
      }),
      'Press E to plant',
    );
  });
});

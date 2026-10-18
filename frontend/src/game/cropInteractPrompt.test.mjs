import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCropInteractPrompt } from './cropInteractPrompt.js';

describe('resolveCropInteractPrompt (question-first harvest)', () => {
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

  it('asks for E to interact before the harvest quiz is unlocked', () => {
    assert.equal(
      resolveCropInteractPrompt({
        hasReadyCrops: true,
        harvestUnlocked: false,
      }),
      'Press E to interact',
    );
  });

  it('asks for E to harvest only after the quiz unlocks', () => {
    assert.equal(
      resolveCropInteractPrompt({
        hasReadyCrops: true,
        harvestUnlocked: true,
      }),
      'Press E to harvest',
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

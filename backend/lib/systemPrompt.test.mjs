/**
 * Sage spoken-skill polish for Groq replies.
 * Run: node --test backend/lib/systemPrompt.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { polishSageSpeech } from './systemPrompt.mjs';

describe('polishSageSpeech', () => {
  it('strips textbook headings and caps sentences at high frustration', () => {
    const raw =
      'YOUR ANSWER: A resistor limits current. CORRECT ANSWER: A capacitor stores charge. KEY CONNECTION: Store vs resist. QUICK CHECK: Which stores?';
    const out = polishSageSpeech(raw, { frustration_score: 72 });
    assert.doesNotMatch(out, /YOUR ANSWER/i);
    assert.doesNotMatch(out, /KEY CONNECTION/i);
    assert.ok((out.match(/[.!?]/g) || []).length <= 2);
  });
});

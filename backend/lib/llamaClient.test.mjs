import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeInsufficientKnowledge } from './llamaClient.mjs';

describe('looksLikeInsufficientKnowledge', () => {
  it('does not trip on a normal Groq tutor reply', () => {
    assert.equal(
      looksLikeInsufficientKnowledge(
        'Carbon dioxide is the gas plants take in. Which gas did you pick, and what does it actually do?',
      ),
      false,
    );
  });

  it('trips on explicit insufficient knowledge', () => {
    assert.equal(
      looksLikeInsufficientKnowledge('INSUFFICIENT_KNOWLEDGE'),
      true,
    );
    assert.equal(
      looksLikeInsufficientKnowledge(
        "I don't have enough knowledge to teach this without guessing.",
      ),
      true,
    );
  });

  it('treats empty replies as a knowledge gap', () => {
    assert.equal(looksLikeInsufficientKnowledge(''), true);
  });
});

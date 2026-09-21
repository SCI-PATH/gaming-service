/**
 * Run: node --test backend/lib/semanticMindMap.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFrustrationPresentation,
  isGroundedInContext,
  isUsableNodeLabel,
  mindMapFromContext,
  sanitizeMindMap,
} from './semanticMindMap.mjs';
import { isNoiseLabel } from '../../frontend/src/avatar/conceptMapQuality.js';

describe('noise vs educational labels', () => {
  it('rejects instructions and keeps complete concepts', () => {
    assert.equal(isNoiseLabel('do the body shapes'), true);
    assert.equal(isUsableNodeLabel('do the body shapes'), false);
    assert.equal(isUsableNodeLabel('Have a backbone'), true);
    assert.equal(isUsableNodeLabel('Vertebrates, invertebrates,'), true);
  });
});

describe('sanitizeMindMap', () => {
  it('groups facts from context and drops stray words and instructions', () => {
    const context =
      'Animals with a backbone are called vertebrates. Bats and crows are vertebrates. Butterflies are invertebrates because they do not have a backbone.';
    const { mindMap, removed } = sanitizeMindMap(
      {
        status: 'success',
        title: 'Vertebrates, invertebrates,',
        central_concept: 'Vertebrates, invertebrates,',
        branches: [
          { title: 'bat', points: [] },
          { title: 'butterfly', points: [] },
          { title: 'crow', points: [] },
          { title: 'wings', points: [] },
          { title: 'do the body shapes', points: [] },
          { title: 'Vertebrates', points: [{ text: 'Bat' }, { text: 'Crow' }, { text: 'Backbone' }] },
          { title: 'Invertebrates', points: [{ text: 'Butterfly' }] },
        ],
      },
      { chunks: [{ text: context }], question: 'Which animals are vertebrates?' },
    );
    const hubs = mindMap.branches.map((b) => b.title.toLowerCase());
    const leaves = mindMap.branches.flatMap((b) => b.points.map((p) => p.text.toLowerCase()));
    assert.match(mindMap.central_concept, /vertebrate/i);
    assert.ok(hubs.includes('vertebrates'));
    assert.ok(hubs.includes('invertebrates'));
    assert.equal(hubs.includes('wings'), false);
    assert.equal(hubs.includes('do the body shapes'), false);
    assert.ok(leaves.includes('bat'));
    assert.ok(leaves.includes('butterfly'));
    assert.ok(removed.some((r) => /do the body shapes/i.test(r.label)));
    assert.ok(removed.some((r) => /wings/i.test(r.label)));
  });

  it('does not turn a student-only word into a fact', () => {
    const { mindMap } = sanitizeMindMap(
      {
        status: 'success',
        central_concept: 'Photosynthesis',
        branches: [
          { title: 'Requirements', points: [{ text: 'Sunlight' }, { text: 'Wings' }] },
        ],
      },
      {
        chunks: [
          {
            text: 'Photosynthesis requires sunlight, carbon dioxide and water. Oxygen is a product.',
          },
        ],
        question: 'What are the things needed for photosynthesis?',
        studentAnswer: 'Sunlight and wings',
      },
    );
    const leaves = mindMap.branches.flatMap((b) => b.points.map((p) => p.text.toLowerCase()));
    assert.ok(leaves.includes('sunlight'));
    assert.equal(leaves.includes('wings'), false);
  });
});

describe('mindMapFromContext is generic', () => {
  it('builds a process map from stages language, not a fixed template', () => {
    const map = mindMapFromContext({
      question: 'What are the stages of the water cycle?',
      chunks: [
        {
          text: 'The stages of the water cycle are evaporation, condensation, precipitation and collection.',
          textbook: 'Grade 6 Science',
          chapter: 'Water',
        },
      ],
    });
    const blob = JSON.stringify(map).toLowerCase();
    assert.match(blob, /evaporation/);
    assert.match(blob, /condensation/);
    assert.equal(/activity/i.test(blob), false);
  });

  it('builds a classification map from divided-into language', () => {
    const map = mindMapFromContext({
      question: 'Which animals are vertebrates?',
      chunks: [
        {
          text: 'Animals are divided into vertebrates and invertebrates. Vertebrates such as bats and crows have a backbone. Invertebrates such as butterflies do not have a backbone.',
          textbook: 'Grade 6 Science',
          chapter: 'Diversity of animals',
        },
      ],
    });
    const blob = JSON.stringify(map).toLowerCase();
    assert.match(blob, /vertebrate/);
    assert.match(blob, /invertebrate/);
    assert.match(blob, /bat/);
    assert.equal(/do the body/i.test(blob), false);
  });

  it('builds a cause map from cause language', () => {
    const map = mindMapFromContext({
      question: 'What were the causes of the event?',
      chunks: [
        {
          text: 'The revolt was caused by high taxes, unfair laws and food shortages.',
          textbook: 'Grade 8 History',
          chapter: 'Revolts',
        },
      ],
    });
    const blob = JSON.stringify(map).toLowerCase();
    assert.match(blob, /taxes|laws|shortages|causes/);
  });
});

describe('frustration presentation', () => {
  it('caps nodes without rewriting facts', () => {
    const full = {
      status: 'success',
      central_concept: 'Fractions',
      branches: [
        { title: 'Numerator', points: [{ text: 'Top number' }] },
        { title: 'Denominator', points: [{ text: 'Bottom number' }] },
        { title: 'Proper Fraction', points: [{ text: 'Less than one' }] },
        { title: 'Improper Fraction', points: [{ text: 'Greater than one' }] },
      ],
    };
    const slim = applyFrustrationPresentation(full, 'VERY_HIGH');
    assert.equal(slim.branches.length, 3);
    assert.equal(slim.branches[0].title, 'Numerator');
    assert.equal(slim.central_concept, 'Fractions');
  });
});

describe('grounding', () => {
  it('requires retrieved text, not a hardcoded subject list', () => {
    const ctx = 'A fraction has a numerator and a denominator.';
    assert.equal(isGroundedInContext('Numerator', ctx), true);
    assert.equal(isGroundedInContext('Butterfly', ctx), false);
  });
});

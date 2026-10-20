import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoKeyFromRaw,
  demoReadout,
  pickDemoOptionIndex,
  pickDemoUnlockPurchases,
  planDemoSubmission,
  shouldPresentDemoSage,
} from './demoAutoplay.js';

test('picks the keyed option when the script wants a correct answer', () => {
  assert.equal(
    pickDemoOptionIndex({ wantCorrect: true, keyIndex: 2, optionCount: 4 }),
    2,
  );
});

test('picks a different option when the script wants a miss', () => {
  assert.equal(
    pickDemoOptionIndex({ wantCorrect: false, keyIndex: 0, optionCount: 4 }),
    1,
  );
  assert.equal(
    pickDemoOptionIndex({ wantCorrect: false, keyIndex: 3, optionCount: 4 }),
    0,
  );
});

test('reads the answer key before it is stripped from the question', () => {
  const raw = {
    id: 'q1',
    payload: {
      question: 'Which part makes food?',
      options: { A: 'Root', B: 'Leaf', C: 'Bark' },
      correct_answer: 'B',
    },
  };
  const key = demoKeyFromRaw(raw, ['Root', 'Leaf', 'Bark'], ['A', 'B', 'C']);
  assert.equal(key.index, 1);
  const plan = planDemoSubmission(
    { questionType: 'MCQ', options: ['Root', 'Leaf', 'Bark'], demoKeyIndex: key.index },
    { wasCorrect: false },
  );
  assert.equal(plan.index, 0);
  assert.equal(plan.unmatched, undefined);
});

test('reads the fill-in-the-blank answers list from the question payload', () => {
  const key = demoKeyFromRaw(
    {
      type: 'MultiBlank',
      payload: { type: 'MultiBlank', paragraph: 'Plants use ___ and ___.', answers: ['sunlight', 'water'] },
    },
    [],
    [],
    'MultiBlank',
  );
  assert.deepEqual(key.texts, ['sunlight', 'water']);
  const plan = planDemoSubmission(
    { questionType: 'MultiBlank', demoKeyText: key.text, demoKeyTexts: key.texts },
    { wasCorrect: true },
  );
  assert.deepEqual(plan.texts, ['sunlight', 'water']);
});

test('keeps every fill-in-the-blank answer so each box can be typed', () => {
  const key = demoKeyFromRaw(
    { correct_answer: ['chlorophyll', 'sunlight'] },
    [],
    [],
  );
  assert.deepEqual(key.texts, ['chlorophyll', 'sunlight']);
  const plan = planDemoSubmission(
    { questionType: 'MultiBlank', demoKeyText: key.text, demoKeyTexts: key.texts },
    { wasCorrect: true },
  );
  assert.equal(plan.kind, 'text');
  assert.deepEqual(plan.texts, ['chlorophyll', 'sunlight']);
  assert.equal(plan.text, 'chlorophyll | sunlight');
});

test('flags a question that has no answer key', () => {
  const plan = planDemoSubmission(
    { questionType: 'MCQ', options: ['Root', 'Leaf'] },
    { wasCorrect: true },
  );
  assert.equal(plan.unmatched, true);
});

test('shows Sage once the live band matches the profile', () => {
  assert.equal(
    shouldPresentDemoSage({
      profileId: 'smart',
      answeredCount: 7,
      liveLevel: 'low',
      alreadyShown: false,
    }),
    true,
  );
  assert.equal(
    shouldPresentDemoSage({
      profileId: 'weak',
      answeredCount: 2,
      liveLevel: 'high',
      alreadyShown: false,
    }),
    false,
  );
  assert.equal(
    shouldPresentDemoSage({
      profileId: 'weak',
      answeredCount: 4,
      liveLevel: 'high',
      alreadyShown: false,
    }),
    true,
  );
});

test('labels a low score and a high score differently', () => {
  const calm = demoReadout(12);
  const strained = demoReadout(85);
  assert.equal(calm.sageTone, 'Upbeat');
  assert.equal(strained.sageTone, 'Very slow and gentle');
  assert.match(calm.customers, /staying calm/);
  assert.match(strained.customers, /anger shows very fast/);
  assert.match(calm.enemy, /Full farm pressure/);
  assert.match(strained.enemy, /Softest enemy pressure/);
  assert.match(calm.mindMap, /8 branches/);
  assert.match(strained.mindMap, /2 branches/);
});

test('buys the cheapest unlocks the cash can cover', () => {
  const picks = pickDemoUnlockPurchases(
    [
      { id: 'sheep', price: 280, owned: false },
      { id: 'sign', price: 70, owned: false },
      { id: 'fence', price: 90, owned: false },
      { id: 'owned', price: 40, owned: true },
    ],
    170,
    2,
  );
  assert.deepEqual(
    picks.map((item) => item.id),
    ['sign', 'fence'],
  );
  assert.deepEqual(pickDemoUnlockPurchases([{ id: 'sheep', price: 280 }], 100), []);
});

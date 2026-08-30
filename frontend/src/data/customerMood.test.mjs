import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectCustomerAlerts, customerMoodState } from './customerMood.js';
import { sageLineForStep } from './sageGuide.js';

describe('customer mood alerts', () => {
  it('does not alert for tiny patience drift in the same band', () => {
    const a = {
      id: 'c1',
      status: 'WAITING',
      patience: 80,
      maxPatience: 100,
      queueIndex: 0,
    };
    const b = { ...a, patience: 72 };
    assert.equal(customerMoodState(a).key, customerMoodState(b).key);
    assert.equal(collectCustomerAlerts([a], [b]).length, 0);
  });

  it('alerts when a customer becomes unhappy or leaves', () => {
    const patient = {
      id: 'c2',
      status: 'WAITING',
      patience: 80,
      maxPatience: 100,
      queueIndex: 0,
    };
    const unhappy = { ...patient, patience: 20 };
    const left = { ...patient, status: 'LEFT', patience: 0 };
    assert.equal(collectCustomerAlerts([patient], [unhappy])[0].to, 'unhappy');
    assert.equal(collectCustomerAlerts([unhappy], [left])[0].to, 'left');
  });
});

describe('Sage farm lines', () => {
  it('speaks a short unload instruction instead of a form card', () => {
    const line = sageLineForStep(
      { id: 'carry-shop', title: 'Unload 11 items' },
      { frustrationLevel: 'low' },
    );
    assert.match(line, /shop|E/i);
    assert.doesNotMatch(line, /Farm guide/i);
  });

  it('uses a gentler line at high frustration', () => {
    const line = sageLineForStep(
      { id: 'carry-shop', title: 'Unload 11 items' },
      { frustrationLevel: 'high' },
    );
    assert.match(line, /when you are ready/i);
  });
});

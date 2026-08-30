/**
 * File-backed arena leaderboard ranking.
 * Run: node --test backend/lib/db.leaderboard.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rankLeaderboardEntries } from './db.mjs';

describe('rankLeaderboardEntries', () => {
  const rows = [
    {
      studentId: 'a',
      displayName: 'Ada',
      currentLevel: 3,
      score: 120,
      quizCorrect: 8,
      updatedAt: '2026-08-30T10:00:00.000Z',
    },
    {
      studentId: 'b',
      displayName: 'Bea',
      currentLevel: 2,
      score: 200,
      quizCorrect: 4,
      updatedAt: '2026-08-29T10:00:00.000Z',
    },
  ];

  it('orders all-time by score and ranks you outside the top N', () => {
    const result = rankLeaderboardEntries(rows, {
      period: 'all',
      limit: 1,
      studentId: 'a',
    });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].studentId, 'b');
    assert.equal(result.you.studentId, 'a');
    assert.equal(result.you.rank, 2);
  });

  it('filters today by UTC day of updatedAt', () => {
    const result = rankLeaderboardEntries(rows, {
      period: 'today',
      limit: 10,
      now: new Date('2026-08-30T12:00:00.000Z'),
    });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].studentId, 'a');
  });
});

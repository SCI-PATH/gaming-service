/**
 * Neon connection-string guards (sqlite must never hit Neon HTTP).
 * Run: node --test backend/lib/pg.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNeonConnectionString, normalizeDatabaseUrl } from './pg.mjs';

describe('normalizeDatabaseUrl', () => {
  it('strips quotes and SQLAlchemy / jdbc dialects', () => {
    assert.equal(
      normalizeDatabaseUrl('"postgres://u:p@ep-x.neon.tech/db"'),
      'postgresql://u:p@ep-x.neon.tech/db',
    );
    assert.equal(
      normalizeDatabaseUrl('postgresql+psycopg2://u:p@host/db'),
      'postgresql://u:p@host/db',
    );
    assert.equal(
      normalizeDatabaseUrl('jdbc:postgresql://u:p@host/db'),
      'postgresql://u:p@host/db',
    );
  });

  it('rejects sqlite and http strings as Neon targets', () => {
    assert.equal(isNeonConnectionString('sqlite:///./data/users.db'), false);
    assert.equal(isNeonConnectionString('https://ep-x.neon.tech/sql'), false);
    assert.equal(isNeonConnectionString(''), false);
    assert.equal(
      isNeonConnectionString('postgresql://u:p@ep-x.neon.tech/neondb'),
      true,
    );
  });
});

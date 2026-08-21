import { useMemo, useState } from 'react';
import {
  CROP_CHALLENGES,
  CROP_CHALLENGE_COUNT,
  vegetableGoalText,
} from '../data/cropChallenges.js';
import {
  ANIMAL_CHALLENGES,
  ANIMAL_CHALLENGE_COUNT,
  animalGoalText,
} from '../data/animalChallenges.js';
import {
  CLEANING_CHALLENGES,
  CLEANING_CHALLENGE_COUNT,
  cleaningGoalText,
} from '../data/cleaningChallenges.js';
import {
  getLevelChallengePlan,
  LIBRARY_LEVEL_COUNT,
  libraryLevelForCropIndex,
  libraryLevelForTrackIndex,
} from '../data/challengeLibrary.js';

/**
 * Test catalog: jump to any library job, or load a full farm level.
 */
export default function ChallengeTesterModal({
  open = false,
  cropIndex = 0,
  animalIndex = 0,
  cleanIndex = 0,
  libraryLevel = 1,
  onJump,
  onClose,
}) {
  const [tab, setTab] = useState('level');
  const [query, setQuery] = useState('');

  const cropRows = useMemo(
    () =>
      CROP_CHALLENGES.map((c) => ({
        kind: 'crop',
        index: c.index,
        id: c.id,
        title: `Lv ${libraryLevelForCropIndex(c.index)} · ${c.index + 1}. ${c.cropName}`,
        detail: vegetableGoalText(c, c.harvestCount),
        search: `${c.cropName} ${c.cropId} veg plant ${c.id} level`,
      })),
    [],
  );

  const animalRows = useMemo(
    () =>
      ANIMAL_CHALLENGES.map((c) => ({
        kind: 'animal',
        index: c.index,
        id: c.id,
        title: `Lv ${libraryLevelForTrackIndex(c.index)} · ${c.index + 1}. ${c.animalName} (${c.produceName})`,
        detail: animalGoalText(c, c.collectCount),
        search: `${c.animalName} ${c.produceName} ${c.action} ${c.animalId} ${c.id} level`,
      })),
    [],
  );

  const cleanRows = useMemo(
    () =>
      CLEANING_CHALLENGES.map((c) => ({
        kind: 'clean',
        index: c.index,
        id: c.id,
        title: `Lv ${libraryLevelForTrackIndex(c.index)} · ${c.index + 1}. ${c.verb} ${c.messName}`,
        detail: cleaningGoalText(c, c.sweepCount),
        search: `${c.messName} ${c.wasteName} ${c.verb} ${c.cleanId} ${c.id} clean sweep level`,
      })),
    [],
  );

  const levelRows = useMemo(
    () =>
      Array.from({ length: LIBRARY_LEVEL_COUNT }, (_, i) => {
        const plan = getLevelChallengePlan(i + 1);
        return {
          kind: 'level',
          index: i,
          id: `level_${i + 1}`,
          title: `Level ${i + 1}`,
          detail: plan.summary,
          search: `level ${i + 1} ${plan.summary}`,
        };
      }),
    [],
  );

  const rows =
    tab === 'animal'
      ? animalRows
      : tab === 'clean'
        ? cleanRows
        : tab === 'level'
          ? levelRows
          : cropRows;
  const current =
    tab === 'animal'
      ? animalIndex
      : tab === 'clean'
        ? cleanIndex
        : tab === 'level'
          ? Math.max(0, (libraryLevel || 1) - 1)
          : cropIndex;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q) ||
          r.search.toLowerCase().includes(q),
      )
    : rows;

  if (!open) return null;

  const jump = (index) => {
    onJump?.({ kind: tab, index });
  };

  return (
    <div className="challenge-tester-overlay" role="dialog" aria-modal="true">
      <div className="challenge-tester-card">
        <header className="challenge-tester-head">
          <div>
            <p className="challenge-tester-kicker">Challenge library</p>
            <h2>Jobs by level</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="challenge-tester-tabs">
          <button
            type="button"
            className={tab === 'level' ? 'is-on' : ''}
            onClick={() => setTab('level')}
          >
            Levels ({LIBRARY_LEVEL_COUNT})
          </button>
          <button
            type="button"
            className={tab === 'crop' ? 'is-on' : ''}
            onClick={() => setTab('crop')}
          >
            Vegetables ({CROP_CHALLENGE_COUNT})
          </button>
          <button
            type="button"
            className={tab === 'animal' ? 'is-on' : ''}
            onClick={() => setTab('animal')}
          >
            Animals ({ANIMAL_CHALLENGE_COUNT})
          </button>
          <button
            type="button"
            className={tab === 'clean' ? 'is-on' : ''}
            onClick={() => setTab('clean')}
          >
            Cleaning ({CLEANING_CHALLENGE_COUNT})
          </button>
        </div>

        <input
          className="challenge-tester-search"
          type="search"
          placeholder="Search level 3, tomatoes, cows…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="challenge-tester-nav">
          <button
            type="button"
            onClick={() => jump(Math.max(0, current - 1))}
            disabled={current <= 0}
          >
            Previous
          </button>
          <span>
            Now: {current + 1} / {rows.length}
          </span>
          <button
            type="button"
            onClick={() => jump(Math.min(rows.length - 1, current + 1))}
            disabled={current >= rows.length - 1}
          >
            Next
          </button>
        </div>

        <ul className="challenge-tester-list">
          {filtered.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={row.index === current ? 'is-current' : ''}
                onClick={() => jump(row.index)}
              >
                <strong>{row.title}</strong>
                <em>{row.detail}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

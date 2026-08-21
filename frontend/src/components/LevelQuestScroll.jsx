import { useEffect, useId, useMemo, useState } from 'react';

/**
 * Vintage parchment quest scroll for the current farm level.
 * Unfurls horizontally from the center when opened.
 */
export default function LevelQuestScroll({
  open = false,
  levelId = 1,
  challenges = [],
  goalText = '',
  harvestTarget = 0,
  cropsHarvestedTotal = 0,
  cropsSoldThisChallenge = 0,
  plantedCount = 0,
  cropName = 'crops',
  cropChallengeIndex = 0,
  cropChallengeTotal = 2,
  libraryLevel = 1,
  libraryLevelCount = 50,
  librarySummary = '',
  animalName = '',
  animalProduceName = 'produce',
  animalAction = 'feed',
  animalChallengeIndex = 0,
  animalChallengeTotal = 1,
  animalCollectTarget = 0,
  animalCollectedTotal = 0,
  animalSoldThisChallenge = 0,
  animalTended = false,
  cleanMessName = '',
  cleanWasteName = 'waste',
  cleanVerb = 'Clean',
  cleaningChallengeIndex = 0,
  cleaningChallengeTotal = 1,
  cleanSweepTarget = 0,
  cleanSweptTotal = 0,
  cleanSoldThisChallenge = 0,
  cleanStarted = false,
  onClose,
}) {
  const titleId = useId();
  const [unfurled, setUnfurled] = useState(false);
  const [noted, setNoted] = useState(() => new Set());

  const tasks = useMemo(() => {
    const list = [];

    if (goalText && harvestTarget <= 0) {
      list.push({
        id: 'level-goal',
        title: `Level ${levelId} goal`,
        detail: goalText,
        done: false,
        hint: null,
        kind: 'goal',
      });
    }

    if (harvestTarget > 0) {
      const harvested = Number(cropsHarvestedTotal) || 0;
      const sold = Number(cropsSoldThisChallenge) || 0;
      const planted = Number(plantedCount) || 0;
      const target = Math.max(1, Number(harvestTarget) || 1);
      const name = String(cropName || 'crops').toLowerCase();
      const n = (cropChallengeIndex || 0) + 1;
      const total = Math.max(1, Number(cropChallengeTotal) || 100);

      list.push({
        id: 'plant',
        title: `Plant ${name}`,
        detail: `Stand on a gold plant bed and plant ${name} (${n} of ${total}).`,
        done: planted > 0 || harvested > 0 || sold > 0,
        hint: 'Press E on a gold bed — answer the science question to plant.',
        kind: 'plant',
      });
      list.push({
        id: 'harvest',
        title: `Pick ${target} ${name}`,
        detail: `Harvested ${harvested}/${target}. Carry them on your back, then unload at the blue LOAD dock.`,
        done: harvested >= target,
        hint: 'Answer the harvest quiz, then run over ready crops.',
        kind: 'harvest',
      });
      list.push({
        id: 'sell',
        title: 'Go to the shop and sell',
        detail: `Sold ${sold}/${target} ${name}. Press Q to sell the cart.`,
        done: sold >= target,
        hint: 'Load at the blue dock, then sell at the shop.',
        kind: 'sell',
      });
    }

    const animalTarget = Math.max(1, Number(animalCollectTarget) || 0);
    if (animalTarget > 0 && animalName) {
      const animals = String(animalName || 'animals').toLowerCase();
      const produce = String(animalProduceName || 'produce').toLowerCase();
      const collected = Number(animalCollectedTotal) || 0;
      const animalSold = Number(animalSoldThisChallenge) || 0;
      const aIndex = (animalChallengeIndex || 0) + 1;
      const aTotal = Math.max(1, Number(animalChallengeTotal) || 50);
      const verb = animalAction === 'shear' ? 'Shear' : 'Feed';

      list.push({
        id: 'animal-tend',
        title: `${verb} the ${animals}`,
        detail: `Walk into the fenced pen and press E (${aIndex} of ${aTotal}).`,
        done: Boolean(animalTended) || collected > 0 || animalSold > 0,
        hint: 'Answer the science question to tend the whole herd.',
        kind: 'animal',
      });
      list.push({
        id: 'animal-collect',
        title: `Collect ${animalTarget} ${produce}`,
        detail: `Collected ${collected}/${animalTarget}. Carry them, then unload at LOAD.`,
        done: collected >= animalTarget,
        hint: 'After feeding, run over milk, eggs, or wool in the pen.',
        kind: 'animal',
      });
      list.push({
        id: 'animal-sell',
        title: `Sell ${produce} at the shop`,
        detail: `Sold ${animalSold}/${animalTarget} ${produce}. Press Q to sell the cart.`,
        done: animalSold >= animalTarget,
        hint: 'Load at the blue dock, then sell.',
        kind: 'animal',
      });
    }

    const cleanTarget = Math.max(1, Number(cleanSweepTarget) || 0);
    if (cleanTarget > 0 && cleanMessName) {
      const mess = String(cleanMessName || 'mess').toLowerCase();
      const waste = String(cleanWasteName || 'waste').toLowerCase();
      const swept = Number(cleanSweptTotal) || 0;
      const cleanSold = Number(cleanSoldThisChallenge) || 0;
      const cIndex = (cleaningChallengeIndex || 0) + 1;
      const cTotal = Math.max(1, Number(cleaningChallengeTotal) || 50);
      const verb = cleanVerb || 'Clean';

      list.push({
        id: 'clean-start',
        title: `${verb} the ${mess}`,
        detail: `Walk into the dirty yard and press E (${cIndex} of ${cTotal}).`,
        done: Boolean(cleanStarted) || swept > 0 || cleanSold > 0,
        hint: 'Answer the science question to start cleaning the yard.',
        kind: 'clean',
      });
      list.push({
        id: 'clean-sweep',
        title: `Sweep ${cleanTarget} ${mess}`,
        detail: `Swept ${swept}/${cleanTarget}. Carry them, then unload at LOAD.`,
        done: swept >= cleanTarget,
        hint: 'After starting, run over weeds, rocks, or other mess in the yard.',
        kind: 'clean',
      });
      list.push({
        id: 'clean-sell',
        title: `Sell ${waste} at the shop`,
        detail: `Sold ${cleanSold}/${cleanTarget} ${waste}. Press Q to sell the cart.`,
        done: cleanSold >= cleanTarget,
        hint: 'Load at the blue dock, then sell compost at the shop.',
        kind: 'clean',
      });
    }

    for (const c of challenges) {
      const isAgent = c.source === 'agent' || String(c.itemId || '').startsWith('agent_station_');
      if (isAgent) continue;
      if (c.source === 'world') continue;
      const isStory =
        c.source === 'house' ||
        c.source === 'storyline' ||
        String(c.itemId || '').startsWith('house_') ||
        String(c.itemId || '').startsWith('storyline_');
      if (isStory) {
        list.push({
          id: `${c.itemId}-house`,
          title: '',
          detail: c.done
            ? ''
            : 'The old house looks worn. Walk up and fix what you notice.',
          done: Boolean(c.done),
          hint: null,
          kind: 'challenge',
        });
        continue;
      }
      const step = c.steps?.[c.stepIndex];
      list.push({
        id: `${c.itemId}-${c.stageId}`,
        title: `${c.itemLabel}: ${c.title}`,
        detail: step
          ? `Step ${(c.stepIndex || 0) + 1}/${c.steps.length}: ${step.label}`
          : c.description,
        done: Boolean(c.done),
        hint: 'Click the unlock on the farm, or press E nearby',
        kind: 'challenge',
      });
    }

    return list;
  }, [
    animalAction,
    animalChallengeIndex,
    animalChallengeTotal,
    animalCollectedTotal,
    animalCollectTarget,
    animalName,
    animalProduceName,
    animalSoldThisChallenge,
    animalTended,
    challenges,
    cleanMessName,
    cleanSoldThisChallenge,
    cleanStarted,
    cleanSweptTotal,
    cleanSweepTarget,
    cleanVerb,
    cleanWasteName,
    cleaningChallengeIndex,
    cleaningChallengeTotal,
    cropChallengeIndex,
    cropChallengeTotal,
    cropName,
    cropsHarvestedTotal,
    cropsSoldThisChallenge,
    goalText,
    harvestTarget,
    levelId,
    plantedCount,
  ]);

  useEffect(() => {
    if (!open) {
      setUnfurled(false);
      return undefined;
    }
    setNoted(new Set());
    const id = window.requestAnimationFrame(() => setUnfurled(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, levelId]);

  if (!open) return null;

  const toggleNoted = (taskId, done) => {
    if (done) return;
    setNoted((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const doneCount = tasks.filter((t) => t.done || noted.has(t.id)).length;

  return (
    <div
      className={`quest-scroll-overlay${unfurled ? ' is-unfurled' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="quest-scroll-stage">
        <div className="quest-scroll-rod quest-scroll-rod-left" aria-hidden />
        <div className="quest-scroll-sheet">
          <div className="quest-scroll-parchment">
            <header className="quest-scroll-head">
              <p className="quest-scroll-eyebrow">
                Level {libraryLevel || levelId} of {libraryLevelCount || 50} · 15
                questions · then shop
              </p>
              <h2 id={titleId}>Quest To-Do</h2>
              <p className="quest-scroll-sub">
                {librarySummary
                  ? `This level: ${librarySummary}`
                  : tasks.length
                    ? `${doneCount} of ${tasks.length} marked · tick tasks as you go`
                    : 'Finish 15 questions, then buy farm items. Your unlocks stay on the next farm.'}
              </p>
            </header>

            {tasks.length > 0 ? (
              <ul className="quest-todo-list">
                {tasks.map((task) => {
                  const checked = task.done || noted.has(task.id);
                  return (
                    <li
                      key={task.id}
                      className={`quest-todo-item${checked ? ' is-checked' : ''}${
                        task.done ? ' is-complete' : ''
                      }`}
                    >
                      <label className="quest-todo-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={task.done}
                          onChange={() => toggleNoted(task.id, task.done)}
                        />
                        <span className="quest-todo-box" aria-hidden />
                        <span className="quest-todo-copy">
                          <strong>{task.title}</strong>
                          <em>{task.detail}</em>
                          {task.hint && !task.done ? (
                            <span className="quest-todo-hint">{task.hint}</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="quest-scroll-empty">
                Tend the farm this level. Buy unlocks after you finish — their
                challenges appear on the next scroll.
              </p>
            )}

            <div className="quest-scroll-actions">
              <button type="button" className="quest-scroll-close" onClick={onClose}>
                Roll up scroll
              </button>
            </div>
          </div>
        </div>
        <div className="quest-scroll-rod quest-scroll-rod-right" aria-hidden />
      </div>
    </div>
  );
}

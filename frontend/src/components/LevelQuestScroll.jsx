import { useEffect, useId, useMemo, useState } from 'react';

/**
 * Vintage parchment quest scroll for the current farm level.
 * Unfurls horizontally from the center when opened.
 *
 * Level challenge-bank tasks are all AVAILABLE — no sequential locking.
 * Each crop / animal / clean task tracks its own progress independently.
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
  cropChallengeList = null,
  cropChallengeStatus = '',
  levelCropComplete = false,
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
  levelAnimalComplete = false,
  cleanMessName = '',
  cleanWasteName = 'waste',
  cleanVerb = 'Clean',
  cleaningChallengeIndex = 0,
  cleaningChallengeTotal = 1,
  cleanSweepTarget = 0,
  cleanSweptTotal = 0,
  cleanSoldThisChallenge = 0,
  cleanStarted = false,
  levelCleanComplete = false,
  questionsAnswered = 0,
  maxQuestions = 15,
  onClose,
}) {
  const titleId = useId();
  const [unfurled, setUnfurled] = useState(false);
  const [noted, setNoted] = useState(() => new Set());

  const tasks = useMemo(() => {
    const list = [];
    const answered = Math.max(0, Number(questionsAnswered) || 0);
    const quota = Math.max(1, Number(maxQuestions) || 15);
    list.push({
      id: 'science-quota',
      title: `Answer ${quota} science questions`,
      detail:
        answered >= quota
          ? `${answered}/${quota} done — unlock shop is ready.`
          : `${answered}/${quota} answered. Shop opens after all ${quota}.`,
      done: answered >= quota,
      hint:
        answered >= quota
          ? null
          : 'Plant, harvest, tend, clean — or press E on a gold bed for more questions.',
      kind: 'goal',
      status: answered >= quota ? 'COMPLETED' : 'AVAILABLE',
    });

    if (goalText && harvestTarget <= 0 && !(cropChallengeList?.length > 0)) {
      list.push({
        id: 'level-goal',
        title: `Level ${levelId} goal`,
        detail: goalText,
        done: false,
        hint: null,
        kind: 'goal',
        status: null,
      });
    }

    const cropList = Array.isArray(cropChallengeList) ? cropChallengeList : null;

    if (cropList?.length) {
      for (const crop of cropList) {
        const name = String(crop.cropName || 'crops').toLowerCase();
        const status = crop.status || 'AVAILABLE';
        const completed = status === 'COMPLETED' || Boolean(crop.sellDone);
        const target = Math.max(1, Number(crop.harvestTarget) || 1);
        const harvested = Number(crop.cropsHarvestedTotal) || 0;
        const sold = Number(crop.cropsSoldThisChallenge) || 0;
        const planted = Boolean(crop.plantDone);

        let detail;
        let hint = 'Press E on the labelled gold bed — answer the science question to plant.';
        if (completed) {
          detail = `Sold ${target}/${target} ${name}. Done!`;
          hint = null;
        } else if (!planted) {
          detail = `Plant ${name} on its gold bed, then pick ${target} and sell.`;
        } else if (harvested < target) {
          detail = `Harvested ${harvested}/${target}. Carry them, then press E at the Farm Shop.`;
          hint = 'Answer the harvest quiz, then run over ready crops.';
        } else if (sold < target) {
          detail = `Sold ${sold}/${target} ${name}. Unload at the Farm Shop so customers buy.`;
          hint = 'Walk to the Farm Shop and press E to unload into shop stock.';
        } else {
          detail = `Sold ${sold}/${target} ${name}.`;
        }

        list.push({
          id: `crop-${crop.slot ?? crop.id}`,
          title: `Plant ${name}`,
          detail,
          done: completed,
          hint: !completed ? hint : null,
          kind: 'crop',
          status,
          statusLabel: crop.statusLabel || status,
          statusIcon: crop.statusIcon || (completed ? '✓' : '▶'),
          locked: false,
          available: !completed,
        });
      }
    } else if (harvestTarget > 0) {
      // Fallback when Phaser has not yet sent cropChallengeList
      const harvested = Number(cropsHarvestedTotal) || 0;
      const sold = Number(cropsSoldThisChallenge) || 0;
      const planted = Number(plantedCount) || 0;
      const target = Math.max(1, Number(harvestTarget) || 1);
      const name = String(cropName || 'crops').toLowerCase();
      const n = (cropChallengeIndex || 0) + 1;
      const total = Math.max(1, Number(cropChallengeTotal) || 100);
      const status = cropChallengeStatus || (sold >= target ? 'COMPLETED' : 'AVAILABLE');

      list.push({
        id: 'plant',
        title: `Plant ${name}`,
        detail: `Stand on a gold plant bed and plant ${name} (${n} of ${total}).`,
        done: planted > 0 || harvested > 0 || sold > 0,
        hint: 'Press E on a gold bed — answer the science question to plant.',
        kind: 'plant',
        status,
        statusLabel: status,
        statusIcon: sold >= target ? '✓' : '▶',
        locked: false,
        available: sold < target,
      });
      list.push({
        id: 'harvest',
        title: `Pick ${target} ${name}`,
        detail: `Harvested ${harvested}/${target}. Carry them on your back, then press E at the Farm Shop.`,
        done: harvested >= target,
        hint: 'Answer the harvest quiz, then run over ready crops.',
        kind: 'harvest',
        status: null,
      });
      list.push({
        id: 'sell',
        title: 'Bring harvests to the Farm Shop',
        detail: `Sold ${sold}/${target} ${name}. Press E at the stall to unload.`,
        done: sold >= target,
        hint: 'Walk to the Farm Shop and press E to unload into shop stock.',
        kind: 'sell',
        status: null,
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
      const animalDone =
        Boolean(levelAnimalComplete) || animalSold >= animalTarget;
      const animalStatus = animalDone ? 'COMPLETED' : 'AVAILABLE';

      list.push({
        id: 'animal-track',
        title: `${verb} the ${animals}`,
        detail: animalDone
          ? `Sold ${animalTarget}/${animalTarget} ${produce}. Done!`
          : `Tend pen (${aIndex} of ${aTotal}), collect ${animalTarget} ${produce}, sell at shop.`,
        done: animalDone,
        hint: animalDone
          ? null
          : 'Walk into the fenced pen and press E, then collect produce and unload at the shop.',
        kind: 'animal',
        status: animalStatus,
        statusLabel: animalStatus,
        statusIcon: animalDone ? '✓' : '▶',
        locked: false,
        available: !animalDone,
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
      const cleanDone = Boolean(levelCleanComplete) || cleanSold >= cleanTarget;
      const cleanStatus = cleanDone ? 'COMPLETED' : 'AVAILABLE';

      list.push({
        id: 'clean-track',
        title: `${verb} the ${mess}`,
        detail: cleanDone
          ? `Sold ${cleanTarget}/${cleanTarget} ${waste}. Done!`
          : `Clean yard (${cIndex} of ${cTotal}), sweep ${cleanTarget}, sell ${waste}.`,
        done: cleanDone,
        hint: cleanDone
          ? null
          : 'Walk into the dirty yard and press E, then sweep and unload at the shop.',
        kind: 'clean',
        status: cleanStatus,
        statusLabel: cleanStatus,
        statusIcon: cleanDone ? '✓' : '▶',
        locked: false,
        available: !cleanDone,
      });
    }

    for (const c of challenges) {
      const isAgent =
        c.source === 'agent' || String(c.itemId || '').startsWith('agent_station_');
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
          status: null,
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
        status: null,
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
    cropChallengeList,
    cropChallengeStatus,
    cropChallengeTotal,
    cropName,
    cropsHarvestedTotal,
    cropsSoldThisChallenge,
    goalText,
    harvestTarget,
    levelAnimalComplete,
    levelCleanComplete,
    levelCropComplete,
    levelId,
    maxQuestions,
    plantedCount,
    questionsAnswered,
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
                Level {libraryLevel || levelId} of {libraryLevelCount || 50} · choose any
                bed → plant → pick → sell
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
                  const locked = Boolean(task.locked);
                  return (
                    <li
                      key={task.id}
                      className={`quest-todo-item${checked ? ' is-checked' : ''}${
                        task.done ? ' is-complete' : ''
                      }${locked ? ' is-locked' : ''}${
                        task.available ? ' is-available' : ''
                      }`}
                    >
                      <label className="quest-todo-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={task.done || locked}
                          onChange={() => toggleNoted(task.id, task.done)}
                        />
                        <span className="quest-todo-box" aria-hidden />
                        <span className="quest-todo-copy">
                          <strong>
                            {task.statusIcon ? `${task.statusIcon} ` : ''}
                            {task.title}
                            {task.statusLabel ? (
                              <span className="quest-todo-status">
                                {' '}
                                {task.statusLabel}
                              </span>
                            ) : null}
                          </strong>
                          <em>{task.detail}</em>
                          {task.hint && !task.done && !locked ? (
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

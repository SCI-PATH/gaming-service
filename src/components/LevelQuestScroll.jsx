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
  cropName = 'crops',
  onClose,
}) {
  const titleId = useId();
  const [unfurled, setUnfurled] = useState(false);
  const [noted, setNoted] = useState(() => new Set());

  const tasks = useMemo(() => {
    const list = [];

    if (goalText) {
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
      const target = Math.max(1, Number(harvestTarget) || 1);
      list.push({
        id: 'harvest',
        title: `Harvest ${cropName.toLowerCase()}`,
        detail: `Collect ${harvested}/${target} ${cropName.toLowerCase()} at the load dock.`,
        done: harvested >= target,
        hint: 'Plant at gold beds · harvest onto your back · unload at blue LOAD',
        kind: 'harvest',
      });
    }

    for (const c of challenges) {
      const step = c.steps?.[c.stepIndex];
      const isHouse = c.itemId === 'house';
      const isHen = c.itemId === 'hen_house';
      list.push({
        id: `${c.itemId}-${c.stageId}`,
        title: `${c.itemLabel}: ${c.title}`,
        detail: step
          ? `Step ${(c.stepIndex || 0) + 1}/${c.steps.length}: ${step.label}`
          : c.description,
        done: Boolean(c.done),
        hint: isHouse
          ? 'Click the Farm House on the farm'
          : isHen
            ? 'Click the Hen House on the farm'
            : 'Click the unlock on the farm, or press E nearby',
        kind: 'challenge',
      });
    }

    return list;
  }, [
    challenges,
    cropName,
    cropsHarvestedTotal,
    goalText,
    harvestTarget,
    levelId,
  ]);

  useEffect(() => {
    if (!open) {
      setUnfurled(false);
      return undefined;
    }
    setNoted(new Set());
    // Next frame → trigger CSS unfurl
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
              <p className="quest-scroll-eyebrow">Farm ledger · Level {levelId}</p>
              <h2 id={titleId}>Quest To-Do</h2>
              <p className="quest-scroll-sub">
                {tasks.length
                  ? `${doneCount} of ${tasks.length} marked · tick tasks as you go`
                  : 'No special unlock quests yet — finish the harvest goal, then shop for unlocks.'}
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

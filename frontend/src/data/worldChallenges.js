/**
 * 500 small farm-life actions for Grade 6–9.
 * Science questions stay in DDA. Each challenge is one visual cluster:
 * one quiz collects / waters / feeds / repairs the whole group.
 */
import { isWorldChallengeComplete } from './worldChallengeStore.js';
import { FARM_ACTIVITIES } from './farmSheet.js';
import { realFarmSprite } from './farmAssetMap.js';

/** One fenced paddock per challenge. Origins are top-left tiles. */
export const PADDOCK = { w: 10, h: 8 };

export const ANIMAL_KEYS = new Set([
  'kf_cow',
  'kf_sheep',
  'kf_chicken',
  'hm_cow',
  'hm_cow_happy',
  'hm_cow_baby',
  'hm_chicken',
  'hm_chicken2',
  'hm_chick',
  'lib_creature_duck',
  'lib_creature_goat',
  'lib_creature_cow',
  'lib_creature_chicken',
  'lib_creature_chick',
  'lib_creature_parrot',
  'unlock_sheep',
  'unlock_lamb',
  'unlock_rooster',
  'unlock_piglet',
  'unlock_turkey',
  'unlock_bull',
]);

/** True when this texture is an animal that should wander inside the paddock. */
export function isAnimalKey(key) {
  return ANIMAL_KEYS.has(key);
}

/**
 * Separate paddocks — 2+ tiles between pens, clear of plant beds,
 * load dock (~50,31), and spawn (48,32).
 */
export const REGION_SLOTS = {
  crops: [
    [3, 4],
    [15, 4],
    [27, 4],
    [63, 4],
    [75, 4],
    [87, 4],
    [15, 14],
    [27, 14],
    [63, 14],
    [75, 14],
  ],
  cows: [
    [86, 24],
    [86, 34],
    [86, 44],
  ],
  birds: [
    [86, 54],
    [74, 64],
  ],
  herd: [
    [3, 50],
    [3, 60],
  ],
  house: [
    [3, 26],
    [3, 36],
    [15, 36],
  ],
  yard: [
    [39, 4],
    [51, 4],
    [39, 14],
  ],
  store: [
    [38, 38],
    [56, 38],
  ],
  weather: [
    [27, 36],
    [48, 60],
  ],
};

/** One paddock on the farm at a time, just east of spawn / load dock. */
const ACTIVE_SLOT = [56, 22];

function band(n) {
  // Challenge number sets difficulty: 1–180 easy, 181–350 medium, the rest hard.
  if (n <= 180) return 'easy';
  if (n <= 350) return 'medium';
  return 'hard';
}

function make(n, region, action, sprite, after, cluster, tool = null) {
  const difficulty = band(n);
  return {
    challengeId: `farm_${String(n).padStart(3, '0')}`,
    n,
    region,
    action,
    sprite: realFarmSprite(sprite, action),
    after: after ? realFarmSprite(after, action) : null,
    tool: tool ? realFarmSprite(tool, action) : null,
    cluster,
    autoComplete: true,
    difficulty,
    challengeType: action,
    reward: {
      cash: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 14 : 18,
      rp: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 14 : 18,
    },
  };
}

function addAll(list, rows) {
  for (const row of rows) list.push(make(...row));
}

function buildTasks() {
  const t = [];
  addAll(t, FARM_ACTIVITIES);
  return t;
}

export const WORLD_TASKS = buildTasks();

// The sheet must stay at 500 actions; a short import would silently drop farm jobs.
if (WORLD_TASKS.length !== 500) {
  throw new Error(`Expected 500 farm challenges, got ${WORLD_TASKS.length}`);
}

/** Action verb for a cluster node (plant, water, feed, …), defaulting to tend. */
export function getTaskAction(node, task) {
  return task?.action || node?.kind || 'tend';
}

/** Unused. The farm shows its own E-key copy, so this prompt stays empty. */
export function getInteractPrompt() {
  return '';
}

function slotForTask() {
  return ACTIVE_SLOT;
}

/** The next unfinished farm-life cluster, or none when all 500 are done. */
export function pickActiveTasks() {
  const next = WORLD_TASKS.find(
    (task) => !isWorldChallengeComplete(task.challengeId),
  );
  return next ? [next] : [];
}

function innerPositions(count, ox, oy) {
  const n = Math.min(12, Math.max(1, count));
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const marginX = 1.5;
  const marginY = 1.5;
  const usableW = PADDOCK.w - marginX * 2;
  const usableH = PADDOCK.h - marginY * 2;
  const positions = [];
  for (let i = 0; i < n; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tileX =
      ox + marginX + ((col + 0.5) * usableW) / cols;
    const tileY =
      oy + marginY + ((row + 0.5) * usableH) / rows;
    positions.push([tileX, tileY]);
  }
  return positions;
}

function nodesForOneTask(task, originX, originY) {
  // Keep each cluster between 9 and 12 sprites so the paddock stays readable.
  const count = Math.min(12, Math.max(9, task.cluster || 9));
  const spots = innerPositions(count, originX, originY);
  const moving = isAnimalKey(task.sprite) || isAnimalKey(task.after);
  const paddock = {
    ox: originX,
    oy: originY,
    w: PADDOCK.w,
    h: PADDOCK.h,
    minX: originX + 1.5,
    maxX: originX + PADDOCK.w - 2.5,
    minY: originY + 1.5,
    maxY: originY + PADDOCK.h - 2.5,
  };
  const planting = task.action === 'plant';
  // Planting shows bare soil until the quiz, then the crop sprite. The tool sits on the first node only.
  return spots.map(([tileX, tileY], i) => ({
    nodeId: `${task.challengeId}_${i + 1}`,
    taskId: task.challengeId,
    kind: task.action,
    tileX,
    tileY,
    assetKey: planting ? 'kf_soil' : task.sprite,
    afterKey: planting ? task.sprite : task.after,
    toolKey: i === 0 ? task.tool : null,
    mapTileWidth: moving ? 1.6 : 1.4,
    interactionType: 'click',
    moving,
    paddock,
  }));
}

let activeNodes = [];

/** Rebuild the one active paddock from the next unfinished cluster. */
export function rebuildActiveNodes() {
  const used = new Set();
  const nodes = [];
  for (const task of pickActiveTasks()) {
    const [tileX, tileY] = slotForTask(task, used);
    task.markerTileX = tileX + PADDOCK.w / 2;
    task.markerTileY = tileY + PADDOCK.h / 2;
    nodes.push(...nodesForOneTask(task, tileX, tileY));
  }
  activeNodes = nodes;
  return activeNodes;
}

/** Nodes on the farm right now. Builds them on the first read. */
export function getActiveWorldNodes() {
  if (!activeNodes.length) rebuildActiveNodes();
  return activeNodes;
}

/** @deprecated use getActiveWorldNodes */
export const WORLD_NODES = [];

/** Task row for a farm_NNN id. */
export function getWorldTask(challengeId) {
  return WORLD_TASKS.find((t) => t.challengeId === challengeId) || null;
}

/** One sprite node in the active cluster. */
export function getWorldNode(nodeId) {
  return (
    getActiveWorldNodes().find((n) => n.nodeId === nodeId) ||
    activeNodes.find((n) => n.nodeId === nodeId) ||
    null
  );
}

/** Node if the id is a sprite, otherwise the parent task. */
export function getWorldChallenge(id) {
  return getWorldNode(id) || getWorldTask(id);
}

/** Sprite nodes that belong to one cluster. */
export function nodesForTask(taskId) {
  return getActiveWorldNodes().filter((n) => n.taskId === taskId);
}

/** Always true. One quiz finishes the cluster; there is no separate item checklist. */
export function areWorldRequirementsMet() {
  return true;
}

/** Always empty. Clusters do not list missing items. */
export function describeMissingItems() {
  return '';
}

/** A missing node counts as finished so the quest scroll does not stall. */
export function isNodeFinished(node) {
  if (!node) return true;
  return isWorldChallengeComplete(node.taskId);
}

/** A correct quiz completes the whole visual cluster. */
export function shouldAutoCompleteTask() {
  return true;
}

/** Quest-scroll row for the one cluster currently on the farm. */
export function buildWorldChallengeProgress() {
  return pickActiveTasks().map((task) => ({
    itemId: task.challengeId,
    challengeId: task.challengeId,
    itemLabel: '',
    source: 'world',
    challengeType: task.challengeType,
    group: task.region,
    title: '',
    description: '',
    done: false,
    locked: false,
    gathered: false,
    collected: 0,
    requiredCount: task.cluster || 1,
    progressLabel: '',
    rewardRp: task.reward?.rp || 0,
    rewardCash: task.reward?.cash || 0,
    difficulty: task.difficulty,
    tileX: task.markerTileX,
    tileY: task.markerTileY,
    interactionType: 'click',
    action: task.action,
  }));
}

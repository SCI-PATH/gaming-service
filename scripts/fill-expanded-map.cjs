const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '..', 'public', 'assets', 'maps', 'map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const W = map.width;
const H = map.height;
const oldW = 60;
const oldH = 45;
const L1 = map.layers.find((l) => l.name === 'Tile Layer');
const L2 = map.layers.find((l) => l.name === 'Tile Layer 2');
const C = map.layers.find((l) => l.name === 'Collisions Layer');

const idx = (x, y) => y * W + x;
const inExp = (x, y) => x >= oldW || y >= oldH;
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

function set1(x, y, v) {
  if (inMap(x, y) && inExp(x, y)) L1.data[idx(x, y)] = v;
}
function set2(x, y, v) {
  if (inMap(x, y) && inExp(x, y)) L2.data[idx(x, y)] = v;
}
function setC(x, y, v) {
  if (inMap(x, y) && inExp(x, y)) C.data[idx(x, y)] = v;
}
function get2(x, y) {
  return inMap(x, y) ? L2.data[idx(x, y)] : 1;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5c10a7);

const TREE = [
  [626, 627, 628],
  [660, 661, 662],
  [728, 729, 730],
  [762, 763, 764],
  [796, 797, 798],
  [830, 831, 832],
];

const GROUND_VARIANTS = [634, 634, 634, 634, 634, 874, 874, 806, 804, 942];
const BUSH = 872;
const ROCK_A = 360;
const ROCK_B = 361;
const FLOWER = 1046;
const SMALL_TREE = [
  [745, 746],
  [747, 748],
];

function canPlaceTree(x, y) {
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (!inMap(xx, yy) || !inExp(xx, yy)) return false;
      if (get2(xx, yy)) return false;
    }
  }
  return true;
}

function placeTree(x, y, block) {
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      set1(x + dx, y + dy, 634);
      set2(x + dx, y + dy, TREE[dy][dx]);
    }
  }
  if (block) {
    setC(x + 1, y + 5, 1);
    setC(x + 1, y + 4, 1);
  }
}

function placeSmallTree(x, y) {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      if (!inExp(x + dx, y + dy)) return;
      if (get2(x + dx, y + dy)) return;
    }
  }
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      set1(x + dx, y + dy, SMALL_TREE[dy][dx]);
    }
  }
}

// 1) Ground variety across expansion
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!inExp(x, y)) continue;
    set1(x, y, GROUND_VARIANTS[Math.floor(rand() * GROUND_VARIANTS.length)]);
    set2(x, y, 0);
    setC(x, y, 0);
  }
}

// 2) Outer border walls on new map edges
for (let x = 0; x < W; x++) {
  set1(x, H - 1, 634);
  set2(x, H - 1, 0);
  setC(x, H - 1, 1);
  if (inExp(x, H - 2)) setC(x, H - 2, 1);
}
for (let y = 0; y < H; y++) {
  set1(W - 1, y, 634);
  set2(W - 1, y, 0);
  setC(W - 1, y, 1);
  if (inExp(W - 2, y)) setC(W - 2, y, 1);
}

// 3) Staggered tree grid across expansion
let trees = 0;
for (let y = 1; y < H - 7; y += 5) {
  const xOffset = (Math.floor(y / 5) % 2) * 3;
  for (let x = 2 + xOffset; x < W - 5; x += 6) {
    let expTiles = 0;
    for (let dy = 0; dy < 6; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        if (inExp(x + dx, y + dy)) expTiles++;
      }
    }
    if (expTiles < 18) continue;
    if (rand() < 0.22) continue;
    const nx = x + Math.floor(rand() * 2);
    const ny = y + Math.floor(rand() * 2);
    if (!canPlaceTree(nx, ny)) continue;
    placeTree(nx, ny, rand() < 0.55);
    trees++;
  }
}

// Denser belt on east expansion
for (let y = 1; y < H - 7; y += 4) {
  for (let x = oldW + 1; x < W - 5; x += 5) {
    if (rand() < 0.3) continue;
    const nx = x + Math.floor(rand() * 2);
    const ny = y + Math.floor(rand() * 2);
    if (canPlaceTree(nx, ny)) {
      placeTree(nx, ny, true);
      trees++;
    }
  }
}

// Denser belt on south expansion
for (let y = oldH + 1; y < H - 7; y += 4) {
  for (let x = 2; x < W - 5; x += 5) {
    if (rand() < 0.3) continue;
    const nx = x + Math.floor(rand() * 2);
    const ny = y + Math.floor(rand() * 2);
    if (canPlaceTree(nx, ny)) {
      placeTree(nx, ny, true);
      trees++;
    }
  }
}

// 4) Bushes, rocks, flowers, small trees
let decor = 0;
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    if (!inExp(x, y)) continue;
    if (get2(x, y)) continue;
    if (C.data[idx(x, y)]) continue;
    const r = rand();
    if (r < 0.045) {
      set2(x, y, BUSH);
      decor++;
    } else if (r < 0.08) {
      set2(x, y, rand() < 0.5 ? ROCK_A : ROCK_B);
      decor++;
    } else if (r < 0.1) {
      set2(x, y, FLOWER);
      decor++;
    } else if (r < 0.12) {
      placeSmallTree(x, y);
      decor++;
    }
  }
}

// 5) Clear running corridor from original map into expansion
const corridorY0 = 28;
const corridorY1 = 40;
for (let y = corridorY0; y <= corridorY1; y++) {
  for (let x = oldW - 2; x < oldW + 14; x++) {
    if (!inMap(x, y)) continue;
    if (!inExp(x, y) && x < oldW - 2) continue;
    L2.data[idx(x, y)] = 0;
    C.data[idx(x, y)] = 0;
    const g = L1.data[idx(x, y)];
    if (g === 745 || g === 746 || g === 747 || g === 748) {
      L1.data[idx(x, y)] = 634;
    }
  }
}
for (let y = corridorY0; y <= corridorY1; y++) {
  for (let x = oldW; x < oldW + 14; x++) {
    if (!inExp(x, y)) continue;
    const r = rand();
    if (r < 0.06) set2(x, y, FLOWER);
    else if (r < 0.12) set1(x, y, 874);
  }
}

fs.writeFileSync(mapPath, JSON.stringify(map));
console.log(JSON.stringify({ trees, decor, W, H }, null, 2));

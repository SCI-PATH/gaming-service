/**
 * Builds a Kenney-style 16×16 farm tilesheet + 500-activity catalog.
 * Run: node frontend/scripts/generate-farm-sheet.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'public', 'assets', 'farm-sheet');
const tileDir = path.join(outDir, 'Tiles');
const SIZE = 16;

const P = {
  ink: [28, 22, 18, 255],
  soil: [122, 78, 42, 255],
  soilD: [86, 52, 28, 255],
  grass: [86, 162, 58, 255],
  leaf: [52, 128, 48, 255],
  leafL: [118, 196, 72, 255],
  stem: [46, 102, 40, 255],
  red: [214, 52, 42, 255],
  redD: [156, 28, 28, 255],
  orange: [232, 132, 36, 255],
  orangeD: [176, 88, 18, 255],
  yellow: [240, 196, 48, 255],
  gold: [214, 168, 52, 255],
  brown: [150, 96, 48, 255],
  tan: [210, 168, 110, 255],
  cream: [240, 224, 186, 255],
  white: [246, 246, 242, 255],
  pink: [236, 110, 150, 255],
  purple: [148, 78, 176, 255],
  magenta: [164, 36, 86, 255],
  green: [62, 150, 64, 255],
  teal: [48, 140, 132, 255],
  blue: [64, 140, 214, 255],
  sky: [158, 206, 240, 255],
  wood: [164, 108, 58, 255],
  woodD: [110, 68, 36, 255],
  gray: [150, 150, 156, 255],
  grayD: [92, 92, 98, 255],
  black: [36, 36, 40, 255],
  straw: [214, 178, 74, 255],
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
}

function canvas(w, h, fill = [0, 0, 0, 0]) {
  const data = Buffer.alloc(w * h * 4);
  if (fill[3]) {
    for (let i = 0; i < w * h; i += 1) data.set(fill, i * 4);
  }
  return { w, h, data };
}

function setPx(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || !c) return;
  img.data.set(c, (y * img.w + x) * 4);
}

function rect(img, x, y, w, h, c) {
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) setPx(img, x + xx, y + yy, c);
  }
}

function disk(img, cx, cy, r, c) {
  const r2 = r * r;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r2) setPx(img, cx + x, cy + y, c);
    }
  }
}

function outline(img) {
  const copy = Buffer.from(img.data);
  const ink = P.ink;
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const i = (y * img.w + x) * 4;
      if (copy[i + 3] < 8) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
        const ni = (ny * img.w + nx) * 4;
        if (copy[ni + 3] < 8) setPx(img, nx, ny, ink);
      }
    }
  }
}

function soilBed(img) {
  rect(img, 2, 12, 12, 3, P.soil);
  rect(img, 3, 12, 10, 1, P.soilD);
}

function plantBase(img, fruit, leaf = P.leaf) {
  soilBed(img);
  rect(img, 7, 6, 2, 7, P.stem);
  rect(img, 4, 5, 3, 2, leaf);
  rect(img, 9, 4, 3, 2, leaf);
  if (fruit) disk(img, 8, 8, 3, fruit);
}

function bulb(img, color) {
  soilBed(img);
  rect(img, 6, 4, 1, 4, P.leaf);
  rect(img, 9, 4, 1, 4, P.leaf);
  disk(img, 8, 10, 3, color);
}

function flower(img, petal, center = P.yellow) {
  soilBed(img);
  rect(img, 7, 8, 2, 5, P.stem);
  disk(img, 8, 6, 3, petal);
  disk(img, 8, 6, 1, center);
}

function herb(img, color) {
  soilBed(img);
  rect(img, 5, 6, 2, 7, color);
  rect(img, 8, 5, 2, 8, P.leaf);
  rect(img, 11, 7, 2, 6, color);
}

function tree(img, fruit = null) {
  rect(img, 7, 10, 2, 5, P.woodD);
  disk(img, 8, 7, 5, P.leaf);
  disk(img, 8, 6, 3, P.leafL);
  if (fruit) {
    setPx(img, 6, 6, fruit);
    setPx(img, 10, 8, fruit);
    setPx(img, 8, 5, fruit);
  }
}

function produce(img, color, extra) {
  disk(img, 8, 9, 5, color);
  extra?.(img);
}

function crate(img, fill) {
  rect(img, 3, 6, 10, 8, P.wood);
  rect(img, 3, 6, 10, 1, P.woodD);
  rect(img, 7, 6, 2, 8, P.woodD);
  if (fill) rect(img, 5, 4, 6, 3, fill);
}

function animal(img, body, spots) {
  rect(img, 4, 7, 9, 5, body);
  rect(img, 11, 5, 4, 4, body);
  rect(img, 4, 12, 2, 3, body);
  rect(img, 10, 12, 2, 3, body);
  setPx(img, 13, 6, P.black);
  spots?.(img);
}

const TILES = [
  ['tomato', (i) => plantBase(i, P.red)],
  ['carrot', (i) => { soilBed(i); rect(i, 7, 7, 2, 6, P.orange); rect(i, 6, 4, 4, 3, P.leaf); }],
  ['potato', (i) => { soilBed(i); disk(i, 6, 10, 3, P.tan); disk(i, 10, 11, 2, P.brown); }],
  ['pumpkin', (i) => { soilBed(i); disk(i, 8, 9, 4, P.orange); rect(i, 7, 5, 2, 2, P.stem); }],
  ['onion', (i) => bulb(i, P.purple)],
  ['cabbage', (i) => { soilBed(i); disk(i, 8, 9, 4, P.leafL); disk(i, 8, 9, 2, P.cream); }],
  ['lettuce', (i) => { soilBed(i); disk(i, 8, 9, 4, P.leafL); rect(i, 5, 7, 2, 3, P.leaf); rect(i, 9, 7, 2, 3, P.leaf); }],
  ['corn', (i) => { soilBed(i); rect(i, 7, 3, 2, 10, P.leaf); rect(i, 6, 6, 4, 6, P.yellow); }],
  ['bean', (i) => { soilBed(i); rect(i, 5, 5, 2, 8, P.stem); rect(i, 9, 6, 2, 7, P.stem); disk(i, 6, 8, 1, P.leafL); disk(i, 10, 9, 1, P.leafL); }],
  ['chilli', (i) => { soilBed(i); rect(i, 7, 5, 2, 8, P.stem); rect(i, 9, 7, 3, 2, P.red); rect(i, 10, 9, 2, 3, P.red); }],
  ['cucumber', (i) => { soilBed(i); rect(i, 5, 8, 7, 3, P.green); rect(i, 4, 5, 3, 3, P.leaf); }],
  ['eggplant', (i) => { soilBed(i); disk(i, 8, 9, 4, P.purple); rect(i, 7, 5, 2, 2, P.stem); }],
  ['spinach', (i) => herb(i, P.leaf)],
  ['radish', (i) => bulb(i, P.pink)],
  ['beet', (i) => bulb(i, P.magenta)],
  ['pea', (i) => { soilBed(i); rect(i, 4, 6, 8, 2, P.leaf); disk(i, 6, 9, 1, P.leafL); disk(i, 8, 10, 1, P.leafL); disk(i, 10, 9, 1, P.leafL); }],
  ['melon', (i) => { soilBed(i); disk(i, 8, 10, 4, P.leaf); rect(i, 6, 9, 4, 1, P.cream); }],
  ['berry', (i) => { soilBed(i); disk(i, 8, 8, 4, P.red); setPx(i, 7, 7, P.yellow); setPx(i, 9, 8, P.yellow); rect(i, 7, 4, 2, 2, P.leaf); }],
  ['banana', (i) => { rect(i, 4, 8, 8, 3, P.yellow); rect(i, 11, 6, 2, 3, P.yellow); rect(i, 3, 7, 2, 2, P.brown); }],
  ['sunflower', (i) => flower(i, P.yellow, P.brown)],
  ['rose', (i) => flower(i, P.red, P.redD)],
  ['daisy', (i) => flower(i, P.white, P.yellow)],
  ['marigold', (i) => flower(i, P.orange, P.orangeD)],
  ['jasmine', (i) => { soilBed(i); rect(i, 7, 8, 2, 5, P.stem); disk(i, 6, 6, 2, P.white); disk(i, 10, 6, 2, P.white); disk(i, 8, 5, 2, P.white); }],
  ['mint', (i) => herb(i, P.teal)],
  ['basil', (i) => herb(i, P.leaf)],
  ['coriander', (i) => herb(i, P.leafL)],
  ['grass', (i) => { rect(i, 3, 10, 2, 5, P.leafL); rect(i, 6, 8, 2, 7, P.leaf); rect(i, 9, 9, 2, 6, P.leafL); rect(i, 12, 11, 2, 4, P.leaf); }],
  ['tree', (i) => tree(i)],
  ['fruit_tree', (i) => tree(i, P.red)],
  ['mango', (i) => produce(i, P.orange, (x) => rect(x, 7, 3, 2, 3, P.stem))],
  ['papaya', (i) => produce(i, P.orange, (x) => rect(x, 7, 4, 2, 2, P.leaf))],
  ['coconut', (i) => produce(i, P.brown, (x) => disk(x, 8, 8, 2, P.tan))],
  ['flower', (i) => flower(i, P.pink, P.yellow)],
  ['weed', (i) => { rect(i, 4, 8, 2, 7, P.stem); rect(i, 8, 6, 2, 9, P.leaf); rect(i, 11, 9, 2, 6, P.stem); }],
  ['fertilizer', (i) => { rect(i, 4, 5, 8, 9, P.gray); rect(i, 6, 3, 4, 3, P.grayD); disk(i, 8, 9, 2, P.gold); }],
  ['compost', (i) => { disk(i, 8, 10, 5, P.brown); rect(i, 6, 7, 4, 2, P.leaf); }],
  ['soil', (i) => { rect(i, 3, 8, 10, 6, P.soil); rect(i, 4, 7, 8, 2, P.soilD); }],
  ['seed', (i) => { rect(i, 5, 6, 6, 8, P.tan); disk(i, 8, 9, 2, P.brown); }],
  ['seedling', (i) => { soilBed(i); rect(i, 7, 8, 2, 5, P.stem); rect(i, 5, 7, 3, 2, P.leafL); rect(i, 8, 6, 3, 2, P.leafL); }],
  ['stake', (i) => { plantBase(i, null); rect(i, 4, 3, 2, 12, P.wood); rect(i, 5, 7, 5, 1, P.tan); }],
  ['leaf', (i) => { disk(i, 8, 8, 5, P.leaf); rect(i, 8, 4, 1, 8, P.stem); }],
  ['scarecrow', (i) => { rect(i, 7, 8, 2, 7, P.wood); rect(i, 3, 8, 10, 2, P.wood); disk(i, 8, 5, 3, P.tan); rect(i, 5, 3, 6, 2, P.straw); }],
  ['bucket', (i) => { rect(i, 5, 7, 6, 7, P.blue); rect(i, 4, 6, 8, 2, P.grayD); rect(i, 6, 8, 4, 3, P.sky); }],
  ['can', (i) => { rect(i, 5, 8, 6, 6, P.gray); rect(i, 10, 6, 4, 2, P.grayD); rect(i, 6, 9, 4, 3, P.blue); }],
  ['basket', (i) => { rect(i, 4, 8, 8, 6, P.tan); rect(i, 5, 6, 6, 3, P.brown); rect(i, 6, 5, 4, 2, P.leafL); }],
  ['crate', (i) => crate(i)],
  ['shelf', (i) => { rect(i, 2, 4, 12, 2, P.wood); rect(i, 2, 9, 12, 2, P.wood); rect(i, 2, 14, 12, 2, P.wood); rect(i, 2, 4, 2, 12, P.woodD); }],
  ['hay', (i) => { rect(i, 4, 6, 8, 8, P.straw); rect(i, 4, 9, 8, 2, P.gold); }],
  ['trough', (i) => { rect(i, 3, 9, 10, 5, P.wood); rect(i, 4, 10, 8, 3, P.blue); }],
  ['gate', (i) => { rect(i, 3, 3, 2, 12, P.woodD); rect(i, 11, 3, 2, 12, P.woodD); rect(i, 3, 6, 10, 2, P.wood); rect(i, 3, 10, 10, 2, P.wood); }],
  ['fence', (i) => { rect(i, 2, 4, 2, 11, P.woodD); rect(i, 7, 4, 2, 11, P.woodD); rect(i, 12, 4, 2, 11, P.woodD); rect(i, 2, 6, 12, 2, P.wood); rect(i, 2, 10, 12, 2, P.wood); }],
  ['fence_broke', (i) => { rect(i, 2, 4, 2, 11, P.woodD); rect(i, 12, 7, 2, 8, P.woodD); rect(i, 2, 6, 7, 2, P.wood); rect(i, 9, 11, 5, 2, P.wood); }],
  ['milk', (i) => { rect(i, 6, 4, 4, 10, P.white); rect(i, 5, 5, 6, 2, P.gray); rect(i, 7, 3, 2, 2, P.grayD); }],
  ['wool', (i) => { disk(i, 8, 8, 5, P.white); disk(i, 6, 7, 2, P.cream); disk(i, 10, 9, 2, P.cream); }],
  ['egg', (i) => { disk(i, 8, 9, 4, P.cream); rect(i, 6, 6, 4, 3, P.cream); }],
  ['nest', (i) => { disk(i, 8, 10, 5, P.brown); disk(i, 8, 9, 3, P.straw); disk(i, 7, 8, 1, P.cream); disk(i, 9, 8, 1, P.cream); }],
  ['feeder', (i) => { rect(i, 4, 8, 8, 6, P.wood); rect(i, 5, 9, 6, 3, P.straw); }],
  ['bowl', (i) => { rect(i, 4, 9, 8, 5, P.tan); rect(i, 5, 10, 6, 3, P.brown); }],
  ['roof', (i) => { rect(i, 2, 8, 12, 6, P.wood); rect(i, 1, 4, 14, 5, P.redD); rect(i, 7, 2, 2, 3, P.redD); }],
  ['paint', (i) => { rect(i, 5, 7, 6, 7, P.blue); rect(i, 6, 4, 2, 4, P.wood); rect(i, 7, 9, 3, 3, P.sky); }],
  ['window', (i) => { rect(i, 4, 4, 8, 9, P.sky); rect(i, 4, 4, 8, 1, P.wood); rect(i, 7, 4, 2, 9, P.wood); rect(i, 4, 8, 8, 1, P.wood); }],
  ['door', (i) => { rect(i, 5, 3, 6, 12, P.wood); rect(i, 9, 9, 1, 2, P.gold); }],
  ['chair', (i) => { rect(i, 5, 7, 6, 3, P.wood); rect(i, 5, 4, 2, 8, P.woodD); rect(i, 9, 10, 2, 4, P.woodD); }],
  ['table', (i) => { rect(i, 3, 7, 10, 3, P.wood); rect(i, 4, 10, 2, 4, P.woodD); rect(i, 10, 10, 2, 4, P.woodD); }],
  ['bed', (i) => { rect(i, 2, 8, 12, 5, P.wood); rect(i, 3, 7, 10, 4, P.blue); rect(i, 3, 7, 4, 4, P.white); }],
  ['lamp', (i) => { rect(i, 7, 8, 2, 6, P.wood); disk(i, 8, 6, 3, P.yellow); }],
  ['books', (i) => { rect(i, 3, 4, 10, 11, P.wood); rect(i, 4, 6, 8, 2, P.red); rect(i, 4, 9, 8, 2, P.blue); rect(i, 4, 12, 8, 2, P.gold); }],
  ['rug', (i) => { rect(i, 3, 6, 10, 7, P.redD); rect(i, 5, 8, 6, 3, P.gold); }],
  ['curtain', (i) => { rect(i, 3, 3, 4, 12, P.blue); rect(i, 9, 3, 4, 12, P.sky); rect(i, 3, 3, 10, 2, P.wood); }],
  ['picture', (i) => { rect(i, 4, 4, 8, 9, P.wood); rect(i, 5, 5, 6, 7, P.sky); disk(i, 8, 8, 2, P.yellow); }],
  ['pot', (i) => { rect(i, 5, 9, 6, 5, P.brown); rect(i, 6, 4, 2, 6, P.stem); disk(i, 7, 4, 3, P.leaf); }],
  ['cupboard', (i) => { rect(i, 4, 3, 8, 12, P.wood); rect(i, 8, 3, 1, 12, P.woodD); setPx(i, 6, 9, P.gold); setPx(i, 10, 9, P.gold); }],
  ['broom', (i) => { rect(i, 7, 2, 2, 10, P.wood); rect(i, 5, 11, 6, 4, P.straw); }],
  ['rock', (i) => { disk(i, 7, 10, 4, P.gray); disk(i, 11, 11, 3, P.grayD); }],
  ['branch', (i) => { rect(i, 2, 8, 12, 2, P.woodD); rect(i, 8, 5, 2, 4, P.wood); rect(i, 10, 4, 3, 2, P.leaf); }],
  ['wood', (i) => { rect(i, 3, 6, 4, 8, P.wood); rect(i, 8, 5, 4, 9, P.woodD); }],
  ['path', (i) => { rect(i, 2, 7, 12, 4, P.gray); setPx(i, 4, 8, P.grayD); setPx(i, 9, 9, P.grayD); }],
  ['shovel', (i) => { rect(i, 7, 2, 2, 9, P.wood); rect(i, 5, 10, 6, 4, P.gray); }],
  ['hoe', (i) => { rect(i, 4, 3, 2, 10, P.wood); rect(i, 5, 11, 8, 2, P.grayD); }],
  ['rake', (i) => { rect(i, 7, 2, 2, 10, P.wood); rect(i, 4, 12, 8, 2, P.gray); rect(i, 4, 11, 2, 3, P.gray); rect(i, 10, 11, 2, 3, P.gray); }],
  ['well', (i) => { disk(i, 8, 11, 5, P.gray); disk(i, 8, 11, 3, P.blue); rect(i, 3, 6, 2, 5, P.wood); rect(i, 11, 6, 2, 5, P.wood); rect(i, 3, 5, 10, 2, P.woodD); }],
  ['barrel', (i) => { rect(i, 5, 4, 6, 11, P.wood); rect(i, 5, 7, 6, 2, P.woodD); rect(i, 5, 11, 6, 2, P.woodD); }],
  ['sign', (i) => { rect(i, 7, 8, 2, 7, P.woodD); rect(i, 3, 4, 10, 6, P.wood); rect(i, 5, 6, 6, 2, P.cream); }],
  ['tarp', (i) => { rect(i, 3, 6, 10, 7, P.blue); rect(i, 2, 5, 12, 2, P.grayD); }],
  ['hammer', (i) => { rect(i, 7, 5, 2, 9, P.wood); rect(i, 4, 4, 8, 3, P.gray); }],
  ['brush', (i) => { rect(i, 7, 3, 2, 8, P.wood); rect(i, 5, 10, 6, 4, P.tan); }],
  ['pail', (i) => { rect(i, 5, 6, 6, 8, P.gray); rect(i, 6, 7, 4, 5, P.white); rect(i, 4, 5, 8, 2, P.grayD); }],
  ['cobweb', (i) => { rect(i, 3, 3, 10, 1, P.white); rect(i, 3, 3, 1, 10, P.white); setPx(i, 6, 6, P.white); setPx(i, 9, 8, P.white); setPx(i, 12, 5, P.white); }],
  ['mud', (i) => { disk(i, 6, 10, 4, P.soilD); disk(i, 11, 11, 3, P.soil); }],
  ['storm', (i) => { disk(i, 6, 5, 4, P.gray); disk(i, 10, 6, 3, P.grayD); rect(i, 8, 9, 2, 5, P.yellow); }],
  ['sun', (i) => { disk(i, 8, 8, 4, P.yellow); rect(i, 8, 2, 1, 2, P.gold); rect(i, 8, 12, 1, 2, P.gold); }],
  ['cover', (i) => { plantBase(i, P.leafL, P.leaf); rect(i, 3, 4, 10, 3, P.white); }],
  ['cow', (i) => animal(i, P.white, (x) => { rect(x, 6, 8, 2, 2, P.black); rect(x, 10, 9, 2, 2, P.black); })],
  ['calf', (i) => { rect(i, 5, 8, 7, 4, P.white); rect(i, 10, 6, 3, 3, P.white); rect(i, 5, 12, 2, 2, P.white); rect(i, 9, 12, 2, 2, P.white); setPx(i, 12, 7, P.black); }],
  ['chicken', (i) => { disk(i, 8, 9, 4, P.white); rect(i, 11, 8, 3, 2, P.white); rect(i, 8, 5, 2, 2, P.red); setPx(i, 13, 8, P.orange); }],
  ['duck', (i) => { disk(i, 8, 9, 4, P.white); rect(i, 11, 7, 3, 2, P.white); rect(i, 13, 7, 2, 2, P.orange); }],
  ['sheep', (i) => animal(i, P.white, (x) => disk(x, 12, 6, 2, P.grayD))],
  ['goat', (i) => { animal(i, P.cream); rect(i, 13, 4, 1, 3, P.tan); rect(i, 11, 4, 1, 3, P.tan); }],
  ['kid', (i) => { rect(i, 5, 8, 7, 4, P.cream); rect(i, 10, 6, 3, 3, P.cream); rect(i, 12, 4, 1, 2, P.tan); }],
  ['bird', (i) => { disk(i, 8, 9, 3, P.blue); rect(i, 4, 8, 4, 2, P.blue); setPx(i, 11, 8, P.orange); }],
];

const ANIMALS = new Set(['cow', 'calf', 'chicken', 'duck', 'sheep', 'goat', 'kid', 'bird']);

function A(n, region, action, sprite, after, cluster, tool = null) {
  return { n, region, action, sprite: `fs_${sprite}`, after: after ? `fs_${after}` : null, cluster, tool: tool ? `fs_${tool}` : null };
}

function cropGroup(start, names, action, tool, cluster = 4) {
  return names.map((name, i) => A(start + i, 'crops', action, name, name, cluster, tool));
}

const WATER_WEED = ['tomato', 'carrot', 'potato', 'pumpkin', 'onion', 'cabbage', 'lettuce', 'corn', 'bean', 'flower'];

const ACTIVITIES = [
  ...cropGroup(1, ['tomato', 'carrot', 'potato', 'pumpkin', 'onion', 'cabbage', 'lettuce', 'corn', 'bean', 'chilli', 'cucumber', 'eggplant', 'spinach', 'radish', 'beet', 'pea', 'melon', 'berry', 'banana', 'sunflower', 'rose', 'daisy', 'marigold', 'jasmine', 'mint', 'basil', 'coriander', 'grass'], 'plant', null, 4),
  A(29, 'crops', 'plant', 'tree', 'tree', 1),
  A(30, 'crops', 'plant', 'fruit_tree', 'fruit_tree', 1),
  ...cropGroup(31, WATER_WEED, 'water', 'bucket', 4),
  ...cropGroup(41, WATER_WEED, 'clean', 'weed', 4),
  A(51, 'crops', 'tend', 'tomato', 'tomato', 4, 'fertilizer'),
  A(52, 'crops', 'tend', 'cabbage', 'cabbage', 4, 'fertilizer'),
  A(53, 'crops', 'tend', 'flower', 'flower', 4, 'fertilizer'),
  A(54, 'crops', 'tend', 'compost', 'leaf', 4),
  A(55, 'crops', 'tend', 'soil', 'tomato', 4),
  A(56, 'crops', 'tend', 'soil', 'soil', 4),
  A(57, 'crops', 'plant', 'soil', 'seed', 1),
  A(58, 'crops', 'plant', 'soil', 'seedling', 1),
  A(59, 'crops', 'plant', 'soil', 'seedling', 4),
  A(60, 'crops', 'plant', 'seed', 'seedling', 6),
  A(61, 'crops', 'plant', 'seedling', 'tomato', 6),
  A(62, 'crops', 'place', 'seedling', 'seedling', 1),
  A(63, 'crops', 'protect', 'seedling', 'seedling', 1),
  A(64, 'crops', 'place', 'stake', 'stake', 1),
  A(65, 'crops', 'tend', 'stake', 'tomato', 1),
  A(66, 'crops', 'clean', 'leaf', 'tomato', 6),
  A(67, 'crops', 'collect', 'leaf', null, 6),
  A(68, 'crops', 'tend', 'seedling', 'leaf', 1),
  A(69, 'crops', 'tend', 'flower', 'rose', 1),
  A(70, 'crops', 'tend', 'tomato', 'tomato', 1),
  A(71, 'crops', 'protect', 'tomato', 'scarecrow', 4),
  A(72, 'crops', 'protect', 'cabbage', 'cover', 4),
  A(73, 'crops', 'protect', 'seedling', 'cover', 4),
  A(74, 'crops', 'place', 'scarecrow', 'scarecrow', 1),
  A(75, 'crops', 'place', 'scarecrow', 'scarecrow', 1),
  A(76, 'crops', 'repair', 'scarecrow', 'scarecrow', 1),
  A(77, 'crops', 'water', 'tomato', 'tomato', 4, 'bucket'),
  A(78, 'crops', 'water', 'cabbage', 'cabbage', 4, 'can'),
  A(79, 'crops', 'water', 'can', 'can', 1),
  A(80, 'crops', 'place', 'bucket', 'tomato', 1),
  A(81, 'crops', 'collect', 'tomato', null, 6),
  A(82, 'crops', 'collect', 'carrot', null, 6),
  A(83, 'crops', 'collect', 'potato', null, 6),
  A(84, 'crops', 'collect', 'pumpkin', null, 6),
  A(85, 'crops', 'collect', 'onion', null, 6),
  A(86, 'crops', 'collect', 'cabbage', null, 6),
  A(87, 'crops', 'collect', 'lettuce', null, 6),
  A(88, 'crops', 'collect', 'corn', null, 6),
  A(89, 'crops', 'collect', 'bean', null, 6),
  A(90, 'crops', 'collect', 'cucumber', null, 6),
  A(91, 'crops', 'collect', 'berry', null, 6),
  A(92, 'crops', 'collect', 'flower', null, 6),
  A(93, 'crops', 'collect', 'mango', null, 6),
  A(94, 'crops', 'collect', 'banana', null, 6),
  A(95, 'crops', 'collect', 'mango', null, 6),
  A(96, 'crops', 'collect', 'papaya', null, 6),
  A(97, 'store', 'arrange', 'cabbage', 'basket', 6),
  A(98, 'store', 'place', 'potato', 'crate', 6),
  A(99, 'store', 'arrange', 'tomato', 'crate', 6),
  A(100, 'store', 'place', 'crate', 'shelf', 3),
  A(101, 'cows', 'tend', 'cow', 'cow', 1, 'bowl'),
  A(102, 'cows', 'feed', 'cow', 'cow', 1, 'hay'),
  A(103, 'cows', 'water', 'cow', 'cow', 1, 'bucket'),
  A(104, 'cows', 'clean', 'cow', 'cow', 1, 'brush'),
  A(105, 'cows', 'tend', 'cow', 'cow', 1, 'brush'),
  A(106, 'cows', 'clean', 'hay', 'cow', 4),
  A(107, 'cows', 'place', 'hay', 'hay', 4),
  A(108, 'cows', 'collect', 'hay', null, 6),
  A(109, 'cows', 'feed', 'cow', 'cow', 1, 'hay'),
  A(110, 'cows', 'water', 'trough', 'bucket', 1),
  A(111, 'cows', 'repair', 'feeder', 'hay', 2),
  A(112, 'cows', 'repair', 'fence_broke', 'fence', 2),
  A(113, 'cows', 'repair', 'gate', 'gate', 1),
  A(114, 'cows', 'repair', 'roof', 'roof', 1),
  A(115, 'cows', 'clean', 'mud', 'cow', 4),
  A(116, 'cows', 'clean', 'mud', null, 4),
  A(117, 'cows', 'place', 'hay', 'cow', 4),
  A(118, 'cows', 'arrange', 'crate', 'crate', 3),
  A(119, 'cows', 'tend', 'hay', 'cow', 1),
  A(120, 'cows', 'water', 'bucket', 'cow', 1),
  A(121, 'cows', 'protect', 'calf', 'calf', 1),
  A(122, 'cows', 'feed', 'calf', 'calf', 1, 'hay'),
  A(123, 'cows', 'water', 'calf', 'calf', 1, 'bucket'),
  A(124, 'cows', 'find', 'calf', 'calf', 1),
  A(125, 'cows', 'place', 'calf', 'cow', 1),
  A(126, 'cows', 'clean', 'hay', 'calf', 4),
  A(127, 'cows', 'place', 'hay', 'calf', 3),
  A(128, 'cows', 'place', 'fence', 'calf', 2),
  A(129, 'cows', 'repair', 'fence_broke', 'fence', 2),
  A(130, 'cows', 'protect', 'calf', 'tarp', 1),
  A(131, 'cows', 'protect', 'calf', 'sun', 1),
  A(132, 'cows', 'place', 'calf', 'hay', 1),
  A(133, 'cows', 'place', 'gate', 'gate', 1),
  A(134, 'cows', 'place', 'gate', 'gate', 1),
  A(135, 'cows', 'place', 'calf', 'cow', 1),
  A(136, 'cows', 'collect', 'hay', null, 4),
  A(137, 'cows', 'place', 'bowl', 'bowl', 1),
  A(138, 'cows', 'feed', 'bowl', 'hay', 1),
  A(139, 'cows', 'clean', 'bowl', 'bowl', 1),
  A(140, 'cows', 'water', 'bowl', 'bucket', 1),
  A(141, 'cows', 'clean', 'bowl', 'bowl', 1),
  A(142, 'cows', 'feed', 'calf', 'calf', 1, 'hay'),
  A(143, 'cows', 'place', 'hay', 'hay', 4),
  A(144, 'cows', 'arrange', 'hay', 'cow', 4),
  A(145, 'cows', 'repair', 'feeder', 'hay', 1),
  A(146, 'cows', 'place', 'hay', 'hay', 1),
  A(147, 'cows', 'clean', 'mud', 'cow', 4),
  A(148, 'cows', 'place', 'pail', 'pail', 1),
  A(149, 'cows', 'clean', 'pail', 'pail', 1),
  A(150, 'store', 'place', 'milk', 'crate', 1),
  A(151, 'store', 'place', 'milk', 'shelf', 3),
  A(152, 'store', 'clean', 'pail', 'pail', 1),
  A(153, 'store', 'place', 'milk', 'milk', 3),
  A(154, 'store', 'arrange', 'milk', 'shelf', 4),
  A(155, 'cows', 'clean', 'pail', 'pail', 1),
  A(156, 'cows', 'arrange', 'pail', 'crate', 2),
  A(157, 'cows', 'repair', 'pail', 'pail', 1),
  A(158, 'cows', 'repair', 'bowl', 'bowl', 1),
  A(159, 'cows', 'repair', 'gate', 'gate', 1),
  A(160, 'cows', 'repair', 'fence_broke', 'fence', 3),
  A(161, 'cows', 'place', 'gate', 'gate', 1),
  A(162, 'cows', 'place', 'gate', 'gate', 1),
  A(163, 'cows', 'place', 'cow', 'hay', 3),
  A(164, 'cows', 'place', 'cow', 'cow', 3),
  A(165, 'cows', 'place', 'cow', 'hay', 3),
  A(166, 'cows', 'tend', 'cow', 'cow', 3),
  A(167, 'cows', 'find', 'cow', 'cow', 1),
  A(168, 'cows', 'tend', 'cow', 'cow', 3),
  A(169, 'weather', 'protect', 'cow', 'tarp', 3),
  A(170, 'weather', 'place', 'hay', 'cow', 4),
  A(171, 'weather', 'place', 'hay', 'cow', 4),
  A(172, 'cows', 'clean', 'mud', 'cow', 4),
  A(173, 'cows', 'repair', 'fence_broke', 'fence', 3),
  A(174, 'cows', 'place', 'hay', 'hay', 4),
  A(175, 'cows', 'clean', 'hay', null, 4),
  A(176, 'store', 'place', 'crate', 'hay', 3),
  A(177, 'store', 'clean', 'crate', 'crate', 3),
  A(178, 'store', 'arrange', 'hay', 'crate', 4),
  A(179, 'store', 'place', 'hay', 'cow', 4),
  A(180, 'cows', 'protect', 'cow', 'hay', 3),
  A(181, 'birds', 'feed', 'chicken', 'chicken', 4, 'hay'),
  A(182, 'birds', 'water', 'chicken', 'chicken', 4, 'bucket'),
  A(183, 'birds', 'collect', 'egg', null, 6),
  A(184, 'birds', 'clean', 'hay', 'chicken', 4),
  A(185, 'birds', 'place', 'hay', 'chicken', 4),
  A(186, 'birds', 'repair', 'fence_broke', 'fence', 2),
  A(187, 'birds', 'repair', 'gate', 'gate', 1),
  A(188, 'birds', 'repair', 'roof', 'roof', 1),
  A(189, 'birds', 'place', 'gate', 'chicken', 1),
  A(190, 'birds', 'place', 'gate', 'chicken', 1),
  A(191, 'birds', 'place', 'chicken', 'hay', 4),
  A(192, 'birds', 'place', 'chicken', 'chicken', 4),
  A(193, 'weather', 'protect', 'chicken', 'tarp', 4),
  A(194, 'birds', 'protect', 'chicken', 'scarecrow', 4),
  A(195, 'birds', 'place', 'fence', 'chicken', 2),
  A(196, 'birds', 'repair', 'fence', 'fence', 3),
  A(197, 'birds', 'feed', 'feeder', 'chicken', 1),
  A(198, 'birds', 'clean', 'feeder', 'feeder', 1),
  A(199, 'birds', 'water', 'bucket', 'chicken', 1),
  A(200, 'birds', 'clean', 'bucket', 'bucket', 1),
  A(201, 'store', 'arrange', 'egg', 'crate', 6),
  A(202, 'store', 'place', 'egg', 'basket', 6),
  A(203, 'store', 'place', 'egg', 'crate', 6),
  A(204, 'store', 'place', 'egg', 'shelf', 6),
  A(205, 'store', 'clean', 'basket', 'basket', 1),
  A(206, 'birds', 'find', 'chicken', 'chicken', 1),
  A(207, 'birds', 'place', 'chicken', 'chicken', 1),
  A(208, 'birds', 'tend', 'chicken', 'chicken', 4),
  A(209, 'birds', 'tend', 'nest', 'egg', 3),
  A(210, 'birds', 'place', 'hay', 'nest', 3),
  A(211, 'birds', 'feed', 'duck', 'duck', 3, 'hay'),
  A(212, 'birds', 'water', 'duck', 'duck', 3, 'bucket'),
  A(213, 'birds', 'clean', 'hay', 'duck', 4),
  A(214, 'birds', 'repair', 'fence_broke', 'fence', 2),
  A(215, 'birds', 'collect', 'egg', null, 4),
  A(216, 'birds', 'place', 'fence', 'duck', 2),
  A(217, 'weather', 'protect', 'duck', 'tarp', 3),
  A(218, 'birds', 'place', 'duck', 'well', 3),
  A(219, 'birds', 'place', 'duck', 'hay', 3),
  A(220, 'birds', 'feed', 'feeder', 'duck', 1),
  A(221, 'birds', 'clean', 'feeder', 'feeder', 1),
  A(222, 'birds', 'clean', 'well', 'duck', 1),
  A(223, 'birds', 'repair', 'fence', 'fence', 3),
  A(224, 'birds', 'place', 'fence', 'bird', 1),
  A(225, 'birds', 'feed', 'feeder', 'bird', 1),
  A(226, 'birds', 'place', 'feeder', 'tree', 1),
  A(227, 'birds', 'clean', 'feeder', 'feeder', 1),
  A(228, 'birds', 'feed', 'seed', 'bird', 1),
  A(229, 'weather', 'protect', 'bird', 'tarp', 3),
  A(230, 'birds', 'arrange', 'hay', 'chicken', 4),
  A(231, 'herd', 'feed', 'sheep', 'sheep', 3, 'hay'),
  A(232, 'herd', 'water', 'sheep', 'sheep', 3, 'bucket'),
  A(233, 'herd', 'clean', 'hay', 'sheep', 4),
  A(234, 'herd', 'repair', 'fence_broke', 'fence', 2),
  A(235, 'herd', 'repair', 'fence', 'fence', 3),
  A(236, 'herd', 'collect', 'wool', null, 6),
  A(237, 'store', 'place', 'wool', 'crate', 6),
  A(238, 'store', 'arrange', 'wool', 'shelf', 6),
  A(239, 'store', 'place', 'wool', 'crate', 4),
  A(240, 'herd', 'place', 'hay', 'sheep', 3),
  A(241, 'herd', 'place', 'hay', 'sheep', 3),
  A(242, 'herd', 'clean', 'hay', null, 3),
  A(243, 'herd', 'place', 'sheep', 'hay', 3),
  A(244, 'herd', 'place', 'sheep', 'sheep', 3),
  A(245, 'herd', 'tend', 'sheep', 'sheep', 3),
  A(246, 'herd', 'find', 'sheep', 'sheep', 1),
  A(247, 'herd', 'place', 'sheep', 'hay', 1),
  A(248, 'weather', 'protect', 'sheep', 'tarp', 3),
  A(249, 'weather', 'protect', 'sheep', 'sun', 3),
  A(250, 'herd', 'feed', 'feeder', 'sheep', 1),
  A(251, 'herd', 'clean', 'feeder', 'feeder', 1),
  A(252, 'herd', 'water', 'bucket', 'sheep', 1),
  A(253, 'herd', 'clean', 'bucket', 'bucket', 1),
  A(254, 'herd', 'feed', 'goat', 'goat', 3, 'hay'),
  A(255, 'herd', 'water', 'goat', 'goat', 3, 'bucket'),
  A(256, 'herd', 'clean', 'hay', 'goat', 4),
  A(257, 'herd', 'repair', 'fence_broke', 'fence', 2),
  A(258, 'herd', 'repair', 'fence', 'fence', 3),
  A(259, 'herd', 'place', 'fence', 'goat', 2),
  A(260, 'herd', 'feed', 'feeder', 'goat', 1),
  A(261, 'herd', 'clean', 'feeder', 'feeder', 1),
  A(262, 'herd', 'water', 'bucket', 'goat', 1),
  A(263, 'herd', 'clean', 'bucket', 'bucket', 1),
  A(264, 'herd', 'find', 'goat', 'goat', 1),
  A(265, 'herd', 'place', 'goat', 'hay', 1),
  A(266, 'herd', 'place', 'goat', 'hay', 3),
  A(267, 'herd', 'place', 'goat', 'goat', 3),
  A(268, 'herd', 'tend', 'goat', 'goat', 3),
  A(269, 'weather', 'protect', 'goat', 'tarp', 3),
  A(270, 'herd', 'place', 'hay', 'goat', 3),
  A(271, 'herd', 'place', 'hay', 'goat', 3),
  A(272, 'herd', 'feed', 'kid', 'kid', 1, 'hay'),
  A(273, 'herd', 'water', 'kid', 'kid', 1, 'bucket'),
  A(274, 'herd', 'protect', 'kid', 'kid', 1),
  A(275, 'herd', 'find', 'kid', 'kid', 1),
  A(276, 'herd', 'repair', 'fence_broke', 'fence', 2),
  A(277, 'herd', 'repair', 'gate', 'gate', 1),
  A(278, 'herd', 'place', 'fence', 'fence', 4),
  A(279, 'herd', 'tend', 'fence', 'fence', 4),
  A(280, 'herd', 'protect', 'sheep', 'hay', 3),
  A(281, 'house', 'repair', 'roof', 'roof', 1),
  A(282, 'house', 'repair', 'roof', 'roof', 4),
  A(283, 'house', 'repair', 'roof', 'roof', 1),
  A(284, 'house', 'tend', 'paint', 'paint', 1),
  A(285, 'house', 'tend', 'door', 'paint', 1),
  A(286, 'house', 'tend', 'bed', 'paint', 1),
  A(287, 'house', 'tend', 'chair', 'paint', 2),
  A(288, 'house', 'tend', 'table', 'paint', 1),
  A(289, 'house', 'tend', 'crate', 'paint', 3),
  A(290, 'house', 'clean', 'broom', 'rug', 1),
  A(291, 'house', 'clean', 'broom', 'rug', 1),
  A(292, 'house', 'clean', 'rug', 'rug', 1),
  A(293, 'house', 'clean', 'cupboard', 'cupboard', 1),
  A(294, 'house', 'clean', 'window', 'window', 1),
  A(295, 'house', 'repair', 'window', 'window', 1),
  A(296, 'house', 'repair', 'window', 'window', 1),
  A(297, 'house', 'repair', 'door', 'door', 1),
  A(298, 'house', 'repair', 'door', 'door', 1),
  A(299, 'house', 'repair', 'door', 'door', 1),
  A(300, 'house', 'tend', 'door', 'paint', 1),
  A(301, 'yard', 'repair', 'fence_broke', 'fence', 4),
  A(302, 'yard', 'repair', 'fence_broke', 'fence', 4),
  A(303, 'yard', 'repair', 'gate', 'gate', 1),
  A(304, 'yard', 'tend', 'gate', 'paint', 1),
  A(305, 'house', 'clean', 'cobweb', 'rug', 4),
  A(306, 'yard', 'clean', 'mud', null, 6),
  A(307, 'house', 'clean', 'cobweb', null, 6),
  A(308, 'house', 'clean', 'mud', null, 6),
  A(309, 'house', 'clean', 'cobweb', 'rug', 4),
  A(310, 'house', 'clean', 'paint', 'paint', 1),
  A(311, 'house', 'repair', 'paint', 'paint', 1),
  A(312, 'house', 'clean', 'table', 'table', 1),
  A(313, 'house', 'arrange', 'bowl', 'table', 4),
  A(314, 'house', 'clean', 'table', 'table', 1),
  A(315, 'house', 'repair', 'table', 'table', 1),
  A(316, 'house', 'arrange', 'bowl', 'table', 4),
  A(317, 'house', 'arrange', 'pail', 'table', 3),
  A(318, 'house', 'arrange', 'bucket', 'table', 3),
  A(319, 'house', 'place', 'chair', 'chair', 1),
  A(320, 'house', 'place', 'table', 'table', 1),
  A(321, 'house', 'repair', 'chair', 'chair', 1),
  A(322, 'house', 'repair', 'table', 'table', 1),
  A(323, 'house', 'place', 'bed', 'bed', 1),
  A(324, 'house', 'arrange', 'bed', 'table', 1),
  A(325, 'house', 'place', 'table', 'table', 1),
  A(326, 'house', 'place', 'lamp', 'lamp', 1),
  A(327, 'house', 'place', 'books', 'books', 1),
  A(328, 'house', 'place', 'books', 'books', 1),
  A(329, 'house', 'repair', 'books', 'books', 1),
  A(330, 'house', 'arrange', 'crate', 'books', 4),
  A(331, 'house', 'arrange', 'crate', 'books', 4),
  A(332, 'house', 'place', 'rug', 'rug', 1),
  A(333, 'house', 'place', 'curtain', 'cupboard', 1),
  A(334, 'house', 'place', 'picture', 'cupboard', 1),
  A(335, 'house', 'place', 'pot', 'pot', 1),
  A(336, 'house', 'place', 'pot', 'flower', 1),
  A(337, 'house', 'place', 'lamp', 'lamp', 1),
  A(338, 'house', 'arrange', 'chair', 'table', 2),
  A(339, 'house', 'arrange', 'bed', 'lamp', 1),
  A(340, 'house', 'arrange', 'table', 'bowl', 1),
  A(341, 'house', 'arrange', 'pot', 'rug', 1),
  A(342, 'store', 'arrange', 'crate', 'shelf', 4),
  A(343, 'store', 'clean', 'crate', 'shelf', 4),
  A(344, 'store', 'repair', 'crate', 'crate', 1),
  A(345, 'store', 'arrange', 'crate', 'crate', 4),
  A(346, 'house', 'place', 'cupboard', 'cupboard', 1),
  A(347, 'house', 'place', 'cupboard', 'cupboard', 1),
  A(348, 'house', 'clean', 'table', 'chair', 2),
  A(349, 'house', 'tend', 'table', 'table', 1),
  A(350, 'house', 'arrange', 'chair', 'table', 3),
  A(351, 'yard', 'clean', 'broom', null, 1),
  A(352, 'yard', 'clean', 'mud', null, 8),
  A(353, 'yard', 'clean', 'rock', null, 8),
  A(354, 'yard', 'clean', 'branch', null, 3),
  A(355, 'yard', 'collect', 'leaf', null, 8),
  A(356, 'yard', 'collect', 'grass', null, 6),
  A(357, 'yard', 'collect', 'wood', null, 4),
  A(358, 'yard', 'arrange', 'wood', 'wood', 4),
  A(359, 'yard', 'place', 'branch', 'wood', 1),
  A(360, 'yard', 'clean', 'path', null, 1),
  A(361, 'yard', 'repair', 'path', 'path', 1),
  A(362, 'yard', 'place', 'rock', 'path', 6),
  A(363, 'yard', 'clean', 'mud', 'path', 6),
  A(364, 'yard', 'plant', 'flower', 'flower', 6),
  A(365, 'yard', 'water', 'flower', 'flower', 6, 'bucket'),
  A(366, 'yard', 'clean', 'weed', 'flower', 6),
  A(367, 'yard', 'plant', 'grass', 'grass', 8),
  A(368, 'yard', 'water', 'grass', 'grass', 8, 'can'),
  A(369, 'yard', 'repair', 'fence_broke', 'fence', 4),
  A(370, 'yard', 'place', 'fence', 'fence', 4),
  A(371, 'yard', 'tend', 'fence', 'paint', 4),
  A(372, 'yard', 'repair', 'gate', 'gate', 1),
  A(373, 'yard', 'place', 'gate', 'gate', 1),
  A(374, 'yard', 'place', 'gate', 'gate', 1),
  A(375, 'yard', 'plant', 'flower', 'flower', 6),
  A(376, 'yard', 'tend', 'soil', 'flower', 6),
  A(377, 'yard', 'plant', 'flower', 'flower', 6),
  A(378, 'yard', 'water', 'flower', 'flower', 6, 'bucket'),
  A(379, 'yard', 'clean', 'weed', 'flower', 6),
  A(380, 'yard', 'tend', 'compost', 'flower', 6),
  A(381, 'yard', 'place', 'scarecrow', 'scarecrow', 1),
  A(382, 'yard', 'place', 'scarecrow', 'scarecrow', 1),
  A(383, 'yard', 'repair', 'scarecrow', 'scarecrow', 1),
  A(384, 'crops', 'protect', 'cover', 'flower', 6),
  A(385, 'crops', 'protect', 'tomato', 'scarecrow', 6),
  A(386, 'crops', 'protect', 'cabbage', 'cover', 6),
  A(387, 'yard', 'clean', 'shovel', 'crate', 3),
  A(388, 'yard', 'arrange', 'shovel', 'crate', 3),
  A(389, 'yard', 'repair', 'shovel', 'shovel', 1),
  A(390, 'yard', 'repair', 'hoe', 'hoe', 1),
  A(391, 'yard', 'repair', 'rake', 'rake', 1),
  A(392, 'yard', 'clean', 'shovel', 'shovel', 1),
  A(393, 'yard', 'clean', 'rake', 'rake', 1),
  A(394, 'yard', 'clean', 'hoe', 'hoe', 1),
  A(395, 'yard', 'arrange', 'shovel', 'crate', 3),
  A(396, 'yard', 'place', 'shelf', 'shelf', 1),
  A(397, 'yard', 'arrange', 'shovel', 'shelf', 3),
  A(398, 'yard', 'repair', 'shelf', 'shelf', 1),
  A(399, 'yard', 'water', 'barrel', 'barrel', 1, 'bucket'),
  A(400, 'yard', 'clean', 'barrel', 'barrel', 1),
  A(401, 'yard', 'repair', 'barrel', 'barrel', 1),
  A(402, 'crops', 'water', 'tomato', 'tomato', 6, 'bucket'),
  A(403, 'yard', 'water', 'barrel', 'barrel', 1, 'bucket'),
  A(404, 'yard', 'clean', 'barrel', 'barrel', 1),
  A(405, 'yard', 'place', 'barrel', 'barrel', 1),
  A(406, 'yard', 'repair', 'barrel', 'barrel', 1),
  A(407, 'yard', 'clean', 'well', 'well', 1),
  A(408, 'yard', 'repair', 'well', 'well', 1),
  A(409, 'yard', 'water', 'well', 'bucket', 1),
  A(410, 'yard', 'place', 'bucket', 'well', 1),
  A(411, 'yard', 'repair', 'bucket', 'bucket', 1),
  A(412, 'cows', 'water', 'trough', 'bucket', 1),
  A(413, 'yard', 'tend', 'well', 'bucket', 1),
  A(414, 'yard', 'clean', 'well', 'well', 1),
  A(415, 'yard', 'repair', 'sign', 'sign', 1),
  A(416, 'yard', 'tend', 'sign', 'paint', 1),
  A(417, 'yard', 'place', 'sign', 'sign', 1),
  A(418, 'yard', 'clean', 'path', 'gate', 4),
  A(419, 'yard', 'repair', 'gate', 'gate', 1),
  A(420, 'yard', 'arrange', 'broom', 'sign', 1),
  A(421, 'crops', 'collect', 'cabbage', null, 8),
  A(422, 'crops', 'collect', 'tomato', null, 6),
  A(423, 'crops', 'collect', 'carrot', null, 6),
  A(424, 'crops', 'collect', 'potato', null, 6),
  A(425, 'crops', 'collect', 'pumpkin', null, 6),
  A(426, 'crops', 'collect', 'onion', null, 6),
  A(427, 'crops', 'collect', 'cabbage', null, 6),
  A(428, 'crops', 'collect', 'lettuce', null, 6),
  A(429, 'crops', 'collect', 'corn', null, 6),
  A(430, 'crops', 'collect', 'bean', null, 6),
  A(431, 'crops', 'collect', 'mango', null, 6),
  A(432, 'crops', 'collect', 'mango', null, 6),
  A(433, 'crops', 'collect', 'banana', null, 6),
  A(434, 'crops', 'collect', 'papaya', null, 6),
  A(435, 'crops', 'collect', 'coconut', null, 4),
  A(436, 'store', 'arrange', 'potato', 'crate', 8),
  A(437, 'store', 'arrange', 'mango', 'crate', 6),
  A(438, 'store', 'water', 'tomato', 'tomato', 6, 'bucket'),
  A(439, 'store', 'water', 'mango', 'mango', 6, 'bucket'),
  A(440, 'store', 'place', 'potato', 'basket', 6),
  A(441, 'store', 'place', 'mango', 'basket', 6),
  A(442, 'store', 'place', 'potato', 'crate', 6),
  A(443, 'store', 'place', 'mango', 'crate', 6),
  A(444, 'store', 'arrange', 'potato', 'shelf', 6),
  A(445, 'store', 'arrange', 'mango', 'shelf', 6),
  A(446, 'store', 'clean', 'crate', 'shelf', 3),
  A(447, 'store', 'repair', 'crate', 'crate', 1),
  A(448, 'store', 'place', 'crate', 'shelf', 4),
  A(449, 'store', 'clean', 'crate', null, 3),
  A(450, 'store', 'repair', 'basket', 'basket', 1),
  A(451, 'store', 'place', 'basket', 'basket', 1),
  A(452, 'store', 'place', 'basket', 'shelf', 4),
  A(453, 'store', 'arrange', 'basket', 'shelf', 4),
  A(454, 'store', 'arrange', 'basket', 'shelf', 4),
  A(455, 'store', 'tend', 'potato', 'crate', 8),
  A(456, 'store', 'tend', 'mango', 'crate', 6),
  A(457, 'house', 'place', 'potato', 'table', 6),
  A(458, 'house', 'place', 'mango', 'table', 6),
  A(459, 'store', 'place', 'seed', 'crate', 6),
  A(460, 'store', 'arrange', 'crate', 'shelf', 4),
  A(461, 'weather', 'protect', 'tomato', 'tarp', 6),
  A(462, 'weather', 'protect', 'cabbage', 'sun', 6),
  A(463, 'weather', 'protect', 'tomato', 'cover', 6),
  A(464, 'weather', 'clean', 'bucket', 'tomato', 6),
  A(465, 'weather', 'clean', 'mud', 'path', 6),
  A(466, 'weather', 'repair', 'seedling', 'tomato', 6),
  A(467, 'weather', 'repair', 'fence_broke', 'fence', 4),
  A(468, 'weather', 'repair', 'roof', 'roof', 1),
  A(469, 'weather', 'repair', 'fence_broke', 'hay', 2),
  A(470, 'weather', 'protect', 'cow', 'tarp', 3),
  A(471, 'weather', 'place', 'cow', 'hay', 3),
  A(472, 'weather', 'place', 'gate', 'gate', 3),
  A(473, 'weather', 'tend', 'door', 'door', 1),
  A(474, 'weather', 'tend', 'roof', 'roof', 1),
  A(475, 'weather', 'tend', 'window', 'window', 1),
  A(476, 'weather', 'clean', 'rug', 'rug', 1),
  A(477, 'weather', 'clean', 'mud', 'rug', 4),
  A(478, 'weather', 'clean', 'branch', null, 3),
  A(479, 'weather', 'clean', 'path', null, 1),
  A(480, 'weather', 'repair', 'flower', 'flower', 6),
  A(481, 'weather', 'protect', 'tomato', 'tarp', 6),
  A(482, 'weather', 'arrange', 'shovel', 'crate', 3),
  A(483, 'weather', 'arrange', 'chair', 'table', 2),
  A(484, 'weather', 'protect', 'hay', 'tarp', 2),
  A(485, 'weather', 'feed', 'cow', 'cow', 3, 'hay'),
  A(486, 'weather', 'water', 'cow', 'cow', 3, 'bucket'),
  A(487, 'weather', 'tend', 'hay', 'cow', 2),
  A(488, 'weather', 'tend', 'gate', 'gate', 3),
  A(489, 'weather', 'tend', 'door', 'door', 1),
  A(490, 'weather', 'tend', 'window', 'window', 1),
  A(491, 'weather', 'feed', 'cow', 'chicken', 3, 'hay'),
  A(492, 'weather', 'water', 'chicken', 'sheep', 4, 'bucket'),
  A(493, 'weather', 'clean', 'hay', 'cow', 6),
  A(494, 'weather', 'tend', 'tomato', 'cabbage', 6),
  A(495, 'weather', 'water', 'flower', 'flower', 6, 'can'),
  A(496, 'weather', 'collect', 'tomato', null, 8),
  A(497, 'weather', 'collect', 'mango', null, 8),
  A(498, 'weather', 'clean', 'broom', null, 1),
  A(499, 'weather', 'arrange', 'lamp', 'bed', 2),
  A(500, 'weather', 'arrange', 'broom', 'sign', 1),
];

function blit(dst, src, x, y) {
  for (let sy = 0; sy < src.h; sy += 1) {
    for (let sx = 0; sx < src.w; sx += 1) {
      const i = (sy * src.w + sx) * 4;
      if (src.data[i + 3] < 8) continue;
      setPx(dst, x + sx, y + sy, src.data.subarray(i, i + 4));
    }
  }
}

function scaleNearest(src, factor) {
  const dst = canvas(src.w * factor, src.h * factor);
  for (let y = 0; y < dst.h; y += 1) {
    for (let x = 0; x < dst.w; x += 1) {
      const i = (Math.floor(y / factor) * src.w + Math.floor(x / factor)) * 4;
      dst.data.set(src.data.subarray(i, i + 4), (y * dst.w + x) * 4);
    }
  }
  return dst;
}

function glyph(img, ch, x, y, color) {
  const G = {
    0: '111101101101111',
    1: '010110010010111',
    2: '111001111100111',
    3: '111001111001111',
    4: '101101111001001',
    5: '111100111001111',
    6: '111100111101111',
    7: '111001010010010',
    8: '111101111101111',
    9: '111101111001111',
  };
  const bits = G[ch];
  if (!bits) return;
  for (let i = 0; i < 15; i += 1) {
    if (bits[i] === '1') setPx(img, x + (i % 3), y + Math.floor(i / 3), color);
  }
}

function labelNum(img, n, x, y, color) {
  const s = String(n).padStart(3, '0');
  for (let i = 0; i < s.length; i += 1) glyph(img, s[i], x + i * 4, y, color);
}

function makeTile(draw) {
  const img = canvas(SIZE, SIZE);
  draw(img);
  outline(img);
  return img;
}

function main() {
  if (ACTIVITIES.length !== 500) {
    throw new Error(`Expected 500 activities, got ${ACTIVITIES.length}`);
  }
  const nums = ACTIVITIES.map((a) => a.n).sort((a, b) => a - b);
  for (let i = 0; i < 500; i += 1) {
    if (nums[i] !== i + 1) throw new Error(`Missing activity ${i + 1}`);
  }

  fs.mkdirSync(tileDir, { recursive: true });
  const drawn = TILES.map(([id, draw]) => {
    const img = makeTile(draw);
    writePNG(path.join(tileDir, `fs_${id}.png`), SIZE, SIZE, img.data);
    return { id, img };
  });

  const cols = 12;
  const scale = 4;
  const cell = SIZE * scale + 12;
  const rows = Math.ceil(drawn.length / cols);
  const sheet = canvas(cols * cell, rows * cell, [36, 78, 118, 255]);
  drawn.forEach((tile, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const big = scaleNearest(tile.img, scale);
    const x = c * cell + 6;
    const y = r * cell + 4;
    blit(sheet, big, x, y);
    const idx = i + 1;
    labelNum(sheet, idx, x, y + SIZE * scale + 2, P.yellow);
  });
  writePNG(path.join(outDir, 'preview.png'), sheet.w, sheet.h, sheet.data);

  const packedCols = 12;
  const packedRows = Math.ceil(drawn.length / packedCols);
  const packed = canvas(packedCols * SIZE, packedRows * SIZE);
  drawn.forEach((tile, i) => {
    blit(packed, tile.img, (i % packedCols) * SIZE, Math.floor(i / packedCols) * SIZE);
  });
  writePNG(path.join(outDir, 'tilemap_packed.png'), packed.w, packed.h, packed.data);

  const byId = Object.fromEntries(drawn.map((t) => [t.id, t.img]));
  const catCols = 20;
  const catScale = 3;
  const catCellW = SIZE * catScale + 8;
  const catCellH = SIZE * catScale + 10;
  const catRows = Math.ceil(500 / catCols);
  const catalog = canvas(catCols * catCellW, catRows * catCellH, [24, 48, 72, 255]);
  ACTIVITIES.forEach((act) => {
    const i = act.n - 1;
    const id = act.sprite.replace(/^fs_/, '');
    const img = byId[id];
    if (!img) throw new Error(`Missing tile ${id} for activity ${act.n}`);
    const big = scaleNearest(img, catScale);
    const x = (i % catCols) * catCellW + 4;
    const y = Math.floor(i / catCols) * catCellH + 2;
    blit(catalog, big, x, y);
    labelNum(catalog, act.n, x, y + SIZE * catScale + 1, P.yellow);
  });
  writePNG(path.join(outDir, 'activities.png'), catalog.w, catalog.h, catalog.data);

  const groups = [
    ['A-crops', 1, 100],
    ['B-cows', 101, 180],
    ['C-birds', 181, 230],
    ['D-herd', 231, 280],
    ['E-house', 281, 350],
    ['F-yard', 351, 420],
    ['G-harvest', 421, 460],
    ['H-weather', 461, 500],
  ];
  for (const [name, lo, hi] of groups) {
    const list = ACTIVITIES.filter((a) => a.n >= lo && a.n <= hi);
    const gCols = 10;
    const gRows = Math.ceil(list.length / gCols);
    const g = canvas(gCols * catCellW, gRows * catCellH, [24, 48, 72, 255]);
    list.forEach((act, i) => {
      const id = act.sprite.replace(/^fs_/, '');
      const big = scaleNearest(byId[id], catScale);
      const x = (i % gCols) * catCellW + 4;
      const y = Math.floor(i / gCols) * catCellH + 2;
      blit(g, big, x, y);
      labelNum(g, act.n, x, y + SIZE * catScale + 1, P.yellow);
    });
    writePNG(path.join(outDir, `${name}.png`), g.w, g.h, g.data);
  }

  const loadItems = drawn.map(
    (t) => `  { textureKey: 'fs_${t.id}', image: '/assets/farm-sheet/Tiles/fs_${t.id}.png' },`,
  );
  const rowsJs = ACTIVITIES.map((a) => {
    const tool = a.tool ? `, '${a.tool}'` : '';
    const after = a.after == null ? 'null' : `'${a.after}'`;
    return `  [${a.n}, '${a.region}', '${a.action}', '${a.sprite}', ${after}, ${a.cluster}${tool}],`;
  });
  const animals = drawn.filter((t) => ANIMALS.has(t.id)).map((t) => `'fs_${t.id}'`);
  const js = `/** Auto-generated by scripts/generate-farm-sheet.mjs — 16×16 farm tiles. */
export const FARM_SHEET_ANIMALS = new Set([
  ${animals.join(',\n  ')},
]);

export const FARM_SHEET_LOAD_ITEMS = [
${loadItems.join('\n')}
];

/** [n, region, action, sprite, after, cluster, tool?] */
export const FARM_ACTIVITIES = [
${rowsJs.join('\n')}
];
`;
  fs.writeFileSync(path.join(root, 'src', 'data', 'farmSheet.js'), js);
  console.log(`tiles ${drawn.length}, activities ${ACTIVITIES.length}`);
}

main();

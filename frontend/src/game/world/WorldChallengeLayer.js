/**
 * Each challenge sits in its own fenced paddock. Animals walk inside
 * the pen. No text in the world — one quiz still covers the whole group.
 */
import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants.js';
import {
  PADDOCK,
  getActiveWorldNodes,
  getWorldTask,
  isAnimalKey,
  isNodeFinished,
  rebuildActiveNodes,
} from '../../data/worldChallenges.js';

export default class WorldChallengeLayer {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, object>} */
    this.entries = new Map();
    /** @type {Map<string, object>} */
    this.pens = new Map();
    this.prompt = null;
    this.focusedId = null;
  }

  spawn() {
    this.clear();
    rebuildActiveNodes();
    const grouped = new Map();
    for (const node of getActiveWorldNodes()) {
      if (isNodeFinished(node)) continue;
      const list = grouped.get(node.taskId) || [];
      list.push(node);
      grouped.set(node.taskId, list);
    }
    for (const nodes of grouped.values()) {
      this.placePen(nodes);
      for (const node of nodes) this.placeItem(node);
    }
    this.prompt = this.scene.add
      .circle(0, 0, 3.5, 0xffe08a, 0.95)
      .setStrokeStyle(1, 0x7a4a10, 0.9)
      .setDepth(31)
      .setVisible(false);
  }

  clear() {
    for (const entry of this.entries.values()) {
      this.destroyEntry(entry);
    }
    this.entries.clear();
    for (const pen of this.pens.values()) {
      this.scene?.tweens?.killTweensOf(pen.ground);
      pen.ground?.destroy?.();
      pen.hit?.destroy?.();
      pen.gate?.destroy?.();
      for (const piece of pen.fences || []) piece.destroy?.();
    }
    this.pens.clear();
    this.prompt?.destroy?.();
    this.prompt = null;
    this.focusedId = null;
  }

  destroyEntry(entry) {
    const scene = this.scene;
    scene?.tweens?.killTweensOf(entry?.visual);
    scene?.tweens?.killTweensOf(entry?.tool);
    scene?.tweens?.killTweensOf(entry?.shadow);
    entry?.hit?.destroy?.();
    entry?.visual?.destroy?.();
    entry?.tool?.destroy?.();
    entry?.shadow?.destroy?.();
  }

  worldXY(node) {
    return {
      x: node.tileX * TILE_SIZE + TILE_SIZE / 2,
      y: node.tileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  firstExistingKey(keys) {
    const textures = this.scene?.textures;
    if (!textures) return null;
    for (const key of keys) {
      if (key && textures.exists(key)) return key;
    }
    return null;
  }

  addSprite(x, y, key, mapTileWidth, depth, asSprite = false) {
    const scene = this.scene;
    if (!key || !scene.textures.exists(key)) return null;
    const tex = scene.textures.get(key);
    try {
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } catch {
      /* older textures */
    }
    const frameCount = Math.max(0, (tex?.frameTotal || 1) - 1);
    const sprite =
      asSprite || frameCount > 1
        ? scene.add.sprite(x, y, key, 0)
        : scene.add.image(x, y, key, 0);
    const src = tex?.getSourceImage?.();
    const frame = sprite.frame;
    const sw = frame?.width || src?.width || 16;
    const sh = frame?.height || src?.height || 16;
    const target = Math.max(24, (mapTileWidth || 1.4) * TILE_SIZE);
    let scale;
    if (sw <= 16 && sh <= 16) {
      scale = Math.max(2, Math.round(target / Math.max(sw, sh)));
    } else if (sw <= 64 && sh <= 64) {
      scale = Math.max(1, Math.round(target / Math.max(sw, sh)));
    } else {
      scale = target / Math.max(sw, sh);
    }
    sprite.setScale(scale);
    sprite.setDepth(depth);
    sprite.setOrigin(0.5, 0.85);
    sprite.setData('baseScale', scale);
    sprite.setData('baseY', y);
    sprite.setData('frameCount', frameCount);
    return sprite;
  }

  drawPixelFence(g, x, y, w, h) {
    const post = 0x6b3f18;
    const postTop = 0x8a5a28;
    const rail = 0xd4b07a;
    const railDark = 0x9a7040;
    const gateGap = 28;
    const southMid = x + w / 2;

    g.fillStyle(railDark, 1);
    g.fillRect(x + 3, y + 5, w - 6, 3);
    g.fillRect(x + 3, y + 11, w - 6, 3);
    g.fillRect(x + 3, y + h - 14, w - 6, 3);
    g.fillRect(x + 3, y + h - 8, w - 6, 3);
    g.fillRect(x + 4, y + 6, 3, h - 14);
    g.fillRect(x + w - 7, y + 6, 3, h - 14);
    g.fillStyle(rail, 1);
    g.fillRect(x + 3, y + 4, w - 6, 2);
    g.fillRect(x + 3, y + 10, w - 6, 2);
    g.fillRect(x + 3, y + h - 15, (w - gateGap) / 2 - 3, 2);
    g.fillRect(southMid + gateGap / 2, y + h - 15, (w - gateGap) / 2 - 3, 2);
    g.fillRect(x + 3, y + h - 9, (w - gateGap) / 2 - 3, 2);
    g.fillRect(southMid + gateGap / 2, y + h - 9, (w - gateGap) / 2 - 3, 2);
    g.fillRect(x + 5, y + 6, 2, h - 16);
    g.fillRect(x + w - 7, y + 6, 2, h - 16);

    const posts = [];
    for (let px = x + 2; px <= x + w - 6; px += 16) posts.push([px, y]);
    for (let px = x + 2; px <= x + w - 6; px += 16) {
      if (Math.abs(px + 2 - southMid) < gateGap / 2) continue;
      posts.push([px, y + h - 10]);
    }
    for (let py = y + 14; py < y + h - 16; py += 16) {
      posts.push([x + 2, py]);
      posts.push([x + w - 6, py]);
    }
    for (const [px, py] of posts) {
      g.fillStyle(post, 1);
      g.fillRect(px, py, 5, 10);
      g.fillStyle(postTop, 1);
      g.fillRect(px, py, 5, 3);
    }
  }

  placePen(nodes) {
    const scene = this.scene;
    const node = nodes[0];
    const pad = node.paddock || {
      ox: node.tileX - 3,
      oy: node.tileY - 3,
      w: PADDOCK.w,
      h: PADDOCK.h,
    };
    const x = pad.ox * TILE_SIZE;
    const y = pad.oy * TILE_SIZE;
    const pw = pad.w * TILE_SIZE;
    const ph = pad.h * TILE_SIZE;
    const cx = x + pw / 2;
    const cy = y + ph / 2;

    const ground = scene.add.graphics().setDepth(1.32);
    ground.lineStyle(2, 0xe8c56a, 0.8);
    ground.strokeRect(x + 3.5, y + 3.5, pw - 7, ph - 7);
    const fences = this.placeKenneyFence(x, y, pw, ph);
    if (!fences.length) this.drawPixelFence(ground, x, y, pw, ph);

    const hit = scene.add
      .rectangle(cx, cy, pw - 10, ph - 10, 0xffffff, 0.001)
      .setDepth(8.6)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      scene.beginWorldChallenge?.(node.nodeId);
    });

    this.pens.set(node.taskId, {
      taskId: node.taskId,
      nodeId: node.nodeId,
      pad,
      x,
      y,
      pw,
      ph,
      cx,
      cy,
      ground,
      fences,
      gate: null,
      hit,
    });
  }

  placeKenneyFence(x, y, w, h) {
    const key = this.firstExistingKey(['kf_fence', 'kf_fence_farm']);
    if (!key) return [];
    const scene = this.scene;
    const pieces = [];
    const scale = 2;
    const step = 16 * scale;
    const stamp = (px, py) => {
      const img = scene.add.image(px, py, key).setDepth(1.45);
      img.setScale(scale);
      try {
        scene.textures.get(key)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
      } catch {
        /* skip */
      }
      pieces.push(img);
    };
    for (let px = x + step / 2; px < x + w - 4; px += step) {
      stamp(px, y + 10);
      stamp(px, y + h - 10);
    }
    for (let py = y + step; py < y + h - step / 2; py += step) {
      stamp(x + 10, py);
      stamp(x + w - 10, py);
    }
    return pieces;
  }

  placeItem(node) {
    const scene = this.scene;
    const { x, y } = this.worldXY(node);
    const moving = Boolean(node.moving) || isAnimalKey(node.assetKey);
    const liveKey = this.firstExistingKey(
      node.kind === 'plant'
        ? [node.assetKey, 'kf_soil', 'kf_sprout']
        : [node.assetKey, node.afterKey, 'kf_tomato_plant', 'kf_tomato'],
    );
    const visual = this.addSprite(
      x,
      y,
      liveKey,
      node.mapTileWidth || (moving ? 1.6 : 1.4),
      6.2,
      moving,
    );
    if (!visual) return;

    let shadow = null;
    if (moving) {
      shadow = scene.add
        .ellipse(x, y + 4, 12, 6, 0x000000, 0.28)
        .setDepth(5.8);
    }

    let tool = null;
    if (node.toolKey) {
      const toolKey = this.firstExistingKey([node.toolKey]);
      if (toolKey) {
        tool = this.addSprite(x + 10, y + 4, toolKey, 1.2, 6.5);
      }
    }

    if (!moving && node.kind === 'collect') {
      scene.tweens.add({
        targets: visual,
        y: y - 2,
        duration: 900 + Math.floor(Math.random() * 400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const pad = node.paddock;
    const bounds = pad
      ? {
          minX: pad.minX * TILE_SIZE + 10,
          maxX: (pad.maxX + 1) * TILE_SIZE - 10,
          minY: pad.minY * TILE_SIZE + 8,
          maxY: (pad.maxY + 1) * TILE_SIZE - 8,
        }
      : {
          minX: x - 18,
          maxX: x + 18,
          minY: y - 12,
          maxY: y + 12,
        };

    this.entries.set(node.nodeId, {
      def: node,
      visual,
      tool,
      shadow,
      moving,
      frozen: false,
      bounds,
      walkX: x,
      walkY: y,
      dest: { x, y },
      restUntil: scene.time.now + Math.random() * 400,
      speed: this.animalSpeed(node.assetKey),
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  animalSpeed(key) {
    if (!key) return 18;
    if (key.includes('chick') || key.includes('chicken') || key.includes('duck')) {
      return 28;
    }
    if (key.includes('cow') || key.includes('bull')) return 14;
    return 20;
  }

  update(playerX, playerY, time) {
    this.updateAnimals(time);
    this.updatePrompt(playerX, playerY);
  }

  updateAnimals(time) {
    const scene = this.scene;
    if (!scene) return;
    const dt = Math.min(0.05, scene.game.loop.delta / 1000);
    for (const entry of this.entries.values()) {
      if (!entry.moving || !entry.visual) continue;
      const spr = entry.visual;
      if (entry.frozen) {
        this.poseAnimal(entry, time, 0.6);
        continue;
      }
      if (time < entry.restUntil) {
        this.poseAnimal(entry, time, 1.0);
        continue;
      }
      const dx = entry.dest.x - entry.walkX;
      const dy = entry.dest.y - entry.walkY;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        entry.restUntil = time + 320 + Math.random() * 1100;
        entry.dest = {
          x: Phaser.Math.Between(entry.bounds.minX, entry.bounds.maxX),
          y: Phaser.Math.Between(entry.bounds.minY, entry.bounds.maxY),
        };
        this.poseAnimal(entry, time, 0.7);
        continue;
      }
      const step = entry.speed * dt;
      entry.walkX += (dx / dist) * step;
      entry.walkY += (dy / dist) * step;
      if (typeof spr.setFlipX === 'function') spr.setFlipX(dx < 0);
      const frames = spr.getData?.('frameCount') || 0;
      if (frames > 1 && spr.setFrame) {
        spr.setFrame(Math.floor(time / 140) % frames);
      }
      this.poseAnimal(entry, time, 2.0);
    }
  }

  poseAnimal(entry, time, amount) {
    const spr = entry.visual;
    if (!spr) return;
    spr.x = entry.walkX;
    spr.y = entry.walkY + Math.sin(time / 140 + entry.bobPhase) * amount;
    if (entry.shadow) {
      entry.shadow.x = entry.walkX;
      entry.shadow.y = entry.walkY + 3;
    }
  }

  playCluster(taskId, action, player) {
    for (const entry of this.entries.values()) {
      if (entry.def?.taskId === taskId) entry.frozen = true;
    }
    if (action === 'plant') {
      this.playPlant(taskId);
      return;
    }
    if (action === 'collect') {
      this.playHarvest(taskId, player);
      return;
    }
    if (action === 'feed') {
      this.playFeed(taskId);
      return;
    }
    this.playMorph(taskId, action);
  }

  playPlant(taskId) {
    const scene = this.scene;
    let index = 0;
    for (const entry of this.entries.values()) {
      if (entry.def?.taskId !== taskId) continue;
      const spr = entry.visual;
      const cropKey = this.firstExistingKey([
        entry.def.afterKey,
        'kf_tomato_plant',
      ]);
      if (!spr || !cropKey) continue;
      scene.tweens.killTweensOf(spr);
      const delay = Math.min(index * 55, 700);
      scene.time.delayedCall(delay, () => {
        if (!spr.active) return;
        if (spr.setTexture && scene.textures.exists(cropKey)) {
          spr.setTexture(cropKey, 0);
        }
        const base = spr.getData?.('baseScale') || spr.scale || 1;
        spr.setScale(base * 0.12);
        spr.setAlpha(1);
        scene.tweens.add({
          targets: spr,
          scale: base,
          y: spr.getData('baseY') || spr.y,
          duration: 320,
          ease: 'Back.easeOut',
        });
      });
      index += 1;
    }
  }

  playHarvest(taskId, player) {
    const scene = this.scene;
    let index = 0;
    for (const entry of this.entries.values()) {
      if (entry.def?.taskId !== taskId) continue;
      const spr = entry.visual;
      if (!spr || !player) continue;
      scene.tweens.killTweensOf(spr);
      scene.tweens.add({
        targets: spr,
        x: player.x,
        y: player.y - 10,
        alpha: 0,
        scale: Math.max(0.12, (spr.scale || 1) * 0.2),
        delay: Math.min(index * 40, 900),
        duration: 280,
        ease: 'Cubic.easeIn',
      });
      if (entry.shadow) {
        scene.tweens.add({ targets: entry.shadow, alpha: 0, duration: 180 });
      }
      if (entry.tool) {
        scene.tweens.add({ targets: entry.tool, alpha: 0, duration: 200 });
      }
      index += 1;
    }
  }

  playFeed(taskId) {
    const hayKey = this.firstExistingKey(['kf_hay', 'hm_hay']);
    for (const entry of this.entries.values()) {
      if (entry.def?.taskId !== taskId) continue;
      const spr = entry.visual;
      if (hayKey && spr) {
        const hay = this.addSprite(spr.x - 10, spr.y + 4, hayKey, 1.1, 7);
        this.scene.tweens.add({
          targets: hay,
          y: spr.y - 8,
          alpha: 0,
          duration: 700,
          onComplete: () => hay.destroy(),
        });
      }
      const afterKey = this.firstExistingKey([
        entry.def.afterKey,
        entry.def.assetKey,
      ]);
      if (afterKey && spr?.setTexture && this.scene.textures.exists(afterKey)) {
        spr.setTexture(afterKey, 0);
      }
    }
  }

  playMorph(taskId, action) {
    for (const entry of this.entries.values()) {
      if (entry.def?.taskId !== taskId) continue;
      const node = entry.def;
      const spr = entry.visual;
      const afterKey = this.firstExistingKey([node.afterKey]);
      if (action === 'clean' && !node.afterKey) {
        this.scene.tweens.add({
          targets: [spr, entry.tool, entry.shadow].filter(Boolean),
          alpha: 0,
          duration: 280,
        });
        continue;
      }
      if (afterKey && spr?.setTexture && this.scene.textures.exists(afterKey)) {
        spr.setTexture(afterKey, 0);
        const base = spr.getData?.('baseScale') || spr.scale || 1;
        spr.setScale(base * 0.2);
        this.scene.tweens.add({
          targets: spr,
          scale: base,
          duration: 280,
          ease: 'Back.easeOut',
        });
      } else if (spr) {
        const base = spr.getData?.('baseScale') || spr.scale || 1;
        this.scene.tweens.add({
          targets: spr,
          scale: base * 1.12,
          yoyo: true,
          duration: 180,
        });
      }
      if (entry.tool && (action === 'water' || action === 'feed')) {
        this.scene.tweens.add({
          targets: entry.tool,
          y: entry.tool.y - 8,
          angle: 18,
          yoyo: true,
          duration: 220,
        });
      }
    }
  }

  findNearest(playerX, playerY, maxDist = TILE_SIZE * 2.4) {
    let best = null;
    let bestD = maxDist;
    for (const pen of this.pens.values()) {
      const dx = Math.max(pen.x - playerX, 0, playerX - (pen.x + pen.pw));
      const dy = Math.max(pen.y - playerY, 0, playerY - (pen.y + pen.ph));
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = pen.nodeId;
      }
    }
    return best;
  }

  updatePrompt(playerX, playerY) {
    const id = this.findNearest(playerX, playerY);
    if (this.focusedId && this.focusedId !== id) {
      const prevPen = this.penForNode(this.focusedId);
      if (prevPen?.ground) prevPen.ground.setAlpha(1);
    }
    this.focusedId = id;
    if (!id || !this.prompt) {
      this.prompt?.setVisible(false);
      return;
    }
    const pen = this.penForNode(id);
    if (pen?.ground) {
      pen.ground.setAlpha(1);
      this.prompt.setPosition(pen.cx, pen.y + 6);
    } else {
      this.prompt.setPosition(playerX, playerY - 18);
    }
    this.prompt.setVisible(true);
  }

  penForNode(nodeId) {
    const entry = this.entries.get(nodeId);
    if (entry?.def?.taskId && this.pens.has(entry.def.taskId)) {
      return this.pens.get(entry.def.taskId);
    }
    for (const pen of this.pens.values()) {
      if (pen.nodeId === nodeId) return pen;
    }
    return null;
  }

  getAction(nodeId) {
    const entry = this.entries.get(nodeId);
    const task = getWorldTask(entry?.def?.taskId);
    return task?.action || entry?.def?.kind || 'tend';
  }
}

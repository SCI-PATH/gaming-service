/**
 * One fenced paddock: animals wander, tend quiz drops produce, student collects.
 */
import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants.js';
import { ANIMAL_PADDOCK } from '../../data/animalChallenges.js';

export default class AnimalPaddockLayer {
  constructor(scene) {
    this.scene = scene;
    this.animals = [];
    this.produce = [];
    this.fences = [];
    this.ground = null;
    this.hit = null;
    this.label = null;
    this.tended = false;
    this.challenge = null;
    this.pad = ANIMAL_PADDOCK;
  }

  firstKey(keys) {
    const textures = this.scene?.textures;
    if (!textures) return null;
    for (const key of keys) {
      if (key && textures.exists(key)) return key;
    }
    return null;
  }

  spawn(challenge) {
    this.clear();
    this.challenge = challenge;
    this.tended = false;
    const scene = this.scene;
    const pad = this.pad;
    const x = pad.x * TILE_SIZE;
    const y = pad.y * TILE_SIZE;
    const pw = pad.w * TILE_SIZE;
    const ph = pad.h * TILE_SIZE;
    const cx = x + pw / 2;
    const cy = y + ph / 2;

    this.ground = scene.add.graphics().setDepth(1.3);
    this.ground.fillStyle(0x4a7a32, 0.55);
    this.ground.fillRoundedRect(x, y, pw, ph, 4);
    this.ground.fillStyle(0x3d6a28, 0.28);
    this.ground.fillRoundedRect(x + 6, y + 6, pw - 12, ph - 12, 3);
    this.ground.lineStyle(3, 0xe8c56a, 0.95);
    this.ground.strokeRoundedRect(x + 0.5, y + 0.5, pw - 1, ph - 1, 3);

    this.fences = this.placeFence(x, y, pw, ph);

    const title = String(challenge?.animalName || 'animals').toUpperCase();
    this.label = scene.add
      .text(cx, y - 6, title, {
        fontFamily: 'Courier New, monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffe08a',
        stroke: '#1a1208',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(1.6);

    this.hit = scene.add
      .rectangle(cx, cy, pw - 8, ph - 8, 0xffffff, 0.001)
      .setDepth(8.5)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      scene.beginAnimalTend?.();
    });

    const herd = Math.max(5, Number(challenge?.herdSize) || 7);
    const inner = {
      minX: x + 18,
      maxX: x + pw - 18,
      minY: y + 18,
      maxY: y + ph - 18,
    };
    const animalKey = this.firstKey(challenge?.animalKeys || ['kf_cow']);
    for (let i = 0; i < herd; i += 1) {
      this.spawnAnimal(animalKey, inner, i);
    }
  }

  placeFence(x, y, w, h) {
    const key = this.firstKey(['kf_fence', 'kf_fence_farm']);
    if (!key) return [];
    const scene = this.scene;
    const pieces = [];
    const scale = 2;
    const step = 16 * scale;
    const stamp = (px, py) => {
      const img = scene.add.image(px, py, key).setDepth(1.45);
      img.setScale(scale);
      scene.textures.get(key)?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
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

  spriteScale(key, targetPx) {
    const tex = this.scene.textures.get(key);
    const src = tex?.getSourceImage?.();
    const w = Math.max(src?.width || 16, 1);
    return targetPx / w;
  }

  spawnAnimal(key, bounds, index) {
    if (!key) return;
    const scene = this.scene;
    const startX = Phaser.Math.Between(bounds.minX, bounds.maxX);
    const startY = Phaser.Math.Between(bounds.minY, bounds.maxY);
    const spr = scene.add.image(startX, startY, key).setDepth(19);
    scene.textures.get(key)?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
    const scale = this.spriteScale(key, TILE_SIZE * 1.85);
    spr.setScale(scale);
    spr.setOrigin(0.5, 0.85);
    const entry = {
      visual: spr,
      walkX: startX,
      walkY: startY,
      bounds,
      speed: 16 + (index % 5) * 3,
      bobPhase: Math.random() * Math.PI * 2,
      restUntil: 0,
      dest: {
        x: Phaser.Math.Between(bounds.minX, bounds.maxX),
        y: Phaser.Math.Between(bounds.minY, bounds.maxY),
      },
    };
    this.animals.push(entry);
  }

  tend() {
    if (this.tended) return false;
    this.tended = true;
    const scene = this.scene;
    const hayKey = this.firstKey(['kf_hay', 'kf_feed', 'kf_trough_hay']);
    for (const entry of this.animals) {
      const spr = entry.visual;
      if (!spr?.active) continue;
      scene.tweens.add({
        targets: spr,
        scaleX: spr.scaleX * 1.18,
        scaleY: spr.scaleY * 1.18,
        yoyo: true,
        duration: 180,
      });
      if (hayKey) {
        const hay = scene.add
          .image(entry.walkX + 6, entry.walkY + 4, hayKey)
          .setDepth(18)
          .setScale(this.spriteScale(hayKey, TILE_SIZE * 0.9));
        this.produce.push({ kind: 'hay', visual: hay, collectable: false });
      }
    }
    this.spawnProduce();
    return true;
  }

  spawnProduce() {
    const scene = this.scene;
    const key = this.firstKey([
      this.challenge?.produceKey,
      'kf_milk',
      'kf_egg',
      'kf_sack',
    ]);
    if (!key) return;
    const n = Math.max(6, this.animals.length);
    const pad = this.pad;
    const x = pad.x * TILE_SIZE;
    const y = pad.y * TILE_SIZE;
    const pw = pad.w * TILE_SIZE;
    const ph = pad.h * TILE_SIZE;
    for (let i = 0; i < n; i += 1) {
      const px = Phaser.Math.Between(x + 22, x + pw - 22);
      const py = Phaser.Math.Between(y + 22, y + ph - 22);
      const img = scene.add.image(px, py, key).setDepth(18);
      scene.textures.get(key)?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
      img.setScale(this.spriteScale(key, TILE_SIZE * 1.15));
      img.setAlpha(0);
      scene.tweens.add({
        targets: img,
        alpha: 1,
        y: py - 4,
        yoyo: true,
        duration: 220,
        delay: i * 40,
        onYoyo: () => {
          if (img.active) img.y = py;
        },
      });
      this.produce.push({ kind: 'produce', visual: img, collectable: true, x: px, y: py });
    }
  }

  collectNear(playerX, playerY, reach) {
    const hit = [];
    for (const item of this.produce) {
      if (!item.collectable || !item.visual?.active) continue;
      const d = Phaser.Math.Distance.Between(
        item.visual.x,
        item.visual.y,
        playerX,
        playerY,
      );
      if (d <= reach) hit.push(item);
    }
    for (const item of hit) {
      const spr = item.visual;
      item.collectable = false;
      this.scene.tweens.add({
        targets: spr,
        alpha: 0,
        y: spr.y - 12,
        scaleX: spr.scaleX * 1.3,
        scaleY: spr.scaleY * 1.3,
        duration: 160,
        onComplete: () => spr.destroy?.(),
      });
    }
    this.produce = this.produce.filter(
      (p) => p.kind === 'hay' || (p.visual?.active && p.collectable),
    );
    return hit.length;
  }

  remainingProduce() {
    return this.produce.filter((p) => p.collectable && p.visual?.active).length;
  }

  isNear(worldX, worldY, extra = 12) {
    const pad = this.pad;
    const x = pad.x * TILE_SIZE - extra;
    const y = pad.y * TILE_SIZE - extra;
    const w = pad.w * TILE_SIZE + extra * 2;
    const h = pad.h * TILE_SIZE + extra * 2;
    return worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h;
  }

  update(time) {
    const scene = this.scene;
    if (!scene) return;
    const dt = Math.min(0.05, scene.game.loop.delta / 1000);
    for (const entry of this.animals) {
      const spr = entry.visual;
      if (!spr?.active) continue;
      if (time < entry.restUntil) {
        spr.y = entry.walkY + Math.sin(time / 160 + entry.bobPhase) * 0.8;
        continue;
      }
      const dx = entry.dest.x - entry.walkX;
      const dy = entry.dest.y - entry.walkY;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        entry.restUntil = time + 280 + Math.random() * 900;
        entry.dest = {
          x: Phaser.Math.Between(entry.bounds.minX, entry.bounds.maxX),
          y: Phaser.Math.Between(entry.bounds.minY, entry.bounds.maxY),
        };
        continue;
      }
      const step = entry.speed * dt;
      entry.walkX += (dx / dist) * step;
      entry.walkY += (dy / dist) * step;
      spr.setFlipX?.(dx < 0);
      spr.x = entry.walkX;
      spr.y = entry.walkY + Math.sin(time / 140 + entry.bobPhase) * 1.6;
    }
  }

  clear() {
    const scene = this.scene;
    for (const entry of this.animals) {
      scene?.tweens?.killTweensOf(entry.visual);
      entry.visual?.destroy?.();
    }
    this.animals = [];
    for (const item of this.produce) {
      scene?.tweens?.killTweensOf(item.visual);
      item.visual?.destroy?.();
    }
    this.produce = [];
    for (const piece of this.fences) piece.destroy?.();
    this.fences = [];
    this.ground?.destroy?.();
    this.ground = null;
    this.hit?.destroy?.();
    this.hit = null;
    this.label?.destroy?.();
    this.label = null;
    this.tended = false;
    this.challenge = null;
  }
}

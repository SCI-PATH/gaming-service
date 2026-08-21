/**
 * One yard of mess: start quiz unlocks sweeping, student runs over clutter.
 */
import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants.js';
import { CLEANING_YARD } from '../../data/cleaningChallenges.js';

export default class CleaningYardLayer {
  constructor(scene) {
    this.scene = scene;
    this.mess = [];
    this.ground = null;
    this.hit = null;
    this.label = null;
    this.started = false;
    this.challenge = null;
    this.yard = CLEANING_YARD;
  }

  firstKey(keys) {
    const textures = this.scene?.textures;
    if (!textures) return null;
    for (const key of keys) {
      if (key && textures.exists(key)) return key;
    }
    return null;
  }

  spriteScale(key, targetPx) {
    const tex = this.scene.textures.get(key);
    const src = tex?.getSourceImage?.();
    const w = Math.max(src?.width || 16, 1);
    return targetPx / w;
  }

  spawn(challenge) {
    this.clear();
    this.challenge = challenge;
    this.started = false;
    const scene = this.scene;
    const yard = this.yard;
    const x = yard.x * TILE_SIZE;
    const y = yard.y * TILE_SIZE;
    const pw = yard.w * TILE_SIZE;
    const ph = yard.h * TILE_SIZE;
    const cx = x + pw / 2;

    this.ground = scene.add.graphics().setDepth(1.28);
    this.ground.fillStyle(0x4a3218, 0.82);
    this.ground.fillRoundedRect(x, y, pw, ph, 4);
    this.ground.fillStyle(0x6b4a24, 0.35);
    this.ground.fillRoundedRect(x + 5, y + 5, pw - 10, ph - 10, 3);
    this.ground.lineStyle(3, 0xc9a227, 0.95);
    this.ground.strokeRoundedRect(x + 0.5, y + 0.5, pw - 1, ph - 1, 3);

    const title = String(challenge?.messName || 'cleaning').toUpperCase();
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
      .rectangle(cx, y + ph / 2, pw - 8, ph - 8, 0xffffff, 0.001)
      .setDepth(8.4)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      scene.beginCleaningStart?.();
    });

    this.scatterMess(challenge, x, y, pw, ph);
  }

  scatterMess(challenge, x, y, pw, ph) {
    const scene = this.scene;
    const keys = (challenge?.messKeys || ['kf_weed']).filter(
      (key) => key && scene.textures.exists(key),
    );
    const fallback = this.firstKey(['kf_weed', 'kf_rock', 'kf_hay']);
    if (!keys.length && !fallback) return;
    const palette = keys.length ? keys : [fallback];
    const cols = Math.max(4, Math.floor(pw / TILE_SIZE) - 1);
    const rows = Math.max(3, Math.floor(ph / TILE_SIZE) - 1);
    let n = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if ((col + row * 2) % 5 === 0) continue;
        const key = palette[n % palette.length];
        const px = x + 18 + col * ((pw - 36) / Math.max(1, cols - 1));
        const py = y + 18 + row * ((ph - 36) / Math.max(1, rows - 1));
        const img = scene.add.image(px, py, key).setDepth(18);
        scene.textures.get(key)?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
        img.setScale(this.spriteScale(key, TILE_SIZE * 1.2));
        img.setTint(0xb08060);
        img.setAlpha(0.92);
        this.mess.push({
          visual: img,
          collectable: false,
          bob: Math.random() * Math.PI * 2,
          baseY: py,
        });
        n += 1;
      }
    }
    if (n < 6) {
      for (let i = n; i < 8; i += 1) {
        const key = palette[i % palette.length];
        const px = x + 24 + (i % 4) * 28;
        const py = y + 24 + Math.floor(i / 4) * 28;
        const img = scene.add.image(px, py, key).setDepth(18);
        img.setScale(this.spriteScale(key, TILE_SIZE * 1.2));
        img.setTint(0xb08060);
        this.mess.push({
          visual: img,
          collectable: false,
          bob: 0,
          baseY: py,
        });
      }
    }
  }

  start() {
    if (this.started) return false;
    this.started = true;
    for (const item of this.mess) {
      item.collectable = true;
      const spr = item.visual;
      if (!spr?.active) continue;
      spr.clearTint();
      this.scene.tweens.add({
        targets: spr,
        scaleX: spr.scaleX * 1.16,
        scaleY: spr.scaleY * 1.16,
        yoyo: true,
        duration: 160,
      });
    }
    if (this.label) this.label.setColor('#8fd45a');
    return true;
  }

  sweepNear(playerX, playerY, reach) {
    const hit = [];
    for (const item of this.mess) {
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
      item.collectable = false;
      const spr = item.visual;
      this.scene.tweens.add({
        targets: spr,
        alpha: 0,
        y: spr.y - 10,
        scaleX: spr.scaleX * 1.25,
        duration: 150,
        onComplete: () => spr.destroy?.(),
      });
    }
    this.mess = this.mess.filter((m) => m.visual?.active && m.collectable);
    return hit.length;
  }

  remainingMess() {
    return this.mess.filter((m) => m.collectable && m.visual?.active).length;
  }

  isNear(worldX, worldY, extra = 12) {
    const yard = this.yard;
    const x = yard.x * TILE_SIZE - extra;
    const y = yard.y * TILE_SIZE - extra;
    const w = yard.w * TILE_SIZE + extra * 2;
    const h = yard.h * TILE_SIZE + extra * 2;
    return worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h;
  }

  update(time) {
    if (!this.started) return;
    for (const item of this.mess) {
      const spr = item.visual;
      if (!spr?.active) continue;
      spr.y = item.baseY + Math.sin(time / 180 + item.bob) * 1.2;
    }
  }

  clear() {
    const scene = this.scene;
    for (const item of this.mess) {
      scene?.tweens?.killTweensOf(item.visual);
      item.visual?.destroy?.();
    }
    this.mess = [];
    this.ground?.destroy?.();
    this.ground = null;
    this.hit?.destroy?.();
    this.hit = null;
    this.label?.destroy?.();
    this.label = null;
    this.started = false;
    this.challenge = null;
  }
}

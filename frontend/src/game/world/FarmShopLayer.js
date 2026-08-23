/**
 * Physical Farm Shop — stall + queue customers with challenge-item bubbles.
 */
import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants.js';
import {
  FARM_SHOP_ZONE,
  farmShopQueueSlots,
  farmShopZoneCenter,
  isFarmShopTile,
} from '../../data/plantPlots.js';
import {
  CUSTOMER_STATUS,
  orderLineProgress,
  patienceMood,
} from '../../data/farmCustomerShop.js';
import { getBubbleItemVisual } from '../../data/farmShopCatalog.js';
import {
  pickCustomerSprite,
  startCustomerQueueWalk,
  stopCustomerQueueWalk,
} from './farmShopCustomerMotion.js';

const CUSTOMER_DEPTH = 12;

function drawSpeechBubble(graphics, width, height, fill = 0xffffff) {
  const w = width;
  const h = height;
  const r = 6;
  const left = -w / 2;
  const top = -h / 2;

  graphics.clear();
  // Soft drop shadow
  graphics.fillStyle(0x000000, 0.18);
  graphics.fillRoundedRect(left + 1.5, top + 2, w, h, r);

  graphics.fillStyle(fill, 0.98);
  graphics.lineStyle(1.5, 0x2a2010, 0.95);
  graphics.fillRoundedRect(left, top, w, h, r);
  graphics.strokeRoundedRect(left, top, w, h, r);

  const tailW = 7;
  const tailH = 6;
  graphics.fillStyle(fill, 0.98);
  graphics.fillTriangle(
    -tailW / 2,
    top + h - 0.5,
    tailW / 2,
    top + h - 0.5,
    0,
    top + h + tailH,
  );
  graphics.lineStyle(1.5, 0x2a2010, 0.95);
  graphics.lineBetween(-tailW / 2, top + h, 0, top + h + tailH);
  graphics.lineBetween(tailW / 2, top + h, 0, top + h + tailH);
}

export default class FarmShopLayer {
  constructor(scene) {
    this.scene = scene;
    this.zone = FARM_SHOP_ZONE;
    this.root = null;
    this.building = null;
    this.label = null;
    this.hint = null;
    this.hit = null;
    this.customers = new Map();
    this.slots = farmShopQueueSlots(4, TILE_SIZE);
  }

  spawn() {
    this.clear();
    this.slots = farmShopQueueSlots(4, TILE_SIZE);
    const scene = this.scene;
    const z = this.zone;
    const px = z.x * TILE_SIZE;
    const py = z.y * TILE_SIZE;
    const pw = z.w * TILE_SIZE;
    const ph = z.h * TILE_SIZE;
    const center = farmShopZoneCenter(TILE_SIZE);

    this.root = scene.add.container(0, 0).setDepth(4);

    this.building = this.createShopBuilding(scene, center, pw, ph);
    this.root.add(this.building);

    this.label = scene.add
      .text(center.x, py - 14, 'FARM SHOP', {
        fontFamily: 'Courier New, monospace',
        fontSize: '9px',
        fontStyle: 'bold',
        color: '#fff4c8',
        stroke: '#2a1808',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.root.add(this.label);

    // Hint sits on the stall, not over the queue
    this.hint = scene.add
      .text(center.x, center.y + ph * 0.15, 'E unload', {
        fontFamily: 'Courier New, monospace',
        fontSize: '7px',
        color: '#ffe08a',
        stroke: '#1a1008',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(6)
      .setAlpha(0.9);
    this.root.add(this.hint);

    this.hit = scene.add
      .rectangle(center.x, center.y, pw + 16, ph + 24, 0xffffff, 0.001)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p, _lx, _ly, event) => {
      event?.stopPropagation?.();
      if ((scene.carriedCount || 0) > 0) {
        scene.handleLoadingAttempt?.({ skipGuard: true });
      } else {
        scene.openFarmShopUnload?.();
      }
    });
  }

  createShopBuilding(scene, center, pw, _ph) {
    const shop = scene.add.container(center.x, center.y + 8);

    if (scene.textures.exists('fshop_stall')) {
      const stall = scene.add.image(0, 12, 'fshop_stall');
      stall.setScale((pw + 32) / 347);
      stall.setOrigin(0.5, 1);
      shop.add(stall);
      return shop;
    }

    if (scene.textures.exists('fshop_counter')) {
      const counter = scene.add.image(0, 10, 'fshop_counter');
      counter.setScale((pw + 12) / 261);
      counter.setOrigin(0.5, 1);
      shop.add(counter);
    }

    return shop;
  }

  isShopTile(gridX, gridY) {
    return isFarmShopTile(gridX, gridY);
  }

  isNear(worldX, worldY, padTiles = 1.25) {
    const z = this.zone;
    const minX = (z.x - padTiles) * TILE_SIZE;
    const maxX = (z.x + z.w + padTiles * 2) * TILE_SIZE;
    const minY = (z.y - padTiles) * TILE_SIZE;
    const maxY = (z.y + z.h + padTiles * 6) * TILE_SIZE;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  sync(shop) {
    if (!this.root) this.spawn();
    const living = (shop?.customers || []).filter(
      (c) =>
        c.status !== CUSTOMER_STATUS.SERVED &&
        c.status !== CUSTOMER_STATUS.LEFT,
    );
    const seen = new Set();

    living.forEach((customer, index) => {
      seen.add(customer.id);
      const slot = this.slots[index] || this.slots[this.slots.length - 1];
      let entry = this.customers.get(customer.id);
      if (!entry) {
        entry = this.createCustomerVisual(customer, slot, index);
        this.customers.set(customer.id, entry);
      }
      this.updateCustomerVisual(entry, customer, slot, {
        isFront: index === 0,
        queueIndex: index,
      });
    });

    for (const [id, entry] of this.customers) {
      if (seen.has(id)) continue;
      this.destroyCustomerVisual(entry);
      this.customers.delete(id);
    }
  }

  createCustomerVisual(customer, slot, queueIndex) {
    const scene = this.scene;
    const depth = CUSTOMER_DEPTH + queueIndex * 0.01;
    const body = scene.add.container(slot.x, slot.y).setDepth(depth);

    const shadow = scene.add.ellipse(0, 2, 18, 5, 0x000000, 0.22);

    const spec = pickCustomerSprite(customer.id);
    let avatar;
    if (scene.textures.exists(spec.textureKey)) {
      avatar = scene.add.sprite(0, 0, spec.textureKey, spec.frame);
    } else {
      avatar = scene.add.rectangle(0, -10, 10, 18, 0xff8866, 1);
    }
    avatar.setOrigin(0.5, 1);
    avatar.setScale(spec.scale);
    if (avatar.setFlipX) avatar.setFlipX(spec.flipX);

    const bubble = scene.add.container(0, -36);
    const bubbleBg = scene.add.graphics();
    const orderRow = scene.add.container(0, 0);
    bubble.add([bubbleBg, orderRow]);

    const patienceBg = scene.add
      .rectangle(0, 3, 16, 3, 0x1a1208, 0.35)
      .setOrigin(0.5, 0);
    const patienceFill = scene.add
      .rectangle(-8, 3, 16, 2, 0x6ecf6e, 1)
      .setOrigin(0, 0);

    body.add([shadow, avatar, patienceBg, patienceFill, bubble]);
    body.setDepth(depth);

    const walkTween = startCustomerQueueWalk(scene, avatar, queueIndex);

    return {
      id: customer.id,
      body,
      avatar,
      bubble,
      bubbleBg,
      orderRow,
      patienceFill,
      walkTween,
      orderSignature: '',
    };
  }

  rebuildOrderRow(entry, lines) {
    const scene = this.scene;
    entry.orderRow.removeAll(true);

    const iconSize = 12;
    const gap = 4;
    const chips = [];

    for (const line of lines.slice(0, 3)) {
      const visual = getBubbleItemVisual(line.itemId);
      const chip = scene.add.container(0, 0);

      // Prefer clear challenge emoji; only use safe produce sprites
      if (visual.textureKey && scene.textures.exists(visual.textureKey)) {
        const icon = scene.add.image(0, 0, visual.textureKey);
        const scale = iconSize / Math.max(icon.width, icon.height, 1);
        icon.setScale(scale);
        if (line.done) icon.setAlpha(0.4);
        chip.add(icon);
      } else {
        const emoji = scene.add
          .text(0, 0, visual.icon, {
            fontSize: '13px',
          })
          .setOrigin(0.5);
        if (line.done) emoji.setAlpha(0.4);
        chip.add(emoji);
      }

      const qtyLabel = line.done
        ? '✓'
        : `×${Math.max(1, line.remaining || line.qty || 1)}`;
      chip.add(
        scene.add
          .text(iconSize * 0.55, 0.5, qtyLabel, {
            fontFamily: 'Segoe UI, Arial, sans-serif',
            fontSize: '9px',
            fontStyle: 'bold',
            color: line.done ? '#2f7a35' : '#1a1810',
            stroke: '#ffffff',
            strokeThickness: 2,
          })
          .setOrigin(0, 0.5),
      );
      chips.push(chip);
    }

    if (!chips.length) {
      entry.orderRow.add(
        scene.add
          .text(0, 0, '…', { fontSize: '10px', color: '#4a4030' })
          .setOrigin(0.5),
      );
      return { width: 22, height: 16 };
    }

    let x = 0;
    for (const chip of chips) {
      chip.setPosition(x, 0);
      entry.orderRow.add(chip);
      x += iconSize + 14 + gap;
    }

    const totalW = Math.max(28, x - gap);
    entry.orderRow.setPosition(-totalW / 2 + 7, 1);
    return { width: totalW, height: 20 };
  }

  updateCustomerVisual(entry, customer, slot, { isFront, queueIndex }) {
    const scene = this.scene;
    const mood = patienceMood(customer);
    const lines = orderLineProgress(customer);
    const signature = lines
      .map((l) => `${l.itemId}:${l.delivered}/${l.qty}`)
      .join('|');

    if (signature !== entry.orderSignature) {
      const dims = this.rebuildOrderRow(entry, lines);
      entry.orderSignature = signature;
      entry._bubbleDims = dims;
    }

    const dims = entry._bubbleDims || { width: 40, height: 20 };
    const bubbleW = Phaser.Math.Clamp(dims.width + 14, 36, 72);
    const bubbleH = Math.max(22, dims.height + 8);
    drawSpeechBubble(
      entry.bubbleBg,
      bubbleW,
      bubbleH,
      isFront ? 0xfff6d8 : 0xffffff,
    );

    const headY = entry.avatar.displayHeight
      ? -(entry.avatar.displayHeight + 8)
      : -40;
    entry.bubble.setY(headY);

    if (customer.status === CUSTOMER_STATUS.IMPATIENT) {
      entry.avatar.setTint?.(0xffaaaa);
    } else {
      entry.avatar.clearTint?.();
    }

    entry.patienceFill.width = 16 * mood.ratio;
    entry.patienceFill.fillColor =
      mood.ratio > 0.65 ? 0x6ecf6e : mood.ratio > 0.35 ? 0xe8c040 : 0xe06050;

    entry.body.setDepth(CUSTOMER_DEPTH + queueIndex * 0.01);

    const targetX = slot.x;
    const targetY = slot.y;
    if (
      Math.abs(entry.body.x - targetX) > 1 ||
      Math.abs(entry.body.y - targetY) > 1
    ) {
      scene.tweens.add({
        targets: entry.body,
        x: targetX,
        y: targetY,
        duration: 280,
        ease: 'Sine.easeOut',
      });
    } else {
      entry.body.setPosition(targetX, targetY);
    }
  }

  destroyCustomerVisual(entry) {
    stopCustomerQueueWalk(entry.walkTween);
    try {
      entry.body?.destroy?.(true);
    } catch {
      /* ignore */
    }
  }

  flashThanks(customerId) {
    const entry = this.customers.get(customerId);
    if (!entry) return;
    entry.orderRow.removeAll(true);
    entry.orderRow.add(
      this.scene.add.text(0, 0, '😊', { fontSize: '12px' }).setOrigin(0.5),
    );
    drawSpeechBubble(entry.bubbleBg, 28, 22);
  }

  clear() {
    for (const entry of this.customers.values()) {
      this.destroyCustomerVisual(entry);
    }
    this.customers.clear();
    try {
      this.hit?.destroy?.();
      this.root?.destroy?.(true);
    } catch {
      /* ignore */
    }
    this.hit = null;
    this.root = null;
    this.building = null;
  }

  destroy() {
    this.clear();
  }
}

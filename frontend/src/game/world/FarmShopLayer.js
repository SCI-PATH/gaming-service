/**
 * Physical Farm Shop building + customer queue sprites with order bubbles.
 */
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

const BUILDING_KEYS = [
  'unlock_tent',
  'unlock_supplies',
  'unlock_well',
  'unlock_cart',
];

export default class FarmShopLayer {
  constructor(scene) {
    this.scene = scene;
    this.zone = FARM_SHOP_ZONE;
    this.root = null;
    this.building = null;
    this.marker = null;
    this.label = null;
    this.hint = null;
    this.hit = null;
    this.customers = new Map();
    this.slots = farmShopQueueSlots(6, TILE_SIZE);
  }

  firstKey(keys) {
    const textures = this.scene?.textures;
    if (!textures) return null;
    for (const key of keys) {
      if (key && textures.exists(key)) return key;
    }
    return null;
  }

  spawn() {
    this.clear();
    const scene = this.scene;
    const z = this.zone;
    const px = z.x * TILE_SIZE;
    const py = z.y * TILE_SIZE;
    const pw = z.w * TILE_SIZE;
    const ph = z.h * TILE_SIZE;
    const center = farmShopZoneCenter(TILE_SIZE);

    this.root = scene.add.container(0, 0).setDepth(4);

    const pad = scene.add.graphics();
    pad.fillStyle(0x5a3d24, 0.45);
    pad.fillRoundedRect(px - 4, py - 4, pw + 8, ph + 8, 4);
    pad.fillStyle(0x3d6b45, 0.35);
    pad.fillRoundedRect(px, py, pw, ph, 3);
    pad.lineStyle(2, 0xe8c56a, 0.95);
    pad.strokeRoundedRect(px + 0.5, py + 0.5, pw - 1, ph - 1, 3);
    this.root.add(pad);

    const tex = this.firstKey(BUILDING_KEYS);
    if (tex) {
      this.building = scene.add.image(center.x, center.y - 4, tex);
      this.building.setScale(tex.includes('cart') ? 0.32 : 0.38);
      this.building.setDepth(5);
    } else {
      this.building = scene.add
        .rectangle(center.x, center.y - 4, pw - 10, ph - 6, 0x6b4423, 0.95)
        .setStrokeStyle(2, 0xd4a017);
      this.building.setDepth(5);
    }
    this.root.add(this.building);

    this.label = scene.add
      .text(center.x, py - 6, 'FARM SHOP', {
        fontFamily: 'Courier New, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ffe08a',
        stroke: '#1a1208',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.root.add(this.label);

    this.hint = scene.add
      .text(center.x, py + ph + 2, 'E / Q · unload cart', {
        fontFamily: 'Courier New, monospace',
        fontSize: '8px',
        color: '#b8d4a8',
        stroke: '#0a1208',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.root.add(this.hint);

    this.hit = scene.add
      .rectangle(center.x, center.y, pw + 12, ph + 20, 0xffffff, 0.001)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p, _lx, _ly, event) => {
      event?.stopPropagation?.();
      scene.openFarmShopUnload?.();
    });
  }

  isShopTile(gridX, gridY) {
    return isFarmShopTile(gridX, gridY);
  }

  isNear(worldX, worldY, padTiles = 1.25) {
    const z = this.zone;
    const minX = (z.x - padTiles) * TILE_SIZE;
    const maxX = (z.x + z.w + padTiles) * TILE_SIZE;
    const minY = (z.y - padTiles) * TILE_SIZE;
    const maxY = (z.y + z.h + padTiles * 3) * TILE_SIZE;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  /**
   * Sync living customers to queue slots with bubbles.
   */
  sync(shop) {
    if (!this.root) this.spawn();
    const living = (shop?.customers || []).filter(
      (c) =>
        c.status !== CUSTOMER_STATUS.SERVED &&
        c.status !== CUSTOMER_STATUS.LEFT,
    );
    const seen = new Set();
    const bubbleScale = shop?.difficulty?.bubbleScale || 1;

    living.forEach((customer, index) => {
      seen.add(customer.id);
      const slot = this.slots[index] || this.slots[this.slots.length - 1];
      let entry = this.customers.get(customer.id);
      if (!entry) {
        entry = this.createCustomerVisual(customer, slot);
        this.customers.set(customer.id, entry);
      }
      this.updateCustomerVisual(entry, customer, slot, {
        isFront: index === 0,
        bubbleScale,
      });
    });

    for (const [id, entry] of this.customers) {
      if (seen.has(id)) continue;
      this.destroyCustomerVisual(entry);
      this.customers.delete(id);
    }
  }

  createCustomerVisual(customer, slot) {
    const scene = this.scene;
    const body = scene.add.container(slot.x, slot.y).setDepth(7);

    const avatar = scene.add.circle(0, 0, 9, 0xc4a574, 1);
    avatar.setStrokeStyle(2, 0x5a3d24);
    const face = scene.add
      .text(0, -1, '🙂', {
        fontSize: '12px',
      })
      .setOrigin(0.5);

    const bubble = scene.add.container(0, -28).setDepth(8);
    const bubbleBg = scene.add.graphics();
    const bubbleText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Courier New, monospace',
        fontSize: '9px',
        color: '#1a2010',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    bubble.add([bubbleBg, bubbleText]);
    body.add([avatar, face, bubble]);

    return {
      id: customer.id,
      body,
      avatar,
      face,
      bubble,
      bubbleBg,
      bubbleText,
    };
  }

  updateCustomerVisual(entry, customer, slot, { isFront, bubbleScale }) {
    const scene = this.scene;
    const mood = patienceMood(customer);
    entry.face.setText(mood.face);

    const lines = orderLineProgress(customer);
    const label = lines
      .map((l) =>
        l.done
          ? `${l.icon} ✓`
          : `${l.icon}×${l.remaining}`,
      )
      .join('  ');
    const header = isFront ? '★ ' : '';
    entry.bubbleText.setText(`${header}${label || '…'}`);
    entry.bubbleText.setScale(bubbleScale);

    const bounds = entry.bubbleText.getBounds();
    const bw = Math.max(36, bounds.width + 10);
    const bh = Math.max(14, bounds.height + 6);
    entry.bubbleBg.clear();
    entry.bubbleBg.fillStyle(isFront ? 0xfff4c8 : 0xf0ebe0, 0.95);
    entry.bubbleBg.lineStyle(1, isFront ? 0xd4a017 : 0x8a7a60, 1);
    entry.bubbleBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);
    entry.bubbleBg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);

    if (customer.status === CUSTOMER_STATUS.IMPATIENT) {
      entry.avatar.setFillStyle(0xe08a6a, 1);
    } else if (isFront) {
      entry.avatar.setFillStyle(0xe8c56a, 1);
    } else {
      entry.avatar.setFillStyle(0xc4a574, 1);
    }

    const targetX = slot.x;
    const targetY = slot.y;
    const dx = Math.abs(entry.body.x - targetX);
    const dy = Math.abs(entry.body.y - targetY);
    if (dx > 1 || dy > 1) {
      scene.tweens.add({
        targets: entry.body,
        x: targetX,
        y: targetY,
        duration: Math.min(500, 180 + dx + dy),
        ease: 'Sine.easeInOut',
      });
    } else {
      entry.body.setPosition(targetX, targetY);
    }
  }

  destroyCustomerVisual(entry) {
    try {
      entry.body?.destroy?.(true);
    } catch {
      /* ignore */
    }
  }

  flashThanks(customerId) {
    const entry = this.customers.get(customerId);
    if (!entry) return;
    entry.face.setText('😊');
    entry.bubbleText.setText('Thank you!');
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

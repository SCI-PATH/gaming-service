/**
 * Queue customer walk-in-place motion (static sprite sheets).
 */
import { FARM_SHOP_CUSTOMER_SHEET } from '../../data/farmShopAssets.js';

function hashPick(seed, length) {
  let h = 0;
  const s = String(seed || '0');
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % Math.max(1, length);
}

/** Side-profile queue customer facing the shop counter. */
export function pickCustomerSprite(customerId) {
  return {
    textureKey: FARM_SHOP_CUSTOMER_SHEET.textureKey,
    frame: hashPick(customerId, FARM_SHOP_CUSTOMER_SHEET.frameCount),
    scale: 0.32,
    flipX: true,
  };
}

/** Gentle bob so static sprites feel alive — no scale tweens (breaks flipX). */
export function startCustomerQueueWalk(scene, sprite, queueIndex = 0) {
  if (!scene?.tweens || !sprite) return [];

  const stagger = queueIndex * 90;

  return [
    scene.tweens.add({
      targets: sprite,
      y: -3,
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: stagger,
    }),
    scene.tweens.add({
      targets: sprite,
      x: 2,
      duration: 440,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: stagger + 40,
    }),
  ];
}

export function stopCustomerQueueWalk(tweens = []) {
  for (const tween of tweens) {
    try {
      tween?.stop?.();
      tween?.remove?.();
    } catch {
      /* ignore */
    }
  }
}

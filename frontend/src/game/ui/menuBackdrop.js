import Phaser from 'phaser';
import { enterPromptStyle } from './textStyles.js';

export const BRAND = Object.freeze({
  primary: 0x00a8e8,
  secondary: 0x70e000,
  special: 0x7209b7,
  text: 0x212529,
  surface: 0xe9ecef,
  background: 0xf8f9fa,
});

/** Light SCI-PATH menu background with soft accent blobs. */
export function addMenuBackdrop(scene, depth = 0) {
  const w = scene.scale.width || 800;
  const h = scene.scale.height || 600;
  const g = scene.add.graphics().setDepth(depth);

  g.fillStyle(BRAND.background, 1);
  g.fillRect(0, 0, w, h);

  g.fillStyle(BRAND.primary, 0.1);
  g.fillCircle(w * 0.14, h * 0.16, 108);
  g.fillStyle(BRAND.secondary, 0.08);
  g.fillCircle(w * 0.86, h * 0.78, 96);
  g.fillStyle(BRAND.special, 0.06);
  g.fillCircle(w * 0.52, h * 0.52, 128);

  return g;
}

/** White card panel for instructions / leaderboard rows. */
export function addInfoCard(scene, centerX, centerY, width, height, depth = 1) {
  const g = scene.add.graphics().setDepth(depth);
  const x = centerX - width / 2;
  const y = centerY - height / 2;

  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(x, y, width, height, 12);
  g.lineStyle(1.5, BRAND.surface, 1);
  g.strokeRoundedRect(x, y, width, height, 12);

  return g;
}

/** Branded pulsing Enter prompt (replaces retro press-enter sprite). */
export function addPressEnterPrompt(scene, y, onEnter, depth = 5) {
  const label = scene.add
    .text(400, y, 'Press Enter', enterPromptStyle)
    .setOrigin(0.5)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });

  scene.tweens.add({
    targets: label,
    alpha: { from: 1, to: 0.5 },
    duration: 850,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  label.on('pointerdown', () => {
    if (!scene.sys?.isActive()) return;
    onEnter();
  });

  return label;
}

/** Brand-colored load progress bar on a dark game backdrop. */
export function createBrandLoadBar(scene) {
  const w = scene.scale.width || 800;
  const h = scene.scale.height || 600;
  const bg = scene.add.graphics().setDepth(0);
  bg.fillStyle(0x0a1222, 1);
  bg.fillRect(0, 0, w, h);

  const bar = scene.add.graphics().setDepth(2);
  const track = scene.add.graphics().setDepth(1);

  scene.load.on('progress', (percent) => {
    const barW = Math.min(420, w * 0.55);
    const x = (w - barW) / 2;
    const y = h / 2 + 24;

    track.clear();
    track.fillStyle(0x1e2a42, 1);
    track.fillRoundedRect(x, y, barW, 10, 5);

    bar.clear();
    bar.fillStyle(BRAND.primary, 1);
    bar.fillRoundedRect(x, y, barW * percent, 10, 5);
  });

  return bar;
}

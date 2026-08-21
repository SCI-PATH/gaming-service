/**
 * Reliable Enter-to-continue for Phaser menu/guide screens.
 * Phaser JustDown(enter) often misses when the canvas is not capturing keys.
 */
export function bindPressEnter(scene, onEnter, { allowInInput = false } = {}) {
  if (scene.input?.keyboard) {
    scene.input.keyboard.enabled = true;
  }

  const go = () => {
    if (!scene.sys?.isActive()) return;
    onEnter();
  };

  const onKey = (event) => {
    if (!scene.sys?.isActive()) return;
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
    if (event.repeat) return;
    const tag = event.target?.tagName;
    const typing =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
    if (typing && !allowInInput) return;
    event.preventDefault();
    go();
  };

  window.addEventListener('keydown', onKey);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('keydown', onKey);
  });

  return go;
}

export function makeEnterImageClickable(scene, image, onEnter) {
  if (!image) return;
  image.setInteractive({ useHandCursor: true });
  image.on('pointerdown', () => {
    if (!scene.sys?.isActive()) return;
    onEnter();
  });
}

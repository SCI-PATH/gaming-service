/**
 * Short in-world Sage lines for farm objectives.
 */
export function sageLineForStep(step, { frustrationLevel } = {}) {
  if (!step) return '';
  const level = String(frustrationLevel || '').toLowerCase();
  const gentle = level === 'high' || level === 'very_high';
  const lively = level === 'low';
  const title = String(step.title || '');

  if (step.quiet && /quiz/i.test(step.id || '')) {
    return gentle
      ? 'Take this question when you are ready.'
      : 'Answer this, then we keep farming.';
  }
  if (step.id === 'unlock-shop') {
    return 'The unlock shop is open. Buy something, or close it to keep playing.';
  }
  if (step.id === 'carry-shop' || /^Unload /.test(title) || /^Sell /.test(title)) {
    return gentle
      ? 'Harvest is on your back. Walk to the Farm Shop when you are ready and press E.'
      : lively
        ? 'The shop is busy! Get that harvest to the stall — press E.'
        : 'Head to the Farm Shop and press E to unload.';
  }
  if (/^Plant /.test(title)) {
    return `Let's plant! Walk to the gold bed and press E.`;
  }
  if (/^Pick /.test(title)) {
    return 'Ready crops are waiting. Press E, then run over them to pick them up.';
  }
  if (/^Feed |^Shear /.test(title)) {
    return 'The animals need you. Walk into the pen and press E.';
  }
  if (/^Collect /.test(title)) {
    return 'Run over the produce in the pen, then carry it to the shop.';
  }
  if (/Clean |Sweep /.test(title)) {
    return 'The yard needs a clean. Walk in and press E, then sweep the mess.';
  }
  if (step.id === 'forest') {
    return 'Nice work — the forest path is open.';
  }
  if (step.pin?.label) {
    return `${title}. Follow the pin toward ${step.pin.label}.`;
  }
  return title;
}

export function grovePressureLine(level) {
  const lvl = String(level || '').toLowerCase();
  if (lvl === 'low') return 'The grove is lively — watch the paths!';
  if (lvl === 'high') return 'The grove eased up. You have more room.';
  if (lvl === 'very_high') return 'Soft paths today. Take your time.';
  return '';
}

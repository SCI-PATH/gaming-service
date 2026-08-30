/**
 * Customer mood bands from existing patience/status — no new scoring.
 */
const STATUS = {
  WAITING: 'WAITING',
  SERVING: 'SERVING',
  SERVED: 'SERVED',
  IMPATIENT: 'IMPATIENT',
  LEFT: 'LEFT',
};

const SKIP_PAIRS = new Set(['happy|waiting', 'waiting|happy', 'happy|happy']);

export function customerMoodState(customer) {
  if (!customer) {
    return { key: 'none', rank: 0, face: '🙂', label: '—', reason: '', action: '' };
  }
  if (customer.status === STATUS.LEFT) {
    return {
      key: 'left',
      rank: 4,
      face: '😞',
      label: 'Left',
      reason: 'Waited too long',
      action: 'Unload harvest so the next customer can stay',
    };
  }
  if (customer.status === STATUS.SERVED) {
    return {
      key: 'happy',
      rank: 0,
      face: '😊',
      label: 'Happy',
      reason: 'Order completed',
      action: '',
    };
  }
  const ratio = Number(customer.patience) / Math.max(1, Number(customer.maxPatience) || 1);
  if (customer.status === STATUS.IMPATIENT || ratio <= 0.18) {
    return {
      key: 'angry',
      rank: 3,
      face: '😡',
      label: 'Angry',
      reason: 'Waiting too long',
      action: 'Unload at the Farm Shop now',
    };
  }
  if (ratio <= 0.35) {
    return {
      key: 'unhappy',
      rank: 2,
      face: '😟',
      label: 'Unhappy',
      reason: 'Been waiting a while',
      action: 'Bring harvest to the shop',
    };
  }
  if (ratio <= 0.65) {
    return {
      key: 'waiting',
      rank: 1,
      face: '😐',
      label: 'Waiting',
      reason: 'In the queue',
      action: 'Keep filling the stall',
    };
  }
  return {
    key: 'happy',
    rank: 0,
    face: '😊',
    label: 'Patient',
    reason: 'Happy to wait a bit',
    action: '',
  };
}

export function meaningfulMoodAlert(prev, next, customer) {
  if (!next || next.key === 'none') return null;
  const from = prev?.key || 'none';
  if (from === next.key) return null;
  if (SKIP_PAIRS.has(`${from}|${next.key}`)) return null;
  const important =
    next.key === 'unhappy' ||
    next.key === 'angry' ||
    next.key === 'left' ||
    (from === 'unhappy' && next.key === 'happy') ||
    (from === 'angry' && (next.key === 'happy' || next.key === 'waiting')) ||
    (from === 'left' && next.key === 'happy');
  if (!important) return null;
  const improved = (prev?.rank || 0) > next.rank;
  return {
    id: `${customer.id}-${next.key}-${Date.now()}`,
    customerId: customer.id,
    queueIndex: customer.queueIndex,
    from,
    to: next.key,
    fromFace: prev?.face || '🙂',
    toFace: next.face,
    fromLabel: prev?.label || '—',
    toLabel: next.label,
    reason: next.reason,
    action: next.action,
    improved,
    at: Date.now(),
  };
}

export function collectCustomerAlerts(prevCustomers = [], nextCustomers = []) {
  const prevMap = new Map((prevCustomers || []).map((c) => [c.id, customerMoodState(c)]));
  const alerts = [];
  for (const customer of nextCustomers || []) {
    const next = customerMoodState(customer);
    const alert = meaningfulMoodAlert(prevMap.get(customer.id), next, customer);
    if (alert) alerts.push(alert);
  }
  return alerts;
}

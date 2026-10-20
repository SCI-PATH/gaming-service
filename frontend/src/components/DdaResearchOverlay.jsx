import { useEffect, useMemo, useState } from 'react';
import { ForestGameBridge, FARM_EVENTS } from './ForestGameBridge.js';
import { PERFORMANCE_LABELS } from '../data/performanceCategories.js';
import { frustrationLevelLabel } from '../data/frustrationModel.js';
import { SHOP_BASE_PRICES } from '../data/shopPricePolicy.js';

/**
 * Demonstration-only overlay: shows measured frustration / DDA values.
 * Hidden unless researchOverlay / demoProfile is enabled.
 */
export default function DdaResearchOverlay({
  open = false,
  grade = null,
  demoProfile = null,
  demoPinned = false,
  onPreviewShop = null,
  farm = {},
  shopPerformance = null,
  lastAttempt = null,
  gameplaySettings = null,
}) {
  const [shopState, setShopState] = useState(null);
  const [ddaLive, setDdaLive] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onShop = (payload = {}) => setShopState(payload);
    const onFarm = (payload = {}) => {
      if (
        payload.frustrationScore != null ||
        payload.enemyDamageChance != null ||
        payload.gameplaySettings
      ) {
        setDdaLive(payload);
      }
    };
    ForestGameBridge.on(FARM_EVENTS.FARM_SHOP_STATE, onShop);
    ForestGameBridge.on(FARM_EVENTS.FARM_STATE, onFarm);
    return () => {
      ForestGameBridge.off(FARM_EVENTS.FARM_SHOP_STATE, onShop);
      ForestGameBridge.off(FARM_EVENTS.FARM_STATE, onFarm);
    };
  }, [open]);

  const avg =
    shopPerformance?.avgFrustrationScore ??
    farm.avgFrustrationScore ??
    null;
  const worldScore = ddaLive?.frustrationScore ?? farm.frustrationScore ?? null;
  const worldLevel = ddaLive?.frustrationLevel ?? farm.frustrationLevel ?? null;
  const frScore = demoPinned
    ? worldScore
    : lastAttempt?.frustrationScore ?? worldScore;
  const frLevel = demoPinned
    ? worldLevel
    : lastAttempt?.frustrationLevel ?? worldLevel;
  const sampleItem = 'sheep';
  const basePrice = SHOP_BASE_PRICES[sampleItem];
  const frozenPrice = shopPerformance?.frozenPrices?.[sampleItem] ?? null;

  const rows = useMemo(
    () => [
      { label: 'Grade', value: grade ?? '—', kind: 'config' },
      { label: 'Demo profile', value: demoProfile || 'off', kind: 'config' },
      {
        label: 'World source',
        value: demoPinned ? 'Demo override (not a student result)' : 'Live play',
        kind: 'config',
      },
      { label: 'Level', value: farm.levelId ?? '—', kind: 'measured' },
      {
        label: 'Challenge summary',
        value: farm.librarySummary || farm.goalText || '—',
        kind: 'measured',
      },
      {
        label: 'Last answer',
        value:
          lastAttempt == null
            ? '—'
            : lastAttempt.isCorrect
              ? 'Correct'
              : 'Incorrect',
        kind: 'measured',
      },
      {
        label: 'Response time (ms)',
        value: lastAttempt?.responseTimeMs ?? '—',
        kind: 'measured',
      },
      {
        label: demoPinned ? 'World frustration' : 'Question frustration',
        value: frScore == null ? '—' : `${Math.round(Number(frScore))}`,
        kind: 'derived',
      },
      ...(demoPinned && lastAttempt?.frustrationScore != null
        ? [
            {
              label: 'Measured answer (not applied)',
              value: `${Math.round(Number(lastAttempt.frustrationScore))}`,
              kind: 'measured',
            },
          ]
        : []),
      {
        label: 'Frustration band',
        value: frLevel ? frustrationLevelLabel(frLevel) : '—',
        kind: 'derived',
      },
      {
        label: 'Performance band',
        value: farm.performanceBand
          ? PERFORMANCE_LABELS[farm.performanceBand] || farm.performanceBand
          : '—',
        kind: 'derived',
      },
      {
        label: 'Enemy damage chance',
        value:
          gameplaySettings?.enemyDamageChance ??
          ddaLive?.enemyDamageChance ??
          '—',
        kind: 'config',
      },
      {
        label: 'Enemy speed',
        value: gameplaySettings?.enemySpeed ?? ddaLive?.enemySpeed ?? '—',
        kind: 'config',
      },
      {
        label: 'Customer patience boost',
        value:
          shopState?.difficulty?.patienceBoost != null
            ? shopState.difficulty.patienceBoost
            : shopState?.frustrationScore != null
              ? `frustration ${shopState.frustrationScore}`
              : '—',
        kind: 'derived',
      },
      {
        label: 'Level avg frustration',
        value: avg == null ? '—' : `${avg}`,
        kind: 'derived',
      },
      {
        label: `Shop base (${sampleItem})`,
        value: basePrice != null ? `$${basePrice}` : '—',
        kind: 'config',
      },
      {
        label: `Shop priced (${sampleItem})`,
        value: frozenPrice != null ? `$${frozenPrice}` : '—',
        kind: 'derived',
      },
      {
        label: 'Cash',
        value:
          farm.earnings != null || farm.currentMoney != null
            ? `$${farm.earnings ?? farm.currentMoney}`
            : '—',
        kind: 'measured',
      },
    ],
    [
      grade,
      demoProfile,
      demoPinned,
      farm,
      lastAttempt,
      frScore,
      frLevel,
      gameplaySettings,
      ddaLive,
      shopState,
      avg,
      basePrice,
      frozenPrice,
    ],
  );

  if (!open) return null;

  return (
    <aside className="dda-research-overlay" aria-label="DDA research overlay">
      <header className="dda-research-head">
        <p className="dda-research-kicker">Research overlay</p>
        <h2>Frustration → DDA</h2>
        <p className="dda-research-note">
          {demoPinned
            ? 'This recording is pinned to a demo profile. The world uses that scored profile. It is stored separately and is not a real student result. Remove demoProfile to return to live adaptation.'
            : 'Measured values come from live gameplay. Derived values use the real CSF and shop formulas.'}
        </p>
      </header>
      {onPreviewShop ? (
        <button type="button" className="dda-research-preview" onClick={onPreviewShop}>
          Preview shop prices
        </button>
      ) : null}
      <ul className="dda-research-list">
        {rows.map((row) => (
          <li key={row.label} data-kind={row.kind}>
            <span>{row.label}</span>
            <strong>{String(row.value)}</strong>
            <em>{row.kind}</em>
          </li>
        ))}
      </ul>
    </aside>
  );
}

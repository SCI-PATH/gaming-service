/**
 * Farm Shop panel — view customer queue and shop stock.
 * Press E at the stall to unload harvests; customers auto-fulfill from stock (FIFO).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  getShopDifficulty,
  orderLineProgress,
  patienceMood,
  SHOP_EVENTS,
} from '../data/farmCustomerShop.js';
import { getShopItemById } from '../data/farmShopCatalog.js';

export default function FarmCustomerShopModal({
  open,
  cash = 0,
  shopStock = {},
  customers = [],
  frustrationScore = 0,
  frustrationLevel = 'low',
  difficulty = null,
  onClose,
  onShopEvent,
}) {
  const [message, setMessage] = useState(null);

  const diff =
    difficulty || getShopDifficulty(frustrationScore, frustrationLevel);

  const shopLines = useMemo(() => {
    return Object.entries(shopStock || {})
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({
        ...getShopItemById(id),
        qty,
      }));
  }, [shopStock]);

  const queue = useMemo(
    () => (customers || []).slice().sort((a, b) => a.queueIndex - b.queueIndex),
    [customers],
  );

  useEffect(() => {
    if (!open) {
      setMessage(null);
      return undefined;
    }
    onShopEvent?.({
      type: SHOP_EVENTS.SHOP_OPENED,
      frustrationScore,
      mode: 'shop',
      difficulty: diff,
    });
    setMessage(
      'Customers take what they need from shop stock automatically. Press E at the stall to unload more.',
    );
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="farm-customer-shop-overlay" role="dialog" aria-modal="true">
      <div className="farm-customer-shop-card">
        <header className="fcs-head">
          <div>
            <p className="fcs-kicker">Physical Farm Shop</p>
            <h2>Shop Stock &amp; Queue</h2>
            <p className="fcs-sub">
              {diff.label} · CSF {Math.round(frustrationScore)} · FIFO queue
            </p>
          </div>
          <div className="fcs-cash">
            <span>Your coins</span>
            <strong>💰 {Math.round(cash)}</strong>
          </div>
        </header>

        <div className="fcs-body fcs-body-unload">
          <section className="fcs-queue">
            <h3>Queue (outside)</h3>
            {!queue.length && (
              <p className="fcs-empty">No customers waiting right now.</p>
            )}
            <ul>
              {queue.map((c, i) => {
                const mood = patienceMood(c);
                const lines = orderLineProgress(c);
                return (
                  <li
                    key={c.id}
                    className={`fcs-cust ${i === 0 ? 'is-active' : ''}`}
                  >
                    <strong>
                      {i === 0 ? '★ Serving' : `Customer ${i + 1}`} {mood.face}
                    </strong>
                    <small>{c.speech}</small>
                    <div className="fcs-patience">
                      <div className="fcs-patience-bar">
                        <div
                          className={`fcs-patience-fill ${
                            mood.ratio > 0.65
                              ? 'tone-ok'
                              : mood.ratio > 0.35
                                ? 'tone-mid'
                                : 'tone-low'
                          }`}
                          style={{ width: `${Math.round(mood.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                    <ul className="fcs-lines">
                      {lines.map((l) => (
                        <li
                          key={`${c.id}-${l.itemId}`}
                          className={`${l.done ? 'is-done' : ''} ${
                            diff.highlightHelp && !l.done ? 'is-highlight' : ''
                          }`}
                        >
                          {l.icon} {l.name}{' '}
                          {l.done ? '✓' : `×${l.remaining}`}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="fcs-stock">
            <h3>Shop stock</h3>
            {!shopLines.length && (
              <p className="fcs-empty">
                Shop shelves are empty — press E at the Farm Shop while carrying harvests.
              </p>
            )}
            <ul className="fcs-lines">
              {shopLines.map((l) => (
                <li key={`shop-${l.id}`}>
                  {l.icon} {l.name} ×{l.qty}
                </li>
              ))}
            </ul>
            {diff.showHints && queue[0] && (
              <p className="fcs-hint">
                Tip: front customer still needs{' '}
                {orderLineProgress(queue[0])
                  .filter((l) => !l.done)
                  .map((l) => l.icon)
                  .join(' ') || 'nothing'}.
              </p>
            )}
          </section>
        </div>

        {message && <p className="fcs-message">{message}</p>}

        <footer className="fcs-foot">
          <p>Customers pay automatically when their full order is in shop stock.</p>
          <button type="button" className="fcs-close" onClick={() => onClose?.()}>
            Back to farm
          </button>
        </footer>
      </div>
    </div>
  );
}

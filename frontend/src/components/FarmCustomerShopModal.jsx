/**
 * Farm Shop unload panel — move cart items into shop stock.
 * Customers auto-fulfill in the Phaser world (FIFO); this UI only unloads.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getShopDifficulty,
  orderLineProgress,
  patienceMood,
  SHOP_EVENTS,
} from '../data/farmCustomerShop.js';
import {
  countInventory,
  getShopItemById,
  inventoryFromCartStack,
} from '../data/farmShopCatalog.js';

export default function FarmCustomerShopModal({
  open,
  cash = 0,
  cartStack = [],
  shopStock = {},
  customers = [],
  cropId = 'tomato',
  animalProduceId = 'milk',
  frustrationScore = 0,
  frustrationLevel = 'low',
  difficulty = null,
  onClose,
  onUnload,
  onShopEvent,
}) {
  const [message, setMessage] = useState(null);
  const [qtyById, setQtyById] = useState({});

  const diff =
    difficulty || getShopDifficulty(frustrationScore, frustrationLevel);

  const playerStock = useMemo(
    () =>
      inventoryFromCartStack(cartStack, {
        cropId,
        animalProduceId,
      }),
    [cartStack, cropId, animalProduceId],
  );

  const playerLines = useMemo(() => {
    return Object.entries(playerStock)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({
        ...getShopItemById(id),
        qty,
      }));
  }, [playerStock]);

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
      setQtyById({});
      return undefined;
    }
    onShopEvent?.({
      type: SHOP_EVENTS.SHOP_OPENED,
      frustrationScore,
      mode: 'unload',
      difficulty: diff,
    });
    setMessage(
      'Unload items into the shop. Customers at the counter take what they need automatically.',
    );
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unload = useCallback(
    (itemId, qty) => {
      const n = Math.max(1, Math.floor(Number(qty) || 1));
      onUnload?.({ itemId, qty: n });
      setMessage(`Unloaded ${getShopItemById(itemId).icon} ×${n} into the shop.`);
    },
    [onUnload],
  );

  if (!open) return null;

  return (
    <div className="farm-customer-shop-overlay" role="dialog" aria-modal="true">
      <div className="farm-customer-shop-card">
        <header className="fcs-head">
          <div>
            <p className="fcs-kicker">Physical Farm Shop</p>
            <h2>Unload to Shop Stock</h2>
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
            <h3>Your cart ({countInventory(playerStock)})</h3>
            {!playerLines.length && (
              <p className="fcs-empty">
                Cart is empty — harvest and load at the blue dock first.
              </p>
            )}
            <div className="fcs-stock-grid">
              {playerLines.map((line) => {
                const qty = Math.min(
                  line.qty,
                  Math.max(1, Number(qtyById[line.id]) || 1),
                );
                return (
                  <div key={line.id} className="fcs-unload-row">
                    <button
                      type="button"
                      className="fcs-stock-btn"
                      onClick={() => unload(line.id, qty)}
                    >
                      <span className="fcs-icon">{line.icon}</span>
                      <span>
                        {line.name}
                        <br />
                        <small>×{line.qty} in cart</small>
                      </span>
                    </button>
                    <label className="fcs-qty">
                      Qty
                      <input
                        type="number"
                        min={1}
                        max={line.qty}
                        value={qty}
                        onChange={(e) =>
                          setQtyById((prev) => ({
                            ...prev,
                            [line.id]: Math.min(
                              line.qty,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="fcs-unload-all"
                      onClick={() => unload(line.id, line.qty)}
                    >
                      Unload all
                    </button>
                  </div>
                );
              })}
            </div>

            <h3>Shop stock</h3>
            {!shopLines.length && (
              <p className="fcs-empty">Shop shelves are empty.</p>
            )}
            <ul className="fcs-lines">
              {shopLines.map((l) => (
                <li key={`shop-${l.id}`}>
                  {l.icon} {l.name} ×{l.qty}
                </li>
              ))}
            </ul>
            {diff.showHints && (
              <p className="fcs-hint">
                Tip: unload what the front customer still needs
                {queue[0]
                  ? ` (${orderLineProgress(queue[0])
                      .filter((l) => !l.done)
                      .map((l) => l.icon)
                      .join(' ')})`
                  : ''}
                .
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

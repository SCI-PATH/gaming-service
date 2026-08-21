import { useEffect, useMemo, useState } from 'react';
import {
  buildShopCatalog,
  getOwnedUnlockIds,
} from '../data/unlockShop.js';
import { emitPurchaseUnlock } from './ForestRPGCanvas.jsx';

/**
 * Post-level unlock shop — spend farm cash on animals & props.
 * Prices scale with this level's quiz speed + accuracy.
 */
export default function UnlockShopModal({
  open,
  cash,
  performance,
  onClose,
}) {
  const [owned, setOwned] = useState(() => getOwnedUnlockIds());
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setOwned(getOwnedUnlockIds());
    setMessage(null);
    setBusyId(null);
  }, [open]);

  const catalog = useMemo(
    () => buildShopCatalog(performance ?? {}, owned),
    [performance, owned],
  );

  if (!open) return null;

  const handleBuy = (item) => {
    if (item.owned || busyId) return;
    if (cash < item.price) {
      setMessage(`Need $${item.price - cash} more for ${item.name}.`);
      return;
    }

    setBusyId(item.id);
    emitPurchaseUnlock({
      itemId: item.id,
      price: item.price,
      textureKey: item.textureKey,
      displayScale: item.displayScale,
      frameWidth: item.frameWidth,
      category: item.category,
    });

    // Optimistic UI — Phaser deducts cash + persists ownership
    setOwned((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    setMessage(`Unlocked ${item.name} for $${item.price}!`);
    setBusyId(null);
  };

  return (
    <div
      className="unlock-shop-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-shop-title"
    >
      <div className="unlock-shop-card">
        <header className="unlock-shop-head">
          <div>
            <p className="unlock-shop-kicker">Level complete</p>
            <h2 id="unlock-shop-title">Unlock Shop</h2>
            <p className="unlock-shop-sub">{catalog.bandLabel}</p>
          </div>
          <div className="unlock-shop-cash" aria-live="polite">
            <span>Cash</span>
            <strong>${cash}</strong>
          </div>
        </header>

        <p className="unlock-shop-hint">
        Faster, stronger quiz results → higher prices. Average results →
        standard prices. Weaker results → lower prices. Bought items appear on
        your next farm — no extra quests for them.
        </p>

        {message && <p className="unlock-shop-message">{message}</p>}

        <div className="unlock-shop-grid">
          {catalog.items.map((item) => (
            <article
              key={item.id}
              className={`unlock-shop-item${item.featured ? ' is-featured' : ''}${
                item.owned ? ' is-owned' : ''
              }`}
            >
              <ShopThumb item={item} />
              <div className="unlock-shop-item-body">
                <h3>
                  {item.name}
                  {item.featured ? (
                    <span className="unlock-featured">★</span>
                  ) : null}
                </h3>
                <p>{item.description}</p>
                <div className="unlock-shop-item-foot">
                  <span className="unlock-price">
                    {item.owned ? 'Owned' : `$${item.price}`}
                  </span>
                  <button
                    type="button"
                    disabled={
                      item.owned || cash < item.price || busyId === item.id
                    }
                    onClick={() => handleBuy(item)}
                  >
                    {item.owned ? 'Unlocked' : 'Buy'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="unlock-shop-foot">
          <button
            type="button"
            className="unlock-shop-continue"
            onClick={onClose}
          >
            Continue to Forest
          </button>
        </footer>
      </div>
    </div>
  );
}

function ShopThumb({ item }) {
  const size = 56;
  if (item.frameWidth && item.sheetCols) {
    const scale = size / item.frameWidth;
    return (
      <div
        className="unlock-shop-thumb unlock-shop-thumb-sheet"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${item.image})`,
          backgroundSize: `${item.sheetCols * item.frameWidth * scale}px auto`,
          backgroundPosition: '0 0',
          imageRendering: 'pixelated',
        }}
        aria-hidden
      />
    );
  }

  return (
    <div className="unlock-shop-thumb" aria-hidden>
      <img src={item.image} alt="" />
    </div>
  );
}

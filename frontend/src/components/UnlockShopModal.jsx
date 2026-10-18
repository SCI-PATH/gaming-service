import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildShopCatalog,
  getOwnedUnlockIds,
} from '../data/unlockShop.js';
import { emitPurchaseUnlock } from './ForestRPGCanvas.jsx';
import { ForestGameBridge, FARM_EVENTS } from './ForestGameBridge.js';

/**
 * Post-level unlock shop — spend farm cash on animals & props.
 * Prices scale with this level's quiz speed + accuracy.
 */
export default function UnlockShopModal({
  open,
  cash,
  performance,
  onClose,
  returnToLearningPath = false,
  retryLesson = false,
  chapterTitle = '',
  nextChapterTitle = '',
}) {
  const [owned, setOwned] = useState(() => getOwnedUnlockIds());
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const buyingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setOwned(getOwnedUnlockIds());
    setMessage(null);
    setBusyId(null);
    buyingRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onInteraction = (detail = {}) => {
      if (detail.type === 'unlock_purchased') {
        buyingRef.current = false;
        setBusyId(null);
        setOwned(getOwnedUnlockIds());
        setMessage(`Unlocked ${detail.itemId} for $${detail.price}.`);
      }
      if (detail.type === 'unlock_blocked') {
        buyingRef.current = false;
        setBusyId(null);
        setOwned(getOwnedUnlockIds());
        if (detail.reason === 'insufficient_cash') {
          setMessage(`You need $${Math.max(0, Number(detail.price) - Number(detail.cash))} more for this item.`);
        } else if (detail.reason === 'already_owned') {
          setMessage('You already own that item.');
        } else {
          setMessage('That purchase was not saved. Your cash was not kept.');
        }
      }
    };
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, onInteraction);
    return () => ForestGameBridge.off(FARM_EVENTS.INTERACTION, onInteraction);
  }, [open]);

  const catalog = useMemo(
    () => buildShopCatalog(performance ?? {}, owned),
    [performance, owned],
  );

  if (!open) return null;

  const handleBuy = (item) => {
    if (item.owned || busyId || buyingRef.current) return;
    if (cash < item.price) {
      setMessage(`Need $${item.price - cash} more for ${item.name}.`);
      return;
    }
    buyingRef.current = true;
    setBusyId(item.id);
    setMessage('Saving your purchase…');
    emitPurchaseUnlock({
      itemId: item.id,
      price: item.price,
      textureKey: item.textureKey,
      displayScale: item.displayScale,
      frameWidth: item.frameWidth,
      category: item.category,
    });
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
            <p className="unlock-shop-kicker">
              {retryLesson
                ? chapterTitle
                  ? `Try this chapter again · ${chapterTitle}`
                  : 'Try this lesson again'
                : chapterTitle
                ? `Chapter complete · ${chapterTitle}`
                : 'Level complete'}
            </p>
            <h2 id="unlock-shop-title">Unlock Shop</h2>
            <p className="unlock-shop-sub">{catalog.bandLabel}</p>
            {catalog.frustrationLabel ? (
              <p className="unlock-shop-sub unlock-shop-frust">
                {catalog.frustrationLabel}
              </p>
            ) : null}
          </div>
          <div className="unlock-shop-cash" aria-live="polite">
            <span>Cash</span>
            <strong>${cash}</strong>
          </div>
        </header>

        <p className="unlock-shop-hint">
          {returnToLearningPath && retryLesson
            ? 'This farm felt tough. After the shop you will go back to the lesson and learn it again before the next chapter unlocks.'
            : returnToLearningPath
            ? `Bought items will appear on your next chapter farm. After this shop you return to the learning path${
                nextChapterTitle ? ` to unlock ${nextChapterTitle}` : ''
              }.`
            : retryLesson
            ? 'This farm felt tough. After the shop you will play this same level again so you can keep practicing.'
            : 'Prices adapt to how this level went: stronger quiz results raise prices; higher support need lowers them so unlocks stay reachable. Bought items appear on your next farm — no extra quests for them.'}
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
                      item.owned || cash < item.price || busyId != null
                    }
                    onClick={() => handleBuy(item)}
                  >
                    {item.owned ? 'Unlocked' : cash < item.price ? 'Not enough cash' : 'Buy'}
                  </button>
                  {!item.owned && cash < item.price ? (
                    <span className="unlock-price">Need ${item.price - cash} more</span>
                  ) : null}
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
            {returnToLearningPath
              ? retryLesson
                ? 'Learn this lesson again'
                : 'Go to the next lesson'
              : retryLesson
                ? 'Play this level again'
                : 'Continue to Next Level'}
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

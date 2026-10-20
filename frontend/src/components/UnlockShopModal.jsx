import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildShopCatalog,
  getOwnedUnlockIds,
} from '../data/unlockShop.js';
import { emitPurchaseUnlock } from './ForestRPGCanvas.jsx';
import { ForestGameBridge, FARM_EVENTS } from './ForestGameBridge.js';
import { pickDemoUnlockPurchases } from '../data/demoAutoplay.js';

/**
 * Post-level unlock shop — spend farm cash on animals & props.
 * Prices scale with this level's quiz speed + accuracy.
 */
export default function UnlockShopModal({
  open,
  cash,
  performance,
  onClose,
  /** Optional: leave shop and advance (next farm / next lesson). */
  onContinueNext = null,
  /** Optional: leave shop and retry this lesson. */
  onRetryLesson = null,
  returnToLearningPath = false,
  retryLesson = false,
  chapterTitle = '',
  nextChapterTitle = '',
  /** Read-only price check. Does not finish the level or save a purchase. */
  preview = false,
  /** Recording: click Buy on affordable unlocks, then continue to the next level. */
  demoPurchase = false,
}) {
  const [owned, setOwned] = useState(() => getOwnedUnlockIds());
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [demoPickId, setDemoPickId] = useState(null);
  const buyingRef = useRef(false);
  const buyQueueRef = useRef([]);
  const demoContinueOnce = useRef(false);
  const handleBuyRef = useRef(null);
  const continueRef = useRef(onContinueNext);
  const demoBuyStarted = useRef(false);
  const catalogRef = useRef(null);
  const cashRef = useRef(cash);
  continueRef.current = onContinueNext;
  cashRef.current = cash;

  useEffect(() => {
    if (!open) return;
    setOwned(getOwnedUnlockIds());
    setMessage(null);
    setBusyId(null);
    setDemoPickId(null);
    buyingRef.current = false;
    buyQueueRef.current = [];
    demoContinueOnce.current = false;
    demoBuyStarted.current = false;
  }, [open]);

  /** Phaser confirms the buy on INTERACTION. A demo recording then buys the next affordable item. */
  useEffect(() => {
    if (!open) return undefined;
    const onInteraction = (detail = {}) => {
      if (detail.type === 'unlock_purchased') {
        buyingRef.current = false;
        setBusyId(null);
        setOwned(getOwnedUnlockIds());
        const label = detail.itemName || detail.itemId;
        setMessage(`Unlocked ${label} for $${detail.price}. Cash left: $${detail.currentMoney ?? detail.earnings ?? ''}`);
        if (demoPurchase) {
          const rest = buyQueueRef.current.filter((item) => item.id !== detail.itemId);
          buyQueueRef.current = rest;
          if (rest.length) {
            const next = rest[0];
            setDemoPickId(next.id);
            window.setTimeout(() => {
              document
                .querySelector(`[data-unlock-id="${next.id}"]`)
                ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
              handleBuyRef.current?.(next);
            }, 1600);
          } else if (!demoContinueOnce.current) {
            demoContinueOnce.current = true;
            window.setTimeout(() => continueRef.current?.(), 2400);
          }
        }
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
          setMessage(
            `That purchase was not saved (${detail.reason || 'save_failed'}). Your cash was restored — try Buy again.`,
          );
        }
        if (demoPurchase && !demoContinueOnce.current) {
          buyQueueRef.current = [];
          demoContinueOnce.current = true;
          window.setTimeout(() => continueRef.current?.(), 2400);
        }
      }
    };
    ForestGameBridge.on(FARM_EVENTS.INTERACTION, onInteraction);
    return () => ForestGameBridge.off(FARM_EVENTS.INTERACTION, onInteraction);
  }, [open, demoPurchase]);

  const catalog = useMemo(
    () => buildShopCatalog(performance ?? {}, owned),
    [performance, owned],
  );
  catalogRef.current = catalog;

  useEffect(() => {
    if (!open) return undefined;
    if (!demoPurchase || preview || demoBuyStarted.current) return undefined;
    const timer = window.setTimeout(() => {
      if (demoBuyStarted.current) return;
      demoBuyStarted.current = true;
      const picks = pickDemoUnlockPurchases(
        catalogRef.current?.items,
        cashRef.current,
        2,
      );
      if (!picks.length) {
        setMessage('Not enough cash for an unlock. Continuing to the next level.');
        if (!demoContinueOnce.current) {
          demoContinueOnce.current = true;
          window.setTimeout(() => continueRef.current?.(), 2800);
        }
        return;
      }
      buyQueueRef.current = picks;
      setDemoPickId(picks[0].id);
      window.setTimeout(() => {
        document
          .querySelector(`[data-unlock-id="${picks[0].id}"]`)
          ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        handleBuyRef.current?.(picks[0]);
      }, 1400);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [open, demoPurchase, preview]);

  if (!open) return null;

  /** Ask Phaser to spend cash and update the wallet. */
  const handleBuy = (item) => {
    if (preview || item.owned || busyId || buyingRef.current) return;
    if (!demoPurchase && cash < item.price) {
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
  handleBuyRef.current = handleBuy;

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
              {preview
                ? 'Price preview · level still in progress'
                : retryLesson
                ? chapterTitle
                  ? `Try this chapter again · ${chapterTitle}`
                  : 'Try this lesson again'
                : chapterTitle
                ? `Chapter complete · ${chapterTitle}`
                : 'Level complete'}
            </p>
            <h2 id="unlock-shop-title">{preview ? 'Shop price preview' : 'Unlock Shop'}</h2>
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
          {preview
            ? 'These prices use the same shop formula as a finished level. This preview does not complete the 15-question level and purchases stay off. Demo prices are not saved as a student result.'
            : returnToLearningPath && retryLesson
            ? 'Frustration or mastery on this farm means you should learn this lesson again before the next one unlocks. Bought items still appear on your next farm.'
            : returnToLearningPath
            ? `Bought items will appear on your next farm. After this shop you return to the learning path${
                nextChapterTitle ? ` to unlock ${nextChapterTitle}` : ''
              }.`
            : retryLesson
            ? 'Frustration or mastery on this farm means you should play this level again. Bought items appear once you reach the next farm level.'
            : 'Prices adapt to how this level went: stronger quiz results raise prices; higher support need lowers them so unlocks stay reachable. Bought items appear on your next farm — no extra quests for them.'}
        </p>

        {message && <p className="unlock-shop-message">{message}</p>}

        <div className="unlock-shop-grid">
          {catalog.items.map((item) => (
            <article
              key={item.id}
              data-unlock-id={item.id}
              className={`unlock-shop-item${item.featured ? ' is-featured' : ''}${
                item.owned ? ' is-owned' : ''
              }${demoPickId === item.id ? ' is-demo-pick' : ''}`}
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
                    className={demoPickId === item.id ? 'is-demo-pick' : undefined}
                    disabled={
                      preview || item.owned || cash < item.price || busyId != null
                    }
                    onClick={() => handleBuy(item)}
                  >
                    {preview
                      ? 'Preview only'
                      : item.owned
                        ? 'Unlocked'
                        : cash < item.price
                          ? 'Not enough cash'
                          : 'Buy'}
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
          {retryLesson ? (
            <button
              type="button"
              className="unlock-shop-continue"
              onClick={() => (onRetryLesson || onClose)?.()}
            >
              {returnToLearningPath
                ? 'Learn this lesson again'
                : 'Play this level again'}
            </button>
          ) : (
            <button
              type="button"
              className="unlock-shop-continue"
              onClick={() => (onContinueNext || onClose)?.()}
            >
              {preview
                ? 'Close preview'
                : returnToLearningPath
                ? nextChapterTitle
                  ? `Go to ${nextChapterTitle}`
                  : 'Go to the next lesson'
                : 'Continue to Next Level'}
            </button>
          )}
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

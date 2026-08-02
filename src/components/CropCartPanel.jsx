/**
 * Harvest cart HUD — shows crops loaded into the cart after the load quiz.
 * Carried crops (on the runner's back) are shown separately.
 */
export default function CropCartPanel({
  cropId = 'flowers',
  cropName = 'Crops',
  loadedCount = 0,
  carriedCount = 0,
  cropValue = 10,
  visible = true,
}) {
  if (!visible) return null;

  const cropSrc =
    cropId === 'corn'
      ? '/assets/crops/corn_crop.png'
      : '/assets/crops/flower_crop.png';

  const shown = Math.min(12, Math.max(0, loadedCount));
  const capacityHint = loadedCount > 12 ? `+${loadedCount - 12} more` : null;

  return (
    <aside className="crop-cart-panel" aria-label="Harvest cart">
      <div className="crop-cart-head">
        <strong>Harvest Cart</strong>
        <span>Unload at blue LOAD dock with a quiz</span>
      </div>

      <div className="crop-cart-stage">
        <img
          className="crop-cart-base"
          src="/assets/shop/props/cart.png"
          alt="Wooden harvest cart"
          draggable={false}
        />
        <div className="crop-cart-load" aria-hidden={shown === 0}>
          {Array.from({ length: shown }, (_, i) => (
            <img
              key={`load-${i}`}
              className="crop-cart-crop"
              src={cropSrc}
              alt=""
              draggable={false}
              style={{
                left: `${18 + (i % 4) * 16}%`,
                bottom: `${28 + Math.floor(i / 4) * 14}%`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="crop-cart-meta">
        <p className="crop-cart-count">
          On back: <strong>{carriedCount}</strong>
        </p>
        <p className="crop-cart-count">
          In cart: <strong>{loadedCount}</strong> {cropName}
          {loadedCount === 1 ? '' : 's'}
        </p>
        {capacityHint && <p className="crop-cart-extra">{capacityHint}</p>}
        <p className="crop-cart-value">
          Sell value (cart): ${loadedCount * cropValue}
        </p>
        {carriedCount > 0 ? (
          <p className="crop-cart-tip">
            Run to the blue LOAD dock and press E to unload (answer the load
            quiz).
          </p>
        ) : loadedCount < 1 ? (
          <p className="crop-cart-tip">
            Plant on gold beds → harvest onto your back → unload at LOAD.
          </p>
        ) : (
          <p className="crop-cart-tip">Press Q to sell the cart load.</p>
        )}
      </div>
    </aside>
  );
}

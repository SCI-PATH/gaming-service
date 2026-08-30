import { useEffect, useState } from 'react';
import { getOwnedUnlockIds, getUnlockItem } from '../data/unlockShop.js';

export default function OwnedUnlockHud() {
  const [ids, setIds] = useState(() => getOwnedUnlockIds());

  useEffect(() => {
    const sync = () => setIds(getOwnedUnlockIds());
    sync();
    const t = window.setInterval(sync, 1000);
    return () => window.clearInterval(t);
  }, []);

  const items = ids.map((id) => getUnlockItem(id)).filter(Boolean);

  if (!items.length) return null;

  return (
    <section className="owned-unlock-hud" aria-label="Unlocked farm items">
      <h3>Your farm</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="owned-unlock-chip">
            {item.image ? (
              <img src={item.image} alt="" className="owned-unlock-thumb" />
            ) : (
              <span className="owned-unlock-fallback" aria-hidden />
            )}
            <span>{item.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

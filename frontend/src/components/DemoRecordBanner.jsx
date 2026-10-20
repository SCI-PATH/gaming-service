import { demoReadout } from '../data/demoAutoplay.js';

/** Large on-screen readout so a recording shows the live world, not a pinned seed. */
export default function DemoRecordBanner({ score = 0, status = '' }) {
  /** score is the live frustration App passes while the scripted demo is running. */
  const readout = demoReadout(score);
  return (
    <div className="demo-record-banner" aria-live="polite">
      <p className="demo-record-kicker">Scripted demo · live score · not a student result</p>
      <p className="demo-record-score">
        Frustration {readout.score}
        <span>{readout.levelLabel}</span>
      </p>
      <ul>
        <li>
          <span>Sage tone</span>
          <strong>{readout.sageTone}</strong>
        </li>
        <li>
          <span>Enemy pressure</span>
          <strong>{readout.enemy}</strong>
        </li>
        <li>
          <span>Customers</span>
          <strong>{readout.customers}</strong>
        </li>
        <li>
          <span>Mind map</span>
          <strong>{readout.mindMap}</strong>
        </li>
        <li>
          <span>Shop prices</span>
          <strong>{readout.shopPrices}</strong>
        </li>
      </ul>
      {status ? <p className="demo-record-status">{status}</p> : null}
    </div>
  );
}

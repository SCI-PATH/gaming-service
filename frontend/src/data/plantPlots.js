/**
 * Designated farm plant beds + loading dock (tile coordinates).
 */

/** @typedef {{ id: string, label: string, x: number, y: number, w: number, h: number }} FarmZone */

/** Fixed tillable beds spaced far apart so the center stays clear for running. */
export const PLANT_PLOTS = [
  { id: 'bed_west', label: 'West Bed', x: 12, y: 22, w: 8, h: 5 },
  { id: 'bed_east', label: 'East Bed', x: 73, y: 22, w: 8, h: 5 },
  { id: 'bed_north_west', label: 'NW Bed', x: 28, y: 8, w: 8, h: 5 },
  { id: 'bed_north_east', label: 'NE Bed', x: 57, y: 8, w: 8, h: 5 },
  { id: 'bed_mid_west', label: 'Mid West Bed', x: 12, y: 38, w: 8, h: 5 },
  { id: 'bed_mid_east', label: 'Mid East Bed', x: 73, y: 38, w: 8, h: 5 },
  { id: 'bed_south_west', label: 'SW Bed', x: 20, y: 53, w: 8, h: 5 },
  { id: 'bed_south_east', label: 'SE Bed', x: 65, y: 53, w: 8, h: 5 },
];

/**
 * @deprecated Load dock removed — unload happens at FARM_SHOP_ZONE.
 * Kept as an alias so older map helpers don't crash.
 */
export const LOADING_ZONE = {
  id: 'load_dock',
  label: 'Farm Shop',
  x: 40,
  y: 28,
  w: 6,
  h: 5,
};

/**
 * Physical Farm Shop — press E here to unload harvest into shop stock.
 * Keep clear of plant beds, animal paddock (y≥43), and cleaning yard.
 */
export const FARM_SHOP_ZONE = {
  id: 'farm_shop',
  label: 'Farm Shop',
  x: 40,
  y: 28,
  w: 6,
  h: 5,
};

export function gridKey(gridX, gridY) {
  return `${gridX},${gridY}`;
}

export function isTileInPlot(gridX, gridY, plot) {
  return (
    gridX >= plot.x &&
    gridX < plot.x + plot.w &&
    gridY >= plot.y &&
    gridY < plot.y + plot.h
  );
}

export function findPlotAt(gridX, gridY) {
  return PLANT_PLOTS.find((plot) => isTileInPlot(gridX, gridY, plot)) ?? null;
}

export function isPlantableTile(gridX, gridY) {
  return Boolean(findPlotAt(gridX, gridY));
}

export function isLoadingTile(gridX, gridY) {
  // Unload is at the Farm Shop stall (no separate blue dock)
  return isTileInPlot(gridX, gridY, FARM_SHOP_ZONE);
}

export function isFarmShopTile(gridX, gridY) {
  return isTileInPlot(gridX, gridY, FARM_SHOP_ZONE);
}

export function loadingZoneCenter(tileSize = 16) {
  return farmShopZoneCenter(tileSize);
}

export function farmShopZoneCenter(tileSize = 16) {
  return {
    x: (FARM_SHOP_ZONE.x + FARM_SHOP_ZONE.w / 2) * tileSize,
    y: (FARM_SHOP_ZONE.y + FARM_SHOP_ZONE.h / 2) * tileSize,
    tileX: FARM_SHOP_ZONE.x + FARM_SHOP_ZONE.w / 2,
    tileY: FARM_SHOP_ZONE.y + FARM_SHOP_ZONE.h / 2,
  };
}

/**
 * Queue on open dirt south of the shop — shifted east so west bushes
 * never clip the front of the line.
 */
export function farmShopQueueSlots(count = 4, tileSize = 16) {
  const z = FARM_SHOP_ZONE;
  const rowY = (z.y + z.h + 3.2) * tileSize;
  const startX = (z.x + 1.8) * tileSize;
  const spacing = tileSize * 2.8;
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    slots.push({
      x: startX + i * spacing,
      y: rowY,
      index: i,
    });
  }
  return slots;
}

export function cellsInPlot(plot, tileSize = 16) {
  const cells = [];
  for (let row = 0; row < plot.h; row += 1) {
    for (let col = 0; col < plot.w; col += 1) {
      const gridX = plot.x + col;
      const gridY = plot.y + row;
      cells.push({
        gridX,
        gridY,
        key: gridKey(gridX, gridY),
        x: gridX * tileSize + tileSize / 2,
        y: gridY * tileSize + tileSize / 2,
        tileOriginX: gridX * tileSize,
        tileOriginY: gridY * tileSize,
        plotId: plot.id,
        patchCol: col,
        patchRow: row,
      });
    }
  }
  return cells;
}

function openCellsInPlot(plot, { occupiedKeys, collidesAt, tileSize = 16 } = {}) {
  const occupied =
    occupiedKeys instanceof Set ? occupiedKeys : new Set(occupiedKeys || []);
  return cellsInPlot(plot, tileSize).filter((cell) => {
    if (occupied.has(cell.key)) return false;
    if (typeof collidesAt === 'function' && collidesAt(cell.gridX, cell.gridY)) {
      return false;
    }
    return true;
  });
}

export function freeCellsInPlotAt(
  originGridX,
  originGridY,
  {
    occupiedKeys,
    collidesAt,
    maxCells = Infinity,
    tileSize = 16,
  } = {},
) {
  const plot = findPlotAt(originGridX, originGridY);
  if (!plot) return [];
  const cells = openCellsInPlot(plot, { occupiedKeys, collidesAt, tileSize });
  return Number.isFinite(maxCells) ? cells.slice(0, maxCells) : cells;
}

/**
 * Spread plants over the whole bed, skipping a few tiles so soil still shows.
 * fillRatio 0.78 → about 4 of every 5 tiles planted.
 */
export function coveringCellsInPlot(
  originGridX,
  originGridY,
  { occupiedKeys, collidesAt, tileSize = 16, fillRatio = 0.78 } = {},
) {
  const plot = findPlotAt(originGridX, originGridY);
  if (!plot) return [];

  const open = openCellsInPlot(plot, { occupiedKeys, collidesAt, tileSize });
  if (open.length === 0) return [];

  const ratio = Math.min(0.92, Math.max(0.62, Number(fillRatio) || 0.78));
  const skipEvery = Math.max(3, Math.round(1 / Math.max(0.08, 1 - ratio)));
  const picked = open.filter(
    (cell) => (cell.patchCol + cell.patchRow * 2) % skipEvery !== 0,
  );

  if (picked.length / open.length >= ratio - 0.08) return picked;

  const target = Math.max(1, Math.round(open.length * ratio));
  const extra = [];
  for (const cell of open) {
    if (picked.includes(cell) || extra.includes(cell)) continue;
    extra.push(cell);
    if (picked.length + extra.length >= target) break;
  }
  return picked.concat(extra);
}

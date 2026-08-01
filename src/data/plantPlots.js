/**
 * Designated farm plant beds (tile coordinates).
 * Planting is only allowed on these plots — not the whole map.
 */

/** @typedef {{ id: string, label: string, x: number, y: number, w: number, h: number }} PlantPlot */

/** Fixed tillable beds spaced far apart so the center stays clear for running. */
export const PLANT_PLOTS = [
  { id: 'bed_west', label: 'West Bed', x: 14, y: 24, w: 5, h: 3 },
  { id: 'bed_east', label: 'East Bed', x: 76, y: 24, w: 5, h: 3 },
  { id: 'bed_south_west', label: 'SW Bed', x: 22, y: 56, w: 5, h: 3 },
  { id: 'bed_south_east', label: 'SE Bed', x: 68, y: 56, w: 5, h: 3 },
];

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

/** Find the plant bed containing a tile, or null. */
export function findPlotAt(gridX, gridY) {
  return PLANT_PLOTS.find((plot) => isTileInPlot(gridX, gridY, plot)) ?? null;
}

export function isPlantableTile(gridX, gridY) {
  return Boolean(findPlotAt(gridX, gridY));
}

/**
 * All tile cells inside a plot (world centers included).
 * @param {PlantPlot} plot
 * @param {number} tileSize
 */
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

/** Free plantable cells in the plot that contains (originX, originY). */
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

  const occupied = occupiedKeys instanceof Set ? occupiedKeys : new Set(occupiedKeys || []);
  const cells = [];

  for (const cell of cellsInPlot(plot, tileSize)) {
    if (occupied.has(cell.key)) continue;
    if (typeof collidesAt === 'function' && collidesAt(cell.gridX, cell.gridY)) {
      continue;
    }
    cells.push(cell);
    if (cells.length >= maxCells) break;
  }
  return cells;
}

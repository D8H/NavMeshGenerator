import { Point, float, integer } from "./CommonTypes";
import { RasterizationCell } from "./RasterizationCell";

export class RasterizationGrid {
  originX: float;
  originY: float;
  cellWidth: float;
  cellHeight: float;
  cells: RasterizationCell[][];
  regionCount: integer = 0;

  public static neighbor4Deltas = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
  ];

  public static neighbor8Deltas = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
  ];

  constructor(
    left: float,
    top: float,
    right: float,
    bottom: float,
    cellWidth: float,
    cellHeight: float
  ) {
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.originX = left - cellWidth;
    this.originY = top - cellHeight;

    const dimX = 2 + Math.ceil((right - left) / cellWidth);
    const dimY = 2 + Math.ceil((bottom - top) / cellHeight);
    this.cells = [];
    for (var y = 0; y < dimY; y++) {
      this.cells[y] = [];

      for (var x = 0; x < dimX; x++) {
        this.cells[y][x] = new RasterizationCell(x, y);
      }
    }
  }

  clear() {
    for (const row of this.cells) {
      for (const cell of row) {
        cell.clear();
      }
    }
    this.regionCount = 0;
  }

  /**
   *
   * @param position the position on the scene
   * @param gridPosition the position on the grid
   * @returns the position on the grid
   */
  convertToGridBasis(position: Point, gridPosition: Point) {
    gridPosition.x = (position.x - this.originX) / this.cellWidth;
    gridPosition.y = (position.y - this.originY) / this.cellHeight;
    return gridPosition;
  }

  /**
   *
   * @param gridPosition the position on the grid
   * @param position the position on the scene
   * @returns the position on the scene
   */
  convertFromGridBasis(gridPosition: Point, position: Point) {
    position.x = gridPosition.x * this.cellWidth + this.originX;
    position.y = gridPosition.y * this.cellHeight + this.originY;
    return position;
  }

  get(x: integer, y: integer) {
    return this.cells[y][x];
  }

  getNeighbor(cell: RasterizationCell, direction: integer) {
    const delta = RasterizationGrid.neighbor8Deltas[direction];
    return this.cells[cell.y + delta.y][cell.x + delta.x];
  }

  dimY() {
    return this.cells.length;
  }

  dimX() {
    const firstColumn = this.cells[0];
    return firstColumn ? firstColumn.length : 0;
  }

  obstacleDistanceMax() {
    let max = 0;
    for (const cellRow of this.cells) {
      for (const cell of cellRow) {
        if (cell.distanceToObstacle > max) {
          max = cell.distanceToObstacle;
        }
      }
    }
    return max;
  }
}

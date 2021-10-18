import { Point, float, integer } from "./CommonTypes";

/**
 * A cell that holds data needed by the 1st steps of the NavMesh generation.
 */
export class RasterizationCell {
  /** A cell that has not been assigned to any region yet */
  static NULL_REGION_ID = 0;
  /**
   * A cell that contains an obstacle.
   *
   * The value is the same as NULL_REGION_ID because the cells that are
   * not assigned to any region at the end of the flooding algorithm are
   * the obstacle cells.
   */
  static OBSTACLE_REGION_ID = 0;

  x: integer;
  y: integer;
  /**
   * 0 means there is an obstacle in the cell.
   * See {@link RegionGenerator}
   */
  distanceToObstacle: integer = Number.MAX_VALUE;
  regionID: integer = RasterizationCell.NULL_REGION_ID;
  distanceToRegionCore: integer = 0;
  /**
   * If a cell is connected to one or more external regions then the
   *  flag will be a 4 bit value where connections are recorded as
   *  follows:
   *  - bit1 = neighbor0
   *  - bit2 = neighbor1
   *  - bit3 = neighbor2
   *  - bit4 = neighbor3
   *  With the meaning of the bits as follows:
   *  - 0 = neighbor in same region.
   *  - 1 = neighbor not in same region (neighbor may be the obstacle
   *    region or a real region).
   *
   * See {@link ContourBuilder}
   */
  contourFlags: integer = 0;

  constructor(x: integer, y: integer) {
    this.x = x;
    this.y = y;
    this.clear();
  }

  clear() {
    this.distanceToObstacle = Number.MAX_VALUE;
    this.regionID = RasterizationCell.NULL_REGION_ID;
    this.distanceToRegionCore = 0;
    this.contourFlags = 0;
  }
}

import { Point, float, integer } from "./CommonTypes";
import { RasterizationGrid } from "./RasterizationGrid";

export class GridCoordinateConverter {
  /**
   *
   * @param gridPosition the position on the grid
   * @param position the position on the scene
   * @param scaleY for isometry
   * @returns the position on the scene
   */
  public convertFromGridBasis(
    grid: RasterizationGrid,
    polygons: Point[][]
  ): Point[][] {
    // point can be shared so them must be copied to be scaled.
    return polygons.map((polygon) =>
      polygon.map((point) => grid.convertFromGridBasis(point, { x: 0, y: 0 }))
    );
  }
}

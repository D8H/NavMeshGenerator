import { Point, float, integer, VertexArray } from "./CommonTypes";
import { ContourBuilder } from "./ContourBuilder";
import { ConvexPolygonGenerator } from "./ConvexPolygonGenerator";
import { GridCoordinateConverter } from "./GridCoordinateConverter";
import { ObstacleRasterizer } from "./ObstacleRasterizer";
import { RasterizationGrid } from "./RasterizationGrid";
import { RegionGenerator } from "./RegionGenerator";

// This implementation is strongly inspired from a Java one
// by Stephen A. Pratt:
// http://www.critterai.org/projects/nmgen_study/
//
// Most of the comments were written by him and were adapted to fit this implementation.
// This implementation differs a bit from the original:
// - it's only 2D instead of 3D
// - it has less features (see TODO) and might have lesser performance
// - it uses objects for points instead of pointer-like in arrays of numbers
// - the rasterization comes from other sources because of the 2d focus
// - partialFloodRegion was rewritten to fix an issue
// - filterNonObstacleVertices was added
//
// The Java implementation was also inspired from Recast that can be found here:
// https://github.com/recastnavigation/recastnavigation

export class NavMeshGenerator {
  static buildNavMesh(
    obstacles: IterableIterator<VertexArray>,
    obstacleCellPadding: integer,
    areaLeftBound: float,
    areaTopBound: float,
    areaRightBound: float,
    areaBottomBound: float,
    rasterizationCellSize: float,
    isometricRatio: float = 1
  ): VertexArray[] {
    const grid = new RasterizationGrid(
      areaLeftBound,
      areaTopBound,
      areaRightBound,
      areaBottomBound,
      rasterizationCellSize,
      // make cells square in the world
      rasterizationCellSize / isometricRatio
    );
    ObstacleRasterizer.rasterizeObstacles(grid, obstacles);
    RegionGenerator.generateDistanceField(grid);
    RegionGenerator.generateRegions(grid, obstacleCellPadding);
    // It's probably not a good idea to expose the vectorization threshold.
    // As stated in the parameter documentation, the value 1 gives good
    // results in any situations.
    const threshold = 1;
    const contours = ContourBuilder.buildContours(grid, threshold);
    const meshField = ConvexPolygonGenerator.splitToConvexPolygons(
      contours,
      16
    );
    const scaledMeshField = GridCoordinateConverter.convertFromGridBasis(
      grid,
      meshField
    );
    if (isometricRatio != 1) {
      // Rescale the mesh to have the same unit length on the 2 axis for the pathfinding.
      scaledMeshField.forEach((polygon) =>
        polygon.forEach((point) => {
          point.y *= isometricRatio;
        })
      );
    }
    return scaledMeshField;
  }
}

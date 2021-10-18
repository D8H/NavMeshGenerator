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
  private grid: RasterizationGrid;
  private isometricRatio: float;
  private obstacleRasterizer: ObstacleRasterizer;
  private regionGenerator: RegionGenerator;
  private contourBuilder: ContourBuilder;
  private convexPolygonGenerator: ConvexPolygonGenerator;
  private gridCoordinateConverter: GridCoordinateConverter;

  constructor(
    areaLeftBound: float,
    areaTopBound: float,
    areaRightBound: float,
    areaBottomBound: float,
    rasterizationCellSize: float,
    isometricRatio: float = 1
  ) {
    this.grid = new RasterizationGrid(
      areaLeftBound,
      areaTopBound,
      areaRightBound,
      areaBottomBound,
      rasterizationCellSize,
      // make cells square in the world
      rasterizationCellSize / isometricRatio
    );
    this.isometricRatio = isometricRatio;
    this.obstacleRasterizer = new ObstacleRasterizer();
    this.regionGenerator = new RegionGenerator();
    this.contourBuilder = new ContourBuilder();
    this.convexPolygonGenerator = new ConvexPolygonGenerator();
    this.gridCoordinateConverter = new GridCoordinateConverter();
  }

  buildNavMesh(
    obstacles: Iterable<Iterable<Point>>,
    obstacleCellPadding: integer
  ): VertexArray[] {
    this.grid.clear();
    this.obstacleRasterizer.rasterizeObstacles(this.grid, obstacles);
    this.regionGenerator.generateDistanceField(this.grid);
    this.regionGenerator.generateRegions(this.grid, obstacleCellPadding);
    // It's probably not a good idea to expose the vectorization threshold.
    // As stated in the parameter documentation, the value 1 gives good
    // results in any situations.
    const threshold = 1;
    const contours = this.contourBuilder.buildContours(this.grid, threshold);
    const meshField = this.convexPolygonGenerator.splitToConvexPolygons(
      contours,
      16
    );
    const scaledMeshField = this.gridCoordinateConverter.convertFromGridBasis(
      this.grid,
      meshField
    );
    if (this.isometricRatio != 1) {
      // Rescale the mesh to have the same unit length on the 2 axis for the pathfinding.
      scaledMeshField.forEach((polygon) =>
        polygon.forEach((point) => {
          point.y *= this.isometricRatio;
        })
      );
    }
    return scaledMeshField;
  }
}

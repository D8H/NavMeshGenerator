import { Point, float, integer, VertexArray } from "./CommonTypes";
import { RasterizationGrid } from "./RasterizationGrid";

/**
 * It rasterizes obstacle objects on a grid.
 * It flags cells as obstacle to be used by {@link RegionGenerator}.
 */
export class ObstacleRasterizer {
  /**
   * Rasterize obstacle objects on a grid.
   * @param grid
   * @param obstacles
   */
  static rasterizeObstacles(
    grid: RasterizationGrid,
    obstacles: IterableIterator<VertexArray>
  ) {
    const workingNodes: number[] = [];
    for (const polygon of obstacles) {
      const vertices = polygon.map((vertex) => {
        const point = { x: 0, y: 0 };
        grid.convertToGridBasis(vertex, point);
        return point;
      });
      let minX = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      for (const vertex of vertices) {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
      minX = Math.max(Math.floor(minX), 0);
      maxX = Math.min(Math.ceil(maxX), grid.dimX());
      minY = Math.max(Math.floor(minY), 0);
      maxY = Math.min(Math.ceil(maxY), grid.dimY());
      ObstacleRasterizer.fillPolygon(
        vertices,
        minX,
        maxX,
        minY,
        maxY,
        workingNodes,
        (x: integer, y: integer) => (grid.get(x, y).distanceToObstacle = 0)
      );
    }
  }

  private static fillPolygon(
    vertices: Point[],
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    workingNodes: number[],
    fill: (x: number, y: number) => void
  ) {
    // The following implementation of the scan-line polygon fill algorithm
    // is strongly inspired from:
    // https://alienryderflex.com/polygon_fill/
    // The original implementation was under this license:
    // public-domain code by Darel Rex Finley, 2007

    // This implementation differ with the following:
    // - it handles float vertices
    //   so it focus on pixels center
    // - it is conservative to thin vertical or horizontal polygons

    let fillAnyPixels = false;
    ObstacleRasterizer.scanY(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
      workingNodes,
      (pixelY: integer, minX: float, maxX: float) => {
        for (let pixelX = minX; pixelX < maxX; pixelX++) {
          fillAnyPixels = true;
          fill(pixelX, pixelY);
        }
      }
    );

    if (fillAnyPixels) {
      return;
    }

    ObstacleRasterizer.scanY(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
      workingNodes,
      (pixelY: integer, minX: float, maxX: float) => {
        // conserve thin (less than one cell large) horizontal polygons
        if (minX === maxX) {
          fill(minX, pixelY);
        }
      }
    );

    ObstacleRasterizer.scanX(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
      workingNodes,
      (pixelX: integer, minY: float, maxY: float) => {
        for (let pixelY = minY; pixelY < maxY; pixelY++) {
          fill(pixelX, pixelY);
        }
        // conserve thin (less than one cell large) vertical polygons
        if (minY === maxY) {
          fill(pixelX, minY);
        }
      }
    );
  }

  private static scanY(
    vertices: Point[],
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    workingNodes: number[],
    checkAndFillY: (pixelY: integer, minX: float, maxX: float) => void
  ) {
    //  Loop through the rows of the image.
    for (let pixelY = minY; pixelY < maxY; pixelY++) {
      const pixelCenterY = pixelY + 0.5;
      //  Build a list of nodes.
      workingNodes.length = 0;
      let j = vertices.length - 1;
      for (let i = 0; i < vertices.length; i++) {
        if (
          (vertices[i].y <= pixelCenterY && pixelCenterY < vertices[j].y) ||
          (vertices[j].y < pixelCenterY && pixelCenterY <= vertices[i].y)
        ) {
          workingNodes.push(
            Math.round(
              vertices[i].x +
                ((pixelCenterY - vertices[i].y) /
                  (vertices[j].y - vertices[i].y)) *
                  (vertices[j].x - vertices[i].x)
            )
          );
        }
        j = i;
      }

      //  Sort the nodes, via a simple “Bubble” sort.
      {
        let i = 0;
        while (i < workingNodes.length - 1) {
          if (workingNodes[i] > workingNodes[i + 1]) {
            const swap = workingNodes[i];
            workingNodes[i] = workingNodes[i + 1];
            workingNodes[i + 1] = swap;
            if (i > 0) i--;
          } else {
            i++;
          }
        }
      }

      //  Fill the pixels between node pairs.
      for (let i = 0; i < workingNodes.length; i += 2) {
        if (workingNodes[i] >= maxX) {
          break;
        }
        if (workingNodes[i + 1] <= minX) {
          continue;
        }
        if (workingNodes[i] < minX) {
          workingNodes[i] = minX;
        }
        if (workingNodes[i + 1] > maxX) {
          workingNodes[i + 1] = maxX;
        }
        checkAndFillY(pixelY, workingNodes[i], workingNodes[i + 1]);
      }
    }
  }

  private static scanX(
    vertices: Point[],
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    workingNodes: number[],
    checkAndFillX: (pixelX: integer, minY: float, maxY: float) => void
  ) {
    //  Loop through the columns of the image.
    for (let pixelX = minX; pixelX < maxX; pixelX++) {
      const pixelCenterX = pixelX + 0.5;
      //  Build a list of nodes.
      workingNodes.length = 0;
      let j = vertices.length - 1;
      for (let i = 0; i < vertices.length; i++) {
        if (
          (vertices[i].x < pixelCenterX && pixelCenterX < vertices[j].x) ||
          (vertices[j].x < pixelCenterX && pixelCenterX < vertices[i].x)
        ) {
          workingNodes.push(
            Math.round(
              vertices[i].y +
                ((pixelCenterX - vertices[i].x) /
                  (vertices[j].x - vertices[i].x)) *
                  (vertices[j].y - vertices[i].y)
            )
          );
        }
        j = i;
      }

      //  Sort the nodes, via a simple “Bubble” sort.
      {
        let i = 0;
        while (i < workingNodes.length - 1) {
          if (workingNodes[i] > workingNodes[i + 1]) {
            const swap = workingNodes[i];
            workingNodes[i] = workingNodes[i + 1];
            workingNodes[i + 1] = swap;
            if (i > 0) i--;
          } else {
            i++;
          }
        }
      }

      //  Fill the pixels between node pairs.
      for (let i = 0; i < workingNodes.length; i += 2) {
        if (workingNodes[i] >= maxY) {
          break;
        }
        if (workingNodes[i + 1] <= minY) {
          continue;
        }
        if (workingNodes[i] < minY) {
          workingNodes[i] = minY;
        }
        if (workingNodes[i + 1] > maxY) {
          workingNodes[i + 1] = maxY;
        }
        checkAndFillX(pixelX, workingNodes[i], workingNodes[i + 1]);
      }
    }
  }
}

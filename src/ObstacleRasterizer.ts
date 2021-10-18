import { Point, float, integer, VertexArray } from "./CommonTypes";
import { RasterizationGrid } from "./RasterizationGrid";

/**
 * It rasterizes obstacles on a grid.
 *
 * It flags cells as obstacle to be used by {@link RegionGenerator}.
 */
export class ObstacleRasterizer {
  workingNodes: integer[];
  gridBasisIterable: GridBasisIterable;

  constructor() {
    this.workingNodes = new Array<integer>(8);
    this.gridBasisIterable = new GridBasisIterable();
  }

  /**
   * Rasterize obstacles on a grid.
   * @param grid
   * @param obstacles
   */
  rasterizeObstacles(
    grid: RasterizationGrid,
    obstacles: Iterable<Iterable<Point>>
  ) {
    const obstaclesItr = obstacles[Symbol.iterator]();
    for (
      let next = obstaclesItr.next();
      !next.done;
      next = obstaclesItr.next()
    ) {
      const obstacle = next.value;
      this.gridBasisIterable.set(grid, obstacle);
      const vertices = this.gridBasisIterable;

      let minX = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      const verticesItr = vertices[Symbol.iterator]();
      for (
        let next = verticesItr.next();
        !next.done;
        next = verticesItr.next()
      ) {
        const vertex = next.value;
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
      minX = Math.max(Math.floor(minX), 0);
      maxX = Math.min(Math.ceil(maxX), grid.dimX());
      minY = Math.max(Math.floor(minY), 0);
      maxY = Math.min(Math.ceil(maxY), grid.dimY());
      this.fillPolygon(
        vertices,
        minX,
        maxX,
        minY,
        maxY,
        (x: integer, y: integer) => (grid.get(x, y).distanceToObstacle = 0)
      );
    }
  }

  private fillPolygon(
    vertices: Iterable<Point>,
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
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
    this.scanY(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
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

    this.scanY(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
      (pixelY: integer, minX: float, maxX: float) => {
        // conserve thin (less than one cell large) horizontal polygons
        if (minX === maxX) {
          fill(minX, pixelY);
        }
      }
    );

    this.scanX(
      vertices,
      minX,
      maxX,
      minY,
      maxY,
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

  private scanY(
    vertices: Iterable<Point>,
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    checkAndFillY: (pixelY: integer, minX: float, maxX: float) => void
  ) {
    const workingNodes = this.workingNodes;
    //  Loop through the rows of the image.
    for (let pixelY = minY; pixelY < maxY; pixelY++) {
      const pixelCenterY = pixelY + 0.5;
      //  Build a list of nodes.
      workingNodes.length = 0;
      //let j = vertices.length - 1;

      const verticesItr = vertices[Symbol.iterator]();
      let next = verticesItr.next();
      let vertex = next.value;
      // The iterator always return the same instance.
      // It must be copied to be save for later.
      const firstVertexX = vertex.x;
      const firstVertexY = vertex.y;
      while (!next.done) {
        const previousVertexX = vertex.x;
        const previousVertexY = vertex.y;
        next = verticesItr.next();
        if (next.done) {
          vertex.x = firstVertexX;
          vertex.y = firstVertexY;
        } else {
          vertex = next.value;
        }
        if (
          (vertex.y <= pixelCenterY && pixelCenterY < previousVertexY) ||
          (previousVertexY < pixelCenterY && pixelCenterY <= vertex.y)
        ) {
          workingNodes.push(
            Math.round(
              vertex.x +
                ((pixelCenterY - vertex.y) / (previousVertexY - vertex.y)) *
                  (previousVertexX - vertex.x)
            )
          );
        }
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

  private scanX(
    vertices: Iterable<Point>,
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    checkAndFillX: (pixelX: integer, minY: float, maxY: float) => void
  ) {
    const workingNodes = this.workingNodes;
    //  Loop through the columns of the image.
    for (let pixelX = minX; pixelX < maxX; pixelX++) {
      const pixelCenterX = pixelX + 0.5;
      //  Build a list of nodes.
      workingNodes.length = 0;

      const verticesItr = vertices[Symbol.iterator]();
      let next = verticesItr.next();
      let vertex = next.value;
      // The iterator always return the same instance.
      // It must be copied to be save for later.
      const firstVertexX = vertex.x;
      const firstVertexY = vertex.y;
      while (!next.done) {
        const previousVertexX = vertex.x;
        const previousVertexY = vertex.y;
        next = verticesItr.next();
        if (next.done) {
          vertex.x = firstVertexX;
          vertex.y = firstVertexY;
        } else {
          vertex = next.value;
        }
        if (
          (vertex.x < pixelCenterX && pixelCenterX < previousVertexX) ||
          (previousVertexX < pixelCenterX && pixelCenterX < vertex.x)
        ) {
          workingNodes.push(
            Math.round(
              vertex.y +
                ((pixelCenterX - vertex.x) / (previousVertexX - vertex.x)) *
                  (previousVertexY - vertex.y)
            )
          );
        }
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

/**
 * Iterable that converts coordinates to the grid.
 *
 * This is an allocation free iterable
 * that can only do one iteration at a time.
 */
class GridBasisIterable implements Iterable<Point> {
  grid: RasterizationGrid | null;
  sceneVertices: Iterable<Point>;
  verticesItr: Iterator<Point>;
  result: IteratorResult<Point, any>;

  constructor() {
    this.grid = null;
    this.sceneVertices = [];
    this.verticesItr = this.sceneVertices[Symbol.iterator]();
    this.result = {
      value: { x: 0, y: 0 },
      done: false,
    };
  }

  set(grid: RasterizationGrid, sceneVertices: Iterable<Point>) {
    this.grid = grid;
    this.sceneVertices = sceneVertices;
  }

  [Symbol.iterator]() {
    this.verticesItr = this.sceneVertices[Symbol.iterator]();
    return this;
  }

  next() {
    const next = this.verticesItr.next();
    if (next.done) {
      return next;
    }
    this.grid!.convertToGridBasis(next.value, this.result.value);
    return this.result;
  }
}

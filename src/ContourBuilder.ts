import { Point, float, integer } from "./CommonTypes";
import { ContourPoint } from "./ContourPoint";
import { Geometry } from "./Geometry";
import { RasterizationCell } from "./RasterizationCell";
import { RasterizationGrid } from "./RasterizationGrid";

/**
 * Builds a set of contours from the region information contained in
 * {@link RasterizationCell}. It does this by locating and "walking" the edges.
 *
 * This implementation is strongly inspired from CritterAI class "ContourSetBuilder".
 * http://www.critterai.org/projects/nmgen_study/contourgen.html
 */
export class ContourBuilder {
  private workingRawVertices: ContourPoint[];
  private workingSimplifiedVertices: ContourPoint[];

  constructor() {
    // These are working lists whose content changes with each iteration
    // of the up coming loop. They represent the detailed and simple
    // contour vertices.
    // Initial sizing is arbitrary.
    this.workingRawVertices = new Array<ContourPoint>(256);
    this.workingSimplifiedVertices = new Array<ContourPoint>(64);
  }

  /**
   * Generates a contour set from the provided {@link RasterizationGrid}
   *
   * The provided field is expected to contain region information.
   * Behavior is undefined if the provided field is malformed or incomplete.
   *
   * This operation overwrites the flag fields for all cells in the
   * provided field. So the flags must be saved and restored if they are
   * important.
   *
   * @param grid A fully generated field.
   * @param threshold The maximum distance (in cells) the edge of the contour
   * may deviate from the source geometry when the rastered obstacles are
   * vectorized.
   *
   * Setting it to:
   * - 1 ensure that an aliased edge won't be split to more edges.
   * - more that 1 will reduce the number of edges but the obstacles edges
   *   will be followed with less accuracy.
   * - less that 1 might be more accurate but it may try to follow the
   *   aliasing and be a lot less accurate.
   *
   * Values under 1 can be useful in specific cases:
   * - when edges are horizontal or vertical, there is no aliasing so value
   *   near 0 can do better results.
   * - when edges are 45° multiples, aliased vertex won't be farther than
   *   sqrt(2)/2 so values over 0.71 should give good results but not
   *   necessarily better than 1.
   *
   * @return The contours generated from the field.
   */
  buildContours(grid: RasterizationGrid, threshold: float): ContourPoint[][] {
    const contours = new Array<ContourPoint[]>(grid.regionCount);
    contours.length = 0;
    const contoursByRegion = new Array<ContourPoint[]>(grid.regionCount);

    let discardedContours = 0;

    //  Set the flags on all cells in non-obstacle regions to indicate which
    //  edges are connected to external regions.
    //
    //  Reference: Neighbor search and nomenclature.
    //  http://www.critterai.org/projects/nmgen_study/heightfields.html#nsearch
    //
    //  If a cell has no connections to external regions or is
    //  completely surrounded by other regions (a single cell island),
    //  its flag will be zero.
    //
    //  If a cell is connected to one or more external regions then the
    //  flag will be a 4 bit value where connections are recorded as
    //  follows:
    //      bit1 = neighbor0
    //      bit2 = neighbor1
    //      bit3 = neighbor2
    //      bit4 = neighbor3
    //  With the meaning of the bits as follows:
    //      0 = neighbor in same region.
    //      1 = neighbor not in same region (neighbor may be the obstacle
    //      region or a real region).
    for (let y = 1; y < grid.dimY() - 1; y++) {
      for (let x = 1; x < grid.dimX() - 1; x++) {
        const cell = grid.get(x, y);

        // Note:  This algorithm first sets the flag bits such that
        // 1 = "neighbor is in the same region". At the end it inverts
        // the bits so flags are as expected.

        // Default to "not connected to any external region".
        cell.contourFlags = 0;
        if (cell.regionID === RasterizationCell.OBSTACLE_REGION_ID)
          // Don't care about cells in the obstacle region.
          continue;

        for (
          let direction = 0;
          direction < RasterizationGrid.neighbor4Deltas.length;
          direction++
        ) {
          const delta = RasterizationGrid.neighbor4Deltas[direction];

          const neighbor = grid.get(cell.x + delta.x, cell.y + delta.y);
          if (cell.regionID === neighbor.regionID) {
            // Neighbor is in same region as this cell.
            // Set the bit for this neighbor to 1 (Will be inverted later).
            cell.contourFlags |= 1 << direction;
          }
        }
        // Invert the bits so a bit value of 1 indicates neighbor NOT in
        // same region.
        cell.contourFlags ^= 0xf;
        if (cell.contourFlags === 0xf) {
          // This is an island cell (All neighbors are from other regions)
          // Get rid of flags.
          cell.contourFlags = 0;
          console.warn(
            "Discarded contour: Island cell. Can't form  a contour. Region: " +
              cell.regionID
          );
          discardedContours++;
        }
      }
    }

    // Loop through all cells looking for cells on the edge of a region.
    //
    // At this point, only cells with flags != 0 are edge cells that
    // are part of a region contour.
    //
    // The process of building a contour will clear the flags on all cells
    // that make up the contour to ensure they are only processed once.
    for (let y = 1; y < grid.dimY() - 1; y++) {
      for (let x = 1; x < grid.dimX() - 1; x++) {
        const cell = grid.get(x, y);

        if (
          cell.regionID === RasterizationCell.OBSTACLE_REGION_ID ||
          cell.contourFlags === 0
        ) {
          // cell is either: Part of the obstacle region, does not
          // represent an edge cell, or was already processed during
          // an earlier iteration.
          continue;
        }

        this.workingRawVertices.length = 0;
        this.workingSimplifiedVertices.length = 0;

        // The cell is part of an unprocessed region's contour.
        // Locate a direction of the cell's edge which points toward
        // another region (there is at least one).
        let startDirection = 0;
        while ((cell.contourFlags & (1 << startDirection)) === 0) {
          startDirection++;
        }
        // We now have a cell that is part of a contour and a direction
        // that points to a different region (obstacle or real).
        // Build the contour.
        this.buildRawContours(
          grid,
          cell,
          startDirection,
          this.workingRawVertices
        );
        // Perform post processing on the contour in order to
        // create the final, simplified contour.
        this.generateSimplifiedContour(
          cell.regionID,
          this.workingRawVertices,
          this.workingSimplifiedVertices,
          threshold
        );

        // The CritterAI implementation filters polygons with less than
        // 3 vertices, but they are needed to filter vertices in the middle
        // (not on an obstacle region border).
        const contour = Array.from(this.workingSimplifiedVertices);
        contours.push(contour);
        contoursByRegion[cell.regionID] = contour;
      }
    }

    if (contours.length + discardedContours !== grid.regionCount - 1) {
      // The only valid state is one contour per region.
      //
      // The only time this should occur is if an invalid contour
      // was formed or if a region resulted in multiple
      // contours (bad region data).
      //
      // IMPORTANT: While a mismatch may not be a fatal error,
      // it should be addressed since it can result in odd,
      // hard to spot anomalies later in the pipeline.
      //
      // A known cause is if a region fully encompasses another
      // region. In such a case, two contours will be formed.
      // The normal outer contour and an inner contour.
      // The CleanNullRegionBorders algorithm protects
      // against internal encompassed obstacle regions.
      console.error(
        "Contour generation failed: Detected contours does" +
          " not match the number of regions. Regions: " +
          (grid.regionCount - 1) +
          ", Detected contours: " +
          (contours.length + discardedContours) +
          " (Actual: " +
          contours.length +
          ", Discarded: " +
          discardedContours +
          ")"
      );
      // The CritterAI implementation has more detailed logs.
      // They can be interesting for debugging.
    }

    this.filterNonObstacleVertices(contours, contoursByRegion);

    return contours;
  }

  /**
   * Search vertices that are not shared with the obstacle region and
   * remove them.
   *
   * Some contours will have no vertex left.
   *
   * @param contours
   * @param contoursByRegion Some regions may have been discarded
   * so contours index can't be used.
   */
  private filterNonObstacleVertices(
    contours: Array<ContourPoint[]>,
    contoursByRegion: Array<ContourPoint[]>
  ): void {
    // This was not part of the CritterAI implementation.

    // The removed vertex is merged on the nearest of the edges other extremity
    // that is on an obstacle border.
    const commonVertexContours = new Array<ContourPoint[]>(5);
    const commonVertexIndexes = new Array<integer>(5);
    // Each pass only filter vertex that have an edge other extremity on an obstacle.
    // Vertex depth (in number of edges to reach an obstacle) is reduces by
    // at least one by each pass.
    let movedAnyVertex = false;
    do {
      movedAnyVertex = false;
      for (const contour of contours) {
        for (let vertexIndex = 0; vertexIndex < contour.length; vertexIndex++) {
          const vertex = contour[vertexIndex];
          const nextVertex = contour[(vertexIndex + 1) % contour.length];
          if (
            vertex.region !== RasterizationCell.OBSTACLE_REGION_ID &&
            nextVertex.region !== RasterizationCell.OBSTACLE_REGION_ID
          ) {
            // This is a vertex in the middle. It must be removed.

            // Search the contours around the vertex.
            //
            // Typically a contour point to its neighbor and it form a cycle.
            //
            //   \ C /
            //    \ /
            //  A  |  B
            //     |
            //
            // C -> B -> A -> C
            //
            // There can be more than 3 contours even if it's rare.
            commonVertexContours.length = 0;
            commonVertexIndexes.length = 0;
            commonVertexContours.push(contour);
            commonVertexIndexes.push(vertexIndex);
            let errorFound = false;
            let commonVertex = vertex;
            do {
              const neighborContour = contoursByRegion[commonVertex.region];
              if (!neighborContour) {
                errorFound = true;
                if (
                  commonVertex.region !== RasterizationCell.OBSTACLE_REGION_ID
                ) {
                  console.warn(
                    "contour already discarded: " + commonVertex.region
                  );
                }
                break;
              }

              let foundVertex = false;
              for (
                let neighborVertexIndex = 0;
                neighborVertexIndex < neighborContour.length;
                neighborVertexIndex++
              ) {
                const neighborVertex = neighborContour[neighborVertexIndex];
                if (
                  neighborVertex.x === commonVertex.x &&
                  neighborVertex.y === commonVertex.y
                ) {
                  commonVertexContours.push(neighborContour);
                  commonVertexIndexes.push(neighborVertexIndex);
                  commonVertex = neighborVertex;
                  foundVertex = true;
                  break;
                }
              }
              if (!foundVertex) {
                errorFound = true;
                console.error(
                  "Can't find a common vertex with a neighbor contour. There is probably a superposition."
                );
                break;
              }
            } while (commonVertex !== vertex);
            if (errorFound) {
              continue;
            }
            if (commonVertexContours.length < 3) {
              console.error(
                `The vertex is shared by only ${commonVertexContours.length} regions.`
              );
            }

            let shorterEdgeContourIndex = -1;
            let edgeLengthMin = Number.MAX_VALUE;
            for (let index = 0; index < commonVertexContours.length; index++) {
              const vertexContour = commonVertexContours[index];
              const vertexIndex = commonVertexIndexes[index];

              const previousVertex =
                vertexContour[
                  (vertexIndex - 1 + vertexContour.length) %
                    vertexContour.length
                ];
              if (
                previousVertex.region === RasterizationCell.OBSTACLE_REGION_ID
              ) {
                const deltaX = previousVertex.x - vertex.x;
                const deltaY = previousVertex.y - vertex.y;
                const lengthSq = deltaX * deltaX + deltaY * deltaY;
                if (lengthSq < edgeLengthMin) {
                  edgeLengthMin = lengthSq;

                  shorterEdgeContourIndex = index;
                }
              }
            }
            if (shorterEdgeContourIndex === -1) {
              // A vertex has no neighbor on an obstacle.
              // It will be solved in next iterations.
              continue;
            }

            // Merge the vertex on the other extremity of the smallest of the 3 edges.
            //
            //   \ C /
            //    \ /
            //  A  |  B
            //     |
            //
            // - the shortest edge is between A and B
            // - the Y will become a V
            // - vertices are store clockwise
            // - there can be more than one C (it's rare)

            // This is B
            const shorterEdgeContour =
              commonVertexContours[shorterEdgeContourIndex];
            const shorterEdgeVertexIndex =
              commonVertexIndexes[shorterEdgeContourIndex];

            const shorterEdgeExtremityVertex =
              shorterEdgeContour[
                (shorterEdgeVertexIndex - 1 + shorterEdgeContour.length) %
                  shorterEdgeContour.length
              ];

            // This is A
            const shorterEdgeOtherContourIndex =
              (shorterEdgeContourIndex + 1) % commonVertexContours.length;
            const shorterEdgeOtherContour =
              commonVertexContours[shorterEdgeOtherContourIndex];
            const shorterEdgeOtherVertexIndex =
              commonVertexIndexes[shorterEdgeOtherContourIndex];

            for (let index = 0; index < commonVertexContours.length; index++) {
              if (
                index === shorterEdgeContourIndex ||
                index === shorterEdgeOtherContourIndex
              ) {
                continue;
              }
              // These are C
              const commonVertexContour = commonVertexContours[index];
              const commonVertexIndex = commonVertexIndexes[index];

              // Move the vertex to an obstacle border
              const movedVertex = commonVertexContour[commonVertexIndex];
              movedVertex.x = shorterEdgeExtremityVertex.x;
              movedVertex.y = shorterEdgeExtremityVertex.y;
              movedVertex.region = RasterizationCell.NULL_REGION_ID;
            }

            // There is no more border between A and B,
            // update the region from B to C.
            shorterEdgeOtherContour[
              (shorterEdgeOtherVertexIndex + 1) % shorterEdgeOtherContour.length
            ].region =
              shorterEdgeOtherContour[shorterEdgeOtherVertexIndex].region;

            // Remove in A and B the vertex that's been move in C.
            shorterEdgeContour.splice(shorterEdgeVertexIndex, 1);
            shorterEdgeOtherContour.splice(shorterEdgeOtherVertexIndex, 1);

            movedAnyVertex = true;
          }
        }
      }
    } while (movedAnyVertex);

    // Clean the polygons from identical vertices.
    //
    // This can happen with 2 vertices regions.
    // 2 edges are superposed and there extremity is the same.
    // One is move over the other.
    // I could observe this with a region between 2 regions
    // where one of one of these 2 regions were also encompassed.
    // A bit like a rainbow, 2 big regions: the land, the sky
    // and 2 regions for the colors.
    //
    // The vertex can't be removed during the process because
    // they hold data used by other merging.
    //
    // Some contour will have no vertex left.
    // It more efficient to let the next step ignore them.
    for (const contour of contours) {
      for (let vertexIndex = 0; vertexIndex < contour.length; vertexIndex++) {
        const vertex = contour[vertexIndex];
        const nextVertexIndex = (vertexIndex + 1) % contour.length;
        const nextVertex = contour[nextVertexIndex];
        if (vertex.x === nextVertex.x && vertex.y === nextVertex.y) {
          contour.splice(nextVertexIndex, 1);
          vertexIndex--;
        }
      }
    }
  }

  private static leftVertexOfFacingCellBorderDeltas = [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ];

  /**
   * Walk around the edge of this cell's region gathering vertices that
   * represent the corners of each cell on the sides that are external facing.
   *
   * There will be two or three vertices for each edge cell:
   * Two for cells that don't represent a change in edge direction. Three
   * for cells that represent a change in edge direction.
   *
   * The output array will contain vertices ordered as follows:
   * (x, y, z, regionID) where regionID is the region (obstacle or real) that
   * this vertex is considered to be connected to.
   *
   * WARNING: Only run this operation on cells that are already known
   * to be on a region edge. The direction must also be pointing to a
   * valid edge. Otherwise behavior will be undefined.
   *
   * @param grid the grid of cells
   * @param startCell A cell that is known to be on the edge of a region
   * (part of a region contour).
   * @param startDirection The direction of the edge of the cell that is
   * known to point
   * across the region edge.
   * @param outContourVertices The list of vertices that represent the edge
   * of the region.
   */
  private buildRawContours(
    grid: RasterizationGrid,
    startCell: RasterizationCell,
    startDirection: number,
    outContourVertices: ContourPoint[]
  ) {
    // Flaw in Algorithm:
    //
    // This method of contour generation can result in an inappropriate
    // impassable seam between two adjacent regions in the following case:
    //
    // 1. One region connects to another region on two sides in an
    // uninterrupted manner (visualize one region wrapping in an L
    // shape around the corner of another).
    // 2. At the corner shared by the two regions, a change in height
    // occurs.
    //
    // In this case, the two regions should share a corner vertex
    // (an obtuse corner vertex for one region and an acute corner
    // vertex for the other region).
    //
    // In reality, though this algorithm will select the same (x, z)
    // coordinates for each region's corner vertex, the vertex heights
    // may differ, eventually resulting in an impassable seam.

    // It is a bit hard to describe the stepping portion of this algorithm.
    // One way to visualize it is to think of a robot sitting on the
    // floor facing a known wall. It then does the following to skirt
    // the wall:
    // 1. If there is a wall in front of it, turn clockwise in 90 degrees
    //    increments until it finds the wall is gone.
    // 2. Move forward one step.
    // 3. Turn counter-clockwise by 90 degrees.
    // 4. Repeat from step 1 until it finds itself at its original
    //    location facing its original direction.
    //
    // See also: http://www.critterai.org/projects/nmgen_study/contourgen.html#robotwalk

    let cell = startCell;
    let direction = startDirection;

    let loopCount = 0;
    do {
      // Note: The design of this loop is such that the cell variable
      // will always reference an edge cell from the same region as
      // the start cell.

      if ((cell.contourFlags & (1 << direction)) !== 0) {
        // The current direction is pointing toward an edge.
        // Get this edge's vertex.
        const delta =
          ContourBuilder.leftVertexOfFacingCellBorderDeltas[direction];

        const neighbor = grid.get(
          cell.x + RasterizationGrid.neighbor4Deltas[direction].x,
          cell.y + RasterizationGrid.neighbor4Deltas[direction].y
        );
        outContourVertices.push({
          x: cell.x + delta.x,
          y: cell.y + delta.y,
          region: neighbor.regionID,
        });

        // Remove the flag for this edge. We never need to consider
        // it again since we have a vertex for this edge.
        cell.contourFlags &= ~(1 << direction);
        // Rotate in clockwise direction.
        direction = (direction + 1) & 0x3;
      } else {
        // The current direction does not point to an edge. So it
        // must point to a neighbor cell in the same region as the
        // current cell. Move to the neighbor and swing the search
        // direction back one increment (counterclockwise).
        // By moving the direction back one increment we guarantee we
        // don't miss any edges.
        const neighbor = grid.get(
          cell.x + RasterizationGrid.neighbor4Deltas[direction].x,
          cell.y + RasterizationGrid.neighbor4Deltas[direction].y
        );
        cell = neighbor;

        direction = (direction + 3) & 0x3; // Rotate counterclockwise.
      }

      // The loop limit is arbitrary. It exists only to guarantee that
      // bad input data doesn't result in an infinite loop.
      // The only down side of this loop limit is that it limits the
      // number of detectable edge vertices (the longer the region edge
      // and the higher the number of "turns" in a region's edge, the less
      // edge vertices can be detected for that region).
    } while (
      !(cell === startCell && direction === startDirection) &&
      ++loopCount < 65535
    );
    return outContourVertices;
  }

  /**
   * Takes a group of vertices that represent a region contour and changes
   * it in the following manner:
   * - For any edges that connect to non-obstacle regions, remove all
   * vertices except the start and end vertices for that edge (this
   * smooths the edges between non-obstacle regions into a straight line).
   * - Runs an algorithm's against the contour to follow the edge more closely.
   *
   * @param regionID The region the contour was derived from.
   * @param sourceVertices  The source vertices that represent the complex
   * contour.
   * @param outVertices The simplified contour vertices.
   * @param threshold The maximum distance the edge of the contour may deviate
   * from the source geometry.
   */
  private generateSimplifiedContour(
    regionID: number,
    sourceVertices: ContourPoint[],
    outVertices: ContourPoint[],
    threshold: float
  ) {
    let noConnections = true;
    for (const sourceVertex of sourceVertices) {
      if (sourceVertex.region !== RasterizationCell.OBSTACLE_REGION_ID) {
        noConnections = false;
        break;
      }
    }

    // Seed the simplified contour with the mandatory edges
    // (At least one edge).
    if (noConnections) {
      // This contour represents an island region surrounded only by the
      // obstacle region. Seed the simplified contour with the source's
      // lower left (ll) and upper right (ur) vertices.
      let lowerLeftX = sourceVertices[0].x;
      let lowerLeftY = sourceVertices[0].y;
      let lowerLeftIndex = 0;
      let upperRightX = sourceVertices[0].x;
      let upperRightY = sourceVertices[0].y;
      let upperRightIndex = 0;
      for (let index = 0; index < sourceVertices.length; index++) {
        const sourceVertex = sourceVertices[index];
        const x = sourceVertex.x;
        const y = sourceVertex.y;

        if (x < lowerLeftX || (x === lowerLeftX && y < lowerLeftY)) {
          lowerLeftX = x;
          lowerLeftY = y;
          lowerLeftIndex = index;
        }
        if (x >= upperRightX || (x === upperRightX && y > upperRightY)) {
          upperRightX = x;
          upperRightY = y;
          upperRightIndex = index;
        }
      }
      // The region attribute is used to store an index locally in this function.
      // TODO Maybe there is a way to do this cleanly and keep no memory footprint.

      // Seed the simplified contour with this edge.
      outVertices.push({
        x: lowerLeftX,
        y: lowerLeftY,
        region: lowerLeftIndex,
      });
      outVertices.push({
        x: upperRightX,
        y: upperRightY,
        region: upperRightIndex,
      });
    } else {
      // The contour shares edges with other non-obstacle regions.
      // Seed the simplified contour with a new vertex for every
      // location where the region connection changes. These are
      // vertices that are important because they represent portals
      // to other regions.
      for (let index = 0; index < sourceVertices.length; index++) {
        const sourceVert = sourceVertices[index];

        if (
          sourceVert.region !==
          sourceVertices[(index + 1) % sourceVertices.length].region
        ) {
          // The current vertex has a different region than the
          // next vertex. So there is a change in vertex region.
          outVertices.push({
            x: sourceVert.x,
            y: sourceVert.y,
            region: index,
          });
        }
      }
    }

    this.matchObstacleRegionEdges(sourceVertices, outVertices, threshold);

    if (outVertices.length < 2) {
      // It will be ignored by the triangulation.
      // It should be rare enough not to handle it now.
      console.warn(
        "A region is encompassed in another region. It will be ignored."
      );
    }
    // There can be polygons with only 2 vertices when a region is between
    // 2 non-obstacles regions. It's still a useful information to filter
    // vertices in the middle (not on an obstacle region border).
    // In this case, the CritterAI implementation adds a 3rd point to avoid
    // invisible polygons, but it makes it difficult to filter it later.

    // Replace the index pointers in the output list with region IDs.
    for (const outVertex of outVertices) {
      outVertex.region = sourceVertices[outVertex.region].region;
    }
  }

  /**
   * Applies an algorithm to contours which results in obstacle-region edges
   * following the original detail source geometry edge more closely.
   * http://www.critterai.org/projects/nmgen_study/contourgen.html#nulledgesimple
   *
   * Adds vertices from the source list to the result list such that
   * if any obstacle region vertices are compared against the result list,
   * none of the vertices will be further from the obstacle region edges than
   * the allowed threshold.
   *
   * Only obstacle-region edges are operated on. All other edges are
   * ignored.
   *
   * The result vertices is expected to be seeded with at least two
   * source vertices.
   *
   * @param sourceVertices
   * @param inoutResultVertices
   * @param threshold The maximum distance the edge of the contour may deviate
   * from the source geometry.
   */
  private matchObstacleRegionEdges(
    sourceVertices: ContourPoint[],
    inoutResultVertices: ContourPoint[],
    threshold: float
  ) {
    // This implementation is strongly inspired from CritterAI class "MatchNullRegionEdges".

    // Loop through all edges in this contour.
    //
    // NOTE: The simplifiedVertCount in the loop condition
    // increases over iterations. That is what keeps the loop going beyond
    // the initial vertex count.
    let resultIndexA = 0;
    while (resultIndexA < inoutResultVertices.length) {
      const resultIndexB = (resultIndexA + 1) % inoutResultVertices.length;

      // The line segment's beginning vertex.
      const ax = inoutResultVertices[resultIndexA].x;
      const az = inoutResultVertices[resultIndexA].y;
      const sourceIndexA = inoutResultVertices[resultIndexA].region;

      // The line segment's ending vertex.
      const bx = inoutResultVertices[resultIndexB].x;
      const bz = inoutResultVertices[resultIndexB].y;
      const sourceIndexB = inoutResultVertices[resultIndexB].region;

      // The source index of the next vertex to test (the vertex just
      // after the current vertex in the source vertex list).
      let testedSourceIndex = (sourceIndexA + 1) % sourceVertices.length;
      let maxDeviation = 0;

      // Default to no index. No new vert to add.
      let toInsertSourceIndex = -1;

      if (
        sourceVertices[testedSourceIndex].region ===
        RasterizationCell.OBSTACLE_REGION_ID
      ) {
        // This test vertex is part of a obstacle region edge.
        // Loop through the source vertices until the end vertex
        // is found, searching for the vertex that is farthest from
        // the line segment formed by the begin/end vertices.
        //
        // Visualizations:
        // http://www.critterai.org/projects/nmgen_study/contourgen.html#nulledgesimple
        while (testedSourceIndex !== sourceIndexB) {
          const deviation = Geometry.getPointSegmentDistanceSq(
            sourceVertices[testedSourceIndex].x,
            sourceVertices[testedSourceIndex].y,
            ax,
            az,
            bx,
            bz
          );
          if (deviation > maxDeviation) {
            // A new maximum deviation was detected.
            maxDeviation = deviation;
            toInsertSourceIndex = testedSourceIndex;
          }
          // Move to the next vertex.
          testedSourceIndex = (testedSourceIndex + 1) % sourceVertices.length;
        }
      }

      if (toInsertSourceIndex !== -1 && maxDeviation > threshold * threshold) {
        // A vertex was found that is further than allowed from the
        // current edge. Add this vertex to the contour.
        inoutResultVertices.splice(resultIndexA + 1, 0, {
          x: sourceVertices[toInsertSourceIndex].x,
          y: sourceVertices[toInsertSourceIndex].y,
          region: toInsertSourceIndex,
        });
        // Not incrementing the vertex since we need to test the edge
        // formed by vertA  and this this new vertex on the next
        // iteration of the loop.
      }
      // This edge segment does not need to be altered. Move to
      // the next vertex.
      else resultIndexA++;
    }
  }
}

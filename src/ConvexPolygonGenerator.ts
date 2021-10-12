import { Point, float, integer } from "./CommonTypes";
import { Geometry } from "./Geometry";

/**
 * Result of {@link ConvexPolygonGenerator.getPolyMergeInfo}
 *
 * A value of -1 at lengthSq indicates one of the following:
 * - The polygons cannot be merged because they would contain too
 * many vertices.
 * - The polygons do not have a shared edge.
 * - Merging the polygons would result in a concave polygon.
 */
type PolyMergeResult = {
  /** The lengthSq of the edge shared between the polygons.*/
  lengthSq: integer;
  /** The index of the start of the shared edge in polygon A. */
  polygonAVertexIndex: integer;
  /** The index of the start of the shared edge in polygon B. */
  polygonBVertexIndex: integer;
};

/**
 * Builds convex polygons from the provided polygons.
 *
 * This implementation is strongly inspired from CritterAI class "PolyMeshFieldBuilder".
 * http://www.critterai.org/projects/nmgen_study/polygen.html
 */
export class ConvexPolygonGenerator {
  /**
   * Builds convex polygons from the provided polygons.
   * @param concavePolygons The content is manipulated during the operation
   * and it will be left in an undefined state at the end of
   * the operation.
   * @param maxVerticesPerPolygon cap the vertex number in return polygons.
   * @return convex polygons.
   */
  public splitToConvexPolygons(
    concavePolygons: Point[][],
    maxVerticesPerPolygon: integer
  ): Point[][] {
    // The maximum possible number of polygons assuming that all will
    // be triangles.
    let maxPossiblePolygons = 0;
    // The maximum vertices found in a single contour.
    let maxVerticesPerContour = 0;
    for (const contour of concavePolygons) {
      const count = contour.length;
      maxPossiblePolygons += count - 2;
      maxVerticesPerContour = Math.max(maxVerticesPerContour, count);
    }

    // Each list is initialized to a size that will minimize resizing.

    const convexPolygons = new Array<Point[]>(maxPossiblePolygons);
    convexPolygons.length = 0;

    // Various working variables.
    // (Values are meaningless outside of the iteration)
    const workingContourFlags = new Array<boolean>(maxVerticesPerContour);
    workingContourFlags.length = 0;
    const workingPolygons = new Array<Point[]>(maxVerticesPerContour + 1);
    workingPolygons.length = 0;
    const workingMergeInfo: PolyMergeResult = {
      lengthSq: -1,
      polygonAVertexIndex: -1,
      polygonBVertexIndex: -1,
    };
    const workingMergedPolygon = new Array<Point>(maxVerticesPerPolygon);
    workingMergedPolygon.length = 0;

    // Split every concave polygon into convex polygons.
    for (const contour of concavePolygons) {
      if (contour.length < 3) {
        // CritterAI logged an error here, but we rely on this to filtered
        // polygons that became useless
        continue;
      }

      // Initialize the working polygon array.
      workingPolygons.length = 0;

      // Triangulate the contour.
      let foundAnyTriangle = false;
      this.triangulate(
        contour,
        workingContourFlags,
        (p1: Point, p2: Point, p3: Point) => {
          const workingPolygon = new Array<Point>(maxVerticesPerPolygon);
          workingPolygon.length = 0;
          workingPolygon.push(p1);
          workingPolygon.push(p2);
          workingPolygon.push(p3);
          workingPolygons.push(workingPolygon);
          foundAnyTriangle = true;
        }
      );

      if (!foundAnyTriangle) {
        /*
         * Failure of the triangulation.
         * This is known to occur if the source polygon is
         * self-intersecting or the source region contains internal
         * holes. In both cases, the problem is likely due to bad
         * region formation.
         */
        console.error(
          "Polygon generation failure: Could not triangulate contour."
        );
        console.error(
          "contour:" +
            contour.map((point) => point.x + " " + point.y).join(" ; ")
        );
        continue;
      }

      if (maxVerticesPerPolygon > 3) {
        // Merging of triangles into larger polygons is permitted.
        // Continue until no polygons can be found to merge.
        // http://www.critterai.org/nmgen_polygen#mergepolys
        while (true) {
          let longestMergeEdge = -1;
          let bestPolygonA: Point[] = [];
          let polygonAVertexIndex = -1; // Start of the shared edge.
          let bestPolygonB: Point[] = [];
          let polygonBVertexIndex = -1; // Start of the shared edge.
          let bestPolygonBIndex = -1;

          // Loop through all but the last polygon looking for the
          // best polygons to merge in this iteration.
          for (let indexA = 0; indexA < workingPolygons.length - 1; indexA++) {
            const polygonA = workingPolygons[indexA];
            for (
              let indexB = indexA + 1;
              indexB < workingPolygons.length;
              indexB++
            ) {
              const polygonB = workingPolygons[indexB];
              // Can polyB merge with polyA?
              this.getPolyMergeInfo(
                polygonA,
                polygonB,
                maxVerticesPerPolygon,
                workingMergeInfo
              );
              if (workingMergeInfo.lengthSq > longestMergeEdge) {
                // polyB has the longest shared edge with
                // polyA found so far. Save the merge
                // information.
                longestMergeEdge = workingMergeInfo.lengthSq;
                bestPolygonA = polygonA;
                polygonAVertexIndex = workingMergeInfo.polygonAVertexIndex;
                bestPolygonB = polygonB;
                polygonBVertexIndex = workingMergeInfo.polygonBVertexIndex;
                bestPolygonBIndex = indexB;
              }
            }
          }

          if (longestMergeEdge <= 0)
            // No valid merges found during this iteration.
            break;

          // Found polygons to merge. Perform the merge.

          /*
           * Fill the mergedPoly array.
           * Start the vertex at the end of polygon A's shared edge.
           * Add all vertices until looping back to the vertex just
           * before the start of the shared edge. Repeat for
           * polygon B.
           *
           * Duplicate vertices are avoided, while ensuring we get
           * all vertices, since each loop  drops the vertex that
           * starts its polygon's shared edge and:
           *
           * PolyAStartVert == PolyBEndVert and
           * PolyAEndVert == PolyBStartVert.
           */
          const vertCountA = bestPolygonA.length;
          const vertCountB = bestPolygonB.length;
          workingMergedPolygon.length = 0;
          for (let i = 0; i < vertCountA - 1; i++)
            workingMergedPolygon.push(
              bestPolygonA[(polygonAVertexIndex + 1 + i) % vertCountA]
            );
          for (let i = 0; i < vertCountB - 1; i++)
            workingMergedPolygon.push(
              bestPolygonB[(polygonBVertexIndex + 1 + i) % vertCountB]
            );

          // Copy the merged polygon over the top of polygon A.
          bestPolygonA.length = 0;
          Array.prototype.push.apply(bestPolygonA, workingMergedPolygon);
          // Remove polygon B
          workingPolygons.splice(bestPolygonBIndex, 1);
        }
      }

      // Polygon creation for this contour is complete.
      // Add polygons to the global polygon array
      Array.prototype.push.apply(convexPolygons, workingPolygons);
    }

    // The original implementation builds polygon adjacency information.
    // but the library for the pathfinding already does it.

    return convexPolygons;
  }

  /**
   * Checks two polygons to see if they can be merged. If a merge is
   * allowed, provides data via the outResult argument (see {@link PolyMergeResult}).
   *
   * @param polygonA The polygon A
   * @param polygonB The polygon B
   * @param maxVerticesPerPolygon cap the vertex number in return polygons.
   * @param outResult contains merge information.
   */
  private getPolyMergeInfo(
    polygonA: Point[],
    polygonB: Point[],
    maxVerticesPerPolygon: integer,
    outResult: PolyMergeResult
  ): void {
    outResult.lengthSq = -1; // Default to invalid merge
    outResult.polygonAVertexIndex = -1;
    outResult.polygonBVertexIndex = -1;

    const vertexCountA = polygonA.length;
    const vertexCountB = polygonB.length;

    // If the merged polygon would would have to many vertices, do not
    // merge. Subtracting two since to take into account the effect of
    // a merge.
    if (vertexCountA + vertexCountB - 2 > maxVerticesPerPolygon) return;

    // Check if the polygons share an edge.
    for (let indexA = 0; indexA < vertexCountA; indexA++) {
      // Get the vertex indices for the polygonA edge
      const vertexA = polygonA[indexA];
      const nextVertexA = polygonA[(indexA + 1) % vertexCountA];
      // Search polygonB for matches.
      for (let indexB = 0; indexB < vertexCountB; indexB++) {
        // Get the vertex indices for the polygonB edge.
        const vertexB = polygonB[indexB];
        const nextVertexB = polygonB[(indexB + 1) % vertexCountB];
        // === can be used because vertices comme from the same concave polygon.
        if (vertexA === nextVertexB && nextVertexA === vertexB) {
          // The vertex indices for this edge are the same and
          // sequenced in opposite order. So the edge is shared.
          outResult.polygonAVertexIndex = indexA;
          outResult.polygonBVertexIndex = indexB;
        }
      }
    }

    if (outResult.polygonAVertexIndex === -1)
      // No common edge, cannot merge.
      return;

    // Check to see if the merged polygon would be convex.
    //
    // Gets the vertices near the section where the merge would occur.
    // Do they form a concave section?  If so, the merge is invalid.
    //
    // Note that the following algorithm is only valid for clockwise
    // wrapped convex polygons.
    let sharedVertMinus =
      polygonA[
        (outResult.polygonAVertexIndex - 1 + vertexCountA) % vertexCountA
      ];
    let sharedVert = polygonA[outResult.polygonAVertexIndex];
    let sharedVertPlus =
      polygonB[(outResult.polygonBVertexIndex + 2) % vertexCountB];
    if (
      !ConvexPolygonGenerator.isLeft(
        sharedVert.x,
        sharedVert.y,
        sharedVertMinus.x,
        sharedVertMinus.y,
        sharedVertPlus.x,
        sharedVertPlus.y
      )
    ) {
      // The shared vertex (center) is not to the left of segment
      // vertMinus->vertPlus. For a clockwise wrapped polygon, this
      // indicates a concave section. Merged polygon would be concave.
      // Invalid merge.
      return;
    }

    sharedVertMinus =
      polygonB[
        (outResult.polygonBVertexIndex - 1 + vertexCountB) % vertexCountB
      ];
    sharedVert = polygonB[outResult.polygonBVertexIndex];
    sharedVertPlus =
      polygonA[(outResult.polygonAVertexIndex + 2) % vertexCountA];
    if (
      !ConvexPolygonGenerator.isLeft(
        sharedVert.x,
        sharedVert.y,
        sharedVertMinus.x,
        sharedVertMinus.y,
        sharedVertPlus.x,
        sharedVertPlus.y
      )
    ) {
      // The shared vertex (center) is not to the left of segment
      // vertMinus->vertPlus. For a clockwise wrapped polygon, this
      // indicates a concave section. Merged polygon would be concave.
      // Invalid merge.
      return;
    }

    // Get the vertex indices that form the shared edge.
    sharedVertMinus = polygonA[outResult.polygonAVertexIndex];
    sharedVert = polygonA[(outResult.polygonAVertexIndex + 1) % vertexCountA];

    // Store the lengthSq of the shared edge.
    const deltaX = sharedVertMinus.x - sharedVert.x;
    const deltaZ = sharedVertMinus.y - sharedVert.y;
    outResult.lengthSq = deltaX * deltaX + deltaZ * deltaZ;
  }

  /**
   * Attempts to triangulate a polygon.
   *
   * @param vertices the polygon to be triangulate.
   * The content is manipulated during the operation
   * and it will be left in an undefined state at the end of
   * the operation.
   * @param vertexFlags only used internally
   * @param outTriangles is called for each triangle derived
   * from the original polygon.
   * @return The number of triangles generated. Or, if triangulation
   * failed, a negative number.
   */
  private triangulate(
    vertices: Array<Point>,
    vertexFlags: Array<boolean>,
    outTriangles: (p1: Point, p2: Point, p3: Point) => void
  ): void {
    // Terminology, concepts and such:
    //
    // This algorithm loops around the edges of a polygon looking for
    // new internal edges to add that will partition the polygon into a
    // new valid triangle internal to the starting polygon. During each
    // iteration the shortest potential new edge is selected to form that
    // iteration's new triangle.
    //
    // Triangles will only be formed if a single new edge will create
    // a triangle. Two new edges will never be added during a single
    // iteration. This means that the triangulated portions of the
    // original polygon will only contain triangles and the only
    // non-triangle polygon will exist in the untriangulated portion
    // of the original polygon.
    //
    // "Partition edge" refers to a potential new edge that will form a
    // new valid triangle.
    //
    // "Center" vertex refers to the vertex in a potential new triangle
    // which, if the triangle is formed, will be external to the
    // remaining untriangulated portion of the polygon. Since it
    // is now external to the polygon, it can't be used to form any
    // new triangles.
    //
    // Some documentation refers to "iPlus2" even though the variable is
    // not in scope or does not exist for that section of code. For
    // documentation purposes, iPlus2 refers to the 2nd vertex after the
    // primary vertex.
    // E.g.: i, iPlus1, and iPlus2.
    //
    // Visualizations: http://www.critterai.org/projects/nmgen_study/polygen.html#triangulation

    // Loop through all vertices, flagging all indices that represent
    // a center vertex of a valid new triangle.
    vertexFlags.length = vertices.length;
    for (let i = 0; i < vertices.length; i++) {
      const iPlus1 = (i + 1) % vertices.length;
      const iPlus2 = (i + 2) % vertices.length;
      // A triangle formed by i, iPlus1, and iPlus2 will result
      // in a valid internal triangle.
      // Flag the center vertex (iPlus1) to indicate a valid triangle
      // location.
      vertexFlags[iPlus1] = ConvexPolygonGenerator.isValidPartition(
        i,
        iPlus2,
        vertices
      );
    }

    // Loop through the vertices creating triangles. When there is only a
    // single triangle left,  the operation is complete.
    //
    // When a valid triangle is formed, remove its center vertex. So for
    // each loop, a single vertex will be removed.
    //
    // At the start of each iteration the indices list is in the following
    // state:
    // - Represents a simple polygon representing the un-triangulated
    //   portion of the original polygon.
    // - All valid center vertices are flagged.
    while (vertices.length > 3) {
      // Find the shortest new valid edge.

      // NOTE: i and iPlus1 are defined in two different scopes in
      // this section. So be careful.

      // Loop through all indices in the remaining polygon.
      let minLengthSq = Number.MAX_VALUE;
      let minLengthSqVertexIndex = -1;
      for (let i = 0; i < vertices.length; i++) {
        if (vertexFlags[(i + 1) % vertices.length]) {
          // Indices i, iPlus1, and iPlus2 are known to form a
          // valid triangle.
          const vert = vertices[i];
          const vertPlus2 = vertices[(i + 2) % vertices.length];

          // Determine the length of the partition edge.
          // (i -> iPlus2)
          const deltaX = vertPlus2.x - vert.x;
          const deltaY = vertPlus2.y - vert.y;
          const lengthSq = deltaX * deltaX + deltaY * deltaY;

          if (lengthSq < minLengthSq) {
            minLengthSq = lengthSq;
            minLengthSqVertexIndex = i;
          }
        }
      }

      if (minLengthSqVertexIndex === -1)
        // Could not find a new triangle. Triangulation failed.
        // This happens if there are three or more vertices
        // left, but none of them are flagged as being a
        // potential center vertex.
        return;

      let i = minLengthSqVertexIndex;
      let iPlus1 = (i + 1) % vertices.length;

      // Add the new triangle to the output.
      outTriangles(
        vertices[i],
        vertices[iPlus1],
        vertices[(i + 2) % vertices.length]
      );

      // iPlus1, the "center" vert in the new triangle, is now external
      // to the untriangulated portion of the polygon. Remove it from
      // the vertices list since it cannot be a member of any new
      // triangles.
      vertices.splice(iPlus1, 1);
      vertexFlags.splice(iPlus1, 1);

      if (iPlus1 === 0 || iPlus1 >= vertices.length) {
        // The vertex removal has invalidated iPlus1 and/or i. So
        // force a wrap, fixing the indices so they reference the
        // correct indices again. This only occurs when the new
        // triangle is formed across the wrap location of the polygon.
        // Case 1: i = 14, iPlus1 = 15, iPlus2 = 0
        // Case 2: i = 15, iPlus1 = 0, iPlus2 = 1;
        i = vertices.length - 1;
        iPlus1 = 0;
      }

      // At this point i and iPlus1 refer to the two indices from a
      // successful triangulation that will be part of another new
      // triangle. We now need to re-check these indices to see if they
      // can now be the center index in a potential new partition.
      vertexFlags[i] = ConvexPolygonGenerator.isValidPartition(
        (i - 1 + vertices.length) % vertices.length,
        iPlus1,
        vertices
      );
      vertexFlags[iPlus1] = ConvexPolygonGenerator.isValidPartition(
        i,
        (i + 2) % vertices.length,
        vertices
      );
    }

    // Only 3 vertices remain.
    // Add their triangle to the output list.
    outTriangles(vertices[0], vertices[1], vertices[2]);
  }

  /**
   * Check if the line segment formed by vertex A and vertex B will
   * form a valid partition of the polygon.
   *
   * I.e. the line segment AB is internal to the polygon and will not
   * cross existing line segments.
   *
   * Assumptions:
   * - The vertices arguments define a valid simple polygon
   * with vertices wrapped clockwise.
   * - indexA != indexB
   *
   * Behavior is undefined if the arguments to not meet these
   * assumptions
   *
   * @param indexA the index of the vertex that will form the segment AB.
   * @param indexB the index of the vertex that will form the segment AB.
   * @param vertices a polygon wrapped clockwise.
   * @return true if the line segment formed by vertex A and vertex B will
   * form a valid partition of the polygon.
   */
  private static isValidPartition(
    indexA: integer,
    indexB: integer,
    vertices: Point[]
  ): boolean {
    //  First check whether the segment AB lies within the internal
    //  angle formed at A (this is the faster check).
    //  If it does, then perform the more costly check.
    return (
      ConvexPolygonGenerator.liesWithinInternalAngle(
        indexA,
        indexB,
        vertices
      ) &&
      !ConvexPolygonGenerator.hasIllegalEdgeIntersection(
        indexA,
        indexB,
        vertices
      )
    );
  }

  /**
   * Check if vertex B lies within the internal angle of the polygon
   * at vertex A.
   *
   * Vertex B does not have to be within the polygon border. It just has
   * be be within the area encompassed by the internal angle formed at
   * vertex A.
   *
   * This operation is a fast way of determining whether a line segment
   * can possibly form a valid polygon partition. If this test returns
   * FALSE, then more expensive checks can be skipped.
   *
   * Visualizations: http://www.critterai.org/projects/nmgen_study/polygen.html#anglecheck
   *
   * Special case:
   * FALSE is returned if vertex B lies directly on either of the rays
   * cast from vertex A along its associated polygon edges. So the test
   * on vertex B is exclusive of the polygon edges.
   *
   * Assumptions:
   * - The vertices and indices arguments define a valid simple polygon
   * with vertices wrapped clockwise.
   * -indexA != indexB
   *
   * Behavior is undefined if the arguments to not meet these
   * assumptions
   *
   * @param indexA the index of the vertex that will form the segment AB.
   * @param indexB the index of the vertex that will form the segment AB.
   * @param vertices a polygon wrapped clockwise.
   * @return true if vertex B lies within the internal angle of
   * the polygon at vertex A.
   */
  private static liesWithinInternalAngle(
    indexA: integer,
    indexB: integer,
    vertices: Point[]
  ): boolean {
    // Get pointers to the main vertices being tested.
    const vertexA = vertices[indexA];
    const vertexB = vertices[indexB];

    // Get pointers to the vertices just before and just after vertA.
    const vertexAMinus =
      vertices[(indexA - 1 + vertices.length) % vertices.length];
    const vertexAPlus = vertices[(indexA + 1) % vertices.length];

    // First, find which of the two angles formed by the line segments
    //  AMinus->A->APlus is internal to (pointing towards) the polygon.
    // Then test to see if B lies within the area formed by that angle.

    // TRUE if A is left of or on line AMinus->APlus
    if (
      ConvexPolygonGenerator.isLeftOrCollinear(
        vertexA.x,
        vertexA.y,
        vertexAMinus.x,
        vertexAMinus.y,
        vertexAPlus.x,
        vertexAPlus.y
      )
    )
      // The angle internal to the polygon is <= 180 degrees
      // (non-reflex angle).
      // Test to see if B lies within this angle.
      return (
        ConvexPolygonGenerator.isLeft(
          // TRUE if B is left of line A->AMinus
          vertexB.x,
          vertexB.y,
          vertexA.x,
          vertexA.y,
          vertexAMinus.x,
          vertexAMinus.y
        ) &&
        // TRUE if B is right of line A->APlus
        ConvexPolygonGenerator.isRight(
          vertexB.x,
          vertexB.y,
          vertexA.x,
          vertexA.y,
          vertexAPlus.x,
          vertexAPlus.y
        )
      );

    // The angle internal to the polygon is > 180 degrees (reflex angle).
    // Test to see if B lies within the external (<= 180 degree) angle and
    // flip the result. (If B lies within the external angle, it can't
    // lie within the internal angle)
    return !(
      // TRUE if B is left of or on line A->APlus
      (
        ConvexPolygonGenerator.isLeftOrCollinear(
          vertexB.x,
          vertexB.y,
          vertexA.x,
          vertexA.y,
          vertexAPlus.x,
          vertexAPlus.y
        ) &&
        // TRUE if B is right of or on line A->AMinus
        ConvexPolygonGenerator.isRightOrCollinear(
          vertexB.x,
          vertexB.y,
          vertexA.x,
          vertexA.y,
          vertexAMinus.x,
          vertexAMinus.y
        )
      )
    );
  }

  /**
   * Check if the line segment AB intersects any edges not already
   * connected to one of the two vertices.
   *
   * Assumptions:
   * - The vertices and indices arguments define a valid simple polygon
   * with vertices wrapped clockwise.
   * - indexA != indexB
   *
   * Behavior is undefined if the arguments to not meet these
   * assumptions
   *
   * @param indexA the index of the vertex that will form the segment AB.
   * @param indexB the index of the vertex that will form the segment AB.
   * @param vertices a polygon wrapped clockwise.
   * @return true if the line segment AB intersects any edges not already
   * connected to one of the two vertices.
   */
  private static hasIllegalEdgeIntersection(
    indexA: integer,
    indexB: integer,
    vertices: Point[]
  ): boolean {
    // Get pointers to the primary vertices being tested.
    const vertexA = vertices[indexA];
    const vertexB = vertices[indexB];

    // Loop through the polygon edges.
    for (
      let edgeBeginIndex = 0;
      edgeBeginIndex < vertices.length;
      edgeBeginIndex++
    ) {
      const edgeEndIndex = (edgeBeginIndex + 1) % vertices.length;
      if (
        edgeBeginIndex === indexA ||
        edgeBeginIndex === indexB ||
        edgeEndIndex === indexA ||
        edgeEndIndex === indexB
      ) {
        continue;
      }
      // Neither of the test indices are endpoints of this edge.
      // Get this edge's vertices.
      const edgeBegin = vertices[edgeBeginIndex];
      const edgeEnd = vertices[edgeEndIndex];
      if (
        (edgeBegin.x === vertexA.x && edgeBegin.y === vertexA.y) ||
        (edgeBegin.x === vertexB.x && edgeBegin.y === vertexB.y) ||
        (edgeEnd.x === vertexA.x && edgeEnd.y === vertexA.y) ||
        (edgeEnd.x === vertexB.x && edgeEnd.y === vertexB.y)
      ) {
        // One of the test vertices is co-located
        // with one of the endpoints of this edge (this is a
        // test of the actual position of the vertices rather than
        // simply the index check performed earlier).
        // Skip this edge.
        continue;
      }
      // This edge is not connected to either of the test vertices.
      // If line segment AB intersects  with this edge, then the
      // intersection is illegal.
      // I.e. New edges cannot cross existing edges.
      if (
        Geometry.segmentsIntersect(
          vertexA.x,
          vertexA.y,
          vertexB.x,
          vertexB.y,
          edgeBegin.x,
          edgeBegin.y,
          edgeEnd.x,
          edgeEnd.y
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if point P is to the left of line AB when looking
   * from A to B.
   * @param px The x-value of the point to test.
   * @param py The y-value of the point to test.
   * @param ax The x-value of the point (ax, ay) that is point A on line AB.
   * @param ay The y-value of the point (ax, ay) that is point A on line AB.
   * @param bx The x-value of the point (bx, by) that is point B on line AB.
   * @param by The y-value of the point (bx, by) that is point B on line AB.
   * @return TRUE if point P is to the left of line AB when looking
   * from A to B.
   */
  private static isLeft(
    px: integer,
    py: integer,
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer
  ): boolean {
    return ConvexPolygonGenerator.getSignedAreaX2(ax, ay, px, py, bx, by) < 0;
  }

  /**
   * Check if point P is to the left of line AB when looking
   * from A to B or is collinear with line AB.
   * @param px The x-value of the point to test.
   * @param py The y-value of the point to test.
   * @param ax The x-value of the point (ax, ay) that is point A on line AB.
   * @param ay The y-value of the point (ax, ay) that is point A on line AB.
   * @param bx The x-value of the point (bx, by) that is point B on line AB.
   * @param by The y-value of the point (bx, by) that is point B on line AB.
   * @return TRUE if point P is to the left of line AB when looking
   * from A to B, or is collinear with line AB.
   */
  private static isLeftOrCollinear(
    px: integer,
    py: integer,
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer
  ): boolean {
    return ConvexPolygonGenerator.getSignedAreaX2(ax, ay, px, py, bx, by) <= 0;
  }

  /**
   * Check if point P is to the right of line AB when looking
   * from A to B.
   * @param px The x-value of the point to test.
   * @param py The y-value of the point to test.
   * @param ax The x-value of the point (ax, ay) that is point A on line AB.
   * @param ay The y-value of the point (ax, ay) that is point A on line AB.
   * @param bx The x-value of the point (bx, by) that is point B on line AB.
   * @param by The y-value of the point (bx, by) that is point B on line AB.
   * @return TRUE if point P is to the right of line AB when looking
   * from A to B.
   */
  private static isRight(
    px: integer,
    py: integer,
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer
  ): boolean {
    return ConvexPolygonGenerator.getSignedAreaX2(ax, ay, px, py, bx, by) > 0;
  }

  /**
   * Check if point P is to the right of or on line AB when looking
   * from A to B.
   * @param px The x-value of the point to test.
   * @param py The y-value of the point to test.
   * @param ax The x-value of the point (ax, ay) that is point A on line AB.
   * @param ay The y-value of the point (ax, ay) that is point A on line AB.
   * @param bx The x-value of the point (bx, by) that is point B on line AB.
   * @param by The y-value of the point (bx, by) that is point B on line AB.
   * @return TRUE if point P is to the right of or on line AB when looking
   * from A to B.
   */
  private static isRightOrCollinear(
    px: integer,
    py: integer,
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer
  ): boolean {
    return ConvexPolygonGenerator.getSignedAreaX2(ax, ay, px, py, bx, by) >= 0;
  }

  /**
   * The absolute value of the returned value is two times the area of the
   * triangle defined by points (A, B, C).
   *
   * A positive value indicates:
   * - Counterclockwise wrapping of the points.
   * - Point B lies to the right of line AC, looking from A to C.
   *
   * A negative value indicates:
   * - Clockwise wrapping of the points.<
   * - Point B lies to the left of line AC, looking from A to C.
   *
   * A value of zero indicates that all points are collinear or
   * represent the same point.
   *
   * This is a fast operation.
   *
   * @param ax The x-value for point (ax, ay) for vertex A of the triangle.
   * @param ay The y-value for point (ax, ay) for vertex A of the triangle.
   * @param bx The x-value for point (bx, by) for vertex B of the triangle.
   * @param by The y-value for point (bx, by) for vertex B of the triangle.
   * @param cx The x-value for point (cx, cy) for vertex C of the triangle.
   * @param cy The y-value for point (cx, cy) for vertex C of the triangle.
   * @return The signed value of two times the area of the triangle defined
   * by the points (A, B, C).
   */
  private static getSignedAreaX2(
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer,
    cx: integer,
    cy: integer
  ): integer {
    // References:
    // http://softsurfer.com/Archive/algorithm_0101/algorithm_0101.htm#Modern%20Triangles
    // http://mathworld.wolfram.com/TriangleArea.html (Search for "signed")
    return (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  }
}

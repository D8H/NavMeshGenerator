import { Point, float, integer } from "./CommonTypes";

/**
 * This implementation is strongly inspired from CritterAI class "Geometry".
 */
export class Geometry {
  /**
   * Returns TRUE if line segment AB intersects with line segment CD in any
   * manner. Either collinear or at a single point.
   * @param ax The x-value for point (ax, ay) in line segment AB.
   * @param ay The y-value for point (ax, ay) in line segment AB.
   * @param bx The x-value for point (bx, by) in line segment AB.
   * @param by The y-value for point (bx, by) in line segment AB.
   * @param cx The x-value for point (cx, cy) in line segment CD.
   * @param cy The y-value for point (cx, cy) in line segment CD.
   * @param dx The x-value for point (dx, dy) in line segment CD.
   * @param dy The y-value for point (dx, dy) in line segment CD.
   * @return TRUE if line segment AB intersects with line segment CD in any
   * manner.
   */
  public static segmentsIntersect(
    ax: integer,
    ay: integer,
    bx: integer,
    by: integer,
    cx: integer,
    cy: integer,
    dx: integer,
    dy: integer
  ): boolean {
    // This is modified 2D line-line intersection/segment-segment
    // intersection test.

    const deltaABx = bx - ax;
    const deltaABy = by - ay;
    const deltaCAx = ax - cx;
    const deltaCAy = ay - cy;
    const deltaCDx = dx - cx;
    const deltaCDy = dy - cy;

    const numerator = deltaCAy * deltaCDx - deltaCAx * deltaCDy;
    const denominator = deltaABx * deltaCDy - deltaABy * deltaCDx;

    // Perform early exit tests.
    if (denominator === 0 && numerator !== 0) {
      // If numerator is zero, then the lines are colinear.
      // Since it isn't, then the lines must be parallel.
      return false;
    }

    // Lines intersect. But do the segments intersect?

    // Forcing float division on both of these via casting of the
    // denominator.
    const factorAB = numerator / denominator;
    const factorCD = (deltaCAy * deltaABx - deltaCAx * deltaABy) / denominator;

    // Determine the type of intersection
    if (
      factorAB >= 0.0 &&
      factorAB <= 1.0 &&
      factorCD >= 0.0 &&
      factorCD <= 1.0
    ) {
      return true; // The two segments intersect.
    }

    // The lines intersect, but segments to not.

    return false;
  }

  /**
   * Returns the distance squared from the point to the line segment.
   *
   * Behavior is undefined if the the closest distance is outside the
   * line segment.
   *
   * @param px The x-value of point (px, py).
   * @param py The y-value of point (px, py)
   * @param ax The x-value of the line segment's vertex A.
   * @param ay The y-value of the line segment's vertex A.
   * @param bx The x-value of the line segment's vertex B.
   * @param by The y-value of the line segment's vertex B.
   * @return The distance squared from the point (px, py) to line segment AB.
   */
  public static getPointSegmentDistanceSq(
    px: float,
    py: float,
    ax: float,
    ay: float,
    bx: float,
    by: float
  ): float {
    // Reference: http://local.wasp.uwa.edu.au/~pbourke/geometry/pointline/
    //
    // The goal of the algorithm is to find the point on line segment AB
    // that is closest to P and then calculate the distance between P
    // and that point.

    const deltaABx = bx - ax;
    const deltaABy = by - ay;
    const deltaAPx = px - ax;
    const deltaAPy = py - ay;

    const segmentABLengthSq = deltaABx * deltaABx + deltaABy * deltaABy;
    if (segmentABLengthSq === 0) {
      // AB is not a line segment. So just return
      // distanceSq from P to A
      return deltaAPx * deltaAPx + deltaAPy * deltaAPy;
    }

    const u = (deltaAPx * deltaABx + deltaAPy * deltaABy) / segmentABLengthSq;
    if (u < 0) {
      // Closest point on line AB is outside outside segment AB and
      // closer to A. So return distanceSq from P to A.
      return deltaAPx * deltaAPx + deltaAPy * deltaAPy;
    } else if (u > 1) {
      // Closest point on line AB is outside segment AB and closer to B.
      // So return distanceSq from P to B.
      return (px - bx) * (px - bx) + (py - by) * (py - by);
    }

    // Closest point on lineAB is inside segment AB. So find the exact
    // point on AB and calculate the distanceSq from it to P.

    // The calculation in parenthesis is the location of the point on
    // the line segment.
    const deltaX = ax + u * deltaABx - px;
    const deltaY = ay + u * deltaABy - py;

    return deltaX * deltaX + deltaY * deltaY;
  }
}

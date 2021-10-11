import { Point, float, integer } from "./CommonTypes";

export type ContourPoint = {
  x: integer;
  y: integer;
  /** Neighbor region */
  region: integer;
};

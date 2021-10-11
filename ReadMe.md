# NavMesh Generator

This JavaScript library allows to generate 2D [navigation meshes](https://en.wikipedia.org/wiki/Navigation_mesh) for pathfinding.

It can be used, for instance, with this pathfinding implementation: [mikewesthad/navmesh](https://github.com/mikewesthad/navmesh).

## Used work

This implementation is strongly inspired from [NMGen Study](http://www.critterai.org/projects/nmgen_study/) a Java one by Stephen A. Pratt.

This implementation differs a bit from the original:
- It's only 2D instead of 3D
- It uses objects for points instead of pointer-like in arrays of numbers
- The rasterization comes from other sources because of the 2d focus
- The `partialFloodRegion` function was rewritten to fix an issue
- An algorithm to filter vertices that are not on a border was added

The original Java implementation was also inspired from [Recast](https://github.com/recastnavigation/recastnavigation) itself.

### A scan-line polygon fill algorithm
The [original implementation](https://alienryderflex.com/polygon_fill/) was done by Darel Rex Finley.

The implementation used in this library differs with the following:
- It handles float vertices so it focusses on pixels center
- It is conservative to thin vertical or horizontal polygons

## Demonstrations

### An isometric example
This is a modified version of an official example of GDevelop where a character moves to the pointer with a left click. The art was done by [Mickael Hoarau](https://www.youtube.com/channel/UC0Tm56J3LIj0PcjGQdvy_QA).
[Try it in browser](https://games.gdevelop-app.com/game-4f902160-0daa-4db9-bfca-4d792309aa15/index.html)
## An AI example
This is a modified version of an official example of GDevelop where enemies follow you.
[Try it in browser](https://games.gdevelop-app.com/game-05f6bf02-0a65-4cc9-bb77-c7c7e0b3c1ce/index.html)
### Squares at random positions
[Try it in browser](https://games.gdevelop-app.com/game-3dfb74dc-38a8-4475-bef9-bf1ae8424125/index.html)
### Two sizes of moving objects and obstacle dragging
[Try it in browser](https://games.gdevelop-app.com/game-e5bac69a-0625-45fa-b523-45981aa74518/index.html)

## Changelog

Version 0.1.0

- First version

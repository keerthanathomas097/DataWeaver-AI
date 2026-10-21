/**
 * Utility functions for computing 2D embedding landscape contours,
 * kernel density estimation (KDE), marching squares iso-curves,
 * and closed density contour polygons in pure JavaScript for SVG rendering.
 */

/**
 * Computes 2D Kernel Density Estimation over a regular grid.
 * @param {Array<{x: number, y: number}>} points - Coordinates in pixel space [0, width] x [0, height]
 * @param {number} width - Canvas width in px
 * @param {number} height - Canvas height in px
 * @param {number} cols - Number of grid columns (default 44)
 * @param {number} rows - Number of grid rows (default 28)
 * @param {number} sigma - Gaussian kernel standard deviation in px (default 36)
 * @returns {{ grid: number[][], cols: number, rows: number, dx: number, dy: number, maxDensity: number }}
 */
export function computeDensityGrid(points, width, height, cols = 44, rows = 28, sigma = 36) {
  if (!points || points.length === 0) {
    return { grid: [], cols, rows, dx: 0, dy: 0, maxDensity: 0 };
  }

  const dx = width / (cols - 1);
  const dy = height / (rows - 1);
  const twoSigmaSq = 2 * sigma * sigma;

  // Pre-filter valid points
  const validPts = points
    .filter((p) => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y))
    .map((p) => ({ x: p.x, y: p.y }));

  if (validPts.length === 0) {
    return { grid: [], cols, rows, dx, dy, maxDensity: 0 };
  }

  // Optimize KDE: cutoff distance = 3 * sigma
  const cutoffSq = 9 * sigma * sigma;

  const grid = Array.from({ length: rows }, () => new Float32Array(cols));
  let maxDensity = 0;

  for (let r = 0; r < rows; r++) {
    const gy = r * dy;
    for (let c = 0; c < cols; c++) {
      const gx = c * dx;
      let sum = 0;
      for (let i = 0; i < validPts.length; i++) {
        const pt = validPts[i];
        const distSq = (gx - pt.x) * (gx - pt.x) + (gy - pt.y) * (gy - pt.y);
        if (distSq < cutoffSq) {
          sum += Math.exp(-distSq / twoSigmaSq);
        }
      }
      grid[r][c] = sum;
      if (sum > maxDensity) {
        maxDensity = sum;
      }
    }
  }

  return { grid, cols, rows, dx, dy, maxDensity };
}

/**
 * Traces iso-density contour line segments using the standard Marching Squares algorithm.
 * @param {Float32Array[]} grid - 2D density grid
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @param {number} dx - Cell width
 * @param {number} dy - Cell height
 * @param {number} threshold - Density threshold value
 * @returns {Array<[number, number, number, number]>} List of line segments [x1, y1, x2, y2]
 */
export function marchingSquares(grid, cols, rows, dx, dy, threshold) {
  const segments = [];

  // Linear interpolation for smoother edges
  const lerp = (v1, v2, p1, p2) => {
    if (Math.abs(v2 - v1) < 1e-6) return (p1 + p2) / 2;
    const t = (threshold - v1) / (v2 - v1);
    return p1 + t * (p2 - p1);
  };

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v0 = grid[r][c];         // Top-left
      const v1 = grid[r][c + 1];     // Top-right
      const v2 = grid[r + 1][c + 1]; // Bottom-right
      const v3 = grid[r + 1][c];     // Bottom-left

      const b0 = v0 >= threshold ? 1 : 0;
      const b1 = v1 >= threshold ? 1 : 0;
      const b2 = v2 >= threshold ? 1 : 0;
      const b3 = v3 >= threshold ? 1 : 0;

      const cellIndex = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;

      if (cellIndex === 0 || cellIndex === 15) continue;

      const x0 = c * dx;
      const x1 = (c + 1) * dx;
      const y0 = r * dy;
      const y1 = (r + 1) * dy;

      // Interpolated edge midpoints
      const top = [lerp(v0, v1, x0, x1), y0];
      const right = [x1, lerp(v1, v2, y0, y1)];
      const bottom = [lerp(v3, v2, x0, x1), y1];
      const left = [x0, lerp(v0, v3, y0, y1)];

      switch (cellIndex) {
        case 1:  // 0001 (Bottom-left)
          segments.push([...left, ...bottom]);
          break;
        case 2:  // 0010 (Bottom-right)
          segments.push([...bottom, ...right]);
          break;
        case 3:  // 0011 (Bottom)
          segments.push([...left, ...right]);
          break;
        case 4:  // 0100 (Top-right)
          segments.push([...top, ...right]);
          break;
        case 5:  // 0101 (Ambiguous Saddle)
          segments.push([...left, ...top]);
          segments.push([...bottom, ...right]);
          break;
        case 6:  // 0110 (Right)
          segments.push([...top, ...bottom]);
          break;
        case 7:  // 0111
          segments.push([...left, ...top]);
          break;
        case 8:  // 1000 (Top-left)
          segments.push([...top, ...left]);
          break;
        case 9:  // 1001 (Left)
          segments.push([...top, ...bottom]);
          break;
        case 10: // 1010 (Ambiguous Saddle)
          segments.push([...top, ...right]);
          segments.push([...bottom, ...left]);
          break;
        case 11: // 1011
          segments.push([...top, ...right]);
          break;
        case 12: // 1100 (Top)
          segments.push([...left, ...right]);
          break;
        case 13: // 1101
          segments.push([...bottom, ...right]);
          break;
        case 14: // 1110
          segments.push([...left, ...bottom]);
          break;
      }
    }
  }

  return segments;
}

/**
 * Chains line segments into an open SVG stroke path string.
 * @param {Array<[number, number, number, number]>} segments
 * @returns {string} SVG path data string
 */
export function segmentsToSvgPath(segments) {
  if (!segments || segments.length === 0) return '';
  return segments
    .map(
      (s) =>
        `M ${s[0].toFixed(1)},${s[1].toFixed(1)} L ${s[2].toFixed(1)},${s[3].toFixed(1)}`
    )
    .join(' ');
}

/**
 * Connects Marching Squares line segments into closed polygon SVG paths for translucent density fills.
 * Traverses segments bidirectionally to close all continuous contour rings.
 * @param {Array<[number, number, number, number]>} segments
 * @param {number} tolerance
 * @returns {string} Closed SVG paths
 */
export function connectSegmentsToPolygons(segments, tolerance = 4.0) {
  if (!segments || segments.length === 0) return '';
  const remaining = segments.map((s) => ({ x1: s[0], y1: s[1], x2: s[2], y2: s[3], used: false }));
  const paths = [];

  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].used) continue;
    remaining[i].used = true;
    const poly = [{ x: remaining[i].x1, y: remaining[i].y1 }, { x: remaining[i].x2, y: remaining[i].y2 }];

    let growing = true;
    while (growing) {
      growing = false;
      const currentEnd = poly[poly.length - 1];
      const currentStart = poly[0];

      // Try extending currentEnd
      for (let j = 0; j < remaining.length; j++) {
        if (remaining[j].used) continue;
        const seg = remaining[j];
        const d1 = Math.hypot(currentEnd.x - seg.x1, currentEnd.y - seg.y1);
        if (d1 <= tolerance) {
          poly.push({ x: seg.x2, y: seg.y2 });
          seg.used = true;
          growing = true;
          break;
        }
        const d2 = Math.hypot(currentEnd.x - seg.x2, currentEnd.y - seg.y2);
        if (d2 <= tolerance) {
          poly.push({ x: seg.x1, y: seg.y1 });
          seg.used = true;
          growing = true;
          break;
        }
      }

      // If we didn't extend the end, try extending currentStart
      if (!growing) {
        for (let j = 0; j < remaining.length; j++) {
          if (remaining[j].used) continue;
          const seg = remaining[j];
          const d1 = Math.hypot(currentStart.x - seg.x2, currentStart.y - seg.y2);
          if (d1 <= tolerance) {
            poly.unshift({ x: seg.x1, y: seg.y1 });
            seg.used = true;
            growing = true;
            break;
          }
          const d2 = Math.hypot(currentStart.x - seg.x1, currentStart.y - seg.y1);
          if (d2 <= tolerance) {
            poly.unshift({ x: seg.x2, y: seg.y2 });
            seg.used = true;
            growing = true;
            break;
          }
        }
      }
    }

    if (poly.length >= 3) {
      const pathStr = `M ${poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`;
      paths.push(pathStr);
    }
  }

  return paths.join(' ');
}

/**
 * Computes 2D Convex Hull for a set of points using Monotone Chain algorithm.
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{x: number, y: number}>} Hull vertices in clockwise order
 */
export function computeConvexHull(points) {
  if (!points || points.length < 3) return points ? [...points] : [];

  const pts = points
    .filter((p) => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y))
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  if (pts.length < 3) return pts;

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (let i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
      lower.pop();
    }
    lower.push(pts[i]);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
      upper.pop();
    }
    upper.push(pts[i]);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Converts convex hull vertices to a smooth SVG closed path with rounded corners.
 * @param {Array<{x: number, y: number}>} hull
 * @param {number} padding - Optional outward expansion
 * @returns {string} SVG closed path
 */
export function hullToSvgPath(hull, padding = 10) {
  if (!hull || hull.length < 3) return '';

  let cx = 0;
  let cy = 0;
  hull.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  cx /= hull.length;
  cy /= hull.length;

  const expanded = hull.map((p) => {
    const vx = p.x - cx;
    const vy = p.y - cy;
    const dist = Math.sqrt(vx * vx + vy * vy) || 1;
    return {
      x: p.x + (vx / dist) * padding,
      y: p.y + (vy / dist) * padding,
    };
  });

  return `M ${expanded.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`;
}

/**
 * Computes the normalized intersection overlap between two 2D probability density grids.
 * Returns a score between 0.0 (disjoint) and 1.0 (identical distribution).
 * @param {Float32Array[]} grid1 - Source density grid
 * @param {Float32Array[]} grid2 - Target density grid
 * @param {number} rows - Number of grid rows
 * @param {number} cols - Number of grid cols
 * @returns {number} Overlap coefficient [0, 1]
 */
export function computeDistributionOverlap(grid1, grid2, rows, cols) {
  if (!grid1 || !grid2 || grid1.length === 0 || grid2.length === 0) return 0;
  let sum1 = 0;
  let sum2 = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sum1 += grid1[r][c];
      sum2 += grid2[r][c];
    }
  }
  if (sum1 <= 0 || sum2 <= 0) return 0;

  let overlap = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      overlap += Math.min(grid1[r][c] / sum1, grid2[r][c] / sum2);
    }
  }
  return Math.min(Math.max(overlap, 0), 1);
}


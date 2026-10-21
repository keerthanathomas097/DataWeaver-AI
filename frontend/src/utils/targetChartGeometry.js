/**
 * targetChartGeometry.js
 *
 * Pure mathematical geometry and layout engine for the Domain Gap "Coverage Target"
 * bullseye chart.
 *
 * Meaning of the chart:
 * - Center (0, 0): The dataset itself (100% similarity, distance d = 0).
 * - A photo's distance from center: d = 1 - nearest_similarity.
 * - Concentric rings show what is normal for the dataset's own images:
 *     - Cutoff ring: d_cutoff = 1 - baseline.threshold.
 *     - Covered zone: d <= d_cutoff.
 *     - Near-miss zone: d_cutoff < d <= d_cutoff + NEAR_MISS_MARGIN.
 *     - Far outside zone: d > d_cutoff + NEAR_MISS_MARGIN out to outerRadius.
 * - Angle carries the semantic class of the nearest dataset image.
 *     - Top corridor (+/- 35 deg from 12 o'clock) & bottom corridor (+/- 35 deg from 6 o'clock)
 *       are kept clear for graticule, cutoff, and zone labels.
 *     - Remaining left and right arcs are divided among classes.
 */

export const NEAR_MISS_MARGIN = 0.10; // 10 percentage points below the cutoff
export const MIN_MARKER_DISTANCE = 28; // Minimum center-to-center distance in SVG units to prevent overlap

/**
 * Computes d_max for the chart radius scale.
 * Formula:
 * dmax = max(cutoffD * 1.6, maxPhotoD * 1.1, p99_baseline * 1.05)
 * where cutoffD = 1 - baseline.threshold.
 * This keeps every marker inside the chart and ensures the cutoff ring is readable.
 *
 * @param {Object} params
 * @param {number} [params.baselineThreshold=0.65] - The baseline threshold similarity (e.g. 0.559)
 * @param {Array<Object>} [params.samples=[]] - Target photos with nearest_similarity
 * @param {Array<Object>} [params.baselinePoints=[]] - Baseline dataset points with similarity
 * @returns {number} dmax clamped to a reasonable domain
 */
export function computeDmax({
  baselineThreshold = 0.65,
  samples = [],
  baselinePoints = [],
}) {
  const safeThreshold = typeof baselineThreshold === 'number' && !isNaN(baselineThreshold)
    ? baselineThreshold
    : 0.65;
  const cutoffD = Math.max(0.01, 1 - safeThreshold);

  let maxPhotoD = 0;
  if (Array.isArray(samples) && samples.length > 0) {
    for (const s of samples) {
      const sim = s?.nearest_similarity ?? s?.nearest?.[0]?.similarity;
      if (typeof sim === 'number' && !isNaN(sim)) {
        const d = Math.max(0, 1 - sim);
        if (d > maxPhotoD) maxPhotoD = d;
      }
    }
  }

  let p99BaselineD = 0;
  if (Array.isArray(baselinePoints) && baselinePoints.length > 0) {
    const bDists = baselinePoints
      .map((b) => (typeof b?.similarity === 'number' ? Math.max(0, 1 - b.similarity) : null))
      .filter((d) => d !== null)
      .sort((a, b) => a - b);

    if (bDists.length > 0) {
      const p99Index = Math.min(bDists.length - 1, Math.floor(bDists.length * 0.99));
      p99BaselineD = bDists[p99Index];
    }
  }

  const rawDmax = Math.max(
    cutoffD * 1.6,
    maxPhotoD * 1.1,
    p99BaselineD * 1.05,
    0.25
  );

  // Return formatted float, minimum breathing room
  return Math.min(1.2, Math.max(0.25, rawDmax));
}

/**
 * Converts a cosine similarity score to an SVG radial distance from the center.
 * d = clamp(1 - similarity, 0, dmax)
 * radius = (d / dmax) * outerRadius
 *
 * @param {number} similarity - Cosine similarity [-1, 1]
 * @param {number} dmax - Maximum distance mapped to outerRadius
 * @param {number} outerRadius - Outer SVG radius (pixels)
 * @returns {number} Radius from center in SVG units
 */
export function distanceToRadius(similarity, dmax, outerRadius) {
  if (typeof similarity !== 'number' || isNaN(similarity)) {
    return outerRadius;
  }
  const safeDmax = dmax > 0 ? dmax : 0.5;
  const d = Math.max(0, Math.min(safeDmax, 1 - similarity));
  return (d / safeDmax) * outerRadius;
}

/**
 * Classifies a photo into one of three concentric zones.
 * - Covered: d <= cutoffD (similarity >= baselineThreshold)
 * - Near miss: cutoffD < d <= cutoffD + NEAR_MISS_MARGIN
 * - Far outside: d > cutoffD + NEAR_MISS_MARGIN
 *
 * If backendCoveredFlag is provided (boolean), it takes precedence for the 'covered' verdict
 * to strictly adhere to backend coverage counts.
 *
 * @param {number} similarity - Photo similarity to nearest dataset image
 * @param {number} baselineThreshold - Baseline threshold similarity
 * @param {boolean|null} [backendCoveredFlag=null] - Backend's pre-computed covered flag
 * @returns {'covered'|'near_miss'|'far_outside'}
 */
export function classifyZone(similarity, baselineThreshold, backendCoveredFlag = null) {
  if (backendCoveredFlag === true) {
    return 'covered';
  }

  const safeThreshold = typeof baselineThreshold === 'number' && !isNaN(baselineThreshold)
    ? baselineThreshold
    : 0.65;
  const cutoffD = 1 - safeThreshold;
  const safeSim = typeof similarity === 'number' && !isNaN(similarity) ? similarity : 0;
  const d = 1 - safeSim;

  if (backendCoveredFlag === false) {
    // Non-covered photo: split into near_miss vs far_outside
    return d <= cutoffD + NEAR_MISS_MARGIN ? 'near_miss' : 'far_outside';
  }

  // Pure mathematical fallback
  if (d <= cutoffD) {
    return 'covered';
  }
  if (d <= cutoffD + NEAR_MISS_MARGIN) {
    return 'near_miss';
  }
  return 'far_outside';
}

/**
 * Deterministic seeded hash function returning a float in [0, 1).
 * Used for stable visual jitter of baseline dataset dots.
 *
 * @param {number} seed - Integer index
 * @returns {number} Pseudo-random float [0, 1)
 */
export function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Angles for Corridors (in degrees, 0 = 3 o'clock, 90 = 6 o'clock, 180 = 9 o'clock, 270 = 12 o'clock).
 * Top Corridor: 270 +/- 35 => [235, 305] (centered at 12 o'clock).
 * Bottom Corridor: 90 +/- 35 => [55, 125] (centered at 6 o'clock).
 * Right Arc: [-55, 55] (crossing 0 deg, total 110 deg span).
 * Left Arc: [125, 235] (centered at 180 deg, total 110 deg span).
 */
export const CORRIDORS = {
  top: { center: 270, halfSpan: 35, start: 235, end: 305 },
  bottom: { center: 90, halfSpan: 35, start: 55, end: 125 },
  rightArc: { start: -55, end: 55, span: 110 },
  leftArc: { start: 125, end: 235, span: 110 },
};

/**
 * Computes class sectors based on dataset points / baseline points.
 * - Reserve top and bottom corridors (each 70 deg wide).
 * - Distribute remaining right and left arcs among classes proportional to size.
 * - Two classes: 1 per side.
 * - More than 6 classes: show top 5, group rest as "Other".
 * - 0 or 1 class: no sectors, both arcs used freely.
 *
 * @param {Array<Object>} datasetPoints - Array of { class_label, ... }
 * @param {Array<Object>} [baselinePoints=[]] - Fallback array of { class_label, ... }
 * @returns {Array<Object>} List of sector definitions
 */
export function computeSectors(datasetPoints = [], baselinePoints = []) {
  const classCounts = {};
  const allPts = Array.isArray(datasetPoints) && datasetPoints.length > 0
    ? datasetPoints
    : baselinePoints || [];

  allPts.forEach((p) => {
    const label = p?.class_label;
    if (label && typeof label === 'string' && label.trim() !== '') {
      const trimmed = label.trim();
      classCounts[trimmed] = (classCounts[trimmed] || 0) + 1;
    }
  });

  const classNames = Object.keys(classCounts);

  // If no classes or only 1 class: no sector boundaries
  if (classNames.length <= 1) {
    return [];
  }

  // Sort descending by count
  classNames.sort((a, b) => classCounts[b] - classCounts[a]);

  let processedClasses = [];
  if (classNames.length > 6) {
    const top5 = classNames.slice(0, 5);
    const otherCount = classNames.slice(5).reduce((sum, c) => sum + classCounts[c], 0);
    processedClasses = top5.map((c) => ({ className: c, count: classCounts[c] }));
    if (otherCount > 0) {
      processedClasses.push({ className: 'Other', count: otherCount });
    }
  } else {
    processedClasses = classNames.map((c) => ({ className: c, count: classCounts[c] }));
  }

  const sectors = [];
  const sectorGap = 4; // degrees between adjacent sectors

  if (processedClasses.length === 2) {
    // Exactly 2 classes: one per side
    sectors.push({
      className: processedClasses[0].className,
      count: processedClasses[0].count,
      side: 'right',
      startAngle: CORRIDORS.rightArc.start + sectorGap,
      endAngle: CORRIDORS.rightArc.end - sectorGap,
      midAngle: 0,
    });
    sectors.push({
      className: processedClasses[1].className,
      count: processedClasses[1].count,
      side: 'left',
      startAngle: CORRIDORS.leftArc.start + sectorGap,
      endAngle: CORRIDORS.leftArc.end - sectorGap,
      midAngle: 180,
    });
    return sectors;
  }

  // Split classes across right side and left side evenly by cumulative count
  let rightTotal = 0;
  let leftTotal = 0;
  const rightClasses = [];
  const leftClasses = [];

  processedClasses.forEach((cls) => {
    if (rightTotal <= leftTotal) {
      rightClasses.push(cls);
      rightTotal += cls.count;
    } else {
      leftClasses.push(cls);
      leftTotal += cls.count;
    }
  });

  // Allocate right arc
  const availableRightSpan = CORRIDORS.rightArc.span - (rightClasses.length + 1) * sectorGap;
  let currentRightStart = CORRIDORS.rightArc.start + sectorGap;

  rightClasses.forEach((cls) => {
    const fraction = rightTotal > 0 ? cls.count / rightTotal : 1 / rightClasses.length;
    const span = Math.max(12, fraction * availableRightSpan);
    const end = currentRightStart + span;
    sectors.push({
      className: cls.className,
      count: cls.count,
      side: 'right',
      startAngle: currentRightStart,
      endAngle: end,
      midAngle: (currentRightStart + end) / 2,
    });
    currentRightStart = end + sectorGap;
  });

  // Allocate left arc
  const availableLeftSpan = CORRIDORS.leftArc.span - (leftClasses.length + 1) * sectorGap;
  let currentLeftStart = CORRIDORS.leftArc.start + sectorGap;

  leftClasses.forEach((cls) => {
    const fraction = leftTotal > 0 ? cls.count / leftTotal : 1 / leftClasses.length;
    const span = Math.max(12, fraction * availableLeftSpan);
    const end = currentLeftStart + span;
    sectors.push({
      className: cls.className,
      count: cls.count,
      side: 'left',
      startAngle: currentLeftStart,
      endAngle: end,
      midAngle: (currentLeftStart + end) / 2,
    });
    currentLeftStart = end + sectorGap;
  });

  return sectors;
}

/**
 * Assigns a photo or dataset point to its sector or arc.
 *
 * @param {string|null} className
 * @param {Array<Object>} sectors
 * @returns {Object|null} Matching sector or null
 */
export function findSectorForClass(className, sectors = []) {
  if (!className || !Array.isArray(sectors) || sectors.length === 0) {
    return null;
  }
  const exact = sectors.find((s) => s.className.toLowerCase() === className.toLowerCase());
  if (exact) return exact;
  const other = sectors.find((s) => s.className === 'Other');
  return other || sectors[0] || null;
}

/**
 * Resolves marker positions with angular spreading and minimum collision distance.
 *
 * @param {Object} params
 * @param {Array<Object>} params.samples - Target samples
 * @param {Array<Object>} params.sectors - Computed sectors
 * @param {Map<string, string>} params.pathClassMap - Map from image_path to class_label
 * @param {number} params.dmax - Scale dmax
 * @param {number} params.outerRadius - Chart outer radius
 * @param {number} params.baselineThreshold - Baseline cutoff
 * @param {number} params.centerX - SVG center X
 * @param {number} params.centerY - SVG center Y
 * @returns {Array<Object>} Placed markers with { x, y, radius, angle, zone, ... }
 */
export function layoutPhotoMarkers({
  samples = [],
  sectors = [],
  pathClassMap = new Map(),
  dmax = 0.5,
  outerRadius = 210,
  baselineThreshold = 0.65,
  centerX = 300,
  centerY = 300,
}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return [];
  }

  // 1. Group samples by assigned sector / arc
  const sectorBuckets = new Map();
  const unassignedBucket = [];

  samples.forEach((sample) => {
    const nearestPath = sample?.nearest?.[0]?.image_path;
    const nearestClass = nearestPath ? pathClassMap.get(nearestPath) : null;
    const matchedSector = findSectorForClass(nearestClass, sectors);

    if (matchedSector) {
      if (!sectorBuckets.has(matchedSector.className)) {
        sectorBuckets.set(matchedSector.className, []);
      }
      sectorBuckets.get(matchedSector.className).push({ sample, nearestClass, sector: matchedSector });
    } else {
      unassignedBucket.push({ sample, nearestClass, sector: null });
    }
  });

  const placedMarkers = [];

  // Helper to place a bucket of samples evenly within an angular span [startAngle, endAngle]
  const placeBucket = (items, startAngle, endAngle) => {
    if (!items || items.length === 0) return;

    // Stable sort by sample index
    items.sort((a, b) => (a.sample.index ?? 0) - (b.sample.index ?? 0));

    const count = items.length;
    const span = endAngle - startAngle;

    items.forEach((item, idx) => {
      const { sample, nearestClass, sector } = item;
      const sim = sample?.nearest_similarity ?? sample?.nearest?.[0]?.similarity ?? 0.5;
      const r = distanceToRadius(sim, dmax, outerRadius);
      const zone = classifyZone(sim, baselineThreshold, sample?.covered);

      // Angular position: evenly spaced with inward padding
      const padFraction = count === 1 ? 0.5 : 0.08;
      const effectiveStart = startAngle + span * padFraction;
      const effectiveSpan = span * (1 - 2 * padFraction);
      const step = count > 1 ? effectiveSpan / (count - 1) : 0;
      const baseAngleDeg = count === 1 ? (startAngle + endAngle) / 2 : effectiveStart + idx * step;

      // Convert to radians (0 = 3 o'clock, 90 = 6 o'clock)
      const rad = (baseAngleDeg * Math.PI) / 180;
      const x = centerX + r * Math.cos(rad);
      const y = centerY + r * Math.sin(rad);

      placedMarkers.push({
        sample,
        index: sample.index,
        similarity: sim,
        radius: r,
        angleDeg: baseAngleDeg,
        rad,
        x,
        y,
        zone,
        nearestClass,
        sectorName: sector?.className || null,
      });
    });
  };

  // Place sector buckets
  sectors.forEach((sec) => {
    const bucket = sectorBuckets.get(sec.className) || [];
    placeBucket(bucket, sec.startAngle, sec.endAngle);
  });

  // Place unassigned bucket across right and left arcs alternatively
  if (unassignedBucket.length > 0) {
    if (sectors.length === 0) {
      // Free arcs: split between right and left arcs
      const half = Math.ceil(unassignedBucket.length / 2);
      const rightGroup = unassignedBucket.slice(0, half);
      const leftGroup = unassignedBucket.slice(half);

      placeBucket(rightGroup, CORRIDORS.rightArc.start + 6, CORRIDORS.rightArc.end - 6);
      placeBucket(leftGroup, CORRIDORS.leftArc.start + 6, CORRIDORS.leftArc.end - 6);
    } else {
      // Place within available arcs
      placeBucket(unassignedBucket, CORRIDORS.rightArc.start + 4, CORRIDORS.rightArc.end - 4);
    }
  }

  // 2. Collision resolution: Iterative repulsion if two markers are closer than MIN_MARKER_DISTANCE
  const iterations = 6;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < placedMarkers.length; i++) {
      for (let j = i + 1; j < placedMarkers.length; j++) {
        const m1 = placedMarkers[i];
        const m2 = placedMarkers[j];

        const dx = m2.x - m1.x;
        const dy = m2.y - m1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MIN_MARKER_DISTANCE && dist > 0.001) {
          const overlap = (MIN_MARKER_DISTANCE - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          // Nudge along separation vector
          m1.x -= nx * overlap * 0.6;
          m1.y -= ny * overlap * 0.6;
          m2.x += nx * overlap * 0.6;
          m2.y += ny * overlap * 0.6;

          // Keep within reasonable bounds
          const r1 = Math.sqrt((m1.x - centerX) ** 2 + (m1.y - centerY) ** 2);
          if (r1 > outerRadius + 6) {
            m1.x = centerX + (m1.x - centerX) * ((outerRadius + 6) / r1);
            m1.y = centerY + (m1.y - centerY) * ((outerRadius + 6) / r1);
          }
          const r2 = Math.sqrt((m2.x - centerX) ** 2 + (m2.y - centerY) ** 2);
          if (r2 > outerRadius + 6) {
            m2.x = centerX + (m2.x - centerX) * ((outerRadius + 6) / r2);
            m2.y = centerY + (m2.y - centerY) * ((outerRadius + 6) / r2);
          }
        }
      }
    }
  }

  return placedMarkers;
}

/**
 * Layouts baseline dataset dots with deterministic jitter from seeded hash of index.
 *
 * @param {Object} params
 * @param {Array<Object>} params.baselinePoints - Array of { similarity, class_label }
 * @param {Array<Object>} params.sectors - Computed sectors
 * @param {number} params.dmax - Scale dmax
 * @param {number} params.outerRadius - Chart outer radius
 * @param {number} params.centerX - SVG center X
 * @param {number} params.centerY - SVG center Y
 * @returns {Array<Object>} Placed dot objects { x, y, radius, similarity, class_label }
 */
export function layoutBaselineDots({
  baselinePoints = [],
  sectors = [],
  dmax = 0.5,
  outerRadius = 210,
  centerX = 300,
  centerY = 300,
}) {
  if (!Array.isArray(baselinePoints) || baselinePoints.length === 0) {
    return [];
  }

  const dots = [];

  baselinePoints.forEach((bp, idx) => {
    const sim = bp?.similarity;
    if (typeof sim !== 'number' || isNaN(sim)) return;

    const r = distanceToRadius(sim, dmax, outerRadius);
    const sec = findSectorForClass(bp.class_label, sectors);

    let startDeg;
    let endDeg;

    if (sec) {
      startDeg = sec.startAngle + 2;
      endDeg = sec.endAngle - 2;
    } else {
      // Split between right and left arcs deterministically
      const useRight = seededRandom(idx * 7) < 0.5;
      if (useRight) {
        startDeg = CORRIDORS.rightArc.start + 4;
        endDeg = CORRIDORS.rightArc.end - 4;
      } else {
        startDeg = CORRIDORS.leftArc.start + 4;
        endDeg = CORRIDORS.leftArc.end - 4;
      }
    }

    // Deterministic angle jitter
    const jitterFactor = seededRandom(idx * 13 + 37);
    const angleDeg = startDeg + jitterFactor * (endDeg - startDeg);
    const rad = (angleDeg * Math.PI) / 180;

    dots.push({
      index: idx,
      similarity: sim,
      class_label: bp.class_label,
      radius: r,
      angleDeg,
      x: centerX + r * Math.cos(rad),
      y: centerY + r * Math.sin(rad),
    });
  });

  return dots;
}

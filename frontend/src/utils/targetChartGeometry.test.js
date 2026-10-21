import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEAR_MISS_MARGIN,
  MIN_MARKER_DISTANCE,
  computeDmax,
  distanceToRadius,
  classifyZone,
  computeSectors,
  findSectorForClass,
  layoutPhotoMarkers,
  layoutBaselineDots,
  seededRandom,
} from './targetChartGeometry.js';

test('computeDmax: respects cutoffD * 1.6 and keeps cutoff ring readable', () => {
  const threshold = 0.60; // cutoffD = 0.40
  const dmax = computeDmax({
    baselineThreshold: threshold,
    samples: [{ nearest_similarity: 0.50 }], // maxPhotoD = 0.50 -> 0.50 * 1.1 = 0.55
    baselinePoints: [{ similarity: 0.70 }],
  });

  // cutoffD * 1.6 = 0.40 * 1.6 = 0.64
  // maxPhotoD * 1.1 = 0.55
  // max should be at least 0.64
  assert.ok(dmax >= 0.64, `Expected dmax >= 0.64, got ${dmax}`);
});

test('computeDmax: accounts for distant photos', () => {
  const threshold = 0.80; // cutoffD = 0.20 -> * 1.6 = 0.32
  const dmax = computeDmax({
    baselineThreshold: threshold,
    samples: [{ nearest_similarity: 0.10 }], // maxPhotoD = 0.90 -> 0.90 * 1.1 = 0.99
    baselinePoints: [],
  });

  assert.ok(dmax >= 0.99, `Expected dmax >= 0.99 for distant photo, got ${dmax}`);
});

test('distanceToRadius: center is similarity 1.0 (distance 0)', () => {
  const outerRadius = 200;
  const dmax = 0.5;

  const rCenter = distanceToRadius(1.0, dmax, outerRadius);
  assert.equal(rCenter, 0, 'Similarity 1.0 must be placed at the center (radius 0)');

  const rMiddle = distanceToRadius(0.75, dmax, outerRadius);
  // d = 0.25 -> 0.25 / 0.5 * 200 = 100
  assert.equal(Math.round(rMiddle), 100);

  const rOuter = distanceToRadius(0.50, dmax, outerRadius);
  // d = 0.50 -> 0.50 / 0.5 * 200 = 200
  assert.equal(Math.round(rOuter), 200);

  // Clamped at outer radius when d > dmax
  const rBeyond = distanceToRadius(0.20, dmax, outerRadius);
  assert.equal(rBeyond, outerRadius);
});

test('classifyZone: boundary values for covered, near_miss, far_outside', () => {
  const threshold = 0.60; // cutoffD = 0.40
  // NEAR_MISS_MARGIN = 0.10
  // Near miss band: d in (0.40, 0.50] => similarity in [0.50, 0.60)
  // Far outside band: d > 0.50 => similarity < 0.50

  // 1. Covered (similarity >= 0.60)
  assert.equal(classifyZone(0.75, threshold), 'covered');
  assert.equal(classifyZone(0.60, threshold), 'covered', 'Exact cutoff threshold must be covered');

  // 2. Near miss (similarity in [0.50, 0.5999])
  assert.equal(classifyZone(0.59, threshold), 'near_miss');
  assert.equal(classifyZone(0.50, threshold), 'near_miss', 'Boundary of near miss (cutoff - 0.10) must be near_miss');

  // 3. Far outside (similarity < 0.50)
  assert.equal(classifyZone(0.49, threshold), 'far_outside');
  assert.equal(classifyZone(0.20, threshold), 'far_outside');
  assert.equal(classifyZone(0.0, threshold), 'far_outside');
});

test('classifyZone: strictly honors backend covered flag for covered category', () => {
  const threshold = 0.60;
  // If backend says covered=true, must return covered
  assert.equal(classifyZone(0.58, threshold, true), 'covered');
  // If backend says covered=false, must split into near_miss or far_outside
  assert.equal(classifyZone(0.58, threshold, false), 'near_miss');
  assert.equal(classifyZone(0.30, threshold, false), 'far_outside');
});

test('computeSectors: handles 0, 1, 2, and > 6 classes correctly', () => {
  // 0 classes
  assert.deepEqual(computeSectors([]), []);

  // 1 class -> no sector divisions, free arcs
  assert.deepEqual(computeSectors([{ class_label: 'cats' }, { class_label: 'cats' }]), []);

  // 2 classes -> 1 per side
  const twoSec = computeSectors([
    { class_label: 'cats' },
    { class_label: 'dogs' },
  ]);
  assert.equal(twoSec.length, 2);
  const sides = twoSec.map((s) => s.side);
  assert.ok(sides.includes('right') && sides.includes('left'), 'Two classes must be placed on opposite sides');

  // > 6 classes -> top 5 + "Other"
  const multiClasses = [
    ...Array(50).fill({ class_label: 'class_A' }),
    ...Array(40).fill({ class_label: 'class_B' }),
    ...Array(30).fill({ class_label: 'class_C' }),
    ...Array(20).fill({ class_label: 'class_D' }),
    ...Array(15).fill({ class_label: 'class_E' }),
    ...Array(10).fill({ class_label: 'class_F' }),
    ...Array(5).fill({ class_label: 'class_G' }),
  ];
  const multiSec = computeSectors(multiClasses);
  assert.equal(multiSec.length, 6, 'Must cap to top 5 plus Other');
  assert.ok(multiSec.some((s) => s.className === 'Other'), 'Must contain "Other" sector');
});

test('layoutPhotoMarkers: maintains minimum center distance separation', () => {
  // Create 4 samples with very close similarities and same class
  const samples = [
    { index: 0, nearest_similarity: 0.65, nearest: [{ image_path: 'p0.jpg' }] },
    { index: 1, nearest_similarity: 0.65, nearest: [{ image_path: 'p1.jpg' }] },
    { index: 2, nearest_similarity: 0.65, nearest: [{ image_path: 'p2.jpg' }] },
    { index: 3, nearest_similarity: 0.65, nearest: [{ image_path: 'p3.jpg' }] },
  ];
  const pathMap = new Map([
    ['p0.jpg', 'birds'],
    ['p1.jpg', 'birds'],
    ['p2.jpg', 'birds'],
    ['p3.jpg', 'birds'],
  ]);

  const placed = layoutPhotoMarkers({
    samples,
    sectors: [],
    pathClassMap: pathMap,
    dmax: 0.5,
    outerRadius: 210,
    baselineThreshold: 0.60,
    centerX: 300,
    centerY: 300,
  });

  assert.equal(placed.length, 4);

  // Check pairwise distances
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const dx = placed[j].x - placed[i].x;
      const dy = placed[j].y - placed[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      assert.ok(
        dist >= MIN_MARKER_DISTANCE * 0.9,
        `Pair (${i}, ${j}) distance ${dist.toFixed(1)} must be close to or exceed MIN_MARKER_DISTANCE (${MIN_MARKER_DISTANCE})`
      );
    }
  }
});

test('layoutBaselineDots: deterministic placement with seeded hash', () => {
  const baselinePoints = [
    { similarity: 0.82, class_label: 'cat' },
    { similarity: 0.74, class_label: 'dog' },
    { similarity: 0.68, class_label: 'cat' },
  ];

  const run1 = layoutBaselineDots({
    baselinePoints,
    sectors: [],
    dmax: 0.5,
    outerRadius: 210,
    centerX: 300,
    centerY: 300,
  });

  const run2 = layoutBaselineDots({
    baselinePoints,
    sectors: [],
    dmax: 0.5,
    outerRadius: 210,
    centerX: 300,
    centerY: 300,
  });

  assert.equal(run1.length, 3);
  for (let i = 0; i < run1.length; i++) {
    assert.equal(run1[i].x, run2[i].x, 'Coordinates must be identical across renders');
    assert.equal(run1[i].y, run2[i].y, 'Coordinates must be identical across renders');
  }
});

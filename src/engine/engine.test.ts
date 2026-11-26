import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCity, PLACES, Runner, nodeNearIn, setTraffic, getCityGapsWorld} from './graph';
import {INITIAL_SATELLITES, computeGpsFix, snapPointToRoadGraph} from './satellites';
import {
  EULER_LEVELS,
  analyzeEulerGraph,
  createEulerWalk,
  stepEulerWalkByNode,
  undoEulerWalk,
} from './euler';
import {CITIES} from './graph';
import {
  buildGeoBoundsProjection,
  expandGeoBounds,
  nearestNodeToLatLng,
  worldToLatLng,
} from './geoGraph';

test('A* and Dijkstra find identical optimal cost across all 5 cities and A* expands fewer nodes', () => {
  for (const key of ['cairo', 'tokyo', 'newyork', 'paris', 'sydney'] as const) {
    const G = buildCity(key);
    setTraffic(G, false, 0);
    const s = nodeNearIn(G, PLACES[key][0].fx, PLACES[key][0].fy);
    const t = nodeNearIn(G, PLACES[key][1].fx, PLACES[key][1].fy);
    const d = new Runner(G, s, t, false);
    const a = new Runner(G, s, t, true);
    while (!d.done) d.step();
    while (!a.done) a.step();
    assert.equal(d.found, true);
    assert.equal(a.found, true);
    assert.ok(Math.abs(d.cost - a.cost) < 1e-6);
    assert.ok(a.expanded <= d.expanded);
  }
});

test('GPS trilateration accuracy degrades as satellites drop or inside a signal gap, and map-matching snaps onto graph', () => {
  const G = buildCity('cairo');
  const openNode = nodeNearIn(G, 0.1, 0.2);
  const openX = G.nx[openNode];
  const openY = G.ny[openNode];

  const fix4 = computeGpsFix(G, openX, openY, INITIAL_SATELLITES, 1.0, false);
  assert.equal(fix4.lockedCount, 4);
  assert.equal(fix4.fixQuality, '3D-LOCK');
  assert.ok(fix4.accuracyMeters <= 10);

  const twoSats = INITIAL_SATELLITES.map((s, i) => ({...s, enabled: i < 2}));
  const fix2 = computeGpsFix(G, openX, openY, twoSats, 1.0, false);
  assert.equal(fix2.lockedCount, 2);
  assert.equal(fix2.fixQuality, '2D-DRIFT');
  assert.ok(fix2.accuracyMeters > 100);

  const gap = getCityGapsWorld(G)[0];
  const fixGap = computeGpsFix(G, gap.wx, gap.wy, INITIAL_SATELLITES, 1.0, false);
  assert.equal(fixGap.fixQuality, 'SIGNAL-GAP');
  assert.ok(fixGap.lockedCount < 3);

  const fixRelayed = computeGpsFix(G, gap.wx, gap.wy, INITIAL_SATELLITES, 1.0, true);
  assert.equal(fixRelayed.fixQuality, '3D-LOCK');
  assert.equal(fixRelayed.lockedCount, 4);

  const snapped = snapPointToRoadGraph(G, fixGap.rawX, fixGap.rawY);
  assert.ok(snapped.node >= 0);
  assert.equal(G.alive[snapped.node], 1);
});

test('Euler theorem classifies Königsberg as IMPOSSIBLE until 8th bridge is enabled, and solves Cairo path', () => {
  const konig = EULER_LEVELS.find((l) => l.id === 'konigsberg')!;
  const before = analyzeEulerGraph(konig, false);
  assert.equal(before.oddCount, 4);
  assert.equal(before.classification, 'IMPOSSIBLE');

  const after = analyzeEulerGraph(konig, true);
  assert.equal(after.oddCount, 2);
  assert.equal(after.classification, 'EULERIAN_PATH');

  // Verify Cairo Nile Crossing (level 02) can be traversed completely via Eulerian Path
  const cairo = EULER_LEVELS.find((l) => l.id === 'cairo-nile')!;
  const cairoAnalysis = analyzeEulerGraph(cairo, false);
  assert.equal(cairoAnalysis.classification, 'EULERIAN_PATH');
  assert.equal(cairoAnalysis.oddCount, 2);

  // Odd vertices in cairo-nile: node 0 (deg 3: edges 0,1,6) and node 3 (deg 3: edges 3,5,6)
  // Valid walk covering all 7 edges: 0 -> 1 -> 2 -> 0 -> 3 -> 2 -> 4 -> 3
  let walk = createEulerWalk(cairo);
  for (const nodeId of [0, 1, 2, 0, 3, 2, 4, 3]) {
    const res = stepEulerWalkByNode(cairo, walk, nodeId);
    assert.equal(res.moved, true);
    walk = res.next;
  }
  assert.equal(walk.completed, true);
  assert.equal(walk.edgeHistory.length, 7);

  const undone = undoEulerWalk(walk);
  assert.equal(undone.completed, false);
  assert.equal(undone.edgeHistory.length, 6);
});

test('GeoBoundsProjection spans all 5 cities, maps all landmarks inside bounds, and expands for outer pins', () => {
  for (const key of ['cairo', 'tokyo', 'newyork', 'paris', 'sydney'] as const) {
    const G = buildCity(key);
    const geo = CITIES[key].geo;
    const proj = buildGeoBoundsProjection(G, geo.bounds);

    for (const place of PLACES[key]) {
      assert.ok(place.lat <= geo.bounds.north && place.lat >= geo.bounds.south);
      assert.ok(place.lng >= geo.bounds.west && place.lng <= geo.bounds.east);
      const n = nearestNodeToLatLng(G, proj, place.lat, place.lng);
      assert.ok(n >= 0 && G.alive[n] === 1);
      const ll = worldToLatLng(proj, G.nx[n], G.ny[n]);
      assert.ok(Math.abs(ll.lat - place.lat) < 0.03);
      assert.ok(Math.abs(ll.lng - place.lng) < 0.03);
    }

    const farPin = {lat: geo.bounds.north + 0.08, lng: geo.bounds.east + 0.08};
    const expanded = expandGeoBounds(geo.bounds, [geo.origin, farPin]);
    assert.ok(expanded.north > farPin.lat);
    assert.ok(expanded.east > farPin.lng);
  }
});

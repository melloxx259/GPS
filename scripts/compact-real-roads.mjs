import fs from 'node:fs';
import path from 'node:path';

const PLACES = {
  cairo: [
    {n: 'Giza Pyramids', lat: 29.9792, lng: 31.1342},
    {n: 'Khan el-Khalili', lat: 30.0477, lng: 31.2623},
    {n: 'Cairo Tower', lat: 30.0459, lng: 31.2243},
    {n: 'Tahrir Square', lat: 30.0444, lng: 31.2357},
    {n: 'Citadel', lat: 30.0299, lng: 31.2611},
    {n: 'Airport', lat: 30.1119, lng: 31.4056},
    {n: 'Maadi', lat: 29.9602, lng: 31.2569},
  ],
  tokyo: [
    {n: 'Shinjuku', lat: 35.6938, lng: 139.7034},
    {n: 'Skytree', lat: 35.7101, lng: 139.8107},
    {n: 'Shibuya', lat: 35.658, lng: 139.7016},
    {n: 'Tokyo Station', lat: 35.6812, lng: 139.7671},
    {n: 'Ueno', lat: 35.7141, lng: 139.7774},
    {n: 'Asakusa', lat: 35.7148, lng: 139.7967},
    {n: 'Haneda', lat: 35.5494, lng: 139.7798},
  ],
  newyork: [
    {n: 'Central Park', lat: 40.7829, lng: -73.9654},
    {n: 'Queens', lat: 40.7447, lng: -73.9485},
    {n: 'Midtown', lat: 40.7549, lng: -73.984},
    {n: 'Wall Street', lat: 40.7074, lng: -74.0113},
    {n: 'Chelsea', lat: 40.7465, lng: -74.0014},
    {n: 'Brooklyn', lat: 40.6782, lng: -73.9442},
    {n: 'East Village', lat: 40.7265, lng: -73.9815},
  ],
  paris: [
    {n: 'Eiffel Tower', lat: 48.8584, lng: 2.2945},
    {n: 'Sacré-Cœur', lat: 48.8867, lng: 2.3431},
    {n: 'Louvre', lat: 48.8606, lng: 2.3376},
    {n: 'Notre-Dame', lat: 48.853, lng: 2.3499},
    {n: 'Arc de Triomphe', lat: 48.8738, lng: 2.295},
    {n: 'Montparnasse', lat: 48.8421, lng: 2.3219},
    {n: 'Gare de Lyon', lat: 48.8443, lng: 2.3744},
  ],
  sydney: [
    {n: 'Bondi', lat: -33.8915, lng: 151.2767},
    {n: 'Manly', lat: -33.7971, lng: 151.288},
    {n: 'Opera House', lat: -33.8568, lng: 151.2153},
    {n: 'Chatswood', lat: -33.7969, lng: 151.1831},
    {n: 'Darling Harbour', lat: -33.8749, lng: 151.1995},
    {n: 'Central Station', lat: -33.8832, lng: 151.2067},
    {n: 'Airport', lat: -33.9399, lng: 151.1753},
  ],
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function simplifyPoly(pts, epsDeg = 0.00024) {
  if (pts.length <= 2) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let maxDist = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d =
      len < 1e-12
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  if (maxDist > epsDeg) {
    const left = simplifyPoly(pts.slice(0, idx + 1), epsDeg);
    const right = simplifyPoly(pts.slice(idx), epsDeg);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

const BOUNDS = {
  cairo: {south: 29.943, west: 31.088, north: 30.132, east: 31.425},
  tokyo: {south: 35.532, west: 139.65, north: 35.748, east: 139.865},
  newyork: {south: 40.665, west: -74.028, north: 40.805, east: -73.927},
  paris: {south: 48.818, west: 2.27, north: 48.898, east: 2.395},
  sydney: {south: -33.953, west: 151.155, north: -33.772, east: 151.305},
};

function compactCity(cityKey) {
  const filePath = path.resolve('src/engine/realRoads', `${cityKey}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const places = PLACES[cityKey];
  const box = BOUNDS[cityKey];

  let nodes = data.nodes.slice();
  const inBox = (lat, lng) =>
    lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;
  let edges = data.edges
    .map((e, id) => ({
      id,
      u: e[0],
      v: e[1],
      s: e[2],
      km: e[3],
      n: e[4],
      pts: [nodes[e[0]], ...(e[5] || []), nodes[e[1]]],
      alive:
        inBox(nodes[e[0]][0], nodes[e[0]][1]) &&
        inBox(nodes[e[1]][0], nodes[e[1]][1]),
    }));

  // Protect closest alive node to every landmark
  const hasAliveEdge = new Set();
  for (const e of edges) {
    if (e.alive) {
      hasAliveEdge.add(e.u);
      hasAliveEdge.add(e.v);
    }
  }
  const protectedNodes = new Set();
  for (const pl of places) {
    let best = 0;
    let bestD = Infinity;
    for (const i of hasAliveEdge) {
      const d = haversineKm(pl.lat, pl.lng, nodes[i][0], nodes[i][1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    protectedNodes.add(best);
  }

  // Build adjacency
  const adj = Array.from({length: nodes.length}, () => []);
  for (const e of edges) {
    adj[e.u].push(e);
    adj[e.v].push(e);
  }

  // 1. Iteratively prune short degree-1 dead-end spurs (that aren't protected landmarks)
  let changed = true;
  while (changed) {
    changed = false;
    for (let u = 0; u < nodes.length; u++) {
      if (protectedNodes.has(u)) continue;
      const active = adj[u].filter((e) => e.alive);
      if (active.length === 1 && active[0].s < 55) {
        active[0].alive = false;
        changed = true;
      }
    }
  }

  // 2. Contract degree-2 pass-through vertices when same speed tier and merged length < 1.1km
  for (let u = 0; u < nodes.length; u++) {
    if (protectedNodes.has(u)) continue;
    const active = adj[u].filter((e) => e.alive);
    if (active.length !== 2) continue;
    const [e1, e2] = active;
    const a = e1.u === u ? e1.v : e1.u;
    const b = e2.u === u ? e2.v : e2.u;
    if (a === b) continue;
    if (e1.s !== e2.s) continue;
    if (e1.km + e2.km > 1.1) continue;
    // Check there isn't already a direct edge between a and b
    if (adj[a].some((ex) => ex.alive && ((ex.u === a && ex.v === b) || (ex.u === b && ex.v === a)))) {
      continue;
    }

    const p1 = e1.u === a ? e1.pts : [...e1.pts].reverse();
    const p2 = e2.u === u ? e2.pts : [...e2.pts].reverse();
    const mergedPts = simplifyPoly(p1.slice(0, -1).concat(p2), 0.00024);

    e1.alive = false;
    e2.alive = false;
    const ne = {
      id: edges.length,
      u: a,
      v: b,
      s: e1.s,
      km: Math.round((e1.km + e2.km) * 1000) / 1000,
      n: e1.n || e2.n,
      pts: mergedPts,
      alive: true,
    };
    edges.push(ne);
    adj[a].push(ne);
    adj[b].push(ne);
  }

  // 3. Keep largest connected component of alive edges
  const aliveEdgesAll = edges.filter((e) => e.alive);
  const compAdj = Array.from({length: nodes.length}, () => []);
  for (const e of aliveEdgesAll) {
    compAdj[e.u].push(e.v);
    compAdj[e.v].push(e.u);
  }
  const comp = new Int32Array(nodes.length).fill(-1);
  let bestCid = -1;
  let bestSize = 0;
  let cid = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (compAdj[s].length === 0 || comp[s] !== -1) continue;
    let size = 0;
    const stack = [s];
    comp[s] = cid;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const v of compAdj[u]) {
        if (comp[v] === -1) {
          comp[v] = cid;
          stack.push(v);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestCid = cid;
    }
    cid++;
  }

  const aliveEdges = aliveEdgesAll.filter((e) => comp[e.u] === bestCid && comp[e.v] === bestCid);
  const used = new Set();
  for (const e of aliveEdges) {
    used.add(e.u);
    used.add(e.v);
  }

  const oldToNew = new Int32Array(nodes.length).fill(-1);
  const outNodes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (used.has(i)) {
      oldToNew[i] = outNodes.length;
      outNodes.push(nodes[i]);
    }
  }
  const outEdges = aliveEdges.map((e) => [
    oldToNew[e.u],
    oldToNew[e.v],
    e.s,
    e.km,
    e.n,
    e.pts.length > 2 ? e.pts.slice(1, -1) : [],
  ]);

  const outJson = JSON.stringify({nodes: outNodes, edges: outEdges});
  fs.writeFileSync(filePath, outJson);
  const landmarkMaxM = Math.max(
    ...places.map((pl) =>
      Math.min(...outNodes.map(([lat, lng]) => haversineKm(pl.lat, pl.lng, lat, lng) * 1000)),
    ),
  );
  console.log(
    `${cityKey}: compacted to ${outNodes.length} junctions, ${outEdges.length} edges (${(outJson.length / 1024).toFixed(1)} KB), max landmark dist ${landmarkMaxM.toFixed(0)}m`,
  );
}

for (const k of Object.keys(PLACES)) {
  compactCity(k);
}

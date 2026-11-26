import fs from 'node:fs';
import path from 'node:path';

const CITIES = {
  cairo: {
    south: 29.948,
    west: 31.092,
    north: 30.128,
    east: 31.42,
    places: [
      {n: 'Giza Pyramids', lat: 29.9792, lng: 31.1342},
      {n: 'Khan el-Khalili', lat: 30.0477, lng: 31.2623},
      {n: 'Cairo Tower', lat: 30.0459, lng: 31.2243},
      {n: 'Tahrir Square', lat: 30.0444, lng: 31.2357},
      {n: 'Citadel', lat: 30.0299, lng: 31.2611},
      {n: 'Airport', lat: 30.1119, lng: 31.4056},
      {n: 'Maadi', lat: 29.9602, lng: 31.2569},
    ],
  },
  tokyo: {
    south: 35.535,
    west: 139.655,
    north: 35.745,
    east: 139.86,
    places: [
      {n: 'Shinjuku', lat: 35.6938, lng: 139.7034},
      {n: 'Skytree', lat: 35.7101, lng: 139.8107},
      {n: 'Shibuya', lat: 35.658, lng: 139.7016},
      {n: 'Tokyo Station', lat: 35.6812, lng: 139.7671},
      {n: 'Ueno', lat: 35.7141, lng: 139.7774},
      {n: 'Asakusa', lat: 35.7148, lng: 139.7967},
      {n: 'Haneda', lat: 35.5494, lng: 139.7798},
    ],
  },
  newyork: {
    south: 40.668,
    west: -74.025,
    north: 40.802,
    east: -73.93,
    places: [
      {n: 'Central Park', lat: 40.7829, lng: -73.9654},
      {n: 'Queens', lat: 40.7447, lng: -73.9485},
      {n: 'Midtown', lat: 40.7549, lng: -73.984},
      {n: 'Wall Street', lat: 40.7074, lng: -74.0113},
      {n: 'Chelsea', lat: 40.7465, lng: -74.0014},
      {n: 'Brooklyn', lat: 40.6782, lng: -73.9442},
      {n: 'East Village', lat: 40.7265, lng: -73.9815},
    ],
  },
  paris: {
    south: 48.822,
    west: 2.275,
    north: 48.895,
    east: 2.392,
    places: [
      {n: 'Eiffel Tower', lat: 48.8584, lng: 2.2945},
      {n: 'Sacré-Cœur', lat: 48.8867, lng: 2.3431},
      {n: 'Louvre', lat: 48.8606, lng: 2.3376},
      {n: 'Notre-Dame', lat: 48.853, lng: 2.3499},
      {n: 'Arc de Triomphe', lat: 48.8738, lng: 2.295},
      {n: 'Montparnasse', lat: 48.8421, lng: 2.3219},
      {n: 'Gare de Lyon', lat: 48.8443, lng: 2.3744},
    ],
  },
  sydney: {
    south: -33.95,
    west: 151.16,
    north: -33.775,
    east: 151.3,
    places: [
      {n: 'Bondi', lat: -33.8915, lng: 151.2767},
      {n: 'Manly', lat: -33.7971, lng: 151.288},
      {n: 'Opera House', lat: -33.8568, lng: 151.2153},
      {n: 'Chatswood', lat: -33.7969, lng: 151.1831},
      {n: 'Darling Harbour', lat: -33.8749, lng: 151.1995},
      {n: 'Central Station', lat: -33.8832, lng: 151.2067},
      {n: 'Airport', lat: -33.9399, lng: 151.1753},
    ],
  },
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

function speedForHighway(hw) {
  switch (hw) {
    case 'motorway':
      return 80;
    case 'motorway_link':
    case 'trunk':
      return 70;
    case 'trunk_link':
    case 'primary':
      return 55;
    case 'primary_link':
    case 'secondary':
      return 45;
    default:
      return 32;
  }
}

function round5(v) {
  return Math.round(v * 1e5) / 1e5;
}

function simplifyPoly(pts, epsDeg = 0.00018) {
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

async function fetchOverpass(cityKey, cfg) {
  const query = `[out:json][timeout:35];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary)$"](${cfg.south},${cfg.west},${cfg.north},${cfg.east});out geom;`;
  const endpoints = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RouteRaceEduApp/1.0',
        },
        body: new URLSearchParams({data: query}),
      });
      if (!res.ok) {
        console.warn(`${cityKey} ${url} -> ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (Array.isArray(data.elements) && data.elements.length > 0) {
        return data.elements;
      }
    } catch (e) {
      console.warn(`${cityKey} ${url} err:`, e.message);
    }
  }
  throw new Error(`Failed Overpass for ${cityKey}`);
}

function buildGraphFromOsmWays(cityKey, cfg, ways) {
  // 1. Count node degree across ways to find junctions
  const osmNodeCount = new Map();
  const osmNodePos = new Map();
  for (const w of ways) {
    if (!w.nodes || !w.geometry || w.nodes.length !== w.geometry.length) continue;
    for (let i = 0; i < w.nodes.length; i++) {
      const nid = w.nodes[i];
      const g = w.geometry[i];
      osmNodeCount.set(nid, (osmNodeCount.get(nid) || 0) + 1);
      if (!osmNodePos.has(nid)) osmNodePos.set(nid, [g.lat, g.lon]);
    }
  }

  // 2. Spatial snap cell (~28m) to unify overlapping intersection nodes
  const cellLat = 0.00025;
  const cellLng = 0.00028;
  const cellToVertex = new Map();
  const vertices = []; // [lat, lng]
  const osmToVertex = new Map();

  function getOrCreateVertex(lat, lng, osmId) {
    if (osmId != null && osmToVertex.has(osmId)) return osmToVertex.get(osmId);
    const cy = Math.round(lat / cellLat);
    const cx = Math.round(lng / cellLng);
    const key = `${cy}:${cx}`;
    let vid = cellToVertex.get(key);
    if (vid === undefined) {
      vid = vertices.length;
      vertices.push([round5(lat), round5(lng)]);
      cellToVertex.set(key, vid);
    }
    if (osmId != null) osmToVertex.set(osmId, vid);
    return vid;
  }

  // 3. Split ways at junctions and long stretches (>0.45 km)
  const rawEdges = [];
  const seenEdgePair = new Set();

  for (const w of ways) {
    if (!w.nodes || !w.geometry || w.nodes.length < 2) continue;
    const hw = w.tags?.highway || 'secondary';
    const speed = speedForHighway(hw);
    const name = w.tags?.['name:en'] || w.tags?.name || w.tags?.ref || '';

    let segStartIdx = 0;
    let accumKm = 0;
    let startVid = getOrCreateVertex(
      w.geometry[0].lat,
      w.geometry[0].lon,
      w.nodes[0],
    );

    for (let i = 1; i < w.nodes.length; i++) {
      const prev = w.geometry[i - 1];
      const cur = w.geometry[i];
      accumKm += haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
      const nid = w.nodes[i];
      const isEnd = i === w.nodes.length - 1;
      const isJunc = (osmNodeCount.get(nid) || 0) >= 2;

      if (isEnd || isJunc || accumKm >= 0.45) {
        const endVid = getOrCreateVertex(cur.lat, cur.lon, nid);
        if (endVid !== startVid) {
          const pts = w.geometry
            .slice(segStartIdx, i + 1)
            .map((p) => [round5(p.lat), round5(p.lon)]);
          // Anchor endpoints exactly to vertices
          pts[0] = vertices[startVid];
          pts[pts.length - 1] = vertices[endVid];
          const simp = simplifyPoly(pts, 0.00018);

          const a = Math.min(startVid, endVid);
          const b = Math.max(startVid, endVid);
          const pairKey = `${a}:${b}`;
          if (!seenEdgePair.has(pairKey)) {
            seenEdgePair.add(pairKey);
            let km = 0;
            for (let k = 1; k < simp.length; k++) {
              km += haversineKm(simp[k - 1][0], simp[k - 1][1], simp[k][0], simp[k][1]);
            }
            if (km > 0.005) {
              rawEdges.push({
                u: startVid,
                v: endVid,
                s: speed,
                km: Math.round(km * 1000) / 1000,
                n: name,
                p: simp,
              });
            }
          }
        }
        startVid = endVid;
        segStartIdx = i;
        accumKm = 0;
      }
    }
  }

  // 4. Largest connected component
  const adj = Array.from({length: vertices.length}, () => []);
  for (let i = 0; i < rawEdges.length; i++) {
    adj[rawEdges[i].u].push(i);
    adj[rawEdges[i].v].push(i);
  }
  const comp = new Int32Array(vertices.length).fill(-1);
  let bestCid = -1;
  let bestSize = 0;
  let cid = 0;
  for (let s = 0; s < vertices.length; s++) {
    if (comp[s] !== -1) continue;
    let size = 0;
    const stack = [s];
    comp[s] = cid;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const ei of adj[u]) {
        const e = rawEdges[ei];
        const v = e.u === u ? e.v : e.u;
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

  // Re-index to compact vertex list
  const oldToNew = new Int32Array(vertices.length).fill(-1);
  const nodes = [];
  for (let i = 0; i < vertices.length; i++) {
    if (comp[i] === bestCid) {
      oldToNew[i] = nodes.length;
      nodes.push(vertices[i]);
    }
  }
  const edges = [];
  for (const e of rawEdges) {
    const nu = oldToNew[e.u];
    const nv = oldToNew[e.v];
    if (nu >= 0 && nv >= 0) {
      // Store compact intermediate points only if > 2 points
      edges.push([
        nu,
        nv,
        e.s,
        e.km,
        e.n,
        e.p.length > 2 ? e.p.slice(1, -1) : [],
      ]);
    }
  }

  // Check landmark nearest distances
  const landmarkDists = cfg.places.map((pl) => {
    let bestD = Infinity;
    for (const [lat, lng] of nodes) {
      const d = haversineKm(pl.lat, pl.lng, lat, lng);
      if (d < bestD) bestD = d;
    }
    return `${pl.n}: ${(bestD * 1000).toFixed(0)}m`;
  });

  console.log(
    `${cityKey}: ${ways.length} OSM ways -> ${nodes.length} junctions, ${edges.length} road edges | ${landmarkDists.join(', ')}`,
  );
  return {nodes, edges};
}

async function main() {
  const outDir = path.resolve('src/engine/realRoads');
  fs.mkdirSync(outDir, {recursive: true});

  for (const [cityKey, cfg] of Object.entries(CITIES)) {
    const ways = await fetchOverpass(cityKey, cfg);
    const graphData = buildGraphFromOsmWays(cityKey, cfg, ways);
    const outFile = path.join(outDir, `${cityKey}.json`);
    fs.writeFileSync(outFile, JSON.stringify(graphData));
    console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

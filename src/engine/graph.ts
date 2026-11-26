import {clamp, mulberry32} from './prng';
import cairoRoads from './realRoads/cairo.json';
import tokyoRoads from './realRoads/tokyo.json';
import newyorkRoads from './realRoads/newyork.json';
import parisRoads from './realRoads/paris.json';
import sydneyRoads from './realRoads/sydney.json';

type RealRoadEdgeTuple = [number, number, number, number, string, [number, number][]];
interface RealRoadDataset {
  nodes: [number, number][];
  edges: RealRoadEdgeTuple[];
}

const REAL_ROADS: Record<CityKey, RealRoadDataset> = {
  cairo: cairoRoads as unknown as RealRoadDataset,
  tokyo: tokyoRoads as unknown as RealRoadDataset,
  newyork: newyorkRoads as unknown as RealRoadDataset,
  paris: parisRoads as unknown as RealRoadDataset,
  sydney: sydneyRoads as unknown as RealRoadDataset,
};

export const VMAX = 80;

export type CityKey = 'cairo' | 'tokyo' | 'newyork' | 'paris' | 'sydney';

export interface BarrierConfig {
  axis: 'v' | 'h';
  at: number;
  bridges: number[];
  label: string;
}

export interface SignalGapConfig {
  id: string;
  name: string;
  cause: 'Tunnel' | 'Urban Canyon' | 'Dense Canopy';
  fx: number;
  fy: number;
  radiusKm: number;
  attenuation: number; // 0..1 fraction of satellites blocked inside gap
}

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CityConfig {
  name: string;
  seed: number;
  cols: number;
  rows: number;
  sx: number;
  sy: number;
  jit: number;
  remove: number;
  art: number;
  diag: number;
  barrier: BarrierConfig | null;
  note: string;
  geo: {
    center: {lat: number; lng: number};
    zoom: number;
    bounds: GeoBounds;
    origin: {lat: number; lng: number; name: string};
    destination: {lat: number; lng: number; name: string};
  };
  signalGaps: SignalGapConfig[];
}

export interface PlacePreset {
  n: string;
  fx: number;
  fy: number;
  lat: number;
  lng: number;
}

export interface CityGraph {
  key: CityKey;
  cfg: CityConfig;
  isRealRoad: boolean;
  N: number;
  nx: Float64Array;
  ny: Float64Array;
  lat: Float64Array;
  lng: Float64Array;
  alive: Uint8Array;
  count: number;
  adj: number[][];
  eu: number[];
  ev: number[];
  elen: number[];
  espeed: number[];
  ename: string[];
  epoly: Array<Array<[number, number]> | null>;
  epolyWorld: Array<Array<[number, number]> | null>;
  E: number;
  ew: Float64Array;
  etau: Float64Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  parks?: Uint8Array;
}

export const CITIES: Record<CityKey, CityConfig> = {
  cairo: {
    name: 'Cairo',
    seed: 11,
    cols: 34,
    rows: 24,
    sx: 0.42,
    sy: 0.42,
    jit: 0.14,
    remove: 0.12,
    art: 5,
    diag: 0,
    barrier: {axis: 'v', at: 17, bridges: [3, 8, 14, 20], label: 'Nile'},
    note: 'The Nile splits the city and only four bridges cross it. Watch both searches funnel toward them.',
    geo: {
      center: {lat: 30.04, lng: 31.255},
      zoom: 12,
      bounds: {north: 30.132, south: 29.943, west: 31.088, east: 31.425},
      origin: {lat: 29.9792, lng: 31.1342, name: 'Giza Pyramids'},
      destination: {lat: 30.0477, lng: 31.2623, name: 'Khan el-Khalili'},
    },
    signalGaps: [
      {
        id: 'cairo-bazaar',
        name: 'Al-Azhar Tunnel Gap',
        cause: 'Tunnel',
        fx: 0.66,
        fy: 0.42,
        radiusKm: 1.15,
        attenuation: 0.78,
      },
      {
        id: 'cairo-nile-canyon',
        name: 'Downtown Towers Canyon',
        cause: 'Urban Canyon',
        fx: 0.45,
        fy: 0.56,
        radiusKm: 0.95,
        attenuation: 0.58,
      },
    ],
  },
  tokyo: {
    name: 'Tokyo',
    seed: 7,
    cols: 40,
    rows: 26,
    sx: 0.3,
    sy: 0.3,
    jit: 0.2,
    remove: 0.18,
    art: 6,
    diag: 0,
    barrier: {axis: 'v', at: 27, bridges: [2, 5, 8, 11, 14, 17, 20, 23], label: 'Sumida'},
    note: 'A dense mesh of slow side streets with fast arterials. Many bridges, so the best route hops between highways.',
    geo: {
      center: {lat: 35.65, lng: 139.758},
      zoom: 12,
      bounds: {north: 35.745, south: 35.535, west: 139.655, east: 139.86},
      origin: {lat: 35.6938, lng: 139.7034, name: 'Shinjuku'},
      destination: {lat: 35.7101, lng: 139.8107, name: 'Skytree'},
    },
    signalGaps: [
      {
        id: 'tokyo-shuto',
        name: 'Shuto Expressway Tunnel',
        cause: 'Tunnel',
        fx: 0.48,
        fy: 0.52,
        radiusKm: 1.05,
        attenuation: 0.85,
      },
      {
        id: 'tokyo-shinjuku',
        name: 'Shinjuku Skyscraper Canyon',
        cause: 'Urban Canyon',
        fx: 0.25,
        fy: 0.38,
        radiusKm: 0.95,
        attenuation: 0.65,
      },
    ],
  },
  newyork: {
    name: 'New York',
    seed: 5,
    cols: 30,
    rows: 22,
    sx: 0.27,
    sy: 0.15,
    jit: 0.1,
    remove: 0.08,
    art: 5,
    diag: 0,
    barrier: {axis: 'v', at: 22, bridges: [3, 9, 16], label: 'East River'},
    note: 'Long rectangular blocks and a regular grid. A* barely strays from the straight line to the goal.',
    geo: {
      center: {lat: 40.735, lng: -73.978},
      zoom: 12,
      bounds: {north: 40.802, south: 40.668, west: -74.025, east: -73.93},
      origin: {lat: 40.7829, lng: -73.9654, name: 'Central Park'},
      destination: {lat: 40.7447, lng: -73.9485, name: 'Queens'},
    },
    signalGaps: [
      {
        id: 'nyc-midtown',
        name: 'Midtown Glass Canyon',
        cause: 'Urban Canyon',
        fx: 0.44,
        fy: 0.44,
        radiusKm: 0.85,
        attenuation: 0.72,
      },
      {
        id: 'nyc-queens-tunnel',
        name: 'Queens-Midtown Tunnel',
        cause: 'Tunnel',
        fx: 0.75,
        fy: 0.46,
        radiusKm: 0.7,
        attenuation: 0.9,
      },
    ],
  },
  paris: {
    name: 'Paris',
    seed: 21,
    cols: 34,
    rows: 26,
    sx: 0.3,
    sy: 0.3,
    jit: 0.16,
    remove: 0.14,
    art: 4,
    diag: 0.7,
    barrier: {axis: 'h', at: 12, bridges: [2, 5, 8, 11, 14, 17, 20, 23, 26, 30], label: 'Seine'},
    note: 'Diagonal avenues cut across the grid, and the Seine has many bridges. Shortcuts change which junctions matter.',
    geo: {
      center: {lat: 48.859, lng: 2.334},
      zoom: 12,
      bounds: {north: 48.895, south: 48.822, west: 2.275, east: 2.392},
      origin: {lat: 48.8584, lng: 2.2945, name: 'Eiffel Tower'},
      destination: {lat: 48.8867, lng: 2.3431, name: 'Sacré-Cœur'},
    },
    signalGaps: [
      {
        id: 'paris-chatelet',
        name: 'Les Halles Underpass',
        cause: 'Tunnel',
        fx: 0.5,
        fy: 0.42,
        radiusKm: 0.9,
        attenuation: 0.76,
      },
      {
        id: 'paris-boulevard',
        name: 'Tuileries Canopy Gap',
        cause: 'Dense Canopy',
        fx: 0.34,
        fy: 0.35,
        radiusKm: 0.85,
        attenuation: 0.5,
      },
    ],
  },
  sydney: {
    name: 'Sydney',
    seed: 33,
    cols: 34,
    rows: 24,
    sx: 0.36,
    sy: 0.36,
    jit: 0.15,
    remove: 0.13,
    art: 5,
    diag: 0,
    barrier: {axis: 'h', at: 11, bridges: [18, 27], label: 'Harbour'},
    note: 'The harbour leaves a bridge and a tunnel. Dijkstra floods the whole shore first; A* heads for the crossing.',
    geo: {
      center: {lat: -33.863, lng: 151.23},
      zoom: 12,
      bounds: {north: -33.775, south: -33.95, west: 151.16, east: 151.3},
      origin: {lat: -33.8915, lng: 151.2767, name: 'Bondi'},
      destination: {lat: -33.7971, lng: 151.288, name: 'Manly'},
    },
    signalGaps: [
      {
        id: 'sydney-tunnel',
        name: 'Harbour Tunnel Dead Zone',
        cause: 'Tunnel',
        fx: 0.79,
        fy: 0.48,
        radiusKm: 1.0,
        attenuation: 0.92,
      },
      {
        id: 'sydney-cbd',
        name: 'CBD Tower Shadow',
        cause: 'Urban Canyon',
        fx: 0.54,
        fy: 0.62,
        radiusKm: 0.95,
        attenuation: 0.64,
      },
    ],
  },
};

export const PLACES: Record<CityKey, PlacePreset[]> = {
  cairo: [
    {n: 'Giza Pyramids', fx: 0.08, fy: 0.78, lat: 29.9792, lng: 31.1342},
    {n: 'Khan el-Khalili', fx: 0.78, fy: 0.3, lat: 30.0477, lng: 31.2623},
    {n: 'Cairo Tower', fx: 0.42, fy: 0.4, lat: 30.0459, lng: 31.2243},
    {n: 'Tahrir Square', fx: 0.62, fy: 0.5, lat: 30.0444, lng: 31.2357},
    {n: 'Citadel', fx: 0.84, fy: 0.58, lat: 30.0299, lng: 31.2611},
    {n: 'Airport', fx: 0.96, fy: 0.1, lat: 30.1119, lng: 31.4056},
    {n: 'Maadi', fx: 0.7, fy: 0.92, lat: 29.9602, lng: 31.2569},
  ],
  tokyo: [
    {n: 'Shinjuku', fx: 0.2, fy: 0.35, lat: 35.6938, lng: 139.7034},
    {n: 'Skytree', fx: 0.86, fy: 0.4, lat: 35.7101, lng: 139.8107},
    {n: 'Shibuya', fx: 0.18, fy: 0.72, lat: 35.658, lng: 139.7016},
    {n: 'Tokyo Station', fx: 0.5, fy: 0.6, lat: 35.6812, lng: 139.7671},
    {n: 'Ueno', fx: 0.58, fy: 0.22, lat: 35.7141, lng: 139.7774},
    {n: 'Asakusa', fx: 0.66, fy: 0.32, lat: 35.7148, lng: 139.7967},
    {n: 'Haneda', fx: 0.45, fy: 0.96, lat: 35.5494, lng: 139.7798},
  ],
  newyork: [
    {n: 'Central Park', fx: 0.35, fy: 0.1, lat: 40.7829, lng: -73.9654},
    {n: 'Queens', fx: 0.92, fy: 0.55, lat: 40.7447, lng: -73.9485},
    {n: 'Midtown', fx: 0.4, fy: 0.42, lat: 40.7549, lng: -73.984},
    {n: 'Wall Street', fx: 0.4, fy: 0.92, lat: 40.7074, lng: -74.0113},
    {n: 'Chelsea', fx: 0.12, fy: 0.55, lat: 40.7465, lng: -74.0014},
    {n: 'Brooklyn', fx: 0.9, fy: 0.9, lat: 40.6782, lng: -73.9442},
    {n: 'East Village', fx: 0.62, fy: 0.6, lat: 40.7265, lng: -73.9815},
  ],
  paris: [
    {n: 'Eiffel Tower', fx: 0.18, fy: 0.64, lat: 48.8584, lng: 2.2945},
    {n: 'Sacré-Cœur', fx: 0.58, fy: 0.08, lat: 48.8867, lng: 2.3431},
    {n: 'Louvre', fx: 0.45, fy: 0.38, lat: 48.8606, lng: 2.3376},
    {n: 'Notre-Dame', fx: 0.55, fy: 0.5, lat: 48.853, lng: 2.3499},
    {n: 'Arc de Triomphe', fx: 0.2, fy: 0.3, lat: 48.8738, lng: 2.295},
    {n: 'Montparnasse', fx: 0.4, fy: 0.82, lat: 48.8421, lng: 2.3219},
    {n: 'Gare de Lyon', fx: 0.82, fy: 0.64, lat: 48.8443, lng: 2.3744},
  ],
  sydney: [
    {n: 'Bondi', fx: 0.92, fy: 0.82, lat: -33.8915, lng: 151.2767},
    {n: 'Manly', fx: 0.86, fy: 0.1, lat: -33.7971, lng: 151.288},
    {n: 'Opera House', fx: 0.62, fy: 0.55, lat: -33.8568, lng: 151.2153},
    {n: 'Chatswood', fx: 0.3, fy: 0.14, lat: -33.7969, lng: 151.1831},
    {n: 'Darling Harbour', fx: 0.38, fy: 0.58, lat: -33.8749, lng: 151.1995},
    {n: 'Central Station', fx: 0.45, fy: 0.74, lat: -33.8832, lng: 151.2067},
    {n: 'Airport', fx: 0.5, fy: 0.96, lat: -33.9399, lng: 151.1753},
  ],
};

export function latLngToTangentKm(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
): [number, number] {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  return [(lng - centerLng) * 111.32 * cosLat, (centerLat - lat) * 111.32];
}

export function buildCity(key: CityKey): CityGraph {
  const c = CITIES[key];
  const dataset = REAL_ROADS[key];
  const centerLat = c.geo.center.lat;
  const centerLng = c.geo.center.lng;

  const N = dataset.nodes.length;
  const nx = new Float64Array(N);
  const ny = new Float64Array(N);
  const lat = new Float64Array(N);
  const lng = new Float64Array(N);
  const alive = new Uint8Array(N).fill(1);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < N; i++) {
    const [nLat, nLng] = dataset.nodes[i];
    lat[i] = nLat;
    lng[i] = nLng;
    const [wx, wy] = latLngToTangentKm(nLat, nLng, centerLat, centerLng);
    nx[i] = wx;
    ny[i] = wy;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }

  const E = dataset.edges.length;
  const eu: number[] = new Array(E);
  const ev: number[] = new Array(E);
  const elen: number[] = new Array(E);
  const espeed: number[] = new Array(E);
  const ename: string[] = new Array(E);
  const epoly: Array<Array<[number, number]> | null> = new Array(E);
  const epolyWorld: Array<Array<[number, number]> | null> = new Array(E);
  const adj: number[][] = Array.from({length: N}, () => []);

  for (let e = 0; e < E; e++) {
    const [u, v, spd, km, name, midPts] = dataset.edges[e];
    eu[e] = u;
    ev[e] = v;
    const chordKm = Math.hypot(nx[u] - nx[v], ny[u] - ny[v]);
    // Guarantee edge length >= Euclidean chord so A* h(v) is strictly consistent
    elen[e] = Math.max(km, chordKm, 0.005);
    espeed[e] = Math.min(VMAX, Math.max(20, spd));
    ename[e] = name || '';
    if (midPts && midPts.length > 0) {
      const llPts: Array<[number, number]> = [[lat[u], lng[u]], ...midPts, [lat[v], lng[v]]];
      epoly[e] = llPts;
      epolyWorld[e] = llPts.map(([pLat, pLng]) =>
        latLngToTangentKm(pLat, pLng, centerLat, centerLng),
      );
    } else {
      epoly[e] = null;
      epolyWorld[e] = null;
    }
    adj[u].push(e);
    adj[v].push(e);
  }

  const G: CityGraph = {
    key,
    cfg: c,
    isRealRoad: true,
    N,
    nx,
    ny,
    lat,
    lng,
    alive,
    count: N,
    adj,
    eu,
    ev,
    elen,
    espeed,
    ename,
    epoly,
    epolyWorld,
    E,
    ew: new Float64Array(E),
    etau: new Float64Array(E).fill(1),
    minX,
    maxX,
    minY,
    maxY,
  };
  setTraffic(G, false, 0);
  return G;
}

export function setTraffic(G: CityGraph, on: boolean, seed: number): void {
  const E = G.E;
  G.etau.fill(1);
  if (on) {
    const rng = mulberry32(G.cfg.seed * 7919 + seed * 104729);
    const zones: Array<{x: number; y: number; r: number; f: number}> = [];
    const cx = (G.minX + G.maxX) * 0.5;
    const cy = (G.minY + G.maxY) * 0.5;
    const span = Math.max(G.maxX - G.minX, G.maxY - G.minY);
    zones.push({
      x: cx + (rng() - 0.5) * span * 0.16,
      y: cy + (rng() - 0.5) * span * 0.16,
      r: span * 0.16,
      f: 2.4,
    });
    for (let k = 0; k < 5; k++) {
      const n = Math.floor(rng() * G.N);
      zones.push({
        x: G.nx[n],
        y: G.ny[n],
        r: span * (0.09 + rng() * 0.11),
        f: 1.55 + rng() * 1.45,
      });
    }
    for (let e = 0; e < E; e++) {
      const mx = (G.nx[G.eu[e]] + G.nx[G.ev[e]]) * 0.5;
      const my = (G.ny[G.eu[e]] + G.ny[G.ev[e]]) * 0.5;
      let tau = 1;
      for (const z of zones) {
        const d = Math.hypot(mx - z.x, my - z.y);
        if (d < z.r) tau = Math.max(tau, 1 + (z.f - 1) * (1 - d / z.r));
      }
      if (G.espeed[e] >= 55 && tau < 1.15 && (e * 17 + seed) % 11 === 0) {
        tau = 1.38;
      }
      G.etau[e] = tau;
    }
  }
  for (let e = 0; e < E; e++) {
    G.ew[e] = (60 * G.elen[e]) / G.espeed[e] * G.etau[e];
  }
}

export class Heap {
  private k: number[] = [];
  private v: number[] = [];

  get size(): number {
    return this.k.length;
  }

  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && k[r] < k[l]) l = r;
        if (k[l] >= lastK) break;
        k[i] = k[l];
        v[i] = v[l];
        i = l;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

export interface RouteStep {
  i0: number;
  name?: string;
  turn?: number | null;
  head?: number;
  arrive?: boolean;
  d0: number;
  d1: number;
  km: number;
  text: string;
  rot: number;
}

export class Runner {
  G: CityGraph;
  s: number;
  t: number;
  useH: boolean;
  g: Float64Array;
  parent: Int32Array;
  closed: Uint8Array;
  heap: Heap;
  expanded = 0;
  done = false;
  found = false;
  path: number[] = [];
  cost = Infinity;
  km = 0;
  cur = -1;
  relaxed: number[] = [];
  revealN = 0;
  cumD?: number[];
  cumC?: number[];
  angs?: number[];
  steps?: RouteStep[];

  constructor(G: CityGraph, s: number, t: number, useH: boolean) {
    this.G = G;
    this.s = s;
    this.t = t;
    this.useH = useH;
    this.g = new Float64Array(G.N).fill(Infinity);
    this.parent = new Int32Array(G.N).fill(-1);
    this.closed = new Uint8Array(G.N);
    this.heap = new Heap();
    this.g[s] = 0;
    this.heap.push(this.h(s), s);
  }

  h(n: number): number {
    if (!this.useH) return 0;
    const G = this.G;
    return (60 * Math.hypot(G.nx[n] - G.nx[this.t], G.ny[n] - G.ny[this.t])) / VMAX;
  }

  step(): void {
    if (this.done) return;
    const {G, heap, g, closed} = this;
    while (heap.size) {
      const u = heap.pop();
      if (closed[u]) continue;
      closed[u] = 1;
      this.expanded++;
      this.cur = u;
      this.relaxed = [];
      if (u === this.t) {
        this.finish();
        return;
      }
      for (const e of G.adj[u]) {
        const v = G.eu[e] ^ G.ev[e] ^ u;
        if (closed[v]) continue;
        const nd = g[u] + G.ew[e];
        if (nd < g[v]) {
          g[v] = nd;
          this.parent[v] = u;
          this.relaxed.push(v);
          heap.push(nd + this.h(v), v);
        }
      }
      return;
    }
    this.done = true;
  }

  finish(): void {
    this.done = true;
    this.found = true;
    this.cost = this.g[this.t];
    const G = this.G;
    let n = this.t;
    const p: number[] = [];
    while (n !== -1) {
      p.push(n);
      n = this.parent[n];
    }
    p.reverse();
    this.path = p;
    let km = 0;
    for (let i = 1; i < p.length; i++) {
      const edgeIdx = edgeBetween(G, p[i - 1], p[i]);
      km +=
        edgeIdx >= 0
          ? G.elen[edgeIdx]
          : Math.hypot(G.nx[p[i]] - G.nx[p[i - 1]], G.ny[p[i]] - G.ny[p[i - 1]]);
    }
    this.km = km;
  }
}

export function nodeNearIn(g: CityGraph, fx: number, fy: number): number {
  let bestN = -1;
  let bestD = Infinity;
  const tx = g.minX + fx * (g.maxX - g.minX);
  const ty = g.minY + fy * (g.maxY - g.minY);
  for (let n = 0; n < g.N; n++) {
    if (!g.alive[n]) continue;
    const d = Math.hypot(g.nx[n] - tx, g.ny[n] - ty);
    if (d < bestD) {
      bestD = d;
      bestN = n;
    }
  }
  return bestN;
}

export function nearestNodeWorld(g: CityGraph, wx: number, wy: number): number {
  let bestN = -1;
  let bestD = Infinity;
  for (let n = 0; n < g.N; n++) {
    if (!g.alive[n]) continue;
    const d = Math.hypot(g.nx[n] - wx, g.ny[n] - wy);
    if (d < bestD) {
      bestD = d;
      bestN = n;
    }
  }
  return bestN;
}

export function nearestNodeLatLng(G: CityGraph, lat: number, lng: number): number {
  const [wx, wy] = latLngToTangentKm(lat, lng, G.cfg.geo.center.lat, G.cfg.geo.center.lng);
  return nearestNodeWorld(G, wx, wy);
}

export function parksFor(G: CityGraph): Uint8Array {
  if (G.parks) return G.parks;
  const c = G.cfg;
  const rng = mulberry32(c.seed + 5);
  const p = new Uint8Array(c.cols * c.rows);
  for (let k = 0; k < p.length; k++) p[k] = rng() < 0.07 ? 1 : 0;
  G.parks = p;
  return p;
}

export function roadName(G: CityGraph, a: number, b: number): string {
  const edgeIdx = edgeBetween(G, a, b);
  if (edgeIdx >= 0) {
    const nm = G.ename[edgeIdx];
    if (nm) return nm;
    const spd = G.espeed[edgeIdx];
    if (spd >= 70) return 'Expressway';
    if (spd >= 55) return 'Main Arterial';
    if (spd >= 45) return 'City Avenue';
    return 'Connector Street';
  }
  return 'Connector Street';
}

export function edgeBetween(G: CityGraph, a: number, b: number): number {
  let best = -1;
  let bw = Infinity;
  for (const e of G.adj[a]) {
    if ((G.eu[e] ^ G.ev[e] ^ a) === b && G.ew[e] < bw) {
      bw = G.ew[e];
      best = e;
    }
  }
  return best;
}

const COMPASS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
const compass = (ang: number) => COMPASS[Math.round(((ang + 360) % 360) / 45) % 8];

export function fmtDist(km: number): string {
  return km < 1 ? Math.max(10, Math.round(km * 100) * 10) + ' m' : km.toFixed(1) + ' km';
}

function turnText(s: {arrive?: boolean; turn: number | null; head: number; name: string}): string {
  if (s.arrive) return 'Arrive at destination';
  if (s.turn === null) return 'Head ' + compass(s.head) + ' on ' + s.name;
  const a = Math.abs(s.turn);
  const side = s.turn > 0 ? 'right' : 'left';
  if (a < 28) return 'Continue onto ' + s.name;
  if (a > 150) return 'Make a U-turn onto ' + s.name;
  const kind = a < 60 ? 'Bear ' + side : a > 120 ? 'Sharp ' + side : 'Turn ' + side;
  return kind + ' onto ' + s.name;
}

export function stepsFor(G: CityGraph, r: Runner): RouteStep[] {
  if (r.steps) return r.steps;
  const p = r.path;
  const n = p.length;
  const cumD = [0];
  const cumC = [0];
  const angs: number[] = [];
  const names: string[] = [];
  for (let i = 1; i < n; i++) {
    const a = p[i - 1];
    const b = p[i];
    const dx = G.nx[b] - G.nx[a];
    const dy = G.ny[b] - G.ny[a];
    const edgeIdx = edgeBetween(G, a, b);
    cumD.push(cumD[i - 1] + (edgeIdx >= 0 ? G.elen[edgeIdx] : Math.hypot(dx, dy)));
    cumC.push(cumC[i - 1] + (edgeIdx >= 0 ? G.ew[edgeIdx] : 0));
    angs.push((Math.atan2(dy, dx) * 180) / Math.PI);
    names.push(roadName(G, a, b));
  }
  const rawSteps: Array<{i0: number; name: string; turn: number | null; head: number}> = [];
  let cur: {i0: number; name: string; turn: number | null; head: number} | null = null;
  for (let i = 0; i < n - 1; i++) {
    if (!cur) {
      cur = {i0: i, name: names[i], turn: null, head: angs[i]};
      rawSteps.push(cur);
      continue;
    }
    let d = angs[i] - angs[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) < 28 && names[i] === cur.name) continue;
    cur = {i0: i, name: names[i], turn: d, head: angs[i]};
    rawSteps.push(cur);
  }
  const steps: RouteStep[] = rawSteps.map((s, k) => {
    const end = k + 1 < rawSteps.length ? rawSteps[k + 1].i0 : n - 1;
    const d0 = cumD[s.i0];
    const d1 = cumD[end];
    return {
      ...s,
      d0,
      d1,
      km: d1 - d0,
      text: turnText(s),
      rot: s.turn === null ? s.head + 90 : s.turn,
    };
  });
  steps.push({
    i0: n - 1,
    arrive: true,
    d0: cumD[n - 1],
    d1: cumD[n - 1],
    km: 0,
    text: 'Arrive at destination',
    rot: 0,
  });
  r.cumD = cumD;
  r.cumC = cumC;
  r.angs = angs;
  r.steps = steps;
  return steps;
}

export function getCityGapsWorld(G: CityGraph) {
  const spanX = G.maxX - G.minX;
  const spanY = G.maxY - G.minY;
  return G.cfg.signalGaps.map((g) => ({
    ...g,
    wx: G.minX + g.fx * spanX,
    wy: G.minY + g.fy * spanY,
  }));
}

export function fitScaleForRect(G: CityGraph, w: number, h: number, pad = 24): number {
  return Math.min((w - 2 * pad) / (G.maxX - G.minX), (h - 2 * pad) / (G.maxY - G.minY));
}

export function clampZoom(z: number): number {
  return clamp(z, 0.8, 10);
}

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  CITIES,
  PLACES,
  Runner,
  getCityGapsWorld,
  stepsFor,
  type CityGraph,
  type CityKey,
} from '../engine/graph';
import {
  buildGeoBoundsProjection,
  expandGeoBounds,
  nearestNodeToLatLng,
  worldToLatLng,
} from '../engine/geoGraph';
import {computeGpsFix, type SatelliteDef} from '../engine/satellites';
import type {NavState} from './RouteRaceCanvas';

export type GmapsSearchAlgo = 'both' | 'ast' | 'dij';

export interface GmapsSearchStats {
  dijExpanded: number;
  astExpanded: number;
  dijDone: boolean;
  astDone: boolean;
  dijCost: number;
  astCost: number;
  dijKm: number;
  astKm: number;
  savedPct: number;
  totalNodes: number;
  explainText: string;
  activeRunner: Runner | null;
}

interface GoogleMapsViewProps {
  cityKey: CityKey;
  graph: CityGraph;
  theme: 'light' | 'dark';
  origin: {lat: number; lng: number; name?: string};
  destination: {lat: number; lng: number; name?: string};
  searchAlgo: GmapsSearchAlgo;
  primaryAlgo: 'ast' | 'dij';
  searchPaused: boolean;
  searchReplaySeq: number;
  searchStepSeq: number;
  fitSeq: number;
  traffic: boolean;
  speedVal: number;
  showSatellites: boolean;
  satDefs: SatelliteDef[];
  nav: NavState;
  onMapPick: (pos: {lat: number; lng: number}) => void;
  onRouteComputed: (summary: {distanceKm: string; durationMin: string; error?: string}) => void;
  onSearchStatsUpdate: (stats: GmapsSearchStats) => void;
  onNavTick: (dt: number) => void;
  onSwitchToRouteRace?: () => void;
}

interface MapPolylineInstance {
  setOptions: (opts: {
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
  }) => void;
  setMap: (map: unknown) => void;
}

interface ComputedRouteResult {
  createPolylines?: () => MapPolylineInstance[];
  distanceMeters?: number;
  durationMillis?: number;
}

interface RoutesLibraryShape {
  Route?: {
    computeRoutes?: (req: unknown) => Promise<{routes?: ComputedRouteResult[]}>;
  };
}

interface GmapsProjectionShape {
  fromLatLngToContainerPixel: (latLng: unknown) => {x: number; y: number} | null;
}

interface GmapsOverlayViewBase {
  setMap: (map: unknown) => void;
  getProjection: () => GmapsProjectionShape | null;
}

interface GmapsGlobalShape {
  google?: {
    maps?: {
      LatLng: new (lat: number, lng: number) => unknown;
      LatLngBounds: new (sw?: unknown, ne?: unknown) => {
        extend: (latLng: unknown) => void;
      };
      OverlayView: new () => GmapsOverlayViewBase;
    };
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildExplainText(
  runner: Runner | null,
  algo: 'ast' | 'dij',
): string {
  if (!runner) return '';
  const name = algo === 'ast' ? 'A*' : 'Dijkstra';
  if (runner.found) {
    return `${name} reached the destination in ${runner.cost.toFixed(
      1,
    )} min. Following parent pointers backward from the destination draws the fastest route.`;
  }
  if (runner.cur < 0) {
    return 'Starting at the origin with a travel time of 0 min.';
  }
  const g = runner.g[runner.cur];
  const n = runner.relaxed.length;
  const tail = ` Checked outgoing roads and improved ${n} neighbouring junction${
    n === 1 ? '' : 's'
  }.`;
  if (algo === 'ast') {
    const h = runner.h(runner.cur);
    return `Step ${runner.expanded}. Lowest g + h = ${g.toFixed(1)} + ${h.toFixed(
      1,
    )} = ${(g + h).toFixed(1)} min.${tail}`;
  }
  return `Step ${runner.expanded}. Lowest travel time so far g = ${g.toFixed(1)} min.${tail}`;
}

const RouteCalculatorLayer: React.FC<{
  origin: {lat: number; lng: number};
  destination: {lat: number; lng: number};
  onRouteComputed: (summary: {distanceKm: string; durationMin: string; error?: string}) => void;
}> = ({origin, destination, onRouteComputed}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapPolylineInstance[]>([]);

  useEffect(() => {
    if (!routesLib || !map) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const request = {
      origin: {lat: origin.lat, lng: origin.lng},
      destination: {lat: destination.lat, lng: destination.lng},
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis'],
    };

    const RouteCls = (routesLib as unknown as RoutesLibraryShape).Route;

    if (!RouteCls || typeof RouteCls.computeRoutes !== 'function') {
      onRouteComputed({
        distanceKm: '—',
        durationMin: '—',
        error: 'Routes library is initializing. Try clicking the map again in a moment.',
      });
      return;
    }

    let cancelled = false;

    RouteCls.computeRoutes(request)
      .then((response) => {
        if (cancelled) return;
        const routes = response?.routes;
        if (!routes || routes.length === 0) {
          onRouteComputed({
            distanceKm: '—',
            durationMin: '—',
            error: 'No driving route found between these coordinates.',
          });
          return;
        }

        const primaryRoute = routes[0];
        if (typeof primaryRoute.createPolylines === 'function') {
          const lines = primaryRoute.createPolylines();
          lines.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#0f9d58',
              strokeWeight: 5,
              strokeOpacity: 0.7,
            });
            poly.setMap(map);
          });
          polylinesRef.current = lines;
        }

        const km = ((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(1) + ' km';
        const mins = Math.max(1, Math.round((primaryRoute.durationMillis ?? 0) / 60000)) + ' min';
        onRouteComputed({distanceKm: km, durationMin: mins});
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteComputed({
          distanceKm: '—',
          durationMin: '—',
          error: 'Unable to compute route right now. Check your network or API quota.',
        });
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin.lat, origin.lng, destination.lat, destination.lng, onRouteComputed]);

  return null;
};

/**
 * Projects Route Race's entire city graph, Dijkstra & A* search exploration trees,
 * frontier dots, active g+h / g= callout pill, animated route reveal, traffic,
 * turn-by-turn drive marker, and GPS satellites directly onto the live Google Map.
 */
const RouteRaceGeoOverlay: React.FC<{
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cityKey: CityKey;
  graph: CityGraph;
  theme: 'light' | 'dark';
  origin: {lat: number; lng: number};
  destination: {lat: number; lng: number};
  searchAlgo: GmapsSearchAlgo;
  primaryAlgo: 'ast' | 'dij';
  searchPaused: boolean;
  searchReplaySeq: number;
  searchStepSeq: number;
  fitSeq: number;
  traffic: boolean;
  speedVal: number;
  showSatellites: boolean;
  satDefs: SatelliteDef[];
  nav: NavState;
  onSearchStatsUpdate: (stats: GmapsSearchStats) => void;
  onNavTick: (dt: number) => void;
}> = ({
  canvasRef,
  cityKey,
  graph,
  theme,
  origin,
  destination,
  searchAlgo,
  primaryAlgo,
  searchPaused,
  searchReplaySeq,
  searchStepSeq,
  fitSeq,
  traffic,
  speedVal,
  showSatellites,
  satDefs,
  nav,
  onSearchStatsUpdate,
  onNavTick,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  const baseBounds = CITIES[cityKey].geo.bounds;
  const activeBounds = useMemo(
    () => expandGeoBounds(baseBounds, [origin, destination]),
    [baseBounds, origin.lat, origin.lng, destination.lat, destination.lng],
  );

  const proj = useMemo(
    () => buildGeoBoundsProjection(graph, activeBounds),
    [graph, activeBounds],
  );

  // Precompute lat/lng coordinates for all nodes in the city graph
  const nodeLatLngs = useMemo(() => {
    const arr: Array<{lat: number; lng: number}> = new Array(graph.N);
    for (let i = 0; i < graph.N; i++) {
      arr[i] = worldToLatLng(proj, graph.nx[i], graph.ny[i]);
    }
    return arr;
  }, [graph, proj]);

  const gmapsNodeLatLngs = useMemo(() => {
    if (!mapsLib) return null;
    const gmaps = (window as unknown as GmapsGlobalShape).google?.maps;
    if (!gmaps?.LatLng) return null;
    const arr = new Array<unknown>(graph.N);
    for (let i = 0; i < graph.N; i++) {
      const ll = nodeLatLngs[i];
      arr[i] = new gmaps.LatLng(ll.lat, ll.lng);
    }
    return arr;
  }, [mapsLib, graph.N, nodeLatLngs]);

  const gmapsPlacePoints = useMemo(() => {
    if (!mapsLib) return null;
    const gmaps = (window as unknown as GmapsGlobalShape).google?.maps;
    if (!gmaps?.LatLng) return null;
    return PLACES[cityKey].map((p) => ({
      name: p.n,
      latLng: new gmaps.LatLng(p.lat, p.lng),
    }));
  }, [mapsLib, cityKey]);

  const stateRef = useRef({
    searchAlgo,
    primaryAlgo,
    searchPaused,
    traffic,
    speedVal,
    showSatellites,
    satDefs,
    theme,
    nav,
    rD: null as Runner | null,
    rA: null as Runner | null,
    fromNode: 0,
    toNode: 0,
    simTime: 0,
  });

  stateRef.current.searchAlgo = searchAlgo;
  stateRef.current.primaryAlgo = primaryAlgo;
  stateRef.current.searchPaused = searchPaused;
  stateRef.current.traffic = traffic;
  stateRef.current.speedVal = speedVal;
  stateRef.current.showSatellites = showSatellites;
  stateRef.current.satDefs = satDefs;
  stateRef.current.theme = theme;
  stateRef.current.nav = nav;

  const statsCallbackRef = useRef(onSearchStatsUpdate);
  statsCallbackRef.current = onSearchStatsUpdate;
  const navTickCallbackRef = useRef(onNavTick);
  navTickCallbackRef.current = onNavTick;

  const projectionRef = useRef<GmapsProjectionShape | null>(null);
  const lastStepSeqRef = useRef(searchStepSeq);

  // Frame the entire city graph cleanly inside the visible map area (right of the control panel)
  useEffect(() => {
    if (!map || !mapsLib) return;
    const gmaps = (window as unknown as GmapsGlobalShape).google?.maps;
    if (!gmaps?.LatLng || !gmaps?.LatLngBounds) return;

    const bounds = new gmaps.LatLngBounds(
      new gmaps.LatLng(activeBounds.south, activeBounds.west),
      new gmaps.LatLng(activeBounds.north, activeBounds.east),
    );
    const pad =
      typeof window !== 'undefined' && window.innerWidth > 760
        ? {top: 56, right: 20, bottom: 20, left: 396}
        : {top: 100, right: 16, bottom: 340, left: 16};
    (map as unknown as {fitBounds: (b: unknown, p?: unknown) => void}).fitBounds(bounds, pad);
  }, [map, mapsLib, cityKey, fitSeq, activeBounds]);

  const drawCanvas = useMemo(() => {
    return () => {
      const canvas = canvasRef.current;
      const projection = projectionRef.current;
      if (!canvas || !projection) return;

      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;
      if (w <= 0 || h <= 0) return;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const st = stateRef.current;
      const isDark = st.theme === 'dark';
      const fgCol = isDark ? '#e8eaed' : '#202124';
      const surfaceCol = isDark ? '#292a2d' : '#ffffff';
      const dijCol = isDark ? '#4db6ac' : '#00897b';
      const astCol = isDark ? '#ce93d8' : '#8e24aa';
      const routeCol = isDark ? '#8ab4f8' : '#1a73e8';
      const routeEdgeCol = isDark ? '#1f4e9c' : '#0b57d0';

      const pxX = new Float64Array(graph.N);
      const pxY = new Float64Array(graph.N);

      for (let i = 0; i < graph.N; i++) {
        if (!graph.alive[i]) continue;
        const pt = gmapsNodeLatLngs ? gmapsNodeLatLngs[i] : nodeLatLngs[i];
        const p = projection.fromLatLngToContainerPixel(pt);
        if (!p) continue;
        pxX[i] = p.x;
        pxY[i] = p.y;
      }

      const ox = (i: number) => pxX[i];
      const oy = (i: number) => pxY[i];

      // 1. City-wide street graph mesh (local streets + brighter highways + optional live traffic)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.36)' : 'rgba(51, 65, 85, 0.34)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let e = 0; e < graph.E; e++) {
        if (graph.espeed[e] >= 60) continue;
        const u = graph.eu[e];
        const v = graph.ev[e];
        ctx.moveTo(ox(u), oy(u));
        ctx.lineTo(ox(v), oy(v));
      }
      ctx.stroke();

      ctx.strokeStyle = isDark ? 'rgba(251, 226, 160, 0.52)' : 'rgba(217, 159, 45, 0.52)';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      for (let e = 0; e < graph.E; e++) {
        if (graph.espeed[e] < 60) continue;
        const u = graph.eu[e];
        const v = graph.ev[e];
        ctx.moveTo(ox(u), oy(u));
        ctx.lineTo(ox(v), oy(v));
      }
      ctx.stroke();

      if (st.traffic) {
        ctx.strokeStyle = '#34a853';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let e = 0; e < graph.E; e++) {
          if (graph.espeed[e] < 60 || graph.etau[e] > 1.12) continue;
          ctx.moveTo(ox(graph.eu[e]), oy(graph.eu[e]));
          ctx.lineTo(ox(graph.ev[e]), oy(graph.ev[e]));
        }
        ctx.stroke();

        for (let e = 0; e < graph.E; e++) {
          const tau = graph.etau[e];
          if (tau <= 1.12) continue;
          ctx.strokeStyle = tau > 1.8 ? '#d93025' : '#f29900';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(ox(graph.eu[e]), oy(graph.eu[e]));
          ctx.lineTo(ox(graph.ev[e]), oy(graph.ev[e]));
          ctx.stroke();
        }
      }

      // 2. Dijkstra exploration tree (Teal) + open frontier dots
      const rD = st.rD;
      const rA = st.rA;
      const showDij = rD && !st.nav.on && (st.searchAlgo === 'dij' || st.searchAlgo === 'both');
      const showAst = rA && !st.nav.on && (st.searchAlgo === 'ast' || st.searchAlgo === 'both');

      if (showDij && rD) {
        ctx.save();
        ctx.strokeStyle = dijCol;
        ctx.lineWidth = st.searchAlgo === 'both' ? 4.4 : 2.8;
        ctx.globalAlpha = st.searchAlgo === 'both' ? 0.54 : 0.9;
        ctx.beginPath();
        for (let n = 0; n < graph.N; n++) {
          if (!rD.closed[n] || rD.parent[n] < 0) continue;
          ctx.moveTo(ox(rD.parent[n]), oy(rD.parent[n]));
          ctx.lineTo(ox(n), oy(n));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (!rD.done) {
          ctx.fillStyle = dijCol;
          for (let n = 0; n < graph.N; n++) {
            if (rD.closed[n] || rD.g[n] === Infinity) continue;
            ctx.beginPath();
            ctx.arc(ox(n), oy(n), 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 3. A* exploration tree (Purple) + open frontier dots + dashed heuristic guide beam
      if (showAst && rA) {
        ctx.save();
        ctx.strokeStyle = astCol;
        ctx.lineWidth = st.searchAlgo === 'both' ? 2.5 : 2.9;
        ctx.globalAlpha = 0.94;
        ctx.beginPath();
        for (let n = 0; n < graph.N; n++) {
          if (!rA.closed[n] || rA.parent[n] < 0) continue;
          ctx.moveTo(ox(rA.parent[n]), oy(rA.parent[n]));
          ctx.lineTo(ox(n), oy(n));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (!rA.done) {
          ctx.fillStyle = astCol;
          for (let n = 0; n < graph.N; n++) {
            if (rA.closed[n] || rA.g[n] === Infinity) continue;
            ctx.beginPath();
            ctx.arc(ox(n), oy(n), 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 4. Active exploring junction ring, relaxed neighbors & live cost callout pill (Route Race signature visual!)
      const activeKey =
        st.searchAlgo === 'dij'
          ? 'dij'
          : st.searchAlgo === 'ast'
            ? 'ast'
            : st.primaryAlgo;
      const activeRun = activeKey === 'dij' ? rD : rA;
      const activeColor = activeKey === 'dij' ? dijCol : astCol;

      if (activeRun && !st.nav.on && !activeRun.done && activeRun.cur >= 0) {
        const cu = activeRun.cur;
        const cx = ox(cu);
        const cy = oy(cu);

        if (activeKey === 'ast') {
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = astCol;
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ox(st.toNode), oy(st.toNode));
          ctx.stroke();
          ctx.restore();
        }

        // Newly relaxed neighbor edges + dots
        ctx.strokeStyle = fgCol;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        for (const v of activeRun.relaxed) {
          ctx.moveTo(cx, cy);
          ctx.lineTo(ox(v), oy(v));
        }
        ctx.stroke();

        ctx.fillStyle = fgCol;
        for (const v of activeRun.relaxed) {
          ctx.beginPath();
          ctx.arc(ox(v), oy(v), 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Current active junction ring
        ctx.fillStyle = surfaceCol;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3.4;
        ctx.stroke();

        // Floating cost badge: g + h = total (A*) or g = ... min (Dijkstra)
        const g = activeRun.g[cu];
        const txt =
          activeKey === 'ast'
            ? `g ${g.toFixed(1)} + h ${activeRun.h(cu).toFixed(1)} = ${(g + activeRun.h(cu)).toFixed(1)}`
            : `g = ${g.toFixed(1)} min`;
        ctx.font = '600 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width + 16;
        const bx = Math.max(8, Math.min(w - tw - 8, cx - tw / 2));
        const by = Math.max(8, cy - 36);
        ctx.fillStyle = surfaceCol;
        roundRectPath(ctx, bx, by, tw, 22, 11);
        ctx.fill();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = fgCol;
        ctx.fillText(txt, bx + 8, by + 11.5);
      }

      // 5. Fastest Graph Path reveal (Route Race blue #1a73e8 with #0b57d0 casing)
      if (activeRun && activeRun.found && (st.nav.on || activeRun.revealN > 0)) {
        const pp = st.nav.on
          ? activeRun.path
          : activeRun.path.slice(activeRun.path.length - activeRun.revealN);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [colStr, wd] of [
          [routeEdgeCol, 8.2],
          [routeCol, 5.2],
        ] as const) {
          ctx.strokeStyle = colStr;
          ctx.lineWidth = wd;
          ctx.beginPath();
          pp.forEach((n, idx) =>
            idx ? ctx.lineTo(ox(n), oy(n)) : ctx.moveTo(ox(n), oy(n)),
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Landmark indicators so all 7 city places are visible without overlapping active pins
      if (gmapsPlacePoints) {
        ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const fromPx = {x: ox(st.fromNode), y: oy(st.fromNode)};
        const toPx = {x: ox(st.toNode), y: oy(st.toNode)};
        const placed: Array<{x: number; y: number; w: number; h: number}> = [];

        for (const p of gmapsPlacePoints) {
          const pt = projection.fromLatLngToContainerPixel(p.latLng);
          if (!pt || pt.x < 395 || pt.x > w - 16 || pt.y < 52 || pt.y > h - 16) continue;
          if (
            Math.hypot(pt.x - fromPx.x, pt.y - fromPx.y) < 26 ||
            Math.hypot(pt.x - toPx.x, pt.y - toPx.y) < 26
          ) {
            continue;
          }
          ctx.fillStyle = surfaceCol;
          ctx.strokeStyle = isDark ? '#9aa0a6' : '#5f6368';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          const lw = ctx.measureText(p.name).width;
          const box = {x: pt.x + 8, y: pt.y - 8, w: lw, h: 16};
          const overlaps = placed.some(
            (b) =>
              box.x < b.x + b.w + 6 &&
              box.x + box.w + 6 > b.x &&
              box.y < b.y + b.h + 2 &&
              box.y + box.h + 2 > b.y,
          );
          if (!overlaps) {
            placed.push(box);
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = isDark ? 'rgba(23,26,29,0.88)' : 'rgba(255,255,255,0.94)';
            ctx.strokeText(p.name, pt.x + 8, pt.y);
            ctx.fillStyle = fgCol;
            ctx.fillText(p.name, pt.x + 8, pt.y);
          }
        }
      }

      // 7. Turn-by-turn Drive Navigation Vehicle on Google Maps
      if (st.nav.on) {
        const gmaps = (window as unknown as GmapsGlobalShape).google?.maps;
        if (gmaps?.LatLng) {
          const vll = worldToLatLng(proj, st.nav.x, st.nav.y);
          const vp = projection.fromLatLngToContainerPixel(new gmaps.LatLng(vll.lat, vll.lng));
          if (vp) {
            ctx.save();
            ctx.translate(vp.x, vp.y);
            ctx.rotate(((st.nav.head + 90) * Math.PI) / 180);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = routeCol;
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(6, 6);
            ctx.lineTo(0, 3);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // 8. Optional GPS Satellites & Signal Gaps projected onto real map coordinates
      if (st.showSatellites) {
        const gmaps = (window as unknown as GmapsGlobalShape).google?.maps;
        if (gmaps?.LatLng) {
          const rx = st.nav.on ? st.nav.x : graph.nx[st.fromNode];
          const ry = st.nav.on ? st.nav.y : graph.ny[st.fromNode];
          const reading = computeGpsFix(graph, rx, ry, st.satDefs, st.simTime, false);
          const origLL = worldToLatLng(proj, rx, ry);
          const origPx = projection.fromLatLngToContainerPixel(
            new gmaps.LatLng(origLL.lat, origLL.lng),
          );

          const gaps = getCityGapsWorld(graph);
          for (const gap of gaps) {
            const gll = worldToLatLng(proj, gap.wx, gap.wy);
            const gEdge = worldToLatLng(proj, gap.wx + gap.radiusKm, gap.wy);
            const gp = projection.fromLatLngToContainerPixel(new gmaps.LatLng(gll.lat, gll.lng));
            const ge = projection.fromLatLngToContainerPixel(
              new gmaps.LatLng(gEdge.lat, gEdge.lng),
            );
            if (!gp || !ge) continue;
            const gr = Math.max(24, Math.hypot(ge.x - gp.x, ge.y - gp.y));
            ctx.save();
            ctx.beginPath();
            ctx.arc(gp.x, gp.y, gr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(217, 119, 6, 0.18)';
            ctx.fill();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }

          for (const sat of reading.satellites) {
            if (!sat.enabled) continue;
            const sll = worldToLatLng(proj, sat.wx, sat.wy);
            const sp = projection.fromLatLngToContainerPixel(new gmaps.LatLng(sll.lat, sll.lng));
            if (!sp || !origPx) continue;
            ctx.save();
            ctx.strokeStyle = sat.locked ? sat.color : '#d97706';
            ctx.globalAlpha = 0.72;
            ctx.lineWidth = 1.8;
            if (!sat.locked) ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(origPx.x, origPx.y);
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = sat.locked ? sat.color : '#d97706';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.fillStyle = sat.locked ? sat.color : '#d97706';
            ctx.font = '700 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sat.id, sp.x, sp.y + 20);
          }
        }
      }
    };
  }, [graph, proj, nodeLatLngs, gmapsNodeLatLngs, gmapsPlacePoints]);

  const drawCanvasRef = useRef(drawCanvas);
  drawCanvasRef.current = drawCanvas;

  // Initialize / reset Dijkstra & A* runners when city, origin, destination, traffic, or replay changes
  useEffect(() => {
    const s = nearestNodeToLatLng(graph, proj, origin.lat, origin.lng);
    let t = nearestNodeToLatLng(graph, proj, destination.lat, destination.lng);
    if (t === s && graph.N > 1) {
      t = (s + Math.floor(graph.N / 2)) % graph.N;
    }
    stateRef.current.fromNode = s;
    stateRef.current.toNode = t;
    const rD = new Runner(graph, s, t, false);
    const rA = new Runner(graph, s, t, true);
    stateRef.current.rD = rD;
    stateRef.current.rA = rA;

    const focusKey =
      stateRef.current.searchAlgo === 'dij'
        ? 'dij'
        : stateRef.current.searchAlgo === 'ast'
          ? 'ast'
          : stateRef.current.primaryAlgo;
    const activeRunner = focusKey === 'dij' ? rD : rA;

    statsCallbackRef.current({
      dijExpanded: 0,
      astExpanded: 0,
      dijDone: false,
      astDone: false,
      dijCost: 0,
      astCost: 0,
      dijKm: 0,
      astKm: 0,
      savedPct: 0,
      totalNodes: graph.count,
      explainText: buildExplainText(activeRunner, focusKey),
      activeRunner,
    });
    drawCanvasRef.current();
  }, [
    graph,
    proj,
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    traffic,
    searchReplaySeq,
  ]);

  // Silent OverlayView bridge that only captures MapCanvasProjection and triggers redraw on pan/zoom
  useEffect(() => {
    if (!map || !mapsLib) return;
    const rawGmaps = (window as unknown as GmapsGlobalShape).google?.maps;
    if (!rawGmaps?.OverlayView) return;

    class ProjectionBridge extends rawGmaps.OverlayView {
      onAdd() {}
      draw() {
        projectionRef.current = this.getProjection();
        drawCanvasRef.current();
      }
      onRemove() {
        projectionRef.current = null;
      }
    }

    const ov = new ProjectionBridge();
    ov.setMap(map);

    return () => {
      ov.setMap(null);
      projectionRef.current = null;
    };
  }, [map, mapsLib]);

  // Step runners smoothly until finished (and animate drive navigation / satellites)
  useEffect(() => {
    let raf = 0;
    let lastDraw = 0;
    let lastStatsTs = 0;
    let lastTs = 0;
    let frameNo = 0;

    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
      lastTs = ts;
      frameNo++;

      const st = stateRef.current;
      const rD = st.rD;
      const rA = st.rA;

      let stepped = false;
      if (lastStepSeqRef.current !== searchStepSeq) {
        lastStepSeqRef.current = searchStepSeq;
        if (rD && !rD.done) {
          rD.step();
          stepped = true;
        }
        if (rA && !rA.done) {
          rA.step();
          stepped = true;
        }
      } else if (!st.searchPaused && ts - lastDraw >= 42) {
        const stepsNow =
          st.speedVal === 0
            ? frameNo % 6 === 0
              ? 1
              : 0
            : Math.max(1, Math.round(Math.pow(1.72, st.speedVal)));
        for (let k = 0; k < stepsNow; k++) {
          if (rD && !rD.done) {
            rD.step();
            stepped = true;
          }
          if (rA && !rA.done) {
            rA.step();
            stepped = true;
          }
        }
      }

      let revealing = false;
      for (const rn of [rD, rA]) {
        if (rn && rn.found && rn.revealN < rn.path.length) {
          rn.revealN = Math.min(
            rn.path.length,
            rn.revealN + Math.max(2, Math.ceil(rn.path.length / 26)),
          );
          revealing = true;
        }
      }

      if (st.nav.on) {
        navTickCallbackRef.current(dt);
      }

      if (st.showSatellites) {
        st.simTime += dt;
      }

      const needDraw =
        stepped || revealing || st.nav.on || (st.showSatellites && ts - lastDraw >= 220);
      if (needDraw) {
        lastDraw = ts;
        drawCanvasRef.current();
      }

      if ((stepped || revealing) && rD && rA && (ts - lastStatsTs >= 110 || (rD.done && rA.done))) {
        lastStatsTs = ts;
        if (rD.found) stepsFor(graph, rD);
        if (rA.found) stepsFor(graph, rA);
        const savedPct =
          rD.expanded > 0 ? Math.max(0, Math.round((1 - rA.expanded / rD.expanded) * 100)) : 0;
        const focusKey =
          st.searchAlgo === 'dij'
            ? 'dij'
            : st.searchAlgo === 'ast'
              ? 'ast'
              : st.primaryAlgo;
        const activeRunner = focusKey === 'dij' ? rD : rA;

        statsCallbackRef.current({
          dijExpanded: rD.expanded,
          astExpanded: rA.expanded,
          dijDone: rD.done,
          astDone: rA.done,
          dijCost: rD.found ? rD.cost : 0,
          astCost: rA.found ? rA.cost : 0,
          dijKm: rD.found ? rD.km : 0,
          astKm: rA.found ? rA.km : 0,
          savedPct,
          totalNodes: graph.count,
          explainText: buildExplainText(activeRunner, focusKey),
          activeRunner,
        });
      }

      if (!rD?.done || !rA?.done || revealing || st.showSatellites || st.nav.on) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    graph,
    searchReplaySeq,
    searchPaused,
    searchStepSeq,
    showSatellites,
    searchAlgo,
    primaryAlgo,
    traffic,
    speedVal,
    nav.on,
  ]);

  // Redraw and refresh explain/activeRunner when visual toggles change
  useEffect(() => {
    const rD = stateRef.current.rD;
    const rA = stateRef.current.rA;
    if (rD && rA) {
      const focusKey =
        searchAlgo === 'dij' ? 'dij' : searchAlgo === 'ast' ? 'ast' : primaryAlgo;
      const activeRunner = focusKey === 'dij' ? rD : rA;
      const savedPct =
        rD.expanded > 0 ? Math.max(0, Math.round((1 - rA.expanded / rD.expanded) * 100)) : 0;
      statsCallbackRef.current({
        dijExpanded: rD.expanded,
        astExpanded: rA.expanded,
        dijDone: rD.done,
        astDone: rA.done,
        dijCost: rD.found ? rD.cost : 0,
        astCost: rA.found ? rA.cost : 0,
        dijKm: rD.found ? rD.km : 0,
        astKm: rA.found ? rA.km : 0,
        savedPct,
        totalNodes: graph.count,
        explainText: buildExplainText(activeRunner, focusKey),
        activeRunner,
      });
    }
    drawCanvasRef.current();
  }, [graph.count, searchAlgo, primaryAlgo, theme, showSatellites, satDefs, nav.on]);

  return null;
};

export const GoogleMapsView: React.FC<GoogleMapsViewProps> = ({
  cityKey,
  graph,
  theme,
  origin,
  destination,
  searchAlgo,
  primaryAlgo,
  searchPaused,
  searchReplaySeq,
  searchStepSeq,
  fitSeq,
  traffic,
  speedVal,
  showSatellites,
  satDefs,
  nav,
  onMapPick,
  onRouteComputed,
  onSearchStatsUpdate,
  onNavTick,
  onSwitchToRouteRace,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const cityCfg = CITIES[cityKey];
  const [mapLoadError, setMapLoadError] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!apiKey) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 pl-[410px] max-[760px]:pl-6 bg-[var(--land)]">
        <div className="floating-panel p-6 max-w-md border border-[var(--line)]">
          <h3 className="text-base font-semibold mb-2">Google Maps Mode Requires an API Key</h3>
          <p className="text-sm text-[var(--muted)] m-0 mb-4">
            In this standalone or unconfigured preview, interactive Route Race, GPS Satellites, and
            Euler’s Theorem run offline—switch back anytime or deploy with{' '}
            <code>VITE_GOOGLE_MAPS_API_KEY</code> for live Google Maps street tiles.
          </p>
          {onSwitchToRouteRace && (
            <button type="button" onClick={onSwitchToRouteRace} className="pill-btn primary">
              Back to Route Race
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full">
      <APIProvider
        apiKey={apiKey}
        language="en"
        region="US"
        onError={() => setMapLoadError(true)}
      >
        <GoogleMap
          key={cityKey}
          defaultCenter={cityCfg.geo.center}
          defaultZoom={cityCfg.geo.zoom}
          mapId="DEMO_MAP_ID"
          colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
          gestureHandling="greedy"
          disableDefaultUI={false}
          fullscreenControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{width: '100%', height: '100%'}}
          onClick={(ev) => {
            const latLng = ev.detail.latLng;
            if (latLng) {
              onMapPick({lat: latLng.lat, lng: latLng.lng});
            }
          }}
        >
          <AdvancedMarker position={origin} title={origin.name || cityCfg.geo.origin.name}>
            <Pin background="#1a73e8" borderColor="#0b57d0" glyphColor="#ffffff" />
          </AdvancedMarker>

          <AdvancedMarker
            position={destination}
            title={destination.name || cityCfg.geo.destination.name}
          >
            <Pin background="#d93025" borderColor="#991b1b" glyphColor="#ffffff" />
          </AdvancedMarker>

          <RouteCalculatorLayer
            origin={origin}
            destination={destination}
            onRouteComputed={onRouteComputed}
          />

          <RouteRaceGeoOverlay
            canvasRef={overlayCanvasRef}
            cityKey={cityKey}
            graph={graph}
            theme={theme}
            origin={origin}
            destination={destination}
            searchAlgo={searchAlgo}
            primaryAlgo={primaryAlgo}
            searchPaused={searchPaused}
            searchReplaySeq={searchReplaySeq}
            searchStepSeq={searchStepSeq}
            fitSeq={fitSeq}
            traffic={traffic}
            speedVal={speedVal}
            showSatellites={showSatellites}
            satDefs={satDefs}
            nav={nav}
            onSearchStatsUpdate={onSearchStatsUpdate}
            onNavTick={onNavTick}
          />
        </GoogleMap>
      </APIProvider>

      <canvas
        ref={overlayCanvasRef}
        data-testid="gmaps-search-canvas"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none z-[5]"
      />

      {mapLoadError && (
        <div className="absolute bottom-4 right-4 z-20 floating-panel px-4 py-2 text-xs text-[var(--jam)] border border-[var(--line)]">
          Unable to load Google Maps tiles. Try switching back to Route Race or Euler’s Theorem.
        </div>
      )}
    </div>
  );
};

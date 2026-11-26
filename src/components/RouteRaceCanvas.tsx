import React, {useEffect, useRef} from 'react';
import {
  type CityGraph,
  type Runner,
  fitScaleForRect,
  clampZoom,
  parksFor,
  nearestNodeWorld,
  getCityGapsWorld,
} from '../engine/graph';
import {
  type SatelliteDef,
  type GpsFixReading,
  computeGpsFix,
} from '../engine/satellites';
import {
  type EulerLevel,
  type EulerWalkState,
  analyzeEulerGraph,
  getActiveEdges,
  getValidNextEdges,
} from '../engine/euler';
import type {GameMode, GameState} from '../App';

export interface CameraState {
  cx: number;
  cy: number;
  z: number;
}

export interface NavState {
  on: boolean;
  r: Runner | null;
  t: number;
  seg: number;
  total: number;
  dur: number;
  arrived: boolean;
  x: number;
  y: number;
  head: number;
  d: number;
}

interface SubviewRect {
  k: 'dij' | 'ast';
  clip: {x: number; y: number; w: number; h: number};
  r: {x: number; y: number; w: number; h: number};
  tf?: {cx0: number; cy0: number; sc: number};
}

interface RouteRaceCanvasProps {
  gameState: GameState;
  mode: GameMode;
  graph: CityGraph;
  theme: 'light' | 'dark';
  selAlgo: 'dij' | 'ast';
  splitCompare: boolean;
  traffic: boolean;
  fromNode: number;
  toNode: number;
  rD: Runner | null;
  rA: Runner | null;
  running: boolean;
  paused: boolean;
  speedVal: number;
  stepTick: number;
  fitTick: number;
  zoomDeltaTick: {dir: number; seq: number};
  nav: NavState;
  showSatellites: boolean;
  satDefs: SatelliteDef[];
  gpsReceiver: {x: number; y: number};
  relayBoosted: boolean;
  eulerLevel: EulerLevel;
  eulerWalk: EulerWalkState;
  onStepRace: () => void;
  onMapNodeClick: (node: number) => void;
  onGpsMoveReceiver: (wx: number, wy: number) => void;
  onGpsReadingUpdate: (reading: GpsFixReading) => void;
  onEulerNodeClick: (nodeId: number, edgeId?: number) => void;
  onNavTick: (dt: number) => void;
  onResetZoomSignal?: () => void;
}

function getColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string) => cs.getPropertyValue('--' + n).trim();
  return {
    land: g('land') || '#f1f0ec',
    park: g('park') || '#cfe8c8',
    water: g('water') || '#a9d3ef',
    road: g('road') || '#ffffff',
    'road-edge': g('road-edge') || '#cfd3d7',
    'art-edge': g('art-edge') || '#b9bec3',
    hwy: g('hwy') || '#fbe2a0',
    'hwy-edge': g('hwy-edge') || '#e3b24a',
    route: g('route') || '#1a73e8',
    'route-edge': g('route-edge') || '#0b57d0',
    jam: g('jam') || '#d93025',
    slow: g('slow') || '#f29900',
    free: g('free') || '#34a853',
    dij: g('dij') || '#00897b',
    ast: g('ast') || '#8e24aa',
    sat: g('sat') || '#0284c7',
    gap: g('gap') || '#d97706',
    euler: g('euler') || '#0f766e',
    label: g('label') || '#5f6368',
    muted: g('muted') || '#5f6368',
    poi: g('poi') || '#3c4043',
    surface: g('surface') || '#ffffff',
    fg: g('fg') || '#202124',
    line: g('line') || '#dadce0',
    ok: g('ok') || '#188038',
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

export const RouteRaceCanvas: React.FC<RouteRaceCanvasProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const camRef = useRef<CameraState>({cx: 0, cy: 0, z: 1});
  const tgtRef = useRef<CameraState>({cx: 0, cy: 0, z: 1});
  const lastSubsRef = useRef<SubviewRect[]>([]);
  const lastCityKeyRef = useRef<string>('');
  const lastFitTickRef = useRef<number>(-1);
  const lastZoomTickRef = useRef<number>(-1);
  const lastStepTickRef = useRef<number>(-1);
  const eulerHitRegionsRef = useRef<{
    nodes: Array<{id: number; x: number; y: number; r: number}>;
    edges: Array<{id: number; u: number; v: number; mx: number; my: number}>;
  }>({nodes: [], edges: []});

  const getInsets = (W: number) => {
    const p = propsRef.current;
    if (p.nav.on) return {l: 0, t: 100, r: 0, b: 90};
    if (p.gameState === 'title') return {l: 450, t: 24, r: 24, b: 24};
    if (W <= 760) return {l: 0, t: 60, r: 0, b: Math.min(HCache.current * 0.48, 340)};
    return {l: 404, t: 60, r: 60, b: 0};
  };

  const WCache = useRef(1200);
  const HCache = useRef(800);

  const computeFitRoute = (jump: boolean) => {
    const p = propsRef.current;
    const G = p.graph;
    const W = WCache.current;
    const H = HCache.current;
    const ins = getInsets(W);
    const rw = Math.max(240, W - ins.l - ins.r);
    const rh = Math.max(240, H - ins.t - ins.b);
    const fit = fitScaleForRect(G, rw, rh, 24);

    if (p.fromNode >= 0 && p.toNode >= 0) {
      const xs = [G.nx[p.fromNode], G.nx[p.toNode]];
      const ys = [G.ny[p.fromNode], G.ny[p.toNode]];
      const bw = Math.max(Math.abs(xs[0] - xs[1]), 3) * 1.5;
      const bh = Math.max(Math.abs(ys[0] - ys[1]), 2.2) * 1.5;
      const need = Math.min((rw - 40) / bw, (rh - 40) / bh);
      tgtRef.current.z = clampZoom(Math.max(0.9, Math.min(8, need / fit)));
      tgtRef.current.cx = (xs[0] + xs[1]) / 2;
      tgtRef.current.cy = (ys[0] + ys[1]) / 2;
    } else {
      tgtRef.current.z = 1;
      tgtRef.current.cx = (G.minX + G.maxX) / 2;
      tgtRef.current.cy = (G.minY + G.maxY) / 2;
    }

    if (jump) {
      camRef.current = {...tgtRef.current};
    }
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const parent = cv.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = parent.clientWidth;
      const H = parent.clientHeight;
      WCache.current = W;
      HCache.current = H;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (cv.parentElement) ro.observe(cv.parentElement);

    const ptrs = new Map<number, {x: number; y: number}>();
    let moved = false;
    let pinchD = 0;
    let downAt: {x: number; y: number} | null = null;

    const subAt = (px: number, py: number) => {
      for (const s of lastSubsRef.current) {
        if (px >= s.clip.x && px <= s.clip.x + s.clip.w && py >= s.clip.y && py <= s.clip.y + s.clip.h) {
          return s;
        }
      }
      return lastSubsRef.current[0];
    };

    const zoomAt = (px: number, py: number, f: number) => {
      const s = subAt(px, py);
      if (!s || !s.tf) return;
      const cam = camRef.current;
      const wx = cam.cx + (px - s.tf.cx0) / s.tf.sc;
      const wy = cam.cy + (py - s.tf.cy0) / s.tf.sc;
      const nz = clampZoom(cam.z * f);
      const sc2 = (s.tf.sc * nz) / cam.z;
      cam.cx = wx - (px - s.tf.cx0) / sc2;
      cam.cy = wy - (py - s.tf.cy0) / sc2;
      cam.z = nz;
      tgtRef.current = {...cam};
    };

    const handleClickAt = (px: number, py: number) => {
      const p = propsRef.current;
      if (p.gameState !== 'playing' || p.nav.on) return;

      if (p.mode === 'euler') {
        const hits = eulerHitRegionsRef.current;
        for (const n of hits.nodes) {
          if (Math.hypot(px - n.x, py - n.y) <= n.r + 6) {
            p.onEulerNodeClick(n.id);
            return;
          }
        }
        // Check direct edge midpoint clicks (great for parallel bridges in Königsberg!)
        const curNode = p.eulerWalk.nodeHistory[p.eulerWalk.nodeHistory.length - 1];
        if (curNode !== undefined) {
          for (const e of hits.edges) {
            if (Math.hypot(px - e.mx, py - e.my) <= 22) {
              if (e.u === curNode) {
                p.onEulerNodeClick(e.v, e.id);
                return;
              }
              if (e.v === curNode) {
                p.onEulerNodeClick(e.u, e.id);
                return;
              }
            }
          }
        }
        return;
      }

      const s = subAt(px, py);
      if (!s || !s.tf) return;
      const cam = camRef.current;
      const wx = cam.cx + (px - s.tf.cx0) / s.tf.sc;
      const wy = cam.cy + (py - s.tf.cy0) / s.tf.sc;

      if (p.mode === 'gps') {
        p.onGpsMoveReceiver(wx, wy);
        return;
      }

      const node = nearestNodeWorld(p.graph, wx, wy);
      if (node >= 0) {
        p.onMapNodeClick(node);
      }
    };

    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, {x: e.offsetX, y: e.offsetY});
      downAt = {x: e.offsetX, y: e.offsetY};
      moved = false;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      const pr = propsRef.current;
      if (!p || pr.nav.on || pr.mode === 'euler') return;
      if (ptrs.size === 1 && downAt) {
        const dx = e.offsetX - p.x;
        const dy = e.offsetY - p.y;
        if (Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 5) moved = true;
        if (moved) {
          const s = subAt(e.offsetX, e.offsetY);
          if (s && s.tf) {
            camRef.current.cx -= dx / s.tf.sc;
            camRef.current.cy -= dy / s.tf.sc;
            tgtRef.current.cx = camRef.current.cx;
            tgtRef.current.cy = camRef.current.cy;
          }
        }
        p.x = e.offsetX;
        p.y = e.offsetY;
      } else if (ptrs.size === 2) {
        p.x = e.offsetX;
        p.y = e.offsetY;
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
        pinchD = d;
        moved = true;
      }
    };

    const onUp = (e: PointerEvent) => {
      const had = ptrs.size === 1 && ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      pinchD = 0;
      if (had && !moved) handleClickAt(e.offsetX, e.offsetY);
    };

    const onCancel = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!propsRef.current.nav.on && propsRef.current.mode !== 'euler') {
        zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      }
    };

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('wheel', onWheel, {passive: false});

    let rafId = 0;
    let lastTs = 0;
    let lastDrawTs = 0;
    let cachedTheme = '';
    let cachedCols: ReturnType<typeof getColors> | null = null;
    const bgCanvas = document.createElement('canvas');
    const bgCtx = bgCanvas.getContext('2d');
    let lastBgKey = '';
    let lastRenderSig = '';
    let frameNo = 0;
    let simTime = 0;
    let lastGpsBroadcast = 0;

    const drawSub = (sub: SubviewRect, col: ReturnType<typeof getColors>, timeSec: number) => {
      const p = propsRef.current;
      const G = p.graph;
      const c = G.cfg;
      const {clip, r, k} = sub;
      const cam = camRef.current;
      const sc = fitScaleForRect(G, r.w, r.h, 24) * cam.z;
      const cx0 = r.x + r.w / 2;
      const cy0 = r.y + r.h / 2;
      const X = (x: number) => cx0 + (x - cam.cx) * sc;
      const Y = (y: number) => cy0 + (y - cam.cy) * sc;
      sub.tf = {cx0, cy0, sc};
      const lw = Math.max(0.8, Math.min(3.4, sc / 55));

      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();

      // Static background (land, parks, water, roads, traffic) is pre-rendered to bgCanvas in tick!
      // Just keep search trees, routes, satellites, and pins here.

      // Search trees (when in race or title mode)
      const run = k === 'dij' ? p.rD : p.rA;
      if (run && !p.nav.on && p.mode !== 'gps') {
        const sc2 = col[k];
        ctx.strokeStyle = sc2;
        ctx.lineWidth = lw * 2.2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let n = 0; n < G.N; n++) {
          if (!run.closed[n] || run.parent[n] < 0) continue;
          ctx.moveTo(X(G.nx[run.parent[n]]), Y(G.ny[run.parent[n]]));
          ctx.lineTo(X(G.nx[n]), Y(G.ny[n]));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (!run.done) {
          ctx.fillStyle = sc2;
          for (let n = 0; n < G.N; n++) {
            if (run.closed[n] || run.g[n] === Infinity) continue;
            ctx.beginPath();
            ctx.arc(X(G.nx[n]), Y(G.ny[n]), lw * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (run && !p.nav.on && !run.done && run.cur >= 0 && p.mode === 'race') {
        const cu = run.cur;
        const x = X(G.nx[cu]);
        const y = Y(G.ny[cu]);
        if (k === 'ast' && p.toNode >= 0) {
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = col[k];
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = lw * 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(X(G.nx[p.toNode]), Y(G.ny[p.toNode]));
          ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = col.fg;
        ctx.lineWidth = lw * 3.2;
        ctx.beginPath();
        for (const v of run.relaxed) {
          ctx.moveTo(x, y);
          ctx.lineTo(X(G.nx[v]), Y(G.ny[v]));
        }
        ctx.stroke();
        ctx.fillStyle = col.fg;
        for (const v of run.relaxed) {
          ctx.beginPath();
          ctx.arc(X(G.nx[v]), Y(G.ny[v]), lw * 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = col.surface;
        ctx.beginPath();
        ctx.arc(x, y, lw * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = col[k];
        ctx.lineWidth = 3.5;
        ctx.stroke();
        const g = run.g[cu];
        const txt =
          k === 'ast'
            ? `g ${g.toFixed(1)} + h ${run.h(cu).toFixed(1)} = ${(g + run.h(cu)).toFixed(1)}`
            : `g = ${g.toFixed(1)} min`;
        ctx.font = '500 12px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width + 16;
        const bx = x - tw / 2;
        const by = y - lw * 7 - 28;
        ctx.fillStyle = col.surface;
        roundRectPath(ctx, bx, by, tw, 22, 11);
        ctx.fill();
        ctx.strokeStyle = col[k];
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = col.fg;
        ctx.fillText(txt, bx + 8, by + 11.5);
      }

      // Optimal path reveal
      if (run && run.found && (p.nav.on || run.revealN > 0) && p.mode !== 'gps') {
        const pp = p.nav.on ? run.path : run.path.slice(run.path.length - run.revealN);
        for (const [style, wd] of [
          [col['route-edge'], 8.5],
          [col.route, 6],
        ] as const) {
          ctx.strokeStyle = style;
          ctx.lineWidth = lw * wd;
          ctx.beginPath();
          pp.forEach((n, i) =>
            i ? ctx.lineTo(X(G.nx[n]), Y(G.ny[n])) : ctx.moveTo(X(G.nx[n]), Y(G.ny[n])),
          );
          ctx.stroke();
        }
      }

      // Signal Gap Zones & GPS Satellite Trilateration Overlay
      const satOverlayActive = p.mode === 'gps' || p.showSatellites || p.gameState === 'title';
      if (satOverlayActive) {
        const gaps = getCityGapsWorld(G);
        for (const gap of gaps) {
          const gx = X(gap.wx);
          const gy = Y(gap.wy);
          const gr = gap.radiusKm * sc;
          ctx.save();
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fillStyle = p.relayBoosted ? 'rgba(24, 128, 56, 0.12)' : 'rgba(217, 119, 6, 0.16)';
          ctx.fill();
          ctx.setLineDash([7, 5]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = p.relayBoosted ? col.ok : col.gap;
          ctx.stroke();
          ctx.restore();

          // Gap label
          ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
          const label = `${gap.cause.toUpperCase()} · ${gap.name}`;
          const tw = ctx.measureText(label).width + 14;
          ctx.fillStyle = col.surface;
          roundRectPath(ctx, gx - tw / 2, gy - gr - 24, tw, 20, 6);
          ctx.fill();
          ctx.strokeStyle = p.relayBoosted ? col.ok : col.gap;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = p.relayBoosted ? col.ok : col.gap;
          ctx.textBaseline = 'middle';
          ctx.fillText(label, gx - tw / 2 + 7, gy - gr - 14);
        }

        const rx = p.nav.on ? p.nav.x : p.mode === 'gps' ? p.gpsReceiver.x : G.nx[Math.max(0, p.fromNode)];
        const ry = p.nav.on ? p.nav.y : p.mode === 'gps' ? p.gpsReceiver.y : G.ny[Math.max(0, p.fromNode)];
        const reading = computeGpsFix(G, rx, ry, p.satDefs, timeSec, p.relayBoosted);

        if (p.mode === 'gps' && p.gameState === 'playing' && timeSec - lastGpsBroadcast > 0.35) {
          lastGpsBroadcast = timeSec;
          p.onGpsReadingUpdate(reading);
        }

        const rScreenX = X(rx);
        const rScreenY = Y(ry);

        // Draw satellite trilateration rings & beams
        for (const sat of reading.satellites) {
          if (!sat.enabled) continue;
          const sx = X(sat.wx);
          const sy = Y(sat.wy);
          const sr = sat.rangeKm * sc;

          // Trilateration circle
          ctx.save();
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.strokeStyle = sat.locked ? sat.color : col.gap;
          ctx.globalAlpha = sat.locked ? 0.34 : 0.2;
          ctx.lineWidth = sat.locked ? 2 : 1.5;
          if (!sat.locked) ctx.setLineDash([5, 6]);
          ctx.stroke();

          // Signal beam to receiver
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(rScreenX, rScreenY);
          ctx.globalAlpha = sat.locked ? 0.55 : 0.35;
          ctx.lineWidth = sat.locked ? 1.8 : 1.4;
          if (!sat.locked) ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.restore();

          // Satellite glyph
          ctx.save();
          ctx.translate(sx, sy);
          ctx.fillStyle = col.surface;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = sat.locked ? sat.color : col.gap;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Solar wings + body
          ctx.rotate(-0.45);
          ctx.fillStyle = sat.locked ? sat.color : col.gap;
          ctx.fillRect(-10, -2.5, 6, 5);
          ctx.fillRect(4, -2.5, 6, 5);
          ctx.fillStyle = col.fg;
          ctx.fillRect(-3, -4, 6, 8);
          ctx.restore();

          // Satellite tag
          ctx.font = '600 10.5px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          const tag = sat.locked ? sat.id : `${sat.id} BLOCKED`;
          const tw = ctx.measureText(tag).width + 10;
          ctx.fillStyle = col.surface;
          roundRectPath(ctx, sx - tw / 2, sy + 18, tw, 17, 5);
          ctx.fill();
          ctx.strokeStyle = sat.locked ? sat.color : col.gap;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = sat.locked ? sat.color : col.gap;
          ctx.fillText(tag, sx - tw / 2 + 5, sy + 26.5);
        }

        // Draw uncertainty radius & map-matching snap line in GPS mode
        if (p.mode === 'gps') {
          const errPx = Math.max(10, (reading.accuracyMeters / 1000) * sc * 2.1);
          const rawSX = X(reading.rawX);
          const rawSY = Y(reading.rawY);
          const snapSX = X(reading.snappedX);
          const snapSY = Y(reading.snappedY);

          // Uncertainty circle around raw estimate
          ctx.save();
          ctx.beginPath();
          ctx.arc(rawSX, rawSY, errPx, 0, Math.PI * 2);
          ctx.fillStyle =
            reading.lockedCount >= 3 ? 'rgba(2, 132, 199, 0.14)' : 'rgba(217, 119, 6, 0.18)';
          ctx.fill();
          ctx.strokeStyle = reading.lockedCount >= 3 ? col.sat : col.gap;
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Raw drifting GPS dot
          ctx.fillStyle = reading.lockedCount >= 3 ? col.sat : col.gap;
          ctx.beginPath();
          ctx.arc(rawSX, rawSY, 5, 0, Math.PI * 2);
          ctx.fill();

          // Map-matching snap vector onto road graph
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = col.ok;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rawSX, rawSY);
          ctx.lineTo(snapSX, snapSY);
          ctx.stroke();
          ctx.restore();

          // Snapped road-graph receiver marker
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(snapSX, snapSY, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col.ok;
          ctx.lineWidth = 3.5;
          ctx.stroke();
        }
      }

      // Origin & destination pins (in race mode)
      if (p.mode === 'race') {
        if (p.fromNode >= 0) {
          const x = X(G.nx[p.fromNode]);
          const y = Y(G.ny[p.fromNode]);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col.route;
          ctx.lineWidth = 3.4;
          ctx.stroke();
        }
        if (p.toNode >= 0) {
          const x = X(G.nx[p.toNode]);
          const y = Y(G.ny[p.toNode]);
          ctx.fillStyle = '#d93025';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(x, y - 18, 10, Math.PI * 0.78, Math.PI * 0.22, false);
          ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y - 18, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Navigation vehicle
      if (p.nav.on) {
        const x = X(p.nav.x);
        const y = Y(p.nav.y);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((p.nav.head + 90) * Math.PI) / 180);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.route;
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

      // Split label
      if (p.splitCompare && !p.nav.on && p.mode === 'race') {
        const name = k === 'dij' ? 'Dijkstra' : 'A*';
        const rn = k === 'dij' ? p.rD : p.rA;
        const txt = name + (rn ? ` · ${rn.expanded.toLocaleString()} searched` : '');
        ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width + 34;
        ctx.fillStyle = col.surface;
        roundRectPath(ctx, clip.x + 10, clip.y + 10, tw, 30, 15);
        ctx.fill();
        ctx.fillStyle = col[k];
        ctx.beginPath();
        ctx.arc(clip.x + 25, clip.y + 25, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.fg;
        ctx.fillText(txt, clip.x + 36, clip.y + 25.5);
      }

      ctx.restore();
    };

    const drawEulerMode = (W: number, H: number, col: ReturnType<typeof getColors>, timeSec: number) => {
      const p = propsRef.current;
      const lvl = p.eulerLevel;
      const walk = p.eulerWalk;
      const ins = getInsets(W);
      const area = {
        x: ins.l + 24,
        y: ins.t + 24,
        w: Math.max(260, W - ins.l - ins.r - 48),
        h: Math.max(260, H - ins.t - ins.b - 48),
      };

      ctx.fillStyle = col.land;
      ctx.fillRect(0, 0, W, H);

      // Subtle district card backdrop
      ctx.fillStyle = col.park;
      ctx.globalAlpha = 0.35;
      roundRectPath(ctx, area.x, area.y, area.w, area.h, 24);
      ctx.fill();
      ctx.globalAlpha = 1;

      // River / Harbour band
      if (lvl.riverAxis && lvl.riverAt !== undefined) {
        ctx.fillStyle = col.water;
        ctx.font = 'italic 14px "STIX Two Text", Georgia, serif';
        if (lvl.riverAxis === 'h') {
          const ry = area.y + lvl.riverAt * area.h;
          ctx.fillRect(area.x, ry - 26, area.w, 52);
          ctx.fillStyle = col.label;
          ctx.fillText(lvl.riverLabel || 'River', area.x + 18, ry - 34);
        } else {
          const rx = area.x + lvl.riverAt * area.w;
          ctx.fillRect(rx - 28, area.y, 56, area.h);
          ctx.fillStyle = col.label;
          ctx.fillText(lvl.riverLabel || 'River', rx + 36, area.y + area.h - 18);
        }
      }

      const activeEdges = getActiveEdges(lvl, walk.bonusBridgeEnabled);
      const analysis = analyzeEulerGraph(lvl, walk.bonusBridgeEnabled);
      const validNext = new Set(getValidNextEdges(lvl, walk).map((e) => e.id));
      const usedSet = new Set(walk.edgeHistory);

      const nodePos = lvl.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        x: area.x + n.fx * area.w,
        y: area.y + n.fy * area.h,
      }));

      // Group parallel edges so we can offset curved arcs cleanly
      const pairGroups = new Map<string, number[]>();
      for (const e of activeEdges) {
        const pairKey = e.u < e.v ? `${e.u}-${e.v}` : `${e.v}-${e.u}`;
        const list = pairGroups.get(pairKey) || [];
        list.push(e.id);
        pairGroups.set(pairKey, list);
      }

      const hitEdges: Array<{id: number; u: number; v: number; mx: number; my: number}> = [];

      for (const e of activeEdges) {
        const a = nodePos[e.u];
        const b = nodePos[e.v];
        const pairKey = e.u < e.v ? `${e.u}-${e.v}` : `${e.v}-${e.u}`;
        const siblings = pairGroups.get(pairKey) || [e.id];
        const sibIdx = siblings.indexOf(e.id);
        const offsetScale = siblings.length > 1 ? (sibIdx === 0 ? -42 : 42) : 0;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;
        const cx = (a.x + b.x) / 2 + nx * offsetScale;
        const cy = (a.y + b.y) / 2 + ny * offsetScale;
        // Midpoint along quadratic curve at t = 0.5
        const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
        const my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
        hitEdges.push({id: e.id, u: e.u, v: e.v, mx, my});

        const isUsed = usedSet.has(e.id);
        const isNext = validNext.has(e.id);
        const stepIdx = walk.edgeHistory.indexOf(e.id);

        // Edge casing
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.strokeStyle = isUsed
          ? col.ok
          : isNext
            ? col.route
            : e.isBridge
              ? col['hwy-edge']
              : col['art-edge'];
        ctx.lineWidth = isUsed ? 11 : isNext ? 11 : 9;
        ctx.stroke();

        // Inner road fill
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        if (e.isBonus) ctx.setLineDash([8, 5]);
        ctx.strokeStyle = isUsed
          ? col.ok
          : isNext
            ? col.surface
            : e.isBridge
              ? col.hwy
              : col.road;
        ctx.lineWidth = isUsed ? 6 : isNext ? 6.5 : 5.5;
        ctx.stroke();
        ctx.restore();

        // Step badge or road label at midpoint
        ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        if (isUsed) {
          ctx.fillStyle = col.ok;
          ctx.beginPath();
          ctx.arc(mx, my, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          const num = String(stepIdx + 1);
          const nw = ctx.measureText(num).width;
          ctx.fillText(num, mx - nw / 2, my + 0.5);
        } else {
          const tw = ctx.measureText(e.label).width + 12;
          ctx.fillStyle = col.surface;
          roundRectPath(ctx, mx - tw / 2, my - 10, tw, 20, 6);
          ctx.fill();
          ctx.strokeStyle = isNext ? col.route : col.line;
          ctx.lineWidth = isNext ? 1.6 : 1;
          ctx.stroke();
          ctx.fillStyle = isNext ? col.route : col.muted || col.label;
          ctx.fillText(e.label, mx - tw / 2 + 6, my + 0.5);
        }
      }

      // Draw interactive junction nodes with Vertex Degree badges
      const curNode = walk.nodeHistory[walk.nodeHistory.length - 1];
      const startNode = walk.nodeHistory[0];
      const hitNodes: Array<{id: number; x: number; y: number; r: number}> = [];

      for (const np of nodePos) {
        const deg = analysis.degrees[np.id];
        const isOdd = deg % 2 === 1;
        const isCur = curNode === np.id;
        const isStart = startNode === np.id;
        const pulse = isCur ? 1 + 0.08 * Math.sin(timeSec * 6) : 1;
        const rad = 22 * pulse;

        hitNodes.push({id: np.id, x: np.x, y: np.y, r: 24});

        if (isCur) {
          ctx.beginPath();
          ctx.arc(np.x, np.y, rad + 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(26, 115, 232, 0.22)';
          ctx.fill();
        }

        ctx.fillStyle = col.surface;
        ctx.beginPath();
        ctx.arc(np.x, np.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = isCur ? 4 : 3;
        ctx.strokeStyle = isCur ? col.route : isOdd ? col.gap : col.euler;
        ctx.stroke();

        // Degree number inside node
        ctx.font = '700 15px "JetBrains Mono", monospace';
        ctx.fillStyle = isOdd ? col.gap : col.euler;
        const degStr = String(deg);
        const dw = ctx.measureText(degStr).width;
        ctx.textBaseline = 'middle';
        ctx.fillText(degStr, np.x - dw / 2, np.y + 0.5);

        // Node name + Odd/Even pill-free label below
        const caption = `${np.label} · ${isOdd ? 'Odd' : 'Even'}${isStart ? ' (Start)' : ''}`;
        ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
        const cw = ctx.measureText(caption).width + 14;
        ctx.fillStyle = col.surface;
        roundRectPath(ctx, np.x - cw / 2, np.y + rad + 6, cw, 22, 6);
        ctx.fill();
        ctx.strokeStyle = col.line;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = col.fg;
        ctx.fillText(caption, np.x - cw / 2 + 7, np.y + rad + 17.5);
      }

      eulerHitRegionsRef.current = {nodes: hitNodes, edges: hitEdges};
    };

    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
      lastTs = ts;
      frameNo++;
      simTime += dt;

      const p = propsRef.current;

      // Sync city change or fit requests
      if (lastCityKeyRef.current !== p.graph.key) {
        lastCityKeyRef.current = p.graph.key;
        computeFitRoute(true);
      }
      if (lastFitTickRef.current !== p.fitTick) {
        lastFitTickRef.current = p.fitTick;
        computeFitRoute(false);
      }
      if (lastZoomTickRef.current !== p.zoomDeltaTick.seq) {
        lastZoomTickRef.current = p.zoomDeltaTick.seq;
        if (p.zoomDeltaTick.dir !== 0) {
          tgtRef.current.z = clampZoom(
            tgtRef.current.z * (p.zoomDeltaTick.dir > 0 ? 1.6 : 1 / 1.6),
          );
        }
      }

      // Advance search algorithm steps
      let raceChanged = false;
      if (p.gameState === 'playing' && p.mode === 'race') {
        if (lastStepTickRef.current !== p.stepTick) {
          lastStepTickRef.current = p.stepTick;
          if (p.running) {
            p.onStepRace();
            raceChanged = true;
          }
        } else if (p.running && !p.paused) {
          const stepsNow =
            p.speedVal === 0 ? (frameNo % 6 === 0 ? 1 : 0) : Math.round(Math.pow(1.75, p.speedVal));
          for (let k = 0; k < stepsNow; k++) {
            p.onStepRace();
          }
          if (stepsNow > 0) raceChanged = true;
        }
      }

      // Reveal path animation
      let revealing = false;
      for (const rn of [p.rD, p.rA]) {
        if (rn && rn.found && rn.revealN < rn.path.length) {
          rn.revealN = Math.min(
            rn.path.length,
            rn.revealN + Math.max(1, Math.ceil(rn.path.length / 50)),
          );
          revealing = true;
        }
      }

      if (p.nav.on && p.gameState === 'playing') {
        p.onNavTick(dt);
        tgtRef.current.cx = p.nav.x;
        tgtRef.current.cy = p.nav.y;
        tgtRef.current.z = 5;
      }

      // Smooth camera damping
      const camMoving =
        Math.abs(tgtRef.current.cx - camRef.current.cx) > 1e-4 ||
        Math.abs(tgtRef.current.cy - camRef.current.cy) > 1e-4 ||
        Math.abs(tgtRef.current.z - camRef.current.z) > 1e-4;
      if (camMoving) {
        const k = 1 - Math.exp(-dt * 8);
        camRef.current.cx += (tgtRef.current.cx - camRef.current.cx) * k;
        camRef.current.cy += (tgtRef.current.cy - camRef.current.cy) * k;
        camRef.current.z += (tgtRef.current.z - camRef.current.z) * k;
      }

      const renderSig = `${p.gameState}|${p.mode}|${p.graph.key}|${p.theme}|${p.selAlgo}|${p.splitCompare}|${p.traffic}|${p.fromNode}|${p.toNode}|${p.showSatellites}|${p.gpsReceiver.x.toFixed(2)}|${p.gpsReceiver.y.toFixed(2)}|${p.relayBoosted}|${p.eulerLevel.id}|${p.eulerWalk.edgeHistory.length}|${p.eulerWalk.bonusBridgeEnabled}|${p.satDefs.map((s) => (s.enabled ? 1 : 0)).join('')}|${WCache.current}x${HCache.current}`;
      const stateDirty = renderSig !== lastRenderSig;
      const fastAnim = raceChanged || revealing || p.nav.on || camMoving;
      const slowOrbit = p.mode === 'gps' || p.showSatellites || p.gameState === 'title' || p.mode === 'euler';
      const minInterval = fastAnim ? 33 : slowOrbit ? 140 : 1000;
      const shouldDraw = lastDrawTs === 0 || stateDirty || (ts - lastDrawTs >= minInterval);

      if (shouldDraw) {
        lastRenderSig = renderSig;
        lastDrawTs = ts;
        const W = WCache.current;
        const H = HCache.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (cachedTheme !== p.theme || !cachedCols) {
          cachedTheme = p.theme;
          cachedCols = getColors();
        }
        const col = cachedCols;

        if (p.mode === 'euler' && p.gameState !== 'title') {
          drawEulerMode(W, H, col, simTime);
        } else {
          const ins = getInsets(W);
          const x0 = ins.l;
          const y0 = ins.t;
          const w = Math.max(100, W - ins.l - ins.r);
          const h = Math.max(100, H - ins.t - ins.b);
          const full = {x: 0, y: 0, w: W, h: H};

          let subs: SubviewRect[];
          if (p.splitCompare && !p.nav.on && p.mode === 'race' && p.gameState === 'playing') {
            if (w >= h * 1.1) {
              const hw = Math.floor(w / 2);
              subs = [
                {k: 'dij', clip: {x: x0, y: y0, w: hw - 1, h}, r: {x: x0, y: y0, w: hw - 1, h}},
                {
                  k: 'ast',
                  clip: {x: x0 + hw + 1, y: y0, w: hw - 1, h},
                  r: {x: x0 + hw + 1, y: y0, w: hw - 1, h},
                },
              ];
            } else {
              const hh = Math.floor(h / 2);
              subs = [
                {k: 'dij', clip: {x: x0, y: y0, w, h: hh - 1}, r: {x: x0, y: y0, w, h: hh - 1}},
                {
                  k: 'ast',
                  clip: {x: x0, y: y0 + hh + 1, w, h: hh - 1},
                  r: {x: x0, y: y0 + hh + 1, w, h: hh - 1},
                },
              ];
            }
          } else {
            subs = [{k: p.selAlgo, clip: full, r: {x: x0, y: y0, w, h}}];
          }

          const cam = camRef.current;
          const bgKey = `${p.graph.key}|${p.theme}|${p.traffic}|${W}|${H}|${dpr}|${subs.length}|${cam.cx.toFixed(3)}|${cam.cy.toFixed(3)}|${cam.z.toFixed(3)}|${p.gameState === 'title'}`;
          if (bgCtx) {
            if (bgCanvas.width !== cv.width || bgCanvas.height !== cv.height) {
              bgCanvas.width = cv.width;
              bgCanvas.height = cv.height;
              lastBgKey = '';
            }
            if (lastBgKey !== bgKey) {
              lastBgKey = bgKey;
              bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
              bgCtx.fillStyle = col.land;
              bgCtx.fillRect(0, 0, W, H);
              const G = p.graph;
              const c = G.cfg;
              const parks = parksFor(G);
              const br = c.barrier;
              for (const sub of subs) {
                const {clip, r} = sub;
                const sc = fitScaleForRect(G, r.w, r.h, 24) * cam.z;
                const cx0 = r.x + r.w / 2;
                const cy0 = r.y + r.h / 2;
                const bX = (x: number) => cx0 + (x - cam.cx) * sc;
                const bY = (y: number) => cy0 + (y - cam.cy) * sc;
                const lw = Math.max(0.8, Math.min(3.4, sc / 55));

                bgCtx.save();
                bgCtx.beginPath();
                bgCtx.rect(clip.x, clip.y, clip.w, clip.h);
                bgCtx.clip();
                bgCtx.fillStyle = col.land;
                bgCtx.fillRect(clip.x, clip.y, clip.w, clip.h);

                bgCtx.fillStyle = col.park;
                for (let j = 0; j < c.rows - 1; j++) {
                  for (let i = 0; i < c.cols - 1; i++) {
                    if (!parks[j * c.cols + i]) continue;
                    if (br && ((br.axis === 'v' && i === br.at) || (br.axis === 'h' && j === br.at))) continue;
                    const a0 = j * c.cols + i;
                    const a1 = a0 + 1;
                    const a2 = a0 + c.cols + 1;
                    const a3 = a0 + c.cols;
                    bgCtx.beginPath();
                    bgCtx.moveTo(bX(G.nx[a0]), bY(G.ny[a0]));
                    bgCtx.lineTo(bX(G.nx[a1]), bY(G.ny[a1]));
                    bgCtx.lineTo(bX(G.nx[a2]), bY(G.ny[a2]));
                    bgCtx.lineTo(bX(G.nx[a3]), bY(G.ny[a3]));
                    bgCtx.closePath();
                    bgCtx.fill();
                  }
                }

                if (br) {
                  bgCtx.fillStyle = col.water;
                  bgCtx.font = 'italic 13px "STIX Two Text", Georgia, serif';
                  if (br.axis === 'v') {
                    const cx = bX((br.at + 0.5) * c.sx);
                    const hw = 0.2 * c.sx * sc;
                    bgCtx.fillRect(cx - hw, clip.y, hw * 2, clip.h);
                    bgCtx.fillStyle = col.label;
                    bgCtx.fillText(br.label, cx + hw + 6, clip.y + clip.h - 14);
                  } else {
                    const cy = bY((br.at + 0.5) * c.sy);
                    const hh = 0.2 * c.sy * sc;
                    bgCtx.fillRect(clip.x, cy - hh, clip.w, hh * 2);
                    bgCtx.fillStyle = col.label;
                    bgCtx.fillText(br.label, clip.x + clip.w - 70, cy - hh - 6);
                  }
                }

                bgCtx.lineCap = 'round';
                bgCtx.lineJoin = 'round';
                const classes = [
                  {sp: 30, edge: col['road-edge'], fill: col.road, we: 2.8, wf: 1.7},
                  {sp: 60, edge: col['art-edge'], fill: col.road, we: 4.2, wf: 2.9},
                  {sp: 80, edge: col['hwy-edge'], fill: col.hwy, we: 5.4, wf: 3.9},
                ];
                for (const pass of ['edge', 'fill'] as const) {
                  for (const kcl of classes) {
                    bgCtx.strokeStyle = pass === 'edge' ? kcl.edge : kcl.fill;
                    bgCtx.lineWidth = lw * (pass === 'edge' ? kcl.we : kcl.wf);
                    bgCtx.beginPath();
                    for (let e = 0; e < G.E; e++) {
                      if (G.espeed[e] !== kcl.sp) continue;
                      bgCtx.moveTo(bX(G.nx[G.eu[e]]), bY(G.ny[G.eu[e]]));
                      bgCtx.lineTo(bX(G.nx[G.ev[e]]), bY(G.ny[G.ev[e]]));
                    }
                    bgCtx.stroke();
                  }
                }

                if (p.traffic) {
                  bgCtx.strokeStyle = col.free;
                  bgCtx.lineWidth = lw * 2;
                  bgCtx.beginPath();
                  for (let e = 0; e < G.E; e++) {
                    if (G.espeed[e] < 60 || G.etau[e] > 1.12) continue;
                    bgCtx.moveTo(bX(G.nx[G.eu[e]]), bY(G.ny[G.eu[e]]));
                    bgCtx.lineTo(bX(G.nx[G.ev[e]]), bY(G.ny[G.ev[e]]));
                  }
                  bgCtx.stroke();
                  for (let e = 0; e < G.E; e++) {
                    const tau = G.etau[e];
                    if (tau <= 1.12) continue;
                    bgCtx.strokeStyle = tau > 1.8 ? col.jam : col.slow;
                    bgCtx.lineWidth = lw * 2.6;
                    bgCtx.beginPath();
                    bgCtx.moveTo(bX(G.nx[G.eu[e]]), bY(G.ny[G.eu[e]]));
                    bgCtx.lineTo(bX(G.nx[G.ev[e]]), bY(G.ny[G.ev[e]]));
                    bgCtx.stroke();
                  }
                }
                bgCtx.restore();
              }
            }
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(bgCanvas, 0, 0);
            ctx.restore();
          }

          lastSubsRef.current = subs;
          for (const s of subs) drawSub(s, col, simTime);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onCancel);
      cv.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="route-race-canvas"
      aria-label="Interactive GPS and road network map"
      className="absolute inset-0 w-full h-full block touch-none cursor-grab active:cursor-grabbing"
    />
  );
};

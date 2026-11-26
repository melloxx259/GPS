import type {CityGraph, SignalGapConfig} from './graph';

export interface SatelliteDef {
  id: string;
  label: string;
  orbitFx: number;
  orbitFy: number;
  radiusFx: number;
  radiusFy: number;
  speed: number;
  phase: number;
  color: string;
  enabled: boolean;
}

export interface SatelliteState {
  id: string;
  label: string;
  wx: number;
  wy: number;
  rangeKm: number;
  locked: boolean;
  blockedByGap: boolean;
  color: string;
  enabled: boolean;
}

export interface GapInstance extends SignalGapConfig {
  wx: number;
  wy: number;
}

export interface GpsFixReading {
  satellites: SatelliteState[];
  lockedCount: number;
  activeGap: GapInstance | null;
  /** Uncertainty radius in meters (5m = crisp 3D fix, 350m+ = signal gap / <3 sats) */
  accuracyMeters: number;
  /** Estimated raw noisy GPS coordinate in world km */
  rawX: number;
  rawY: number;
  /** Map-matched snapped coordinate on the road graph (V, E) */
  snappedX: number;
  snappedY: number;
  snappedNode: number;
  fixQuality: '3D-LOCK' | '2D-DRIFT' | 'SIGNAL-GAP' | 'NO-FIX';
  explanation: string;
}

export const INITIAL_SATELLITES: SatelliteDef[] = [
  {
    id: 'SAT-1',
    label: 'GPS-IIR-1',
    orbitFx: 0.25,
    orbitFy: 0.22,
    radiusFx: 0.16,
    radiusFy: 0.12,
    speed: 0.22,
    phase: 0.2,
    color: '#0284c7',
    enabled: true,
  },
  {
    id: 'SAT-2',
    label: 'GPS-IIF-2',
    orbitFx: 0.78,
    orbitFy: 0.24,
    radiusFx: 0.15,
    radiusFy: 0.14,
    speed: -0.18,
    phase: 1.7,
    color: '#0ea5e9',
    enabled: true,
  },
  {
    id: 'SAT-3',
    label: 'GPS-III-3',
    orbitFx: 0.24,
    orbitFy: 0.78,
    radiusFx: 0.14,
    radiusFy: 0.13,
    speed: 0.16,
    phase: 3.1,
    color: '#0369a1',
    enabled: true,
  },
  {
    id: 'SAT-4',
    label: 'GALILEO-4',
    orbitFx: 0.76,
    orbitFy: 0.76,
    radiusFx: 0.15,
    radiusFy: 0.12,
    speed: -0.2,
    phase: 4.5,
    color: '#38bdf8',
    enabled: true,
  },
];

export function snapPointToRoadGraph(
  G: CityGraph,
  wx: number,
  wy: number,
): {x: number; y: number; node: number; distKm: number} {
  let bestX = wx;
  let bestY = wy;
  let bestDist = Infinity;
  let bestNode = -1;

  for (let e = 0; e < G.E; e++) {
    const u = G.eu[e];
    const v = G.ev[e];
    if (!G.alive[u] || !G.alive[v]) continue;
    const ax = G.nx[u];
    const ay = G.ny[u];
    const bx = G.nx[v];
    const by = G.ny[v];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-12) {
      t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / len2));
    }
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(wx - px, wy - py);
    if (d < bestDist) {
      bestDist = d;
      bestX = px;
      bestY = py;
      bestNode = t < 0.5 ? u : v;
    }
  }

  return {x: bestX, y: bestY, node: bestNode, distKm: bestDist};
}

export function computeGpsFix(
  G: CityGraph,
  receiverX: number,
  receiverY: number,
  satDefs: SatelliteDef[],
  timeSec: number,
  relayBoosted: boolean,
): GpsFixReading {
  const spanX = G.maxX - G.minX;
  const spanY = G.maxY - G.minY;

  const gaps: GapInstance[] = G.cfg.signalGaps.map((g) => ({
    ...g,
    wx: G.minX + g.fx * spanX,
    wy: G.minY + g.fy * spanY,
  }));

  let activeGap: GapInstance | null = null;
  for (const gap of gaps) {
    if (Math.hypot(receiverX - gap.wx, receiverY - gap.wy) <= gap.radiusKm) {
      activeGap = gap;
      break;
    }
  }

  // Determine how many enabled satellites are blocked when inside a signal gap
  const enabledIndices = satDefs
    .map((s, idx) => (s.enabled ? idx : -1))
    .filter((idx) => idx >= 0);

  let maxBlocked = 0;
  if (activeGap && !relayBoosted) {
    maxBlocked = Math.min(
      enabledIndices.length,
      Math.max(1, Math.round(enabledIndices.length * activeGap.attenuation)),
    );
  }

  const satellites: SatelliteState[] = satDefs.map((s, idx) => {
    const angle = timeSec * s.speed + s.phase;
    const wx = G.minX + (s.orbitFx + Math.cos(angle) * s.radiusFx) * spanX;
    const wy = G.minY + (s.orbitFy + Math.sin(angle) * s.radiusFy) * spanY;
    const rangeKm = Math.hypot(wx - receiverX, wy - receiverY);

    let blockedByGap = false;
    if (s.enabled && maxBlocked > 0) {
      const rank = enabledIndices.indexOf(idx);
      if (rank >= 0 && rank < maxBlocked) {
        blockedByGap = true;
      }
    }
    const locked = s.enabled && !blockedByGap;

    return {
      id: s.id,
      label: s.label,
      wx,
      wy,
      rangeKm,
      locked,
      blockedByGap,
      color: s.color,
      enabled: s.enabled,
    };
  });

  const lockedCount = satellites.filter((s) => s.locked).length;

  let accuracyMeters = 4;
  let fixQuality: GpsFixReading['fixQuality'] = '3D-LOCK';
  if (lockedCount >= 4) {
    accuracyMeters = 4;
    fixQuality = '3D-LOCK';
  } else if (lockedCount === 3) {
    accuracyMeters = 11;
    fixQuality = '3D-LOCK';
  } else if (lockedCount === 2) {
    accuracyMeters = 145;
    fixQuality = activeGap && !relayBoosted ? 'SIGNAL-GAP' : '2D-DRIFT';
  } else if (lockedCount === 1) {
    accuracyMeters = 380;
    fixQuality = activeGap && !relayBoosted ? 'SIGNAL-GAP' : '2D-DRIFT';
  } else {
    accuracyMeters = 620;
    fixQuality = activeGap && !relayBoosted ? 'SIGNAL-GAP' : 'NO-FIX';
  }

  // Deterministic bounded drift scaled by accuracyMeters
  const driftKm = (accuracyMeters / 1000) * 0.65;
  const rawX = receiverX + Math.sin(timeSec * 1.9) * driftKm;
  const rawY = receiverY + Math.cos(timeSec * 1.4) * driftKm;

  const snapped = snapPointToRoadGraph(G, rawX, rawY);

  let explanation = '';
  if (activeGap && !relayBoosted && lockedCount < 3) {
    explanation = `Signal Gap (${activeGap.name}): ${activeGap.cause} blocks ${
      enabledIndices.length - lockedCount
    } satellite beams! Error expands to ±${accuracyMeters}m—Graph Map-Matching snaps the car back onto the nearest road edge.`;
  } else if (activeGap && relayBoosted) {
    explanation = `Relay Beacon active inside ${activeGap.name}! All ${lockedCount} satellite ranges intersect cleanly at ±${accuracyMeters}m.`;
  } else if (lockedCount >= 3) {
    explanation = `${lockedCount} satellites locked: ${lockedCount} distance circles intersect at a unique point (±${accuracyMeters}m accuracy).`;
  } else if (lockedCount === 2) {
    explanation = `Only 2 satellites locked: two circles intersect at 2 ambiguous points (±${accuracyMeters}m drift). Turn on a 3rd satellite to resolve the ambiguity!`;
  } else if (lockedCount === 1) {
    explanation = `Only 1 satellite locked: a single circle leaves infinite possible positions (±${accuracyMeters}m). Enable at least 3 satellites for trilateration.`;
  } else {
    explanation = `0 satellites locked: total GPS blackout! Only dead reckoning + road-graph snapping can estimate your street.`;
  }

  return {
    satellites,
    lockedCount,
    activeGap,
    accuracyMeters,
    rawX,
    rawY,
    snappedX: snapped.x,
    snappedY: snapped.y,
    snappedNode: snapped.node,
    fixQuality,
    explanation,
  };
}

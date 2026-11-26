import type {CityGraph} from './graph';

export type TrafficLevel = 'free' | 'moderate' | 'heavy';

export interface SegmentTrafficStyle {
  level: TrafficLevel;
  tau: number;
  color: string;
  glowColor: string;
  pulseColor: string;
  flowSpeedPxPerSec: number;
}

export interface RouteTrafficStats {
  freePct: number;
  moderatePct: number;
  heavyPct: number;
  avgTau: number;
}

/**
 * Computes real-time traffic intensity for edge `e` as the runner moves,
 * combining baseline road congestion (`G.etau[e]`) with a smoothly shifting
 * time-wave driven by `simTime` and `runnerProgress`.
 */
export function getDynamicEdgeTau(
  G: CityGraph,
  edgeIdx: number,
  simTime: number,
  runnerProgress: number,
  trafficEnabled: boolean,
): number {
  if (!trafficEnabled) return 1.0;
  const baseTau = G.etau[edgeIdx] || 1.0;
  const u = G.eu[edgeIdx];
  const v = G.ev[edgeIdx];
  const mx = (G.nx[u] + G.nx[v]) * 0.5;
  const my = (G.ny[u] + G.ny[v]) * 0.5;

  // Smooth traveling traffic wave across corridors as the runner progresses
  const wave =
    Math.sin(mx * 0.72 + my * 0.54 - simTime * 1.15 - runnerProgress * 0.012) * 0.16 +
    Math.cos(mx * 0.38 - my * 0.85 + simTime * 0.75) * 0.12;

  // Arterials & highways fluctuate more visibly when traffic is active
  const classBoost = G.espeed[edgeIdx] >= 55 ? 0.12 : 0.04;
  return Math.max(1.0, baseTau + wave + (baseTau > 1.1 ? classBoost : 0));
}

export function classifyTrafficLevel(tau: number): TrafficLevel {
  if (tau >= 1.75) return 'heavy';
  if (tau >= 1.24) return 'moderate';
  return 'free';
}

export function getSegmentTrafficStyle(
  tau: number,
  isDark = false,
): SegmentTrafficStyle {
  const level = classifyTrafficLevel(tau);
  if (level === 'heavy') {
    return {
      level,
      tau,
      color: isDark ? '#f87171' : '#ea4335',
      glowColor: 'rgba(234, 67, 53, 0.34)',
      pulseColor: '#fecaca',
      flowSpeedPxPerSec: 12,
    };
  }
  if (level === 'moderate') {
    return {
      level,
      tau,
      color: isDark ? '#fbbf24' : '#f59e0b',
      glowColor: 'rgba(245, 158, 11, 0.30)',
      pulseColor: '#fef3c7',
      flowSpeedPxPerSec: 32,
    };
  }
  return {
    level,
    tau,
    color: isDark ? '#4ade80' : '#22c55e',
    glowColor: 'rgba(34, 197, 94, 0.28)',
    pulseColor: '#dcfce7',
    flowSpeedPxPerSec: 64,
  };
}

export function summarizeRouteTraffic(
  G: CityGraph,
  edgeIndices: number[],
  simTime: number,
  runnerProgress: number,
  trafficEnabled: boolean,
): RouteTrafficStats {
  if (!edgeIndices.length) {
    return {freePct: 100, moderatePct: 0, heavyPct: 0, avgTau: 1};
  }
  let freeKm = 0;
  let modKm = 0;
  let heavyKm = 0;
  let totalKm = 0;
  let weightedTau = 0;

  for (const e of edgeIndices) {
    const km = Math.max(0.01, G.elen[e] || 0.05);
    const tau = getDynamicEdgeTau(G, e, simTime, runnerProgress, trafficEnabled);
    const lvl = classifyTrafficLevel(tau);
    totalKm += km;
    weightedTau += tau * km;
    if (lvl === 'heavy') heavyKm += km;
    else if (lvl === 'moderate') modKm += km;
    else freeKm += km;
  }

  const freePct = Math.round((freeKm / totalKm) * 100);
  const moderatePct = Math.round((modKm / totalKm) * 100);
  const heavyPct = Math.max(0, 100 - freePct - moderatePct);
  return {
    freePct,
    moderatePct,
    heavyPct,
    avgTau: weightedTau / totalKm,
  };
}

/**
 * Reconstructs the runner's active path edges from `s` to `cur` (while searching)
 * or from `s` to `t` (once finished), so traffic intensity can animate in real time
 * along whichever route corridor the runner is currently exploring or taking.
 */
export function getRunnerActiveEdgeIds(
  G: CityGraph,
  parent: Int32Array,
  startNode: number,
  endNode: number,
  edgeLookup: (a: number, b: number) => number,
  maxHops = 512,
): number[] {
  if (endNode < 0 || endNode >= G.N || startNode < 0) return [];
  const edgeIds: number[] = [];
  let cur = endNode;
  let hops = 0;
  while (cur !== -1 && cur !== startNode && hops < maxHops) {
    const p = parent[cur];
    if (p === -1) break;
    const e = edgeLookup(p, cur);
    if (e >= 0) edgeIds.push(e);
    cur = p;
    hops++;
  }
  edgeIds.reverse();
  return edgeIds;
}

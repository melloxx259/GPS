export interface EulerNode {
  id: number;
  label: string;
  /** Normalized 0..1 coordinates within the district frame */
  fx: number;
  fy: number;
}

export interface EulerEdge {
  id: number;
  u: number;
  v: number;
  label: string;
  isBridge?: boolean;
  /** Optional bonus bridge that starts hidden/inactive and can be built to fix an impossible graph */
  isBonus?: boolean;
}

export interface EulerLevel {
  id: string;
  title: string;
  cityHint: string;
  goalSummary: string;
  nodes: EulerNode[];
  edges: EulerEdge[];
  riverAxis?: 'v' | 'h';
  riverAt?: number;
  riverLabel?: string;
}

export type EulerClassification = 'EULERIAN_CIRCUIT' | 'EULERIAN_PATH' | 'IMPOSSIBLE';

export interface EulerAnalysis {
  degrees: number[];
  oddVertices: number[];
  oddCount: number;
  classification: EulerClassification;
  activeEdgeCount: number;
  theoremText: string;
}

export interface EulerWalkState {
  levelId: string;
  bonusBridgeEnabled: boolean;
  /** Sequence of visited node IDs */
  nodeHistory: number[];
  /** Sequence of traversed edge IDs matching transitions between nodeHistory */
  edgeHistory: number[];
  completed: boolean;
}

export const EULER_LEVELS: EulerLevel[] = [
  {
    id: 'konigsberg',
    title: '01. Seven Bridges of Königsberg (1736)',
    cityHint: 'Classic Graph Theory Origin',
    goalSummary:
      'Euler proved you cannot cross all 7 bridges once because all 4 landmasses have odd degree. Build the 8th Rescue Bridge to turn 2 landmasses even—unlocking an Eulerian Path!',
    riverAxis: 'h',
    riverAt: 0.5,
    riverLabel: 'Pregel River',
    nodes: [
      {id: 0, label: 'North Bank', fx: 0.5, fy: 0.16},
      {id: 1, label: 'Kneiphof Island', fx: 0.34, fy: 0.5},
      {id: 2, label: 'East Island', fx: 0.72, fy: 0.5},
      {id: 3, label: 'South Bank', fx: 0.5, fy: 0.84},
    ],
    edges: [
      {id: 0, u: 0, v: 1, label: 'Krämer Bridge', isBridge: true},
      {id: 1, u: 0, v: 1, label: 'Schmiede Bridge', isBridge: true},
      {id: 2, u: 1, v: 3, label: 'Grüne Bridge', isBridge: true},
      {id: 3, u: 1, v: 3, label: 'Köttel Bridge', isBridge: true},
      {id: 4, u: 1, v: 2, label: 'Honig Bridge', isBridge: true},
      {id: 5, u: 0, v: 2, label: 'Holz Bridge', isBridge: true},
      {id: 6, u: 2, v: 3, label: 'Hohe Bridge', isBridge: true},
      {id: 7, u: 0, v: 3, label: '8th Rescue Bridge', isBridge: true, isBonus: true},
    ],
  },
  {
    id: 'cairo-nile',
    title: '02. Cairo Nile Street Mapper',
    cityHint: 'Cairo · Eulerian Path (2 Odd Nodes)',
    goalSummary:
      'Drive the GPS mapping car across every Nile bridge and riverside boulevard exactly once. Start at one of the 2 odd-degree junctions!',
    riverAxis: 'v',
    riverAt: 0.5,
    riverLabel: 'Nile',
    nodes: [
      {id: 0, label: 'Zamalek North', fx: 0.22, fy: 0.24},
      {id: 1, label: 'Giza West', fx: 0.22, fy: 0.76},
      {id: 2, label: 'Gezira Island', fx: 0.5, fy: 0.5},
      {id: 3, label: 'Tahrir East', fx: 0.78, fy: 0.24},
      {id: 4, label: 'Citadel South', fx: 0.78, fy: 0.76},
    ],
    edges: [
      {id: 0, u: 0, v: 1, label: 'Giza Ave'},
      {id: 1, u: 0, v: 2, label: '6th October Bridge', isBridge: true},
      {id: 2, u: 1, v: 2, label: 'Qasr El Nil Bridge', isBridge: true},
      {id: 3, u: 2, v: 3, label: '15 May Bridge', isBridge: true},
      {id: 4, u: 2, v: 4, label: 'El Galaa Bridge', isBridge: true},
      {id: 5, u: 3, v: 4, label: 'Corniche Road'},
      {id: 6, u: 0, v: 3, label: 'North Ring'},
    ],
  },
  {
    id: 'paris-seine',
    title: '03. Paris Seine Grand Circuit',
    cityHint: 'Paris · Eulerian Circuit (0 Odd Nodes)',
    goalSummary:
      'Every junction in this district has an even degree! Start anywhere, map all 8 streets & bridges once, and return to your starting junction.',
    riverAxis: 'h',
    riverAt: 0.5,
    riverLabel: 'Seine',
    nodes: [
      {id: 0, label: 'Louvre', fx: 0.25, fy: 0.24},
      {id: 1, label: 'Châtelet', fx: 0.75, fy: 0.24},
      {id: 2, label: 'Île de la Cité', fx: 0.5, fy: 0.5},
      {id: 3, label: 'Saint-Germain', fx: 0.25, fy: 0.76},
      {id: 4, label: 'Latin Quarter', fx: 0.75, fy: 0.76},
    ],
    edges: [
      {id: 0, u: 0, v: 1, label: 'Rue de Rivoli'},
      {id: 1, u: 0, v: 2, label: 'Pont Neuf', isBridge: true},
      {id: 2, u: 1, v: 2, label: 'Pont au Change', isBridge: true},
      {id: 3, u: 2, v: 3, label: 'Pont Saint-Michel', isBridge: true},
      {id: 4, u: 2, v: 4, label: 'Petit Pont', isBridge: true},
      {id: 5, u: 3, v: 4, label: 'Boulevard Saint-Germain'},
      {id: 6, u: 0, v: 3, label: 'Pont des Arts', isBridge: true},
      {id: 7, u: 1, v: 4, label: 'Pont Sully', isBridge: true},
    ],
  },
  {
    id: 'sydney-harbour',
    title: '04. Sydney Harbour Bridge & Tunnel',
    cityHint: 'Sydney · Fix the Odd Nodes',
    goalSummary:
      'Two extra harbour hubs make 4 junctions odd-degree. Toggle the Manly Ferry Line to pair them up, then trace the complete tour!',
    riverAxis: 'h',
    riverAt: 0.46,
    riverLabel: 'Sydney Harbour',
    nodes: [
      {id: 0, label: 'North Sydney', fx: 0.26, fy: 0.22},
      {id: 1, label: 'Manly Cove', fx: 0.76, fy: 0.22},
      {id: 2, label: 'Opera House', fx: 0.5, fy: 0.58},
      {id: 3, label: 'Darling Harbour', fx: 0.22, fy: 0.78},
      {id: 4, label: 'Bondi Junction', fx: 0.8, fy: 0.78},
    ],
    edges: [
      {id: 0, u: 0, v: 1, label: 'Military Rd'},
      {id: 1, u: 0, v: 2, label: 'Harbour Bridge', isBridge: true},
      {id: 2, u: 1, v: 2, label: 'Harbour Tunnel', isBridge: true},
      {id: 3, u: 0, v: 3, label: 'Western Viaduct', isBridge: true},
      {id: 4, u: 2, v: 3, label: 'George St'},
      {id: 5, u: 2, v: 4, label: 'Oxford St'},
      {id: 6, u: 3, v: 4, label: 'Cross City Link'},
      {id: 7, u: 1, v: 4, label: 'Manly Ferry Link', isBridge: true, isBonus: true},
    ],
  },
];

export function getActiveEdges(level: EulerLevel, bonusBridgeEnabled: boolean): EulerEdge[] {
  return level.edges.filter((e) => !e.isBonus || bonusBridgeEnabled);
}

export function analyzeEulerGraph(
  level: EulerLevel,
  bonusBridgeEnabled: boolean,
): EulerAnalysis {
  const degrees = new Array(level.nodes.length).fill(0);
  const activeEdges = getActiveEdges(level, bonusBridgeEnabled);
  for (const e of activeEdges) {
    degrees[e.u]++;
    degrees[e.v]++;
  }

  const oddVertices: number[] = [];
  for (let i = 0; i < degrees.length; i++) {
    if (degrees[i] % 2 === 1) oddVertices.push(i);
  }
  const oddCount = oddVertices.length;

  let classification: EulerClassification = 'IMPOSSIBLE';
  let theoremText = '';
  if (oddCount === 0) {
    classification = 'EULERIAN_CIRCUIT';
    theoremText =
      '0 odd-degree junctions: Eulerian Circuit exists! You can start at any junction and end back where you began.';
  } else if (oddCount === 2) {
    classification = 'EULERIAN_PATH';
    const a = level.nodes[oddVertices[0]].label;
    const b = level.nodes[oddVertices[1]].label;
    theoremText = `2 odd-degree junctions (${a} & ${b}): Eulerian Path exists! Start at one odd junction and finish at the other.`;
  } else {
    classification = 'IMPOSSIBLE';
    theoremText = `${oddCount} odd-degree junctions: Euler's Theorem proves NO path can traverse every edge once! Add the extra bridge to pair odd junctions.`;
  }

  return {
    degrees,
    oddVertices,
    oddCount,
    classification,
    activeEdgeCount: activeEdges.length,
    theoremText,
  };
}

export function createEulerWalk(level: EulerLevel): EulerWalkState {
  return {
    levelId: level.id,
    bonusBridgeEnabled: false,
    nodeHistory: [],
    edgeHistory: [],
    completed: false,
  };
}

export function getValidNextEdges(
  level: EulerLevel,
  state: EulerWalkState,
): EulerEdge[] {
  if (state.nodeHistory.length === 0) return [];
  const cur = state.nodeHistory[state.nodeHistory.length - 1];
  const used = new Set(state.edgeHistory);
  return getActiveEdges(level, state.bonusBridgeEnabled).filter(
    (e) => !used.has(e.id) && (e.u === cur || e.v === cur),
  );
}

export function stepEulerWalkByNode(
  level: EulerLevel,
  state: EulerWalkState,
  targetNodeId: number,
  preferredEdgeId?: number,
): {next: EulerWalkState; moved: boolean; reason?: string} {
  const activeEdges = getActiveEdges(level, state.bonusBridgeEnabled);
  const analysis = analyzeEulerGraph(level, state.bonusBridgeEnabled);

  if (state.nodeHistory.length === 0) {
    // Allow starting anywhere, but warn gently if oddCount===2 and picked even node
    return {
      next: {
        ...state,
        nodeHistory: [targetNodeId],
        edgeHistory: [],
        completed: false,
      },
      moved: true,
      reason:
        analysis.classification === 'EULERIAN_PATH' &&
        !analysis.oddVertices.includes(targetNodeId)
          ? 'Tip: With 2 odd-degree junctions, Euler’s Theorem requires starting at an odd-degree junction!'
          : undefined,
    };
  }

  const cur = state.nodeHistory[state.nodeHistory.length - 1];
  const used = new Set(state.edgeHistory);
  const candidates = activeEdges.filter(
    (e) =>
      !used.has(e.id) &&
      ((e.u === cur && e.v === targetNodeId) || (e.v === cur && e.u === targetNodeId)),
  );

  if (candidates.length === 0) {
    return {
      next: state,
      moved: false,
      reason: 'No untraversed road connects directly from your current junction to that one.',
    };
  }

  const chosen =
    preferredEdgeId !== undefined
      ? candidates.find((c) => c.id === preferredEdgeId) || candidates[0]
      : candidates[0];

  const newNodes = [...state.nodeHistory, targetNodeId];
  const newEdges = [...state.edgeHistory, chosen.id];
  const allCovered = newEdges.length === activeEdges.length;
  const isCircuitRequired = analysis.classification === 'EULERIAN_CIRCUIT';
  const closedLoop = newNodes[0] === targetNodeId;
  const completed = allCovered && (!isCircuitRequired || closedLoop);

  return {
    next: {
      ...state,
      nodeHistory: newNodes,
      edgeHistory: newEdges,
      completed,
    },
    moved: true,
    reason:
      allCovered && isCircuitRequired && !closedLoop
        ? 'All roads traced, wait—for an Eulerian Circuit, finish back at the starting junction!'
        : undefined,
  };
}

export function undoEulerWalk(state: EulerWalkState): EulerWalkState {
  if (state.nodeHistory.length <= 1) {
    return {
      ...state,
      nodeHistory: [],
      edgeHistory: [],
      completed: false,
    };
  }
  return {
    ...state,
    nodeHistory: state.nodeHistory.slice(0, -1),
    edgeHistory: state.edgeHistory.slice(0, -1),
    completed: false,
  };
}

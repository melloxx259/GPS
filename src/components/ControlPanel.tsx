import React, {useState} from 'react';
import {
  ArrowUpDown,
  Navigation,
  MapPin,
  ArrowUp,
  Satellite,
  Radio,
  Undo2,
  RotateCcw,
  PlusCircle,
} from 'lucide-react';
import {
  type CityGraph,
  type CityKey,
  type Runner,
  CITIES,
  PLACES,
  stepsFor,
  fmtDist,
  getCityGapsWorld,
} from '../engine/graph';
import type {SatelliteDef, GpsFixReading} from '../engine/satellites';
import {
  EULER_LEVELS,
  type EulerLevel,
  type EulerWalkState,
  analyzeEulerGraph,
  getActiveEdges,
} from '../engine/euler';
import type {GameMode} from '../App';
import type {GmapsSearchAlgo, GmapsSearchStats} from './GoogleMapsView';

interface PlaceOption {
  name: string;
  node: number;
}

interface ControlPanelProps {
  mode: GameMode;
  cityKey: CityKey;
  graph: CityGraph;
  placeOptions: PlaceOption[];
  fromNode: number;
  toNode: number;
  fromText: string;
  toText: string;
  activeInput: 'from' | 'to';
  selAlgo: 'dij' | 'ast';
  splitCompare: boolean;
  running: boolean;
  paused: boolean;
  rD: Runner | null;
  rA: Runner | null;
  showSatellites: boolean;
  satDefs: SatelliteDef[];
  gpsReading: GpsFixReading | null;
  relayBoosted: boolean;
  eulerLevel: EulerLevel;
  eulerWalk: EulerWalkState;
  eulerFeedback: string;
  gmapsOriginLabel: string;
  gmapsDestLabel: string;
  gmapsActiveInput: 'from' | 'to';
  gmapsRouteSummary: {distanceKm: string; durationMin: string; error?: string} | null;
  gmapsSearchAlgo: GmapsSearchAlgo;
  gmapsPrimaryAlgo: 'ast' | 'dij';
  gmapsSearchPaused: boolean;
  gmapsSearchStats: GmapsSearchStats | null;
  gmapsTraffic: boolean;
  gmapsSpeedVal: number;
  onSetActiveInput: (w: 'from' | 'to') => void;
  onSelectPlace: (w: 'from' | 'to', node: number, name: string) => void;
  onSwapPoints: () => void;
  onSelectAlgo: (a: 'dij' | 'ast') => void;
  onToggleCompare: (val: boolean) => void;
  onStartNav: () => void;
  onReplay: () => void;
  onTogglePause: () => void;
  onStep: () => void;
  onToggleSatOverlay: (val: boolean) => void;
  onToggleSatellite: (id: string) => void;
  onTeleportGps: (target: 'open' | 'gap') => void;
  onToggleRelayBoost: () => void;
  onSelectEulerLevel: (id: string) => void;
  onToggleBonusBridge: () => void;
  onUndoEuler: () => void;
  onResetEuler: () => void;
  onSetGmapsActiveInput: (w: 'from' | 'to') => void;
  onSelectGmapsPlace: (w: 'from' | 'to', lat: number, lng: number, name: string) => void;
  onSwapGmapsPoints: () => void;
  onSelectGmapsPrimaryAlgo: (a: 'ast' | 'dij') => void;
  onToggleGmapsCompare: (val: boolean) => void;
  onStartGmapsNav: () => void;
  onResetGmapsRoute: () => void;
  onFitGmapsAll: () => void;
  onReplayGmapsSearch: () => void;
  onToggleGmapsPause: () => void;
  onStepGmapsSearch: () => void;
  onToggleGmapsTraffic: (val: boolean) => void;
  onChangeGmapsSpeed: (val: number) => void;
  onSelectMode: (m: GameMode) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  mode,
  cityKey,
  graph,
  placeOptions,
  fromText,
  toText,
  selAlgo,
  splitCompare,
  running,
  paused,
  rD,
  rA,
  showSatellites,
  satDefs,
  gpsReading,
  relayBoosted,
  eulerLevel,
  eulerWalk,
  eulerFeedback,
  gmapsOriginLabel,
  gmapsDestLabel,
  gmapsRouteSummary,
  gmapsSearchAlgo,
  gmapsPrimaryAlgo,
  gmapsSearchPaused,
  gmapsSearchStats,
  gmapsTraffic,
  gmapsSpeedVal,
  onSetActiveInput,
  onSelectPlace,
  onSwapPoints,
  onSelectAlgo,
  onToggleCompare,
  onStartNav,
  onReplay,
  onTogglePause,
  onStep,
  onToggleSatOverlay,
  onToggleSatellite,
  onTeleportGps,
  onToggleRelayBoost,
  onSelectEulerLevel,
  onToggleBonusBridge,
  onUndoEuler,
  onResetEuler,
  onSetGmapsActiveInput,
  onSelectGmapsPlace,
  onSwapGmapsPoints,
  onSelectGmapsPrimaryAlgo,
  onToggleGmapsCompare,
  onStartGmapsNav,
  onResetGmapsRoute,
  onFitGmapsAll,
  onReplayGmapsSearch,
  onToggleGmapsPause,
  onStepGmapsSearch,
  onToggleGmapsTraffic,
  onChangeGmapsSpeed,
  onSelectMode,
}) => {
  const [suggFor, setSuggFor] = useState<'from' | 'to' | null>(null);
  const [gmapsSuggFor, setGmapsSuggFor] = useState<'from' | 'to' | null>(null);
  const [fromQuery, setFromQuery] = useState(fromText);
  const [toQuery, setToQuery] = useState(toText);
  const [gmapsFromQuery, setGmapsFromQuery] = useState(gmapsOriginLabel);
  const [gmapsToQuery, setGmapsToQuery] = useState(gmapsDestLabel);

  React.useEffect(() => setFromQuery(fromText), [fromText]);
  React.useEffect(() => setToQuery(toText), [toText]);
  React.useEffect(() => setGmapsFromQuery(gmapsOriginLabel), [gmapsOriginLabel]);
  React.useEffect(() => setGmapsToQuery(gmapsDestLabel), [gmapsDestLabel]);

  const selRunner = selAlgo === 'dij' ? rD : rA;

  const renderExplain = () => {
    if (!selRunner) return '';
    const name = selAlgo === 'ast' ? 'A*' : 'Dijkstra';
    if (selRunner.found) {
      return `${name} reached the destination in ${selRunner.cost.toFixed(
        1,
      )} min. Following parent pointers backward from the destination draws the fastest route.`;
    }
    if (selRunner.cur < 0) {
      return 'Starting at the origin with a travel time of 0 min.';
    }
    const g = selRunner.g[selRunner.cur];
    const n = selRunner.relaxed.length;
    const tail = ` Checked outgoing roads and improved ${n} neighbouring junction${
      n === 1 ? '' : 's'
    }.`;
    if (selAlgo === 'ast') {
      const h = selRunner.h(selRunner.cur);
      return `Step ${selRunner.expanded}. Lowest g + h = ${g.toFixed(1)} + ${h.toFixed(
        1,
      )} = ${(g + h).toFixed(1)} min.${tail}`;
    }
    return `Step ${selRunner.expanded}. Lowest travel time so far g = ${g.toFixed(1)} min.${tail}`;
  };

  const renderSummary = () => {
    if (!rD || !rA || !rD.done || !rA.done) return '';
    if (!rD.found || !rA.found) return 'No route found between these points.';
    const same = Math.abs(rD.cost - rA.cost) < 1e-9;
    const saved = Math.round(100 * (1 - rA.expanded / Math.max(1, rD.expanded)));
    return `Both algorithms found ${
      same ? 'a route of identical cost' : 'a route'
    }. A* searched ${
      saved > 0 ? `${saved}% fewer junctions than Dijkstra.` : 'as many junctions as Dijkstra.'
    }`;
  };

  const eulerAnalysis = analyzeEulerGraph(eulerLevel, eulerWalk.bonusBridgeEnabled);
  const eulerActiveEdges = getActiveEdges(eulerLevel, eulerWalk.bonusBridgeEnabled);
  const hasBonusBridge = eulerLevel.edges.some((e) => e.isBonus);

  return (
    <aside
      className="floating-panel absolute z-10 left-3 top-3 bottom-3 w-[380px] flex flex-col overflow-hidden max-[760px]:left-0 max-[760px]:right-0 max-[760px]:top-auto max-[760px]:bottom-0 max-[760px]:w-auto max-[760px]:max-h-[48%] max-[760px]:rounded-b-none"
      aria-label="Navigation and learning controls"
    >
      <div className="hidden max-[760px]:block w-9 h-1 rounded bg-[var(--line)] mx-auto mt-2" />

      {/* 4-Mode Activity Switcher */}
      <nav
        className="grid grid-cols-4 gap-1 p-1.5 border-b border-[var(--line)] bg-[var(--bg)] shrink-0"
        aria-label="Learning activity modes"
      >
        {(
          [
            ['gmaps', 'Google Maps'],
            ['race', 'Route Race'],
            ['gps', 'GPS & Gaps'],
            ['euler', "Euler's Theorem"],
          ] as const
        ).map(([mKey, mLabel]) => {
          const active = mode === mKey;
          return (
            <button
              key={mKey}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectMode(mKey)}
              className={`px-1.5 py-1.5 rounded-lg text-[11px] font-semibold leading-tight text-center transition-colors ${
                active
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm border border-[var(--line)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {mLabel}
            </button>
          );
        })}
      </nav>

      {mode === 'race' && (
        <>
          <div className="relative px-3 pt-3.5 pb-3 border-b border-[var(--line)]">
            <div className="grid grid-cols-[28px_1fr_40px] grid-rows-[40px_40px] gap-x-1.5 gap-y-2 items-center">
              <svg className="row-span-2 w-7 h-[88px]" viewBox="0 0 28 88" aria-hidden="true">
                <circle cx="14" cy="20" r="6" fill="none" stroke="var(--muted)" strokeWidth="2.4" />
                <circle cx="14" cy="38" r="1.7" fill="var(--muted)" />
                <circle cx="14" cy="44" r="1.7" fill="var(--muted)" />
                <circle cx="14" cy="50" r="1.7" fill="var(--muted)" />
                <path
                  transform="translate(2 56)"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"
                  fill="var(--jam)"
                />
              </svg>

              <input
                type="text"
                aria-label="Starting point"
                placeholder="Choose starting point"
                value={suggFor === 'from' ? fromQuery : fromText}
                onFocus={() => {
                  onSetActiveInput('from');
                  setSuggFor('from');
                }}
                onChange={(e) => setFromQuery(e.target.value)}
                onBlur={() => setTimeout(() => setSuggFor(null), 150)}
                className="w-full h-10 border border-[var(--line)] rounded-lg px-3 bg-[var(--surface)] text-[15px] focus:outline-none focus:border-[var(--accent)]"
              />

              <button
                type="button"
                onClick={onSwapPoints}
                aria-label="Swap start and destination"
                className="col-start-3 row-span-2 w-10 h-10 rounded-full grid place-items-center text-[var(--muted)] hover:bg-[var(--hover)]"
              >
                <ArrowUpDown size={20} />
              </button>

              <input
                type="text"
                aria-label="Destination"
                placeholder="Choose destination"
                value={suggFor === 'to' ? toQuery : toText}
                onFocus={() => {
                  onSetActiveInput('to');
                  setSuggFor('to');
                }}
                onChange={(e) => setToQuery(e.target.value)}
                onBlur={() => setTimeout(() => setSuggFor(null), 150)}
                className="w-full h-10 border border-[var(--line)] rounded-lg px-3 bg-[var(--surface)] text-[15px] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {suggFor && (
              <div
                className="floating-panel absolute z-20 left-11 right-12 py-1.5 max-h-60 overflow-auto border border-[var(--line)]"
                style={{top: suggFor === 'from' ? 58 : 106}}
              >
                {placeOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectPlace(suggFor, p.node, p.name);
                      setSuggFor(null);
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-[var(--hover)]"
                  >
                    <span className="w-7 h-7 rounded-full bg-[var(--hover)] grid place-items-center text-[var(--muted)]">
                      <MapPin size={15} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{p.name}</span>
                      <small className="block text-xs text-[var(--muted)]">
                        {CITIES[cityKey].name}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="py-1.5 border-b border-[var(--line)]" role="radiogroup" aria-label="Algorithm">
            {(['ast', 'dij'] as const).map((alg) => {
              const r = alg === 'ast' ? rA : rD;
              const checked = selAlgo === alg;
              const colorVar = alg === 'ast' ? 'var(--ast)' : 'var(--dij)';
              const pct = r ? Math.min(100, Math.round((100 * r.expanded) / graph.count)) : 0;
              return (
                <button
                  key={alg}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onSelectAlgo(alg)}
                  className={`w-full grid grid-cols-[20px_1fr] gap-x-3 text-left px-3 py-2.5 transition-colors ${
                    checked ? 'bg-[var(--accent-bg)]' : 'hover:bg-[var(--hover)]'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full mt-2 justify-self-center"
                    style={{backgroundColor: colorVar}}
                  />
                  <span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold text-[var(--ok)] tabular-nums">
                        {r && r.found
                          ? `${r.cost < 10 ? r.cost.toFixed(1) : Math.round(r.cost)} min`
                          : '…'}
                      </span>
                      <span className="text-[var(--muted)] tabular-nums text-sm">
                        {r && r.found ? `(${r.km.toFixed(1)} km)` : ''}
                      </span>
                      <span className="ml-auto font-semibold text-xs">
                        {alg === 'ast' ? 'A*' : 'Dijkstra'}
                      </span>
                    </span>
                    <span className="block text-xs text-[var(--muted)] tabular-nums">
                      {r
                        ? `${r.done ? 'Searched' : 'Searching'} ${r.expanded.toLocaleString()} junctions · ${pct}% of network`
                        : 'Searching'}
                    </span>
                    <span className="block h-1 rounded-full bg-[var(--line)] mt-1.5 overflow-hidden">
                      <i
                        className="block h-full rounded-full transition-all duration-150"
                        style={{width: `${pct}%`, backgroundColor: colorVar}}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
            <button
              type="button"
              disabled={!selRunner || !selRunner.found}
              onClick={onStartNav}
              className="pill-btn primary"
            >
              <Navigation size={16} />
              Start Drive
            </button>
            <button type="button" onClick={onReplay} className="pill-btn">
              Replay
            </button>
            <label className="ml-auto inline-flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={splitCompare}
                onChange={(e) => onToggleCompare(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              Compare
            </label>
          </div>

          <div className="flex items-center gap-2 px-3.5 pb-2">
            <button type="button" onClick={onTogglePause} className="pill-btn">
              {paused ? 'Play' : 'Pause'}
            </button>
            <button type="button" disabled={!running} onClick={onStep} className="pill-btn">
              Step
            </button>
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer text-[var(--sat)]">
              <input
                type="checkbox"
                checked={showSatellites}
                onChange={(e) => onToggleSatOverlay(e.target.checked)}
                className="w-4 h-4 accent-[var(--sat)]"
              />
              GPS Satellites
            </label>
          </div>

          <p className="m-0 px-4 pt-1 pb-1 text-xs leading-relaxed text-[var(--fg)]">
            {renderExplain()}
          </p>
          <p className="m-0 px-4 pb-2 text-xs text-[var(--muted)]" aria-live="polite">
            {renderSummary()}
          </p>

          <div className="flex-1 overflow-auto border-t border-[var(--line)]">
            {!selRunner || !selRunner.found ? (
              <div className="p-4 text-sm text-[var(--muted)]">
                {selRunner && selRunner.done
                  ? 'No route found.'
                  : 'Searching for the fastest route…'}
              </div>
            ) : (
              <>
                <h4 className="m-0 px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Directions
                </h4>
                {stepsFor(graph, selRunner).map((s, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[28px_1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-[var(--line)] text-sm"
                  >
                    <span className="text-[var(--muted)]">
                      {s.arrive ? (
                        <MapPin size={18} />
                      ) : (
                        <ArrowUp size={18} style={{transform: `rotate(${s.rot}deg)`}} />
                      )}
                    </span>
                    <span>{s.text}</span>
                    <span className="text-xs text-[var(--muted)] tabular-nums">
                      {s.arrive ? '' : fmtDist(s.km)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {mode === 'gps' && (
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--sat)] text-xs font-semibold uppercase tracking-wide mb-1">
              <Satellite size={16} />
              GPS Trilateration &amp; Signal Gaps
            </div>
            <h2 className="text-lg font-semibold m-0 mb-1">Satellite Coverage Lab</h2>
            <p className="text-xs text-[var(--muted)] m-0">
              Click anywhere on the map to move your GPS car. Toggle satellites on/off or enter a
              tunnel/canyon Signal Gap to watch how error radius and road-graph snapping react.
            </p>
          </div>

          <div className="rounded-xl p-3.5 border border-[var(--line)] bg-[var(--bg)]">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-medium text-[var(--muted)]">Receiver Status</span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{
                  color:
                    gpsReading && gpsReading.lockedCount >= 3 ? 'var(--ok)' : 'var(--gap)',
                }}
              >
                {gpsReading ? gpsReading.fixQuality : 'CALIBRATING'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 tabular-nums">
              <div>
                <div className="text-[11px] text-[var(--muted)]">Satellites Locked</div>
                <div className="text-xl font-semibold">
                  {gpsReading ? `${gpsReading.lockedCount} / 4` : '4 / 4'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--muted)]">Error Radius</div>
                <div className="text-xl font-semibold">
                  ±{gpsReading ? gpsReading.accuracyMeters : 4} m
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-2.5 mb-0 text-[var(--fg)]">
              {gpsReading?.explanation || 'Calculating satellite ranges…'}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
              Orbiting Satellites (Toggle to test 1–4 beams)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {satDefs.map((sat) => {
                const st = gpsReading?.satellites.find((x) => x.id === sat.id);
                const statusTxt = !sat.enabled
                  ? 'OFF'
                  : st?.blockedByGap
                    ? 'BLOCKED'
                    : 'LOCKED';
                return (
                  <button
                    key={sat.id}
                    type="button"
                    onClick={() => onToggleSatellite(sat.id)}
                    aria-pressed={sat.enabled}
                    className={`rounded-lg p-2.5 border text-left transition-colors ${
                      sat.enabled
                        ? 'border-[var(--sat)] bg-[var(--accent-bg)]'
                        : 'border-[var(--line)] bg-[var(--surface)] opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{sat.id}</span>
                      <span
                        style={{
                          color:
                            statusTxt === 'LOCKED'
                              ? 'var(--ok)'
                              : statusTxt === 'BLOCKED'
                                ? 'var(--gap)'
                                : 'var(--muted)',
                        }}
                      >
                        {statusTxt}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mt-0.5 tabular-nums">
                      {st && sat.enabled ? `${st.rangeKm.toFixed(1)} km range` : sat.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] m-0">
              Test Signal Gaps in {CITIES[cityKey].name}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onTeleportGps('open')}
                className="pill-btn"
              >
                Clear Sky Zone
              </button>
              <button
                type="button"
                onClick={() => onTeleportGps('gap')}
                className="pill-btn"
              >
                Enter Signal Gap
              </button>
            </div>
            <button
              type="button"
              onClick={onToggleRelayBoost}
              className={`pill-btn w-full ${relayBoosted ? 'primary' : ''}`}
            >
              <Radio size={16} />
              {relayBoosted
                ? 'Relay Beacon Active (Gap Bridged!)'
                : 'Deploy GPS Relay Beacon (+150 pts)'}
            </button>
            <div className="text-[11px] text-[var(--muted)] leading-relaxed">
              Active gaps in {CITIES[cityKey].name}:{' '}
              {getCityGapsWorld(graph)
                .map((g) => `${g.name} (${g.cause})`)
                .join(' · ')}
            </div>
          </div>
        </div>
      )}

      {mode === 'euler' && (
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--euler)] mb-1">
              Graph Theory · Leonhard Euler (1736)
            </div>
            <h2 className="text-lg font-semibold m-0 mb-1">Euler’s Bridge &amp; Street Mapper</h2>
            <p className="text-xs text-[var(--muted)] m-0">
              Click junctions (or bridge midpoints) to trace every road <strong>once</strong> without
              lifting your pencil!
            </p>
          </div>

          <div>
            <label
              htmlFor="euler-level-select"
              className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1.5"
            >
              Select Challenge District
            </label>
            <div className="grid grid-cols-1 gap-1.5" id="euler-level-select">
              {EULER_LEVELS.map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onSelectEulerLevel(lvl.id)}
                  className={`rounded-lg px-3 py-2 border text-left text-xs transition-colors ${
                    lvl.id === eulerLevel.id
                      ? 'border-[var(--accent)] bg-[var(--accent-bg)] font-semibold'
                      : 'border-[var(--line)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <div>{lvl.title}</div>
                  <div className="text-[11px] text-[var(--muted)] font-normal">{lvl.cityHint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3.5 border border-[var(--line)] bg-[var(--bg)]">
            <div className="grid grid-cols-2 gap-3 mb-2 tabular-nums">
              <div>
                <div className="text-[11px] text-[var(--muted)]">Odd-Degree Nodes</div>
                <div
                  className="text-xl font-semibold"
                  style={{
                    color: eulerAnalysis.oddCount <= 2 ? 'var(--ok)' : 'var(--gap)',
                  }}
                >
                  {eulerAnalysis.oddCount}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--muted)]">Roads Mapped</div>
                <div className="text-xl font-semibold">
                  {eulerWalk.edgeHistory.length} / {eulerActiveEdges.length}
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed m-0 text-[var(--fg)]">
              {eulerFeedback || eulerAnalysis.theoremText}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {hasBonusBridge && (
              <button
                type="button"
                onClick={onToggleBonusBridge}
                className={`pill-btn w-full ${eulerWalk.bonusBridgeEnabled ? 'primary' : ''}`}
              >
                <PlusCircle size={16} />
                {eulerWalk.bonusBridgeEnabled
                  ? 'Remove Extra Bridge'
                  : 'Build Rescue Bridge (Fix Odd Degrees)'}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onUndoEuler}
                disabled={eulerWalk.nodeHistory.length === 0}
                className="pill-btn"
              >
                <Undo2 size={15} />
                Undo
              </button>
              <button type="button" onClick={onResetEuler} className="pill-btn">
                <RotateCcw size={15} />
                Reset Walk
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'gmaps' && (
        <>
          <div className="relative px-3 pt-3 pb-2.5 border-b border-[var(--line)]">
            <div className="grid grid-cols-[28px_1fr_40px] grid-rows-[38px_38px] gap-x-1.5 gap-y-1.5 items-center">
              <svg className="row-span-2 w-7 h-[82px]" viewBox="0 0 28 88" aria-hidden="true">
                <circle cx="14" cy="20" r="6" fill="none" stroke="var(--muted)" strokeWidth="2.4" />
                <circle cx="14" cy="38" r="1.7" fill="var(--muted)" />
                <circle cx="14" cy="44" r="1.7" fill="var(--muted)" />
                <circle cx="14" cy="50" r="1.7" fill="var(--muted)" />
                <path
                  transform="translate(2 56)"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"
                  fill="var(--jam)"
                />
              </svg>

              <input
                type="text"
                aria-label="Google Maps starting point"
                placeholder="Choose starting point"
                value={gmapsSuggFor === 'from' ? gmapsFromQuery : gmapsOriginLabel}
                onFocus={() => {
                  onSetGmapsActiveInput('from');
                  setGmapsSuggFor('from');
                }}
                onChange={(e) => setGmapsFromQuery(e.target.value)}
                onBlur={() => setTimeout(() => setGmapsSuggFor(null), 150)}
                className="w-full h-[38px] border border-[var(--line)] rounded-lg px-3 bg-[var(--surface)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />

              <button
                type="button"
                onClick={onSwapGmapsPoints}
                aria-label="Swap Google Maps start and destination"
                className="col-start-3 row-span-2 w-10 h-10 rounded-full grid place-items-center text-[var(--muted)] hover:bg-[var(--hover)]"
              >
                <ArrowUpDown size={19} />
              </button>

              <input
                type="text"
                aria-label="Google Maps destination"
                placeholder="Click map or choose destination"
                value={gmapsSuggFor === 'to' ? gmapsToQuery : gmapsDestLabel}
                onFocus={() => {
                  onSetGmapsActiveInput('to');
                  setGmapsSuggFor('to');
                }}
                onChange={(e) => setGmapsToQuery(e.target.value)}
                onBlur={() => setTimeout(() => setGmapsSuggFor(null), 150)}
                className="w-full h-[38px] border border-[var(--line)] rounded-lg px-3 bg-[var(--surface)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {gmapsSuggFor && (
              <div
                className="floating-panel absolute z-20 left-11 right-12 py-1.5 max-h-60 overflow-auto border border-[var(--line)]"
                style={{top: gmapsSuggFor === 'from' ? 54 : 100}}
              >
                {PLACES[cityKey].map((p) => (
                  <button
                    key={p.n}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectGmapsPlace(gmapsSuggFor, p.lat, p.lng, p.n);
                      setGmapsSuggFor(null);
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-[var(--hover)]"
                  >
                    <span className="w-7 h-7 rounded-full bg-[var(--hover)] grid place-items-center text-[var(--muted)]">
                      <MapPin size={15} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{p.n}</span>
                      <small className="block text-xs text-[var(--muted)]">
                        {CITIES[cityKey].name} · Real Map Pin
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="py-1 border-b border-[var(--line)]"
            role="radiogroup"
            aria-label="Google Maps Search Algorithm"
          >
            {(['ast', 'dij'] as const).map((alg) => {
              const checked = gmapsSearchAlgo === alg || (gmapsSearchAlgo === 'both' && gmapsPrimaryAlgo === alg);
              const colorVar = alg === 'ast' ? 'var(--ast)' : 'var(--dij)';
              const total = Math.max(1, gmapsSearchStats?.totalNodes || graph.count);
              const expanded =
                alg === 'ast'
                  ? (gmapsSearchStats?.astExpanded ?? 0)
                  : (gmapsSearchStats?.dijExpanded ?? 0);
              const done =
                alg === 'ast'
                  ? Boolean(gmapsSearchStats?.astDone)
                  : Boolean(gmapsSearchStats?.dijDone);
              const cost =
                alg === 'ast'
                  ? (gmapsSearchStats?.astCost ?? 0)
                  : (gmapsSearchStats?.dijCost ?? 0);
              const km =
                alg === 'ast' ? (gmapsSearchStats?.astKm ?? 0) : (gmapsSearchStats?.dijKm ?? 0);
              const pct = Math.min(100, Math.round((100 * expanded) / total));

              return (
                <button
                  key={alg}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onSelectGmapsPrimaryAlgo(alg)}
                  className={`w-full grid grid-cols-[20px_1fr] gap-x-3 text-left px-3 py-2 transition-colors ${
                    checked ? 'bg-[var(--accent-bg)]' : 'hover:bg-[var(--hover)]'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full mt-2 justify-self-center"
                    style={{backgroundColor: colorVar}}
                  />
                  <span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-[var(--ok)] tabular-nums">
                        {cost > 0 ? `${cost < 10 ? cost.toFixed(1) : Math.round(cost)} min` : '…'}
                      </span>
                      <span className="text-[var(--muted)] tabular-nums text-xs">
                        {km > 0 ? `(${km.toFixed(1)} km)` : ''}
                      </span>
                      <span className="ml-auto font-semibold text-xs">
                        {alg === 'ast' ? 'A*' : 'Dijkstra'}
                      </span>
                    </span>
                    <span className="block text-[11px] text-[var(--muted)] tabular-nums">
                      {`${done ? 'Searched' : 'Searching'} ${expanded.toLocaleString()} junctions · ${pct}% of network`}
                    </span>
                    <span className="block h-1 rounded-full bg-[var(--line)] mt-1 overflow-hidden">
                      <i
                        className="block h-full rounded-full transition-all duration-150"
                        style={{width: `${pct}%`, backgroundColor: colorVar}}
                      />
                    </span>
                  </span>
                </button>
              );
            })}

            {gmapsRouteSummary && (
              <div className="px-3.5 py-1.5 border-t border-[var(--line)] flex items-center justify-between text-[11px] tabular-nums bg-[var(--bg)]">
                <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                  <span className="w-2.5 h-1 rounded-full inline-block bg-[#0f9d58]" />
                  Google Real Drive:
                </span>
                <span className="font-semibold text-[var(--fg)]">
                  {gmapsRouteSummary.distanceKm} · {gmapsRouteSummary.durationMin}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
            <button
              type="button"
              disabled={!gmapsSearchStats?.activeRunner?.found}
              onClick={onStartGmapsNav}
              className="pill-btn primary"
            >
              <Navigation size={15} />
              Start Drive
            </button>
            <button type="button" onClick={onReplayGmapsSearch} className="pill-btn">
              Replay
            </button>
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={gmapsSearchAlgo === 'both'}
                onChange={(e) => onToggleGmapsCompare(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              Compare
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <button type="button" onClick={onToggleGmapsPause} className="pill-btn">
              {gmapsSearchPaused ? 'Play' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={onStepGmapsSearch}
              disabled={Boolean(gmapsSearchStats?.dijDone && gmapsSearchStats?.astDone)}
              className="pill-btn"
            >
              Step
            </button>
            <button type="button" onClick={onFitGmapsAll} className="pill-btn">
              Fit All
            </button>
            <button type="button" onClick={onResetGmapsRoute} className="pill-btn ml-auto">
              Reset
            </button>
          </div>

          <div className="px-3.5 pb-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[var(--line)]">
            <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer text-[var(--sat)]">
              <input
                type="checkbox"
                checked={showSatellites}
                onChange={(e) => onToggleSatOverlay(e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--sat)]"
              />
              Satellites
            </label>
            <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={gmapsTraffic}
                onChange={(e) => onToggleGmapsTraffic(e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--accent)]"
              />
              Traffic
            </label>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-[var(--muted)]">Speed</span>
              <input
                type="range"
                min={0}
                max={8}
                value={gmapsSpeedVal}
                onChange={(e) => onChangeGmapsSpeed(Number(e.target.value))}
                className="w-16 accent-[var(--accent)]"
              />
            </label>
          </div>

          <p className="m-0 px-3.5 pt-2 pb-1 text-xs leading-relaxed text-[var(--fg)]">
            {gmapsSearchStats?.explainText ||
              'Click anywhere on Google Maps to drop a pin and watch the search lines explore.'}
          </p>
          {gmapsSearchStats?.dijDone && gmapsSearchStats?.astDone && (
            <p className="m-0 px-3.5 pb-1.5 text-xs text-[var(--ok)] font-medium" aria-live="polite">
              {gmapsSearchStats.savedPct > 0
                ? `A* searched ${gmapsSearchStats.savedPct}% fewer junctions than Dijkstra.`
                : 'Both algorithms found the optimal route.'}
            </p>
          )}
          {gmapsRouteSummary?.error && (
            <p className="m-0 px-3.5 pb-1.5 text-xs text-[var(--jam)]">{gmapsRouteSummary.error}</p>
          )}

          <div className="flex-1 overflow-auto border-t border-[var(--line)]">
            {!gmapsSearchStats?.activeRunner?.found ? (
              <div className="p-3.5 text-xs text-[var(--muted)]">
                Searching {CITIES[cityKey].name} road network…
              </div>
            ) : (
              <>
                <h4 className="m-0 px-3.5 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Directions
                </h4>
                {stepsFor(graph, gmapsSearchStats.activeRunner).map((s, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[24px_1fr_auto] gap-2.5 items-center px-3.5 py-2 border-b border-[var(--line)] text-xs"
                  >
                    <span className="text-[var(--muted)]">
                      {s.arrive ? (
                        <MapPin size={16} />
                      ) : (
                        <ArrowUp size={16} style={{transform: `rotate(${s.rot}deg)`}} />
                      )}
                    </span>
                    <span>{s.text}</span>
                    <span className="text-[11px] text-[var(--muted)] tabular-nums">
                      {s.arrive ? '' : fmtDist(s.km)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
};

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Layers, LocateFixed, Plus, Minus, ArrowUp, MapPin} from 'lucide-react';
import {
  CITIES,
  PLACES,
  Runner,
  buildCity,
  clampZoom,
  fmtDist,
  getCityGapsWorld,
  nodeNearIn,
  setTraffic,
  stepsFor,
  type CityGraph,
  type CityKey,
} from './engine/graph';
import {
  INITIAL_SATELLITES,
  type GpsFixReading,
  type SatelliteDef,
} from './engine/satellites';
import {
  EULER_LEVELS,
  analyzeEulerGraph,
  createEulerWalk,
  stepEulerWalkByNode,
  undoEulerWalk,
  type EulerWalkState,
} from './engine/euler';
import {sfx} from './engine/audio';
import {RouteRaceCanvas, type NavState} from './components/RouteRaceCanvas';
import {ControlPanel} from './components/ControlPanel';
import {TitleScreen} from './components/TitleScreen';
import {GameModals, TopGameHud} from './components/GameModals';
import {
  GoogleMapsView,
  type GmapsSearchAlgo,
  type GmapsSearchStats,
} from './components/GoogleMapsView';
import {MathPaper} from './components/MathPaper';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';
export type GameMode = 'race' | 'gps' | 'euler' | 'gmaps';

const CITY_KEYS: CityKey[] = ['cairo', 'tokyo', 'newyork', 'paris', 'sydney'];

export default function App() {
  const initialAutoStart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [gameState, setGameState] = useState<GameState>(
    initialAutoStart ? 'playing' : 'title',
  );
  const [mode, setMode] = useState<GameMode>(() =>
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'gmaps' : 'race',
  );
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Score & progression
  const [score, setScore] = useState(0);
  const [missionsCompleted, setMissionsCompleted] = useState(0);
  const [victoryInfo, setVictoryInfo] = useState({
    headline: 'Mission Complete!',
    detail: 'You mastered this navigation challenge.',
  });
  const [muted, setMuted] = useState(false);

  // City & Route Race state
  const graphCacheRef = useRef<Partial<Record<CityKey, CityGraph>>>({});
  const getCity = useCallback((k: CityKey) => {
    if (!graphCacheRef.current[k]) {
      graphCacheRef.current[k] = buildCity(k);
    }
    return graphCacheRef.current[k]!;
  }, []);

  const [cityKey, setCityKey] = useState<CityKey>('cairo');
  const [traffic, setTrafficState] = useState(false);
  const [trafficSeed, setTrafficSeed] = useState(1);
  const [speedVal, setSpeedVal] = useState(4);
  const [layersOpen, setLayersOpen] = useState(false);

  const graph = useMemo(() => {
    const g = getCity(cityKey);
    setTraffic(g, traffic, trafficSeed);
    return g;
  }, [cityKey, traffic, trafficSeed, getCity]);

  const placeOptions = useMemo(() => {
    return PLACES[cityKey].map((p) => ({
      name: p.n,
      node: nodeNearIn(graph, p.fx, p.fy),
    }));
  }, [cityKey, graph]);

  const [fromNode, setFromNode] = useState(() =>
    nodeNearIn(getCity('cairo'), PLACES.cairo[0].fx, PLACES.cairo[0].fy),
  );
  const [toNode, setToNode] = useState(() =>
    nodeNearIn(getCity('cairo'), PLACES.cairo[1].fx, PLACES.cairo[1].fy),
  );
  const [fromText, setFromText] = useState(PLACES.cairo[0].n);
  const [toText, setToText] = useState(PLACES.cairo[1].n);
  const [activeInput, setActiveInput] = useState<'from' | 'to'>('to');
  const [selAlgo, setSelAlgo] = useState<'dij' | 'ast'>('ast');
  const [splitCompare, setSplitCompare] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stepTick, setStepTick] = useState(0);
  const [fitTick, setFitTick] = useState(0);
  const [zoomDeltaTick, setZoomDeltaTick] = useState({dir: 0, seq: 0});
  const [, setUiTick] = useState(0);

  const rDRef = useRef<Runner | null>(null);
  const rARef = useRef<Runner | null>(null);
  const runningRef = useRef(false);

  // Navigation animation state
  const navRef = useRef<NavState>({
    on: false,
    r: null,
    t: 0,
    seg: 0,
    total: 0,
    dur: 16,
    arrived: false,
    x: 0,
    y: 0,
    head: 0,
    d: 0,
  });
  const [navUi, setNavUi] = useState<{
    on: boolean;
    arrived: boolean;
    dist: string;
    text: string;
    rot: number;
    eta: string;
    sub: string;
  }>({
    on: false,
    arrived: false,
    dist: '',
    text: '',
    rot: 0,
    eta: '',
    sub: '',
  });

  // GPS Satellites & Signal Gaps state
  const [showSatellites, setShowSatellites] = useState(false);
  const [satDefs, setSatDefs] = useState<SatelliteDef[]>(INITIAL_SATELLITES);
  const [gpsReceiver, setGpsReceiver] = useState<{x: number; y: number}>(() => {
    const g = getCity('cairo');
    const n = nodeNearIn(g, 0.25, 0.45);
    return {x: g.nx[n], y: g.ny[n]};
  });
  const [relayBoosted, setRelayBoosted] = useState(false);
  const [gpsReading, setGpsReading] = useState<GpsFixReading | null>(null);

  // Euler's Theorem state
  const [eulerIdx, setEulerIdx] = useState(0);
  const eulerLevel = EULER_LEVELS[eulerIdx];
  const [eulerWalk, setEulerWalk] = useState<EulerWalkState>(() =>
    createEulerWalk(EULER_LEVELS[0]),
  );
  const [eulerFeedback, setEulerFeedback] = useState('');

  // Google Maps state
  const [gmapsOrigin, setGmapsOrigin] = useState<{lat: number; lng: number; name: string}>(
    CITIES.cairo.geo.origin,
  );
  const [gmapsDest, setGmapsDest] = useState<{lat: number; lng: number; name: string}>(
    CITIES.cairo.geo.destination,
  );
  const [gmapsActiveInput, setGmapsActiveInput] = useState<'from' | 'to'>('to');
  const [gmapsSummary, setGmapsSummary] = useState<{
    distanceKm: string;
    durationMin: string;
    error?: string;
  } | null>(null);
  const [gmapsSearchAlgo, setGmapsSearchAlgo] = useState<GmapsSearchAlgo>('both');
  const [gmapsPrimaryAlgo, setGmapsPrimaryAlgo] = useState<'ast' | 'dij'>('ast');
  const [gmapsSearchPaused, setGmapsSearchPaused] = useState(false);
  const [gmapsReplaySeq, setGmapsReplaySeq] = useState(0);
  const [gmapsStepSeq, setGmapsStepSeq] = useState(0);
  const [gmapsFitSeq, setGmapsFitSeq] = useState(0);
  const [gmapsSearchStats, setGmapsSearchStats] = useState<GmapsSearchStats | null>(null);

  // Mirror state machine to document.body.dataset.state and theme to document.documentElement
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for Google Maps quota exceeded
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Initialize / Restart Route Race
  const launchRace = useCallback(
    (g: CityGraph, s: number, t: number, refit: boolean) => {
      navRef.current.on = false;
      setNavUi((prev) => ({...prev, on: false}));
      const rD = new Runner(g, s, t, false);
      const rA = new Runner(g, s, t, true);
      rDRef.current = rD;
      rARef.current = rA;
      runningRef.current = true;
      setPaused(false);
      if (refit) setFitTick((x) => x + 1);
      setUiTick((x) => x + 1);
    },
    [],
  );

  // Boot first race
  useEffect(() => {
    launchRace(graph, fromNode, toNode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCityChange = useCallback(
    (k: CityKey) => {
      sfx.click();
      setCityKey(k);
      const g = getCity(k);
      setTraffic(g, traffic, trafficSeed);
      const p0 = nodeNearIn(g, PLACES[k][0].fx, PLACES[k][0].fy);
      const p1 = nodeNearIn(g, PLACES[k][1].fx, PLACES[k][1].fy);
      setFromNode(p0);
      setToNode(p1);
      setFromText(PLACES[k][0].n);
      setToText(PLACES[k][1].n);
      setGpsReceiver({x: g.nx[p0], y: g.ny[p0]});
      setRelayBoosted(false);
      setGmapsOrigin(CITIES[k].geo.origin);
      setGmapsDest(CITIES[k].geo.destination);
      setGmapsSummary(null);
      setGmapsSearchPaused(false);
      setGmapsReplaySeq((x) => x + 1);
      setGmapsFitSeq((x) => x + 1);
      launchRace(g, p0, p1, true);
    },
    [getCity, traffic, trafficSeed, launchRace],
  );

  const lastUiSyncRef = useRef(0);
  const handleStepRace = useCallback(() => {
    const rD = rDRef.current;
    const rA = rARef.current;
    if (!rD || !rA || !runningRef.current) return;
    if (!rD.done) rD.step();
    if (!rA.done) rA.step();
    const justFinished = rD.done && rA.done;
    if (justFinished) {
      runningRef.current = false;
    }
    const now = performance.now();
    if (justFinished || now - lastUiSyncRef.current > 120) {
      lastUiSyncRef.current = now;
      setUiTick((x) => x + 1);
    }
  }, []);

  const labelForNode = useCallback(
    (n: number) => {
      for (const p of placeOptions) {
        if (Math.hypot(graph.nx[p.node] - graph.nx[n], graph.ny[p.node] - graph.ny[n]) < 0.45) {
          return p.name;
        }
      }
      return 'Dropped pin';
    },
    [graph, placeOptions],
  );

  const handleSelectPlace = useCallback(
    (which: 'from' | 'to', node: number, label: string) => {
      sfx.click();
      if (which === 'from') {
        if (node === toNode) return;
        setFromNode(node);
        setFromText(label);
        launchRace(graph, node, toNode, true);
      } else {
        if (node === fromNode) return;
        setToNode(node);
        setToText(label);
        launchRace(graph, fromNode, node, true);
      }
    },
    [fromNode, toNode, graph, launchRace],
  );

  const handleMapNodeClick = useCallback(
    (node: number) => {
      const label = labelForNode(node);
      handleSelectPlace(activeInput, node, label);
      if (activeInput === 'from') setActiveInput('to');
    },
    [activeInput, labelForNode, handleSelectPlace],
  );

  const handleSwapPoints = useCallback(() => {
    sfx.click();
    const nf = toNode;
    const nt = fromNode;
    setFromNode(nf);
    setToNode(nt);
    setFromText(toText);
    setToText(fromText);
    launchRace(graph, nf, nt, true);
  }, [fromNode, toNode, fromText, toText, graph, launchRace]);

  const handleStartNav = useCallback(() => {
    const r = selAlgo === 'dij' ? rDRef.current : rARef.current;
    if (!r || !r.found) return;
    sfx.click();
    stepsFor(graph, r);
    const total = r.cost;
    const dur = Math.max(10, Math.min(24, r.km * 2.1));
    navRef.current = {
      on: true,
      r,
      t: 0,
      seg: 0,
      total,
      dur,
      arrived: false,
      x: graph.nx[r.path[0]],
      y: graph.ny[r.path[0]],
      head: r.angs?.[0] ?? 0,
      d: 0,
    };
    setSplitCompare(false);
    setLayersOpen(false);
    setNavUi((prev) => ({...prev, on: true, arrived: false}));
  }, [selAlgo, graph]);

  const handleStartGmapsNav = useCallback(() => {
    const r = gmapsSearchStats?.activeRunner;
    if (!r || !r.found) return;
    sfx.click();
    stepsFor(graph, r);
    const total = r.cost;
    const dur = Math.max(10, Math.min(24, r.km * 2.1));
    navRef.current = {
      on: true,
      r,
      t: 0,
      seg: 0,
      total,
      dur,
      arrived: false,
      x: graph.nx[r.path[0]],
      y: graph.ny[r.path[0]],
      head: r.angs?.[0] ?? 0,
      d: 0,
    };
    setLayersOpen(false);
    setNavUi((prev) => ({...prev, on: true, arrived: false}));
  }, [gmapsSearchStats, graph]);

  const handleExitNav = useCallback(() => {
    navRef.current.on = false;
    setNavUi((prev) => ({...prev, on: false}));
    setFitTick((x) => x + 1);
    setGmapsFitSeq((x) => x + 1);
  }, []);

  const handleNavTick = useCallback(
    (dt: number) => {
      const nav = navRef.current;
      const r = nav.r;
      if (!nav.on || !r || !r.cumC || !r.cumD || !r.angs || !r.steps) return;
      const c = r.cumC;
      const wasArrived = nav.arrived;
      if (!nav.arrived) {
        nav.t += (dt / nav.dur) * nav.total;
        if (nav.t >= nav.total) {
          nav.t = nav.total;
          nav.arrived = true;
        }
      }
      while (nav.seg < c.length - 2 && c[nav.seg + 1] <= nav.t) nav.seg++;
      const i = nav.seg;
      const span = c[i + 1] - c[i];
      const f = span > 0 ? Math.max(0, Math.min(1, (nav.t - c[i]) / span)) : 1;
      const a = r.path[i];
      const b = r.path[i + 1];
      nav.x = graph.nx[a] + (graph.nx[b] - graph.nx[a]) * f;
      nav.y = graph.ny[a] + (graph.ny[b] - graph.ny[a]) * f;
      nav.head = r.angs[i];
      nav.d = r.cumD[i] + (r.cumD[i + 1] - r.cumD[i]) * f;

      const steps = r.steps;
      let s = 0;
      while (s + 1 < steps.length - 1 && steps[s + 1].d0 <= nav.d + 1e-9) s++;
      const next = steps[s + 1] || steps[steps.length - 1];
      const remMin = Math.max(0, nav.total - nav.t);
      const remKm = Math.max(0, r.cumD[r.cumD.length - 1] - nav.d);
      const arr = new Date(Date.now() + remMin * 60000);

      const justArrived = !wasArrived && nav.arrived;
      const now = performance.now();
      if (justArrived || now - lastUiSyncRef.current > 150) {
        lastUiSyncRef.current = now;
        setNavUi({
          on: true,
          arrived: nav.arrived,
          dist: nav.arrived ? 'Arrived' : fmtDist(Math.max(0.01, next.d0 - nav.d)),
          text: nav.arrived ? 'You have reached your destination' : next.text,
          rot: next.arrive ? 0 : next.rot,
          eta: `${Math.ceil(remMin)} min`,
          sub: `${remKm.toFixed(1)} km · ${arr.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        });
      }

      if (justArrived) {
        sfx.victory();
        setScore((sc) => sc + 100);
        setMissionsCompleted((m) => m + 1);
      }
    },
    [graph],
  );

  // GPS Mode Handlers
  const handleToggleSatellite = useCallback((id: string) => {
    setSatDefs((prev) => {
      const next = prev.map((s) => (s.id === id ? {...s, enabled: !s.enabled} : s));
      const count = next.filter((s) => s.enabled).length;
      sfx.satPing(count);
      return next;
    });
  }, []);

  const handleTeleportGps = useCallback(
    (target: 'open' | 'gap') => {
      if (target === 'gap') {
        const gaps = getCityGapsWorld(graph);
        if (gaps.length > 0) {
          setGpsReceiver({x: gaps[0].wx, y: gaps[0].wy});
          sfx.gapWarn();
        }
      } else {
        const openN = nodeNearIn(graph, 0.14, 0.22);
        setGpsReceiver({x: graph.nx[openN], y: graph.ny[openN]});
        sfx.satPing(4);
      }
    },
    [graph],
  );

  const handleToggleRelayBoost = useCallback(() => {
    setRelayBoosted((prev) => {
      const next = !prev;
      if (next) {
        sfx.victory();
        setScore((s) => s + 150);
        setMissionsCompleted((m) => m + 1);
        setVictoryInfo({
          headline: 'Signal Gap Bridged!',
          detail:
            'Your GPS Relay Beacon restored 4-satellite trilateration inside the dead zone, shrinking error back to ±4m.',
        });
        setGameState('gameover');
      } else {
        sfx.click();
      }
      return next;
    });
  }, []);

  // Euler's Theorem Handlers
  const handleSelectEulerLevel = useCallback((id: string) => {
    const idx = EULER_LEVELS.findIndex((l) => l.id === id);
    if (idx < 0) return;
    sfx.click();
    setEulerIdx(idx);
    setEulerWalk(createEulerWalk(EULER_LEVELS[idx]));
    setEulerFeedback('');
  }, []);

  const handleEulerNodeClick = useCallback(
    (nodeId: number, edgeId?: number) => {
      const res = stepEulerWalkByNode(eulerLevel, eulerWalk, nodeId, edgeId);
      if (!res.moved) {
        sfx.gapWarn();
        setEulerFeedback(res.reason || 'Invalid road move.');
        return;
      }
      setEulerWalk(res.next);
      setEulerFeedback(res.reason || '');
      if (res.next.completed) {
        sfx.victory();
        setScore((s) => s + 250);
        setMissionsCompleted((m) => m + 1);
        const analysis = analyzeEulerGraph(eulerLevel, res.next.bonusBridgeEnabled);
        setVictoryInfo({
          headline: `${eulerLevel.title} Solved!`,
          detail:
            analysis.classification === 'EULERIAN_CIRCUIT'
              ? 'You completed a full Eulerian Circuit—every road mapped once, returning to start!'
              : 'You completed an Eulerian Path between the two odd-degree junctions!',
        });
        setGameState('gameover');
      } else {
        sfx.edgeStep(res.next.edgeHistory.length);
      }
    },
    [eulerLevel, eulerWalk],
  );

  const handleToggleBonusBridge = useCallback(() => {
    sfx.click();
    setEulerWalk((prev) => ({
      ...createEulerWalk(eulerLevel),
      bonusBridgeEnabled: !prev.bonusBridgeEnabled,
    }));
    setEulerFeedback('');
  }, [eulerLevel]);

  const handleStartFromTitle = useCallback((chosenMode?: GameMode) => {
    sfx.click();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const targetMode =
      chosenMode || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'gmaps' : 'race');
    setMode(targetMode);
    setGameState('playing');
    setFitTick((x) => x + 1);
    setGmapsFitSeq((x) => x + 1);
  }, []);

  // Global keyboard shortcuts (Enter/Space on Title, P/Esc for Pause, M for Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (gameState === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartFromTitle();
        }
        return;
      }

      if (typing) return;

      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          sfx.muted = !prev;
          return !prev;
        });
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (navRef.current.on) {
          handleExitNav();
          return;
        }
        setGameState((prev) =>
          prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev,
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, handleStartFromTitle, handleExitNav]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      sfx.muted = !prev;
      return !prev;
    });
  }, []);

  const handleNextChallenge = useCallback(() => {
    sfx.click();
    if (mode === 'euler') {
      const nextIdx = (eulerIdx + 1) % EULER_LEVELS.length;
      setEulerIdx(nextIdx);
      setEulerWalk(createEulerWalk(EULER_LEVELS[nextIdx]));
      setEulerFeedback('');
    } else if (mode === 'gps') {
      const nextCityIdx = (CITY_KEYS.indexOf(cityKey) + 1) % CITY_KEYS.length;
      handleCityChange(CITY_KEYS[nextCityIdx]);
      setRelayBoosted(false);
    }
    setGameState('playing');
  }, [mode, eulerIdx, cityKey, handleCityChange]);

  const handleRestartMission = useCallback(() => {
    sfx.click();
    if (mode === 'euler') {
      setEulerWalk(createEulerWalk(eulerLevel));
      setEulerFeedback('');
    } else if (mode === 'gps') {
      setRelayBoosted(false);
      handleTeleportGps('open');
    } else {
      launchRace(graph, fromNode, toNode, true);
    }
    setGameState('playing');
  }, [mode, eulerLevel, graph, fromNode, toNode, launchRace, handleTeleportGps]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Google Maps Demo Key Quota Warning Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Full-viewport Game Stage */}
      <section className="app-stage">
        {mode === 'gmaps' && gameState !== 'title' ? (
          <GoogleMapsView
            cityKey={cityKey}
            graph={graph}
            theme={theme}
            origin={gmapsOrigin}
            destination={gmapsDest}
            searchAlgo={gmapsSearchAlgo}
            primaryAlgo={gmapsPrimaryAlgo}
            searchPaused={gmapsSearchPaused}
            searchReplaySeq={gmapsReplaySeq}
            searchStepSeq={gmapsStepSeq}
            fitSeq={gmapsFitSeq}
            traffic={traffic}
            speedVal={speedVal}
            showSatellites={showSatellites}
            satDefs={satDefs}
            nav={navRef.current}
            onMapPick={(pos) => {
              sfx.click();
              setGmapsSearchPaused(false);
              const label = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
              if (gmapsActiveInput === 'from') {
                setGmapsOrigin({...pos, name: label});
                setGmapsActiveInput('to');
              } else {
                setGmapsDest({...pos, name: label});
              }
            }}
            onRouteComputed={setGmapsSummary}
            onSearchStatsUpdate={setGmapsSearchStats}
            onNavTick={handleNavTick}
            onSwitchToRouteRace={() => {
              sfx.click();
              setMode('race');
            }}
          />
        ) : (
          <RouteRaceCanvas
            gameState={gameState}
            mode={mode}
            graph={graph}
            theme={theme}
            selAlgo={selAlgo}
            splitCompare={splitCompare}
            traffic={traffic}
            fromNode={fromNode}
            toNode={toNode}
            rD={rDRef.current}
            rA={rARef.current}
            running={runningRef.current}
            paused={paused}
            speedVal={speedVal}
            stepTick={stepTick}
            fitTick={fitTick}
            zoomDeltaTick={zoomDeltaTick}
            nav={navRef.current}
            showSatellites={showSatellites}
            satDefs={satDefs}
            gpsReceiver={gpsReceiver}
            relayBoosted={relayBoosted}
            eulerLevel={eulerLevel}
            eulerWalk={eulerWalk}
            onStepRace={handleStepRace}
            onMapNodeClick={handleMapNodeClick}
            onGpsMoveReceiver={(wx, wy) => {
              sfx.click();
              setGpsReceiver({x: wx, y: wy});
            }}
            onGpsReadingUpdate={setGpsReading}
            onEulerNodeClick={handleEulerNodeClick}
            onNavTick={handleNavTick}
          />
        )}

        {/* Title Screen Overlay */}
        {gameState === 'title' && <TitleScreen onStart={handleStartFromTitle} />}

        {/* Active Playing UI */}
        {gameState !== 'title' && (
          <>
            {!navUi.on && (
              <>
                {/* Top City Chips & Math Anchor (clear of TopGameHud on desktop & mobile) */}
                <div
                  className="chips-scroll absolute z-10 top-3 left-[404px] right-[385px] max-[760px]:top-[54px] max-[760px]:left-3 max-[760px]:right-3 flex items-center gap-2 overflow-x-auto p-0.5"
                  role="group"
                  aria-label="City selector"
                >
                  {CITY_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="chip-btn"
                      aria-pressed={cityKey === k}
                      onClick={() => handleCityChange(k)}
                    >
                      {CITIES[k].name}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="chip-btn ml-auto text-[var(--muted)]"
                    onClick={() => {
                      sfx.click();
                      document
                        .getElementById('math')
                        ?.scrollIntoView({behavior: 'smooth'});
                    }}
                  >
                    The math
                  </button>
                </div>

                {/* Top-Right Score & Audio/Pause Controls */}
                <TopGameHud
                  score={score}
                  missionsCompleted={missionsCompleted}
                  muted={muted}
                  onToggleMute={handleToggleMute}
                  onPause={() => setGameState('paused')}
                  mode={mode}
                />

                {/* Left Floating Control Panel */}
                <ControlPanel
                  mode={mode}
                  cityKey={cityKey}
                  graph={graph}
                  placeOptions={placeOptions}
                  fromNode={fromNode}
                  toNode={toNode}
                  fromText={fromText}
                  toText={toText}
                  activeInput={activeInput}
                  selAlgo={selAlgo}
                  splitCompare={splitCompare}
                  running={runningRef.current}
                  paused={paused}
                  rD={rDRef.current}
                  rA={rARef.current}
                  showSatellites={showSatellites}
                  satDefs={satDefs}
                  gpsReading={gpsReading}
                  relayBoosted={relayBoosted}
                  eulerLevel={eulerLevel}
                  eulerWalk={eulerWalk}
                  eulerFeedback={eulerFeedback}
                  gmapsOriginLabel={gmapsOrigin.name}
                  gmapsDestLabel={gmapsDest.name}
                  gmapsActiveInput={gmapsActiveInput}
                  gmapsRouteSummary={gmapsSummary}
                  gmapsSearchAlgo={gmapsSearchAlgo}
                  gmapsPrimaryAlgo={gmapsPrimaryAlgo}
                  gmapsSearchPaused={gmapsSearchPaused}
                  gmapsSearchStats={gmapsSearchStats}
                  gmapsTraffic={traffic}
                  gmapsSpeedVal={speedVal}
                  onSetActiveInput={setActiveInput}
                  onSelectPlace={handleSelectPlace}
                  onSwapPoints={handleSwapPoints}
                  onSelectAlgo={(a) => {
                    sfx.click();
                    setSelAlgo(a);
                  }}
                  onToggleCompare={(val) => {
                    sfx.click();
                    setSplitCompare(val);
                    setFitTick((x) => x + 1);
                  }}
                  onStartNav={handleStartNav}
                  onReplay={() => {
                    sfx.click();
                    launchRace(graph, fromNode, toNode, true);
                  }}
                  onTogglePause={() => {
                    sfx.click();
                    setPaused((p) => !p);
                  }}
                  onStep={() => {
                    sfx.click();
                    setPaused(true);
                    setStepTick((x) => x + 1);
                  }}
                  onToggleSatOverlay={(val) => {
                    sfx.click();
                    setShowSatellites(val);
                  }}
                  onToggleSatellite={handleToggleSatellite}
                  onTeleportGps={handleTeleportGps}
                  onToggleRelayBoost={handleToggleRelayBoost}
                  onSelectEulerLevel={handleSelectEulerLevel}
                  onToggleBonusBridge={handleToggleBonusBridge}
                  onUndoEuler={() => {
                    sfx.click();
                    setEulerWalk((w) => undoEulerWalk(w));
                    setEulerFeedback('');
                  }}
                  onResetEuler={() => {
                    sfx.click();
                    setEulerWalk(createEulerWalk(eulerLevel));
                    setEulerFeedback('');
                  }}
                  onSetGmapsActiveInput={setGmapsActiveInput}
                  onSelectGmapsPlace={(which, lat, lng, name) => {
                    sfx.click();
                    setGmapsSearchPaused(false);
                    if (which === 'from') {
                      setGmapsOrigin({lat, lng, name});
                    } else {
                      setGmapsDest({lat, lng, name});
                    }
                  }}
                  onSwapGmapsPoints={() => {
                    sfx.click();
                    setGmapsSearchPaused(false);
                    setGmapsOrigin(gmapsDest);
                    setGmapsDest(gmapsOrigin);
                  }}
                  onSelectGmapsPrimaryAlgo={(alg) => {
                    sfx.click();
                    setGmapsPrimaryAlgo(alg);
                    if (gmapsSearchAlgo !== 'both') {
                      setGmapsSearchAlgo(alg);
                    }
                  }}
                  onToggleGmapsCompare={(checked) => {
                    sfx.click();
                    setGmapsSearchAlgo(checked ? 'both' : gmapsPrimaryAlgo);
                  }}
                  onStartGmapsNav={handleStartGmapsNav}
                  onResetGmapsRoute={() => {
                    sfx.click();
                    setGmapsOrigin(CITIES[cityKey].geo.origin);
                    setGmapsDest(CITIES[cityKey].geo.destination);
                    setGmapsSearchPaused(false);
                    setGmapsReplaySeq((x) => x + 1);
                    setGmapsFitSeq((x) => x + 1);
                  }}
                  onFitGmapsAll={() => {
                    sfx.click();
                    setGmapsFitSeq((x) => x + 1);
                  }}
                  onReplayGmapsSearch={() => {
                    sfx.click();
                    setGmapsSearchPaused(false);
                    setGmapsReplaySeq((x) => x + 1);
                  }}
                  onToggleGmapsPause={() => {
                    sfx.click();
                    setGmapsSearchPaused((p) => !p);
                  }}
                  onStepGmapsSearch={() => {
                    sfx.click();
                    setGmapsSearchPaused(true);
                    setGmapsStepSeq((x) => x + 1);
                  }}
                  onToggleGmapsTraffic={(on) => {
                    sfx.click();
                    setTrafficState(on);
                    const ns = trafficSeed + 1;
                    setTrafficSeed(ns);
                    setTraffic(graph, on, ns);
                    launchRace(graph, fromNode, toNode, false);
                  }}
                  onChangeGmapsSpeed={(v) => setSpeedVal(v)}
                  onSelectMode={(mKey) => {
                    sfx.click();
                    setMode(mKey);
                    handleExitNav();
                  }}
                />
              </>
            )}

            {/* Bottom-Right Map Controls (hidden in Google Maps mode which provides its own) */}
            {mode !== 'gmaps' && (
              <>
                <div
                  className={`absolute z-10 right-3 flex flex-col gap-2.5 items-end ${
                    navUi.on ? 'bottom-24' : 'bottom-3 max-[760px]:bottom-[calc(48%+12px)]'
                  }`}
                >
                  <button
                    type="button"
                    className="fab-btn"
                    aria-label="Map layers"
                    aria-expanded={layersOpen}
                    onClick={() => setLayersOpen((o) => !o)}
                  >
                    <Layers size={20} />
                  </button>
                  <button
                    type="button"
                    className="fab-btn"
                    aria-label="Fit route"
                    onClick={() => setFitTick((x) => x + 1)}
                  >
                    <LocateFixed size={20} />
                  </button>
                  <div className="floating-panel flex flex-col overflow-hidden rounded-lg">
                    <button
                      type="button"
                      className="fab-btn rounded-none shadow-none"
                      aria-label="Zoom in"
                      onClick={() =>
                        setZoomDeltaTick((z) => ({dir: 1, seq: z.seq + 1}))
                      }
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      type="button"
                      className="fab-btn rounded-none shadow-none border-t border-[var(--line)]"
                      aria-label="Zoom out"
                      onClick={() =>
                        setZoomDeltaTick((z) => ({dir: -1, seq: z.seq + 1}))
                      }
                    >
                      <Minus size={20} />
                    </button>
                  </div>
                </div>

                {layersOpen && !navUi.on && (
                  <div className="floating-panel absolute z-20 right-[60px] bottom-3 w-[236px] p-3.5 flex flex-col gap-3.5 border border-[var(--line)]">
                    <div>
                      <h5 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        Map type
                      </h5>
                      <div className="flex gap-2.5">
                        {(
                          [
                            ['light', 'Default', '#f1f0ec'],
                            ['dark', 'Night', '#242f3e'],
                          ] as const
                        ).map(([tVal, tLabel, bgCol]) => (
                          <button
                            key={tVal}
                            type="button"
                            aria-pressed={theme === tVal}
                            onClick={() => setTheme(tVal)}
                            className={`flex-1 rounded-xl p-1 text-center text-xs border-2 ${
                              theme === tVal
                                ? 'border-[var(--accent)] font-semibold text-[var(--accent)]'
                                : 'border-transparent'
                            }`}
                          >
                            <i
                              className="block h-11 rounded-lg border border-[var(--line)] mb-1"
                              style={{backgroundColor: bgCol}}
                            />
                            <span>{tLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h5 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        Map details
                      </h5>
                      <label className="flex items-center justify-between text-sm cursor-pointer">
                        <span>Live traffic</span>
                        <input
                          type="checkbox"
                          checked={traffic}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setTrafficState(on);
                            const ns = trafficSeed + 1;
                            setTrafficSeed(ns);
                            setTraffic(graph, on, ns);
                            launchRace(graph, fromNode, toNode, false);
                          }}
                          className="w-4 h-4 accent-[var(--accent)]"
                        />
                      </label>
                    </div>

                    <label className="flex items-center justify-between text-sm">
                      <span>Search speed</span>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        value={speedVal}
                        onChange={(e) => setSpeedVal(Number(e.target.value))}
                        className="w-24 accent-[var(--accent)]"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            {/* Turn-by-Turn Drive Navigation HUD */}
            {navUi.on && (
              <>
                <div className="absolute z-20 left-3 top-3 right-3 max-w-[520px] flex items-center gap-4 bg-[var(--navgreen)] text-white rounded-xl shadow-lg px-4 py-3">
                  {navUi.arrived ? (
                    <MapPin size={40} className="shrink-0" />
                  ) : (
                    <ArrowUp
                      size={40}
                      className="shrink-0"
                      style={{transform: `rotate(${navUi.rot}deg)`}}
                    />
                  )}
                  <div>
                    <div className="text-3xl font-semibold leading-tight tabular-nums">
                      {navUi.dist}
                    </div>
                    <div className="text-base opacity-95">{navUi.text}</div>
                  </div>
                </div>

                <div className="floating-panel absolute z-20 left-3 right-16 bottom-3 max-w-[520px] flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <b className="text-xl font-semibold text-[var(--ok)] tabular-nums">
                      {navUi.eta}
                    </b>
                    <div className="text-xs text-[var(--muted)] tabular-nums">{navUi.sub}</div>
                  </div>
                  <button type="button" onClick={handleExitNav} className="pill-btn danger">
                    Exit
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Pause & Victory Modals */}
        <GameModals
          gameState={gameState}
          score={score}
          missionsCompleted={missionsCompleted}
          victoryHeadline={victoryInfo.headline}
          victoryDetail={victoryInfo.detail}
          onResume={() => setGameState('playing')}
          onRestart={handleRestartMission}
          onReturnTitle={() => {
            handleExitNav();
            setGameState('title');
          }}
          onNextChallenge={handleNextChallenge}
        />
      </section>

      {/* Typeset Paper Section Below Map */}
      <MathPaper />
    </div>
  );
}

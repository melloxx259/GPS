import React, {useMemo} from 'react';
import katex from 'katex';
import {CITIES, PLACES, buildCity, nodeNearIn, Runner, setTraffic, type CityKey} from '../engine/graph';

function Tex({math, display = false}: {math: string; display?: boolean}) {
  const html = useMemo(() => {
    return katex.renderToString(math, {
      displayMode: display,
      throwOnError: false,
    });
  }, [math, display]);

  return display ? (
    <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{__html: html}} />
  ) : (
    <span dangerouslySetInnerHTML={{__html: html}} />
  );
}

interface BenchRow {
  city: string;
  junctions: string;
  dijkstra: string;
  astar: string;
  fewer: string;
  tripMin: string;
  sameCost: string;
}

export const MathPaper: React.FC = () => {
  const benchRows = useMemo<BenchRow[]>(() => {
    return (Object.keys(CITIES) as CityKey[]).map((k) => {
      const g = buildCity(k);
      setTraffic(g, false, 0);
      const s = nodeNearIn(g, PLACES[k][0].fx, PLACES[k][0].fy);
      const t = nodeNearIn(g, PLACES[k][1].fx, PLACES[k][1].fy);
      const d = new Runner(g, s, t, false);
      const a = new Runner(g, s, t, true);
      while (!d.done) d.step();
      while (!a.done) a.step();
      const same = Math.abs(d.cost - a.cost) < 1e-9;
      return {
        city: CITIES[k].name,
        junctions: g.count.toLocaleString(),
        dijkstra: d.expanded.toLocaleString(),
        astar: a.expanded.toLocaleString(),
        fewer: `${Math.round(100 * (1 - a.expanded / d.expanded))}%`,
        tripMin: d.cost.toFixed(1),
        sameCost: same ? 'yes' : 'no',
      };
    });
  }, []);

  return (
    <section className="mathsec" id="math">
      <article className="paper">
        <h2>How GPS, Shortest Paths, and Euler’s Theorem Work Together</h2>
        <p className="byline">
          From satellite trilateration and signal gaps to A* navigation and Eulerian street-mapping graphs
        </p>

        <h3>1. Road Network Model</h3>
        <p>
          Let <Tex math="G=(V,E)" /> be a graph whose vertices are junctions and whose edges are road
          segments. Every vertex <Tex math="v" /> has a position <Tex math="p(v)\in\mathbb{R}^2" />{' '}
          in kilometres. For a segment <Tex math="(u,v)\in E" />, let{' '}
          <Tex math="d(u,v)=\lVert p(u)-p(v)\rVert_2" /> be its length and{' '}
          <Tex math="s(u,v)\in\{30,60,80\}" /> its speed in km/h for local, arterial, and highway
          roads. Live traffic multiplies travel time by <Tex math="\tau(u,v)\ge 1" />. The segment
          cost in minutes is:
        </p>
        <Tex
          display
          math="w(u,v)=\frac{60\,d(u,v)}{s(u,v)}\,\tau(u,v) \tag{1}"
        />
        <p>
          Because <Tex math="w\ge 0" /> on every segment, a cheapest path from <Tex math="s" /> to{' '}
          <Tex math="t" /> never repeats a vertex, and <Tex math="\delta(s,v)" /> denotes the least
          cost of any path from <Tex math="s" /> to <Tex math="v" />.
        </p>

        <h3>2. Dijkstra vs. A* Search</h3>
        <p>
          Dijkstra repeatedly settles the open vertex with the smallest tentative time{' '}
          <Tex math="g(v)" />, expanding outward in all directions like ripples in a pond. A* orders
          its priority queue by <Tex math="f(v)=g(v)+h(v)" />, adding the optimistic straight-line
          heuristic:
        </p>
        <Tex
          display
          math="h(v)=\frac{60\,\lVert p(v)-p(t)\rVert_2}{v_{\max}}, \qquad v_{\max}=80\text{ km/h} \tag{2}"
        />
        <div className="stmt">
          <b className="lab">Theorem 1 (Consistency &amp; Optimality).</b> Because{' '}
          <Tex math="h(u)\le w(u,v)+h(v)" /> by the triangle inequality and <Tex math="h(t)=0" />,
          A* always returns a route of optimal cost <Tex math="\delta(s,t)" />—identical to
          Dijkstra—while exploring only vertices with <Tex math="\delta(s,v)+h(v)\le \delta(s,t)" />.
        </div>

        <div className="alg">
          <div className="t">
            <b>Algorithm 1.</b> A* search (Dijkstra is the special case <Tex math="h\equiv 0" />).
          </div>
          <pre>{`input: graph G, source s, target t
1  g(v) ← ∞ for all v;  g(s) ← 0;  Q ← { s with key h(s) }
2  while Q is not empty
3      u ← vertex in Q with smallest key f(u) = g(u) + h(u)
4      if u = t then return path following parent pointers
5      mark u settled
6      for each road (u, v) with v not settled
7          if g(u) + w(u,v) < g(v) then
8              g(v) ← g(u) + w(u,v);  parent(v) ← u
9              push/update v in Q with key g(v) + h(v)`}</pre>
        </div>

        <h3>3. GPS Satellites, Trilateration &amp; Signal Gaps</h3>
        <p>
          Before A* can route you, your phone must know <em>where</em> you are on the graph. Each
          GPS satellite <Tex math="S_i" /> broadcasts its orbital position and timestamp. Multiplying
          signal travel time <Tex math="\Delta t_i" /> by the speed of light <Tex math="c" /> yields
          a distance sphere (or circle in 2D):
        </p>
        <Tex
          display
          math="\lVert p_{\text{user}} - p(S_i)\rVert_2 = c\,\Delta t_i \tag{3}"
        />
        <p>
          With <strong>1 satellite</strong>, your location lies anywhere on one circle. With{' '}
          <strong>2 satellites</strong>, two circles intersect at two ambiguous points. With{' '}
          <strong>3+ satellites</strong> (and a 4th satellite to correct clock bias), the circles
          meet at one sharp fix.
        </p>
        <div className="stmt">
          <b className="lab">What happens in a Signal Gap?</b> Inside tunnels or tall skyscraper
          canyons, satellite beams are blocked or bounce off glass (multipath error). Satellite lock
          drops below 3, expanding the uncertainty radius <Tex math="r_{\text{err}}" />. Navigation
          apps solve this using <strong>Graph Map-Matching</strong>: projecting the noisy GPS
          estimate onto the closest road edge <Tex math="(u,v)\in E" />.
        </div>

        <h3>4. Euler’s Theorem in Graph Theory (1736)</h3>
        <p>
          Shortest-path algorithms get from <Tex math="A" /> to <Tex math="B" />, but what if a GPS
          mapping car needs to drive <strong>every single road or bridge exactly once</strong>? In
          1736, Leonhard Euler solved the Seven Bridges of Königsberg by counting the{' '}
          <strong>degree</strong> <Tex math="\deg(v)" />—the number of roads touching each junction{' '}
          <Tex math="v" />.
        </p>
        <Tex
          display
          math="\sum_{v\in V}\deg(v) = 2|E| \quad\text{(Handshaking Lemma)} \tag{4}"
        />
        <div className="stmt">
          <b className="lab">Theorem 2 (Euler’s Path &amp; Circuit Theorem).</b> A connected graph{' '}
          <Tex math="G=(V,E)" /> has:
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              An <strong>Eulerian Circuit</strong> (starts and ends at the same junction, crossing
              every road once) if and only if <strong>0 vertices have odd degree</strong>.
            </li>
            <li>
              An <strong>Eulerian Path</strong> (starts at one odd junction, ends at the other) if
              and only if <strong>exactly 2 vertices have odd degree</strong>.
            </li>
            <li>
              <strong>No Eulerian walk</strong> if more than 2 vertices have odd degree (like
              Königsberg’s 4 odd-degree landmasses: degrees 3, 3, 3, and 5).
            </li>
          </ul>
        </div>

        <h3>5. Measured on Route Race Networks</h3>
        <div className="tblwrap">
          <table>
            <caption>
              Table 1. Route from the first to the second listed landmark in each city (no traffic).
              Junctions settled before the target was reached.
            </caption>
            <thead>
              <tr>
                <th>City</th>
                <th>Junctions</th>
                <th>Dijkstra</th>
                <th>A*</th>
                <th>Fewer</th>
                <th>Trip (min)</th>
                <th>Same cost</th>
              </tr>
            </thead>
            <tbody>
              {benchRows.map((row) => (
                <tr key={row.city}>
                  <td>{row.city}</td>
                  <td>{row.junctions}</td>
                  <td>{row.dijkstra}</td>
                  <td>{row.astar}</td>
                  <td>{row.fewer}</td>
                  <td>{row.tripMin}</td>
                  <td>{row.sameCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fine">
          The five city networks are procedural road grids shaped by real geographical barriers
          (Nile, Sumida, East River, Seine, Sydney Harbour). The Real World Map mode connects to
          Google Maps Platform for live street geometry and routing.
        </p>
      </article>
    </section>
  );
};

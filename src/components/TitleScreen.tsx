import React from 'react';
import {Download} from 'lucide-react';
import type {GameMode} from '../App';

interface TitleScreenProps {
  onStart: (mode?: GameMode) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({onStart}) => {
  const hasGmaps = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-start p-4 md:p-10 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-title-heading"
    >
      <div
        className="pointer-events-auto w-full max-w-[440px] rounded-2xl p-6 md:p-8 shadow-2xl border"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--line)',
          color: 'var(--fg)',
        }}
      >
        {/* Bespoke SVG Title Lockup: Satellite + Trilateration + Graph Route */}
        <div className="mb-5">
          <svg
            viewBox="0 0 404 92"
            className="w-full h-auto"
            role="img"
            aria-label="Route Race: GPS and Euler Graph Explorer"
          >
            {/* Trilateration arcs */}
            <circle cx="46" cy="46" r="34" fill="none" stroke="var(--sat)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.55" />
            <circle cx="46" cy="46" r="22" fill="none" stroke="var(--sat)" strokeWidth="1.5" opacity="0.8" />
            {/* Graph edge & nodes */}
            <path d="M 22 64 L 46 46 L 74 56" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="22" cy="64" r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
            <circle cx="46" cy="46" r="5.5" fill="var(--ok)" stroke="#ffffff" strokeWidth="2" />
            <circle cx="74" cy="56" r="5" fill="var(--jam)" stroke="#ffffff" strokeWidth="2" />
            {/* Orbiting satellite icon */}
            <g transform="translate(64, 18) rotate(-28)">
              <rect x="-14" y="-3.5" width="9" height="7" rx="1.2" fill="var(--sat)" />
              <rect x="5" y="-3.5" width="9" height="7" rx="1.2" fill="var(--sat)" />
              <rect x="-4.5" y="-5" width="9" height="10" rx="2" fill="var(--fg)" />
              <line x1="0" y1="5" x2="0" y2="10" stroke="var(--sat)" strokeWidth="1.8" />
            </g>
            <text
              x="96"
              y="41"
              fill="var(--fg)"
              fontFamily="var(--sans)"
              fontWeight="700"
              fontSize="26"
              letterSpacing="-0.02em"
            >
              Route Race
            </text>
            <text
              x="97"
              y="63"
              fill="var(--muted)"
              fontFamily="var(--sans)"
              fontWeight="500"
              fontSize="12.5"
            >
              GPS Satellites · Signal Gaps · Euler’s Theorem
            </text>
          </svg>
        </div>

        <h1 id="game-title-heading" className="sr-only">
          Route Race: GPS Satellites, Signal Gaps, and Euler’s Theorem
        </h1>

        <p className="text-sm leading-relaxed mb-5" style={{color: 'var(--muted)'}}>
          Discover how 4 orbiting GPS satellites triangulate your location, why tunnels create
          signal gaps, and how shortest-path search and Euler’s graph theorem guide every turn.
        </p>

        {/* Primary Start CTA */}
        <button
          type="button"
          data-start="true"
          onClick={() => onStart(hasGmaps ? 'gmaps' : 'race')}
          className="pill-btn primary w-full py-3 text-base font-semibold mb-4"
          style={{minHeight: 46}}
        >
          {hasGmaps ? 'Start on Google Maps' : 'Start Exploring'}
        </button>

        {/* Quick-jump activity buttons */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {hasGmaps ? (
            <button
              type="button"
              onClick={() => onStart('race')}
              className="rounded-lg px-2.5 py-2 text-xs font-medium border text-center transition-colors hover:opacity-90"
              style={{borderColor: 'var(--line)', backgroundColor: 'var(--bg)'}}
            >
              Classic Grid
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart('gmaps')}
              className="rounded-lg px-2.5 py-2 text-xs font-medium border text-center transition-colors hover:opacity-90"
              style={{borderColor: 'var(--line)', backgroundColor: 'var(--bg)'}}
            >
              Real World Map
            </button>
          )}
          <button
            type="button"
            onClick={() => onStart('gps')}
            className="rounded-lg px-2.5 py-2 text-xs font-medium border text-center transition-colors hover:opacity-90"
            style={{borderColor: 'var(--line)', backgroundColor: 'var(--bg)'}}
          >
            GPS &amp; Gaps
          </button>
          <button
            type="button"
            onClick={() => onStart('euler')}
            className="rounded-lg px-2.5 py-2 text-xs font-medium border text-center transition-colors hover:opacity-90"
            style={{borderColor: 'var(--line)', backgroundColor: 'var(--bg)'}}
          >
            Euler’s Bridges
          </button>
        </div>

        {/* Download Standalone Web File (.html) */}
        <div className="mb-3 flex justify-center">
          <a
            href="./route-race-explorer.html"
            download="route-race-explorer.html"
            className="inline-flex items-center gap-1.5 text-xs font-medium no-underline hover:underline"
            style={{color: 'var(--accent)'}}
          >
            <Download size={14} />
            <span>Download Standalone Web File (.html)</span>
          </a>
        </div>

        {/* Single flat control-hint line */}
        <p className="text-xs text-center m-0" style={{color: 'var(--muted)'}}>
          Click map to pin · Enter/Space Start · M Mute · P Pause
        </p>
      </div>
    </div>
  );
};

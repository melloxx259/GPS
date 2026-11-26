import React from 'react';
import {Volume2, VolumeX, Pause, Play, Trophy, RotateCcw, Download} from 'lucide-react';
import type {GameState, GameMode} from '../App';

interface TopHudProps {
  score: number;
  missionsCompleted: number;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  mode: GameMode;
}

export const TopGameHud: React.FC<TopHudProps> = ({
  score,
  missionsCompleted,
  muted,
  onToggleMute,
  onPause,
}) => {
  return (
    <div
      className="absolute top-3 right-3 z-20 flex items-center gap-2 pointer-events-auto"
      aria-label="Game status controls"
    >
      <div
        className="floating-panel flex items-center gap-3 px-3.5 h-9 text-xs font-medium tabular-nums"
        style={{border: '1px solid var(--line)'}}
      >
        <span>
          <span style={{color: 'var(--muted)'}}>SCORE </span>
          <strong className="font-semibold" data-testid="hud-score">
            {Math.round(score)}
          </strong>
        </span>
        <span aria-hidden="true" style={{color: 'var(--line)'}}>
          ·
        </span>
        <span>
          <span style={{color: 'var(--muted)'}}>CLEARED </span>
          <strong className="font-semibold" data-testid="hud-missions">
            {missionsCompleted}
          </strong>
        </span>
      </div>

      <a
        href="./route-race-explorer.html"
        download="route-race-explorer.html"
        className="floating-panel inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium no-underline hover:opacity-90"
        style={{border: '1px solid var(--line)', color: 'var(--accent)'}}
        title="Download standalone HTML file for offline / local web use"
      >
        <Download size={14} />
        <span>HTML</span>
      </a>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMute();
        }}
        className="fab-btn"
        style={{width: 36, height: 36}}
        aria-label={muted ? 'Unmute sound (M)' : 'Mute sound (M)'}
        title={muted ? 'Unmute (M)' : 'Mute (M)'}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onPause();
        }}
        className="fab-btn"
        style={{width: 36, height: 36}}
        aria-label="Pause game (P)"
        title="Pause (P)"
      >
        <Pause size={18} />
      </button>
    </div>
  );
};

interface GameModalsProps {
  gameState: GameState;
  score: number;
  missionsCompleted: number;
  victoryHeadline: string;
  victoryDetail: string;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onNextChallenge: () => void;
}

export const GameModals: React.FC<GameModalsProps> = ({
  gameState,
  score,
  missionsCompleted,
  victoryHeadline,
  victoryDetail,
  onResume,
  onRestart,
  onReturnTitle,
  onNextChallenge,
}) => {
  if (gameState !== 'paused' && gameState !== 'gameover') return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{backgroundColor: 'rgba(15, 23, 42, 0.5)'}}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div
        className="w-full max-w-[380px] rounded-2xl p-6 shadow-2xl border"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--line)',
          color: 'var(--fg)',
        }}
      >
        {gameState === 'paused' ? (
          <>
            <h2 id="modal-heading" className="text-xl font-semibold mb-1">
              Simulation Paused
            </h2>
            <p className="text-sm mb-5" style={{color: 'var(--muted)'}}>
              Take a breather or switch back to the title menu.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-lg p-3 border" style={{borderColor: 'var(--line)'}}>
                <div className="text-xs" style={{color: 'var(--muted)'}}>
                  Score
                </div>
                <div className="text-lg font-semibold tabular-nums">{Math.round(score)}</div>
              </div>
              <div className="rounded-lg p-3 border" style={{borderColor: 'var(--line)'}}>
                <div className="text-xs" style={{color: 'var(--muted)'}}>
                  Missions
                </div>
                <div className="text-lg font-semibold tabular-nums">{missionsCompleted}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="pill-btn primary w-full"
                style={{minHeight: 42}}
              >
                <Play size={16} />
                Resume
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="pill-btn w-full"
                style={{minHeight: 40}}
              >
                <RotateCcw size={16} />
                Restart Current Mission
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="pill-btn w-full"
                style={{minHeight: 40}}
              >
                Back to Title
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-2" style={{color: 'var(--ok)'}}>
              <Trophy size={22} />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Challenge Complete
              </span>
            </div>
            <h2 id="modal-heading" className="text-xl font-semibold mb-1.5">
              {victoryHeadline}
            </h2>
            <p className="text-sm mb-5" style={{color: 'var(--muted)'}}>
              {victoryDetail}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-lg p-3 border" style={{borderColor: 'var(--line)'}}>
                <div className="text-xs" style={{color: 'var(--muted)'}}>
                  Total Score
                </div>
                <div className="text-lg font-semibold tabular-nums">{Math.round(score)}</div>
              </div>
              <div className="rounded-lg p-3 border" style={{borderColor: 'var(--line)'}}>
                <div className="text-xs" style={{color: 'var(--muted)'}}>
                  Cleared
                </div>
                <div className="text-lg font-semibold tabular-nums">{missionsCompleted}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onNextChallenge}
                className="pill-btn primary w-full"
                style={{minHeight: 42}}
              >
                Next Challenge
              </button>
              <button
                type="button"
                onClick={onResume}
                className="pill-btn w-full"
                style={{minHeight: 40}}
              >
                Keep Exploring Map
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

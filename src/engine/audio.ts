class SoundFX {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.06, delay = 0) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  click(): void {
    this.tone(540, 0.07, 'triangle', 0.045);
  }

  satPing(lockedCount: number): void {
    const base = 420 + lockedCount * 95;
    this.tone(base, 0.11, 'sine', 0.05);
  }

  gapWarn(): void {
    this.tone(210, 0.14, 'sawtooth', 0.035);
    this.tone(165, 0.16, 'sawtooth', 0.03, 0.08);
  }

  edgeStep(stepIdx: number): void {
    const scale = [440, 493.88, 554.37, 659.25, 739.99, 880];
    this.tone(scale[stepIdx % scale.length], 0.1, 'triangle', 0.055);
  }

  victory(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.22, 'triangle', 0.07, i * 0.085);
    });
  }
}

export const sfx = new SoundFX();

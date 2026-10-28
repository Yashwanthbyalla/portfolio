import { Injectable, effect, inject, signal } from '@angular/core';
import { ThemeService, type AppTheme } from './theme.service';

const SOUND_KEY = 'portfolio-sound';

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Each world's NATURAL sounds lead; ambient music is a soft bed underneath.
 * Nature (dominant): continuous world backdrop + frequent animal/world sounds.
 * Music (background): slow chord pads + very sparse melodic notes, kept low:
 *  Mine:   echoing drips, distant rock ticks — and near-silence between
 *  Ocean:  very soft slow waves, bubbles, a distant whale, dolphin whistles
 *  Forest: gentle birdsong, crickets, an owl, frogs, soft leaf rustle
 * At night every world plays softer, darker and sparser.
 * Browsers block autoplay, so sound starts only when the user toggles it on.
 */
@Injectable({ providedIn: 'root' })
export class AmbientAudioService {
  private readonly themeService = inject(ThemeService);
  readonly enabled = signal(false);

  private ctx?: AudioContext;
  private master?: GainNode;
  private padGain?: GainNode;
  private padFilter?: BiquadFilterNode;
  private padNodes: OscillatorNode[] = [];
  private chordTimer?: ReturnType<typeof setInterval>;
  private melodyTimer?: ReturnType<typeof setInterval>;
  private chordIndex = 0;
  /** Nature bus — deliberately quieter than the music bus. */
  private sfxGain?: GainNode;
  private sfxTimer?: ReturnType<typeof setInterval>;
  private bedSource?: AudioBufferSourceNode;
  private bedGainNode?: GainNode;
  private bedLfo?: OscillatorNode;
  private cachedNoise?: AudioBuffer;

  constructor() {
    // Restart the music whenever the world or the sky changes.
    effect(() => {
      const theme = this.themeService.theme();
      const phase = this.themeService.phase();
      void theme; void phase;
      if (this.enabled() && this.ctx) this.startMusic();
    });
  }

  toggle(): void {
    if (this.enabled()) this.stop();
    else void this.start();
  }

  async start(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      // Gentle compression + softening so notes can never clip or sound harsh.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 20; comp.ratio.value = 6;
      comp.attack.value = 0.02; comp.release.value = 0.3;
      const softener = this.ctx.createBiquadFilter();
      softener.type = 'lowpass'; softener.frequency.value = 7800;
      this.master.connect(softener).connect(comp).connect(this.ctx.destination);

      // The pad bus: chords flow through one slowly-breathing filter.
      this.padFilter = this.ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 1100;
      this.padFilter.Q.value = 0.4;
      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = 0.9;
      this.padFilter.connect(this.padGain).connect(this.master);

      // Nature bus LEADS (full level); the music pad is mixed well under it.
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.master);
    }
    await this.ctx.resume();
    this.enabled.set(true);
    window.localStorage.setItem(SOUND_KEY, 'on');
    this.master!.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master!.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 1.6);
    this.startMusic();
  }

  stop(): void {
    this.enabled.set(false);
    if (typeof window !== 'undefined') window.localStorage.setItem(SOUND_KEY, 'off');
    this.stopTimers();
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    }
    window.setTimeout(() => { if (!this.enabled()) { this.stopPad(0.1); this.stopBed(); } }, 600);
  }

  private stopTimers(): void {
    if (this.chordTimer) clearInterval(this.chordTimer);
    if (this.melodyTimer) clearInterval(this.melodyTimer);
    if (this.sfxTimer) clearInterval(this.sfxTimer);
    this.chordTimer = undefined; this.melodyTimer = undefined; this.sfxTimer = undefined;
  }

  // ── Music theory per world ────────────────────────────────────────────
  private chords(theme: AppTheme): number[][] {
    switch (theme) {
      case 'ocean': // Cmaj7 · Am7 · Fmaj7 · G7 — calm, floating
        return [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]];
      case 'forest': // G · Em · C · D — warm and hopeful
        return [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]];
      default: // Dm · B♭ · A(sus) · C — deep, cavernous (one octave down in playChord)
        return [[50, 53, 57], [46, 50, 53], [45, 52, 57], [48, 52, 55]];
    }
  }

  private scale(theme: AppTheme): number[] {
    switch (theme) {
      case 'ocean': return [60, 62, 64, 67, 69, 72, 76]; // C major pentatonic-ish
      case 'forest': return [67, 69, 71, 74, 76, 79, 83]; // G major pentatonic, brighter
      default: return [50, 53, 55, 57, 60, 62]; // D minor, low
    }
  }

  private startMusic(): void {
    if (!this.ctx) return;
    this.stopTimers();
    this.chordIndex = 0;
    this.playChord();
    // Slow harmonic journey — a new chord every 9 seconds, crossfaded.
    this.chordTimer = setInterval(() => this.playChord(), 9000);
    // Sparse melody: a soft note every ~2.8s, sometimes resting.
    this.melodyTimer = setInterval(() => this.maybePluck(), 2800);
    // Nature layer for this world — the lead voice of the soundscape.
    this.buildBed();
    this.sfxTimer = setInterval(() => this.scheduleNature(), 900);
  }

  // ── Nature layer (all volumes low — music stays in front) ─────────────
  private noiseBuffer(): AudioBuffer {
    if (this.cachedNoise) return this.cachedNoise;
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0; let peak = 0.0001;
    const raw = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      raw[i] = last * 3.5;
      peak = Math.max(peak, Math.abs(raw[i]));
    }
    const scale = 0.5 / peak;
    for (let i = 0; i < data.length; i++) data[i] = raw[i] * scale;
    const fade = Math.floor(ctx.sampleRate); // seamless 1s loop crossfade
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[data.length - fade + i] * (1 - k);
    }
    this.cachedNoise = buffer;
    return buffer;
  }

  private stopBed(): void {
    try { this.bedSource?.stop(); } catch { /* noop */ }
    try { this.bedLfo?.stop(); } catch { /* noop */ }
    this.bedSource?.disconnect(); this.bedLfo?.disconnect();
    this.bedSource = undefined; this.bedLfo = undefined;
  }

  /** Continuous backdrop, now clearly audible: ocean waves / forest breeze / mine air. */
  private buildBed(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.stopBed();
    const ctx = this.ctx;
    const theme = this.themeService.theme();
    const night = this.themeService.phase() === 'night';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme === 'ocean' ? 460 : theme === 'forest' ? 950 : 220;
    this.bedGainNode = ctx.createGain();
    const target = theme === 'ocean' ? (night ? 0.11 : 0.15) : theme === 'forest' ? (night ? 0.07 : 0.095) : 0.035;
    this.bedGainNode.gain.setValueAtTime(0, ctx.currentTime);
    this.bedGainNode.gain.linearRampToValueAtTime(target, ctx.currentTime + 2.5);
    this.bedSource = ctx.createBufferSource();
    this.bedSource.buffer = this.noiseBuffer();
    this.bedSource.loop = true;
    this.bedSource.connect(filter).connect(this.bedGainNode).connect(this.sfxGain);
    // Slow swell — a wave every ~12s / a breeze gust, barely moving.
    this.bedLfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    this.bedLfo.frequency.value = theme === 'ocean' ? 0.085 : 0.13;
    lfoGain.gain.value = target * 0.45;
    this.bedLfo.connect(lfoGain).connect(this.bedGainNode.gain);
    this.bedSource.start();
    this.bedLfo.start();
  }

  /** Soft short sound on the nature bus, optional cave/ocean echo. */
  private sfx(freqA: number, freqB: number, dur: number, vol: number, type: OscillatorType = 'sine', echo = false, delaySec = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (!this.enabled() || !this.ctx || !this.sfxGain) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqA, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(gain);
      if (echo) {
        const delay = ctx.createDelay(1); delay.delayTime.value = 0.29;
        const fb = ctx.createGain(); fb.gain.value = 0.3;
        const wet = ctx.createGain(); wet.gain.value = 0.45;
        gain.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(this.sfxGain);
      }
      gain.connect(this.sfxGain);
      osc.start(t); osc.stop(t + dur + 0.05);
    }, delaySec * 1000);
  }

  private rustle(vol = 0.035): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t, Math.random()); src.stop(t + 0.6);
  }

  private scheduleNature(): void {
    if (!this.enabled()) return;
    const theme = this.themeService.theme();
    const phase = this.themeService.phase();
    const r = Math.random();

    if (theme === 'underground') {
      if (r < 0.5) this.sfx(1250 + Math.random() * 450, 640, 0.4, 0.16, 'sine', true); // cave drip — the Mine's signature
      else if (r < 0.6) this.sfx(85 + Math.random() * 50, 42, 0.55, 0.09, 'triangle', true); // distant rock settling
      else if (r < 0.66) this.rustle(0.02); // air drifting through the shaft
    } else if (theme === 'ocean') {
      if (r < 0.42) { // rising bubble trails
        const base = 480 + Math.random() * 420;
        for (let i = 0; i < 4; i++) this.sfx(base + i * 150, base + i * 240, 0.13, 0.05, 'sine', false, i * 0.09);
      } else if (r < 0.5) { // whale song — long, slow, mournful glides
        this.sfx(210, 140, 2.8, 0.1, 'sine', true);
        this.sfx(320, 230, 2.2, 0.06, 'sine', true, 0.7);
      } else if (r < 0.58) { // dolphin whistles & clicks
        this.sfx(1150, 2300, 0.22, 0.055);
        this.sfx(2300, 1650, 0.18, 0.04, 'sine', false, 0.24);
        this.sfx(2600, 2400, 0.05, 0.03, 'sine', false, 0.5);
      } else if (r < 0.64) this.rustle(0.03); // a wave washing closer
    } else {
      // Forest — animals lead, all day and all night
      if (phase === 'night') {
        if (r < 0.55) for (let i = 0; i < 5; i++) this.sfx(4250, 4150, 0.045, 0.042, 'sine', false, i * 0.075); // cricket chorus
        else if (r < 0.64) { this.sfx(335, 295, 0.3, 0.14); this.sfx(335, 285, 0.36, 0.11, 'sine', false, 0.4); } // owl hoo-hoo
        else if (r < 0.72) this.sfx(155, 105, 0.17, 0.08, 'triangle'); // frogs by the waterhole
        else if (r < 0.8) this.rustle(0.03);
      } else if (phase === 'dusk') {
        if (r < 0.45) for (let i = 0; i < 4; i++) this.sfx(4250, 4150, 0.045, 0.034, 'sine', false, i * 0.075);
        else if (r < 0.68) this.birdsong();
        else if (r < 0.76) this.rustle(0.035);
      } else {
        if (r < 0.55) this.birdsong();
        else if (r < 0.64) for (let i = 0; i < 4; i++) this.sfx(4300, 4200, 0.04, 0.02, 'sine', false, i * 0.07); // daytime insects
        else if (r < 0.74) this.rustle(0.04);
        else if (r < 0.8) for (let i = 0; i < 6; i++) this.sfx(1250, 830, 0.045, 0.045, 'sine', false, i * 0.064); // woodpecker
      }
    }
  }

  private birdsong(): void {
    const base = 2050 + Math.random() * 1250;
    const notes = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      this.sfx(base + Math.random() * 450, base * (0.84 + Math.random() * 0.18), 0.11, 0.095, 'sine', false, i * 0.13);
    }
  }

  private playChord(): void {
    if (!this.ctx || !this.padFilter) return;
    const ctx = this.ctx;
    const theme = this.themeService.theme();
    const night = this.themeService.phase() === 'night';
    const chords = this.chords(theme);
    const notes = chords[this.chordIndex % chords.length];
    this.chordIndex++;
    const octaveShift = theme === 'underground' ? -12 : night ? -12 : 0;
    const now = ctx.currentTime;

    // Fade the previous chord out, then release its oscillators.
    const old = this.padNodes;
    this.padNodes = [];
    for (const osc of old) {
      try { osc.stop(now + 2.6); } catch { /* already stopped */ }
    }

    // Filter breathes slowly; darker at night / underground.
    this.padFilter.frequency.cancelScheduledValues(now);
    this.padFilter.frequency.linearRampToValueAtTime(
      theme === 'underground' ? 520 : night ? 750 : 1250, now + 3);

    // Background music level — roughly half the nature level, by design.
    const level = theme === 'underground' ? 0.013 : night ? 0.016 : 0.02;
    for (const note of notes) {
      for (const detune of [-4, 4]) { // two gently detuned voices per note = warmth
        const osc = ctx.createOscillator();
        osc.type = theme === 'underground' ? 'sine' : 'triangle';
        osc.frequency.value = midi(note + octaveShift);
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(level, now + 2.4); // slow bloom in
        // …and bloom back out just before the next chord arrives
        g.gain.setValueAtTime(level, now + 6.4);
        g.gain.linearRampToValueAtTime(0, now + 9.2);
        osc.connect(g).connect(this.padFilter);
        osc.start(now);
        osc.stop(now + 9.4);
        this.padNodes.push(osc);
      }
    }
  }

  private stopPad(fade = 0.4): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const osc of this.padNodes) {
      try { osc.stop(now + fade); } catch { /* noop */ }
    }
    this.padNodes = [];
  }

  /** One soft, piano-like melodic note (sine + quiet harmonic), with a long tail. */
  private maybePluck(): void {
    if (!this.ctx || !this.master || !this.enabled()) return;
    const theme = this.themeService.theme();
    const phase = this.themeService.phase();
    // Rest often — music breathes. Night and the Mine rest the most.
    const restChance = phase === 'night' ? 0.7 : theme === 'underground' ? 0.65 : 0.55;
    if (Math.random() < restChance) return;

    const scale = this.scale(theme);
    const note = scale[Math.floor(Math.random() * scale.length)];
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = theme === 'underground' ? 0.024 : 0.03;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midi(note);
    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = midi(note) * 2;
    const gain = ctx.createGain();
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.25;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
    // A whisper of echo so the note floats instead of stopping dead.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain(); feedback.gain.value = 0.22;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    osc.connect(gain); harmonic.connect(harmGain).connect(gain);
    gain.connect(this.master);
    gain.connect(delay); delay.connect(feedback).connect(delay); delay.connect(wet).connect(this.master);
    osc.start(t); harmonic.start(t);
    osc.stop(t + 2.8); harmonic.stop(t + 2.8);
  }
}

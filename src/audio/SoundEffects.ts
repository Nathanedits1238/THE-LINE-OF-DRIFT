/**
 * Procedural Web Audio Engine for Outlaw Velocity: Police Pursuit 3D
 * All audio is synthesized via Web Audio API oscillators, noise generators, and filters.
 * Zero external asset or 404 dependencies.
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean = false;

  // Engine sound nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineRunning: boolean = false;

  // Drift sound nodes
  private driftNoiseGain: GainNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;

  // Nitro sound nodes
  private nitroNoiseGain: GainNode | null = null;
  private nitroOsc: OscillatorNode | null = null;

  // Siren sound nodes
  private sirenOsc: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPlaying: boolean = false;

  // Pre-allocated noise buffer for zero GC audio
  private sharedNoiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Initialized on user interaction to comply with browser autoplay policies
  }

  private initContext() {
    if (this.ctx) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Pre-allocate 2 seconds of white noise once
    const bufferSize = this.ctx.sampleRate * 2;
    this.sharedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.sharedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.setupEngineSynth();
    this.setupDriftSynth();
    this.setupNitroSynth();
    this.setupSirenSynth();
  }

  public ensureRunning() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : 0.7,
        this.ctx.currentTime
      );
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // Engine synthesizer
  private setupEngineSynth() {
    if (!this.ctx || !this.masterGain) return;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(450, this.ctx.currentTime);

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineRunning = true;
  }

  // Drift / Tire screech synthesizer (White noise + bandpass filter)
  private setupDriftSynth() {
    if (!this.ctx || !this.masterGain || !this.sharedNoiseBuffer) return;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.sharedNoiseBuffer;
    whiteNoise.loop = true;

    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    this.driftFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.driftNoiseGain = this.ctx.createGain();
    this.driftNoiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

    whiteNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftNoiseGain);
    this.driftNoiseGain.connect(this.masterGain);

    whiteNoise.start();
  }

  // Nitro boost sound
  private setupNitroSynth() {
    if (!this.ctx || !this.masterGain || !this.sharedNoiseBuffer) return;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.sharedNoiseBuffer;
    whiteNoise.loop = true;

    const nitroFilter = this.ctx.createBiquadFilter();
    nitroFilter.type = 'highpass';
    nitroFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

    this.nitroNoiseGain = this.ctx.createGain();
    this.nitroNoiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.nitroOsc = this.ctx.createOscillator();
    this.nitroOsc.type = 'sine';
    this.nitroOsc.frequency.setValueAtTime(180, this.ctx.currentTime);

    whiteNoise.connect(nitroFilter);
    nitroFilter.connect(this.nitroNoiseGain);
    this.nitroNoiseGain.connect(this.masterGain);

    whiteNoise.start();
    this.nitroOsc.start();
  }

  // Police Siren Synthesizer
  private setupSirenSynth() {
    if (!this.ctx || !this.masterGain) return;

    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.setValueAtTime(750, this.ctx.currentTime);

    // LFO to modulate siren frequency (yelp vs wail)
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'triangle';
    this.sirenLfo.frequency.setValueAtTime(1.8, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(280, this.ctx.currentTime);

    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);

    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);

    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /**
   * Updates dynamic continuous audio parameters per frame.
   * @param speedKmh Current vehicle speed
   * @param rpm 0.0 to 1.0 (engine rev level)
   * @param driftSlip 0.0 to 1.0 (lateral tire slip)
   * @param nitroActive boolean
   * @param policeHeat 0 to 5
   * @param nearestCopDistance distance in meters to nearest cop
   */
  public updateContinuousAudio(
    speedKmh: number,
    rpm: number,
    driftSlip: number,
    nitroActive: boolean,
    policeHeat: number,
    nearestCopDistance: number
  ) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    // 1. Engine
    if (this.engineGain && this.engineOsc1 && this.engineOsc2 && this.engineFilter) {
      const targetGain = 0.08 + Math.min(speedKmh / 280, 0.25) * 0.5;
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);

      const baseFreq = 45 + rpm * 140;
      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.04);

      const filterFreq = 300 + rpm * 2200;
      this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.05);
    }

    // 2. Drift / Tire Screech
    if (this.driftNoiseGain && this.driftFilter) {
      const driftIntensity = Math.max(0, Math.min(driftSlip, 1));
      const targetDriftGain = driftIntensity > 0.15 ? driftIntensity * 0.4 : 0;
      this.driftNoiseGain.gain.setTargetAtTime(targetDriftGain, now, 0.04);
      this.driftFilter.frequency.setTargetAtTime(
        900 + driftIntensity * 600,
        now,
        0.05
      );
    }

    // 3. Nitro
    if (this.nitroNoiseGain) {
      const nitroTarget = nitroActive ? 0.35 : 0;
      this.nitroNoiseGain.gain.setTargetAtTime(nitroTarget, now, 0.05);
    }

    // 4. Police Siren
    if (this.sirenGain && this.sirenLfo) {
      if (policeHeat > 0 && nearestCopDistance < 150) {
        // Distance falloff (closer = louder)
        const distFactor = Math.max(0, 1 - nearestCopDistance / 150);
        const sirenVol = (0.05 + 0.3 * distFactor) * (policeHeat >= 3 ? 1.2 : 0.8);
        this.sirenGain.gain.setTargetAtTime(sirenVol, now, 0.1);

        // Heat 3+ has faster yelp siren
        const lfoSpeed = policeHeat >= 3 ? 3.5 : 1.6;
        this.sirenLfo.frequency.setTargetAtTime(lfoSpeed, now, 0.1);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, now, 0.2);
      }
    }
  }

  // Crash / Metal Collision sound
  public playCollisionSound(intensity: number = 0.5) {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140 * (1 + intensity), now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.6, 0.15 + intensity * 0.45);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.32);

    // Noise burst for crunch
    this.playNoiseBurst(0.2, vol * 0.7);
  }

  private playNoiseBurst(duration: number, volume: number) {
    if (!this.ctx || !this.masterGain || !this.sharedNoiseBuffer) return;
    const now = this.ctx.currentTime;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.sharedNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(now);
  }

  // Police Radio Beep / Chatter sound
  public playPoliceRadioChirp() {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.setValueAtTime(2200, now + 0.04);
    osc.frequency.setValueAtTime(1600, now + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // UI / Gameplay Jingles
  public playCountdownBeep(highPitch: boolean = false) {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(highPitch ? 880 : 440, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (highPitch ? 0.35 : 0.18));

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playSuccessFanfare() {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const now = this.ctx!.currentTime + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  public playBustedSound() {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.95);
  }

  public playWrenchToolSound() {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    // Rachet / wrench click impact
    for (let i = 0; i < 3; i++) {
      const clickTime = now + i * 0.06;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1400 + i * 200, clickTime);
      osc.frequency.exponentialRampToValueAtTime(300, clickTime + 0.03);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(clickTime);
      osc.stop(clickTime + 0.05);
    }
  }

  public playShowroomRevSound() {
    if (!this.ctx || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    // V8 Engine Revving burst in showroom
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';

    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.5);
    osc.frequency.exponentialRampToValueAtTime(90, now + 1.2);

    osc2.frequency.setValueAtTime(120, now);
    osc2.frequency.exponentialRampToValueAtTime(480, now + 0.5);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 1.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.5);
    filter.frequency.exponentialRampToValueAtTime(500, now + 1.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.35);
    osc2.stop(now + 1.35);
  }

  public stopAll() {
    if (this.engineGain) this.engineGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    if (this.sirenGain) this.sirenGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    if (this.driftNoiseGain) this.driftNoiseGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    if (this.nitroNoiseGain) this.nitroNoiseGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
  }
}

export const sound = new SoundEngine();

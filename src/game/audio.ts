/* Procedural WebAudio engine: SFX synth + generative soundtrack.
   Menu/pause = a rotating set of calm ambient "scenes" (chord pads +
   pings through a delay). Combat = a driving 128 BPM groove whose
   intensity scales with the wave number. */

export interface Volumes {
  master: number;
  sfx: number;
  music: number;
}

const LS_KEY = "rift9_volumes";

function loadVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Volumes>;
      return {
        master: clamp01(p.master ?? 0.8),
        sfx: clamp01(p.sfx ?? 0.8),
        music: clamp01(p.music ?? 0.55),
      };
    }
  } catch {
    /* ignore */
  }
  return { master: 0.8, sfx: 0.8, music: 0.55 };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

const BASS_SEMI = [0, 0, 3, 0, 5, 0, 3, 2];
const ARP_SCALE = [220, 261.63, 329.63, 392, 440, 523.25];

/* Ambient scenes: each a chord + filter mood + ping scale. */
interface AmbientScene {
  freqs: [number, number, number];
  filter: number;
  lfoRate: number;
  lfoAmt: number;
  gain: number;
  scale: number[];
}

const SCENES: AmbientScene[] = [
  {
    freqs: [55, 82.5, 110],
    filter: 420,
    lfoRate: 0.07,
    lfoAmt: 150,
    gain: 0.08,
    scale: [220, 261.63, 329.63, 440, 523.25],
  },
  {
    freqs: [43.65, 65.41, 87.31],
    filter: 340,
    lfoRate: 0.05,
    lfoAmt: 120,
    gain: 0.085,
    scale: [174.61, 220, 261.63, 349.23, 440],
  },
  {
    freqs: [41.2, 61.74, 82.41],
    filter: 300,
    lfoRate: 0.045,
    lfoAmt: 100,
    gain: 0.078,
    scale: [164.81, 196, 246.94, 329.63, 392],
  },
  {
    freqs: [36.71, 55, 73.42],
    filter: 380,
    lfoRate: 0.09,
    lfoAmt: 170,
    gain: 0.082,
    scale: [146.83, 174.61, 220, 293.66, 349.23],
  },
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private delaySend: GainNode | null = null;

  vols: Volumes = loadVolumes();

  private musicTimer: number | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padNodes: OscillatorNode[] = [];
  private padMid: OscillatorNode | null = null;
  private padMidGain: GainNode | null = null;
  private padLfo: OscillatorNode | null = null;
  private padLfoAmt: GainNode | null = null;
  private step = 0;
  private ambientTick = 0;
  private sceneIdx = 0;
  private shootAcc = 0;

  /* combat groove */
  private combat = false;
  private combatLvl = 0;
  private combatGain: GainNode | null = null;
  private combatTimer: number | null = null;
  private combatStep = 0;
  private combatPadNodes: OscillatorNode[] = [];
  private ctxSuspended = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);

    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.musicBus);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 1;
    this.delaySend.connect(delay);

    this.applyVolumes();
    void ctx.resume();
  }

  setVolumes(v: Volumes) {
    this.vols = {
      master: clamp01(v.master),
      sfx: clamp01(v.sfx),
      music: clamp01(v.music),
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.vols));
    } catch {
      /* ignore */
    }
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vols.music * 0.9, t, 0.1);
  }

  setSuspended(s: boolean) {
    this.ctxSuspended = s;
    if (!this.ctx) return;
    if (s) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** True once the context exists and is actually producing sound. */
  isRunning() {
    return !!this.ctx && this.ctx.state === "running";
  }

  /* ---------------- synth helpers ---------------- */

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    when = 0,
    bus: "sfx" | "music" = "sfx"
  ) {
    if (!this.ctx || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus === "sfx" ? this.sfxBus : this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(
    dur: number,
    vol: number,
    f0: number,
    f1: number,
    when = 0,
    q = 0.8
  ) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private ping(freq: number, when: number, vol: number) {
    if (!this.ctx || !this.musicBus || !this.delaySend) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + 1.6);
  }

  private musicTone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number
  ) {
    if (!this.ctx || !this.combatGain) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.combatGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private musicNoise(dur: number, vol: number, f0: number, f1: number) {
    if (!this.ctx || !this.combatGain) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.combatGain);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  /* ---------------- SFX ---------------- */

  uiMove() {
    this.tone("square", 520, 700, 0.05, 0.05);
  }
  uiClick() {
    this.tone("square", 340, 900, 0.09, 0.09);
    this.tone("sine", 1200, 1800, 0.05, 0.04);
  }
  uiBack() {
    this.tone("square", 700, 320, 0.08, 0.07);
  }

  shoot() {
    this.shootAcc++;
    const odd = this.shootAcc % 2 === 0;
    this.tone("square", odd ? 950 : 870, 240, 0.05, 0.045);
    this.tone("sawtooth", 1600, 500, 0.03, 0.02);
  }
  enemyShoot() {
    this.tone("sawtooth", 420, 160, 0.07, 0.035);
  }
  heavyShoot() {
    this.tone("sawtooth", 190, 60, 0.16, 0.07);
    this.noise(0.1, 0.04, 1200, 300);
  }
  explode(size = 1) {
    this.noise(0.4 * size, Math.min(0.28, 0.16 * size), 1500, 90, 0, 0.7);
    this.tone("sawtooth", 150 * size, 38, 0.35 * size, Math.min(0.24, 0.16 * size));
    this.tone("sine", 90, 30, 0.3 * size, 0.1 * size);
  }
  playerHit() {
    this.tone("sawtooth", 170, 55, 0.2, 0.16);
    this.noise(0.16, 0.12, 2400, 300);
  }
  shieldTick() {
    this.tone("sine", 1500, 900, 0.04, 0.03);
  }

  riftOpen() {
    this.tone("sawtooth", 70, 660, 0.55, 0.1);
    this.tone("sine", 1350, 2400, 0.4, 0.03, 0.1);
    this.noise(0.5, 0.05, 400, 3200, 0, 2);
  }
  riftClose() {
    this.tone("sawtooth", 620, 70, 0.4, 0.09);
    this.noise(0.3, 0.04, 2600, 300, 0, 1.4);
  }
  riftSpawn() {
    this.tone("square", 500 + Math.random() * 300, 900, 0.06, 0.035);
  }

  tick() {
    this.tone("sine", 840, 840, 0.06, 0.09);
  }
  go() {
    this.tone("sine", 1240, 1240, 0.16, 0.13);
    this.tone("sine", 620, 620, 0.24, 0.08, 0.02);
  }
  waveClear() {
    this.tone("triangle", 523, 523, 0.12, 0.1);
    this.tone("triangle", 659, 659, 0.12, 0.1, 0.11);
    this.tone("triangle", 784, 784, 0.2, 0.11, 0.22);
    this.tone("triangle", 1046, 1046, 0.3, 0.09, 0.34);
  }
  upgrade() {
    this.tone("square", 400, 800, 0.08, 0.07);
    this.tone("square", 600, 1200, 0.08, 0.07, 0.08);
    this.tone("square", 800, 1600, 0.14, 0.08, 0.16);
  }
  gameOver() {
    this.tone("sawtooth", 320, 60, 0.9, 0.14);
    this.tone("sawtooth", 240, 50, 1.1, 0.12, 0.18);
    this.noise(0.9, 0.1, 900, 80, 0, 0.5);
  }
  comboUp(mult: number) {
    this.tone("sine", 700 + mult * 120, 900 + mult * 120, 0.06, 0.045);
  }

  /* pickups */
  pickupHeal() {
    this.tone("triangle", 520, 520, 0.08, 0.08);
    this.tone("triangle", 784, 784, 0.1, 0.08, 0.07);
    this.tone("triangle", 1046, 1046, 0.14, 0.07, 0.14);
  }
  pickupRate() {
    this.tone("square", 620, 1500, 0.07, 0.06);
    this.tone("square", 900, 1900, 0.07, 0.05, 0.06);
  }
  pickupGun() {
    this.tone("sawtooth", 220, 440, 0.12, 0.1);
    this.tone("square", 880, 660, 0.1, 0.06, 0.05);
  }
  pickupDrone() {
    this.tone("sine", 700, 1150, 0.09, 0.07);
    this.tone("sine", 1150, 850, 0.12, 0.06, 0.09);
  }
  droneShot() {
    if (Math.random() < 0.5) this.tone("square", 1500, 900, 0.04, 0.018);
  }
  droneHit() {
    this.tone("square", 720, 320, 0.06, 0.045);
  }

  /* ---------------- generative music ---------------- */

  startMusic() {
    if (!this.ctx || !this.musicBus || this.musicTimer !== null) return;
    const ctx = this.ctx;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.Q.value = 1.1;

    this.applyScene(this.sceneIdx, 1.2);

    const scale = SCENES[this.sceneIdx].scale;
    this.step = 0;
    this.ambientTick = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.ctxSuspended || this.ctx.state !== "running") return;
      this.step++;
      this.ambientTick++;

      // rotate to the next ambient scene every ~40s, morphing smoothly
      if (this.ambientTick % 80 === 0 && !this.combat) {
        this.sceneIdx = (this.sceneIdx + 1) % SCENES.length;
        this.applyScene(this.sceneIdx, 4.5);
      }

      const sc = SCENES[this.sceneIdx];
      if (this.step % 2 === 0 && Math.random() < 0.5) {
        const f = sc.scale[Math.floor(Math.random() * sc.scale.length)];
        this.ping(f * (Math.random() < 0.3 ? 0.5 : 1), 0.05, 0.055);
      }
      if (this.step % 16 === 0) {
        const root = sc.freqs[0];
        this.ping(root * 2 * (Math.random() < 0.5 ? 1 : 1.5), 0.4, 0.06);
      }
    }, 430);
  }

  /** Crossfade the ambient pad to scene `idx` over `secs`. */
  private applyScene(idx: number, secs: number) {
    const ctx = this.ctx;
    if (!ctx || !this.padGain || !this.padFilter) return;
    const scene = SCENES[idx];
    const t = ctx.currentTime;

    this.padGain.gain.setTargetAtTime(scene.gain, t, secs / 3);
    this.padFilter.frequency.setTargetAtTime(scene.filter, t, secs / 3);

    // (re)build oscillators if the chord changed
    if (this.padNodes.length === 0) {
      this.padNodes = scene.freqs.map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? "triangle" : "sawtooth";
        o.frequency.value = f;
        o.connect(this.padFilter!);
        o.start();
        return o;
      });

      // audible mid voice two octaves above the root
      const mid = ctx.createOscillator();
      mid.type = "triangle";
      mid.frequency.value = scene.freqs[0] * 4;
      this.padMidGain = ctx.createGain();
      this.padMidGain.gain.value = 0.42;
      mid.connect(this.padMidGain);
      this.padMidGain.connect(this.padFilter);
      mid.start();
      this.padMid = mid;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = scene.lfoRate;
      this.padLfoAmt = ctx.createGain();
      this.padLfoAmt.gain.value = scene.lfoAmt;
      lfo.connect(this.padLfoAmt);
      this.padLfoAmt.connect(this.padFilter.frequency);
      lfo.start();
      this.padLfo = lfo;

      this.padFilter.connect(this.padGain);
      this.padGain.connect(this.musicBus!);
    } else {
      // morph existing oscillators to the new chord
      this.padNodes.forEach((o, i) => {
        o.frequency.setTargetAtTime(scene.freqs[i], t, secs / 3);
      });
      if (this.padMid) {
        this.padMid.frequency.setTargetAtTime(scene.freqs[0] * 4, t, secs / 3);
      }
      if (this.padLfo) this.padLfo.frequency.setTargetAtTime(scene.lfoRate, t, secs / 3);
      if (this.padLfoAmt) this.padLfoAmt.gain.setTargetAtTime(scene.lfoAmt, t, secs / 3);
    }
  }

  stopMusic() {
    this.setCombat(false);
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.padGain) {
      this.padGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
    }
    const nodes = [...this.padNodes];
    if (this.padLfo) nodes.push(this.padLfo);
    if (this.padMid) nodes.push(this.padMid);
    this.padNodes = [];
    this.padLfo = null;
    this.padLfoAmt = null;
    this.padMid = null;
    this.padMidGain = null;
    if (this.ctx) {
      const stopAt = this.ctx.currentTime + 1.6;
      nodes.forEach((n) => {
        try {
          n.stop(stopAt);
        } catch {
          /* ignore */
        }
      });
    }
    this.padGain = null;
    this.padFilter = null;
  }

  /** Scale combat groove intensity with the wave (0 at wave 1 → 1 at 13+). */
  setCombatWave(wave: number) {
    this.combatLvl = Math.max(0, Math.min(1, (wave - 1) / 12));
  }

  /** Crossfade into/out of the driving combat groove. */
  setCombat(on: boolean) {
    if (on === this.combat || !this.ctx || !this.musicBus) return;
    this.combat = on;
    const ctx = this.ctx;

    if (this.padGain && this.padFilter) {
      const scene = SCENES[this.sceneIdx];
      this.padFilter.frequency.setTargetAtTime(on ? scene.filter * 2.4 : scene.filter, ctx.currentTime, 0.5);
      this.padGain.gain.setTargetAtTime(on ? scene.gain * 0.35 : scene.gain, ctx.currentTime, 0.5);
    }

    if (on) {
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(1.0, ctx.currentTime, 0.35);
      g.connect(this.musicBus);
      this.combatGain = g;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100 + this.combatLvl * 800;
      lp.Q.value = 0.8;
      lp.connect(g);
      const padG = ctx.createGain();
      padG.gain.value = 0.0001;
      padG.gain.setTargetAtTime(0.06, ctx.currentTime, 0.8);
      padG.connect(lp);
      this.combatPadNodes = [220, 261.63, 329.63].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f * (1 + (i - 1) * 0.004);
        o.connect(padG);
        o.start();
        return o;
      });

      this.combatStep = 0;
      const SIXTEENTH = 60 / 128 / 4;
      this.combatTimer = window.setInterval(() => {
        if (!this.ctx || this.ctxSuspended || !this.combat || this.ctx.state !== "running") return;
        this.combatStep++;
        const s = this.combatStep;
        const bar = Math.floor(s / 16) % 2;
        const lvl = this.combatLvl;

        // bass
        if (s % 2 === 0) {
          const semi = BASS_SEMI[(s / 2 + bar * 4) % 8];
          const f = 55 * Math.pow(2, semi / 12);
          this.musicTone("sawtooth", f, f, 0.12, 0.2 + lvl * 0.06);
          if (lvl > 0.3 && s % 4 === 2) {
            this.musicTone("sawtooth", f * 2, f * 2, 0.07, 0.08 + lvl * 0.05);
          }
        }
        // kick — four on the floor
        if (s % 4 === 0) this.musicTone("sine", 160, 42, 0.13, 0.62 + lvl * 0.15);
        if (lvl > 0.5 && s % 16 === 14) this.musicTone("sine", 130, 45, 0.09, 0.4);
        // snare on 2 & 4
        if (s % 8 === 4) {
          this.musicNoise(0.09, 0.16 + lvl * 0.05, 2400, 500);
          this.musicTone("triangle", 210, 120, 0.08, 0.1);
        }
        if (lvl > 0.4 && s % 16 === 12) this.musicNoise(0.05, 0.08, 1800, 400);
        // hats
        if (s % 2 === 0) {
          this.musicNoise(0.03, s % 4 === 2 ? 0.085 : 0.055, 8000, 5000);
        }
        if (lvl > 0.25 && s % 2 === 1) {
          this.musicNoise(0.025, 0.04 + lvl * 0.035, 9000 + lvl * 2000, 6000);
        }
        // arp sparkle
        if (s % 16 === 0 || (lvl > 0.6 && s % 8 === 0)) {
          const n = ARP_SCALE[Math.floor(Math.random() * ARP_SCALE.length)];
          this.ping(n * 2, 0.02, 0.045);
        }
      }, SIXTEENTH * 1000);
    } else {
      if (this.combatTimer !== null) {
        clearInterval(this.combatTimer);
        this.combatTimer = null;
      }
      if (this.combatGain) {
        this.combatGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
      }
      const nodes = this.combatPadNodes;
      this.combatPadNodes = [];
      const stopAt = ctx.currentTime + 1.8;
      nodes.forEach((n) => {
        try {
          n.stop(stopAt);
        } catch {
          /* ignore */
        }
      });
      const g = this.combatGain;
      this.combatGain = null;
      if (g) {
        window.setTimeout(() => {
          try {
            g.disconnect();
          } catch {
            /* ignore */
          }
        }, 2200);
      }
    }
  }

  dispose() {
    this.stopMusic();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}

import type { AmbientMusic } from "./AmbientMusic";
import { BASS_SEMI, ARP_SCALE } from "./AmbientMusic";
import type { CombatTrackId } from "./tracks";
import { DEFAULT_COMBAT_TRACK } from "./tracks";

/**
 * Combat music engine.
 * Handles the driving combat grooves for all combat tracks.
 * Each track has its own BPM, bass line and percussion pattern;
 * intensity still scales with the wave number.
 */

/** Громкость отдельных слоёв трека. */
interface CombatLayerVol {
  bass: number;
  kick: number;
  snare: number;
  hat: number;
  lead: number;
}

/** Параметры боевого трека: темп, акценты, агрессивность. */
export interface CombatTrackDef {
  bpm: number;
  /** Включить/выключить отдельные элементы. */
  useKick: boolean;
  useSnare: boolean;
  useHats: boolean;
  useLead: boolean;
  /** Больше пустот = тяжелее/агрессивнее звук. */
  fill: number;
  vol: CombatLayerVol;
  /** Акцент (четверть) для басовой линии — 0..1*раз. */
  bassOctave: boolean;
}

export const COMBAT_TRACKS: Record<CombatTrackId, CombatTrackDef> = {
  rift: {
    bpm: 128,
    useKick: true,
    useSnare: true,
    useHats: true,
    useLead: true,
    fill: 0.18,
    vol: { bass: 0.12, kick: 0.62, snare: 0.16, hat: 0.055, lead: 0.05 },
    bassOctave: false,
  },
  vanguard: {
    bpm: 140,
    useKick: true,
    useSnare: true,
    useHats: true,
    useLead: false,
    fill: 0.22,
    vol: { bass: 0.13, kick: 0.66, snare: 0.15, hat: 0.05, lead: 0 },
    bassOctave: true,
  },
  onslaught: {
    bpm: 120,
    useKick: true,
    useSnare: true,
    useHats: false,
    useLead: true,
    fill: 0.28,
    vol: { bass: 0.14, kick: 0.7, snare: 0.18, hat: 0, lead: 0.055 },
    bassOctave: true,
  },
  overdrive: {
    bpm: 150,
    useKick: true,
    useSnare: false,
    useHats: true,
    useLead: false,
    fill: 0.14,
    vol: { bass: 0.12, kick: 0.72, snare: 0, hat: 0.065, lead: 0 },
    bassOctave: false,
  },
};

export class CombatMusic {
  private _combat = false;
  private combatLvl = 0;
  private combatGain: GainNode | null = null;
  private combatTimer: number | null = null;
  private combatStep = 0;
  private combatPadNodes: OscillatorNode[] = [];
  /** Временный гейн для превью трека в настройках. */
  private previewGain: GainNode | null = null;
  private previewTimer: number | null = null;
  /** Активный боевой трек (выбор пользователя). */
  private trackId: CombatTrackId = DEFAULT_COMBAT_TRACK;

  constructor(
    private ctx: AudioContext,
    private musicBus: GainNode,
    private _ambientMusic: AmbientMusic | null = null,
  ) {}

  get ambientMusic() { return this._ambientMusic!; }
  setAmbientMusic(ambientMusic: AmbientMusic) {
    this._ambientMusic = ambientMusic;
  }

  get combat() { return this._combat; }
  set combat(v: boolean) { this._combat = v; }

  /** Активный боевой трек. */
  getTrack(): CombatTrackId {
    return this.trackId;
  }

  /** Переключить боевой трек; работающий гроув пересобирается на лету. */
  setCombatTrack(id: CombatTrackId) {
    if (id === this.trackId) return;
    this.trackId = id;
    if (this.combat) {
      // Пересобрать гроув с новым темпом/паттерном.
      this.combat = false;
      this.stopCombat();
      this.setCombat(true);
    }
  }

  private get track(): CombatTrackDef {
    return COMBAT_TRACKS[this.trackId];
  }

  /** Scale combat groove intensity with the wave (0 at wave 1 → 1 at 13+). */
  setCombatWave(wave: number) {
    this.combatLvl = Math.max(0, Math.min(1, (wave - 1) / 12));
  }

  /** Короткое превью трека: несколько шагов гроува без смены состояния боя. */
  preview() {
    if (!this.ctx || !this.musicBus) return;
    this.stopPreview();
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.05);
    g.connect(this.musicBus);
    this.previewGain = g;

    const def = this.track;
    const vol = def.vol;
    const SIXTEENTH = 60 / def.bpm / 4;
    let s = 0;
    this.previewTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== "running") return;
      s++;
      const bar = Math.floor(s / 16) % 2;
      const lvl = 0.35;

      if (s % 2 === 0) {
        if (Math.random() >= def.fill * 0.5 || s % 8 === 0) {
          const semi = BASS_SEMI[Math.floor(s / 2 + bar * 4) % 8];
          const f = 55 * Math.pow(2, semi / 12);
          this.previewTone("sawtooth", f, f, 0.12, vol.bass + lvl * 0.06);
          if (def.bassOctave && s % 4 === 2) {
            this.previewTone("sawtooth", f * 2, f * 2, 0.07, vol.bass * 0.7 + lvl * 0.05);
          }
        }
      }
      if (def.useKick && s % 4 === 0) this.previewTone("sine", 160, 42, 0.13, vol.kick + lvl * 0.15);
      if (def.useSnare && s % 8 === 4) {
        this.previewNoise(0.09, vol.snare + lvl * 0.05, 2400, 500);
        this.previewTone("triangle", 210, 120, 0.08, 0.1);
      }
      if (def.useHats && s % 2 === 0) {
        this.previewNoise(0.03, s % 4 === 2 ? vol.hat * 1.5 : vol.hat, 8000, 5000);
      }
      if (def.useLead && s % 8 === 0) {
        const n = ARP_SCALE[Math.floor(Math.random() * ARP_SCALE.length)];
        this.previewTone("square", n * 2, n * 2, 0.09, vol.lead);
      }
      // ~2.4s: 4 bars at most bpm (150 ≈ 2.56s)
      if (s >= 32) this.stopPreview();
    }, SIXTEENTH * 1000);
  }

  private previewTone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    if (!this.ctx || !this.previewGain) return;
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
    g.connect(this.previewGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private previewNoise(dur: number, vol: number, f0: number, f1: number) {
    if (!this.ctx || !this.previewGain) return;
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
    g.connect(this.previewGain);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  private stopPreview() {
    if (this.previewTimer !== null) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.previewGain) {
      this.previewGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
      const g = this.previewGain;
      this.previewGain = null;
      window.setTimeout(() => {
        try {
          g.disconnect();
        } catch {
          /* ignore */
        }
      }, 700);
    }
  }

  /** Публичный вызов stopPreview для AudioEngine.dispose. */
  stopPreviewPublic() {
    this.stopPreview();
  }

  /** Crossfade into/out of the driving combat groove. */
  setCombat(on: boolean) {
    if (on === this.combat || !this.ctx || !this.musicBus) return;
    /* safety: clean up any lingering combat resources before proceeding */
    if (on && this.combatTimer !== null) {
      clearInterval(this.combatTimer);
      this.combatTimer = null;
    }
    if (on && this.combatGain) {
      try { this.combatGain.disconnect(); } catch { /* already disconnected */ }
    }
    this.combat = on;
    const ctx = this.ctx;

    const padGain = this.ambientMusic.getPadGain();
    const padFilter = this.ambientMusic.getPadFilter();
    if (padGain && padFilter) {
      const scene = this.ambientMusic.getScene();
      padFilter.frequency.setTargetAtTime(on ? scene.filter * 2.4 : scene.filter, ctx.currentTime, 0.5);
      padGain.gain.setTargetAtTime(on ? scene.gain * 0.35 : scene.gain, ctx.currentTime, 0.5);
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
      const SIXTEENTH = 60 / this.track.bpm / 4;
      this.combatTimer = window.setInterval(() => {
        if (!this.ctx || !this.combat || this.ctx.state !== "running") return;
        this.combatStep++;
        const s = this.combatStep;
        const bar = Math.floor(s / 16) % 2;
        const lvl = this.combatLvl;
        const def = this.track;
        const vol = def.vol;

        // bass — drive the groove
        if (s % 2 === 0) {
          if (Math.random() < def.fill * 0.5 && s % 8 !== 0) {
            // fill: occasional rest for a heavier feel
          } else {
            const semi = BASS_SEMI[Math.floor(s / 2 + bar * 4) % 8];
            const f = 55 * Math.pow(2, semi / 12);
            this.musicTone("sawtooth", f, f, 0.12, vol.bass + lvl * 0.06);
            if (def.bassOctave && (lvl > 0.3 || s % 4 === 2)) {
              this.musicTone("sawtooth", f * 2, f * 2, 0.07, vol.bass * 0.7 + lvl * 0.05);
            }
          }
        }
        // kick — four on the floor
        if (def.useKick && s % 4 === 0) this.musicTone("sine", 160, 42, 0.13, vol.kick + lvl * 0.15);
        if (def.useKick && lvl > 0.5 && s % 16 === 14) this.musicTone("sine", 130, 45, 0.09, vol.kick * 0.65);
        // snare on 2 & 4
        if (def.useSnare && s % 8 === 4) {
          this.musicNoise(0.09, vol.snare + lvl * 0.05, 2400, 500);
          this.musicTone("triangle", 210, 120, 0.08, 0.1);
        }
        if (def.useSnare && lvl > 0.4 && s % 16 === 12) this.musicNoise(0.05, vol.snare * 0.5, 1800, 400);
        // hats
        if (def.useHats && s % 2 === 0) {
          this.musicNoise(0.03, s % 4 === 2 ? vol.hat * 1.5 : vol.hat, 8000, 5000);
        }
        if (def.useHats && lvl > 0.25 && s % 2 === 1) {
          this.musicNoise(0.025, vol.hat * 0.7 + lvl * 0.035, 9000 + lvl * 2000, 6000);
        }
        // lead / arp sparkle
        if (def.useLead && (s % 16 === 0 || (lvl > 0.6 && s % 8 === 0))) {
          const n = ARP_SCALE[Math.floor(Math.random() * ARP_SCALE.length)];
          this.musicTone("square", n * 2, n * 2, 0.09, vol.lead * (1 + lvl));
        }
      }, SIXTEENTH * 1000);
    } else {
      this.stopCombat();
    }
  }

  private stopCombat() {
    if (this.combatTimer !== null) {
      clearInterval(this.combatTimer);
      this.combatTimer = null;
    }
    if (this.combatGain) {
      this.combatGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.5);
    }
    const nodes = this.combatPadNodes;
    this.combatPadNodes = [];
    const stopAt = this.ctx.currentTime + 1.8;
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
}
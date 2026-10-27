/**
 * AmbientMusic — процедурная генеративная музыка меню.
 *
 * Архитектура:
 * - MENU_TRACKS: карта меню-треков; каждый трек — набор сцен
 *   (аккордовые пэды, фильтр, LFO, громкость) плюс параметры мелодии.
 * - BASS_SEMI: полутоновые смещения для басовой линии
 * - ARP_SCALE: пентатоника для арпеджио
 *
 * Музыка эволюционирует за счёт плавного морфинга между сценами,
 * секвенсора пингов и пэда-аккомпанемента.
 */

import type { MenuTrackId } from "./tracks";
import { DEFAULT_MENU_TRACK } from "./tracks";

export interface AmbientScene {
  freqs: [number, number, number];
  filter: number;
  lfoRate: number;
  lfoAmt: number;
  gain: number;
  scale: number[];
}

export const BASS_SEMI = [0, 0, 3, 0, 5, 0, 3, 2];
export const ARP_SCALE = [220, 261.63, 329.63, 392, 440, 523.25];

/** Базовая эмбиент-сцена ("Туманность") — фоновая заливка. */
const SCENE_PAD: AmbientScene[] = [
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
];

/** Тёплая, умеренная сцена ("Солнце"). */
const SCENE_SOLAR: AmbientScene[] = [
  {
    freqs: [61.74, 92.5, 123.47],
    filter: 560,
    lfoRate: 0.08,
    lfoAmt: 140,
    gain: 0.075,
    scale: [246.94, 293.66, 369.99, 493.88, 587.33],
  },
  {
    freqs: [55, 82.5, 110],
    filter: 500,
    lfoRate: 0.06,
    lfoAmt: 120,
    gain: 0.08,
    scale: [220, 277.18, 329.63, 440, 554.37],
  },
  {
    freqs: [65.41, 98, 130.81],
    filter: 620,
    lfoRate: 0.09,
    lfoAmt: 160,
    gain: 0.072,
    scale: [261.63, 329.63, 392, 523.25, 659.25],
  },
];

/** Яркая, "полярная" сцена ("Аврора"). */
const SCENE_AURORA: AmbientScene[] = [
  {
    freqs: [46.25, 69.3, 92.5],
    filter: 720,
    lfoRate: 0.11,
    lfoAmt: 200,
    gain: 0.07,
    scale: [185, 233.08, 277.18, 369.99, 466.16],
  },
  {
    freqs: [55, 82.5, 110],
    filter: 660,
    lfoRate: 0.1,
    lfoAmt: 180,
    gain: 0.075,
    scale: [220, 261.63, 329.63, 415.3, 523.25],
  },
  {
    freqs: [41.2, 61.74, 82.41],
    filter: 580,
    lfoRate: 0.08,
    lfoAmt: 150,
    gain: 0.068,
    scale: [164.81, 207.65, 246.94, 329.63, 415.3],
  },
];

/** Карта меню-треков: набор сцен + параметры мелодии. */
export interface MenuTrackDef {
  scenes: AmbientScene[];
  /** Громкость мелодических пингов. */
  pingVol: number;
  /** Шанс мелодического пинга на 2-м шаге. */
  pingChance: number;
  /** Максимальная громкость басового пинга. */
  bassVol: number;
}

export const MENU_TRACKS: Record<MenuTrackId, MenuTrackDef> = {
  nebula: {
    scenes: SCENE_PAD,
    pingVol: 0.055,
    pingChance: 0.5,
    bassVol: 0.06,
  },
  solar: {
    scenes: SCENE_SOLAR,
    pingVol: 0.05,
    pingChance: 0.65,
    bassVol: 0.055,
  },
  aurora: {
    scenes: SCENE_AURORA,
    pingVol: 0.06,
    pingChance: 0.45,
    bassVol: 0.06,
  },
};

/** Сцены — обратная совместимость (базовый набор, nebula). */
export const SCENES: AmbientScene[] = SCENE_PAD;

/**
 * Ambient/generative music engine.
 * Handles rotating ambient scenes with chord pads, LFO modulation, and delay ping.
 */
export class AmbientMusic {
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
  /** Активный меню-трек (выбор пользователя). */
  private trackId: MenuTrackId = DEFAULT_MENU_TRACK;

  constructor(
    private ctx: AudioContext,
    private musicBus: GainNode,
    private delaySend: GainNode,
    private onCombatOff: () => void,
    private isCombat: () => boolean,
    private onSuspended: () => boolean,
  ) {}

  /** Активный трек меню. */
  getTrack(): MenuTrackId {
    return this.trackId;
  }

  /** Играет ли сейчас музыка меню (пэд живой). */
  isPlaying(): boolean {
    return this.musicTimer !== null;
  }

  /** Переключить меню-трек (мгновенно кроссфейдит пэд, если музыка уже играет). */
  setMenuTrack(id: MenuTrackId) {
    if (id === this.trackId) return;
    this.trackId = id;
    this.sceneIdx = 0;
    if (this.musicTimer !== null && this.padGain) {
      this.applyScene(0, 2.5);
    }
  }

  private get track(): MenuTrackDef {
    return MENU_TRACKS[this.trackId];
  }

  startMusic() {
    if (!this.ctx || !this.musicBus || this.musicTimer !== null) return;
    const ctx = this.ctx;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.Q.value = 1.1;

    this.applyScene(this.sceneIdx, 1.2);

    this.step = 0;
    this.ambientTick = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.isCombat() || this.onSuspended() || this.ctx.state !== "running") return;
      this.step++;
      this.ambientTick++;

      const scenes = this.track.scenes;
      // rotate to the next ambient scene every ~40s, morphing smoothly
      if (this.ambientTick % 80 === 0) {
        this.sceneIdx = (this.sceneIdx + 1) % scenes.length;
        this.applyScene(this.sceneIdx, 4.5);
      }

      const sc = scenes[this.sceneIdx];
      if (this.step % 2 === 0 && Math.random() < this.track.pingChance) {
        const f = sc.scale[Math.floor(Math.random() * sc.scale.length)];
        this.ping(f * (Math.random() < 0.3 ? 0.5 : 1), 0.05, this.track.pingVol);
      }
      if (this.step % 16 === 0) {
        const root = sc.freqs[0];
        this.ping(root * 2 * (Math.random() < 0.5 ? 1 : 1.5), 0.4, this.track.bassVol);
      }
    }, 430);
  }

  /** Crossfade the ambient pad to scene `idx` over `secs`. */
  private applyScene(idx: number, secs: number) {
    const ctx = this.ctx;
    if (!ctx || !this.padGain || !this.padFilter) return;
    const scene = this.track.scenes[idx];
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
    this.onCombatOff();
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

  /** Called by CombatMusic for arp sparkle during combat. */
  ping(freq: number, when: number, vol: number) {
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

  // Getters for CombatMusic crossfade access
  getPadGain(): GainNode | null { return this.padGain; }
  getPadFilter(): BiquadFilterNode | null { return this.padFilter; }
  getScene(): AmbientScene { return this.track.scenes[this.sceneIdx]; }
}
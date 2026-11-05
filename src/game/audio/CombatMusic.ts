import type { AmbientMusic } from "./AmbientMusic";
import type { CombatTrackId } from "./tracks";
import { DEFAULT_COMBAT_TRACK } from "./tracks";
import { midiToHz, chordTones, chordVoicing, type ChordSpec } from "./musicTheory";
import { playNoise, playTone } from "./musicSynth";
import { StepScheduler } from "./StepScheduler";

/**
 * Боевая музыка: четыре разных грува с гармонической прогрессией.
 *
 * Каждый трек — 4 аккорда, свой басовый рисунок, арпеджио, лид и рисунок
 * ударных. Внутри 8-тактовой секции бас и арпеджио меняются (A/B), на границе
 * секций звучит райзер и краткий брейк, в конце 4-тактовых фраз — филл.
 * Интенсивность растёт с волной: добавляются слои, а не только громкость.
 */

export interface CombatTrackDef {
  bpm: number;
  /** Четыре аккорда секции A — по одному на такт. */
  progression: ChordSpec[];
  /** Четыре аккорда секции B: гармония меняется каждые 8 тактов. */
  progressionB: ChordSpec[];
  /** 16 шагов: x — корень, o — октава, f — квинта, . — пауза. */
  bassA: string;
  bassB: string;
  bassTone: OscillatorType;
  bassCutoff: number;
  /** 16 шагов, индекс тона аккорда (0 — корень, 1 — терция, ...). */
  arpA: (number | null)[];
  arpB: (number | null)[];
  arpTone: OscillatorType;
  /** Разреженный лид; вступает во второй половине 8-тактовой секции. */
  lead: (number | null)[];
  leadTone: OscillatorType;
  kick: string;
  snare: string;
  hat: string;
  openHat: boolean;
  accent: "clap" | "tom" | "none";
}

export const COMBAT_TRACKS: Record<CombatTrackId, CombatTrackDef> = {
  // Тёмный darksynth: редкие акценты, широкий бас, злой лид.
  rift: {
    bpm: 132,
    progression: [
      { root: 38, quality: "min" }, // Dm
      { root: 34, quality: "maj" }, // Bb
      { root: 41, quality: "maj" }, // F
      { root: 36, quality: "maj" }, // C
    ],
    progressionB: [
      { root: 38, quality: "min" }, // Dm
      { root: 41, quality: "maj" }, // F
      { root: 36, quality: "maj" }, // C
      { root: 43, quality: "min" }, // Gm
    ],
    bassA: "x..x..x.x..x..x.",
    bassB: "x.x..x.xx..x.x..",
    bassTone: "sawtooth",
    bassCutoff: 380,
    arpA: [0, null, 2, null, 1, null, 3, null, 2, null, 0, null, 1, null, 2, null],
    arpB: [2, null, 3, 2, null, 1, null, 0, 1, null, 2, 3, null, 2, null, 1],
    arpTone: "square",
    lead: [0, null, null, null, null, null, 2, null, null, null, 1, null, null, null, null, null],
    leadTone: "triangle",
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    openHat: true,
    accent: "clap",
  },
  // Быстрый галоп: плотный бас, пружинистые ударные, больше движения.
  vanguard: {
    bpm: 146,
    progression: [
      { root: 40, quality: "min" }, // Em
      { root: 36, quality: "maj" }, // C
      { root: 43, quality: "maj" }, // G
      { root: 38, quality: "maj" }, // D
    ],
    progressionB: [
      { root: 40, quality: "min" }, // Em
      { root: 43, quality: "maj" }, // G
      { root: 38, quality: "maj" }, // D
      { root: 45, quality: "min" }, // Am
    ],
    bassA: "x.xx..x.x.xx..x.",
    bassB: "x.xxx.x.x.xxx.x.",
    bassTone: "square",
    bassCutoff: 620,
    arpA: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 3, 2, 1, 2, 3],
    arpB: [2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1, 0, 2, 1, 2],
    arpTone: "sawtooth",
    lead: [null, null, 2, null, null, null, null, null, 1, null, null, null, 3, null, null, null],
    leadTone: "square",
    kick: "x...x..x.x..x...",
    snare: "....x.......x...",
    hat: "x.x.x.x.x.x.x.x.",
    openHat: false,
    accent: "tom",
  },
  // Тяжёлый полутемп: удары в пол, минимум суеты, максимум веса.
  onslaught: {
    bpm: 124,
    progression: [
      { root: 36, quality: "min" }, // Cm
      { root: 32, quality: "maj" }, // Ab
      { root: 39, quality: "maj" }, // Eb
      { root: 34, quality: "maj" }, // Bb
    ],
    progressionB: [
      { root: 36, quality: "min" }, // Cm
      { root: 34, quality: "maj" }, // Bb
      { root: 32, quality: "maj" }, // Ab
      { root: 39, quality: "maj" }, // Eb
    ],
    bassA: "x.......x...x...",
    bassB: "x...x.......x...",
    bassTone: "sawtooth",
    bassCutoff: 240,
    arpA: [0, null, null, null, 2, null, null, null, 1, null, null, null, null, null, null, null],
    arpB: [2, null, null, null, 1, null, null, null, 0, null, null, 2, null, null, null, null],
    arpTone: "triangle",
    lead: [null, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null],
    leadTone: "sawtooth",
    kick: "x.......x.......",
    snare: "........x.......",
    hat: "..x...x...x...x.",
    openHat: true,
    accent: "tom",
  },
  // Скоростной трек: 16-е, ломаный кик, яркое арпеджио.
  overdrive: {
    bpm: 158,
    progression: [
      { root: 42, quality: "min" }, // F#m
      { root: 38, quality: "maj" }, // D
      { root: 45, quality: "maj" }, // A
      { root: 40, quality: "maj" }, // E
    ],
    progressionB: [
      { root: 42, quality: "min" }, // F#m
      { root: 45, quality: "maj" }, // A
      { root: 40, quality: "maj" }, // E
      { root: 47, quality: "min" }, // Bm
    ],
    bassA: "x.x.x.xxx.x.x.x.",
    bassB: "x.x.xxx.x.x.xxx.",
    bassTone: "sawtooth",
    bassCutoff: 900,
    arpA: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 3, 2],
    arpB: [3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 2],
    arpTone: "square",
    lead: [0, null, null, 2, null, null, 3, null, null, 1, null, null, 2, null, null, null],
    leadTone: "sine",
    kick: "x.....x...x.....",
    snare: "....x.......x...",
    hat: "xxxxxxxxxxxxxxxx",
    openHat: false,
    accent: "clap",
  },
};

export class CombatMusic {
  private combatState = false;
  private combatLvl = 0;
  /** Новый уровень волны: на ближайшем сильном такте сыграем акцент. */
  private waveLift = false;

  private gain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padOsc: OscillatorNode[] = [];
  private scheduler: StepScheduler | null = null;

  private previewGain: GainNode | null = null;
  private previewScheduler: StepScheduler | null = null;

  private trackId: CombatTrackId = DEFAULT_COMBAT_TRACK;

  constructor(
    private readonly ctx: AudioContext,
    private readonly musicBus: GainNode,
    private readonly delaySend: GainNode | null = null,
    private ambientMusic: AmbientMusic | null = null,
  ) {}

  get combat(): boolean {
    return this.combatState;
  }

  setAmbientMusic(ambientMusic: AmbientMusic): void {
    this.ambientMusic = ambientMusic;
  }

  getTrack(): CombatTrackId {
    return this.trackId;
  }

  /** Сменить боевой трек; живой грув пересобирается на лету. */
  setCombatTrack(id: CombatTrackId): void {
    if (id === this.trackId) return;
    this.trackId = id;
    this.stopPreview();
    if (this.combatState) {
      this.stopGroove();
      this.startGroove();
    }
  }

  private get track(): CombatTrackDef {
    return COMBAT_TRACKS[this.trackId];
  }

  /** Уровень интенсивности 0..1; смена волны даёт акцент, но не меняет трек. */
  setCombatWave(wave: number): void {
    this.combatLvl = clamp01((wave - 1) / 12);
    if (this.combatState) this.waveLift = true;
  }

  /**
   * Включить/выключить бой. Повторный вызов при уже играющем груве — это
   * новая волна, поэтому ставим акцент и не перезапускаем музыку.
   */
  setCombat(on: boolean): void {
    if (!this.ctx || !this.musicBus) return;
    if (on === this.combatState) {
      if (on) this.waveLift = true;
      return;
    }
    this.combatState = on;
    if (on) this.startGroove();
    else this.stopGroove();
  }

  private startGroove(): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.03;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(1, now, 0.22);
    gain.connect(this.musicBus);
    this.gain = gain;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.padCutoff();
    filter.Q.value = 0.9;
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, now);
    padGain.gain.setTargetAtTime(0.055, now, 0.5);
    filter.connect(padGain);
    padGain.connect(gain);
    this.padFilter = filter;
    this.padGain = padGain;

    const chord = this.track.progression[0]!;
    const padNotes = padVoicing(chord);
    const waves: OscillatorType[] = ["sine", "sawtooth", "sawtooth", "triangle"];
    this.padOsc = padNotes.map((midi, index) => {
      const osc = ctx.createOscillator();
      osc.type = waves[index] ?? "sawtooth";
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = (index - 1.5) * 4;
      osc.connect(filter);
      osc.start(now);
      return osc;
    });
    this.morphPad(chord, now);

    this.scheduler = new StepScheduler(
      ctx,
      60 / this.track.bpm / 4,
      (step, when) => {
        if (this.gain) this.scheduleStep(step, when, this.gain, true);
      },
    );
    this.scheduler.start();
    this.ambientMusic?.setDucked(true);
    this.playImpact(now, gain, 0.45);
  }

  private stopGroove(): void {
    this.scheduler?.stop();
    this.scheduler = null;
    const ctx = this.ctx;
    const gain = this.gain;
    this.gain = null;
    const padOsc = this.padOsc;
    this.padOsc = [];
    this.padGain = null;
    this.padFilter = null;
    this.ambientMusic?.setDucked(false);

    if (!gain || !ctx) return;
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    const stopAt = ctx.currentTime + 1.4;
    padOsc.forEach((osc) => {
      try {
        osc.stop(stopAt);
      } catch {
        /* уже остановлен */
      }
    });
    window.setTimeout(() => {
      try {
        gain.disconnect();
      } catch {
        /* уже отключён */
      }
    }, 1800);
  }

  /** Короткое превью трека в настройках: два такта без пэда и смены боя. */
  preview(): void {
    if (!this.ctx || !this.musicBus) return;
    this.stopPreview();
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.04);
    gain.connect(this.musicBus);
    this.previewGain = gain;

    this.previewScheduler = new StepScheduler(
      ctx,
      60 / this.track.bpm / 4,
      (step, when) => {
        if (step >= 32) {
          this.stopPreview();
          return;
        }
        this.scheduleStep(step, when, gain, false);
      },
    );
    this.previewScheduler.start();
  }

  private stopPreview(): void {
    this.previewScheduler?.stop();
    this.previewScheduler = null;
    const gain = this.previewGain;
    this.previewGain = null;
    if (!gain) return;
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
    window.setTimeout(() => {
      try {
        gain.disconnect();
      } catch {
        /* уже отключён */
      }
    }, 700);
  }

  /** Публичная остановка превью для AudioEngine.dispose. */
  stopPreviewPublic(): void {
    this.stopPreview();
  }

  /**
   * Один шаг аранжировки. `live` включает пэд, реакцию на волну и брейки;
   * превью играет только ритмические слои.
   */
  private scheduleStep(step: number, when: number, out: GainNode, live: boolean): void {
    const def = this.track;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const lvl = live ? this.combatLvl : 0.55;
    const section = Math.floor(bar / 8) % 2;
    const progression = section === 0 ? def.progression : def.progressionB;
    const chord = progression[bar % progression.length]!;
    const phraseBar = bar % 4;
    const fill = phraseBar === 3 && s >= 12;
    const breakdown = live && bar % 8 === 7 && s >= 8;

    if (live && s === 0) {
      this.morphPad(chord, when);
      if (bar % 8 === 0) this.playCrash(when, out, lvl);
      if (bar % 8 === 7) this.playRiser(when, 16 * (60 / def.bpm / 4), out);
      if (this.waveLift) {
        this.waveLift = false;
        this.playImpact(when, out, 0.55 + lvl * 0.25);
        this.playCrash(when, out, lvl + 0.2);
      }
    }

    if (breakdown) return;

    // Бас: рисунок меняется между A и B секциями.
    const bassPattern = section === 0 ? def.bassA : def.bassB;
    const bassSymbol = bassPattern[s];
    if (bassSymbol === "x" || bassSymbol === "o" || bassSymbol === "f") {
      const offset = bassSymbol === "x" ? 0 : bassSymbol === "o" ? 12 : 7;
      const midi = chord.root + offset;
      playTone(this.ctx, out, when, {
        type: def.bassTone,
        freq: midiToHz(midi),
        dur: 0.11,
        gain: 0.115,
        filter: {
          type: "lowpass",
          freq: def.bassCutoff + lvl * 320,
          q: 1.5,
        },
      });
      playTone(this.ctx, out, when, {
        type: "sine",
        freq: midiToHz(midi),
        dur: 0.13,
        gain: 0.05,
      });
    }

    // Бочка + редкий призвук на высокой интенсивности.
    if (def.kick[s] === "x") this.playKick(when, out, 0.62);
    if (lvl > 0.45 && s === 14 && phraseBar !== 3) this.playKick(when, out, 0.25);
    if (fill && s >= 12) this.playKick(when + 0.01, out, 0.3);

    // Снейр и филл.
    if (def.snare[s] === "x") this.playSnare(when, out, 0.14);
    if (fill) {
      const progress = (s - 12) / 4;
      this.playSnare(when, out, 0.05 + progress * 0.09);
    }
    if (lvl > 0.5 && s === 7) this.playSnare(when, out, 0.04);
    if (def.accent === "clap" && lvl > 0.35 && s === 12 && bar % 4 === 1) {
      this.playClap(when, out, 0.07);
    }
    if (def.accent === "tom" && fill) this.playTom(when, out, 0.06 + (s - 12) * 0.012);

    // Хэты: 8-е всегда, 16-е и открытый — по интенсивности.
    if (def.hat[s] === "x") this.playHat(when, out, 0.028, false);
    if (lvl > 0.3 && s % 2 === 1) this.playHat(when, out, 0.015 + lvl * 0.01, false);
    if (def.openHat && s === 6 && lvl > 0.2) this.playHat(when, out, 0.035, true);

    // Арпеджио: во второй секции уходит на октаву выше.
    const arpPattern = section === 0 ? def.arpA : def.arpB;
    const degree = arpPattern[s];
    if (degree !== null && degree !== undefined) {
      const tones = chordVoicing(chord, 1, 4);
      const midi = (tones[degree % tones.length] ?? chord.root + 12) + (section === 1 ? 12 : 0);
      playTone(this.ctx, out, when, {
        type: def.arpTone,
        freq: midiToHz(midi),
        dur: 0.07,
        gain: 0.028 + lvl * 0.012,
        pan: s % 2 === 0 ? -0.18 : 0.18,
        send: this.delaySend ? { node: this.delaySend, amount: 0.16 } : undefined,
      });
    }

    // Лид вступает только во второй половине 8-тактовой секции.
    const leadDegree = def.lead[s];
    const leadActive = live ? lvl > 0.2 && bar % 8 >= 4 : bar >= 1;
    if (leadActive && leadDegree !== null && leadDegree !== undefined) {
      const tones = chordVoicing(chord, 2, 4);
      const midi = tones[leadDegree % tones.length] ?? chord.root + 24;
      playTone(this.ctx, out, when, {
        type: def.leadTone,
        freq: midiToHz(midi),
        dur: 0.24,
        gain: 0.032,
        pan: 0.22,
        filter: { type: "lowpass", freq: 2600, q: 0.6 },
        send: this.delaySend ? { node: this.delaySend, amount: 0.28 } : undefined,
      });
    }
  }

  private morphPad(chord: ChordSpec, when: number): void {
    const notes = padVoicing(chord);
    this.padOsc.forEach((osc, index) => {
      const midi = notes[index];
      if (midi === undefined) return;
      osc.frequency.setTargetAtTime(midiToHz(midi), when, 0.35);
    });
    this.padFilter?.frequency.setTargetAtTime(this.padCutoff(), when, 0.8);
  }

  private padCutoff(): number {
    return 620 + this.combatLvl * 1100;
  }

  private playKick(when: number, out: GainNode, gain: number): void {
    playTone(this.ctx, out, when, {
      type: "sine",
      freq: 160,
      endFreq: 44,
      dur: 0.14,
      gain,
      attack: 0.002,
    });
    playNoise(this.ctx, out, when, {
      dur: 0.014,
      gain: gain * 0.12,
      freq: 2200,
      filterType: "highpass",
      q: 0.7,
    });
  }

  private playSnare(when: number, out: GainNode, gain: number): void {
    playNoise(this.ctx, out, when, {
      dur: 0.12,
      gain,
      freq: 1900,
      endFreq: 900,
      q: 0.9,
    });
    playTone(this.ctx, out, when, {
      type: "triangle",
      freq: 190,
      endFreq: 120,
      dur: 0.08,
      gain: gain * 0.45,
    });
  }

  private playClap(when: number, out: GainNode, gain: number): void {
    for (let i = 0; i < 2; i++) {
      playNoise(this.ctx, out, when + i * 0.012, {
        dur: 0.055,
        gain: gain * (i === 0 ? 1 : 0.7),
        freq: 1500,
        q: 1.1,
      });
    }
  }

  private playTom(when: number, out: GainNode, gain: number): void {
    playTone(this.ctx, out, when, {
      type: "triangle",
      freq: 180,
      endFreq: 110,
      dur: 0.1,
      gain,
    });
  }

  private playHat(when: number, out: GainNode, gain: number, open: boolean): void {
    playNoise(this.ctx, out, when, {
      dur: open ? 0.13 : 0.028,
      gain,
      freq: 7800,
      endFreq: open ? 6200 : 9000,
      filterType: "highpass",
      q: 0.8,
      pan: open ? 0.25 : -0.15,
    });
  }

  private playCrash(when: number, out: GainNode, level: number): void {
    playNoise(this.ctx, out, when, {
      dur: 1.05,
      gain: 0.02 + level * 0.012,
      attack: 0.005,
      freq: 5200,
      endFreq: 3600,
      filterType: "highpass",
      q: 0.6,
      pan: 0.2,
    });
  }

  private playImpact(when: number, out: GainNode, amount: number): void {
    playTone(this.ctx, out, when, {
      type: "sine",
      freq: 105,
      endFreq: 32,
      dur: 0.42,
      gain: 0.32 * amount,
      attack: 0.002,
    });
    playNoise(this.ctx, out, when, {
      dur: 0.3,
      gain: 0.09 * amount,
      freq: 500,
      endFreq: 80,
      filterType: "lowpass",
      q: 0.9,
    });
  }

  private playRiser(when: number, dur: number, out: GainNode): void {
    playNoise(this.ctx, out, when, {
      dur,
      gain: 0.032,
      attack: dur * 0.82,
      freq: 320,
      endFreq: 5200,
      q: 1.4,
      pan: -0.1,
    });
  }
}

/** Пэд: низкий корень, октава, терция и квинта в верхнем регистре. */
function padVoicing(chord: ChordSpec): number[] {
  const tones = chordTones(chord);
  return [tones[0]!, tones[0]! + 12, tones[1]! + 24, tones[2]! + 24];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

import type { MenuTrackId } from "./tracks";
import { DEFAULT_MENU_TRACK } from "./tracks";
import { chordTones, midiToHz, type ChordSpec } from "./musicTheory";
import { playTone } from "./musicSynth";
import { StepScheduler } from "./StepScheduler";

/**
 * Эмбиент меню: медленные аккордовые прогрессии, редкая мелодия и суб-бас.
 *
 * Каждый трек — свой лад, четыре аккорда и две мелодические фразы. Внутри
 * цикла фразы чередуются, пэд плавно перетекает между аккордами, а колокольчик
 * и дилей дают пространство. Никакой случайной ротации треков: выбранный
 * игроком трек остаётся активным.
 */

interface MenuTrackDef {
  /** Четыре аккорда; каждый звучит 16 шагов (два такта). */
  progression: ChordSpec[];
  /** MIDI-корень мелодии. */
  key: number;
  /** Лад мелодии в полутонах от `key`. */
  scale: number[];
  /** Две 32-шаговые фразы: цифра — ступень лада, точка — пауза. */
  phrases: [string, string];
  padGain: number;
  padFilter: number;
  padLfoRate: number;
  padLfoAmt: number;
  melodyWave: OscillatorType;
  melodyGain: number;
  bassGain: number;
  bellGain: number;
}

const MENU_TRACKS: Record<MenuTrackId, MenuTrackDef> = {
  // Тёмная, разреженная «Туманность»: минорная пентатоника, низкий пэд.
  nebula: {
    progression: [
      { root: 38, quality: "min" }, // Dm
      { root: 34, quality: "maj" }, // Bb
      { root: 41, quality: "maj" }, // F
      { root: 36, quality: "maj" }, // C
    ],
    key: 50,
    scale: [0, 3, 5, 7, 10],
    phrases: [
      "....0.......2.......1.......3...",
      "..2.....1.......0.......2...3...",
    ],
    padGain: 0.052,
    padFilter: 430,
    padLfoRate: 0.032,
    padLfoAmt: 85,
    melodyWave: "sine",
    melodyGain: 0.038,
    bassGain: 0.03,
    bellGain: 0.018,
  },
  // Тёплое «Солнце»: мажорная пентатоника, более заметная мелодия.
  solar: {
    progression: [
      { root: 48, quality: "maj" }, // C
      { root: 45, quality: "min" }, // Am
      { root: 41, quality: "maj" }, // F
      { root: 43, quality: "sus2" }, // Gsus2
    ],
    key: 48,
    scale: [0, 2, 4, 7, 9],
    phrases: [
      "..0.....2.......4.......2.......",
      "....1.......3.......2.......0...",
    ],
    padGain: 0.046,
    padFilter: 560,
    padLfoRate: 0.045,
    padLfoAmt: 120,
    melodyWave: "triangle",
    melodyGain: 0.034,
    bassGain: 0.026,
    bellGain: 0.02,
  },
  // Воздушная «Аврора»: высокий пэд, септимы и редкие колокольчики.
  aurora: {
    progression: [
      { root: 45, quality: "min" }, // Am
      { root: 41, quality: "maj7" }, // Fmaj7
      { root: 48, quality: "maj" }, // C
      { root: 43, quality: "sus2" }, // Gsus2
    ],
    key: 45,
    scale: [0, 3, 5, 7, 10],
    phrases: [
      "......2...0.......3...1.......0.",
      "..1.....3.......0...2.......1...",
    ],
    padGain: 0.042,
    padFilter: 760,
    padLfoRate: 0.055,
    padLfoAmt: 150,
    melodyWave: "sine",
    melodyGain: 0.033,
    bassGain: 0.022,
    bellGain: 0.024,
  },
};

const STEP_SEC = 0.46;

export class AmbientMusic {
  private scheduler: StepScheduler | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padOsc: OscillatorNode[] = [];
  private padLfo: OscillatorNode | null = null;
  private padLfoAmt: GainNode | null = null;
  private tremolo: OscillatorNode | null = null;
  private tremoloAmt: GainNode | null = null;
  private basePadGain = 0.05;
  private ducked = false;
  private trackId: MenuTrackId = DEFAULT_MENU_TRACK;

  constructor(
    private readonly ctx: AudioContext,
    private readonly musicBus: GainNode,
    private readonly delaySend: GainNode,
    private readonly isCombat: () => boolean,
    private readonly onSuspended: () => boolean,
  ) {}

  getTrack(): MenuTrackId {
    return this.trackId;
  }

  isPlaying(): boolean {
    return this.scheduler !== null;
  }

  /** Сменить меню-трек; пэд плавно перестраивается, фраза начинается заново. */
  setMenuTrack(id: MenuTrackId): void {
    if (id === this.trackId) return;
    this.trackId = id;
    if (!this.scheduler) return;
    this.restartScheduler();
    this.applyTrackParams(2.4);
    this.morphPad(this.track.progression[0]!, this.ctx.currentTime, 2.4);
  }

  private get track(): MenuTrackDef {
    return MENU_TRACKS[this.trackId];
  }

  startMusic(): void {
    if (!this.ctx || !this.musicBus || this.scheduler) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.03;

    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, now);
    padGain.gain.setTargetAtTime(this.track.padGain, now, 0.8);
    padGain.connect(this.musicBus);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.track.padFilter;
    filter.Q.value = 1.1;
    filter.connect(padGain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = this.track.padLfoRate;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = this.track.padLfoAmt;
    lfo.connect(lfoAmt);
    lfoAmt.connect(filter.frequency);
    lfo.start(now);

    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 0.047;
    const tremoloAmt = ctx.createGain();
    tremoloAmt.gain.value = this.track.padGain * 0.22;
    tremolo.connect(tremoloAmt);
    tremoloAmt.connect(padGain.gain);
    tremolo.start(now);

    const chord = this.track.progression[0]!;
    const notes = padVoicing(chord);
    const waves: OscillatorType[] = ["sine", "sawtooth", "triangle", "sawtooth"];
    const padOsc = notes.map((midi, index) => {
      const osc = ctx.createOscillator();
      osc.type = waves[index] ?? "sawtooth";
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = (index - 1.5) * 3;
      osc.connect(filter);
      osc.start(now);
      return osc;
    });

    this.padGain = padGain;
    this.padFilter = filter;
    this.padLfo = lfo;
    this.padLfoAmt = lfoAmt;
    this.tremolo = tremolo;
    this.tremoloAmt = tremoloAmt;
    this.padOsc = padOsc;
    this.basePadGain = this.track.padGain;
    this.applyDuck();
    this.restartScheduler();
  }

  stopMusic(): void {
    this.scheduler?.stop();
    this.scheduler = null;
    const ctx = this.ctx;
    const padGain = this.padGain;
    const nodes = [...this.padOsc];
    if (this.padLfo) nodes.push(this.padLfo);
    if (this.tremolo) nodes.push(this.tremolo);
    this.padGain = null;
    this.padFilter = null;
    this.padLfo = null;
    this.padLfoAmt = null;
    this.tremolo = null;
    this.tremoloAmt = null;
    this.padOsc = [];
    if (!ctx || !padGain) return;
    padGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35);
    const stopAt = ctx.currentTime + 1.5;
    nodes.forEach((node) => {
      try {
        node.stop(stopAt);
      } catch {
        /* уже остановлен */
      }
    });
    window.setTimeout(() => {
      try {
        padGain.disconnect();
      } catch {
        /* уже отключён */
      }
    }, 1900);
  }

  /** Приглушить пэд на время боя, не останавливая мелодию/аккорды. */
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyDuck();
  }

  private applyDuck(): void {
    if (!this.padGain) return;
    this.basePadGain = this.track.padGain;
    const target = this.ducked ? this.basePadGain * 0.18 : this.basePadGain;
    this.padGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.45);
  }

  private applyTrackParams(secs: number): void {
    const ctx = this.ctx;
    const def = this.track;
    this.basePadGain = def.padGain;
    if (this.padGain) {
      this.padGain.gain.setTargetAtTime(
        this.ducked ? def.padGain * 0.18 : def.padGain,
        ctx.currentTime,
        secs / 3,
      );
    }
    this.padFilter?.frequency.setTargetAtTime(def.padFilter, ctx.currentTime, secs / 3);
    this.padLfo?.frequency.setTargetAtTime(def.padLfoRate, ctx.currentTime, secs / 3);
    this.padLfoAmt?.gain.setTargetAtTime(def.padLfoAmt, ctx.currentTime, secs / 3);
    this.tremoloAmt?.gain.setTargetAtTime(def.padGain * 0.22, ctx.currentTime, secs / 3);
  }

  private restartScheduler(): void {
    this.scheduler?.stop();
    this.scheduler = new StepScheduler(this.ctx, STEP_SEC, (step, when) => {
      this.scheduleStep(step, when);
    });
    this.scheduler.start();
  }

  private morphPad(chord: ChordSpec, when: number, secs: number): void {
    const notes = padVoicing(chord);
    this.padOsc.forEach((osc, index) => {
      const midi = notes[index];
      if (midi === undefined) return;
      osc.frequency.setTargetAtTime(midiToHz(midi), when, Math.max(0.2, secs / 3));
    });
  }

  private scheduleStep(step: number, when: number): void {
    if (this.onSuspended() || this.isCombat() || this.ctx.state !== "running") return;
    const def = this.track;
    const stepInBar = step % 16;
    const chordIndex = Math.floor(step / 16) % def.progression.length;
    const chord = def.progression[chordIndex]!;

    if (stepInBar === 0) {
      this.morphPad(chord, when, 1.8);
      this.playBass(chord, when);
      // Колокольчик на смене аккорда; на первом аккорде цикла — выше и тише.
      if (chordIndex % 2 === 0) {
        const tone = chordTones(chord)[2] ?? chord.root + 7;
        this.playBell(tone + (chordIndex === 0 ? 24 : 12), when, def.bellGain);
      }
    }

    const phraseIndex = Math.floor(step / 32) % 2;
    const phrase = def.phrases[phraseIndex]!;
    const symbol = phrase[step % 32];
    if (symbol !== undefined && symbol !== ".") {
      const degree = Number(symbol);
      if (Number.isFinite(degree)) {
        this.playMelody(degree, phraseIndex === 1 ? 1 : 0, when);
      }
    }

    // Редкий форшлаг добавляет жизни, но не превращает музыку в случайные ноты.
    if (step % 32 === 24 && Math.random() < 0.35) {
      const degree = Math.floor(Math.random() * def.scale.length);
      this.playMelody(degree, 2, when + 0.12, 0.45);
    }
  }

  private playMelody(degree: number, octave: number, when: number, gainScale = 1): void {
    const def = this.track;
    const offset = def.scale[degree];
    if (offset === undefined) return;
    const midi = def.key + offset + 12 + octave * 12;
    playTone(this.ctx, this.musicBus, when, {
      type: def.melodyWave,
      freq: midiToHz(midi),
      dur: 1.7,
      gain: def.melodyGain * gainScale,
      attack: 0.02,
      pan: degree % 2 === 0 ? -0.2 : 0.2,
      filter: { type: "lowpass", freq: 2300, q: 0.5 },
      send: { node: this.delaySend, amount: 0.45 },
    });
  }

  private playBass(chord: ChordSpec, when: number): void {
    playTone(this.ctx, this.musicBus, when, {
      type: "sine",
      freq: midiToHz(chord.root),
      dur: 3.4,
      gain: this.track.bassGain,
      attack: 0.08,
      filter: { type: "lowpass", freq: 220, q: 0.8 },
    });
  }

  private playBell(midi: number, when: number, gain: number): void {
    playTone(this.ctx, this.musicBus, when, {
      type: "sine",
      freq: midiToHz(midi),
      dur: 2.8,
      gain,
      attack: 0.01,
      pan: 0.3,
      send: { node: this.delaySend, amount: 0.7 },
    });
  }
}

/** Пэд: низкий корень, октава, терция и квинта. */
function padVoicing(chord: ChordSpec): number[] {
  const tones = chordTones(chord);
  return [tones[0]!, tones[0]! + 12, tones[1]! + 24, tones[2]! + 24];
}

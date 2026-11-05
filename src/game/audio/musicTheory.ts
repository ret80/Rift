/**
 * Общая музыкальная теория для процедурного саундтрека.
 *
 * Аккорды задаются MIDI-корнем и качеством; все частоты считаются из MIDI,
 * чтобы транспозиция и голосоведение не зависели от таблиц частот.
 */

export type ChordQuality = "min" | "maj" | "min7" | "maj7" | "sus2" | "dim";

const INTERVALS: Record<ChordQuality, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
};

/** Аккорд: корень в MIDI-нотах (60 = C4) и качество. */
export interface ChordSpec {
  root: number;
  quality: ChordQuality;
}

/** Частота MIDI-ноты в равномерной темперации. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** То́ны аккорда в MIDI; `octave` сдвигает весь аккорд на октавы. */
export function chordTones(chord: ChordSpec, octave = 0): number[] {
  return INTERVALS[chord.quality].map((interval) => chord.root + interval + octave * 12);
}

/**
 * Четырёхголосное изложение аккорда: недостающие голоса заполняются
 * корнем сверху, чтобы арпеджио всегда имело стабильный диапазон.
 */
export function chordVoicing(chord: ChordSpec, octave = 0, voices = 4): number[] {
  const tones = chordTones(chord, octave);
  const result = tones.slice(0, voices);
  while (result.length < voices) result.push(chord.root + 12 + octave * 12);
  return result;
}

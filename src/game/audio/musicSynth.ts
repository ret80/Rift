/**
 * Небольшие синтезаторные примитивы для музыки.
 *
 * Все ноты планируются на абсолютное время AudioContext (`when`), поэтому
 * ритм не зависит от джиттера setInterval. Буфер шума кешируется на контекст.
 */

const NOISE_SECONDS = 2;
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** Опции тонального голоса. */
export interface ToneOptions {
  type?: OscillatorType;
  /** Начальная частота, Гц. */
  freq: number;
  /** Конечная частота для глиссандо/питч-дропа. */
  endFreq?: number;
  dur: number;
  gain: number;
  attack?: number;
  filter?: {
    type?: BiquadFilterType;
    freq: number;
    endFreq?: number;
    q?: number;
  };
  /** Панорама -1..1. */
  pan?: number;
  detune?: number;
  /** Посыл в общий дилей музыки. */
  send?: { node: AudioNode; amount: number };
}

/** Опции шумового голоса (перкуссия, райзеры, краши). */
export interface NoiseOptions {
  dur: number;
  gain: number;
  freq: number;
  endFreq?: number;
  filterType?: BiquadFilterType;
  q?: number;
  attack?: number;
  pan?: number;
  send?: { node: AudioNode; amount: number };
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/** Спланировать тональный голос с огибающей и опциональным фильтром. */
export function playTone(ctx: AudioContext, out: AudioNode, when: number, options: ToneOptions) {
  const {
    type = "sine",
    freq,
    endFreq,
    dur,
    gain,
    attack = 0.005,
    filter,
    pan = 0,
    detune = 0,
    send,
  } = options;
  const start = Math.max(ctx.currentTime, when);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(Math.max(20, freq), start);
  if (endFreq !== undefined && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + dur);
  }

  const env = ctx.createGain();
  const peak = Math.max(0.0001, gain);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + Math.max(0.002, attack));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  let tail: AudioNode = env;
  if (filter) {
    const node = ctx.createBiquadFilter();
    node.type = filter.type ?? "lowpass";
    node.frequency.setValueAtTime(Math.max(40, filter.freq), start);
    if (filter.endFreq !== undefined) {
      node.frequency.exponentialRampToValueAtTime(
        Math.max(40, filter.endFreq),
        start + dur,
      );
    }
    node.Q.value = filter.q ?? 0.7;
    env.connect(node);
    tail = node;
  }

  if (pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    tail.connect(panner);
    tail = panner;
  }

  tail.connect(out);
  if (send) {
    const sendGain = ctx.createGain();
    sendGain.gain.value = send.amount;
    tail.connect(sendGain);
    sendGain.connect(send.node);
  }

  osc.connect(env);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Спланировать шумовой голос через фильтр. */
export function playNoise(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  options: NoiseOptions,
) {
  const {
    dur,
    gain,
    freq,
    endFreq,
    filterType = "bandpass",
    q = 0.8,
    attack = 0.002,
    pan = 0,
    send,
  } = options;
  const start = Math.max(ctx.currentTime, when);
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(Math.max(40, freq), start);
  if (endFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + dur);
  }
  filter.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + Math.max(0.002, attack));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  let tail: AudioNode = env;
  if (pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    tail.connect(panner);
    tail = panner;
  }

  source.connect(filter);
  filter.connect(env);
  tail.connect(out);
  if (send) {
    const sendGain = ctx.createGain();
    sendGain.gain.value = send.amount;
    tail.connect(sendGain);
    sendGain.connect(send.node);
  }

  source.start(start, Math.random() * Math.max(0, NOISE_SECONDS - dur));
  source.stop(start + dur + 0.05);
}

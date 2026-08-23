/**
 * SFX synthesis engine.
 * Handles all gameplay sound effects via WebAudio oscillators and noise buffers.
 */
export class SfxSynth {
  constructor(
    private ctx: AudioContext,
    private sfxBus: GainNode,
    private musicBus: GainNode,
    private delaySend: GainNode,
  ) {}

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    when = 0,
    bus: "sfx" | "music" = "sfx"
  ) {
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

  /* ---------------- UI SFX ---------------- */

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

  /* ---------------- combat SFX ---------------- */

  private shootAcc = 0;

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

  /* ---------------- rift SFX ---------------- */

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

  /* ---------------- status SFX ---------------- */

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

  /* ---------------- pickups ---------------- */

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
  pickupDash() {
    this.noise(0.16, 0.1, 3000, 500, 0, 1.2);
    this.tone("sawtooth", 300, 1700, 0.18, 0.1);
    this.tone("sine", 1400, 2100, 0.1, 0.05, 0.08);
  }
  dashRam() {
    this.tone("square", 220, 90, 0.07, 0.06);
  }
  minePlace() {
    this.tone("triangle", 500, 320, 0.08, 0.07);
    this.tone("triangle", 320, 240, 0.1, 0.06, 0.09);
  }
  mineArm() {
    this.tone("sine", 980, 980, 0.05, 0.04);
  }
  mineBoom() {
    this.noise(0.5, 0.3, 1800, 70, 0, 0.6);
    this.tone("sine", 120, 26, 0.4, 0.28);
    this.tone("sawtooth", 260, 50, 0.3, 0.12, 0.02);
  }
  droneShot() {
    if (Math.random() < 0.5) this.tone("square", 1500, 900, 0.04, 0.018);
  }
  droneHit() {
    this.tone("square", 720, 320, 0.06, 0.045);
  }
}

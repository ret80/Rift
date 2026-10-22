/* Procedural WebAudio engine: SFX synth + generative soundtrack.
   Menu/pause = a rotating set of calm ambient "scenes" (chord pads +
   pings through a delay). Combat = a driving 128 BPM groove whose
   intensity scales with the wave number. */

import { SfxSynth } from "./SfxSynth";
import { AmbientMusic } from "./AmbientMusic";
import { CombatMusic } from "./CombatMusic";

/** Уровни громкости (0..1) — источник правды в React-настройках (App). */
export interface Volumes {
  master: number;
  sfx: number;
  music: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private delaySend: GainNode | null = null;

  vols: Volumes = { master: 0.8, sfx: 0.8, music: 0.55 };

  private sfxSynth!: SfxSynth;
  private ambientMusic!: AmbientMusic;
  private combatMusic!: CombatMusic;

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

    // Wire up composited modules (combat needs ambient, ambient needs combat callbacks)
    this.combatMusic = new CombatMusic(ctx, this.musicBus);
    this.ambientMusic = new AmbientMusic(
      ctx,
      this.musicBus,
      this.delaySend!,
      () => this.combatMusic.setCombat(false),
      () => this.combatMusic.combat,
      () => this.ctxSuspended,
    );
    this.combatMusic.setAmbientMusic(this.ambientMusic);
    this.sfxSynth = new SfxSynth(ctx, this.sfxBus, this.musicBus!, this.delaySend!);

    this.applyVolumes();
    void ctx.resume();
  }

  setVolumes(v: Volumes) {
    this.vols = {
      master: clamp01(v.master),
      sfx: clamp01(v.sfx),
      music: clamp01(v.music),
    };
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

  /* ---------------- music ---------------- */

  startMusic() {
    this.ambientMusic.startMusic();
  }

  stopMusic() {
    this.ambientMusic.stopMusic();
  }

  setCombatWave(wave: number) {
    this.combatMusic.setCombatWave(wave);
  }

  setCombat(on: boolean) {
    this.combatMusic.setCombat(on);
  }

  /* ---------------- SFX delegation ---------------- */

  uiMove() { this.sfxSynth.uiMove(); }
  uiClick() { this.sfxSynth.uiClick(); }
  uiBack() { this.sfxSynth.uiBack(); }
  shoot() { this.sfxSynth.shoot(); }
  enemyShoot() { this.sfxSynth.enemyShoot(); }
  heavyShoot() { this.sfxSynth.heavyShoot(); }
  explode(size = 1) { this.sfxSynth.explode(size); }
  playerHit() { this.sfxSynth.playerHit(); }
  shieldTick() { this.sfxSynth.shieldTick(); }
  riftOpen() { this.sfxSynth.riftOpen(); }
  riftClose() { this.sfxSynth.riftClose(); }
  riftSpawn() { this.sfxSynth.riftSpawn(); }
  tick() { this.sfxSynth.tick(); }
  go() { this.sfxSynth.go(); }
  waveClear() { this.sfxSynth.waveClear(); }
  upgrade() { this.sfxSynth.upgrade(); }
  gameOver() { this.sfxSynth.gameOver(); }
  comboUp(mult: number) { this.sfxSynth.comboUp(mult); }
  pickupHeal() { this.sfxSynth.pickupHeal(); }
  pickupRate() { this.sfxSynth.pickupRate(); }
  pickupGun() { this.sfxSynth.pickupGun(); }
  pickupDrone() { this.sfxSynth.pickupDrone(); }
  pickupDash() { this.sfxSynth.pickupDash(); }
  dashRam() { this.sfxSynth.dashRam(); }
  droneShot() { this.sfxSynth.droneShot(); }
  droneHit() { this.sfxSynth.droneHit(); }

  /* ---------------- lifecycle ---------------- */

  dispose() {
    this.stopMusic();
    this.combatMusic.setCombat(false);
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }

  /** Alias for dispose */
  destroy() {
    this.dispose();
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

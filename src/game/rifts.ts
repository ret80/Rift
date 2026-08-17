/* Space rifts: tears in the zone that open, pour out enemies, then seal.
   Lifecycle: opening (0.6s) → spawning → closing (0.5s).
   Visuals: a point stretches into a line, then writhes open into the
   crack; closing plays the exact reverse. Each rift keeps a random
   orientation and a size matched to its biggest passenger. */

import type { Renderer } from "./render";
import type { AudioEngine } from "./audio";
import type { Fx } from "./fx";
import { TAU, rand, clamp, easeOutCubic, rgba } from "./math";
import { C, type EnemyKind } from "./balance";
import type { Rift } from "./types";

export { Rift };

export interface RiftHooks {
  spawnEnemy(kind: EnemyKind, x: number, y: number): void;
  fx: Fx;
  audio: AudioEngine;
}

export class RiftField {
  readonly list: Rift[] = [];

  constructor(private h: RiftHooks) {}

  /** Utility: draw a rift shape at the given position (used by menu scene). */
  static drawShape(
    R: Renderer,
    x: number,
    y: number,
    len: number,
    wid: number,
    seed: number,
    tt: number,
    alpha: number,
    rot: number,
    snake: number
  ) {
    this.drawShapeImpl(R, x, y, len, wid, seed, tt, alpha, rot, snake);
  }

  private static drawShapeImpl(
    R: Renderer,
    x: number,
    y: number,
    len: number,
    wid: number,
    seed: number,
    tt: number,
    alpha: number,
    rot: number,
    snake: number
  ) {
    const N = 12;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const X = (lx: number, ly: number): [number, number] => [
      x + lx * cosR - ly * sinR,
      y + lx * sinR + ly * cosR,
    ];

    const center: Array<[number, number]> = [];
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      const u = -len / 2 + len * s;
      const taper = Math.sin(Math.PI * s);
      const wob =
        (Math.sin(seed * 7.3 + s * 9.0 + tt * 4.4) * 0.6 +
          Math.sin(seed * 3.1 + s * 4.2 - tt * 2.7) * 0.4) *
        (5 + wid * 0.3) *
        snake *
        taper;
      const hw =
        wid * 0.5 * taper * (1 + 0.3 * Math.sin(s * 13.0 + seed * 5.0 + tt * 5.5) * Math.min(1, snake));
      center.push(X(wob, u));
      left.push(X(wob - hw, u));
      right.push(X(wob + hw, u));
    }

    if (wid <= 0.6) {
      R.polyline(center, false, rgba(C.riftCore, 0.95 * alpha));
      R.polyline(center, false, rgba(C.rift, 0.45 * alpha));
      R.circle(center[0][0], center[0][1], 3.2, rgba(C.riftCore, 0.85 * alpha), 10);
      R.circle(center[N][0], center[N][1], 3.2, rgba(C.riftCore, 0.85 * alpha), 10);
      return;
    }

    R.polyline(left, false, rgba(C.rift, 0.85 * alpha));
    R.polyline(right, false, rgba(C.rift, 0.85 * alpha));
    R.polyline(center, false, rgba(C.riftCore, 0.5 * alpha));
    for (let k = 2; k < N - 1; k += 2) {
      R.pushLine(left[k][0], left[k][1], right[k][0], right[k][1], rgba(C.riftCore, 0.22 * alpha));
    }
    R.circle(center[0][0], center[0][1], 4, rgba(C.riftCore, 0.6 * alpha), 12);
    R.circle(center[N][0], center[N][1], 4, rgba(C.riftCore, 0.6 * alpha), 12);
  }

  spawn(x: number, y: number, queue: EnemyKind[], delay: number, size: number) {
    this.list.push({
      x,
      y,
      t: -delay,
      state: "opening",
      queue,
      timer: 0.8,
      seed: Math.random() * 100,
      rot: Math.random() * TAU,
      size,
    });
    this.h.audio.riftOpen();
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const rf = this.list[i];
      rf.t += dt;
      if (rf.state === "opening") {
        if (rf.t >= 0.6) {
          rf.state = "spawning";
          rf.timer = 0.35;
        }
      } else if (rf.state === "spawning") {
        rf.timer -= dt;
        if (rf.timer <= 0 && rf.queue.length > 0) {
          rf.timer = 0.28;
          const kind = rf.queue.shift()!;
          this.h.spawnEnemy(kind, rf.x + rand(-14, 14), rf.y + rand(-14, 14));
          this.h.audio.riftSpawn();
          this.h.fx.burst(rf.x, rf.y, 5, C.rift, 140, 0.3);
        }
        // Only close if queue is truly empty and timer has expired
        if (rf.queue.length === 0 && rf.timer <= 0) {
          rf.state = "closing";
          rf.t = 0;
          this.h.audio.riftClose();
        }
      } else if (rf.state === "closing") {
        if (rf.t >= 0.5) this.list.splice(i, 1);
      }
    }
  }

  /** True while any rift still has enemies left to release. */
  anyPending() {
    return this.list.some((r) => r.queue.length > 0);
  }

  clear() {
    this.list.length = 0;
  }

  reset() {
    this.list.length = 0;
  }

  draw(R: Renderer, time: number) {
    for (const rf of this.list) this.drawRift(R, rf, time);
  }

  /** Two-stage lifecycle: point → line → writhing rift, and the reverse. */
  private drawRift(R: Renderer, rf: Rift, time: number) {
    let lenP = 1;
    let widP = 1;
    let alpha = 1;
    let snake = 1;

    if (rf.state === "opening") {
      if (rf.t < 0) return;
      const p = clamp(rf.t / 0.6, 0, 1);
      if (p < 0.42) {
        const q = easeOutCubic(p / 0.42);
        lenP = q;
        widP = 0;
        snake = 0;
        alpha = 0.35 + 0.65 * q;
      } else {
        const q = easeOutCubic((p - 0.42) / 0.58);
        lenP = 1;
        widP = q;
        snake = 1.7 - 0.7 * q;
        alpha = 1;
      }
    } else if (rf.state === "closing") {
      const p = clamp(rf.t / 0.5, 0, 1);
      if (p < 0.6) {
        const q = easeOutCubic(p / 0.6);
        lenP = 1;
        widP = 1 - q;
        snake = 1 + q * 0.8;
        alpha = 1;
      } else {
        const q = easeOutCubic((p - 0.6) / 0.4);
        lenP = 1 - q;
        widP = 0;
        snake = 0;
        alpha = 1 - q;
      }
    } else {
      lenP = 1 + 0.04 * Math.sin(rf.t * 6);
      widP = 1 + 0.06 * Math.sin(rf.t * 6 + 1.4);
    }

    // Don't draw if completely transparent
    if (alpha <= 0.01) return;

    if (lenP <= 0.03) {
      const pr = 3 + 1.6 * Math.sin(time * 18 + rf.seed);
      R.circle(rf.x, rf.y, Math.max(1.5, pr), rgba(C.riftCore, 0.9 * alpha), 10);
      return;
    }

    RiftField.drawShape(R, rf.x, rf.y, rf.size * lenP, rf.size * 0.227 * widP, rf.seed, time, alpha, rf.rot, snake);
  }

}

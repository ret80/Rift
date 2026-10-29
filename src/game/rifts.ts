/* Space rifts: tears in the zone that open, pour out enemies, then seal.
   Lifecycle: opening (0.6s) → spawning → closing (0.5s).
   Visuals: a point stretches into a line, then writhes open into the
   crack; closing plays the exact reverse. Each rift keeps a random
   orientation and a size matched to its biggest passenger. */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import type { IRenderer } from "./render/index";
import type { AudioManager } from "./systems/AudioManager";
import type { Fx } from "./fx";
import type { EcsWorld } from "./ecs";
import { TAU, rand, clamp, easeOutCubic, rgba } from "./math";
import { C, type EnemyKind } from "./balance";
import { RiftComponent, type RiftState } from "./ecs/components/RiftComponent";
import { GameEntity } from "./ecs/GameEntity";

/** Плоское представление разлома для рендера и чтения вне ECS. */
export interface Rift {
  x: number;
  y: number;
  t: number;
  state: RiftState;
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
}

export interface RiftHooks {
  spawnEnemy(kind: EnemyKind, x: number, y: number): void;
  fx: Fx;
  audio: AudioManager;
}

export class RiftField extends System {
  private aspect: Aspect | null = null;
  private readonly ecs: EcsWorld;

  /** Производное чтиво разломов из ECS-мира. */
  get riftList(): Rift[] {
    return this.ecs.rifts();
  }

  constructor(private h: RiftHooks, ecs: EcsWorld) {
    super(3); // после пуль и лучей — спавн врагов рифта следующим кадром
    this.ecs = ecs;
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(RiftComponent);
  }

  /** Utility: draw a rift shape at the given position (used by menu scene). */
  static drawShape(
    R: IRenderer,
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
    R: IRenderer,
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
    this.ecs.addRift({
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
    this.h.audio.playRiftOpen();
  }

  /** ECS-кадр: ведёт жизненный цикл всех разломов по компонентам. */
  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const rf = entity.components.get(RiftComponent);
      if (!rf) continue;

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
          this.h.audio.playRiftSpawn();
          this.h.fx.burst(rf.x, rf.y, 5, C.rift, 140, 0.3);
        }
        // Only close if queue is truly empty and timer has expired
        if (rf.queue.length === 0 && rf.timer <= 0) {
          rf.state = "closing";
          rf.t = 0;
          this.h.audio.playRiftClose();
        }
      } else if (rf.state === "closing") {
        if (rf.t >= 0.5) toRemove.push(entity);
      }
    }

    for (const entity of toRemove) this.engine?.entities.remove(entity);
  }

  reset() {
    this.ecs.clearRifts();
  }

  draw(R: IRenderer, time: number) {
    for (const rf of this.ecs.rifts()) this.drawRift(R, rf, time);
  }

  /** Two-stage lifecycle: point → line → writhing rift, and the reverse. */
  private drawRift(R: IRenderer, rf: Rift, time: number) {
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
      // spawning state - animated rift with sine wave motion
      lenP = 1 + 0.04 * Math.sin(rf.t * 6);
      widP = 1 + 0.06 * Math.sin(rf.t * 6 + 1.4);
    }

    // Don't draw if completely transparent
    if (alpha <= 0.01) return;

    if (lenP <= 0.03) {
      const pr = 3 + 1.6 * Math.sin(time * 18 + rf.seed);
      R.circle(rf.x, rf.y, Math.max(1.5, pr * lenP), rgba(C.riftCore, 0.9 * alpha), 10);
      return;
    }

    RiftField.drawShape(R, rf.x, rf.y, rf.size * lenP, rf.size * 0.227 * widP, rf.seed, time, alpha, rf.rot, snake);
  }

}
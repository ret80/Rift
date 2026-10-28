/* Particle / ring / screen-shake subsystem.
   Game code talks to it through a tiny facade (burst / ring / addShake);
   the particle/ring storage and lifecycle are backed by the ECS world
   (EcsWorld), while the simulation loop and shake stay here. The facade
   keeps the same public API so callers are unchanged. */

import type { IRenderer } from "./render/index";
import { TAU, rand, clamp, rgba } from "./math";
import type { Ring, Particle } from "./types";
import type { EcsWorld } from "./ecs";
export type { Ring, Particle } from "./types";

export class Fx {
  private readonly ecs: EcsWorld;

  private mag = 0;
  shakeX = 0;
  shakeY = 0;

  /** Производное чтиво частиц из ECS-мира. */
  get particles(): Particle[] {
    return this.ecs.particles();
  }

  /** Производное чтиво колец из ECS-мира. */
  get rings(): Ring[] {
    return this.ecs.rings();
  }

  constructor(ecs: EcsWorld) {
    this.ecs = ecs;
  }

  addShake(v: number) {
    this.mag = Math.min(26, this.mag + v);
  }

  /** Reset shake */
  reset() {
    this.mag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  burst(x: number, y: number, n: number, hex: string, speed: number, life: number) {
    const c = rgba(hex, 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(speed * 0.3, speed);
      this.ecs.addParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life),
        maxLife: life,
        c,
        size: rand(2, 7),
      });
    }
  }

  /** Directional / custom particle (dash trail, engine exhaust…). */
  emit(p: Particle) {
    this.ecs.addParticle(p);
  }

  ring(x: number, y: number, r0: number, vr: number, life: number, hex: string) {
    this.ecs.addRing({ x, y, r: r0, vr, life, maxLife: life, c: rgba(hex, 1) });
  }

  /** `dt` drives particles (game time, freezes on pause),
      `shakeDt` drives the shake decay (real time, always runs).
      Частицы/кольца симулируются здесь (движение + затухание), но хранятся
      и удаляются через ECS-мир. */
  update(dt: number, shakeDt: number) {
    this.mag = Math.max(0, this.mag - shakeDt * 40);
    this.shakeX = (Math.random() - 0.5) * 2 * this.mag;
    this.shakeY = (Math.random() - 0.5) * 2 * this.mag;

    if (dt > 0) {
      for (const p of this.ecs.particles()) {
        p.life -= dt;
        if (p.life <= 0) {
          this.ecs.removeParticle(p);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-2.5 * dt);
        p.vy *= Math.exp(-2.5 * dt);
      }
      for (const r of this.ecs.rings()) {
        r.life -= dt;
        r.r += r.vr * dt;
        if (r.life <= 0) this.ecs.removeRing(r);
      }
    }
  }

  draw(R: IRenderer) {
    for (const p of this.ecs.particles()) {
      const f = clamp(p.life / p.maxLife, 0, 1);
      const l = p.size * f;
      const d = Math.hypot(p.vx, p.vy) || 1;
      R.pushLine(
        p.x - (p.vx / d) * l,
        p.y - (p.vy / d) * l,
        p.x,
        p.y,
        [p.c[0], p.c[1], p.c[2], p.c[3] * f]
      );
    }
    for (const r of this.ecs.rings()) {
      const f = clamp(r.life / r.maxLife, 0, 1);
      R.circle(r.x, r.y, r.r, [r.c[0], r.c[1], r.c[2], r.c[3] * f], 40);
    }
  }

  clear() {
    this.ecs.clearParticles();
    this.ecs.clearRings();
    this.mag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
}
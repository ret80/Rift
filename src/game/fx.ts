/* Particle / ring / screen-shake subsystem.
   Game code talks to it through a tiny facade (burst / ring / addShake);
   all state and simulation lives here. */

import type { Renderer, RGBA } from "./render";
import { TAU, rand, clamp, rgba } from "./math";

export interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  c: RGBA;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  c: RGBA;
  size: number;
}

export class Fx {
  readonly particles: Particle[] = [];
  readonly rings: Ring[] = [];

  private mag = 0;
  shakeX = 0;
  shakeY = 0;

  addShake(v: number) {
    this.mag = Math.min(26, this.mag + v);
  }

  burst(x: number, y: number, n: number, hex: string, speed: number, life: number) {
    const c = rgba(hex, 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(speed * 0.3, speed);
      this.particles.push({
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
    this.particles.push(p);
  }

  ring(x: number, y: number, r0: number, vr: number, life: number, hex: string) {
    this.rings.push({ x, y, r: r0, vr, life, maxLife: life, c: rgba(hex, 1) });
  }

  /** `dt` drives particles (game time, freezes on pause),
      `shakeDt` drives the shake decay (real time, always runs). */
  update(dt: number, shakeDt: number) {
    this.mag = Math.max(0, this.mag - shakeDt * 40);
    this.shakeX = (Math.random() - 0.5) * 2 * this.mag;
    this.shakeY = (Math.random() - 0.5) * 2 * this.mag;

    if (dt > 0) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-2.5 * dt);
        p.vy *= Math.exp(-2.5 * dt);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        r.r += r.vr * dt;
        if (r.life <= 0) this.rings.splice(i, 1);
      }
    }
  }

  draw(R: Renderer) {
    for (const p of this.particles) {
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
    for (const r of this.rings) {
      const f = clamp(r.life / r.maxLife, 0, 1);
      R.circle(r.x, r.y, r.r, [r.c[0], r.c[1], r.c[2], r.c[3] * f], 40);
    }
  }

  clear() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.mag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
}

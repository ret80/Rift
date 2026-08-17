/* Infinite parallax starfield. Space is divided into seeded chunks per
   layer; chunks materialize one chunk beyond the viewport edge (stars
   always slide in from off-screen) and are evicted behind the camera. */

import type { Renderer } from "./render";
import { TAU, mulberry32 } from "./math";
import { STAR_LAYERS } from "./balance";

interface Star {
  x: number;
  y: number;
  s: number;
  a: number;
  tw: number;
  ph: number;
  tint: number;
}

export class Starfield {
  private chunks = new Map<string, Star[]>();
  private boundsKey = "";

  private gen(li: number, cx: number, cy: number): Star[] {
    const L = STAR_LAYERS[li];
    const seed =
      (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(li + 1, 83492791)) >>> 0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: Star[] = [];
    for (let i = 0; i < L.count; i++) {
      out.push({
        x: cx * L.chunk + rnd() * L.chunk,
        y: cy * L.chunk + rnd() * L.chunk,
        s: L.sMin + rnd() * (L.sMax - L.sMin),
        a: L.aMin + rnd() * (L.aMax - L.aMin),
        tw: 0.4 + rnd() * 2.2,
        ph: rnd() * TAU,
        tint: rnd(),
      });
    }
    return out;
  }

  /** Обновить звёздное поле. */
  update(dt: number, camX: number, camY: number, zoom: number, time: number, viewW: number, viewH: number) {
    this.ensure(camX, camY, viewW, viewH);
  }

  private ensure(camX: number, camY: number, viewW: number, viewH: number) {
    const ranges: Array<[number, number, number, number]> = [];
    let key = "";
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const L = STAR_LAYERS[li];
      const ox = camX * L.f;
      const oy = camY * L.f;
      const x0 = Math.floor((ox - viewW / 2) / L.chunk) - 1;
      const x1 = Math.floor((ox + viewW / 2) / L.chunk) + 1;
      const y0 = Math.floor((oy - viewH / 2) / L.chunk) - 1;
      const y1 = Math.floor((oy + viewH / 2) / L.chunk) + 1;
      ranges.push([x0, x1, y0, y1]);
      key += `${x0},${x1},${y0},${y1};`;
    }
    if (key === this.boundsKey) return;
    this.boundsKey = key;

    const keep = new Set<string>();
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const [x0, x1, y0, y1] = ranges[li];
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = `${li}:${cx}:${cy}`;
          keep.add(k);
          if (!this.chunks.has(k)) this.chunks.set(k, this.gen(li, cx, cy));
        }
      }
    }
    for (const k of Array.from(this.chunks.keys())) {
      if (!keep.has(k)) this.chunks.delete(k);
    }
  }

  /** Draws in world space: a star at layer coord `st` is pushed at
      `st + cam·(1−f)`, which the world transform renders at `st − cam·f`. */
  /** Reset starfield. */
  reset() {
    this.chunks.clear();
    this.boundsKey = "";
  }

  draw(
    R: Renderer,
    camX: number,
    camY: number,
    zoom: number,
    time: number,
    viewW: number,
    viewH: number
  ) {
    this.ensure(camX, camY, viewW, viewH);
    R.setMode("world");
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const L = STAR_LAYERS[li];
      const ox = camX * L.f;
      const oy = camY * L.f;
      const x0 = Math.floor((ox - viewW / 2) / L.chunk);
      const x1 = Math.floor((ox + viewW / 2) / L.chunk);
      const y0 = Math.floor((oy - viewH / 2) / L.chunk);
      const y1 = Math.floor((oy + viewH / 2) / L.chunk);
      const shiftX = camX * (1 - L.f);
      const shiftY = camY * (1 - L.f);
      const minX = camX - viewW / 2 / zoom - 8;
      const maxX = camX + viewW / 2 / zoom + 8;
      const minY = camY - viewH / 2 / zoom - 8;
      const maxY = camY + viewH / 2 / zoom + 8;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const stars = this.chunks.get(`${li}:${cx}:${cy}`);
          if (!stars) continue;
          for (const st of stars) {
            const wx = st.x + shiftX;
            const wy = st.y + shiftY;
            if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
            const twk = 0.72 + 0.28 * Math.sin(time * st.tw + st.ph);
            const a = st.a * twk;
            const col: [number, number, number] =
              st.tint < 0.72 ? [0.78, 0.88, 1] : st.tint < 0.9 ? [1, 0.92, 0.78] : [0.82, 0.74, 1];
            R.pushLine(wx - st.s, wy, wx + st.s, wy, [col[0], col[1], col[2], a]);
            if (st.s > 1.8) {
              R.pushLine(wx, wy - st.s, wx, wy + st.s, [col[0], col[1], col[2], a * 0.5]);
            }
          }
        }
      }
    }
  }
}

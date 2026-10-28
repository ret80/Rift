/* PicoGLRenderer — реализация IRenderer на библиотеке PicoGL.js.
   Все WebGL-вызовы идут через PicoGL App/DrawCall; внешний код
   работает только через контракт IRenderer. */
import PicoGL from "picogl";
import type { App, DrawCall, Framebuffer, Program, Texture, VertexArray, VertexBuffer } from "picogl";
import type { IRenderer, RenderMode, RGBA } from "./IRenderer";

const LINE_VERT = `
attribute vec2 aPos;
attribute vec4 aColor;
uniform float uZoom;
uniform vec2 uOffset;
uniform vec2 uScale;
uniform vec2 uFlip;
varying vec4 vColor;
void main() {
  vec2 p = aPos * uZoom + uOffset;
  gl_Position = vec4(p * uScale + uFlip, 0.0, 1.0);
  vColor = aColor;
}
`;

const LINE_FRAG = `
precision mediump float;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}
`;

const BEAM_VERT = `
attribute vec2 aPos;
attribute vec4 aColor;
attribute vec2 aUv;
attribute float aSeed;
uniform float uZoom;
uniform vec2 uOffset;
uniform vec2 uScale;
uniform vec2 uFlip;
varying vec4 vColor;
varying vec2 vUv;
varying float vSeed;
void main() {
  vec2 p = aPos * uZoom + uOffset;
  gl_Position = vec4(p * uScale + uFlip, 0.0, 1.0);
  vColor = aColor;
  vUv = aUv;
  vSeed = aSeed;
}
`;

const BEAM_FRAG = `
precision mediump float;
varying vec4 vColor;
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
void main() {
  float d = abs(vUv.y - 0.5) * 2.0;
  float core = exp(-d * d * 22.0);
  float halo = pow(max(0.0, 1.0 - d), 2.2) * 0.35;
  float endFade = 1.0 - smoothstep(0.92, 1.0, vUv.x);
  float flicker = 0.82 + 0.18 * sin(uTime * 42.0 + vSeed * 6.2831);
  float glow = (core + halo) * endFade * flicker * vColor.a;
  vec3 col = mix(vColor.rgb, vec3(1.0), core * 0.65);
  gl_FragColor = vec4(col, glow);
}
`;

const FULL_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const BLUR_FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227027;
  c += texture2D(uTex, vUv + uDir * 1.0).rgb * 0.1945946;
  c += texture2D(uTex, vUv - uDir * 1.0).rgb * 0.1945946;
  c += texture2D(uTex, vUv + uDir * 2.0).rgb * 0.1216216;
  c += texture2D(uTex, vUv - uDir * 2.0).rgb * 0.1216216;
  c += texture2D(uTex, vUv + uDir * 3.0).rgb * 0.054054;
  c += texture2D(uTex, vUv - uDir * 3.0).rgb * 0.054054;
  c += texture2D(uTex, vUv + uDir * 4.0).rgb * 0.016216;
  c += texture2D(uTex, vUv - uDir * 4.0).rgb * 0.016216;
  gl_FragColor = vec4(c, 1.0);
}
`;

const COMPOSITE_FRAG = `
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  vec3 bloom = texture2D(uBloom, vUv).rgb;

  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / max(uRes.y, 1.0), 1.0);

  vec2 c1 = vec2(0.26 + 0.10 * sin(uTime * 0.045), 0.30 + 0.10 * cos(uTime * 0.038));
  vec2 c2 = vec2(0.76 + 0.11 * cos(uTime * 0.031), 0.72 + 0.09 * sin(uTime * 0.05));
  vec2 c3 = vec2(0.55 + 0.14 * sin(uTime * 0.021), 0.18 + 0.10 * cos(uTime * 0.026));
  vec2 d1 = (uv - c1) * asp;
  vec2 d2 = (uv - c2) * asp;
  vec2 d3 = (uv - c3) * asp;
  float g1 = exp(-dot(d1, d1) * 2.6);
  float g2 = exp(-dot(d2, d2) * 3.4);
  float g3 = exp(-dot(d3, d3) * 3.0);

  vec3 bg = vec3(0.012, 0.021, 0.045);
  bg += vec3(0.030, 0.075, 0.130) * g1;
  bg += vec3(0.085, 0.035, 0.120) * g2 * 0.75;
  bg += vec3(0.020, 0.090, 0.085) * g3 * 0.5;

  float dist = distance(uv, vec2(0.5));
  bg *= 1.18 - dist * 0.85;

  vec3 col = bg + scene + bloom * 1.35;
  col = 1.0 - exp(-col * 1.9);

  float vig = smoothstep(1.15, 0.38, dist * 1.5);
  col *= mix(0.55, 1.0, vig);

  float gr = hash(uv * uRes + fract(uTime) * 61.7);
  col += (gr - 0.5) * 0.024;

  gl_FragColor = vec4(col, 1.0);
}
`;

const MAX_VERTS = 60000;
const FLOATS_PER_VERT = 6;
const MAX_BEAM_VERTS = 6000;
const FLOATS_PER_BEAM_VERT = 9;

interface RenderTarget {
  fb: Framebuffer;
  tex: Texture;
  w: number;
  h: number;
}

export class PicoGLRenderer implements IRenderer {
  readonly canvas: HTMLCanvasElement;
  private app!: App;

  private lineProg!: Program;
  private beamProg!: Program;
  private blurProg!: Program;
  private compProg!: Program;

  private lineBuf!: VertexBuffer;
  private beamBuf!: VertexBuffer;
  private triBuf!: VertexBuffer;
  private lineVA!: VertexArray;
  private beamVA!: VertexArray;
  private triVA!: VertexArray;

  private lineCall!: DrawCall;
  private beamCall!: DrawCall;
  private blurCall!: DrawCall;
  private compCall!: DrawCall;

  private scene: RenderTarget | null = null;
  private bloomA: RenderTarget | null = null;
  private bloomB: RenderTarget | null = null;

  /** Признак потери WebGL-контекста (contextlost) — кадры пропускаются до восстановления. */
  private contextLost = false;
  /** Исходный canvas-обработчик webglcontextlost (чтобы снять при уничтожении). */
  private onContextLost: ((e: Event) => void) | null = null;
  /** Исходный canvas-обработчик webglcontextrestored (чтобы снять при уничтожении). */
  private onContextRestored: (() => void) | null = null;

  private verts = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
  private count = 0;
  private beamVerts = new Float32Array(MAX_BEAM_VERTS * FLOATS_PER_BEAM_VERT);
  private beamCount = 0;

  width = 0;
  height = 0;
  private dpr = 1;

  private zoom = 1;
  private offX = 0;
  private offY = 0;
  private mode: RenderMode = "world";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Готовимся к потере/восстановлению контекста: на macOS (и других
    // платформах) при потере фокуса браузер может уронить WebGL-контекст.
    // Мы пересоздаём все GPU-ресурсы по событию webglcontextrestored.
    this.installContextListeners();
    this.initGL();
  }

  private installContextListeners(): void {
    this.onContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      // Контекст восстановлен — все прежние GPU-объекты (программы, буферы,
      // текстуры, VAO) аннулированы, их нужно создать заново. Следующий
      // кадр вызовет resize(), который из-за сброшенных размеров заново
      // создаст offscreen-таргеты.
      this.initGL();
    };
    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
  }

  private initGL(): void {
    // Проверяем поддержку WebGL2 до создания App — понятная ошибка.
    // После восстановления getContext вернёт тот же (уже живой) контекст.
    const gl = this.canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 не поддерживается этим браузером");
    // Повторный запрос вернёт тот же контекст; createApp берёт webgl2 у canvas.
    if (!this.app) {
      this.app = PicoGL.createApp(this.canvas, {
        antialias: true,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    }

    this.createResources();
  }

  private createResources(): void {
    // Явно фиксируем атрибутные слоты, чтобы не зависеть от порядка линковки.
    this.lineProg = this.app.createProgram(LINE_VERT, LINE_FRAG, {
      attributeLocations: { aPos: 0, aColor: 1 },
    });
    this.beamProg = this.app.createProgram(BEAM_VERT, BEAM_FRAG, {
      attributeLocations: { aPos: 0, aColor: 1, aUv: 2, aSeed: 3 },
    });
    this.blurProg = this.app.createProgram(FULL_VERT, BLUR_FRAG, {
      attributeLocations: { aPos: 0 },
    });
    this.compProg = this.app.createProgram(FULL_VERT, COMPOSITE_FRAG, {
      attributeLocations: { aPos: 0 },
    });

    this.lineBuf = this.app.createVertexBuffer(
      PicoGL.FLOAT, FLOATS_PER_VERT, MAX_VERTS * FLOATS_PER_VERT, PicoGL.DYNAMIC_DRAW
    );
    this.beamBuf = this.app.createVertexBuffer(
      PicoGL.FLOAT, FLOATS_PER_BEAM_VERT, MAX_BEAM_VERTS * FLOATS_PER_BEAM_VERT, PicoGL.DYNAMIC_DRAW
    );
    this.triBuf = this.app.createVertexBuffer(
      PicoGL.FLOAT, 2, new Float32Array([-1, -1, 3, -1, -1, 3]), PicoGL.STATIC_DRAW
    );

    this.lineVA = this.buildLineVA();
    this.beamVA = this.buildBeamVA();
    this.triVA = this.buildTriVA();

    this.lineCall = this.app.createDrawCall(this.lineProg, this.lineVA)
      .primitive(PicoGL.LINES);
    this.beamCall = this.app.createDrawCall(this.beamProg, this.beamVA)
      .primitive(PicoGL.TRIANGLES);
    this.blurCall = this.app.createDrawCall(this.blurProg, this.triVA);
    this.compCall = this.app.createDrawCall(this.compProg, this.triVA);

    // Пересоздаём offscreen-таргеты после потери контекста.
    this.scene = null;
    this.bloomA = null;
    this.bloomB = null;
    // Сброс размеров заставляет следующий resize() пересоздать таргеты
    // (их GPU-объекты аннулированы при потере контекста).
    this.width = 0;
    this.height = 0;

    this.app.disable(PicoGL.DEPTH_TEST);
    this.app.clearColor(0, 0, 0, 1);
  }

  private buildLineVA(): VertexArray {
    const va = this.app.createVertexArray();
    va.vertexAttributeBuffer(0, this.lineBuf, { size: 2, type: PicoGL.FLOAT, stride: 24, offset: 0 });
    va.vertexAttributeBuffer(1, this.lineBuf, { size: 4, type: PicoGL.FLOAT, stride: 24, offset: 8 });
    return va;
  }

  private buildBeamVA(): VertexArray {
    const va = this.app.createVertexArray();
    va.vertexAttributeBuffer(0, this.beamBuf, { size: 2, type: PicoGL.FLOAT, stride: 36, offset: 0 });
    va.vertexAttributeBuffer(1, this.beamBuf, { size: 4, type: PicoGL.FLOAT, stride: 36, offset: 8 });
    va.vertexAttributeBuffer(2, this.beamBuf, { size: 2, type: PicoGL.FLOAT, stride: 36, offset: 24 });
    va.vertexAttributeBuffer(3, this.beamBuf, { size: 1, type: PicoGL.FLOAT, stride: 36, offset: 32 });
    return va;
  }

  private buildTriVA(): VertexArray {
    const va = this.app.createVertexArray();
    va.vertexAttributeBuffer(0, this.triBuf, { size: 2, type: PicoGL.FLOAT, stride: 0, offset: 0 });
    return va;
  }

  private makeTarget(w: number, h: number): RenderTarget {
    const tex = this.app.createTexture2D(w, h, {
      internalFormat: PicoGL.RGBA8,
      minFilter: PicoGL.LINEAR,
      magFilter: PicoGL.LINEAR,
      wrapS: PicoGL.CLAMP_TO_EDGE,
      wrapT: PicoGL.CLAMP_TO_EDGE,
    });
    const fb = this.app.createFramebuffer();
    fb.colorTarget(0, tex);
    return { fb, tex, w, h };
  }

  private deleteTarget(t: RenderTarget | null): void {
    if (!t) return;
    t.fb.delete();
    t.tex.delete();
  }

  resize(cssW: number, cssH: number) {
    if (this.contextLost) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(2, Math.floor(cssW * this.dpr));
    const h = Math.max(2, Math.floor(cssH * this.dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    // PicoGL отслеживает drawingBuffer; after canvas resize he updates himself.
    this.app.resize(w, h);
    this.deleteTarget(this.scene);
    this.deleteTarget(this.bloomA);
    this.deleteTarget(this.bloomB);
    this.scene = this.makeTarget(w, h);
    this.bloomA = this.makeTarget(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.bloomB = this.makeTarget(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  beginFrame() {
    if (this.contextLost || !this.scene) return;
    this.app.drawFramebuffer(this.scene.fb);
    this.app.viewport(0, 0, this.scene.w, this.scene.h);
    this.app.clear();
    this.app.enable(PicoGL.BLEND);
    this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE);
    this.count = 0;
    this.beamCount = 0;
    this.mode = "world";
  }

  clear() {
    if (this.contextLost) return;
    this.app.defaultDrawFramebuffer();
    this.app.defaultViewport();
    this.app.clear();
  }

  setMode(m: RenderMode) {
    if (m !== this.mode) {
      this.flush();
      this.flushBeams();
      this.mode = m;
    }
  }

  destroy(): void {
    if (this.onContextLost)
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    if (this.onContextRestored)
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored, false);
    this.onContextLost = null;
    this.onContextRestored = null;
  }

  setCamera(camX: number, camY: number, zoom: number, shakeX: number, shakeY: number) {
    this.zoom = zoom;
    this.offX = this.width / 2 - camX * zoom + shakeX * this.dpr;
    this.offY = this.height / 2 - camY * zoom + shakeY * this.dpr;
  }

  pushLine(x1: number, y1: number, x2: number, y2: number, c: RGBA) {
    if (!this.scene) return;
    if (this.count + 2 > MAX_VERTS) this.flush();
    const v = this.verts;
    let i = this.count * FLOATS_PER_VERT;
    v[i++] = x1;
    v[i++] = y1;
    v[i++] = c[0];
    v[i++] = c[1];
    v[i++] = c[2];
    v[i++] = c[3];
    v[i++] = x2;
    v[i++] = y2;
    v[i++] = c[0];
    v[i++] = c[1];
    v[i++] = c[2];
    v[i++] = c[3];
    this.count += 2;
  }

  pushBeam(
    x1: number, y1: number, x2: number, y2: number,
    width: number, c: RGBA, seed: number
  ) {
    if (!this.scene) return;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= 0.001) return;
    if (this.beamCount + 6 > MAX_BEAM_VERTS) {
      this.flushBeams();
    }
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const hw = Math.max(0.4, width * 0.5);
    const x1n = x1 + nx * hw, y1n = y1 + ny * hw;
    const x1o = x1 - nx * hw, y1o = y1 - ny * hw;
    const x2n = x2 + nx * hw, y2n = y2 + ny * hw;
    const x2o = x2 - nx * hw, y2o = y2 - ny * hw;

    const v = this.beamVerts;
    let i = this.beamCount * FLOATS_PER_BEAM_VERT;
    const quad = [
      [x1n, y1n, 0, 0],
      [x2n, y2n, 1, 0],
      [x1o, y1o, 0, 1],
      [x2o, y2o, 1, 1],
    ];
    const tris = [0, 1, 2, 1, 3, 2];
    for (const idx of tris) {
      const q = quad[idx];
      v[i++] = q[0];
      v[i++] = q[1];
      v[i++] = c[0];
      v[i++] = c[1];
      v[i++] = c[2];
      v[i++] = c[3];
      v[i++] = q[2];
      v[i++] = q[3];
      v[i++] = seed;
    }
    this.beamCount += 6;
  }

  polyline(pts: Array<[number, number]>, closed: boolean, c: RGBA) {
    for (let i = 0; i < pts.length - 1; i++) {
      this.pushLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
    }
    if (closed && pts.length > 2) {
      const a = pts[pts.length - 1];
      const b = pts[0];
      this.pushLine(a[0], a[1], b[0], b[1], c);
    }
  }

  circle(cx: number, cy: number, r: number, c: RGBA, segs = 48, alphaScale = 1) {
    if (r <= 0.5) return;
    const n = Math.max(8, Math.min(segs, Math.floor(r * 0.35) + 12));
    const cc: RGBA = [c[0], c[1], c[2], c[3] * alphaScale];
    let px = cx + r;
    let py = cy;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const nx = cx + Math.cos(a) * r;
      const ny = cy + Math.sin(a) * r;
      this.pushLine(px, py, nx, ny, cc);
      px = nx;
      py = ny;
    }
  }

  dashedCircle(
    cx: number,
    cy: number,
    r: number,
    c: RGBA,
    dashes: number,
    phase: number,
    gapRatio = 0.45
  ) {
    if (r <= 0.5) return;
    const segPerDash = 6;
    for (let d = 0; d < dashes; d++) {
      const a0 = phase + (d / dashes) * Math.PI * 2;
      const a1 = a0 + ((1 - gapRatio) / dashes) * Math.PI * 2;
      let px = cx + Math.cos(a0) * r;
      let py = cy + Math.sin(a0) * r;
      for (let i = 1; i <= segPerDash; i++) {
        const a = a0 + ((a1 - a0) * i) / segPerDash;
        const nx = cx + Math.cos(a) * r;
        const ny = cy + Math.sin(a) * r;
        this.pushLine(px, py, nx, ny, c);
        px = nx;
        py = ny;
      }
    }
  }

  drawPolygon(
    x: number,
    y: number,
    angle: number,
    pts: Array<[number, number]>,
    c: RGBA,
    closed = true
  ) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      const wx = x + px * cos - py * sin;
      const wy = y + px * sin + py * cos;
      const next = pts[(i + 1) % pts.length];
      const nx = x + next[0] * cos - next[1] * sin;
      const ny = y + next[0] * sin + next[1] * cos;
      if (closed || i < pts.length - 1) {
        this.pushLine(wx, wy, nx, ny, c);
      }
    }
  }

  private applyCamera(dc: DrawCall): void {
    const zoom = this.mode === "world" ? this.zoom : 1;
    const ox = this.mode === "world" ? this.offX : 0;
    const oy = this.mode === "world" ? this.offY : 0;
    dc.uniform("uZoom", zoom);
    dc.uniform("uOffset", [ox, oy]);
    dc.uniform("uScale", [2 / this.width, -2 / this.height]);
    dc.uniform("uFlip", [-1, 1]);
  }

  private flushBeams(time = 0) {
    if (this.contextLost) {
      this.beamCount = 0;
      return;
    }
    if (this.beamCount === 0 || !this.scene) return;
    this.beamBuf.data(this.beamVerts.subarray(0, this.beamCount * FLOATS_PER_BEAM_VERT));
    this.applyCamera(this.beamCall);
    this.beamCall.uniform("uTime", time);
    this.beamCall.drawRanges([0, this.beamCount]);
    this.beamCall.draw();
    this.beamCount = 0;
  }

  private flush() {
    if (this.contextLost) {
      this.count = 0;
      return;
    }
    if (this.count === 0 || !this.scene) return;
    this.lineBuf.data(this.verts.subarray(0, this.count * FLOATS_PER_VERT));
    this.applyCamera(this.lineCall);
    this.lineCall.drawRanges([0, this.count]);
    this.lineCall.draw();
    this.count = 0;
  }

  finish(time: number) {
    if (this.contextLost || !this.scene || !this.bloomA || !this.bloomB) return;
    this.flush();
    this.flushBeams(time);
    this.app.disable(PicoGL.BLEND);

    // Проход блюра 1: сцена → bloomA (горизонтальный).
    this.blurCall.texture("uTex", this.scene.tex);
    this.blurCall.uniform("uDir", [1.4 / this.scene.w, 0]);
    this.app.drawFramebuffer(this.bloomA.fb);
    this.app.viewport(0, 0, this.bloomA.w, this.bloomA.h);
    this.blurCall.draw();

    // Проход блюра 2: bloomA → bloomB (вертикальный).
    this.blurCall.texture("uTex", this.bloomA.tex);
    this.blurCall.uniform("uDir", [0, 1.4 / this.bloomA.h]);
    this.app.drawFramebuffer(this.bloomB.fb);
    this.app.viewport(0, 0, this.bloomB.w, this.bloomB.h);
    this.blurCall.draw();

    // Композиция: сцена + bloom на экран.
    this.compCall.texture("uScene", this.scene.tex);
    this.compCall.texture("uBloom", this.bloomB.tex);
    this.compCall.uniform("uRes", [this.width, this.height]);
    this.compCall.uniform("uTime", time);
    this.app.defaultDrawFramebuffer();
    this.app.defaultViewport();
    this.compCall.draw();
  }
}
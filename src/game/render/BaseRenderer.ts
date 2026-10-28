/* BaseRenderer — реализация IRenderer на raw WebGL.
   Динамический батчинг линий + постобработка bloom. */
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

/*
 * Beam shader — лазерный луч как светящаяся линия.
 * Каждый луч — квад (2 треугольника), в фрагменте считается поперечная
 * координата: яркое ядро на оси и мягкий ореол по краям. Аддитивное
 * смешивание + приборный bloom дают свечение линии.
 */
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

interface FBO {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class BaseRenderer implements IRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;

  private lineProg!: WebGLProgram;
  private beamProg!: WebGLProgram;
  private blurProg!: WebGLProgram;
  private compProg!: WebGLProgram;

  private lineBuf!: WebGLBuffer;
  private beamBuf!: WebGLBuffer;
  private triBuf!: WebGLBuffer;
  private verts = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
  private count = 0;
  private beamVerts = new Float32Array(MAX_BEAM_VERTS * FLOATS_PER_BEAM_VERT);
  private beamCount = 0;

  private sceneFbo: FBO | null = null;
  private bloomA: FBO | null = null;
  private bloomB: FBO | null = null;

  width = 0;
  height = 0;
  private dpr = 1;

  private zoom = 1;
  private offX = 0;
  private offY = 0;
  private mode: RenderMode = "world";

  private u: Array<Record<string, WebGLUniformLocation | null>> = [];

  /** Признак потери WebGL-контекста — кадры пропускаются до восстановления. */
  private contextLost = false;
  /** Исходные canvas-обработчики (чтобы снять при уничтожении). */
  private onContextLost: ((e: Event) => void) | null = null;
  private onContextRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Готовимся к потере/восстановлению контекста: пересоздаём GPU-ресурсы
    // по событию webglcontextrestored.
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
      // Все прежние GPU-объекты аннулированы — создаём заново.
      this.initGL();
    };
    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
  }

  private initGL(): void {
    const gl = this.canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL не поддерживается этим браузером");
    this.gl = gl;

    // Сброс размеров заставляет следующий resize() пересоздать FBO.
    this.sceneFbo = null;
    this.bloomA = null;
    this.bloomB = null;
    this.width = 0;
    this.height = 0;

    this.lineProg = this.makeProgram(LINE_VERT, LINE_FRAG);
    this.beamProg = this.makeProgram(BEAM_VERT, BEAM_FRAG);
    this.blurProg = this.makeProgram(FULL_VERT, BLUR_FRAG);
    this.compProg = this.makeProgram(FULL_VERT, COMPOSITE_FRAG);

    const lb = gl.createBuffer();
    const bb = gl.createBuffer();
    const tb = gl.createBuffer();
    if (!lb || !bb || !tb) throw new Error("Не удалось создать буферы WebGL");
    this.lineBuf = lb;
    this.beamBuf = bb;
    this.triBuf = tb;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    this.cacheUniforms();
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
  }

  private cacheUniforms() {
    const gl = this.gl;
    const names = [
      "uZoom",
      "uOffset",
      "uScale",
      "uFlip",
      "uTex",
      "uDir",
      "uScene",
      "uBloom",
      "uRes",
      "uTime",
    ];
    const progs = [this.lineProg, this.beamProg, this.blurProg, this.compProg];
    this.u = progs.map((p) => {
      const map: Record<string, WebGLUniformLocation | null> = {};
      for (const n of names) map[n] = gl.getUniformLocation(p, n);
      return map;
    });
  }

  /** program index: 0 = lines, 1 = beams, 2 = blur, 3 = composite */
  private loc(idx: number, name: string) {
    return this.u[idx][name] ?? null;
  }

  private makeShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error("shader alloc failed");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("shader compile: " + gl.getShaderInfoLog(s));
    }
    return s;
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram();
    if (!p) throw new Error("program alloc failed");
    gl.attachShader(p, this.makeShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.makeShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("program link: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  private makeFbo(w: number, h: number): FBO {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    if (!tex || !fb) throw new Error("fbo alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
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
    this.sceneFbo = this.makeFbo(w, h);
    this.bloomA = this.makeFbo(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.bloomB = this.makeFbo(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  beginFrame() {
    const gl = this.gl;
    if (this.contextLost || !this.sceneFbo) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo.fb);
    gl.viewport(0, 0, this.sceneFbo.w, this.sceneFbo.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.count = 0;
    this.beamCount = 0;
    this.mode = "world";
  }

  /** Clear the entire canvas (for menu). */
  clear() {
    if (this.contextLost) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    if (!this.sceneFbo) return;
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

  /**
   * Нарисовать лазерный луч: светящаяся полоса с ядром и ореолом.
   * Ширина задаётся в мировых единицах; фрагментный шейдер превращает
   * поперечную координату в яркое ядро и мягкое затухание к краям.
   */
  pushBeam(
    x1: number, y1: number, x2: number, y2: number,
    width: number, c: RGBA, seed: number
  ) {
    if (!this.sceneFbo) return;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= 0.001) return;
    if (this.beamCount + 6 > MAX_BEAM_VERTS) {
      this.flushBeams();
      // После сброса квад помещается.
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

    // Два треугольника, покрывающие квад; uv.x — вдоль луча (0 у ствола, 1 у конца),
    // uv.y — поперёк (0 и 1 у краёв, 0.5 на оси).
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

  /** Draw a polygon with optional rotation and translation. */
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

  private flushBeams(time = 0) {
    if (this.contextLost) {
      this.beamCount = 0;
      return;
    }
    if (this.beamCount === 0 || !this.sceneFbo) return;
    const gl = this.gl;
    gl.useProgram(this.beamProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.beamVerts.subarray(0, this.beamCount * FLOATS_PER_BEAM_VERT),
      gl.DYNAMIC_DRAW
    );
    const aPos = gl.getAttribLocation(this.beamProg, "aPos");
    const aColor = gl.getAttribLocation(this.beamProg, "aColor");
    const aUv = gl.getAttribLocation(this.beamProg, "aUv");
    const aSeed = gl.getAttribLocation(this.beamProg, "aSeed");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 36, 8);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 1, gl.FLOAT, false, 36, 32);

    const zoom = this.mode === "world" ? this.zoom : 1;
    const ox = this.mode === "world" ? this.offX : 0;
    const oy = this.mode === "world" ? this.offY : 0;
    gl.uniform1f(this.loc(1, "uZoom"), zoom);
    gl.uniform2f(this.loc(1, "uOffset"), ox, oy);
    gl.uniform2f(this.loc(1, "uScale"), 2 / this.width, -2 / this.height);
    gl.uniform2f(this.loc(1, "uFlip"), -1, 1);
    gl.uniform1f(this.loc(1, "uTime"), time);
    gl.drawArrays(gl.TRIANGLES, 0, this.beamCount);
    this.beamCount = 0;
    // Полноэкранный проход ниже использует только aPos: не оставляем
    // включёнными атрибуты луча, иначе некоторые драйверы будут валидировать
    // их буферы при drawArrays.
    gl.disableVertexAttribArray(aUv);
    gl.disableVertexAttribArray(aSeed);
  }

  private flush() {
    if (this.contextLost) {
      this.count = 0;
      return;
    }
    if (this.count === 0 || !this.sceneFbo) return;
    const gl = this.gl;
    gl.useProgram(this.lineProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.verts.subarray(0, this.count * FLOATS_PER_VERT),
      gl.DYNAMIC_DRAW
    );
    const aPos = gl.getAttribLocation(this.lineProg, "aPos");
    const aColor = gl.getAttribLocation(this.lineProg, "aColor");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 24, 8);

    const zoom = this.mode === "world" ? this.zoom : 1;
    const ox = this.mode === "world" ? this.offX : 0;
    const oy = this.mode === "world" ? this.offY : 0;
    gl.uniform1f(this.loc(0, "uZoom"), zoom);
    gl.uniform2f(this.loc(0, "uOffset"), ox, oy);
    gl.uniform2f(this.loc(0, "uScale"), 2 / this.width, -2 / this.height);
    gl.uniform2f(this.loc(0, "uFlip"), -1, 1);
    gl.drawArrays(gl.LINES, 0, this.count);
    this.count = 0;
  }

  finish(time: number) {
    const gl = this.gl;
    if (this.contextLost || !this.sceneFbo || !this.bloomA || !this.bloomB) return;
    this.flush();
    this.flushBeams(time);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fb);
    gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
    gl.useProgram(this.blurProg);
    this.bindTri(this.blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo.tex);
    gl.uniform1i(this.loc(2, "uTex"), 0);
    gl.uniform2f(this.loc(2, "uDir"), 1.4 / this.sceneFbo.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fb);
    gl.viewport(0, 0, this.bloomB.w, this.bloomB.h);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    gl.uniform2f(this.loc(2, "uDir"), 0, 1.4 / this.bloomA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.compProg);
    this.bindTri(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo.tex);
    gl.uniform1i(this.loc(3, "uScene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
    gl.uniform1i(this.loc(3, "uBloom"), 1);
    gl.uniform2f(this.loc(3, "uRes"), this.width, this.height);
    gl.uniform1f(this.loc(3, "uTime"), time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  private bindTri(prog: WebGLProgram) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const aColor = gl.getAttribLocation(this.lineProg, "aColor");
    if (aColor >= 0 && aColor !== aPos) gl.disableVertexAttribArray(aColor);
  }
}
export type RGBA = [number, number, number, number];

const MAX_VERTS = 120000;

const VS = `
attribute vec2 aPos;
attribute vec4 aColor;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uShake;
uniform int uMode;
varying vec4 vColor;
void main() {
  vec2 p = aPos;
  if (uMode == 1) {
    p = (aPos - uCam) * uZoom + uShake;
  }
  vec2 clip = (p / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vColor = aColor;
}
`;

const FS = `
precision mediump float;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}
`;

const POST_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const POST_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  // cheap separable-ish bloom: sample a few offsets
  vec2 px = 1.5 / uRes;
  col += texture2D(uTex, uv).rgb * 0.42;
  col += texture2D(uTex, uv + px * vec2( 2.0, 0.0)).rgb * 0.08;
  col += texture2D(uTex, uv + px * vec2(-2.0, 0.0)).rgb * 0.08;
  col += texture2D(uTex, uv + px * vec2( 0.0, 2.0)).rgb * 0.08;
  col += texture2D(uTex, uv + px * vec2( 0.0,-2.0)).rgb * 0.08;
  col += texture2D(uTex, uv + px * vec2( 4.0, 4.0)).rgb * 0.045;
  col += texture2D(uTex, uv + px * vec2(-4.0, 4.0)).rgb * 0.045;
  col += texture2D(uTex, uv + px * vec2( 4.0,-4.0)).rgb * 0.045;
  col += texture2D(uTex, uv + px * vec2(-4.0,-4.0)).rgb * 0.045;
  col += texture2D(uTex, uv + px * vec2( 8.0, 0.0)).rgb * 0.03;
  col += texture2D(uTex, uv + px * vec2(-8.0, 0.0)).rgb * 0.03;
  col += texture2D(uTex, uv + px * vec2( 0.0, 8.0)).rgb * 0.03;
  col += texture2D(uTex, uv + px * vec2( 0.0,-8.0)).rgb * 0.03;

  // vignette
  vec2 d = uv - 0.5;
  float vig = 1.0 - dot(d, d) * 0.9;
  col *= vig;

  // grain
  float g = hash(uv * uRes + fract(uTime) * 61.7);
  col += (g - 0.5) * 0.03;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private postProg: WebGLProgram;
  private buf: WebGLBuffer;
  private quadBuf: WebGLBuffer;
  private fbo: WebGLFramebuffer | null = null;
  private fboTex: WebGLTexture | null = null;
  private verts = new Float32Array(MAX_VERTS * 6);
  private count = 0;

  width = 1;
  height = 1;
  private dpr = 1;
  private mode: "screen" | "world" = "world";
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private shakeX = 0;
  private shakeY = 0;
  private uLoc: Record<string, WebGLUniformLocation | null> = {};
  private uPost: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL не поддерживается этим браузером");
    this.gl = gl;
    this.prog = this.makeProgram(VS, FS);
    this.postProg = this.makeProgram(POST_VS, POST_FS);
    const b = gl.createBuffer();
    const qb = gl.createBuffer();
    if (!b || !qb) throw new Error("Не удалось создать буферы WebGL");
    this.buf = b;
    this.quadBuf = qb;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
  }

  private makeShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error("shader alloc failed");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("shader: " + gl.getShaderInfoLog(s));
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
      throw new Error("link: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(2, Math.floor(cssW * this.dpr));
    const h = Math.max(2, Math.floor(cssH * this.dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.gl;
    if (this.fboTex) gl.deleteTexture(this.fboTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  beginFrame() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.count = 0;
  }

  setMode(m: "screen" | "world") {
    if (m !== this.mode) {
      this.flush();
      this.mode = m;
    }
  }

  setCamera(camX: number, camY: number, zoom: number, shakeX: number, shakeY: number) {
    this.camX = camX;
    this.camY = camY;
    this.zoom = zoom;
    this.shakeX = shakeX * this.dpr;
    this.shakeY = shakeY * this.dpr;
  }

  pushLine(x1: number, y1: number, x2: number, y2: number, c: RGBA) {
    if (this.count + 2 > MAX_VERTS) this.flush();
    const v = this.verts;
    let i = this.count * 6;
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

  circle(cx: number, cy: number, r: number, c: RGBA, segs = 48) {
    if (r <= 0.5) return;
    const n = Math.max(8, Math.min(segs, Math.floor(r * 0.5) + 10));
    let px = cx + r;
    let py = cy;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const nx = cx + Math.cos(a) * r;
      const ny = cy + Math.sin(a) * r;
      this.pushLine(px, py, nx, ny, c);
      px = nx;
      py = ny;
    }
  }

  dashedCircle(cx: number, cy: number, r: number, c: RGBA, dashes: number, phase: number, gapRatio = 0.45) {
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

  private flush() {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, this.count * 6), gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, "aPos");
    const aColor = gl.getAttribLocation(this.prog, "aColor");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 24, 8);
    this.uLoc.uRes = gl.getUniformLocation(this.prog, "uRes");
    this.uLoc.uCam = gl.getUniformLocation(this.prog, "uCam");
    this.uLoc.uZoom = gl.getUniformLocation(this.prog, "uZoom");
    this.uLoc.uShake = gl.getUniformLocation(this.prog, "uShake");
    this.uLoc.uMode = gl.getUniformLocation(this.prog, "uMode");
    gl.uniform2f(this.uLoc.uRes, this.width / this.dpr, this.height / this.dpr);
    if (this.mode === "world") {
      gl.uniform1i(this.uLoc.uMode, 1);
      gl.uniform2f(this.uLoc.uCam, this.camX - this.width / 2 / this.dpr / this.zoom, this.camY - this.height / 2 / this.dpr / this.zoom);
      gl.uniform1f(this.uLoc.uZoom, this.zoom);
      gl.uniform2f(this.uLoc.uShake, this.shakeX / this.zoom, this.shakeY / this.zoom);
    } else {
      gl.uniform1i(this.uLoc.uMode, 0);
      gl.uniform2f(this.uLoc.uCam, 0, 0);
      gl.uniform1f(this.uLoc.uZoom, 1);
      gl.uniform2f(this.uLoc.uShake, 0, 0);
    }
    gl.drawArrays(gl.LINES, 0, this.count);
    this.count = 0;
  }

  finish(time: number) {
    const gl = this.gl;
    this.flush();
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.postProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    const aPos = gl.getAttribLocation(this.postProg, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    this.uPost.uTex = gl.getUniformLocation(this.postProg, "uTex");
    this.uPost.uRes = gl.getUniformLocation(this.postProg, "uRes");
    this.uPost.uTime = gl.getUniformLocation(this.postProg, "uTime");
    gl.uniform1i(this.uPost.uTex, 0);
    gl.uniform2f(this.uPost.uRes, this.width, this.height);
    gl.uniform1f(this.uPost.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

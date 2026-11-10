/* The mobile opening uses one cached glyph and one GPU draw per frame. The DOM
 * renderer remains the fallback; both paths use the same measured geometry. */
import { createIntroProfile } from './mobile-intro-profile';
type IntroGeometry = {
  wordWidth: number; wordHeight: number; wordStep: number; wordPitch: number;
  rowPitch: number; rowRadius: number; wordRadius: number; revealStep: number;
  travel: number; duration: number;
};

function curve(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const t = (lo + hi) / 2, u = 1 - t;
    if (3 * u * u * t * a + 3 * u * t * t * c + t * t * t < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2, u = 1 - t;
  return 3 * u * u * t * b + 3 * u * t * t * d + t * t * t;
}

// Original CSS shift: one second forward, one second in reverse. Interpolate
// angles (not matrix coefficients), including the reversed easing function.
const shifts = [[0,0,0],[400,0,0],[410,10,0],[420,-10,0],[440,0,0],
  [580,0,0],[590,40,10],[600,-40,-10],[610,0,0],[630,10,-5],
  [650,0,0],[690,0,0],[700,-50,-20],[710,10,-10],[730,0,0],[1000,0,0]];
const offsets = [[0,0],[-3,3],[-3,-3],[3,3],[3,-3],[0,0]];
function skewAt(time: number): number[] {
  let t = time % 2000;
  if (t > 1000) t = 2000 - t;
  let i = 0;
  while (i < shifts.length - 2 && shifts[i + 1][0] < t) i++;
  const a = shifts[i], b = shifts[i + 1];
  const q = curve((t - a[0]) / (b[0] - a[0]), .42, 0, .58, 1);
  return [1,2].map(k => Math.tan((a[k] + (b[k] - a[k]) * q) * Math.PI / 180));
}
function colorAt(time: number, reverse: boolean): number[] {
  const phase = (time % 400) / 80, p = reverse ? 5 - phase : phase;
  const i = Math.min(4, Math.floor(p));
  const q = curve(p - i, .25, .46, .45, .94);
  return offsets[i].map((v, k) => v + (offsets[i + 1][k] - v) * q);
}

function startMobileIntro(loader: HTMLElement, word: HTMLElement, geometry: IntroGeometry,
  complete: () => void): (() => void) | null {
  const canvas = document.createElement('canvas');
  const profile = createIntroProfile(loader);
  let gl: WebGLRenderingContext | null = null;
  let clock: Animation | null = null, frame = 0, stopped = false;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clock?.cancel();
    window.removeEventListener('resize', finish);
    canvas.removeEventListener('webglcontextlost', finish);
    canvas.remove();
    if (gl) {
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
      shaders.forEach(shader => gl!.deleteShader(shader));
    }
  };
  const finish = (event?: Event) => {
    profile?.ending(event?.type || 'finished'); cleanup(); complete();
  };
  try {
    const style = getComputedStyle(word);
    const width = parseFloat(style.width), height = parseFloat(style.height);
    const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1, density = dpr * 2, pad = 4;
    const glyph = document.createElement('canvas');
    const ink = glyph.getContext('2d');
    // Older engines keep their original CSS animation, including letter spacing.
    if (!ink || !('letterSpacing' in ink)) { profile?.fallback('canvas-letter-spacing-unavailable'); return null; }
    glyph.width = Math.ceil((width + pad * 2) * density);
    glyph.height = Math.ceil((height + pad * 2) * density);

    // Measure the actual font baseline without inheriting the wall's rotation.
    const measure = document.createElement('span');
    measure.style.cssText = `position:fixed;visibility:hidden;white-space:nowrap;` +
      `font:${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily};` +
      `letter-spacing:${style.letterSpacing}`;
    measure.textContent = word.textContent;
    const baselineProbe = document.createElement('span');
    baselineProbe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    measure.append(baselineProbe); loader.append(measure);
    const baseline = baselineProbe.getBoundingClientRect().top - measure.getBoundingClientRect().top;
    measure.remove();
    ink.scale(density, density);
    ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ink.letterSpacing = style.letterSpacing;
    ink.fillStyle = '#fff';
    ink.fillText(word.textContent || '', pad, baseline + pad);

    const rows = [];
    const { rowRadius, wordRadius, rowPitch, wordPitch, wordStep, revealStep, travel } = geometry;
    const extremeX = Math.tan(50 * Math.PI / 180), extremeY = Math.tan(20 * Math.PI / 180);
    const halfWordX = (geometry.wordWidth * (1 + extremeX * extremeY) + geometry.wordHeight * extremeX) / 2 + 10;
    const halfWordY = (geometry.wordHeight + geometry.wordWidth * extremeY) / 2 + 22;
    for (let index = -rowRadius; index <= rowRadius; index++) {
      const phase = index * .381966;
      const order = index === 0 ? 0 : Math.abs(index) * 2 - (index < 0 ? 1 : 0);
      const y = index * rowPitch, x = Math.round((phase - Math.round(phase)) * wordPitch);
      const minX = Math.max(y - halfWordY - viewportWidth / Math.SQRT2, -y - halfWordY - viewportHeight / Math.SQRT2);
      const maxX = Math.min(y + halfWordY + viewportWidth / Math.SQRT2, -y + halfWordY + viewportHeight / Math.SQRT2);
      const direction = index % 2 === 0 ? -1 : 1;
      const firstWord = direction < 0 ? Math.max(-wordRadius, Math.ceil((minX - halfWordX - x) / wordStep)) : -wordRadius;
      const lastWord = direction > 0 ? Math.min(wordRadius, Math.floor((maxX + halfWordX - x) / wordStep)) : wordRadius;
      if (minX > maxX || firstWord > lastWord) continue;
      rows.push({ x, y, minX, maxX, firstWord, lastWord,
        reveal: order * revealStep, exit: 1550 + Math.abs(index) * 18,
        travel: direction * travel });
    }

    canvas.className = 'm-intro-surface';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.round(viewportWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    // Keep an RGBA backbuffer. alpha:false can require expensive RGB emulation
    // on mobile drivers; clearing to alpha=1 keeps exactly the same black wall.
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false,
      stencil: false, preserveDrawingBuffer: false });
    if (!gl) { profile?.fallback('webgl-unavailable'); return null; }
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    if (rows.length + 8 > gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) ||
        glyph.width > maxTexture || glyph.height > maxTexture ||
        canvas.width > maxViewport[0] || canvas.height > maxViewport[1]) {
      profile?.fallback('gpu-limits'); cleanup(); return null;
    }
    const compile = (type: number, source: string) => {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error('Intro shader unavailable');
      shaders.push(shader);
      gl!.shaderSource(shader, source); gl!.compileShader(shader);
      // Compile both shaders before querying the linked result; per-shader
      // status queries serialize compilation and add driver round trips.
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 a_center; attribute vec2 a_local; attribute vec2 a_uv;
      attribute float a_row; attribute float a_colorActive;
      uniform vec2 u_viewport; uniform vec2 u_skew;
      uniform vec3 u_rows[${rows.length}];
      uniform vec2 u_purple; uniform vec2 u_green; uniform float u_allColors;
      varying vec2 v_uv; varying vec2 v_purple; varying vec2 v_green;
      varying float v_opacity;
      void main() {
        vec3 row = u_rows[int(a_row)];
        vec2 p = vec2((1.0+u_skew.x*u_skew.y)*a_local.x+u_skew.x*a_local.y,
                      u_skew.y*a_local.x+a_local.y) + a_center + row.xy;
        p = vec2(p.x-p.y,p.x+p.y)*0.7071067811865476;
        gl_Position = row.z > 0.0 ? vec4(p.x*2.0/u_viewport.x,-p.y*2.0/u_viewport.y,0.0,1.0) : vec4(2.0,2.0,0.0,1.0);
        float active = max(a_colorActive,u_allColors);
        v_uv = a_uv; v_purple = a_uv-u_purple*active; v_green = a_uv-u_green*active;
        v_opacity = row.z;
      }`);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision highp float;
      uniform sampler2D u_glyph;
      varying vec2 v_uv; varying vec2 v_purple; varying vec2 v_green;
      varying float v_opacity;
      void main() {
        float w = texture2D(u_glyph,v_uv).a;
        float purple = texture2D(u_glyph,v_purple).a*0.8;
        float p = purple*(1.0-w);
        float g = texture2D(u_glyph,v_green).a*0.8*(1.0-w)*(1.0-purple);
        gl_FragColor = vec4((vec3(w)+vec3(0.5450980392,0.0,1.0)*p+
          vec3(0.0,0.8980392157,0.4431372549)*g)*v_opacity,(w+p+g)*v_opacity);
      }`);
    program = gl.createProgram();
    if (!program) throw new Error('Intro program unavailable');
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Intro program failed');
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyph);
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [['a_center',2,0],['a_local',2,2],['a_uv',2,4],['a_row',1,6],['a_colorActive',1,7]] as const) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset * 4);
    }
    gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), viewportWidth, viewportHeight);
    const skewUniform = gl.getUniformLocation(program, 'u_skew');
    const purpleUniform = gl.getUniformLocation(program, 'u_purple');
    const greenUniform = gl.getUniformLocation(program, 'u_green');
    const rowsUniform = gl.getUniformLocation(program, 'u_rows[0]');
    const colorsUniform = gl.getUniformLocation(program, 'u_allColors');
    const rowStates = new Float32Array(rows.length * 3);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    const vertices = new Float32Array(rows.length * (wordRadius * 2 + 1) * 6 * 8);
    const corners = [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]];
    const textureWidth = glyph.width / density, textureHeight = glyph.height / density;
    let vertexOffset = 0;
    rows.forEach((row, rowIndex) => {
      for (let i = row.firstWord; i <= row.lastWord; i++) {
        const x = row.x + i * wordStep;
        const colorActive = !(x + halfWordX < row.minX || x - halfWordX > row.maxX) ? 1 : 0;
        for (const [u,v] of corners) {
          vertices[vertexOffset++] = x; vertices[vertexOffset++] = row.y;
          vertices[vertexOffset++] = -width / 2 - pad + u * textureWidth;
          vertices[vertexOffset++] = -height / 2 - pad + v * textureHeight;
          vertices[vertexOffset++] = u; vertices[vertexOffset++] = v;
          vertices[vertexOffset++] = rowIndex; vertices[vertexOffset++] = colorActive;
        }
      }
    });
    // Immutable glyph geometry stays on the GPU. Each frame sends only three
    // floats per row, rather than reallocating/uploading every word's vertices.
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, vertexOffset), gl.STATIC_DRAW);
    const draw = (time: number) => {
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      const [sx, sy] = skewAt(time), purple = colorAt(time, false), green = colorAt(time, true);
      gl!.uniform2f(skewUniform, sx, sy);
      gl!.uniform2f(purpleUniform, purple[0] / textureWidth, purple[1] / textureHeight);
      gl!.uniform2f(greenUniform, green[0] / textureWidth, green[1] / textureHeight);
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const reveal = curve((time - row.reveal) / 240, .2, .7, .25, 1);
        const exit = curve((time - row.exit) / 460, .55, .05, .95, .45);
        rowStates[index * 3] = row.travel * exit;
        rowStates[index * 3 + 1] = 12 * (1 - reveal);
        rowStates[index * 3 + 2] = reveal;
      }
      gl!.uniform3fv(rowsUniform, rowStates);
      gl!.uniform1f(colorsUniform, time >= 1200 ? 1 : 0);
      gl!.drawArrays(gl!.TRIANGLES, 0, vertexOffset / 8);
    };
    // An empty Web Animation supplies the same document clock as the CSS path,
    // without asking style/layout to sample hundreds of animated elements.
    clock = new Animation(new KeyframeEffect(canvas, [], { duration: geometry.duration, fill: 'both' }), document.timeline);
    clock.id = 'mobile-intro-clock';
    const tick = () => {
      if (stopped) return;
      if (!loader.isConnected || loader.classList.contains('hidden')) { cleanup(); return; }
      const time = Number(clock!.currentTime) || 0;
      const drawStarted = profile?.beginDraw();
      draw(time);
      if (drawStarted !== undefined) profile!.endDraw(time,drawStarted);
      if (time >= geometry.duration) finish();
      else frame = requestAnimationFrame(tick);
    };
    draw(0);
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) {
      profile?.fallback('gpu-initialization'); cleanup(); return null;
    }
    profile?.attachGPU(gl);
    loader.append(canvas);
    loader.classList.add('m-intro-cached', 'm-intro-ready');
    canvas.addEventListener('webglcontextlost', finish, { once: true });
    window.addEventListener('resize', finish, { once: true });
    clock.play(); frame = requestAnimationFrame(tick);
    return cleanup;
  } catch (error) {
    profile?.fallback(error instanceof Error ? error.message : 'renderer-initialization');
    cleanup();
    loader.classList.remove('m-intro-cached');
    return null;
  }
}

(window as any).__startMobileIntro = startMobileIntro;

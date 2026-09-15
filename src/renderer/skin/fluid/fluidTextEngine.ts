/**
 * WebGL fluid — ported from Ksenia Kondrashova's CodePen
 * https://codepen.io/ksenia-k/pen/MWMObrY
 *
 * Shaders live in ./vendor/*.glsl (extracted from the pen).
 * Adaptations for Lab Agent only:
 * - mounts into a host element (full-window atmosphere)
 * - no lil-gui
 * - fluid text left blank (DOM already shows "Lab Code")
 * - canvas is pointer-events:none; listens on window
 */

import vertShader from "./vendor/vertShader.glsl?raw";
import fragShaderAdvection from "./vendor/fragShaderAdvection.glsl?raw";
import fragShaderDivergence from "./vendor/fragShaderDivergence.glsl?raw";
import fragShaderPressure from "./vendor/fragShaderPressure.glsl?raw";
import fragShaderGradientSubtract from "./vendor/fragShaderGradientSubtract.glsl?raw";
import fragShaderPoint from "./vendor/fragShaderPoint.glsl?raw";
import fragShaderOutputShader from "./vendor/fragShaderOutputShader.glsl?raw";

type FBO = {
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  attach: (id: number) => number;
};

type DoubleFBO = {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: () => FBO;
  write: () => FBO;
  swap: () => void;
};

type ProgramBag = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

export type FluidTextHandle = {
  resize: () => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

const SHADERS: Record<string, string> = {
  vertShader,
  fragShaderAdvection,
  fragShaderDivergence,
  fragShaderPressure,
  fragShaderGradientSubtract,
  fragShaderPoint,
  fragShaderOutputShader,
};

export function startFluidText(host: HTMLElement): FluidTextHandle {
  const canvasEl = document.createElement("canvas");
  canvasEl.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;";
  canvasEl.setAttribute("aria-hidden", "true");
  host.appendChild(canvasEl);

  const textureEl = document.createElement("canvas");
  const textureCtx = textureEl.getContext("2d")!;

  // Original params — text blanked (DOM title owns Lab Code)
  const params = {
    pointerSize: null as number | null,
    color: { r: 1, g: 0, b: 0.5 },
    text: "",
  };

  const pointer = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    moved: false,
  };

  let outputColor!: DoubleFBO;
  let velocity!: DoubleFBO;
  let divergence!: FBO;
  let pressure!: DoubleFBO;
  let canvasTexture!: WebGLTexture;
  let isPreview = true;
  /** After pointer goes quiet: opening-speed path, thinner ink (not slower — slower piles ink) */
  let softIdle = false;
  let lastPointerAt = 0;
  let softFrame = 0;
  const IDLE_RESUME_MS = 1800;
  const SOFT_SIZE_SCALE = 0.75;
  const SOFT_INK_SCALE = 0.32;
  /** Slightly under opening's dx*5 */
  const SOFT_DX_SCALE = 4;
  let alive = true;
  let active = true;
  let raf = 0;

  const gl = canvasEl.getContext("webgl", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL unavailable");
  gl.getExtension("OES_texture_float");
  gl.getExtension("OES_texture_float_linear");
  gl.getExtension("WEBGL_color_buffer_float");

  function createShader(sourceCode: string, type: number) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, sourceCode);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const info = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(info || "shader compile failed");
    }
    return shader;
  }

  function createShaderProgram(vs: WebGLShader, fs: WebGLShader) {
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vs);
    gl!.attachShader(program, fs);
    gl!.linkProgram(program);
    if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
      throw new Error(gl!.getProgramInfoLog(program) || "link failed");
    }
    return program;
  }

  function getUniforms(program: WebGLProgram) {
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const uniformCount = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl!.getActiveUniform(program, i);
      if (!info) continue;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name);
    }
    return uniforms;
  }

  const vertexShader = createShader(SHADERS.vertShader!, gl.VERTEX_SHADER);

  function createProgram(fragId: keyof typeof SHADERS): ProgramBag {
    const fs = createShader(SHADERS[fragId]!, gl.FRAGMENT_SHADER);
    const program = createShaderProgram(vertexShader, fs);
    return { program, uniforms: getUniforms(program) };
  }

  const splatProgram = createProgram("fragShaderPoint");
  const divergenceProgram = createProgram("fragShaderDivergence");
  const pressureProgram = createProgram("fragShaderPressure");
  const gradientSubtractProgram = createProgram("fragShaderGradientSubtract");
  const advectionProgram = createProgram("fragShaderAdvection");
  const outputShaderProgram = createProgram("fragShaderOutputShader");

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW,
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target: FBO | null) {
    if (target == null) {
      gl!.viewport(0, 0, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    } else {
      gl!.viewport(0, 0, target.width, target.height);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fbo);
    }
    gl!.drawElements(gl!.TRIANGLES, 6, gl!.UNSIGNED_SHORT, 0);
  }

  function createFBO(w: number, h: number, type: number = gl.RGBA): FBO {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Prefer original type; fall back to RGBA if RG unsupported as renderable
    let internal = type;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, internal, gl.FLOAT, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && type !== gl.RGBA) {
      internal = gl.RGBA;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, internal, gl.FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      fbo,
      width: w,
      height: h,
      attach(id: number) {
        gl!.activeTexture(gl!.TEXTURE0 + id);
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(w: number, h: number, type?: number): DoubleFBO {
    let fbo1 = createFBO(w, h, type);
    let fbo2 = createFBO(w, h, type);
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      read: () => fbo1,
      write: () => fbo2,
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function createTextCanvasTexture() {
    canvasTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function updateTextCanvas() {
    // Blank — no fluid letterforms (DOM owns the title)
    textureCtx.fillStyle = "black";
    textureCtx.fillRect(0, 0, textureEl.width, textureEl.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureEl);
  }

  function bindTextTexture(program: ProgramBag) {
    const loc = program.uniforms.u_text_texture;
    if (!loc) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
    gl.uniform1i(loc, 0);
  }

  function initFBOs() {
    const fboSize = [
      Math.floor(0.5 * Math.max(1, host.clientWidth)),
      Math.floor(0.5 * Math.max(1, host.clientHeight)),
    ];
    outputColor = createDoubleFBO(fboSize[0]!, fboSize[1]!);
    velocity = createDoubleFBO(fboSize[0]!, fboSize[1]!, gl.RG);
    divergence = createFBO(fboSize[0]!, fboSize[1]!, gl.RGB);
    pressure = createDoubleFBO(fboSize[0]!, fboSize[1]!, gl.RGB);
  }

  function resizeCanvas() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    params.pointerSize = 4 / h;
    canvasEl.width = textureEl.width = w;
    canvasEl.height = textureEl.height = h;
    initFBOs();
    updateTextCanvas();
  }

  function updateMousePosition(eX: number, eY: number, dxScale = 5) {
    pointer.moved = true;
    pointer.dx = dxScale * (eX - pointer.x);
    pointer.dy = dxScale * (eY - pointer.y);
    pointer.x = eX;
    pointer.y = eY;
  }

  function onPointerMove(e: PointerEvent) {
    if (!active) return;
    const rect = host.getBoundingClientRect();
    isPreview = false;
    softIdle = false;
    lastPointerAt = performance.now();
    updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
  }

  function render(t?: number) {
    if (!alive) return;
    raf = requestAnimationFrame(render);
    if (!active) return;

    const dt = 1 / 60;
    const w = canvasEl.width;
    const h = canvasEl.height;
    const now = performance.now();

    // Layer ③ only: after real pointer goes quiet → mid continuous ripple
    if (
      !isPreview &&
      !softIdle &&
      lastPointerAt > 0 &&
      now - lastPointerAt >= IDLE_RESUME_MS
    ) {
      softIdle = true;
    }

    if (t && isPreview) {
      // Layer ① opening — full CodePen path (unchanged)
      updateMousePosition(
        (0.5 - 0.45 * Math.sin(0.003 * t - 2)) * w,
        (0.5 + 0.1 * Math.sin(0.0025 * t) + 0.1 * Math.cos(0.002 * t)) * h,
      );
    } else if (softIdle && t) {
      // Same speed/amplitude as opening — thinning is ink/frame rate, not slower motion
      updateMousePosition(
        (0.5 - 0.45 * Math.sin(0.003 * t - 2)) * w,
        (0.5 + 0.1 * Math.sin(0.0025 * t) + 0.1 * Math.cos(0.002 * t)) * h,
        SOFT_DX_SCALE,
      );
      softFrame += 1;
    }

    if (pointer.moved) {
      // Opening + softIdle keep continuous splat; real pointer clears each frame
      if (!isPreview && !softIdle) {
        pointer.moved = false;
      }

      const sizeMul = softIdle ? SOFT_SIZE_SCALE : 1;
      // Soft idle: inject color every other frame so ink does not stack as dense as opening
      const injectColor = !softIdle || softFrame % 2 === 0;
      const inkMul = softIdle ? SOFT_INK_SCALE : 1;

      gl.useProgram(splatProgram.program);
      bindTextTexture(splatProgram);
      gl.uniform1i(splatProgram.uniforms.u_input_texture!, velocity.read().attach(1));
      gl.uniform1f(splatProgram.uniforms.u_ratio!, w / Math.max(1, h));
      gl.uniform2f(splatProgram.uniforms.u_point!, pointer.x / w, 1 - pointer.y / h);
      gl.uniform3f(splatProgram.uniforms.u_point_value!, pointer.dx, -pointer.dy, 1);
      gl.uniform1f(splatProgram.uniforms.u_point_size!, params.pointerSize! * sizeMul);
      blit(velocity.write());
      velocity.swap();

      if (injectColor) {
        gl.uniform1i(splatProgram.uniforms.u_input_texture!, outputColor.read().attach(1));
        gl.uniform3f(
          splatProgram.uniforms.u_point_value!,
          (1 - params.color.r) * inkMul,
          (1 - params.color.g) * inkMul,
          (1 - params.color.b) * inkMul,
        );
        blit(outputColor.write());
        outputColor.swap();
      }
    }

    gl.useProgram(divergenceProgram.program);
    gl.uniform2f(divergenceProgram.uniforms.u_texel!, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture!, velocity.read().attach(1));
    blit(divergence);

    gl.useProgram(pressureProgram.program);
    bindTextTexture(pressureProgram);
    gl.uniform2f(pressureProgram.uniforms.u_texel!, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.u_divergence_texture!, divergence.attach(1));
    for (let i = 0; i < 10; i++) {
      gl.uniform1i(pressureProgram.uniforms.u_pressure_texture!, pressure.read().attach(2));
      blit(pressure.write());
      pressure.swap();
    }

    gl.useProgram(gradientSubtractProgram.program);
    gl.uniform2f(
      gradientSubtractProgram.uniforms.u_texel!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl.uniform1i(
      gradientSubtractProgram.uniforms.u_pressure_texture!,
      pressure.read().attach(1),
    );
    gl.uniform1i(
      gradientSubtractProgram.uniforms.u_velocity_texture!,
      velocity.read().attach(2),
    );
    blit(velocity.write());
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    bindTextTexture(advectionProgram);
    gl.uniform1f(advectionProgram.uniforms.u_use_text!, 0);
    gl.uniform2f(advectionProgram.uniforms.u_texel!, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_velocity_texture!, velocity.read().attach(1));
    gl.uniform1i(advectionProgram.uniforms.u_input_texture!, velocity.read().attach(1));
    gl.uniform1f(advectionProgram.uniforms.u_dt!, dt);
    blit(velocity.write());
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    bindTextTexture(advectionProgram);
    gl.uniform1f(advectionProgram.uniforms.u_use_text!, 1);
    gl.uniform2f(
      advectionProgram.uniforms.u_texel!,
      outputColor.texelSizeX,
      outputColor.texelSizeY,
    );
    gl.uniform1i(advectionProgram.uniforms.u_velocity_texture!, velocity.read().attach(1));
    gl.uniform1i(advectionProgram.uniforms.u_input_texture!, outputColor.read().attach(2));
    gl.uniform1f(advectionProgram.uniforms.u_dt!, dt);
    blit(outputColor.write());
    outputColor.swap();

    gl.useProgram(outputShaderProgram.program);
    bindTextTexture(outputShaderProgram);
    gl.uniform1i(outputShaderProgram.uniforms.u_output_texture!, outputColor.read().attach(1));
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  createTextCanvasTexture();
  resizeCanvas();
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(host);
  raf = requestAnimationFrame(render);

  return {
    resize: resizeCanvas,
    setActive(next: boolean) {
      active = next;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      ro.disconnect();
      canvasEl.remove();
    },
  };
}

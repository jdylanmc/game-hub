import type { GameDefinition, GameHost, GameInstance } from '../game-contract';

interface DemoOptions {
  id: string;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  secondaryAccent: string;
  rotationDirection: number;
}

const vertexShaderSource = `
  attribute vec2 position;
  uniform float rotation;
  varying vec3 color;

  void main() {
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 rotated = mat2(c, -s, s, c) * position;
    gl_Position = vec4(rotated, 0.0, 1.0);
    color = vec3(position.x * 0.5 + 0.5, position.y * 0.5 + 0.5, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec3 color;
  uniform vec3 tint;

  void main() {
    gl_FragColor = vec4(color * tint, 1.0);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error('Unable to create a WebGL shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Unable to create a WebGL program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown WebGL program link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function createWebGlGame(
  canvas: HTMLCanvasElement,
  host: GameHost,
  options: DemoOptions,
): GameInstance {
  const gl = canvas.getContext('webgl', { antialias: true });

  if (!gl) {
    throw new Error('WebGL is unavailable in this browser.');
  }

  const program = createProgram(gl);
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error('Unable to create a WebGL vertex buffer.');
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0.72, -0.68, -0.52, 0.68, -0.52]),
    gl.STATIC_DRAW,
  );

  const position = gl.getAttribLocation(program, 'position');
  const rotation = gl.getUniformLocation(program, 'rotation');
  const tint = gl.getUniformLocation(program, 'tint');
  const tintColor = hexToRgb(options.accent);
  let frameId = 0;
  let startedAt = 0;
  let disposed = false;

  const reportScore = () => {
    const secondsPlayed = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
    host.reportScore({
      gameId: options.id,
      score: secondsPlayed * 10,
      occurredAt: new Date().toISOString(),
      metadata: { source: 'webgl-placeholder' },
    });
  };

  const render = (time: number) => {
    if (disposed) {
      return;
    }

    const width = canvas.clientWidth * window.devicePixelRatio;
    const height = canvas.clientHeight * window.devicePixelRatio;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.025, 0.035, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(rotation, time * 0.00045 * options.rotationDirection);
    gl.uniform3fv(tint, tintColor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameId = window.requestAnimationFrame(render);
  };

  return {
    start() {
      startedAt = performance.now();
      canvas.addEventListener('pointerdown', reportScore);
      frameId = window.requestAnimationFrame(render);
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener('pointerdown', reportScore);
      window.cancelAnimationFrame(frameId);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

export function createDemoGame(options: DemoOptions): GameDefinition {
  return {
    ...options,
    create: (canvas, host) => createWebGlGame(canvas, host, options),
  };
}

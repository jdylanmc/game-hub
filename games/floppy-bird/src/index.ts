import type {
  GameHost,
  GameInstance,
  GameManifest,
} from '@game-hub/game-contract';
import manifestData from '../game.manifest.json';
import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

const manifest = manifestData as GameManifest;

const VIEW_HEIGHT = 22;
const PLAYFIELD_TOP = 9.5;
const PLAYFIELD_BOTTOM = -9.5;
const BIRD_X = -6.4;
const BIRD_RADIUS = 0.85;
const FLAP_VELOCITY = 7.4;
const GRAVITY = 20.5;
const BASE_SPEED = 7.2;
const MAX_SPEED = 10.6;
const BASE_GAP = 5.8;
const MIN_GAP = 4.35;
const BASE_SPACING = 8.8;
const MIN_SPACING = 7.1;
const OBSTACLE_WIDTH = 2.4;
const OBSTACLE_COLORS = ['#38bdf8', '#f59e0b', '#34d399', '#fb7185', '#a855f7'];
const GAP_PATTERN_Y = [-3.8, -2.3, -0.9, 0.9, 2.3, 3.8];
const INITIAL_GAP_SEQUENCE = [2, 4, 1, 5];
const INITIAL_STYLE_SEQUENCE = [0, 2, 1, 4];

interface Obstacle {
  accentRing: Mesh;
  bottomSegment: Mesh;
  colorIndex: number;
  gapHeight: number;
  gapY: number;
  group: Group;
  scored: boolean;
  topSegment: Mesh;
  x: number;
}

interface ParallaxMarker {
  mesh: Mesh;
  offset: number;
  speedScale: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function disposeSceneGraph(root: Object3D): void {
  root.traverse((node: Object3D) => {
    const geometry = (node as { geometry?: BufferGeometry }).geometry;
    const material = (node as { material?: Material | Material[] }).material;

    geometry?.dispose();

    if (material) {
      disposeMaterial(material);
    }
  });
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('button, input, textarea, select, a[href]');
}

function createWingGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0.8);
  shape.lineTo(1.35, 0);
  shape.lineTo(0, -0.8);
  shape.closePath();
  return new ShapeGeometry(shape);
}

function createObstacle(styleColor: string): Obstacle {
  const group = new Group();
  const segmentGeometry = new BoxGeometry(OBSTACLE_WIDTH, 1, 1.1);
  const ringGeometry = new TorusGeometry(0.68, 0.11, 12, 28);
  const segmentMaterial = new MeshStandardMaterial({
    color: '#0f172a',
    emissive: new Color(styleColor),
    emissiveIntensity: 0.28,
    metalness: 0.1,
    roughness: 0.5,
  });
  const ringMaterial = new MeshStandardMaterial({
    color: styleColor,
    emissive: new Color(styleColor),
    emissiveIntensity: 0.8,
    metalness: 0.15,
    roughness: 0.25,
  });

  const topSegment = new Mesh(segmentGeometry, segmentMaterial.clone());
  const bottomSegment = new Mesh(segmentGeometry, segmentMaterial.clone());
  const accentRing = new Mesh(ringGeometry, ringMaterial);

  topSegment.castShadow = true;
  bottomSegment.castShadow = true;
  accentRing.castShadow = true;

  group.add(topSegment, bottomSegment, accentRing);

  return {
    accentRing,
    bottomSegment,
    colorIndex: 0,
    gapHeight: BASE_GAP,
    gapY: 0,
    group,
    scored: false,
    topSegment,
    x: 0,
  };
}

function setObstacleLayout(obstacle: Obstacle): void {
  const topHeight = PLAYFIELD_TOP - (obstacle.gapY + obstacle.gapHeight / 2);
  const bottomHeight = obstacle.gapY - obstacle.gapHeight / 2 - PLAYFIELD_BOTTOM;

  obstacle.group.position.x = obstacle.x;
  obstacle.topSegment.scale.y = topHeight;
  obstacle.bottomSegment.scale.y = bottomHeight;
  obstacle.topSegment.position.set(0, obstacle.gapY + obstacle.gapHeight / 2 + topHeight / 2, 0);
  obstacle.bottomSegment.position.set(0, PLAYFIELD_BOTTOM + bottomHeight / 2, 0);
  obstacle.accentRing.position.set(0, obstacle.gapY, 0.2);
}

function setObstacleColor(obstacle: Obstacle, colorIndex: number): void {
  obstacle.colorIndex = colorIndex;
  const color = OBSTACLE_COLORS[colorIndex];
  const topMaterial = obstacle.topSegment.material as MeshStandardMaterial;
  const bottomMaterial = obstacle.bottomSegment.material as MeshStandardMaterial;
  const ringMaterial = obstacle.accentRing.material as MeshStandardMaterial;

  topMaterial.emissive.set(color);
  bottomMaterial.emissive.set(color);
  ringMaterial.color.set(color);
  ringMaterial.emissive.set(color);
}

function resizeRenderer(
  camera: OrthographicCamera,
  renderer: WebGLRenderer,
  canvas: HTMLCanvasElement,
): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height, false);

  const aspect = width / height;
  const viewWidth = VIEW_HEIGHT * aspect;
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = VIEW_HEIGHT / 2;
  camera.bottom = -VIEW_HEIGHT / 2;
  camera.updateProjectionMatrix();
}

export { manifest };

export function createGame(canvas: HTMLCanvasElement, host: GameHost): GameInstance {
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  const scene = new Scene();
  const camera = new OrthographicCamera(-16, 16, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 100);
  const backgroundPlane = new Mesh(
    new PlaneGeometry(70, 40),
    new MeshBasicMaterial({ color: '#020617' }),
  );
  const glowPlane = new Mesh(
    new CircleGeometry(9, 48),
    new MeshBasicMaterial({ color: manifest.accent, transparent: true, opacity: 0.12 }),
  );
  const floor = new Mesh(
    new BoxGeometry(60, 1.35, 0.9),
    new MeshStandardMaterial({
      color: '#0f172a',
      emissive: new Color('#1d4ed8'),
      emissiveIntensity: 0.22,
      metalness: 0.05,
      roughness: 0.45,
    }),
  );
  const ceiling = new Mesh(
    new BoxGeometry(60, 0.65, 0.65),
    new MeshStandardMaterial({
      color: '#0f172a',
      emissive: new Color('#0ea5e9'),
      emissiveIntensity: 0.12,
      metalness: 0.05,
      roughness: 0.45,
    }),
  );
  const bird = new Group();
  const body = new Mesh(
    new BoxGeometry(1.8, 1.8, 0.8),
    new MeshStandardMaterial({
      color: '#2563eb',
      emissive: new Color('#2563eb'),
      emissiveIntensity: 0.18,
      metalness: 0.18,
      roughness: 0.36,
    }),
  );
  const label = new Mesh(
    new BoxGeometry(1.12, 0.78, 0.09),
    new MeshStandardMaterial({
      color: '#f8fafc',
      emissive: new Color('#f8fafc'),
      emissiveIntensity: 0.04,
      roughness: 0.5,
    }),
  );
  const shutter = new Mesh(
    new BoxGeometry(0.42, 0.42, 0.12),
    new MeshStandardMaterial({
      color: '#020617',
      emissive: new Color('#0f172a'),
      emissiveIntensity: 0.1,
      roughness: 0.35,
    }),
  );
  const hub = new Mesh(
    new CircleGeometry(0.26, 24),
    new MeshBasicMaterial({ color: '#38bdf8' }),
  );
  const wingGeometry = createWingGeometry();
  const wingMaterial = new MeshStandardMaterial({
    color: '#f59e0b',
    emissive: new Color('#f59e0b'),
    emissiveIntensity: 0.25,
    metalness: 0.05,
    roughness: 0.32,
  });
  const leftWing = new Mesh(wingGeometry, wingMaterial.clone());
  const rightWing = new Mesh(wingGeometry, wingMaterial.clone());
  const obstacles: Obstacle[] = [];
  const floorMarkers: ParallaxMarker[] = [];
  const topMarkers: ParallaxMarker[] = [];

  let animationFrameId = 0;
  let disposed = false;
  let phase: 'ready' | 'running' | 'paused' | 'game-over' = 'ready';
  let phaseBeforePause: 'ready' | 'running' = 'ready';
  let phaseMessage = 'Press Space, click, or tap to flap upward.';
  let score = 0;
  let birdY = 0;
  let birdVelocity = 0;
  let wingBeat = 0;
  let ambience = 0;
  let lastFrameTime = 0;
  let highestObstacleX = 0;
  let submittedScore = false;
  let previousGapIndex = INITIAL_GAP_SEQUENCE[INITIAL_GAP_SEQUENCE.length - 1];
  let previousStyleIndex = INITIAL_STYLE_SEQUENCE[INITIAL_STYLE_SEQUENCE.length - 1];
  let startedAt = 0;

  renderer.setClearColor(new Color('#020617'));
  renderer.shadowMap.enabled = false;
  camera.position.z = 24;

  backgroundPlane.position.z = -8;
  glowPlane.position.set(-4, 2.5, -6);
  floor.position.y = PLAYFIELD_BOTTOM - 0.9;
  ceiling.position.y = PLAYFIELD_TOP + 0.55;

  const ambientLight = new AmbientLight('#dbeafe', 1.35);
  const directionalLight = new DirectionalLight('#f8fafc', 1.25);
  directionalLight.position.set(12, 18, 22);

  label.position.set(0, 0.1, 0.46);
  shutter.position.set(0.42, 0.48, 0.46);
  hub.position.set(-0.24, -0.1, 0.47);
  leftWing.position.set(-1.18, 0.05, -0.1);
  leftWing.rotation.y = Math.PI;
  rightWing.position.set(1.18, 0.05, -0.1);
  bird.add(body, label, shutter, hub, leftWing, rightWing);

  scene.add(backgroundPlane, glowPlane, floor, ceiling, bird, ambientLight, directionalLight);

  for (let index = 0; index < 4; index += 1) {
    const obstacle = createObstacle(OBSTACLE_COLORS[index % OBSTACLE_COLORS.length]);
    const gapIndex = INITIAL_GAP_SEQUENCE[index % INITIAL_GAP_SEQUENCE.length];
    const styleIndex = INITIAL_STYLE_SEQUENCE[index % INITIAL_STYLE_SEQUENCE.length];
    const x = 9 + index * BASE_SPACING;

    previousGapIndex = gapIndex;
    previousStyleIndex = styleIndex;
    obstacle.x = x;
    obstacle.gapY = GAP_PATTERN_Y[gapIndex];
    obstacle.gapHeight = BASE_GAP;
    obstacle.scored = false;
    setObstacleColor(obstacle, styleIndex);
    setObstacleLayout(obstacle);
    highestObstacleX = x;
    obstacles.push(obstacle);
    scene.add(obstacle.group);
  }

  for (let index = 0; index < 12; index += 1) {
    const floorMarker = new Mesh(
      new BoxGeometry(1.2, 0.14, 0.1),
      new MeshBasicMaterial({ color: '#38bdf8' }),
    );
    const topMarker = new Mesh(
      new BoxGeometry(1.2, 0.08, 0.1),
      new MeshBasicMaterial({ color: '#67e8f9' }),
    );

    floorMarkers.push({
      mesh: floorMarker,
      offset: index * 3.2,
      speedScale: 1 + (index % 3) * 0.15,
      y: PLAYFIELD_BOTTOM - 0.2,
    });
    topMarkers.push({
      mesh: topMarker,
      offset: index * 3.2 + 1.6,
      speedScale: 1 + (index % 4) * 0.12,
      y: PLAYFIELD_TOP + 0.2,
    });

    scene.add(floorMarker, topMarker);
  }

  const emitHud = (detail?: string) => {
    host.emitEvent({
      type: 'hud',
      detail,
      label: 'Gates cleared',
      score,
    });
  };

  const emitPhase = (
    nextPhase: 'ready' | 'running' | 'paused' | 'game-over',
    message: string,
  ) => {
    phase = nextPhase;
    phaseMessage = message;
    host.emitEvent({ type: 'phase', phase: nextPhase, message });
  };

  const emitAnnouncement = (
    message: string,
    politeness: 'polite' | 'assertive' = 'polite',
  ) => {
    host.emitEvent({ type: 'announcement', message, politeness });
  };

  const difficulty = () => clamp(score / 24, 0, 1);
  const obstacleGap = () => lerp(BASE_GAP, MIN_GAP, difficulty());
  const obstacleSpacing = () => lerp(BASE_SPACING, MIN_SPACING, difficulty());
  const flightSpeed = () => lerp(BASE_SPEED, MAX_SPEED, difficulty());

  const nextGapIndex = () => {
    let candidates = GAP_PATTERN_Y
      .map((_, index) => index)
      .filter((index) => index !== previousGapIndex && Math.abs(index - previousGapIndex) > 1);

    if (candidates.length === 0) {
      candidates = GAP_PATTERN_Y
        .map((_, index) => index)
        .filter((index) => index !== previousGapIndex);
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    previousGapIndex = picked;
    return picked;
  };

  const nextStyleIndex = () => {
    const candidates = OBSTACLE_COLORS
      .map((_, index) => index)
      .filter((index) => index !== previousStyleIndex);
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    previousStyleIndex = picked;
    return picked;
  };

  const recycleObstacle = (obstacle: Obstacle) => {
    obstacle.x = highestObstacleX + obstacleSpacing();
    highestObstacleX = obstacle.x;
    obstacle.gapHeight = obstacleGap();
    obstacle.gapY = GAP_PATTERN_Y[nextGapIndex()] * lerp(1, 0.84, difficulty());
    obstacle.scored = false;
    setObstacleColor(obstacle, nextStyleIndex());
    setObstacleLayout(obstacle);
  };

  const finishRun = (reason: string) => {
    if (phase === 'game-over') {
      return;
    }

    emitPhase('game-over', reason);
    emitAnnouncement(`Game over. Final score ${score}.`, 'assertive');
    emitHud('Crash detected. Restart to try another run.');

    if (!submittedScore) {
      submittedScore = true;
      host.submitScore({
        gameId: manifest.id,
        score,
        occurredAt: new Date().toISOString(),
        metadata: {
          durationSeconds: Math.max(0, Math.round((performance.now() - startedAt) / 1000)),
          technology: manifest.technology,
        },
      });
    }
  };

  const flap = () => {
    if (phase === 'paused' || phase === 'game-over') {
      return;
    }

    if (phase === 'ready') {
      startedAt = performance.now();
      emitPhase('running', 'Glide cleanly through the gates and keep the disk centered.');
      emitAnnouncement('Run started.');
    }

    birdVelocity = FLAP_VELOCITY;
    wingBeat = 1;
  };

  const updateMarkers = (time: number, speed: number) => {
    const travelWidth = 36;
    const markerSpeed = speed * 0.65;

    for (const marker of floorMarkers) {
      marker.mesh.position.set(
        18 - ((time * markerSpeed * marker.speedScale + marker.offset) % travelWidth),
        marker.y,
        -0.35,
      );
    }

    for (const marker of topMarkers) {
      marker.mesh.position.set(
        18 - ((time * markerSpeed * marker.speedScale + marker.offset) % travelWidth),
        marker.y,
        -0.25,
      );
    }
  };

  const detectCollision = () => {
    if (birdY + BIRD_RADIUS >= PLAYFIELD_TOP || birdY - BIRD_RADIUS <= PLAYFIELD_BOTTOM) {
      finishRun('The floppy disk clipped the boundary.');
      return;
    }

    for (const obstacle of obstacles) {
      const overlapsX =
        BIRD_X + BIRD_RADIUS > obstacle.x - OBSTACLE_WIDTH / 2 &&
        BIRD_X - BIRD_RADIUS < obstacle.x + OBSTACLE_WIDTH / 2;
      const outsideGap =
        birdY + BIRD_RADIUS > obstacle.gapY + obstacle.gapHeight / 2 ||
        birdY - BIRD_RADIUS < obstacle.gapY - obstacle.gapHeight / 2;

      if (overlapsX && outsideGap) {
        finishRun('A gate closed in before the wings could clear it.');
        return;
      }
    }
  };

  const onPointerDown = () => {
    canvas.focus();
    flap();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || isInteractiveElement(event.target)) {
      return;
    }

    event.preventDefault();
    flap();
  };

  const render = (timestamp: number) => {
    if (disposed) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(render);
    resizeRenderer(camera, renderer, canvas);

    const deltaSeconds = lastFrameTime === 0 ? 0 : Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;

    if (phase !== 'paused') {
      ambience += deltaSeconds;
    }

    const speed = flightSpeed();

    if (phase === 'ready') {
      birdY = Math.sin(ambience * 2.4) * 0.45;
      birdVelocity = 0;
    }

    if (phase === 'running') {
      birdVelocity -= GRAVITY * deltaSeconds;
      birdY += birdVelocity * deltaSeconds;

      for (const obstacle of obstacles) {
        obstacle.x -= speed * deltaSeconds;

        if (!obstacle.scored && obstacle.x + OBSTACLE_WIDTH / 2 < BIRD_X) {
          obstacle.scored = true;
          score += 1;
          emitHud(`Speed ${Math.round(flightSpeed() * 42)} rpm`);
          emitAnnouncement(`Score ${score}.`);
        }

        if (obstacle.x < -19) {
          recycleObstacle(obstacle);
        } else {
          highestObstacleX = Math.max(highestObstacleX, obstacle.x);
          setObstacleLayout(obstacle);
        }
      }

      detectCollision();
    }

    wingBeat = Math.max(0, wingBeat - deltaSeconds * 2.6);
    const wingRotation =
      phase === 'running'
        ? lerp(0.15, 1.2, clamp((birdVelocity + 8) / 16, 0, 1)) + wingBeat * 0.35
        : 0.55 + Math.sin(ambience * 5) * 0.2;

    leftWing.rotation.z = wingRotation;
    rightWing.rotation.z = -wingRotation;
    bird.position.set(BIRD_X, birdY, 0);
    bird.rotation.z = phase === 'running' ? clamp(birdVelocity * 0.06, -0.55, 0.6) : -0.08;
    glowPlane.rotation.z = ambience * 0.1;

    for (const obstacle of obstacles) {
      obstacle.accentRing.rotation.z += deltaSeconds * 0.55;
      setObstacleLayout(obstacle);
    }

    updateMarkers(ambience, speed);
    renderer.render(scene, camera);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  emitPhase('ready', phaseMessage);
  emitHud('Clear the first gate to begin scoring.');
  emitAnnouncement('FloppyBird ready. Press Space, click, or tap to start.');

  return {
    start() {
      render(performance.now());
    },
    pause() {
      if (phase === 'paused' || phase === 'game-over') {
        return;
      }

      phaseBeforePause = phase === 'running' ? 'running' : 'ready';
      emitPhase('paused', 'Paused. Resume when you are ready to flap again.');
      emitAnnouncement('Game paused.');
    },
    resume() {
      if (phase !== 'paused') {
        return;
      }

      const nextPhase = phaseBeforePause;
      lastFrameTime = 0;
      emitPhase(
        nextPhase,
        nextPhase === 'running'
          ? 'Back in the air. Keep the rhythm steady.'
          : 'Press Space, click, or tap to flap upward.',
      );
      emitAnnouncement('Game resumed.');
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(animationFrameId);
      disposeSceneGraph(scene);
      renderer.dispose();
    },
  };
}

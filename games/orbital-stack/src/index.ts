import {
  createSeededRandomSource,
  type GameHost,
  type GameInstance,
  type GameManifest,
  type RandomSource,
  type SimulationClock,
} from '@game-hub/game-contract';
import manifestData from '../game.manifest.json';
import { createOrbitalStackSimulationState, stepOrbitalStackSimulation } from './simulation';
import {
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

const manifest = manifestData as GameManifest;
const VIEW_HEIGHT = 22;

export interface OrbitalStackRuntimeOptions {
  clock?: SimulationClock;
  random?: RandomSource;
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

function resizeRenderer(camera: OrthographicCamera, renderer: WebGLRenderer, canvas: HTMLCanvasElement): void {
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

export function createGame(
  canvas: HTMLCanvasElement,
  host: GameHost,
  runtime: Readonly<OrbitalStackRuntimeOptions> = {},
): GameInstance {
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  const scene = new Scene();
  const camera = new OrthographicCamera(-16, 16, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 100);
  const stackGroup = new Group();
  const orbitGroup = new Group();
  const satellites: Mesh[] = [];
  const stackLayers: Mesh[] = [];

  const clock: SimulationClock = runtime.clock ?? {
    nowMilliseconds: () => performance.now(),
  };
  const random = runtime.random ?? createSeededRandomSource(0x4f524249);

  let animationFrameId: number | null = null;
  let disposed = false;
  let started = false;
  let phase: 'running' | 'paused' = 'running';
  let lastFrame: number | null = null;
  let nextHudUpdateAt = 0;
  let simulation = createOrbitalStackSimulationState();

  renderer.setClearColor(new Color('#020617'));
  camera.position.z = 24;

  const ambientLight = new AmbientLight('#f5d0fe', 1.05);
  const directionalLight = new DirectionalLight('#ffffff', 0.9);
  directionalLight.position.set(10, 14, 16);

  const backdrop = new Mesh(new SphereGeometry(18, 24, 18), new MeshBasicMaterial({ color: '#111827' }));
  backdrop.scale.z = 0.5;
  backdrop.position.z = -14;

  const base = new Mesh(
    new CylinderGeometry(4.2, 4.8, 1.1, 48),
    new MeshStandardMaterial({
      color: '#111827',
      emissive: new Color('#a855f7'),
      emissiveIntensity: 0.16,
      roughness: 0.44,
      metalness: 0.12,
    }),
  );
  base.position.y = -6.2;

  const orbitRing = new Mesh(
    new TorusGeometry(6.4, 0.18, 16, 64),
    new MeshStandardMaterial({
      color: '#f472b6',
      emissive: new Color('#f472b6'),
      emissiveIntensity: 0.34,
      roughness: 0.26,
      metalness: 0.08,
    }),
  );
  orbitRing.rotation.x = Math.PI / 2.65;

  scene.add(backdrop, base, orbitRing, stackGroup, orbitGroup, ambientLight, directionalLight);

  for (let index = 0; index < 6; index += 1) {
    const satellite = new Mesh(
      new SphereGeometry(index % 2 === 0 ? 0.32 : 0.24, 18, 18),
      new MeshBasicMaterial({ color: index % 2 === 0 ? '#c084fc' : '#f472b6' }),
    );
    satellites.push(satellite);
    orbitGroup.add(satellite);
  }

  const rebuildStack = () => {
    stackLayers.forEach((layer) => {
      stackGroup.remove(layer);
      layer.geometry.dispose();
      (layer.material as MeshStandardMaterial).dispose();
    });
    stackLayers.length = 0;

    for (let index = 0; index < simulation.stackHeight; index += 1) {
      const layer = new Mesh(
        new CylinderGeometry(2.2 - index * 0.08, 2.45 - index * 0.08, 0.62, 36),
        new MeshStandardMaterial({
          color: index % 2 === 0 ? '#1e293b' : '#0f172a',
          emissive: new Color(index % 2 === 0 ? '#c084fc' : '#f472b6'),
          emissiveIntensity: 0.18 + index * 0.01,
          metalness: 0.1,
          roughness: 0.38,
        }),
      );
      layer.position.y = -5.35 + index * 0.66;
      stackLayers.push(layer);
      stackGroup.add(layer);
    }
  };

  rebuildStack();

  const emitHud = (detail?: string) => {
    host.emitEvent({
      type: 'hud',
      detail,
      label: 'Stack height',
      score: simulation.stackHeight,
    });
  };

  const emitAnnouncement = (message: string) => {
    host.emitEvent({ type: 'announcement', message, politeness: 'polite' });
  };

  const onPointerDown = () => {
    if (disposed || phase === 'paused') {
      return;
    }

    const nextSimulation = stepOrbitalStackSimulation(simulation, { addPlate: true }, 0, random);

    if (nextSimulation.stackHeight !== simulation.stackHeight) {
      simulation = nextSimulation;
      rebuildStack();
    }

    emitHud('Another plate locked into orbit.');
    emitAnnouncement(`Stack height ${simulation.stackHeight}.`);
  };

  const render = (timestamp: number) => {
    if (disposed) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(render);
    resizeRenderer(camera, renderer, canvas);

    const delta = lastFrame === null ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.05);
    lastFrame = timestamp;

    if (phase !== 'paused') {
      simulation = stepOrbitalStackSimulation(simulation, { addPlate: false }, delta, random);
    }

    orbitGroup.rotation.y = simulation.elapsedSeconds * 0.95;
    orbitGroup.rotation.x = Math.sin(simulation.elapsedSeconds * 0.4) * 0.25;
    orbitRing.rotation.z = simulation.elapsedSeconds * 0.18;

    satellites.forEach((satellite, index) => {
      const angle = simulation.elapsedSeconds * 0.9 + index * ((Math.PI * 2) / satellites.length);
      const radius = 6.2 + (index % 2) * 0.45;
      satellite.position.set(Math.cos(angle) * radius, -0.4 + Math.sin(angle * 1.4) * 1.2, Math.sin(angle) * 1.1);
    });

    stackGroup.rotation.y = Math.sin(simulation.elapsedSeconds * 0.45) * 0.2;
    if (simulation.elapsedSeconds >= nextHudUpdateAt) {
      emitHud(`Tap to extend the tower beyond ${simulation.stackHeight} plates.`);
      nextHudUpdateAt = simulation.elapsedSeconds + 0.25;
    }
    renderer.render(scene, camera);
  };

  canvas.addEventListener('pointerdown', onPointerDown);

  host.emitEvent({
    type: 'phase',
    phase: 'running',
    message: 'Add glowing plates and keep the orbital tower climbing.',
  });
  emitHud('Tap or click to add the next orbital plate.');
  emitAnnouncement('Orbital Stack ready.');

  return {
    start() {
      if (disposed || started) {
        return;
      }

      started = true;
      render(clock.nowMilliseconds());
    },
    pause() {
      if (disposed || phase === 'paused') {
        return;
      }

      phase = 'paused';
      host.emitEvent({
        type: 'phase',
        phase: 'paused',
        message: 'Paused. Resume to keep building the tower.',
      });
      emitAnnouncement('Orbital Stack paused.');
    },
    resume() {
      if (disposed || phase !== 'paused') {
        return;
      }

      phase = 'running';
      lastFrame = null;
      host.emitEvent({
        type: 'phase',
        phase: 'running',
        message: 'Back in orbit. Add another plate whenever you are ready.',
      });
      emitAnnouncement('Orbital Stack resumed.');
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      disposeSceneGraph(scene);
      renderer.dispose();
    },
  };
}

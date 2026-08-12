import { createSeededRandomSource, type GameHost, type GameInstance, type GameManifest } from '@game-hub/game-contract';
import manifestData from '../game.manifest.json';
import { createNeonDriftSimulationState, stepNeonDriftSimulation } from './simulation';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

const manifest = manifestData as GameManifest;
const VIEW_HEIGHT = 22;

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

export function createGame(canvas: HTMLCanvasElement, host: GameHost): GameInstance {
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  const scene = new Scene();
  const camera = new OrthographicCamera(-16, 16, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 100);
  const floor = new Mesh(new PlaneGeometry(70, 30), new MeshBasicMaterial({ color: '#020617' }));
  const glow = new Mesh(
    new PlaneGeometry(60, 18),
    new MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.07 }),
  );
  const ship = new Group();
  const laneMarkers: Mesh[] = [];
  const stars: Mesh[] = [];

  let animationFrameId = 0;
  let disposed = false;
  let phase: 'running' | 'paused' = 'running';
  let lastFrame = 0;
  let nextHudUpdateAt = 0;
  let simulation = createNeonDriftSimulationState();
  const random = createSeededRandomSource(0x4e454f4e);

  renderer.setClearColor(new Color('#020617'));
  camera.position.z = 24;
  floor.position.z = -6;
  glow.position.set(4, 0, -5.5);

  const ambientLight = new AmbientLight('#dbeafe', 1.1);
  const directionalLight = new DirectionalLight('#ffffff', 0.9);
  directionalLight.position.set(8, 12, 16);

  const chassis = new Mesh(
    new BoxGeometry(2.4, 0.8, 0.8),
    new MeshStandardMaterial({
      color: '#0f172a',
      emissive: new Color('#60a5fa'),
      emissiveIntensity: 0.26,
      metalness: 0.15,
      roughness: 0.32,
    }),
  );
  const canopy = new Mesh(
    new BoxGeometry(1, 0.45, 0.55),
    new MeshStandardMaterial({
      color: '#bae6fd',
      emissive: new Color('#22d3ee'),
      emissiveIntensity: 0.14,
      roughness: 0.3,
    }),
  );
  canopy.position.set(0.25, 0.24, 0);
  ship.add(chassis, canopy);
  scene.add(floor, glow, ship, ambientLight, directionalLight);

  for (let index = 0; index < 14; index += 1) {
    const marker = new Mesh(
      new BoxGeometry(1.4, 0.16, 0.12),
      new MeshBasicMaterial({ color: index % 2 === 0 ? '#22d3ee' : '#60a5fa' }),
    );
    laneMarkers.push(marker);
    scene.add(marker);
  }

  for (let index = 0; index < 24; index += 1) {
    const star = new Mesh(
      new SphereGeometry(index % 3 === 0 ? 0.08 : 0.05, 10, 10),
      new MeshBasicMaterial({ color: '#bfdbfe' }),
    );
    star.position.set(-14 + (index % 8) * 4, -7 + (index % 5) * 3, -2 - (index % 4));
    stars.push(star);
    scene.add(star);
  }

  const emitHud = (detail?: string) => {
    host.emitEvent({
      type: 'hud',
      detail,
      label: 'Drift combo',
      score: Math.round(simulation.driftCombo),
    });
  };

  const emitAnnouncement = (message: string) => {
    host.emitEvent({ type: 'announcement', message, politeness: 'polite' });
  };

  const onPointerDown = () => {
    if (phase === 'paused') {
      return;
    }

    simulation = stepNeonDriftSimulation(simulation, { boost: true }, 0, random);
    emitHud('Boost pulse engaged.');
    emitAnnouncement('Boost pulse engaged.');
  };

  const render = (timestamp: number) => {
    if (disposed) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(render);
    resizeRenderer(camera, renderer, canvas);

    const delta = lastFrame === 0 ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.05);
    lastFrame = timestamp;

    if (phase !== 'paused') {
      simulation = stepNeonDriftSimulation(simulation, { boost: false }, delta, random);
    }

    ship.position.set(
      Math.sin(simulation.elapsedSeconds * 1.4) * 4.1,
      Math.sin(simulation.elapsedSeconds * 2.1) * 0.55,
      0,
    );
    ship.rotation.z = Math.sin(simulation.elapsedSeconds * 1.4) * 0.24;
    glow.rotation.z = simulation.elapsedSeconds * 0.06;
    glow.material.opacity = 0.05 + simulation.boostPulse * 0.08;

    laneMarkers.forEach((marker, index) => {
      const lane = (index % 3) - 1;
      const offset = (simulation.elapsedSeconds * (7.2 + simulation.boostPulse * 2.6) + index * 1.8) % 30;
      marker.position.set(15 - offset, lane * 2.4, -0.2);
      marker.scale.x = 1 + simulation.boostPulse * 0.7;
    });

    stars.forEach((star, index) => {
      star.position.x -= delta * (0.9 + (index % 4) * 0.18);
      if (star.position.x < -18) {
        star.position.x = 18;
      }
    });

    if (simulation.elapsedSeconds >= nextHudUpdateAt) {
      emitHud(`${Math.round(280 + simulation.driftCombo * 4)} km/h lane energy`);
      nextHudUpdateAt = simulation.elapsedSeconds + 0.2;
    }
    renderer.render(scene, camera);
  };

  canvas.addEventListener('pointerdown', onPointerDown);

  host.emitEvent({
    type: 'phase',
    phase: 'running',
    message: 'Boost pulses sharpen the lane and wake up the neon trail.',
  });
  emitHud('Pulse the scene to push the combo higher.');
  emitAnnouncement('Neon Drift ready.');

  return {
    start() {
      render(performance.now());
    },
    pause() {
      if (phase === 'paused') {
        return;
      }

      phase = 'paused';
      host.emitEvent({
        type: 'phase',
        phase: 'paused',
        message: 'Paused. Resume to keep drifting through the lane.',
      });
      emitAnnouncement('Neon Drift paused.');
    },
    resume() {
      if (phase !== 'paused') {
        return;
      }

      phase = 'running';
      lastFrame = 0;
      host.emitEvent({
        type: 'phase',
        phase: 'running',
        message: 'Back on the line. Trigger a pulse whenever the ship needs another burst.',
      });
      emitAnnouncement('Neon Drift resumed.');
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.cancelAnimationFrame(animationFrameId);
      disposeSceneGraph(scene);
      renderer.dispose();
    },
  };
}

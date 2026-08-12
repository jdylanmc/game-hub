import { vi } from 'vitest';

export interface WebGLRendererDouble {
  dispose: ReturnType<typeof vi.fn<() => void>>;
  render: ReturnType<typeof vi.fn<(scene: unknown, camera: unknown) => void>>;
  setClearColor: ReturnType<typeof vi.fn<(color: unknown, alpha?: number) => void>>;
  setPixelRatio: ReturnType<typeof vi.fn<(ratio: number) => void>>;
  setSize: ReturnType<typeof vi.fn<(width: number, height: number) => void>>;
  shadowMap: { enabled: boolean };
}

export function createWebGLRendererConstructor(
  onConstruct: (renderer: WebGLRendererDouble) => void,
): new () => WebGLRendererDouble {
  return class {
    readonly dispose = vi.fn<() => void>();
    readonly render = vi.fn<(scene: unknown, camera: unknown) => void>();
    readonly setClearColor = vi.fn<(color: unknown, alpha?: number) => void>();
    readonly setPixelRatio = vi.fn<(ratio: number) => void>();
    readonly setSize = vi.fn<(width: number, height: number) => void>();
    readonly shadowMap = { enabled: false };

    constructor() {
      onConstruct(this);
    }
  };
}

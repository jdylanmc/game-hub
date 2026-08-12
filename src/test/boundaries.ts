import { vi } from 'vitest';

export interface AnimationFrameController {
  cancel: ReturnType<typeof vi.fn<(id: number) => void>>;
  pendingCount: () => number;
  peekNext: () => { callback: FrameRequestCallback; id: number };
  request: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
  runNext: (timestamp: number) => void;
}

export interface ObjectUrlController {
  createObjectURL: ReturnType<typeof vi.fn<(file: Blob) => string>>;
  revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
}

export interface PerformanceTimeController {
  advanceBy: (milliseconds: number) => void;
  set: (milliseconds: number) => void;
}

export interface StorageController {
  localStorage: Storage;
  sessionStorage: Storage;
}

export interface TimerController {
  advanceBy: (milliseconds: number) => Promise<void>;
  runAll: () => Promise<void>;
}

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

export function installAnimationFrameController(): AnimationFrameController {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId;

    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  const peekNext = () => {
    const entry = callbacks.entries().next().value;

    if (!entry) {
      throw new Error('Expected a pending animation frame.');
    }

    return { callback: entry[1], id: entry[0] };
  };

  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);

  return {
    cancel,
    peekNext,
    pendingCount: () => callbacks.size,
    request,
    runNext(timestamp) {
      const { callback, id } = peekNext();

      callbacks.delete(id);
      callback(timestamp);
    },
  };
}

export function installFetchMock(implementation?: typeof fetch): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();

  if (implementation) {
    fetchMock.mockImplementation(implementation);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function installObjectUrlController(controller?: ObjectUrlController): ObjectUrlController {
  const objectUrls = controller ?? {
    createObjectURL: vi.fn<(file: Blob) => string>(),
    revokeObjectURL: vi.fn<(url: string) => void>(),
  };

  class TestURL extends URL {
    static createObjectURL = objectUrls.createObjectURL;
    static revokeObjectURL = objectUrls.revokeObjectURL;
  }

  vi.stubGlobal('URL', TestURL);
  return objectUrls;
}

export function installPerformanceTime(startMilliseconds = 0): PerformanceTimeController {
  let currentMilliseconds = startMilliseconds;

  vi.spyOn(performance, 'now').mockImplementation(() => currentMilliseconds);
  return {
    advanceBy(milliseconds) {
      currentMilliseconds += milliseconds;
    },
    set(milliseconds) {
      currentMilliseconds = milliseconds;
    },
  };
}

export function installScrollToMock(
  scrollTo = vi.fn<(options?: ScrollToOptions | number, y?: number) => void>(),
): typeof scrollTo {
  vi.stubGlobal('scrollTo', scrollTo);
  return scrollTo;
}

export function installStorageController(): StorageController {
  const storage = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  };

  vi.stubGlobal('localStorage', storage.localStorage);
  vi.stubGlobal('sessionStorage', storage.sessionStorage);
  return storage;
}

export function installTimerController(now: Date | number = 0): TimerController {
  vi.useFakeTimers({
    toFake: ['Date', 'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'],
  });
  vi.setSystemTime(now);

  return {
    advanceBy: async (milliseconds) => {
      await vi.advanceTimersByTimeAsync(milliseconds);
    },
    runAll: async () => {
      await vi.runAllTimersAsync();
    },
  };
}

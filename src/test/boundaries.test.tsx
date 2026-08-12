import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  installAnimationFrameController,
  installFetchMock,
  installObjectUrlController,
  installPerformanceTime,
  installScrollToMock,
  installStorageController,
  installTimerController,
} from './boundaries';
import { forbiddenNetworkFetch } from './network-guard';
import { resetTestEnvironment } from './setup';
import { createWebGLRendererConstructor, type WebGLRendererDouble } from './three-boundary';

describe('explicit test boundaries', () => {
  it('controls browser APIs, storage, animation frames, performance time, and timers', async () => {
    const frames = installAnimationFrameController();
    const performanceTime = installPerformanceTime(25);
    const storage = installStorageController();
    const timers = installTimerController(new Date('2026-08-12T09:00:00.000Z'));
    const scrollTo = installScrollToMock();
    const objectUrls = installObjectUrlController();
    const onFrame = vi.fn();
    const onTimer = vi.fn();

    storage.localStorage.setItem('score', '28');
    storage.sessionStorage.setItem('phase', 'ready');
    requestAnimationFrame(onFrame);
    setTimeout(onTimer, 50);
    scrollTo({ top: 0 });
    objectUrls.createObjectURL.mockReturnValue('blob:avatar');

    expect(performance.now()).toBe(25);
    performanceTime.advanceBy(17);
    frames.runNext(42);
    await timers.advanceBy(50);

    expect(performance.now()).toBe(42);
    expect(onFrame).toHaveBeenCalledWith(42);
    expect(onTimer).toHaveBeenCalledOnce();
    expect(localStorage.getItem('score')).toBe('28');
    expect(sessionStorage.getItem('phase')).toBe('ready');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(URL.createObjectURL(new Blob())).toBe('blob:avatar');
  });

  it('constructs only the explicit Three.js renderer double', () => {
    const renderers: WebGLRendererDouble[] = [];
    const WebGLRenderer = createWebGLRendererConstructor((renderer) => renderers.push(renderer));
    const renderer = new WebGLRenderer();

    renderer.setSize(1280, 720);
    renderer.render({}, {});
    renderer.dispose();

    expect(renderers).toEqual([renderer]);
    expect(renderer.setSize).toHaveBeenCalledWith(1280, 720);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('restores renders, mocks, modules, timers, globals, storage, and document state', async () => {
    const originalRandom = Math.random;
    const originalTitle = document.title;
    const firstModule = await import('./fixtures/reset-module');
    const timer = vi.fn();
    const fetchMock = installFetchMock(() => Promise.resolve(new Response('fixture')));

    render(<div>render cleanup sentinel</div>);
    vi.spyOn(Math, 'random').mockReturnValue(0.28);
    vi.stubGlobal('__cleanupSentinel', true);
    installStorageController();
    installTimerController();
    localStorage.setItem('sentinel', 'present');
    document.title = 'mutated';
    document.body.dataset['sentinel'] = 'present';
    setTimeout(timer, 1);

    expect(document.body).toHaveTextContent('render cleanup sentinel');
    expect(await (await fetch('/fixture')).text()).toBe('fixture');
    expect(fetchMock).toHaveBeenCalledOnce();

    resetTestEnvironment();
    const secondModule = await import('./fixtures/reset-module');

    expect(document.body).toBeEmptyDOMElement();
    expect(document.body.dataset['sentinel']).toBeUndefined();
    expect(document.title).toBe(originalTitle);
    expect(localStorage.getItem('sentinel')).toBeNull();
    expect(vi.isFakeTimers()).toBe(false);
    expect(Math.random).toBe(originalRandom);
    expect('__cleanupSentinel' in globalThis).toBe(false);
    expect(globalThis.fetch).toBe(forbiddenNetworkFetch);
    expect(secondModule.moduleInstance).not.toBe(firstModule.moduleInstance);
  });
});

describe.each([
  ['Azure', 'https://management.azure.com/subscriptions'],
  ['GitHub', 'https://api.github.com/repos/jdylanmc/game-hub'],
  ['advertising', 'https://ads.example.com/impression'],
  ['identity', 'https://login.microsoftonline.com/common/oauth2/v2.0/token'],
  ['payment', 'https://api.stripe.com/v1/payment_intents'],
  ['artificial-intelligence', 'https://game-hub-adversarial-openai.openai.azure.com/openai/deployments/test'],
])('live %s service boundary', (_service, url) => {
  it('fails closed unless the test installs an explicit fetch double', async () => {
    await expect(fetch(url)).rejects.toThrow('Live network access is disabled in unit tests');
  });
});

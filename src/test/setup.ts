import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { installForbiddenNetworkGuard } from './network-guard';

const initialDocumentState =
  typeof document === 'undefined'
    ? undefined
    : {
        bodyAttributes: [...document.body.attributes].map(({ name, value }) => [name, value] as const),
        documentElementAttributes: [...document.documentElement.attributes].map(
          ({ name, value }) => [name, value] as const,
        ),
        title: document.title,
      };

function restoreAttributes(element: Element, attributes: ReadonlyArray<readonly [string, string]>): void {
  for (const attribute of [...element.attributes]) {
    element.removeAttribute(attribute.name);
  }
  for (const [name, value] of attributes) {
    element.setAttribute(name, value);
  }
}

function restoreDocument(): void {
  if (!initialDocumentState) {
    return;
  }

  document.body.replaceChildren();
  document.title = initialDocumentState.title;
  restoreAttributes(document.documentElement, initialDocumentState.documentElementAttributes);
  restoreAttributes(document.body, initialDocumentState.bodyAttributes);
}

function clearStorage(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
}

export function resetTestEnvironment(): void {
  cleanup();
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  vi.resetModules();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  installForbiddenNetworkGuard();
  clearStorage();
  restoreDocument();
}

installForbiddenNetworkGuard();
afterEach(resetTestEnvironment);

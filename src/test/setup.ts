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
const initialGlobalProperties = new Set(Reflect.ownKeys(globalThis));
const allowedDynamicGlobalProperties = new Set<PropertyKey>(['IS_REACT_ACT_ENVIRONMENT', '__THREE__']);

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

function restoreUnexpectedGlobalProperties(): PropertyKey[] {
  const leakedProperties = Reflect.ownKeys(globalThis).filter(
    (property) => !initialGlobalProperties.has(property) && !allowedDynamicGlobalProperties.has(property),
  );

  for (const property of leakedProperties) {
    Reflect.deleteProperty(globalThis, property);
  }

  return leakedProperties;
}

function formatPropertyKey(property: PropertyKey): string {
  return property.toString();
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
  const leakedProperties = restoreUnexpectedGlobalProperties();
  installForbiddenNetworkGuard();
  clearStorage();
  restoreDocument();

  if (leakedProperties.length > 0) {
    throw new Error(`Test leaked global properties: ${leakedProperties.map(formatPropertyKey).join(', ')}`);
  }
}

installForbiddenNetworkGuard();
afterEach(resetTestEnvironment);

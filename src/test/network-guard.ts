const networkGuardMessage =
  'Live network access is disabled in unit tests. Install an explicit fetch double for Azure, GitHub, advertising, identity, payment, artificial-intelligence, or other network boundaries.';

export const forbiddenNetworkFetch: typeof fetch = () => Promise.reject(new Error(networkGuardMessage));

export function installForbiddenNetworkGuard(): void {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: forbiddenNetworkFetch,
    writable: true,
  });
}

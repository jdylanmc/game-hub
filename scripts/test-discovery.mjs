const testFileGlob = '**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}';

function workspacePatternsFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];

  const workspaces = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;

  return [...new Set(workspaces ?? [])].sort();
}

function createVitestIncludePatterns(manifest) {
  return [
    `src/${testFileGlob}`,
    ...workspacePatternsFromManifest(manifest).map((workspacePattern) => `${workspacePattern}/${testFileGlob}`),
    `scripts/${testFileGlob}`,
  ];
}

function testRootsFromManifest(manifest) {
  const workspaceRoots = workspacePatternsFromManifest(manifest)
    .map((workspacePattern) => workspacePattern.split('/')[0])
    .filter((workspaceRoot) => workspaceRoot.length > 0);

  return ['src', ...new Set(workspaceRoots), 'scripts'];
}

export { createVitestIncludePatterns, testRootsFromManifest, workspacePatternsFromManifest };

type PackageManifest = {
  workspaces?: string[] | { packages?: string[] };
};

export function createVitestIncludePatterns(manifest: PackageManifest): string[];
export function testRootsFromManifest(manifest: PackageManifest): string[];
export function workspacePatternsFromManifest(manifest: PackageManifest): string[];

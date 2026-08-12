import { describe, expect, it } from 'vitest';
import { manifest } from './index';

describe('FloppyBird manifest behavior', () => {
  it('declares stable host integration and accessible controls', () => {
    expect(manifest.id).toBe('floppy-bird');
    expect(manifest.technology).toBe('Three.js');
    expect(manifest.controls).toContainEqual({
      action: 'Flap upward',
      inputs: ['Spacebar', 'Click', 'Touch'],
    });
    expect(manifest.controls).toContainEqual({
      action: 'Pause or resume',
      inputs: ['Host controls'],
    });
    expect(
      manifest.instructions.some((instruction) => /host HUD and overlays stay in the DOM/i.test(instruction)),
    ).toBe(true);
  });
});

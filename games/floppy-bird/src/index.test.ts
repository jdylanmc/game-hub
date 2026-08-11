import { describe, expect, it } from 'vitest';
import { manifest } from './index';

describe('FloppyBird manifest behavior', () => {
  it('declares stable host integration and accessible controls', () => {
    expect(manifest.id).toBe('floppy-bird');
    expect(manifest.technology).toBe('Three.js');
    expect(manifest.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'Flap upward',
          inputs: expect.arrayContaining(['Spacebar', 'Click', 'Touch']),
        }),
        expect.objectContaining({ action: 'Pause or resume', inputs: ['Host controls'] }),
      ]),
    );
    expect(manifest.instructions).toEqual(
      expect.arrayContaining([expect.stringMatching(/host HUD and overlays stay in the DOM/i)]),
    );
  });
});

import { describe, it, expect } from 'vitest';
import { focusFrom, imageSize } from '../src/lib/focus';

describe('focus point', () => {
  it('aims at the head of a standing person', () => {
    const f = focusFrom([{ label: 'person', score: 0.98, box: { xmin: 600, ymin: 100, xmax: 800, ymax: 700 } }], 1000, 800)!;
    expect(f.x).toBe(70);
    expect(f.y).toBeCloseTo(20, 0);
  });
  it('ignores small background people and other objects', () => {
    const f = focusFrom([
      { label: 'person', score: 0.95, box: { xmin: 100, ymin: 200, xmax: 400, ymax: 600 } },
      { label: 'person', score: 0.9, box: { xmin: 900, ymin: 300, xmax: 940, ymax: 360 } },
      { label: 'dog', score: 0.99, box: { xmin: 0, ymin: 0, xmax: 1000, ymax: 1000 } },
    ], 1000, 1000)!;
    expect(f.x).toBe(25);
  });
  it('returns nothing without people', () => {
    expect(focusFrom([{ label: 'car', score: 0.9, box: { xmin: 0, ymin: 0, xmax: 10, ymax: 10 } }], 100, 100)).toBeNull();
  });
  it('reads PNG size', () => {
    const b = new Uint8Array(32); b.set([0x89, 0x50, 0x4e, 0x47]); new DataView(b.buffer).setUint32(16, 640); new DataView(b.buffer).setUint32(20, 480);
    expect(imageSize(b)).toEqual({ w: 640, h: 480 });
  });
});

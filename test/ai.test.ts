import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../src/ai/svg';
import { extractJson } from '../src/ai/router';

describe('sanitizeSvg', () => {
  it('keeps a plain logo', () => {
    const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#000"/></svg>';
    expect(sanitizeSvg(`Here you go:\n${svg}`)).toContain('<circle');
  });
  it('removes scripts, handlers and outside links', () => {
    const out = sanitizeSvg('<svg onload="alert(1)"><script>alert(2)</script><a href="https://evil.test"><rect/></a><image href="http://x/y.png"/><use href="#ok"/><foreignObject><p>x</p></foreignObject></svg>');
    expect(out).not.toMatch(/onload|script|evil|x\/y\.png|foreignObject/);
    expect(out).toContain('href="#ok"');
    expect(out).toContain('xmlns=');
  });
  it('rejects answers with no SVG', () => {
    expect(() => sanitizeSvg('sorry')).toThrow();
  });
});

describe('extractJson', () => {
  it('reads fenced JSON', () => {
    expect(extractJson('Ideas:\n```json\n[{"title":"a"}]\n```')).toEqual([{ title: 'a' }]);
  });
  it('reads bare JSON inside prose', () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import { stripDashes, guard, guardDeep } from '../src/lib/style-guard';

describe('style guard', () => {
  it('replaces spaced em dashes with commas', () => {
    expect(stripDashes('I build things \u2014 mostly software.')).toBe('I build things, mostly software.');
  });
  it('replaces unspaced em dashes', () => {
    expect(stripDashes('Work\u2014life balance')).toBe('Work, life balance');
  });
  it('handles HTML entities', () => {
    expect(stripDashes('<p>Hello &mdash; world</p>')).toBe('<p>Hello, world</p>');
  });
  it('drops a trailing em dash', () => {
    expect(stripDashes('And then \u2014.')).toBe('And then.');
  });
  it('turns en dash number ranges into hyphens', () => {
    expect(stripDashes('2019–2024')).toBe('2019-2024');
  });
  it('turns spaced en dashes into commas', () => {
    expect(stripDashes('Fast – and calm')).toBe('Fast, and calm');
  });
  it('leaves normal hyphens alone', () => {
    expect(stripDashes('well-made, long-term')).toBe('well-made, long-term');
  });
  it('flags stock phrases', () => {
    expect(guard('Let us delve into a seamless experience').flags).toEqual(['delve', 'seamless']);
  });
  it('works through nested data', () => {
    expect(guardDeep({ a: ['x \u2014 y'], b: { c: 'p\u2014q' } })).toEqual({ a: ['x, y'], b: { c: 'p, q' } });
  });
});

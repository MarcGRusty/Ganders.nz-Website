// Per-request map of image focus points, loaded once before a page renders.
import type { Env } from '../types';

let FOCUS = new Map<string, [number, number]>();

export async function loadFocus(env: Env) {
  const { results } = await env.DB.prepare('SELECT key, focus_x, focus_y FROM media WHERE focus_x IS NOT NULL').all<{ key: string; focus_x: number; focus_y: number }>()
    .catch(() => ({ results: [] as { key: string; focus_x: number; focus_y: number }[] }));
  FOCUS = new Map(results.map((r) => [r.key, [r.focus_x, r.focus_y]]));
}

/** object-position for an image key, or '' when the image has no focus point. */
export function focusPos(key: string | null | undefined) {
  const f = key ? FOCUS.get(key.replace(/^\/media\//, '')) : undefined;
  return f ? `object-position:${f[0]}% ${f[1]}%` : '';
}

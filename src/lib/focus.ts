// Finds where the people are in a photo so crops keep their faces in frame.
// Uses Cloudflare Workers AI object detection (free tier), then points at the head area.
import type { Env } from '../types';

export interface Detection { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }

/** Read width and height from JPEG, PNG or WebP bytes without decoding the image. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 30) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  // WebP
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (tag === 'VP8L') { const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  // JPEG: walk the markers to the frame header
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Turn detections into a focus point (percent). People win over everything else: aim at the
 * head of the most prominent person, or between heads when there are a few.
 */
export function focusFrom(dets: Detection[], w: number, h: number): { x: number; y: number } | null {
  if (!w || !h) return null;
  const people = dets.filter((d) => d.label === 'person' && d.score >= 0.6)
    .map((d) => ({ ...d, area: (d.box.xmax - d.box.xmin) * (d.box.ymax - d.box.ymin) }))
    .sort((a, b) => b.area - a.area);
  if (!people.length) return null;
  // Keep people at least a third the size of the biggest one, so background figures don't pull the crop.
  const main = people.filter((p) => p.area >= people[0].area / 3).slice(0, 4);
  const heads = main.map((p) => {
    const bw = p.box.xmax - p.box.xmin, bh = p.box.ymax - p.box.ymin;
    // A standing person's face sits about a tenth of the way down the box; a close-up is mostly face.
    const tall = bh / Math.max(bw, 1) > 1.4;
    return { x: p.box.xmin + bw / 2, y: p.box.ymin + bh * (tall ? 0.1 : 0.3), wgt: p.area };
  });
  const total = heads.reduce((s, p) => s + p.wgt, 0);
  const x = heads.reduce((s, p) => s + p.x * p.wgt, 0) / total;
  const y = heads.reduce((s, p) => s + p.y * p.wgt, 0) / total;
  const pct = (v: number, max: number) => Math.round(Math.min(100, Math.max(0, (v / max) * 100)) * 10) / 10;
  return { x: pct(x, w), y: pct(y, h) };
}

/** Detect and store the focus point for one uploaded image. Never throws. */
export async function autoFocus(env: Env, key: string, force = false) {
  try {
    const row = await env.DB.prepare('SELECT type, focus_source FROM media WHERE key = ?').bind(key).first<{ type: string; focus_source: string | null }>();
    if (!row || !/^image\/(jpe?g|png|webp)$/.test(row.type)) return null;
    if (row.focus_source === 'manual' && !force) return null;
    const obj = await env.MEDIA.get(key);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const size = imageSize(bytes);
    if (size) await env.DB.prepare('UPDATE media SET width = ?, height = ? WHERE key = ?').bind(size.w, size.h, key).run();
    if (!env.AI || !size || bytes.length > 10 * 1024 * 1024) return null;
    const dets = (await env.AI.run('@cf/facebook/detr-resnet-50' as any, { image: [...bytes] } as any)) as unknown as Detection[];
    const f = focusFrom(Array.isArray(dets) ? dets : [], size.w, size.h);
    await env.DB.prepare('UPDATE media SET focus_x = ?, focus_y = ?, focus_source = ? WHERE key = ?')
      .bind(f?.x ?? null, f?.y ?? null, f ? 'auto' : 'none', key).run();
    return f;
  } catch (e) {
    console.log('autoFocus failed', key, (e as Error).message);
    return null;
  }
}

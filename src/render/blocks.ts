import type { Block, Post } from '../types';
import { esc, clean, mediaUrl, fmtDate } from './html';
import { focusPos } from './focus';

export interface RenderCtx {
  edit: boolean;
  posts: Post[];
  index: number; // section number, for the 01 / 02 markers
}

/** Attributes that make a field editable in place when the page is opened in the visual editor. */
const ed = (ctx: RenderCtx, path: string, rich = false) =>
  ctx.edit ? ` data-f="${esc(path)}" data-rich="${rich ? 1 : 0}" contenteditable="true" spellcheck="true"` : '';
const imgEd = (ctx: RenderCtx, path: string) => (ctx.edit ? ` data-img="${esc(path)}"` : '');

const head = (ctx: RenderCtx, heading: string) => `
  <div class="sec-head rise"><span class="mono idx">${String(ctx.index).padStart(2, '0')}</span><h2${ed(ctx, 'heading')}>${esc(heading)}</h2></div>`;

type R = (b: Block, ctx: RenderCtx) => string;

const renderers: Record<string, R> = {
  hero: ({ data: d }, ctx) => {
    // Allow *word* in the heading to become the accent italic.
    const h = esc(d.heading).replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const img = mediaUrl(d.image);
    return `<section class="hero"><div class="wrap hero-grid">
      <div class="rise">
        <div class="mono kicker"${ed(ctx, 'kicker')}>${esc(d.kicker)}</div>
        <h1${ed(ctx, 'heading')}${ctx.edit ? ' data-md="1"' : ''}>${h}</h1>
        <div class="lede"${ed(ctx, 'body', true)}>${clean(d.body)}</div>
      </div>
      ${img || ctx.edit ? `<figure class="rise"${imgEd(ctx, 'image')}>${img ? `<img src="${esc(img)}" alt="${esc(d.alt || '')}" style="${focusPos(d.image)}">` : '<div class="mono empty" style="aspect-ratio:4/5;display:grid;place-items:center;border:1px dashed currentColor">Add a photo</div>'}</figure>` : ''}
    </div></section>`;
  },

  header: ({ data: d }, ctx) => `<section class="pagehead"><div class="wrap rise">
    <div class="mono kicker"${ed(ctx, 'kicker')}>${esc(d.kicker)}</div>
    <h1${ed(ctx, 'heading')}>${esc(d.heading)}</h1>
    <div class="lede"${ed(ctx, 'body', true)}>${clean(d.body)}</div></div></section>`,

  cta: ({ data: d }, ctx) => `<section class="sec cta"><div class="wrap"><div class="cta-box rise">
    <div><h2${ed(ctx, 'heading')}>${esc(d.heading)}</h2><p${ed(ctx, 'body')}>${esc(d.body)}</p></div>
    <a class="btn" href="${esc(d.link || '/contact')}"><span${ed(ctx, 'button')}>${esc(d.button || 'Get in touch')}</span></a></div></div></section>`,

  text: ({ data: d }, ctx) => `<section class="sec"><div class="wrap">${head(ctx, d.heading)}
    <div class="prose indent rise"${ed(ctx, 'body', true)}>${clean(d.body)}</div></div></section>`,

  image: ({ data: d }, ctx) => {
    const src = mediaUrl(d.src);
    return `<section class="sec"><div class="wrap"><figure class="figure rise" style="margin:0"${imgEd(ctx, 'src')}>
      ${src ? `<img src="${esc(src)}" alt="${esc(d.alt)}" loading="lazy" style="width:100%;border-radius:min(var(--r),16px);${focusPos(d.src)}">` : ctx.edit ? '<div class="mono empty" style="padding:80px;text-align:center;border:1px dashed currentColor">Click to choose an image</div>' : ''}
      <figcaption class="mono"${ed(ctx, 'caption')}>${esc(d.caption)}</figcaption></figure></div></section>`;
  },

  cards: ({ data: d }, ctx) => `<section class="sec"><div class="wrap">${head(ctx, d.heading)}
    <div class="cards rise">${(d.items || []).map((it: any, i: number) => {
      const tag = it.link && !ctx.edit ? 'a' : 'div';
      const href = tag === 'a' ? ` href="${esc(it.link)}"` : '';
      return `<${tag} class="card"${href}><span class="mono idx">${String(i + 1).padStart(2, '0')}</span>
        <h3${ed(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${ed(ctx, `items.${i}.body`)}>${esc(it.body)}</p>
        ${it.link ? '<span class="mono go">Visit</span>' : ''}</${tag}>`;
    }).join('')}</div></div></section>`,

  timeline: ({ data: d }, ctx) => `<section class="sec"><div class="wrap">${head(ctx, d.heading)}
    <ol class="tl indent">${(d.items || []).map((it: any, i: number) => `<li class="rise">
      <span class="mono when"${ed(ctx, `items.${i}.when`)}>${esc(it.when)}</span>
      <div><h3${ed(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${ed(ctx, `items.${i}.body`)}>${esc(it.body)}</p></div></li>`).join('')}</ol></div></section>`,

  quote: ({ data: d }, ctx) => `<section class="sec"><div class="wrap"><div class="indent rise">
    <blockquote class="bigquote"${ed(ctx, 'quote')}>${esc(d.quote)}</blockquote>
    ${d.cite || ctx.edit ? `<div class="mono cite"${ed(ctx, 'cite')}>${esc(d.cite)}</div>` : ''}</div></div></section>`,

  posts: ({ data: d }, ctx) => {
    const list = ctx.posts.slice(0, Number(d.count) || 3);
    return `<section class="sec"><div class="wrap">${head(ctx, d.heading)}<div class="indent">
      ${list.length ? `<ul class="plist">${list.map((p) => `<li class="rise"><a href="/writing/${esc(p.slug)}">
        <h3>${esc(p.title)}</h3><span class="mono d">${fmtDate(p.published_at)}</span>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}</a></li>`).join('')}</ul>
        <p style="margin-top:28px"><a class="mono" href="/writing">All writing</a></p>` : '<p class="empty">Nothing published yet. Soon.</p>'}
    </div></div></section>`;
  },

  contact: ({ data: d }, ctx) => `<section class="sec contact" id="contact"><div class="wrap">${head(ctx, d.heading)}
    <div class="indent rise"><div class="prose"${ed(ctx, 'body', true)}>${clean(d.body)}</div>
    <form method="post" action="/contact">
      <input name="name" placeholder="Your name" required maxlength="120" aria-label="Your name">
      <input name="email" type="email" placeholder="Your email" required maxlength="200" aria-label="Your email">
      <textarea name="body" placeholder="What's on your mind?" required maxlength="5000" aria-label="Message"></textarea>
      <input type="hidden" name="back" data-back>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit"${ctx.edit ? ' onclick="return false"' : ''}><span${ed(ctx, 'button')}>${esc(d.button || 'Send')}</span></button>
    </form></div></div></section>`,

  embed: ({ data: d }, ctx) => `<section class="sec embed"><div class="wrap">
    ${d.html ? `<iframe sandbox="allow-scripts allow-popups allow-same-origin" srcdoc="${esc(d.html)}" loading="lazy"></iframe>` : ctx.edit ? '<p class="mono empty">Embed: paste HTML in the block settings.</p>' : ''}</div></section>`,

  spacer: ({ data: d }) => `<div style="height:${Number(d.size) || 64}px"></div>`,
};

/** Blocks that carry a section number. */
const NUMBERED = new Set(['text', 'cards', 'timeline', 'posts', 'contact']);

export function renderBlocks(blocks: Block[], ctx: Omit<RenderCtx, 'index'>) {
  let i = 0;
  return blocks.map((b) => {
    const r = renderers[b.type];
    if (!r) return ctx.edit ? `<section data-block="${esc(b.id)}" class="sec"><div class="wrap mono empty">Unknown block: ${esc(b.type)}</div></section>` : '';
    if (NUMBERED.has(b.type)) i++;
    const html = r(b, { ...ctx, index: i });
    return ctx.edit ? `<div data-block="${esc(b.id)}" data-type="${esc(b.type)}">${html}</div>` : html;
  }).join('\n');
}

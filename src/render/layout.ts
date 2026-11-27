import { ASSET_V } from '../routes/admin';
import type { SiteSettings } from '../types';
import { esc, mediaUrl } from './html';
import { fontLink, themeVars, SITE_CSS } from './theme';

export interface LayoutOpts {
  title: string;
  description?: string;
  image?: string;
  path: string;
  menu: { slug: string; title: string }[];
  body: string;
  edit?: boolean;
  siteUrl: string;
}

export function layout(s: SiteSettings, o: LayoutOpts) {
  const fullTitle = o.title && o.title !== s.name ? `${o.title} · ${s.name}` : `${s.name}`;
  const desc = o.description || s.tagline;
  const fav = s.favicon ? mediaUrl(s.favicon) : '/favicon.svg';
  const nav = [{ slug: '', title: 'Home' }, ...o.menu.filter((m) => m.slug !== 'home'), { slug: 'writing', title: 'Writing' }]
    .filter((m, i, a) => a.findIndex((x) => x.slug === m.slug) === i);
  const cur = o.path.split('/')[1] || '';
  return `<!doctype html><html lang="en-NZ"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(o.siteUrl + o.path)}">
${o.image ? `<meta property="og:image" content="${esc(o.siteUrl + mediaUrl(o.image))}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="${esc(fav)}"><link rel="alternate" type="application/rss+xml" title="${esc(s.name)}" href="/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontLink(s.theme)}">
<style>${themeVars(s.theme)}${SITE_CSS}</style>
</head><body class="${s.theme.motion && !o.edit ? 'motion' : ''}">
<header class="top"><div class="wrap">
  <a class="brand" href="/">${s.logo ? `<img src="${esc(mediaUrl(s.logo))}" alt="${esc(s.name)}">` : esc(s.name)}</a>
  ${s.now ? `<span class="mono now"><i></i>Now: ${esc(s.now)}</span>` : ''}
  <nav>${nav.map((m) => `<a href="/${esc(m.slug)}"${m.slug === cur ? ' aria-current="page"' : ''}>${esc(m.title)}</a>`).join('')}</nav>
</div></header>
<main>${o.body}</main>
<footer class="foot"><div class="wrap">
  <span class="mono">${esc(s.footer)} <span data-clock>${esc(s.location)}</span></span>
  <nav class="mono">${s.socials.map((x) => `<a href="${esc(x.url)}" rel="me noopener" target="_blank">${esc(x.label)}</a>`).join('')}${s.email ? `<a href="mailto:${esc(s.email)}">Email</a>` : ''}</nav>
</div></footer>
<script>
(()=>{const q=new URLSearchParams(location.search).get('sent');if(q){const f=document.querySelector('#contact form');if(f){const n=document.createElement('p');n.className='mono';n.style.color='var(--accent)';n.textContent=q==='1'?'Thanks, your message is on its way.':'That did not send. Check your email address and try again.';f.prepend(n)}}const c=document.querySelector('[data-clock]');if(c){const f=()=>{c.textContent=${JSON.stringify(s.location)}+', '+new Date().toLocaleTimeString('en-NZ',{hour:'numeric',minute:'2-digit',timeZone:'Pacific/Auckland'})};f();setInterval(f,30000)}
if(document.body.classList.contains('motion')&&'IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});document.querySelectorAll('.rise').forEach(el=>{if(el.getBoundingClientRect().top>innerHeight){el.classList.add('pre');io.observe(el)}})}})();
</script>
${o.edit ? '<script src="/admin/assets/inline-editor.js?v=${ASSET_V}"></script>' : ''}
</body></html>`;
}

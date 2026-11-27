import { ASSET_V } from '../routes/admin';
import type { SiteSettings } from '../types';
import { esc, mediaUrl } from './html';
import { fontLinks, themeVars, modeScript, SITE_CSS } from './theme';

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
  const nav = o.menu;
  const cur = o.path.split('/')[1] || '';
  return `<!doctype html><html lang="en-NZ"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="${esc(s.theme.light.paper)}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="${esc(s.theme.dark.paper)}" media="(prefers-color-scheme: dark)">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(o.siteUrl + o.path)}">
${o.image ? `<meta property="og:image" content="${esc(o.siteUrl + mediaUrl(o.image))}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="${esc(fav)}"><link rel="alternate" type="application/rss+xml" title="${esc(s.name)}" href="/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks(s.theme).map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join('')}
<script>${modeScript(s.theme)}</script>
<style>${themeVars(s.theme)}${SITE_CSS}</style>
</head><body class="${[s.theme.motion && !o.edit ? 'motion' : '', s.theme.texture !== 'none' ? `tex-${s.theme.texture}` : ''].filter(Boolean).join(' ')}">
<header class="top"><div class="wrap">
  <a class="brand" href="/">${s.logo ? `<img src="${esc(mediaUrl(s.logo))}" alt="${esc(s.name)}">` : esc(s.name)}</a>
  ${s.now ? `<span class="mono now"><i></i>Now: ${esc(s.now)}</span>` : ''}
  <nav>${nav.map((m) => `<a href="/${esc(m.slug)}"${m.slug === cur ? ' aria-current="page"' : ''}>${esc(m.title)}</a>`).join('')}</nav>
  ${s.theme.toggle ? '<button class="mode" type="button" data-mode-toggle aria-label="Switch between light and dark"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>' : ''}
</div></header>
<main>${o.body}</main>
<footer class="foot"><div class="wrap">
  <span class="mono">${esc(s.footer)} <span data-clock>${esc(s.location)}</span></span>
  <nav class="mono">${s.socials.map((x) => `<a href="${esc(x.url)}" rel="me noopener" target="_blank">${esc(x.label)}</a>`).join('')}${s.email ? `<a href="mailto:${esc(s.email)}">Email</a>` : ''}</nav>
</div></footer>
<script>
(()=>{const t=document.querySelector('[data-mode-toggle]');if(t)t.addEventListener('click',()=>{const d=document.documentElement,n=d.dataset.mode==='dark'?'light':'dark';d.dataset.mode=n;try{localStorage.setItem('gmode',n)}catch(e){}});document.querySelectorAll('[data-back]').forEach(i=>i.value=location.pathname);const q=new URLSearchParams(location.search).get('sent');if(q){const f=document.querySelector('#contact form');if(f){const n=document.createElement('p');n.className='mono';n.style.color='var(--accent)';n.textContent=q==='1'?'Thanks, your message is on its way.':'That did not send. Check your email address and try again.';f.prepend(n)}}const c=document.querySelector('[data-clock]');if(c){const f=()=>{c.textContent=${JSON.stringify(s.location)}+', '+new Date().toLocaleTimeString('en-NZ',{hour:'numeric',minute:'2-digit',timeZone:'Pacific/Auckland'})};f();setInterval(f,30000)}
if(document.body.classList.contains('motion')&&'IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});document.querySelectorAll('.rise').forEach(el=>{if(el.getBoundingClientRect().top>innerHeight){el.classList.add('pre');io.observe(el)}})}})();
</script>
${o.edit ? `<script src="/admin/assets/inline-editor.js?v=${ASSET_V}"></script>` : ''}
</body></html>`;
}

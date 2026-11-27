import type { Theme, Palette } from '../types';
import { FONT_SPECS } from '../lib/themes';

const fontParam = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`;

/** One stylesheet link per family, so an unusual custom font can never break the others. */
export function fontLinks(t: Theme) {
  return [...new Set([t.displayFont, t.bodyFont, t.monoFont])].map((f) => {
    const spec = FONT_SPECS[f];
    return `https://fonts.googleapis.com/css2?${fontParam(f)}${spec ? `:${spec}` : ''}&display=swap`;
  });
}

const palVars = (p: Palette) => `--paper:${p.paper};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--accent:${p.accent};--on-accent:${p.onAccent};--accent2:${p.accent2}`;

const SHADOW = { none: 'none', hard: '4px 4px 0 var(--ink)', soft: '0 10px 30px -12px color-mix(in srgb,var(--ink) 35%,transparent)' };

export function themeVars(t: Theme) {
  const shared = `--display:'${t.displayFont}',Georgia,serif;--body:'${t.bodyFont}',system-ui,sans-serif;--mono:'${t.monoFont}',ui-monospace,monospace;--r:${t.radius}px;--w:${t.maxWidth}px;--bw:${t.border}px;--shadow:${SHADOW[t.shadow]};--dweight:${t.displayWeight};--dwidth:${t.displayWidth}%;--dstyle:${t.displayItalic ? 'italic' : 'normal'};--dcase:${t.displayUpper ? 'uppercase' : 'none'};--dtrack:${t.displayUpper ? '-.005em' : '-.03em'};--tex:${t.textureStrength}`;
  const dark = `${palVars(t.dark)};color-scheme:dark`;
  return `:root{${palVars(t.light)};${shared};color-scheme:light}`
    + (t.mode === 'auto' ? `@media (prefers-color-scheme:dark){:root:not([data-mode="light"]){${dark}}}` : '')
    + `:root[data-mode="dark"]{${dark}}`;
}

/** Runs before the page paints so the visitor's light or dark choice never flashes. */
export const modeScript = (t: Theme) => `(function(){var d=document.documentElement,m;try{m=localStorage.getItem('gmode')}catch(e){}if(m!=='light'&&m!=='dark'){m=${JSON.stringify(t.mode)};if(m==='auto')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.mode=m})()`;

export const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--body);font-feature-settings:"ss01";-webkit-font-smoothing:antialiased}
::selection{background:var(--accent);color:var(--paper)}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:.2em}
a:hover{color:var(--accent)}
img{max-width:100%;display:block}
.wrap{max-width:var(--w);margin:0 auto;padding:0 clamp(16px,4vw,40px)}
.mono{font:500 12px/1.4 var(--mono);letter-spacing:.04em;text-transform:uppercase}

/* Header */
.top{border-bottom:var(--bw) solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:10px 24px;min-height:68px;flex-wrap:wrap;padding-block:12px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:var(--dstyle) var(--dweight) 17px/1 var(--display);font-stretch:var(--dwidth);text-transform:var(--dcase);letter-spacing:-.01em}
.brand img{height:30px;width:auto}
.now{display:flex;align-items:center;gap:8px;color:var(--muted);order:3;width:100%;padding-bottom:12px}
.now i{width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none}
.top nav{order:2;width:100%;display:flex;gap:18px;flex-wrap:wrap}
.top nav a{text-decoration:none}
.top nav a[aria-current]{color:var(--accent)}
@media(min-width:760px){.top .wrap{padding-block:0}.now{order:0;width:auto;padding-bottom:0}.top nav{order:0;width:auto;margin-left:auto;gap:22px}}

/* Sections */
.sec{padding:clamp(40px,6vw,88px) 0;border-bottom:1px solid var(--line)}
.sec-head{display:grid;grid-template-columns:1fr;gap:6px;align-items:baseline;margin-bottom:28px}
.idx{color:var(--accent)}
h1,h2,h3{font-family:var(--display);font-weight:var(--dweight);font-stretch:var(--dwidth);font-style:var(--dstyle);text-transform:var(--dcase);letter-spacing:var(--dtrack);line-height:1.05;margin:0}
h3{text-transform:none;font-stretch:100%}
h2{font-size:clamp(24px,3vw,36px)}
h3{font-size:20px;line-height:1.25}
.prose{max-width:66ch}
.prose p{margin:0 0 1em}
.prose h2{font-size:26px;margin:1.6em 0 .5em}
.prose h3{margin:1.4em 0 .4em}
.prose blockquote{margin:1.5em 0;padding-left:20px;border-left:2px solid var(--accent);font:500 20px/1.45 var(--display)}
.prose img{margin:1.5em 0;border-radius:min(var(--r),16px)}
.prose pre,.prose code{font-family:var(--mono);font-size:.88em}
.indent{margin-left:0}
@media(min-width:760px){.sec-head{grid-template-columns:72px 1fr;gap:0 24px;margin-bottom:32px}.indent{margin-left:96px}}

/* Hero */
.hero{padding:clamp(48px,8vw,112px) 0 clamp(40px,6vw,88px)}
.hero-grid{display:grid;grid-template-columns:1fr;gap:36px;align-items:end}
.hero .kicker{color:var(--muted);margin-bottom:18px}
.hero h1{font-size:clamp(36px,6.2vw,80px);line-height:1}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero .lede{font-size:clamp(17px,1.4vw,19px);line-height:1.6;max-width:44ch;margin-top:24px}
.hero .lede p{margin:0 0 .6em}
.hero figure{margin:0;width:64%;max-width:300px}
.hero figure img{aspect-ratio:4/5;object-fit:cover;filter:grayscale(.2) contrast(1.05);border-radius:min(var(--r),24px);box-shadow:var(--shadow)}
@media(min-width:760px){.hero-grid{grid-template-columns:1fr auto;gap:48px}.hero figure{width:clamp(200px,24vw,320px);max-width:none}}

/* Page heading (inner pages) */
.pagehead{padding:clamp(40px,7vw,96px) 0 clamp(28px,4vw,56px);border-bottom:1px solid var(--line)}
.pagehead .kicker{color:var(--accent);margin-bottom:16px}
.pagehead h1{font-size:clamp(30px,4.6vw,56px);line-height:1.05;max-width:20ch}
.pagehead .lede{font-size:clamp(17px,1.4vw,19px);line-height:1.5;max-width:52ch;margin-top:24px;color:color-mix(in srgb,var(--ink) 85%,var(--paper))}
.pagehead .lede p{margin:0 0 .6em}

/* Call to action */
.cta-box{display:grid;gap:24px;align-items:center;padding:clamp(24px,4vw,48px);background:var(--ink);color:var(--paper);border-radius:min(var(--r),28px);box-shadow:var(--shadow)}
.cta-box h2{font-size:clamp(22px,2.6vw,32px)}
.cta-box p{margin:10px 0 0;color:color-mix(in srgb,var(--paper) 75%,var(--ink));max-width:52ch}
.cta-box .btn{background:var(--accent);color:var(--on-accent);justify-self:start;box-shadow:none}
.cta-box .btn:hover{background:var(--paper);color:var(--ink)}
@media(min-width:760px){.cta-box{grid-template-columns:1fr auto}}

/* Cards */
.cards{display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line)}
.card{background:var(--surface);padding:28px;display:flex;flex-direction:column;gap:10px;text-decoration:none;min-height:200px;transition:background .25s}
a.card:hover{background:color-mix(in srgb,var(--accent) 8%,var(--surface));color:inherit}
.card p{margin:0;color:var(--muted)}
.card .go{margin-top:auto;color:var(--accent)}

/* Timeline */
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:1fr;gap:4px;padding:20px 0;border-top:1px solid var(--line)}
.tl .when{color:var(--accent);padding-top:4px}
.tl p{margin:6px 0 0;color:var(--muted);max-width:60ch}
@media(min-width:600px){.tl li{grid-template-columns:120px 1fr;gap:24px;padding:22px 0}}
@media(min-width:600px){.cards{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1100px){.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}

/* Quote */
.bigquote{font:var(--dstyle) var(--dweight) clamp(22px,2.8vw,34px)/1.25 var(--display);letter-spacing:-.01em;max-width:30ch;margin:0}
.bigquote::before{content:"\\201C";color:var(--accent)}
.bigquote::after{content:"\\201D";color:var(--accent)}
.cite{margin-top:20px;color:var(--muted)}

/* Posts list */
.plist{list-style:none;margin:0;padding:0}
.plist a{display:grid;grid-template-columns:1fr auto;gap:8px 24px;padding:22px 0;border-top:1px solid var(--line);text-decoration:none}
.plist h3{transition:color .2s}
.plist a:hover h3{color:var(--accent)}
.plist .d{color:var(--muted)}
.plist p{grid-column:1/-1;margin:0;color:var(--muted);max-width:66ch}

/* Contact */
.contact form{display:grid;gap:14px;max-width:560px}
.contact input,.contact textarea{font:inherit;color:inherit;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent);padding:12px 0;border-radius:0}
.contact input:focus,.contact textarea:focus{outline:none;border-color:var(--accent)}
.contact textarea{min-height:120px;resize:vertical}
.btn{justify-self:start;font:500 14px/1 var(--mono);letter-spacing:.04em;text-transform:uppercase;background:var(--accent);color:var(--on-accent);border:0;padding:16px 22px;border-radius:min(var(--r),26px);cursor:pointer;text-decoration:none;display:inline-block;box-shadow:var(--shadow);transition:background .15s,color .15s,transform .15s}
.btn:hover{background:var(--ink);color:var(--paper)}
.btn:active{transform:translateY(1px)}
.hp{position:absolute;left:-9999px}

/* Article */
.article{padding:clamp(48px,8vw,96px) 0}
.article h1{font-size:clamp(30px,4.4vw,52px);max-width:22ch}
.article .meta{color:var(--muted);margin:24px 0 40px}
.article .cover{margin:0 0 48px;border-radius:min(var(--r),16px);width:100%;max-height:560px;object-fit:cover}
.article .prose{font-size:18px}

/* Texture, behind the opening of each page only */
.hero,.pagehead{position:relative;isolation:isolate}
.tex-contour :is(.hero,.pagehead)::before,.tex-dots :is(.hero,.pagehead)::before,.tex-grain :is(.hero,.pagehead)::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:var(--tex)}
.tex-contour :is(.hero,.pagehead)::before{background:repeating-radial-gradient(circle at 82% 38%,transparent 0 30px,var(--line) 31px 32px);-webkit-mask-image:linear-gradient(90deg,transparent 20%,#000 70%);mask-image:linear-gradient(90deg,transparent 20%,#000 70%)}
.tex-dots :is(.hero,.pagehead)::before{background-image:radial-gradient(var(--line) 1.6px,transparent 1.8px);background-size:22px 22px;-webkit-mask-image:linear-gradient(180deg,#000,transparent);mask-image:linear-gradient(180deg,#000,transparent)}
.tex-grain :is(.hero,.pagehead)::before{opacity:calc(var(--tex) * .35);mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
:root[data-mode="dark"] .tex-grain :is(.hero,.pagehead)::before{mix-blend-mode:screen;opacity:calc(var(--tex) * .15)}
@media (prefers-color-scheme:dark){:root:not([data-mode="light"]) .tex-grain :is(.hero,.pagehead)::before{mix-blend-mode:screen;opacity:calc(var(--tex) * .15)}}

/* Light and dark switch */
.mode{all:unset;margin-left:auto;order:1;cursor:pointer;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;color:var(--ink);flex:none}
.mode:hover{color:var(--accent)}
.mode:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mode svg{width:18px;height:18px}
@media(min-width:760px){.mode{order:0;margin-left:-6px}}
.mode .sun{display:none}
:root[data-mode="dark"] .mode .sun{display:block}:root[data-mode="dark"] .mode .moon{display:none}

/* Footer */
.foot{padding:48px 0 64px}
.foot .wrap{display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between;color:var(--muted)}
.foot nav{display:flex;gap:18px;flex-wrap:wrap}
.figure figcaption{margin-top:12px;color:var(--muted)}
.embed iframe{width:100%;border:0;min-height:320px}
.empty{color:var(--muted)}

@media(min-width:760px){body{font-size:17px}}
/* Scale up smoothly on very large and 4K screens instead of leaving a narrow strip. */
@media(min-width:1800px){html{font-size:calc(100% + (100vw - 1800px) / 320)}body{font-size:calc(17px + (100vw - 1800px) / 320)}.wrap{max-width:calc(var(--w) + (100vw - 1800px) / 2)}}
@media(prefers-reduced-motion:no-preference){.motion .rise.pre{transform:translateY(16px);transition:transform .8s cubic-bezier(.2,.7,.2,1)}.motion .rise.pre.in{transform:none}}
`;

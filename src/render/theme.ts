import type { Theme } from '../types';

const fontParam = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`;

export function fontLink(t: Theme) {
  // Discrete weights work for both variable and static Google fonts.
  const fams = [...new Set([t.displayFont, t.bodyFont, t.monoFont])].map((f) => `${fontParam(f)}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap`;
}

export function themeVars(t: Theme) {
  return `:root{--paper:${t.paper};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--accent2:${t.accent2};--display:'${t.displayFont}',Georgia,serif;--body:'${t.bodyFont}',system-ui,sans-serif;--mono:'${t.monoFont}',ui-monospace,monospace;--r:${t.radius}px;--w:${t.maxWidth}px}`;
}

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
.top{border-bottom:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.top .wrap{display:flex;align-items:center;gap:24px;min-height:68px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 19px/1 var(--display);letter-spacing:-.01em}
.brand img{height:30px;width:auto}
.now{display:flex;align-items:center;gap:8px;color:var(--muted);order:3;width:100%;padding-bottom:12px}
.now i{width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none}
.top nav{margin-left:auto;display:flex;gap:16px;flex-wrap:wrap}
.top nav a{text-decoration:none}
.top nav a[aria-current]{color:var(--accent)}
@media(min-width:760px){.now{order:0;width:auto;padding-bottom:0}.top nav{gap:22px}}

/* Sections */
.sec{padding:clamp(48px,8vw,104px) 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
.sec-head{display:grid;grid-template-columns:1fr;gap:6px;align-items:baseline;margin-bottom:28px}
.idx{color:var(--accent)}
h1,h2,h3{font-family:var(--display);font-weight:500;letter-spacing:-.02em;line-height:1.05;margin:0}
h2{font-size:clamp(30px,4.4vw,52px)}
h3{font-size:24px;line-height:1.2}
.prose{max-width:66ch}
.prose p{margin:0 0 1em}
.prose h2{font-size:32px;margin:1.6em 0 .5em}
.prose h3{margin:1.4em 0 .4em}
.prose blockquote{margin:1.5em 0;padding-left:20px;border-left:2px solid var(--accent);font:500 22px/1.45 var(--display)}
.prose img{margin:1.5em 0;border-radius:var(--r)}
.prose pre,.prose code{font-family:var(--mono);font-size:.88em}
.indent{margin-left:0}
@media(min-width:760px){.sec-head{grid-template-columns:72px 1fr;gap:0 24px;margin-bottom:32px}.indent{margin-left:96px}}

/* Hero */
.hero{padding:clamp(56px,11vw,150px) 0 clamp(48px,8vw,104px)}
.hero-grid{display:grid;grid-template-columns:1fr;gap:36px;align-items:end}
.hero .kicker{color:var(--muted);margin-bottom:18px}
.hero h1{font-size:clamp(52px,10.5vw,148px);font-weight:500;line-height:.92;letter-spacing:-.045em}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero .lede{font-size:clamp(19px,2vw,23px);line-height:1.5;max-width:34ch;margin-top:32px}
.hero .lede p{margin:0 0 .6em}
.hero figure{margin:0;width:64%;max-width:300px}
.hero figure img{aspect-ratio:4/5;object-fit:cover;filter:grayscale(.2) contrast(1.05);border-radius:var(--r)}
@media(min-width:760px){.hero-grid{grid-template-columns:1fr auto;gap:48px}.hero figure{width:clamp(200px,24vw,320px);max-width:none}}

/* Cards */
.cards{display:grid;grid-template-columns:1fr;gap:1px;background:color-mix(in srgb,var(--ink) 14%,transparent);border:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.card{background:var(--paper);padding:28px;display:flex;flex-direction:column;gap:10px;text-decoration:none;min-height:200px;transition:background .25s}
a.card:hover{background:color-mix(in srgb,var(--accent) 7%,var(--paper));color:inherit}
.card p{margin:0;color:var(--muted)}
.card .go{margin-top:auto;color:var(--accent)}

/* Timeline */
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:1fr;gap:4px;padding:20px 0;border-top:1px solid color-mix(in srgb,var(--ink) 12%,transparent)}
.tl .when{color:var(--accent);padding-top:4px}
.tl p{margin:6px 0 0;color:var(--muted);max-width:60ch}
@media(min-width:600px){.tl li{grid-template-columns:120px 1fr;gap:24px;padding:22px 0}}
@media(min-width:600px){.cards{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1100px){.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}

/* Quote */
.bigquote{font:500 clamp(28px,4.2vw,54px)/1.15 var(--display);letter-spacing:-.02em;max-width:22ch;margin:0}
.bigquote::before{content:"\\201C";color:var(--accent)}
.bigquote::after{content:"\\201D";color:var(--accent)}
.cite{margin-top:20px;color:var(--muted)}

/* Posts list */
.plist{list-style:none;margin:0;padding:0}
.plist a{display:grid;grid-template-columns:1fr auto;gap:8px 24px;padding:22px 0;border-top:1px solid color-mix(in srgb,var(--ink) 12%,transparent);text-decoration:none}
.plist h3{transition:color .2s}
.plist a:hover h3{color:var(--accent)}
.plist .d{color:var(--muted)}
.plist p{grid-column:1/-1;margin:0;color:var(--muted);max-width:66ch}

/* Contact */
.contact form{display:grid;gap:14px;max-width:560px}
.contact input,.contact textarea{font:inherit;color:inherit;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent);padding:12px 0;border-radius:0}
.contact input:focus,.contact textarea:focus{outline:none;border-color:var(--accent)}
.contact textarea{min-height:120px;resize:vertical}
.btn{justify-self:start;font:500 14px/1 var(--mono);letter-spacing:.04em;text-transform:uppercase;background:var(--ink);color:var(--paper);border:0;padding:16px 22px;border-radius:var(--r);cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{background:var(--accent);color:var(--paper)}
.hp{position:absolute;left:-9999px}

/* Article */
.article{padding:clamp(48px,8vw,96px) 0}
.article h1{font-size:clamp(40px,6.5vw,84px);font-weight:500;letter-spacing:-.035em;max-width:18ch}
.article .meta{color:var(--muted);margin:24px 0 40px}
.article .cover{margin:0 0 48px;border-radius:var(--r);width:100%;max-height:560px;object-fit:cover}
.article .prose{font-size:19px}

/* Footer */
.foot{padding:48px 0 64px}
.foot .wrap{display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between;color:var(--muted)}
.foot nav{display:flex;gap:18px;flex-wrap:wrap}
.figure figcaption{margin-top:12px;color:var(--muted)}
.embed iframe{width:100%;border:0;min-height:320px}
.empty{color:var(--muted)}

@media(min-width:760px){body{font-size:17px}}
/* Scale up smoothly on very large and 4K screens instead of leaving a narrow strip. */
@media(min-width:1800px){html{font-size:calc(100% + (100vw - 1800px) / 160)}body{font-size:calc(17px + (100vw - 1800px) / 160)}.wrap{max-width:calc(var(--w) + (100vw - 1800px) / 2)}}
@media(prefers-reduced-motion:no-preference){.motion .rise.pre{transform:translateY(16px);transition:transform .8s cubic-bezier(.2,.7,.2,1)}.motion .rise.pre.in{transform:none}}
`;

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, scopeCss, renderTemplate, normalizeModule, renderModule, cleanFields } from '../src/lib/modules';
import { safeUrl, pick, hmac, sameText } from '../src/lib/integrations';
import { linkFacets } from '../src/lib/social';

describe('module HTML is cleaned to an allowlist', () => {
  it('drops scripts, handlers and dangerous elements', () => {
    const out = sanitizeHtml('<div onclick="x()" class="a"><script>alert(1)</script><iframe src="https://e.com"></iframe><img src="javascript:alert(1)" onerror="x"><a href="javascript:alert(1)">x</a><style>body{}</style><form><input></form>ok</div>');
    expect(out).not.toMatch(/script|onclick|onerror|iframe|javascript|<style|<form|<input/i);
    expect(out).toContain('class="a"');
    expect(out).toContain('ok');
  });
  it('keeps safe links and adds rel to new-tab links', () => {
    const out = sanitizeHtml('<a href="https://ganders.nz" target="_blank" rel="opener">x</a><a href="/about">y</a><img src="/media/a.jpg" alt="A">');
    expect(out).toContain('href="https://ganders.nz"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="/about"');
    expect(out).toContain('src="/media/a.jpg"');
  });
  it('strips data: and protocol-relative image sources and sneaky href spacing', () => {
    expect(sanitizeHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">')).not.toContain('data:');
    expect(sanitizeHtml('<img src="//evil.com/x.png">')).not.toContain('evil');
    expect(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>')).not.toMatch(/javascript|java\s*script/i);
  });
  it('escapes a broken tag so it cannot swallow what follows', () => {
    const out = sanitizeHtml('<p>a < b</p><img src=x onerror=alert(1)');
    expect(out).not.toMatch(/<img[^>]*onerror/);
    expect(out).toContain('&lt;');
    expect(sanitizeHtml('<img src="/media/a.jpg" alt="a<b">')).toContain('<img');
  });
  it('removes unsafe inline styles', () => {
    const out = sanitizeHtml('<div style="background:url(javascript:x);color:red">x</div>');
    expect(out).not.toContain('javascript');
  });
});

describe('module CSS is scoped', () => {
  it('prefixes selectors and keeps media queries', () => {
    const css = scopeCss(':scope{padding:4px} .a, h2{color:var(--ink)} @media (min-width:720px){.a{display:grid}} body{margin:0}', '.m-x');
    expect(css).toContain('.m-x{padding:4px}');
    expect(css).toContain('.m-x .a,.m-x h2{color:var(--ink)}');
    expect(css).toContain('@media (min-width:720px){.m-x .a{display:grid}}');
    expect(css).not.toMatch(/(^|\})body/);
  });
  it('drops imports, font faces and bad urls', () => {
    const css = scopeCss('@import url(https://e.com/x.css); .a{background:url(http://e.com/x.png)} .b{background:url(/media/ok.jpg)} .c{width:expression(alert(1))}', '.m-x');
    expect(css).not.toContain('@import');
    expect(css).not.toContain('http://e.com');
    expect(css).toContain('url("/media/ok.jpg")');
    expect(css).not.toContain('expression');
  });
  it('cannot break out of the style tag', () => {
    expect(scopeCss('.a{color:red}</style><script>alert(1)</script>', '.m-x')).not.toMatch(/<\/style|<script/);
  });
});

describe('templates', () => {
  it('escapes values, loops and branches', () => {
    const out = renderTemplate('<h2>{{title}}</h2>{{#each items}}<i>{{@number}}.{{name}}{{#if note}}:{{note}}{{/if}}</i>{{else}}none{{/each}}{{#unless items}}empty{{/unless}}', { title: '<b>Hi</b>', items: [{ name: 'A', note: 'x' }, { name: 'B' }] });
    expect(out).toBe('<h2>&lt;b&gt;Hi&lt;/b&gt;</h2><i>1.A:x</i><i>2.B</i>');
    expect(renderTemplate('{{#each items}}x{{else}}none{{/each}}', { items: [] })).toBe('none');
  });
  it('reaches into feed data and outer values from inside loops', () => {
    expect(renderTemplate('{{#each data.items}}{{label}} {{title}};{{/each}}', { label: 'L', data: { items: [{ title: 'one' }, { title: 'two' }] } })).toBe('L one;L two;');
  });
  it('rich fields print cleaned HTML, others never do', () => {
    expect(renderTemplate('{{body}}|{{plain}}', { body: '<p>ok</p><script>x</script>', plain: '<p>no</p>' }, new Set(['body']))).toBe('<p>ok</p>|&lt;p&gt;no&lt;/p&gt;');
  });
  it('a link field cannot become javascript after rendering', () => {
    const m = normalizeModule({ name: 'Link', template: '<a href="{{link}}">go</a>', fields: [{ key: 'link', type: 'url' }] });
    const { html } = renderModule({ def: m, data: null }, { link: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript');
    expect(renderModule({ def: m, data: null }, { link: 'https://ok.nz' }).html).toContain('href="https://ok.nz"');
  });
  it('field definitions are tidied', () => {
    const f = cleanFields([{ key: 'Title Here', type: 'text' }, { key: '__proto__' }, { key: 'list', type: 'list', fields: [{ key: 'inner', type: 'list' }, { key: 'name' }] }]);
    expect(f.map((x) => x.key)).toEqual(['title_here', 'list']);
    expect(f[1].fields!.map((x) => x.key)).toEqual(['name']);
  });
});

describe('integrations', () => {
  it('only allows public https addresses', () => {
    expect(safeUrl('https://api.example.com/v1').hostname).toBe('api.example.com');
    for (const bad of ['http://api.example.com', 'https://localhost/x', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.1', 'https://[::1]/', 'https://user:pw@example.com', 'https://intranet', 'ftp://example.com'])
      expect(() => safeUrl(bad), bad).toThrow();
  });
  it('picks values by path', () => {
    expect(pick({ a: [{ b: 'x' }] }, 'a.0.b')).toBe('x');
    expect(pick({ a: 1 }, 'z.y')).toBeUndefined();
  });
  it('signs and compares', async () => {
    const s = await hmac('secret', '{"a":1}');
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(sameText(s, await hmac('secret', '{"a":1}'))).toBe(true);
    expect(sameText(s, await hmac('other', '{"a":1}'))).toBe(false);
  });
});

describe('bluesky link facets', () => {
  it('uses byte offsets, not character offsets', () => {
    const text = 'Kia ora whānau, read https://ganders.nz/writing/x.';
    const [f] = linkFacets(text);
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd))).toBe('https://ganders.nz/writing/x');
  });
});

describe('linkedin text', () => {
  it('escapes LinkedIn markup characters', async () => {
    const { linkedinText } = await import('../src/lib/social');
    expect(linkedinText('Hi (team) #1 @marc')).toBe('Hi \\(team\\) \\#1 \\@marc');
  });
});

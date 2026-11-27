// Studio: the admin app for ganders.nz. Plain TypeScript, bundled by esbuild into public/admin/assets/app.js.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

type Any = Record<string, any>;

// ---------- Who is signed in ----------
let ME: { id: number; email: string; name: string; perms: string[]; mustChange: boolean } = { id: 0, email: '', name: '', perms: [], mustChange: false };
const can = (p: string) => ME.perms.includes('*') || ME.perms.includes(p);

// ---------- Tiny helpers ----------
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const noDash = (s: string) => s.replace(/\s*\u2014\s*/g, ', ');

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${url}`, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    credentials: 'same-origin',
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && !url.startsWith('/auth')) { renderLogin(); throw new Error('Please sign in.'); }
  if (!res.ok) throw new Error((data as Any)?.error || `Something went wrong (${res.status}).`);
  return data as T;
}

function toast(msg: string, err = false) {
  const t = document.createElement('div');
  t.className = `toast${err ? ' err' : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 2400);
}
const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), true);

function modal(title: string, inner: string) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>${esc(title)}</h2><button class="btn ghost sm" data-close>Close</button></div>${inner}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || (e.target as HTMLElement).closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  return { el: bg.querySelector('.modal') as HTMLElement, close };
}

/** In-page confirm, since we never use browser dialogs. */
function confirmBox(msg: string, yes = 'Yes, do it'): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal('Are you sure?', `<p>${esc(msg)}</p><div class="row" style="margin-top:18px"><button class="btn danger" data-yes>${esc(yes)}</button><button class="btn ghost" data-close>Cancel</button></div>`);
    m.el.querySelector('[data-yes]')!.addEventListener('click', () => { m.close(); resolve(true); });
    m.el.querySelector('[data-close]')!.addEventListener('click', () => resolve(false));
  });
}

function go(path: string) { history.pushState({}, '', path); route(); }
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')!); }
});
window.addEventListener('popstate', () => route());

/** The public site address. On admin.* or studio.* hosts, links go to the main domain. */
const SITE = /^(admin|studio)\./.test(location.hostname) ? `${location.protocol}//${location.hostname.replace(/^(admin|studio)\./, '')}` : '';
const mediaUrl = (k: string) => (!k ? '' : /^https?:|^\//.test(k) ? k : `/media/${k}`);
const ago = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' });
};

// ---------- Sign in ----------
async function renderLogin() {
  const me = await fetch('/api/auth/me').then((r) => r.json());
  const setup = me.needsSetup;
  $('#app').innerHTML = `<div class="login"><form class="card" id="lf">
    <p class="mono" style="color:var(--accent)">Ganders Studio</p>
    <h1>${setup ? 'Set up your Studio' : 'Welcome back'}</h1>
    <p class="hint" style="margin:0 0 20px">${setup ? 'Create the owner login. Only you will be able to change the site.' : 'Sign in to edit your site.'}</p>
    <label class="f"><span>Email</span><input type="email" name="email" id="email" autocomplete="username" required></label>
    <label class="f"><span>Password</span><input type="password" name="password" id="password" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="${setup ? 10 : 1}" required></label>
    <button class="btn" type="submit">${setup ? 'Create login' : 'Sign in'}</button></form></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    try {
      await api('POST', setup ? '/auth/setup' : '/auth/login', { email: f.get('email'), password: f.get('password') });
      $('#app').innerHTML = '';
      boot();
    } catch (err) { fail(err); }
  });
}

// ---------- Shell ----------
const NAV: [string, string, string, string?][] = [
  ['/admin', 'Overview', ''],
  ['/admin/pages', 'Pages', 'pages.view'],
  ['/admin/writing', 'Writing', 'posts.view'],
  ['/admin/media', 'Media', 'media.view'],
  ['/admin/design', 'Design', 'design.edit'],
  ['/admin/settings', 'Site details', 'settings.edit'],
  ['/admin/messages', 'Inbox', 'messages.view'],
  ['/admin/ai', 'AI providers', 'ai.manage'],
  ['/admin/ideas', 'Create Ideas', 'ideas.use', 'Soon'],
  ['/admin/social', 'Social', 'social.post', 'Soon'],
  ['/admin/integrations', 'Integrations', 'integrations.manage', 'Soon'],
  ['/admin/modules', 'Modules', 'modules.manage', 'Soon'],
  ['/admin/people', 'People', 'users.manage'],
];

function shell() {
  if ($('.shell')) return;
  $('#app').innerHTML = `<div class="shell"><aside class="side">
    <a class="logo" href="/admin" data-link><i></i>Studio</a>
    ${NAV.map(([href, label, perm, tag], i) => `${i === 0 ? '<div class="grp mono">Site</div>' : i === 7 ? '<div class="grp mono">Grow</div>' : i === 12 ? '<div class="grp mono">Team</div>' : ''}${!perm || can(perm) ? `<a class="nav" href="${href}" data-link>${label}${tag ? `<small>${tag}</small>` : ''}</a>` : ''}`).join('')}
    <div class="foot"><a href="/admin/account" data-link>${esc(ME.name || 'Your account')}</a><a href="${esc(SITE)}" target="_blank" rel="noopener">View site</a><button id="logout">Sign out</button></div>
  </aside><main id="main"></main></div>`;
  $('#logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); $('#app').innerHTML = ''; renderLogin(); });
}

function setActive(path: string) {
  document.querySelectorAll('.side a.nav').forEach((a) => {
    const href = a.getAttribute('href')!;
    a.classList.toggle('on', href === '/admin' ? path === '/admin' : path.startsWith(href));
  });
}

let cleanup: (() => void) | null = null;
async function route() {
  cleanup?.(); cleanup = null;
  shell();
  const path = location.pathname.replace(/\/$/, '') || '/admin';
  setActive(path);
  const main = $('#main');
  main.innerHTML = '<p class="hint">Loading...</p>';
  const m = (re: RegExp) => path.match(re);
  try {
    if (path === '/admin') return await viewOverview(main);
    if (path === '/admin/pages') return await viewPages(main);
    let r = m(/^\/admin\/pages\/(\d+)$/); if (r) return await viewPageEditor(main, Number(r[1]));
    if (path === '/admin/writing') return await viewPosts(main);
    r = m(/^\/admin\/writing\/(\d+)$/); if (r) return await viewPostEditor(main, Number(r[1]));
    if (path === '/admin/media') return await viewMedia(main);
    if (path === '/admin/design') return await viewDesign(main);
    if (path === '/admin/settings') return await viewSettings(main);
    if (path === '/admin/messages') return await viewMessages(main);
    r = m(/^\/admin\/messages\/(\d+)$/); if (r) return await viewMessage(main, Number(r[1]));
    if (path === '/admin/ai') return await viewAi(main);
    if (path === '/admin/people') return await viewPeople(main);
    if (path === '/admin/account') return await viewAccount(main);
    const soon = SOON[path.split('/')[2]];
    if (soon) return viewSoon(main, soon);
    main.innerHTML = '<div class="head"><h1>Not found</h1></div>';
  } catch (e) { if ((e as Error).message !== 'Please sign in.') { main.innerHTML = `<div class="warn">${esc((e as Error).message)}</div>`; } }
}

// ---------- Overview ----------
async function viewOverview(main: HTMLElement) {
  const s = await api('GET', '/stats');
  const hour = Number(new Date().toLocaleString('en-NZ', { hour: 'numeric', hour12: false, timeZone: 'Pacific/Auckland' }));
  const hi = hour < 12 ? 'Morena' : hour < 18 ? 'Kia ora' : 'Evening';
  main.innerHTML = `<div class="head"><div><h1>${hi}, Marc.</h1><div class="sub">Here is where the site stands.</div></div>
    <div class="row"><a class="btn" href="/admin/writing" data-link id="newpost">Write something</a><a class="btn ghost" href="/admin/pages" data-link>Edit pages</a></div></div>
    <div class="grid g4">
      ${[['published', 'Published posts'], ['drafts', 'Drafts'], ['review', 'Waiting for review'], ['pages', 'Pages'], ['unread', 'New in inbox']].map(([k, l]) => `<div class="card stat"><div class="n">${s[k]}</div><div class="mono l">${l}</div></div>`).join('')}
    </div>`;
}

// ---------- Pages ----------
async function viewPages(main: HTMLElement) {
  const pages = await api<Any[]>('GET', '/pages');
  main.innerHTML = `<div class="head"><div><h1>Pages</h1><div class="sub">Every page on the site. Click one to edit it visually.</div></div>
    ${can('pages.delete') ? '<button class="btn" id="add">New page</button>' : ''}</div>
    <div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Title</th><th>Address</th><th>Status</th><th>In menu</th><th>Updated</th></tr></thead>
    <tbody>${pages.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${esc(p.title)}</b></td><td class="mono">/${p.slug === 'home' ? '' : esc(p.slug)}</td>
      <td><span class="pill ${p.status}">${p.status}</span></td><td>${p.in_menu ? 'Yes' : ''}</td><td class="hint">${ago(p.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
  main.querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', () => go(`/admin/pages/${(tr as HTMLElement).dataset.id}`)));
  $('#add')?.addEventListener('click', () => {
    const m = modal('New page', `<form id="np"><label class="f"><span>Title</span><input type="text" id="np-title" required placeholder="About"></label>
      <label class="row" style="margin-bottom:16px"><input type="checkbox" id="np-menu" checked> Show in the menu</label><button class="btn">Create page</button></form>`);
    m.el.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const p = await api('POST', '/pages', { title: ($('#np-title') as HTMLInputElement).value, in_menu: ($('#np-menu') as HTMLInputElement).checked });
        m.close(); go(`/admin/pages/${p.id}`);
      } catch (err) { fail(err); }
    });
  });
}

/** Read and write a nested value like "items.0.title". */
const getPath = (o: Any, path: string) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o: Any, path: string, v: unknown) {
  const ks = path.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { cur = cur[k] ??= {}; });
  cur[ks[ks.length - 1]] = v;
}

const blockSummary = (b: Any) => {
  const d = b.data || {};
  const t = d.heading || d.title || d.quote || d.caption || d.kicker || '';
  return String(t).replace(/<[^>]+>/g, '').slice(0, 60);
};

async function viewPageEditor(main: HTMLElement, id: number) {
  const [page, types] = await Promise.all([api<Any>('GET', `/pages/${id}`), api<Any[]>('GET', '/blocks')]);
  const label = (t: string) => types.find((x) => x.type === t)?.label || t;
  let dirty = false;
  let selected: string | null = null;
  let device: 'desktop' | 'mobile' = 'desktop';

  main.innerHTML = `<div class="head" style="margin-bottom:16px"><div style="min-width:0;flex:1">
      <a class="mono hint" href="/admin/pages" data-link>Pages</a>
      <input type="text" id="pg-title" value="${esc(page.title)}" style="font:400 30px/1.1 var(--display);border:0;background:transparent;padding:4px 0;margin-top:4px" aria-label="Page title"></div>
    <div class="row">
      <span class="pill ${page.status}" id="pg-status">${page.status}</span>
      <button class="btn ghost sm" id="dev">Phone view</button>
      <button class="btn ghost sm" id="pg-settings">Page settings</button>
      <button class="btn ghost sm" id="hist">History</button>
      <a class="btn ghost sm" href="${esc(SITE)}${page.slug === 'home' ? '/' : '/' + esc(page.slug)}" target="_blank" rel="noopener">View</a>
      <button class="btn" id="save">Save</button>
      ${can('pages.publish') ? `<button class="btn ghost" id="pub">${page.status === 'published' ? 'Unpublish' : 'Publish'}</button>` : ''}
    </div></div>
    <div class="editor"><div class="blocks" id="blocks"></div><div class="frame" id="frame"><iframe id="pv" title="Live page preview"></iframe></div></div>`;

  const frame = $('#pv') as HTMLIFrameElement;
  const markDirty = () => { dirty = true; ($('#save') as HTMLButtonElement).textContent = 'Save changes'; };

  async function refresh() {
    const y = frame.contentWindow?.scrollY || 0;
    const html = await api<string>('POST', '/preview', { slug: page.slug, title: page.title, blocks: page.blocks });
    frame.srcdoc = html;
    frame.onload = () => frame.contentWindow?.scrollTo(0, y);
  }

  function renderList() {
    const el = $('#blocks');
    el.innerHTML = page.blocks.map((b: Any, i: number) => `<div class="blk${b.id === selected ? ' sel' : ''}" draggable="true" data-i="${i}" data-id="${esc(b.id)}">
        <div class="t"><b>${esc(label(b.type))}</b><small>${esc(blockSummary(b)) || '&nbsp;'}</small></div>
        <button data-act="up" title="Move up" aria-label="Move up">&uarr;</button><button data-act="down" title="Move down" aria-label="Move down">&darr;</button>
        <button data-act="edit" title="Settings">Edit</button><button data-act="del" title="Remove" aria-label="Remove">&times;</button></div>
        ${b.id === selected ? `<div class="panel" id="blk-panel"></div>` : ''}`).join('') +
      `<div class="panel"><label class="f" style="margin:0"><span>Add a block</span>
        <select id="add-blk"><option value="">Choose...</option>${types.map((t) => `<option value="${t.type}">${esc(t.label)}</option>`).join('')}</select></label>
        <p class="hint" style="margin:10px 0 0">Click any text on the page to change it. Drag blocks to reorder.</p></div>`;
    if (selected) renderPanel();

    el.querySelectorAll('.blk').forEach((row) => {
      const i = Number((row as HTMLElement).dataset.i);
      row.addEventListener('click', async (e) => {
        const act = (e.target as HTMLElement).dataset.act;
        if (act === 'up' && i > 0) { [page.blocks[i - 1], page.blocks[i]] = [page.blocks[i], page.blocks[i - 1]]; markDirty(); renderList(); refresh(); }
        else if (act === 'down' && i < page.blocks.length - 1) { [page.blocks[i + 1], page.blocks[i]] = [page.blocks[i], page.blocks[i + 1]]; markDirty(); renderList(); refresh(); }
        else if (act === 'del') { if (await confirmBox('Remove this block from the page? You can undo from History after saving.', 'Remove')) { page.blocks.splice(i, 1); markDirty(); renderList(); refresh(); } }
        else { selected = selected === page.blocks[i].id && act === 'edit' ? null : page.blocks[i].id; renderList(); frame.contentWindow?.postMessage({ type: 'highlight', block: selected }, '*'); }
      });
      row.addEventListener('dragstart', (e) => { (e as DragEvent).dataTransfer!.setData('text/plain', String(i)); row.classList.add('drag'); });
      row.addEventListener('dragend', () => row.classList.remove('drag'));
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number((e as DragEvent).dataTransfer!.getData('text/plain'));
        if (from === i) return;
        const [moved] = page.blocks.splice(from, 1);
        page.blocks.splice(i, 0, moved);
        markDirty(); renderList(); refresh();
      });
    });
    ($('#add-blk') as HTMLSelectElement).addEventListener('change', async (e) => {
      const type = (e.target as HTMLSelectElement).value;
      if (!type) return;
      const b = await api('GET', `/blocks/new/${type}`);
      const at = selected ? page.blocks.findIndex((x: Any) => x.id === selected) + 1 : page.blocks.length;
      page.blocks.splice(at, 0, b);
      selected = b.id;
      markDirty(); renderList(); await refresh();
    });
  }

  /** Settings for the selected block: anything that can't be typed straight onto the page. */
  function renderPanel() {
    const b = page.blocks.find((x: Any) => x.id === selected);
    const el = $('#blk-panel');
    if (!b || !el) return;
    const field = (path: string, key: string, v: any) => {
      if (Array.isArray(v)) return '';
      if (/^(image|src|cover)$/.test(key)) return `<label class="f"><span>${key === 'src' ? 'Image' : 'Photo'}</span><div class="row">${v ? `<img src="${esc(mediaUrl(v))}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:3px">` : ''}<button type="button" class="btn ghost sm" data-pick="${esc(path)}">${v ? 'Change' : 'Choose'}</button>${v ? `<button type="button" class="btn ghost sm" data-clear="${esc(path)}">Remove</button>` : ''}</div></label>`;
      if (typeof v === 'number') return `<label class="f"><span>${esc(key)}</span><input type="number" data-p="${esc(path)}" value="${v}"></label>`;
      if (key === 'html') return `<label class="f"><span>HTML to embed</span><textarea data-p="${esc(path)}" spellcheck="false" style="font-family:var(--mono);font-size:12px">${esc(v)}</textarea><small class="hint">Runs in a sandbox, so it can't affect the rest of the site.</small></label>`;
      if (key === 'link') return `<label class="f"><span>Link</span><input type="text" inputmode="url" data-p="${esc(path)}" value="${esc(v)}" placeholder="/contact or https://..."></label>`;
      if (key === 'body') return '';
      return `<label class="f"><span>${esc(key)}</span><input type="text" data-p="${esc(path)}" value="${esc(v)}">${key === 'heading' && b.type === 'hero' ? '<small class="hint">Wrap a word in *stars* to colour it.</small>' : ''}</label>`;
    };
    let html = Object.entries(b.data).map(([k, v]) => field(k, k, v)).join('');
    for (const [k, v] of Object.entries(b.data)) {
      if (!Array.isArray(v)) continue;
      html += `<div class="mono hint" style="margin:6px 0 8px">${esc(k)}</div>` + v.map((it: Any, i: number) => `<div class="item">
        ${Object.entries(it).map(([ik, iv]) => (ik === 'body' ? `<label class="f"><span>body</span><textarea data-p="${k}.${i}.${ik}">${esc(iv)}</textarea></label>` : field(`${k}.${i}.${ik}`, ik, iv))).join('')}
        <div class="row"><button type="button" class="btn ghost sm" data-mv="${k}.${i}.-1">&uarr;</button><button type="button" class="btn ghost sm" data-mv="${k}.${i}.1">&darr;</button><button type="button" class="btn danger sm" data-rm="${k}.${i}">Remove</button></div></div>`).join('') +
        `<button type="button" class="btn ghost sm" data-addi="${esc(k)}">Add item</button>`;
    }
    el.innerHTML = html || '<p class="hint" style="margin:0">Everything in this block is edited right on the page.</p>';
    el.querySelectorAll<HTMLInputElement>('[data-p]').forEach((inp) => {
      inp.addEventListener('input', () => { setPath(b.data, inp.dataset.p!, inp.type === 'number' ? Number(inp.value) : noDash(inp.value)); markDirty(); });
      inp.addEventListener('change', () => { renderList(); refresh(); });
    });
    el.querySelectorAll<HTMLElement>('[data-pick]').forEach((btn) => btn.addEventListener('click', () => pickMedia((key) => { setPath(b.data, btn.dataset.pick!, key); markDirty(); renderList(); refresh(); })));
    el.querySelectorAll<HTMLElement>('[data-clear]').forEach((btn) => btn.addEventListener('click', () => { setPath(b.data, btn.dataset.clear!, ''); markDirty(); renderList(); refresh(); }));
    el.querySelectorAll<HTMLElement>('[data-rm]').forEach((btn) => btn.addEventListener('click', () => { const [k, i] = btn.dataset.rm!.split('.'); b.data[k].splice(Number(i), 1); markDirty(); renderList(); refresh(); }));
    el.querySelectorAll<HTMLElement>('[data-mv]').forEach((btn) => btn.addEventListener('click', () => {
      const [k, i, d] = btn.dataset.mv!.split('.'); const a = b.data[k]; const from = Number(i); const to = from + Number(d);
      if (to < 0 || to >= a.length) return; [a[from], a[to]] = [a[to], a[from]]; markDirty(); renderList(); refresh();
    }));
    el.querySelectorAll<HTMLElement>('[data-addi]').forEach((btn) => btn.addEventListener('click', () => {
      const a = b.data[btn.dataset.addi!]; const tmpl = a[0] ? Object.fromEntries(Object.keys(a[0]).map((k) => [k, ''])) : { title: '', body: '' };
      a.push(tmpl); markDirty(); renderList(); refresh();
    }));
  }

  const onMsg = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.data?.source !== 'ganders-inline') return;
    const b = page.blocks.find((x: Any) => x.id === e.data.block);
    if (e.data.type === 'field' && b) { setPath(b.data, e.data.path, e.data.value); markDirty(); const s = document.querySelector(`.blk[data-id="${CSS.escape(b.id)}"] small`); if (s) s.textContent = blockSummary(b); }
    if (e.data.type === 'select' && e.data.block !== selected) { selected = e.data.block; renderList(); document.querySelector('.blk.sel')?.scrollIntoView({ block: 'nearest' }); }
    if (e.data.type === 'image' && b) pickMedia((key) => { setPath(b.data, e.data.path, key); markDirty(); refresh(); renderList(); });
    if (e.data.type === 'save') save();
  };
  window.addEventListener('message', onMsg);
  const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
  window.addEventListener('beforeunload', beforeUnload);
  const keys = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  window.addEventListener('keydown', keys);
  cleanup = () => { window.removeEventListener('message', onMsg); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', keys); };

  async function save(extra: Any = {}) {
    try {
      page.title = noDash(($('#pg-title') as HTMLInputElement).value);
      const saved = await api('PUT', `/pages/${id}`, { ...page, ...extra });
      Object.assign(page, saved);
      dirty = false;
      ($('#save') as HTMLButtonElement).textContent = 'Save';
      $('#pg-status').className = `pill ${page.status}`; $('#pg-status').textContent = page.status;
      if ($('#pub')) ($('#pub') as HTMLButtonElement).textContent = page.status === 'published' ? 'Unpublish' : 'Publish';
      toast(page.status === 'published' ? 'Saved. It is live.' : 'Saved as a draft.');
    } catch (e) { fail(e); }
  }
  $('#save').addEventListener('click', () => save());
  $('#pub')?.addEventListener('click', () => save({ status: page.status === 'published' ? 'draft' : 'published' }));
  $('#pg-title').addEventListener('input', markDirty);
  $('#dev').addEventListener('click', () => {
    device = device === 'desktop' ? 'mobile' : 'desktop';
    $('#frame').classList.toggle('mobile', device === 'mobile');
    $('#dev').textContent = device === 'mobile' ? 'Desktop view' : 'Phone view';
  });
  $('#pg-settings').addEventListener('click', () => {
    const m = modal('Page settings', `<form id="ps">
      <label class="f"><span>Address</span><input type="text" id="ps-slug" value="${esc(page.slug)}" ${page.slug === 'home' ? 'disabled' : ''}></label>
      <label class="row" style="margin-bottom:14px"><input type="checkbox" id="ps-menu" ${page.in_menu ? 'checked' : ''}> Show in the menu</label>
      <label class="f"><span>Menu order</span><input type="number" id="ps-order" value="${page.menu_order || 0}"><small class="hint">Lower numbers come first. Writing sits at 50, so use a higher number to go after it.</small></label>
      <label class="f"><span>Search and sharing description</span><textarea id="ps-desc" maxlength="300">${esc(page.seo?.description || '')}</textarea></label>
      <div class="row"><button class="btn">Apply</button>${page.slug !== 'home' ? '<button type="button" class="btn danger" id="ps-del">Delete page</button>' : ''}</div></form>`);
    m.el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      page.slug = ($('#ps-slug') as HTMLInputElement).value || page.slug;
      page.in_menu = ($('#ps-menu') as HTMLInputElement).checked ? 1 : 0;
      page.menu_order = Number(($('#ps-order') as HTMLInputElement).value) || 0;
      page.seo = { ...(page.seo || {}), description: noDash(($('#ps-desc') as HTMLTextAreaElement).value) };
      m.close(); save();
    });
    m.el.querySelector('#ps-del')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete "${page.title}"? A copy stays in History.`, 'Delete page'))) return;
      try { await api('DELETE', `/pages/${id}`); dirty = false; m.close(); toast('Page deleted.'); go('/admin/pages'); } catch (err) { fail(err); }
    });
  });
  $('#hist').addEventListener('click', () => showHistory('page', id, (data) => { Object.assign(page, data); markDirty(); renderList(); refresh(); ($('#pg-title') as HTMLInputElement).value = page.title; }));

  renderList();
  refresh();
}

async function showHistory(entity: string, id: number, restore: (d: Any) => void) {
  const revs = await api<Any[]>('GET', `/revisions/${entity}/${id}`);
  const m = modal('History', revs.length ? `<p class="hint">Each save keeps the version before it. Restoring loads it into the editor; save to keep it.</p>
    <table><tbody>${revs.map((r) => `<tr><td>${ago(r.created_at)}</td><td class="hint">${esc(r.note || '')}</td><td style="text-align:right"><button class="btn ghost sm" data-r="${r.id}">Restore</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="hint">No earlier versions yet. They appear after the first save.</p>');
  m.el.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.addEventListener('click', async () => {
    const r = await api('GET', `/revision/${b.dataset.r}`);
    restore(r.data); m.close(); toast('Version loaded. Save to keep it.');
  }));
}

// ---------- Media ----------
async function uploadFiles(files: FileList | File[]) {
  const out: Any[] = [];
  for (const f of Array.from(files)) {
    const fd = new FormData();
    fd.append('file', f);
    try { out.push(await api('POST', '/media', fd)); } catch (e) { fail(e); }
  }
  if (out.length) toast(`Uploaded ${out.length} file${out.length > 1 ? 's' : ''}.`);
  return out;
}

function mediaGrid(items: Any[]) {
  return `<div class="media-grid">${items.map((m) => `<div class="m" data-key="${esc(m.key)}" data-id="${m.id}">
    ${m.type.startsWith('image/') ? `<img src="/media/${esc(m.key)}" alt="${esc(m.alt)}" loading="lazy">` : `<div class="doc mono">${esc(m.type.split('/')[1])}</div>`}
    <span>${esc(m.name)}</span></div>`).join('')}</div>`;
}

function dropZone(el: HTMLElement, onFiles: (f: FileList) => void) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = 'image/*,application/pdf,video/mp4,video/webm,audio/mpeg'; input.hidden = true;
  el.appendChild(input);
  el.addEventListener('click', () => input.click());
  input.addEventListener('change', () => input.files && onFiles(input.files));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files); });
}

async function pickMedia(onPick: (key: string) => void) {
  const items = await api<Any[]>('GET', '/media');
  const m = modal('Choose an image', `<div class="drop" id="pk-drop">Drop an image here, or click to upload</div><div id="pk-grid">${mediaGrid(items.filter((x) => x.type.startsWith('image/')))}</div>`);
  const wire = () => m.el.querySelectorAll<HTMLElement>('.m').forEach((x) => x.addEventListener('click', () => { onPick(x.dataset.key!); m.close(); }));
  wire();
  dropZone(m.el.querySelector('#pk-drop')!, async (files) => {
    const up = await uploadFiles(files);
    if (up[0]) { onPick(up[0].key); m.close(); }
  });
}

async function viewMedia(main: HTMLElement) {
  const items = await api<Any[]>('GET', '/media');
  main.innerHTML = `<div class="head"><div><h1>Media</h1><div class="sub">Photos, logos and files. Photos are stored on Cloudflare and served fast everywhere.</div></div></div>
    <div class="drop" id="drop">Drop files here, or click to upload (up to 25 MB each)</div><div id="grid">${items.length ? mediaGrid(items) : '<p class="hint">Nothing uploaded yet.</p>'}</div>`;
  dropZone($('#drop'), async (f) => { await uploadFiles(f); viewMedia(main); });
  main.querySelectorAll<HTMLElement>('.m').forEach((x) => x.addEventListener('click', () => {
    const it = items.find((i) => String(i.id) === x.dataset.id)!;
    const md = modal(it.name, `${it.type.startsWith('image/') ? `<img src="/media/${esc(it.key)}" alt="" style="max-height:50vh;margin:0 auto 16px;border-radius:4px">` : ''}
      <label class="f"><span>Description for screen readers</span><input type="text" id="alt" value="${esc(it.alt)}"></label>
      <label class="f"><span>Address</span><input type="text" readonly value="${esc(location.origin)}/media/${esc(it.key)}"></label>
      <p class="hint">${(it.size / 1024).toFixed(0)} KB, ${esc(it.type)}, added ${ago(it.created_at)}</p>
      <div class="row"><button class="btn" id="alt-save">Save</button><button class="btn danger" id="m-del">Delete</button></div>`);
    md.el.querySelector('#alt-save')!.addEventListener('click', async () => { await api('PUT', `/media/${it.id}`, { alt: ($('#alt') as HTMLInputElement).value }); md.close(); toast('Saved.'); });
    md.el.querySelector('#m-del')!.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this file? Pages using it will show a gap.', 'Delete file'))) return;
      await api('DELETE', `/media/${it.id}`); md.close(); viewMedia(main);
    });
  }));
}

// ---------- Writing ----------
const STATUSES = ['all', 'idea', 'review', 'draft', 'scheduled', 'published'];
async function viewPosts(main: HTMLElement, status = 'all') {
  const posts = await api<Any[]>('GET', `/posts${status === 'all' ? '' : `?status=${status}`}`);
  main.innerHTML = `<div class="head"><div><h1>Writing</h1><div class="sub">Your posts, from first idea to published.</div></div><button class="btn" id="new">New post</button></div>
    <div class="tabs">${STATUSES.map((s) => `<button data-s="${s}" class="${s === status ? 'on' : ''}">${s === 'all' ? 'Everything' : s === 'review' ? 'To review' : s === 'idea' ? 'Ideas' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
    ${posts.length ? `<div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>
    ${posts.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${esc(p.title)}</b>${p.excerpt ? `<div class="hint">${esc(p.excerpt.slice(0, 110))}</div>` : ''}</td><td><span class="pill ${p.status}">${p.status}</span></td><td class="hint">${ago(p.updated_at)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="soon"><h2>Nothing here yet</h2><p class="hint">Start a post, or once AI is connected, use Create Ideas to fill this up.</p></div>'}`;
  main.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.addEventListener('click', () => viewPosts(main, b.dataset.s)));
  main.querySelectorAll<HTMLElement>('tr.click').forEach((tr) => tr.addEventListener('click', () => go(`/admin/writing/${tr.dataset.id}`)));
  $('#new').addEventListener('click', async () => { try { const p = await api('POST', '/posts', { title: 'Untitled' }); go(`/admin/writing/${p.id}`); } catch (e) { fail(e); } });
}

async function viewPostEditor(main: HTMLElement, id: number) {
  const post = await api<Any>('GET', `/posts/${id}`);
  let dirty = false;
  main.innerHTML = `<div class="head" style="margin-bottom:16px"><a class="mono hint" href="/admin/writing" data-link>Writing</a>
    <div class="row"><span class="pill ${post.status}" id="st-pill">${post.status}</span><button class="btn ghost sm" id="hist">History</button>
    <a class="btn ghost sm" href="${esc(SITE)}/writing/${esc(post.slug)}?preview=1" target="_blank" rel="noopener" id="pv">Preview</a><button class="btn" id="save">Save</button></div></div>
    <div class="post-ed"><div class="paper">
      <textarea class="ttl" id="title" rows="1" placeholder="Title">${esc(post.title === 'Untitled' ? '' : post.title)}</textarea>
      <textarea class="exc" id="excerpt" rows="2" placeholder="One line that makes someone want to read it">${esc(post.excerpt)}</textarea>
      <div class="tb" id="tb"></div><div id="body"></div>
    </div>
    <aside class="grid" style="gap:14px">
      <div class="card"><label class="f"><span>Status</span><select id="status">${['idea', 'draft', 'review', ...(can('posts.publish') ? ['scheduled', 'published'] : [])].map((s) => `<option ${s === post.status ? 'selected' : ''} value="${s}">${s === 'review' ? 'Ready for review' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
        <label class="f" id="when" ${post.status === 'scheduled' ? '' : 'hidden'}><span>Publish at (NZ time)</span><input type="datetime-local" id="publish_at"></label>
        ${can('posts.publish') ? `<button class="btn" id="publish" style="width:100%;justify-content:center">${post.status === 'published' ? 'Update live post' : 'Publish now'}</button>` : '<p class="hint" style="margin:0">When it\'s ready, set it to "Ready for review" and save.</p>'}</div>
      <div class="card"><label class="f"><span>Cover image</span><div id="cover"></div></label></div>
      <div class="card"><label class="f"><span>Tags</span><input type="text" id="tags" value="${esc(post.tags.join(', '))}" placeholder="security, travel"></label>
        <label class="f" style="margin:0"><span>Address</span><input type="text" id="slug" value="${esc(post.slug)}"></label></div>
      <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="mono hint">Write with AI</span><span id="ai-pick-wrap"></span></div>
        <div class="grid" style="gap:8px"><button type="button" class="btn ghost sm" id="ai-draft">Draft from my notes</button><button type="button" class="btn ghost sm" id="ai-improve">Improve the writing</button>
        <button type="button" class="btn ghost sm" id="ai-titles">Suggest titles</button><button type="button" class="btn ghost sm" id="ai-excerpt">Write the summary line</button></div>
        <p class="hint" style="margin:10px 0 0;font-size:13px">You see every suggestion before it goes in. Select text first to improve just that part.</p></div>
      <div class="card" id="check"><span class="mono hint">Style check</span><p class="hint" style="margin:6px 0 0">Em dashes are removed automatically when you save.</p></div>
    </aside></div>`;

  // NZ local time <-> UTC for the schedule field.
  const toLocal = (utc: string | null) => { if (!utc) return ''; const d = new Date(utc.replace(' ', 'T') + 'Z'); const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); const g = (t: string) => p.find((x) => x.type === t)!.value; return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`; };
  const fromLocal = (v: string) => { if (!v) return null; const guess = new Date(v + 'Z'); const off = new Date(guess.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' })).getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime(); return new Date(guess.getTime() - off).toISOString().slice(0, 19).replace('T', ' '); };
  ($('#publish_at') as HTMLInputElement).value = toLocal(post.publish_at);

  const editor = new Editor({
    element: $('#body'),
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } } as Any), Image, Placeholder.configure({ placeholder: 'Start writing. Type freely, the toolbar is there when you need it.' })],
    content: post.body || '',
    onUpdate: ({ editor: ed }) => {
      dirty = true;
      // Replace an em dash the moment it is typed.
      const { state } = ed;
      state.doc.descendants((node, pos) => {
        const hit = node.isText ? /\s*\u2014\s*/.exec(node.text || '') : null;
        if (hit) {
          ed.chain().command(({ tr }) => { tr.insertText(hit.index + hit[0].length === (node.text || '').length ? ',' : ', ', pos + hit.index, pos + hit.index + hit[0].length); return true; }).run();
          return false;
        }
        return true;
      });
      checkStyle();
    },
  });
  const tools: [string, string, () => void, string?][] = [
    ['Bold', 'B', () => editor.chain().focus().toggleBold().run(), 'bold'],
    ['Italic', 'I', () => editor.chain().focus().toggleItalic().run(), 'italic'],
    ['Heading', 'H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'heading'],
    ['Subheading', 'H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
    ['Quote', 'Quote', () => editor.chain().focus().toggleBlockquote().run(), 'blockquote'],
    ['List', 'List', () => editor.chain().focus().toggleBulletList().run(), 'bulletList'],
    ['Numbered', '1.', () => editor.chain().focus().toggleOrderedList().run(), 'orderedList'],
    ['Link', 'Link', () => {
      const prev = editor.getAttributes('link').href || '';
      const m = modal('Link', `<form><label class="f"><span>Address</span><input type="url" id="lk" value="${esc(prev)}" placeholder="https://"></label><div class="row"><button class="btn">Apply</button><button type="button" class="btn ghost" id="unlk">Remove link</button></div></form>`);
      m.el.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = ($('#lk') as HTMLInputElement).value; v ? editor.chain().focus().extendMarkRange('link').setLink({ href: v }).run() : editor.chain().focus().unsetLink().run(); m.close(); });
      m.el.querySelector('#unlk')!.addEventListener('click', () => { editor.chain().focus().unsetLink().run(); m.close(); });
    }, 'link'],
    ['Image', 'Image', () => pickMedia((k) => editor.chain().focus().setImage({ src: mediaUrl(k) }).run())],
    ['Divider', '---', () => editor.chain().focus().setHorizontalRule().run()],
    ['Undo', 'Undo', () => editor.chain().focus().undo().run()],
    ['Redo', 'Redo', () => editor.chain().focus().redo().run()],
  ];
  const tb = $('#tb');
  tb.innerHTML = tools.map(([t, l], i) => `<button type="button" title="${t}" data-i="${i}">${esc(l)}</button>`).join('');
  tb.querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => tools[Number(b.dataset.i)][2]()));
  editor.on('selectionUpdate', () => tb.querySelectorAll<HTMLElement>('button').forEach((b) => { const n = tools[Number(b.dataset.i)][3]; b.classList.toggle('on', !!n && editor.isActive(n)); }));

  const grow = (t: HTMLTextAreaElement) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  ['#title', '#excerpt'].forEach((s) => { const t = $(s) as HTMLTextAreaElement; grow(t); t.addEventListener('input', () => { t.value = noDash(t.value); grow(t); dirty = true; }); });

  const renderCover = () => {
    $('#cover').innerHTML = `${post.cover ? `<img src="${esc(mediaUrl(post.cover))}" alt="" style="border-radius:4px;margin-bottom:8px">` : ''}<div class="row"><button type="button" class="btn ghost sm" id="cv-pick">${post.cover ? 'Change' : 'Choose image'}</button>${post.cover ? '<button type="button" class="btn ghost sm" id="cv-rm">Remove</button>' : ''}</div>`;
    $('#cv-pick').addEventListener('click', () => pickMedia((k) => { post.cover = k; dirty = true; renderCover(); }));
    $('#cv-rm')?.addEventListener('click', () => { post.cover = null; dirty = true; renderCover(); });
  };
  renderCover();

  let checkT: number | undefined;
  function checkStyle() {
    clearTimeout(checkT);
    checkT = window.setTimeout(async () => {
      const r = await api('POST', '/guard', { text: `${($('#title') as HTMLTextAreaElement).value} ${editor.getText()}` }).catch(() => null);
      if (!r) return;
      $('#check').innerHTML = `<span class="mono hint">Style check</span>${r.flags.length ? `<p class="hint" style="margin:6px 0 0">These read like stock phrasing. Consider saying it your way: <b>${r.flags.map(esc).join(', ')}</b></p>` : '<p class="hint" style="margin:6px 0 0">Reads like you. No stock phrases found.</p>'}`;
    }, 800);
  }
  checkStyle();

  ($('#status') as HTMLSelectElement).addEventListener('change', (e) => { ($('#when') as HTMLElement).hidden = (e.target as HTMLSelectElement).value !== 'scheduled'; dirty = true; });

  async function save(statusOverride?: string) {
    try {
      const status = statusOverride || ($('#status') as HTMLSelectElement).value;
      const publish_at = status === 'scheduled' ? fromLocal(($('#publish_at') as HTMLInputElement).value) : null;
      if (status === 'scheduled' && !publish_at) return toast('Pick a date and time to schedule it.', true);
      const saved = await api('PUT', `/posts/${id}`, {
        title: ($('#title') as HTMLTextAreaElement).value || 'Untitled', excerpt: ($('#excerpt') as HTMLTextAreaElement).value,
        body: editor.getHTML(), cover: post.cover, status, publish_at,
        tags: ($('#tags') as HTMLInputElement).value.split(',').map((t) => t.trim()).filter(Boolean), slug: ($('#slug') as HTMLInputElement).value,
      });
      Object.assign(post, saved); dirty = false;
      ($('#status') as HTMLSelectElement).value = post.status;
      $('#st-pill').className = `pill ${post.status}`; $('#st-pill').textContent = post.status;
      ($('#slug') as HTMLInputElement).value = post.slug;
      ($('#pv') as HTMLAnchorElement).href = `/writing/${post.slug}?preview=1`;
      if ($('#publish')) $('#publish').textContent = post.status === 'published' ? 'Update live post' : 'Publish now';
      toast(post.status === 'published' ? 'Published.' : post.status === 'scheduled' ? 'Scheduled.' : 'Saved.');
    } catch (e) { fail(e); }
  }
  $('#save').addEventListener('click', () => save());
  $('#publish')?.addEventListener('click', () => save('published'));
  $('#hist').addEventListener('click', () => showHistory('post', id, (d) => {
    ($('#title') as HTMLTextAreaElement).value = d.title; ($('#excerpt') as HTMLTextAreaElement).value = d.excerpt; editor.commands.setContent(d.body || ''); post.cover = d.cover; renderCover(); dirty = true;
  }));
  // ----- AI writing help -----
  aiPicker('ai-pick').then((h) => { $('#ai-pick-wrap').innerHTML = h; }).catch(() => { $('#ai-pick-wrap').innerHTML = '<a class="mono hint" href="/admin/ai" data-link>Set up AI</a>'; });
  const choice = () => ($('#ai-pick') as HTMLSelectElement | null)?.value || 'default';
  const ctx = () => ({ title: ($('#title') as HTMLTextAreaElement).value, excerpt: ($('#excerpt') as HTMLTextAreaElement).value, body: editor.getHTML() });
  const hasBody = () => editor.getText().trim().length > 0;
  $('#ai-draft').addEventListener('click', () => {
    const m = modal('Draft from your notes', `<label class="f"><span>Rough notes, bullet points, anything</span><textarea id="ai-notes" rows="9" placeholder="What happened, what you think about it, a detail or two only you would know."></textarea></label><button class="btn" id="ai-go">Write a draft</button>`);
    const go = m.el.querySelector('#ai-go') as HTMLButtonElement;
    go.addEventListener('click', () => busy(go, 'Writing...', async () => {
      try {
        const r = await api('POST', '/ai/write', { action: 'draft', choice: choice(), ...ctx(), notes: ($('#ai-notes') as HTMLTextAreaElement).value });
        m.close();
        reviewResult('Your draft', r, true, hasBody()
          ? [{ label: 'Replace what I have', run: () => { editor.commands.setContent(r.text); dirty = true; } }, { label: 'Add below', run: () => { editor.chain().focus('end').insertContent(r.text).run(); dirty = true; } }]
          : [{ label: 'Use this', run: () => { editor.commands.setContent(r.text); dirty = true; } }]);
      } catch (e) { fail(e); }
    }));
  });
  const improve = $('#ai-improve') as HTMLButtonElement;
  improve.addEventListener('click', () => busy(improve, 'Working...', async () => {
    const { from, to, empty } = editor.state.selection;
    const selection = empty ? '' : editor.state.doc.textBetween(from, to, '\n\n');
    try {
      const r = await api('POST', '/ai/write', { action: 'improve', choice: choice(), ...ctx(), selection });
      reviewResult(selection ? 'Improved passage' : 'Improved post', r, true, [{ label: 'Use this', run: () => { selection ? editor.chain().focus().insertContentAt({ from, to }, r.text).run() : editor.commands.setContent(r.text); dirty = true; } }]);
    } catch (e) { fail(e); }
  }));
  const titles = $('#ai-titles') as HTMLButtonElement;
  titles.addEventListener('click', () => busy(titles, 'Thinking...', async () => {
    try {
      const r = await api('POST', '/ai/write', { action: 'titles', choice: choice(), ...ctx() });
      const m = modal('Pick a title', `<div class="grid" style="gap:8px">${r.items.map((t: string, i: number) => `<button class="btn ghost" style="justify-content:flex-start;text-transform:none;font:500 16px/1.3 var(--body);letter-spacing:0" data-t="${i}">${esc(t)}</button>`).join('')}</div>${madeBy(r)}`);
      m.el.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { const t = $('#title') as HTMLTextAreaElement; t.value = r.items[Number(b.dataset.t)]; t.dispatchEvent(new Event('input')); m.close(); }));
    } catch (e) { fail(e); }
  }));
  const excerpt = $('#ai-excerpt') as HTMLButtonElement;
  excerpt.addEventListener('click', () => busy(excerpt, 'Writing...', async () => {
    try {
      const r = await api('POST', '/ai/write', { action: 'excerpt', choice: choice(), ...ctx() });
      reviewResult('Summary line', r, false, [{ label: 'Use this', run: () => { const t = $('#excerpt') as HTMLTextAreaElement; t.value = r.text; t.dispatchEvent(new Event('input')); } }]);
    } catch (e) { fail(e); }
  }));

  const keys = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  const bu = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
  window.addEventListener('keydown', keys); window.addEventListener('beforeunload', bu);
  cleanup = () => { editor.destroy(); window.removeEventListener('keydown', keys); window.removeEventListener('beforeunload', bu); };
}

// ---------- Design ----------
const FONT_CHOICES = {
  display: ['Archivo', 'Newsreader', 'Bricolage Grotesque', 'Big Shoulders Display', 'Shrikhand', 'Fraunces', 'Instrument Serif', 'Syne', 'Unbounded', 'DM Serif Display', 'Familjen Grotesk', 'Gloock', 'Young Serif', 'Space Grotesk'],
  body: ['Atkinson Hyperlegible', 'Newsreader', 'Figtree', 'Geist', 'Work Sans', 'Hanken Grotesk', 'Instrument Sans', 'Source Serif 4', 'Public Sans'],
  mono: ['IBM Plex Mono', 'JetBrains Mono', 'Geist Mono', 'DM Mono', 'Space Mono', 'Martian Mono'],
};
const PAL_FIELDS: [string, string][] = [['paper', 'Background'], ['surface', 'Cards and panels'], ['ink', 'Text'], ['muted', 'Quiet text'], ['line', 'Lines'], ['accent', 'Accent'], ['onAccent', 'Text on accent'], ['accent2', 'Second accent']];
function lumi(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lumi(a), lumi(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const swatches = (t: Any) => `<div class="sw">${['paper', 'ink', 'accent', 'accent2'].map((k) => `<i style="background:${esc(t.light[k])}"></i>`).join('')}<b></b>${['paper', 'ink', 'accent'].map((k) => `<i style="background:${esc(t.dark[k])}"></i>`).join('')}</div>`;

async function viewDesign(main: HTMLElement) {
  const [s, presets] = await Promise.all([api<Any>('GET', '/settings'), api<Any[]>('GET', '/themes')]);
  let t: Any = clone(s.theme);
  let mine: Any[] = clone(s.themes || []);
  let view: 'light' | 'dark' = 'light';
  let edited = false;
  main.innerHTML = `<div class="head"><div><h1>Design</h1><div class="sub">Pick a theme, then make it yours. Changes show in the preview straight away.</div></div>
    <div class="row"><button class="btn ghost" id="saveas">Save as my theme</button><button class="btn" id="save">Save design</button></div></div>
    <div class="editor"><div class="blocks" id="dpanels"></div>
    <div class="frame"><div class="row" style="margin-bottom:8px;justify-content:space-between"><span class="hint mono" id="tname"></span><div class="seg" id="pvmode"><button data-v="light">Light</button><button data-v="dark">Dark</button></div></div><iframe id="pv" title="Design preview"></iframe></div></div>`;
  const frame = $('#pv') as HTMLIFrameElement;
  let tm: number | undefined;
  const refresh = () => {
    $('#tname').textContent = `${t.name}${edited ? ', edited' : ''}`;
    main.querySelectorAll<HTMLElement>('#pvmode button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    clearTimeout(tm);
    tm = window.setTimeout(async () => {
      const y = frame.contentWindow?.scrollY || 0;
      frame.srcdoc = (await api<string>('POST', '/preview', { slug: 'home', theme: { ...t, mode: view, toggle: t.toggle }, settings: { logo: s.logo, favicon: s.favicon }, edit: false }))
        .replace("localStorage.getItem('gmode')", 'null');
      frame.onload = () => frame.contentWindow?.scrollTo(0, y);
    }, 250);
  };
  const changed = () => { edited = true; refresh(); };

  const checks = () => {
    const p = t[view];
    const rows: [string, number, number][] = [['Text on background', ratio(p.ink, p.paper), 7], ['Quiet text on background', ratio(p.muted, p.paper), 4.5], ['Text on accent buttons', ratio(p.onAccent, p.accent), 4.5], ['Accent on background', ratio(p.accent, p.paper), 3]];
    const warn: string[] = [];
    if (t.radius >= 16 && t.radius < 999) warn.push('Large rounded corners on everything is one of the strongest template tells.');
    if (t.shadow === 'soft') warn.push('Soft drop shadows read as generic. Hairlines or a hard offset feel more chosen.');
    const hue = (() => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.accent.slice(i, i + 2), 16)); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return -1; let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h *= 60; return h < 0 ? h + 360 : h; })();
    if (hue >= 245 && hue <= 290) warn.push('Purple and violet accents are the most common AI-made look.');
    return `<div class="checks">${rows.map(([l, r, min]) => `<div class="row" style="justify-content:space-between"><span>${l}</span><span class="mono ${r >= min ? 'ok' : 'bad'}">${r.toFixed(1)}:1 ${r >= min ? 'good' : r >= min * 0.65 ? 'low' : 'hard to read'}</span></div>`).join('')}
      ${warn.map((w) => `<p class="hint" style="margin:8px 0 0;color:var(--warn)">${w}</p>`).join('')}</div>`;
  };

  const fontSel = (k: string, l: string, list: string[]) => `<label class="f"><span>${l}</span><select data-font="${k}">${[...new Set([t[k], ...list])].map((f) => `<option ${f === t[k] ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__custom">Another Google font...</option></select></label>`;
  const presetCard = (p: Any, own = false) => `<div class="tcard ${t.preset === p.preset ? 'on' : ''}">${swatches(p)}<div><b>${esc(p.name)}</b>${p.blurb ? `<p class="hint" style="margin:4px 0 0">${esc(p.blurb)}</p>` : ''}<p class="hint mono" style="margin:6px 0 0">${esc(p.displayFont)} / ${esc(p.bodyFont)}</p></div>
    <div class="row"><button class="btn ghost sm" data-use="${esc(p.preset)}" data-own="${own ? 1 : 0}">${t.preset === p.preset ? 'In use' : 'Use'}</button>${own ? `<button class="btn ghost sm" data-delt="${esc(p.preset)}">Delete</button>` : ''}</div></div>`;

  const draw = () => {
    const p = t[view];
    $('#dpanels').innerHTML = `
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Themes</div><div class="tlist">${presets.map((x) => presetCard(x)).join('')}</div>
        ${mine.length ? `<div class="mono hint" style="margin:16px 0 10px">Your themes</div><div class="tlist">${mine.map((x) => presetCard(x, true)).join('')}</div>` : ''}</div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Light and dark</div>
        <label class="f"><span>Visitors first see</span><select id="mode"><option value="auto" ${t.mode === 'auto' ? 'selected' : ''}>Whatever their phone or computer is set to</option><option value="light" ${t.mode === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${t.mode === 'dark' ? 'selected' : ''}>Dark</option></select></label>
        <label class="row"><input type="checkbox" id="toggle" ${t.toggle ? 'checked' : ''}> Show a light and dark switch in the header</label></div>
      <div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="mono hint">Colour, ${view} version</span><span class="hint">Switch above the preview to edit the other</span></div>
        <div class="pal">${PAL_FIELDS.map(([k, l]) => `<label class="f"><span>${l}</span><div class="row"><input type="color" data-c="${k}" value="${esc(p[k])}"><input type="text" data-ct="${k}" value="${esc(p[k])}" class="mono"></div></label>`).join('')}</div>
        <div id="checks">${checks()}</div></div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Type</div>${fontSel('displayFont', 'Headings', FONT_CHOICES.display)}${fontSel('bodyFont', 'Body text', FONT_CHOICES.body)}${fontSel('monoFont', 'Labels and dates', FONT_CHOICES.mono)}
        <label class="f"><span>Heading weight: <b data-out="displayWeight">${t.displayWeight}</b></span><input type="range" min="300" max="900" step="100" data-n="displayWeight" value="${t.displayWeight}"></label>
        <label class="f"><span>Heading width: <b data-out="displayWidth">${t.displayWidth}%</b></span><input type="range" min="75" max="125" step="5" data-n="displayWidth" value="${t.displayWidth}"><small class="hint">Only fonts with a width setting change, such as Archivo.</small></label>
        <label class="row"><input type="checkbox" data-b="displayUpper" ${t.displayUpper ? 'checked' : ''}> Headings in capitals</label>
        <label class="row" style="margin-top:8px"><input type="checkbox" data-b="displayItalic" ${t.displayItalic ? 'checked' : ''}> Italic headings</label></div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Shape, texture and motion</div>
        <label class="f"><span>Corner roundness: <b data-out="radius">${t.radius >= 999 ? 'pill' : `${t.radius}px`}</b></span><input type="range" min="0" max="25" data-n="radius" value="${Math.min(t.radius, 25)}"><small class="hint">Slide to the end for pill-shaped buttons.</small></label>
        <label class="f"><span>Line weight: <b data-out="border">${t.border}px</b></span><input type="range" min="0" max="3" data-n="border" value="${t.border}"></label>
        <label class="f"><span>Shadows</span><select data-s="shadow">${[['none', 'None, just lines'], ['hard', 'Hard offset, like print'], ['soft', 'Soft']].map(([v, l]) => `<option value="${v}" ${t.shadow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Texture behind page headings</span><select data-s="texture">${[['none', 'None'], ['contour', 'Chart contour rings'], ['dots', 'Pegboard dots'], ['grain', 'Film grain']].map(([v, l]) => `<option value="${v}" ${t.texture === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Texture strength: <b data-out="textureStrength">${Math.round(t.textureStrength * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" data-n="textureStrength" value="${t.textureStrength}"></label>
        <label class="f"><span>Content width: <b data-out="maxWidth">${t.maxWidth}px</b></span><input type="range" min="880" max="1480" step="20" data-n="maxWidth" value="${t.maxWidth}"></label>
        <label class="row"><input type="checkbox" data-b="motion" ${t.motion ? 'checked' : ''}> Gentle lift as sections scroll in</label></div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Logo and icon</div>
        <label class="f"><span>Logo (shown in the header)</span><div id="logo"></div></label>
        <label class="f"><span>Browser icon</span><div id="fav"></div></label>
        <p class="hint" style="margin:0">No logo? Your name is shown in the heading font.</p></div>`;
    bind();
  };

  const bind = () => {
    const root = $('#dpanels');
    root.querySelectorAll<HTMLElement>('[data-use]').forEach((b) => b.addEventListener('click', () => {
      const src = (b.dataset.own === '1' ? mine : presets).find((x) => x.preset === b.dataset.use);
      if (!src) return;
      const { blurb, ...rest } = clone(src); void blurb;
      t = { ...rest, mode: t.mode, toggle: t.toggle }; edited = false; draw(); refresh();
    }));
    root.querySelectorAll<HTMLElement>('[data-delt]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this theme? Your site keeps its current look.', 'Delete'))) return;
      mine = mine.filter((x) => x.preset !== b.dataset.delt);
      try { await api('PUT', '/settings', { themes: mine }); toast('Theme deleted.'); draw(); } catch (e) { fail(e); }
    }));
    ($('#mode') as HTMLSelectElement).addEventListener('change', (e) => { t.mode = (e.target as HTMLSelectElement).value; if (t.mode !== 'auto') view = t.mode; draw(); refresh(); });
    ($('#toggle') as HTMLInputElement).addEventListener('change', (e) => { t.toggle = (e.target as HTMLInputElement).checked; refresh(); });
    const setColour = (k: string, v: string) => { t[view][k] = v; ($(`[data-c="${k}"]`) as HTMLInputElement).value = v; ($(`[data-ct="${k}"]`) as HTMLInputElement).value = v; $('#checks').innerHTML = checks(); changed(); };
    root.querySelectorAll<HTMLInputElement>('[data-c]').forEach((i) => i.addEventListener('input', () => setColour(i.dataset.c!, i.value)));
    root.querySelectorAll<HTMLInputElement>('[data-ct]').forEach((i) => i.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(i.value)) setColour(i.dataset.ct!, i.value.toUpperCase()); }));
    root.querySelectorAll<HTMLSelectElement>('[data-font]').forEach((sel) => sel.addEventListener('change', () => {
      if (sel.value !== '__custom') { t[sel.dataset.font!] = sel.value; return changed(); }
      const m = modal('Use another Google font', `<form><label class="f"><span>Font name exactly as on fonts.google.com</span><input type="text" id="cf" placeholder="e.g. Space Grotesk" required></label><button class="btn">Use it</button></form>`);
      m.el.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = ($('#cf') as HTMLInputElement).value.trim(); if (v) { t[sel.dataset.font!] = v; sel.insertAdjacentHTML('afterbegin', `<option selected>${esc(v)}</option>`); changed(); } m.close(); });
    }));
    root.querySelectorAll<HTMLInputElement>('[data-n]').forEach((i) => i.addEventListener('input', () => {
      const k = i.dataset.n!; let v = Number(i.value);
      if (k === 'radius' && v >= 25) v = 999;
      t[k] = v;
      root.querySelector(`[data-out="${k}"]`)!.textContent = k === 'radius' ? (v >= 999 ? 'pill' : `${v}px`) : k === 'textureStrength' ? `${Math.round(v * 100)}%` : k === 'displayWidth' ? `${v}%` : k === 'displayWeight' ? String(v) : `${v}px`;
      if (k === 'radius') $('#checks').innerHTML = checks();
      changed();
    }));
    root.querySelectorAll<HTMLInputElement>('[data-b]').forEach((i) => i.addEventListener('change', () => { t[i.dataset.b!] = i.checked; changed(); }));
    root.querySelectorAll<HTMLSelectElement>('[data-s]').forEach((i) => i.addEventListener('change', () => { t[i.dataset.s!] = i.value; $('#checks').innerHTML = checks(); changed(); }));
    slot('logo', 'logo'); slot('fav', 'favicon');
  };

  const slot = (id: string, key: 'logo' | 'favicon') => {
    const v = s[key];
    $(`#${id}`).innerHTML = `<div class="row">${v ? `<img src="${esc(mediaUrl(v))}" alt="" style="height:40px;max-width:160px;object-fit:contain;background:${esc(t.light.paper)};padding:4px;border:1px solid var(--line);border-radius:3px">` : key === 'favicon' ? '<img src="/favicon.svg" alt="" style="height:32px">' : ''}<button type="button" class="btn ghost sm" data-k="pick">${v ? 'Change' : 'Upload or choose'}</button><button type="button" class="btn ghost sm" data-k="ai">Make with AI</button>${v ? '<button type="button" class="btn ghost sm" data-k="rm">Remove</button>' : ''}</div>${key === 'favicon' && !v ? '<small class="hint">Currently using a generated monogram in your colours.</small>' : ''}`;
    $(`#${id} [data-k="pick"]`).addEventListener('click', () => pickMedia((k) => { s[key] = k; slot(id, key); refresh(); }));
    $(`#${id} [data-k="ai"]`).addEventListener('click', () => aiLogo(key, (k) => { s[key] = k; slot(id, key); refresh(); }));
    $(`#${id} [data-k="rm"]`)?.addEventListener('click', () => { s[key] = null; slot(id, key); refresh(); });
  };

  main.querySelectorAll<HTMLElement>('#pvmode button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v as 'light' | 'dark'; draw(); refresh(); }));
  $('#saveas').addEventListener('click', () => {
    const m = modal('Save as your own theme', `<form><label class="f"><span>Name</span><input type="text" id="tn" required placeholder="e.g. South coast winter" value="${edited ? '' : esc(t.name)}"></label><button class="btn">Save theme</button></form>`);
    m.el.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = noDash(($('#tn') as HTMLInputElement).value.trim()).slice(0, 60);
      if (!name) return;
      const id = `custom-${Date.now().toString(36)}`;
      t = { ...t, preset: id, name }; edited = false;
      mine = [...mine, clone(t)];
      try { await api('PUT', '/settings', { theme: t, themes: mine, logo: s.logo, favicon: s.favicon }); toast(`Saved "${name}" and switched the site to it.`); m.close(); draw(); refresh(); } catch (err) { fail(err); }
    });
  });
  $('#save').addEventListener('click', async () => { try { await api('PUT', '/settings', { theme: t, logo: s.logo, favicon: s.favicon }); toast('Design saved. It is live.'); } catch (e) { fail(e); } });
  draw(); refresh();
}

// ---------- Site details ----------
async function viewSettings(main: HTMLElement) {
  const s = await api<Any>('GET', '/settings');
  const socials: Any[] = [...(s.socials || [])];
  const input = (k: string, l: string, hint = '') => `<label class="f"><span>${l}</span><input type="text" id="s-${k}" value="${esc(s[k])}">${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
  main.innerHTML = `<div class="head"><div><h1>Site details</h1><div class="sub">The words that appear on every page.</div></div><button class="btn" id="save">Save</button></div>
    <div class="grid" style="max-width:720px">
      <div class="card">${input('name', 'Your name')}${input('tagline', 'Tagline', 'Used for search results and link previews.')}${input('now', 'Now', 'The short "what I\'m up to" line in the header. Leave empty to hide it.')}${input('location', 'Location', 'City level only. A live local clock shows beside it in the footer.')}${input('footer', 'Footer line')}
        <label class="f"><span>Public email</span><input type="email" id="s-email" value="${esc(s.email)}"><small class="hint">Optional. The contact form works without it.</small></label></div>
      <div class="card"><div class="mono hint" style="margin-bottom:10px">Social profiles</div><div id="soc"></div><button type="button" class="btn ghost sm" id="addsoc">Add a profile</button></div>
    </div>`;
  const renderSoc = () => {
    $('#soc').innerHTML = socials.map((x, i) => `<div class="row" style="margin-bottom:8px"><input type="text" data-sl="${i}" value="${esc(x.label)}" placeholder="Instagram" style="flex:1;min-width:100px"><input type="url" data-su="${i}" value="${esc(x.url)}" placeholder="https://" style="flex:2;min-width:160px"><button class="btn ghost sm" data-sr="${i}">Remove</button></div>`).join('') || '<p class="hint">None yet.</p>';
    main.querySelectorAll<HTMLInputElement>('[data-sl]').forEach((i) => i.addEventListener('input', () => (socials[Number(i.dataset.sl)].label = i.value)));
    main.querySelectorAll<HTMLInputElement>('[data-su]').forEach((i) => i.addEventListener('input', () => (socials[Number(i.dataset.su)].url = i.value)));
    main.querySelectorAll<HTMLElement>('[data-sr]').forEach((b) => b.addEventListener('click', () => { socials.splice(Number(b.dataset.sr), 1); renderSoc(); }));
  };
  renderSoc();
  $('#addsoc').addEventListener('click', () => { socials.push({ label: '', url: '' }); renderSoc(); });
  $('#save').addEventListener('click', async () => {
    const v = (k: string) => noDash(($(`#s-${k}`) as HTMLInputElement).value);
    try { await api('PUT', '/settings', { name: v('name'), tagline: v('tagline'), now: v('now'), location: v('location'), footer: v('footer'), email: v('email'), socials: socials.filter((x) => x.url) }); toast('Saved. It is live.'); } catch (e) { fail(e); }
  });
}

// ---------- Messages ----------
const INBOX_TABS: [string, string][] = [['', 'To do'], ['new', 'New'], ['replied', 'Replied'], ['done', 'Done'], ['spam', 'Spam'], ['all', 'Everything']];
const STATUS_LABEL: Record<string, string> = { new: 'New', open: 'Open', replied: 'Replied', done: 'Done', spam: 'Spam' };
async function viewMessages(main: HTMLElement, tab = '') {
  const r = await api<Any>('GET', `/messages${tab ? `?status=${tab}` : ''}`);
  const n = (k: string) => (r.counts[k] ? ` <span class="hint">${r.counts[k]}</span>` : '');
  main.innerHTML = `<div class="head"><div><h1>Inbox</h1><div class="sub">Everything people send through the forms on your site. Each one is emailed to you as well.</div></div>
    ${can('mail.manage') ? '<button class="btn ghost" id="mailset">Email settings</button>' : ''}</div>
    ${r.mail ? '' : '<div class="warn" style="margin-bottom:16px">Email is not switched on yet, so new messages only show here for now.</div>'}
    <div class="tabs">${INBOX_TABS.map(([k, l]) => `<button data-s="${k}" class="${k === tab ? 'on' : ''}">${l}${k && k !== 'all' ? n(k) : ''}</button>`).join('')}</div>
    ${r.items.length ? `<div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>From</th><th>Message</th><th>Status</th><th>When</th></tr></thead><tbody>
    ${r.items.map((m: Any) => `<tr class="click" data-id="${m.id}"><td><b>${esc(m.name)}</b><div class="hint">${esc(m.email)}</div></td>
      <td>${m.status === 'new' ? '<b>' : ''}${esc(m.body.slice(0, 120))}${m.body.length > 120 ? '...' : ''}${m.status === 'new' ? '</b>' : ''}${m.form !== 'contact' ? `<div class="hint mono">${esc(m.form)} form</div>` : ''}</td>
      <td><span class="pill ${m.status}">${STATUS_LABEL[m.status] || m.status}</span></td><td class="hint">${ago(m.created_at)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="soon"><h2>${tab ? 'Nothing here' : 'All caught up'}</h2><p class="hint">New form messages land here and in your email.</p></div>`}`;
  main.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.addEventListener('click', () => viewMessages(main, b.dataset.s)));
  main.querySelectorAll<HTMLElement>('tr.click').forEach((tr) => tr.addEventListener('click', () => go(`/admin/messages/${tr.dataset.id}`)));
  $('#mailset')?.addEventListener('click', mailSettings);
}

async function viewMessage(main: HTMLElement, id: number) {
  const m = await api<Any>('GET', `/messages/${id}`);
  const extras = m.data ? Object.entries(m.data).map(([k, v]) => `<div><span class="mono hint">${esc(k)}</span><div>${esc(v)}</div></div>`).join('') : '';
  const statusBtns = ['open', 'done', 'spam'].filter((s) => s !== m.status).map((s) => `<button class="btn ghost sm" data-st="${s}">${s === 'open' ? 'Reopen' : s === 'done' ? 'Mark done' : 'Spam'}</button>`).join('');
  main.innerHTML = `<div class="head"><div><a href="/admin/messages" data-link class="hint">Inbox</a><h1>${esc(m.name)}</h1>
    <div class="sub"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a> &middot; ${esc(m.form)} form on ${esc(m.page || '/')} &middot; ${ago(m.created_at)}</div></div>
    <div class="row"><span class="pill ${m.status}">${STATUS_LABEL[m.status] || m.status}</span>${can('messages.reply') ? statusBtns : ''}${can('messages.delete') ? '<button class="btn danger sm" id="del">Delete</button>' : ''}</div></div>
    <div class="grid" style="gap:16px">
      <div class="card"><p style="white-space:pre-wrap;margin:0">${esc(m.body)}</p>${extras ? `<div class="grid" style="gap:10px;margin-top:16px">${extras}</div>` : ''}
        <p class="hint mono" style="margin:14px 0 0">${m.emailed ? 'Emailed to you' : 'Not emailed'}</p></div>
      ${m.replies.map((x: Any) => `<div class="card" style="margin-left:24px;border-color:${x.ok ? 'var(--line)' : 'var(--danger)'}"><div class="hint mono" style="margin-bottom:8px">${x.ok ? 'Replied' : 'Did not send'} by ${esc(x.by_name || 'someone')}, ${ago(x.created_at)}</div><p style="white-space:pre-wrap;margin:0">${esc(x.body)}</p>${x.error ? `<p class="hint">${esc(x.error)}</p>` : ''}</div>`).join('')}
      ${can('messages.reply') ? `<div class="card"><label class="f"><span>Reply by email</span><textarea id="reply" rows="6" placeholder="Kia ora ${esc(m.name.split(' ')[0])},"></textarea></label>
        <div class="row" style="justify-content:space-between"><span class="hint">${m.mail ? `Sends to ${esc(m.email)}. Their reply comes back to your email.` : 'Email is not switched on yet.'}</span><button class="btn" id="send" ${m.mail ? '' : 'disabled'}>Send reply</button></div></div>
      <div class="card"><label class="f"><span>Private notes</span><textarea id="notes" rows="3" placeholder="Only people in Studio see this.">${esc(m.notes || '')}</textarea></label><button class="btn ghost sm" id="savenotes">Save notes</button></div>` : ''}
    </div>`;
  const reply = $('#reply') as HTMLTextAreaElement | null;
  reply?.addEventListener('input', () => { const v = noDash(reply.value); if (v !== reply.value) { const p = reply.selectionStart; reply.value = v; reply.selectionStart = reply.selectionEnd = Math.max(0, p - 1); } });
  main.querySelectorAll<HTMLElement>('[data-st]').forEach((b) => b.addEventListener('click', async () => { try { await api('PUT', `/messages/${id}`, { status: b.dataset.st }); toast('Updated.'); viewMessage(main, id); } catch (e) { fail(e); } }));
  $('#del')?.addEventListener('click', async () => { if (await confirmBox('Delete this message for good?', 'Delete')) { await api('DELETE', `/messages/${id}`); go('/admin/messages'); } });
  $('#savenotes')?.addEventListener('click', async () => { try { await api('PUT', `/messages/${id}`, { notes: ($('#notes') as HTMLTextAreaElement).value }); toast('Notes saved.'); } catch (e) { fail(e); } });
  $('#send')?.addEventListener('click', async () => {
    const btn = $('#send') as HTMLButtonElement;
    if (!reply!.value.trim()) return toast('Write a reply first.', true);
    await busy(btn, 'Sending...', async () => { try { await api('POST', `/messages/${id}/reply`, { body: reply!.value }); toast('Reply sent.'); viewMessage(main, id); } catch (e) { fail(e); viewMessage(main, id); } });
  });
}

async function mailSettings() {
  const r = await api<Any>('GET', '/mail');
  const m = modal('Email', `<p style="margin:0 0 10px"><span class="pill ${r.ready ? 'published' : 'review'}">${r.ready ? 'Working' : 'Not set up'}</span></p>
    <p class="hint" style="margin:0 0 6px">Sends from <b>${esc(r.from)}</b></p><p class="hint" style="margin:0 0 16px">Form messages go to <b>${esc(r.to || 'nobody yet')}</b>. Change it under Site details.</p>
    <button class="btn" id="testmail" ${r.ready ? '' : 'disabled'}>Send me a test email</button>
    <h3 style="margin:20px 0 8px;font-size:14px">Recent emails</h3>
    ${r.log.length ? `<div style="max-height:240px;overflow:auto">${r.log.map((l: Any) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:6px 0"><span>${esc(l.subject)}<div class="hint">${esc(l.to_addr)}</div></span><span class="hint mono">${l.ok ? 'sent' : 'failed'} ${ago(l.created_at)}</span></div>`).join('')}</div>` : '<p class="hint">None yet.</p>'}`);
  m.el.querySelector<HTMLButtonElement>('#testmail')?.addEventListener('click', async (e) => {
    await busy(e.currentTarget as HTMLButtonElement, 'Sending...', async () => { try { const x = await api('POST', '/mail/test'); toast(`Test sent to ${x.to}.`); } catch (err) { fail(err); } });
  });
}


// ---------- AI ----------
let aiCache: Any | null = null;
async function aiInfo(fresh = false) {
  if (!aiCache || fresh) aiCache = await api('GET', '/ai/providers');
  return aiCache!;
}
const providerLabel = (id: string) => aiCache?.providers.find((p: Any) => p.id === id)?.label?.replace(/ \(.*\)$/, '') || id;

/** A dropdown for picking Auto or one specific service, used next to every AI button. */
async function aiPicker(id: string) {
  const info = await aiInfo();
  const ready = info.providers.filter((p: Any) => p.ready);
  return `<select id="${id}" aria-label="AI service" style="width:auto;padding:6px 8px;font-size:13px">
    <option value="default">${info.settings.mode === 'auto' ? 'Auto' : `Default (${esc(providerLabel(info.settings.mode))})`}</option>
    ${info.settings.mode !== 'auto' ? '<option value="auto">Auto</option>' : ''}
    ${ready.map((p: Any) => `<option value="${p.id}">${esc(p.label.replace(/ \(.*\)$/, ''))}</option>`).join('')}</select>`;
}
const madeBy = (r: Any) => `<p class="mono hint" style="margin:10px 0 0">Written by ${esc(providerLabel(r.provider))} (${esc(r.model)})${r.tried?.length ? `, after ${r.tried.map((t: Any) => esc(providerLabel(t.provider))).join(' and ')} didn't answer` : ''}</p>${r.flags?.length ? `<p class="hint" style="margin:6px 0 0">Stock phrases to look at: <b>${r.flags.map(esc).join(', ')}</b></p>` : ''}`;

async function viewAi(main: HTMLElement) {
  const info = await aiInfo(true);
  const s = info.settings;
  main.innerHTML = `<div class="head"><div><h1>AI providers</h1><div class="sub">Connect the services you use. Auto picks the best one for each job and moves on if one is down.</div></div></div>
    ${info.canStoreKeys ? '' : '<div class="warn">Keys can\'t be saved until the site\'s APP_KEY secret is set. This happens during the Cloudflare setup.</div>'}
    <div class="grid" style="max-width:860px">
      <div class="card"><label class="f"><span>Which service to use</span><select id="ai-mode">
        <option value="auto" ${s.mode === 'auto' ? 'selected' : ''}>Auto: best service for each job, with fallback</option>
        ${info.providers.map((p: Any) => `<option value="${p.id}" ${s.mode === p.id ? 'selected' : ''}>Always ${esc(p.label)}</option>`).join('')}</select>
        <small class="hint">You can still pick a different service on any AI button.</small></label>
        <label class="f"><span>How you write</span><textarea id="ai-voice" rows="4">${esc(s.voice)}</textarea>
        <small class="hint">Added to every request. Em dashes and stock phrases are always blocked, whatever this says.</small></label>
        <button class="btn" id="ai-save">Save</button></div>
      ${info.providers.map((p: Any) => `<div class="card" data-prov="${p.id}">
        <div class="row" style="justify-content:space-between;margin-bottom:12px"><b style="font-size:17px">${esc(p.label)}</b>
          <span class="pill ${p.ready ? 'published' : p.needsKey && !p.hasKey ? '' : 'review'}">${p.ready ? 'Ready' : !p.enabled ? 'Off' : p.needsKey ? 'Needs a key' : 'Available once live'}</span></div>
        ${p.needsKey ? `<label class="f"><span>API key</span><input type="password" data-k autocomplete="off" placeholder="${p.hasKey ? 'Saved. Paste a new key to replace it.' : 'Paste your key'}"><small class="hint">${esc(p.keyHint)}. Stored encrypted, never shown again.</small></label>` : `<p class="hint">${esc(p.keyHint)}</p>`}
        <label class="f"><span>Model</span><input type="text" data-m value="${esc(p.model)}" list="ml-${p.id}"><datalist id="ml-${p.id}">${p.models.map((m: string) => `<option value="${esc(m)}">`).join('')}</datalist></label>
        <label class="row" style="margin-bottom:14px"><input type="checkbox" data-e ${p.enabled ? 'checked' : ''}> Use this service</label>
        <div class="row"><button class="btn sm" data-save>Save</button><button class="btn ghost sm" data-test ${p.ready ? '' : 'disabled'}>Test</button>${p.hasKey ? '<button class="btn danger sm" data-rm>Remove key</button>' : ''}<span class="hint" data-out></span></div>
      </div>`).join('')}
      <div class="card"><div class="mono hint" style="margin-bottom:8px">Recent AI activity</div>${info.log.length ? `<div style="overflow-x:auto"><table><tbody>${info.log.map((l: Any) => `<tr><td class="hint">${ago(l.created_at)}</td><td>${esc(l.task)}</td><td>${esc(providerLabel(l.provider))}</td><td><span class="pill ${l.ok ? 'published' : ''}">${l.ok ? `${(l.ms / 1000).toFixed(1)}s` : 'failed'}</span></td><td class="hint">${esc(l.error || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint" style="margin:0">Nothing yet.</p>'}</div>
    </div>`;
  $('#ai-save').addEventListener('click', async () => {
    try { await api('PUT', '/ai/settings', { mode: ($('#ai-mode') as HTMLSelectElement).value, voice: ($('#ai-voice') as HTMLTextAreaElement).value }); aiCache = null; toast('Saved.'); } catch (e) { fail(e); }
  });
  main.querySelectorAll<HTMLElement>('[data-prov]').forEach((card) => {
    const id = card.dataset.prov!;
    const out = card.querySelector('[data-out]') as HTMLElement;
    card.querySelector('[data-save]')!.addEventListener('click', async () => {
      const k = (card.querySelector('[data-k]') as HTMLInputElement | null)?.value.trim();
      try {
        await api('PUT', `/ai/providers/${id}`, { ...(k ? { key: k } : {}), model: (card.querySelector('[data-m]') as HTMLInputElement).value, enabled: (card.querySelector('[data-e]') as HTMLInputElement).checked });
        toast('Saved.'); viewAi(main);
      } catch (e) { fail(e); }
    });
    card.querySelector('[data-test]')!.addEventListener('click', async () => {
      out.textContent = 'Asking...';
      try { const r = await api('POST', `/ai/test/${id}`); out.textContent = `Connected: "${r.text.slice(0, 80)}"`; } catch (e) { out.textContent = ''; fail(e); }
    });
    card.querySelector('[data-rm]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Remove the saved key for this service?', 'Remove key'))) return;
      await api('PUT', `/ai/providers/${id}`, { key: null }); viewAi(main);
    });
  });
}

/** Shows an AI result for review. Nothing changes until "Use this" is pressed. */
function reviewResult(title: string, r: Any, html: boolean, actions: { label: string; run: () => void }[]) {
  const m = modal(title, `<div class="paper" style="padding:20px;max-height:52vh;overflow:auto"><div class="ProseMirror" style="min-height:0">${html ? r.text : `<p>${esc(r.text)}</p>`}</div></div>${madeBy(r)}
    <div class="row" style="margin-top:16px">${actions.map((a, i) => `<button class="btn${i ? ' ghost' : ''}" data-a="${i}">${esc(a.label)}</button>`).join('')}<button class="btn ghost" data-close>Discard</button></div>`);
  m.el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => { actions[Number(b.dataset.a)].run(); m.close(); }));
}

async function busy<T>(btn: HTMLButtonElement, label: string, fn: () => Promise<T>) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = was; }
}

/** Generate a logo or browser icon with AI and pick one of three options. */
async function aiLogo(kind: 'logo' | 'favicon', onUse: (key: string) => void) {
  const m = modal(kind === 'logo' ? 'Make a logo with AI' : 'Make a browser icon with AI', `<label class="f"><span>What should it feel like?</span><textarea id="lg-brief" rows="3" placeholder="e.g. a simple MG monogram, calm and confident, a nod to the Wellington harbour"></textarea></label>
    <div class="row" style="margin-bottom:16px">${await aiPicker('lg-pick')}<button class="btn" id="lg-go">Make 3 options</button></div><div id="lg-out" class="media-grid"></div>`);
  const go = m.el.querySelector('#lg-go') as HTMLButtonElement;
  go.addEventListener('click', () => busy(go, 'Designing...', async () => {
    try {
      const r = await api('POST', '/ai/logo', { kind, brief: ($('#lg-brief') as HTMLTextAreaElement).value, choice: ($('#lg-pick') as HTMLSelectElement).value });
      const out = m.el.querySelector('#lg-out') as HTMLElement;
      out.innerHTML = r.options.map((o: Any, i: number) => `<div class="m" data-i="${i}" title="Use this one"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.svg)}" alt="Option ${i + 1}" style="object-fit:contain;padding:12px;background:#fff"><span>${esc(providerLabel(o.provider))}, use this</span></div>`).join('');
      out.querySelectorAll<HTMLElement>('.m').forEach((el) => el.addEventListener('click', async () => {
        try { const u = await api('POST', '/ai/logo/use', { kind, svg: r.options[Number(el.dataset.i)].svg }); onUse(u.key); m.close(); toast(kind === 'logo' ? 'Logo saved. It is live.' : 'Icon saved. It is live.'); } catch (e) { fail(e); }
      }));
    } catch (e) { fail(e); }
  }));
}


// ---------- People and roles ----------
async function viewPeople(main: HTMLElement, tab = 'people') {
  const tabs = [['people', 'People', 'users.manage'], ['roles', 'Roles', 'users.manage'], ['activity', 'Activity', 'audit.view']].filter((t) => can(t[2]));
  main.innerHTML = `<div class="head"><div><h1>People</h1><div class="sub">Who can sign in to Studio, and what each role lets them do.</div></div><div id="pp-act"></div></div>
    <div class="tabs">${tabs.map(([id, l]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="pp"></div>`;
  main.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => viewPeople(main, b.dataset.tab)));
  const box = $('#pp'), act = $('#pp-act');
  if (tab === 'people') {
    const [users, roles] = await Promise.all([api<Any[]>('GET', '/people/users'), api<Any[]>('GET', '/people/roles')]);
    const roleName = (id: number) => roles.find((r) => r.id === id)?.name || '?';
    act.innerHTML = '<button class="btn" id="add-person">Add a person</button>';
    box.innerHTML = `<div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Name</th><th>Roles</th><th>Status</th><th>Last signed in</th></tr></thead><tbody>
      ${users.map((u) => `<tr class="click" data-id="${u.id}"><td><b>${esc(u.name || u.email)}</b><div class="hint">${esc(u.email)}</div></td>
        <td>${u.roles.map((r: number) => `<span class="pill" style="margin:2px">${esc(roleName(r))}</span>`).join('') || '<span class="hint">No role</span>'}</td>
        <td>${u.active ? (u.must_change_password ? '<span class="pill review">Invited</span>' : '<span class="pill published">Active</span>') : '<span class="pill">Switched off</span>'}</td>
        <td class="hint">${u.last_login ? ago(u.last_login) : 'Never'}</td></tr>`).join('')}</tbody></table></div>`;
    const roleChecks = (sel: number[]) => `<div class="grid" style="gap:6px;margin-bottom:14px">${roles.filter((r) => r.name !== 'Owner' || ME.perms.includes('*')).map((r) => `<label class="row" style="align-items:flex-start;gap:8px"><input type="checkbox" name="role" value="${r.id}" ${sel.includes(r.id) ? 'checked' : ''} style="margin-top:4px"><span><b>${esc(r.name)}</b><br><span class="hint">${esc(r.description)}</span></span></label>`).join('')}</div>`;
    const showPassword = (email: string, pw: string) => {
      const m = modal('Login details', `<p>Give these to them privately. They'll be asked to pick their own password when they first sign in.</p>
        <div class="card" style="font-family:var(--mono);user-select:all;margin:12px 0">Address: ${esc(location.origin)}/admin<br>Email: ${esc(email)}<br>Temporary password: ${esc(pw)}</div>
        <div class="row"><button class="btn" id="cp">Copy</button><button class="btn ghost" data-close>Done</button></div>`);
      m.el.querySelector('#cp')!.addEventListener('click', () => navigator.clipboard.writeText(`Address: ${location.origin}/admin\nEmail: ${email}\nTemporary password: ${pw}`).then(() => toast('Copied.'), () => toast('Select the text and copy it.', true)));
    };
    $('#add-person').addEventListener('click', () => {
      const m = modal('Add a person', `<form><label class="f"><span>Name</span><input type="text" id="np-name"></label><label class="f"><span>Email</span><input type="email" id="np-email" required></label>
        <div class="mono hint" style="margin-bottom:8px">Roles</div>${roleChecks([])}<button class="btn">Add and create login</button></form>`);
      m.el.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rolesSel = [...m.el.querySelectorAll<HTMLInputElement>('[name=role]:checked')].map((i) => Number(i.value));
        try { const r = await api('POST', '/people/users', { name: ($('#np-name') as HTMLInputElement).value, email: ($('#np-email') as HTMLInputElement).value, roles: rolesSel }); m.close(); showPassword(($('#np-email') as HTMLInputElement)?.value || '', r.password); viewPeople(main, 'people'); } catch (err) { fail(err); }
      });
    });
    box.querySelectorAll<HTMLElement>('tr.click').forEach((tr) => tr.addEventListener('click', () => {
      const u = users.find((x) => String(x.id) === tr.dataset.id)!;
      const m = modal(u.name || u.email, `<form><label class="f"><span>Name</span><input type="text" id="ep-name" value="${esc(u.name)}"></label><p class="hint">${esc(u.email)}</p>
        <div class="mono hint" style="margin-bottom:8px">Roles</div>${roleChecks(u.roles)}
        <label class="row" style="margin-bottom:16px"><input type="checkbox" id="ep-active" ${u.active ? 'checked' : ''}> Can sign in</label>
        <div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" id="ep-reset">New temporary password</button>${u.id !== ME.id ? '<button type="button" class="btn danger" id="ep-del">Remove</button>' : ''}</div></form>`);
      m.el.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api('PUT', `/people/users/${u.id}`, { name: ($('#ep-name') as HTMLInputElement).value, active: ($('#ep-active') as HTMLInputElement).checked, roles: [...m.el.querySelectorAll<HTMLInputElement>('[name=role]:checked')].map((i) => Number(i.value)) }); m.close(); toast('Saved.'); viewPeople(main, 'people'); } catch (err) { fail(err); }
      });
      m.el.querySelector('#ep-reset')!.addEventListener('click', async () => { try { const r = await api('PUT', `/people/users/${u.id}`, { resetPassword: true }); m.close(); showPassword(u.email, r.password); } catch (err) { fail(err); } });
      m.el.querySelector('#ep-del')?.addEventListener('click', async () => { if (await confirmBox(`Remove ${u.email}? Their login stops working straight away.`, 'Remove')) { try { await api('DELETE', `/people/users/${u.id}`); m.close(); viewPeople(main, 'people'); } catch (err) { fail(err); } } });
    }));
  } else if (tab === 'roles') {
    const [roles, catalogue] = await Promise.all([api<Any[]>('GET', '/people/roles'), api<Any[]>('GET', '/people/permissions')]);
    act.innerHTML = can('roles.manage') ? '<button class="btn" id="add-role">New role</button>' : '';
    box.innerHTML = `<div class="grid g4">${roles.map((r) => `<div class="card" data-role="${r.id}" style="cursor:${can('roles.manage') && r.name !== 'Owner' ? 'pointer' : 'default'}">
      <div class="row" style="justify-content:space-between"><b style="font-size:17px">${esc(r.name)}</b>${r.system ? '<span class="pill">Built in</span>' : ''}</div>
      <p class="hint" style="margin:6px 0 10px">${esc(r.description)}</p><span class="mono hint">${r.permissions.includes('*') ? 'Everything' : `${r.permissions.length} permissions`}, ${r.members} ${r.members === 1 ? 'person' : 'people'}</span></div>`).join('')}</div>`;
    const editor = (r: Any | null) => {
      const perms: string[] = r?.permissions || [];
      const m = modal(r ? `Edit ${r.name}` : 'New role', `<form>
        <label class="f"><span>Name</span><input type="text" id="rl-name" value="${esc(r?.name || '')}" ${r?.system ? 'disabled' : ''} required placeholder="e.g. Social media helper"></label>
        <label class="f"><span>What it's for</span><input type="text" id="rl-desc" value="${esc(r?.description || '')}"></label>
        ${catalogue.map((g) => `<div class="item"><label class="row" style="justify-content:space-between;margin-bottom:6px"><b>${esc(g.group)}</b><span class="hint"><input type="checkbox" data-all="${esc(g.group)}"> All</span></label>
          ${g.items.map((p: Any) => `<label class="row" style="gap:8px;margin:4px 0"><input type="checkbox" name="perm" data-g="${esc(g.group)}" value="${p.id}" ${perms.includes(p.id) ? 'checked' : ''}> ${esc(p.label)}</label>`).join('')}</div>`).join('')}
        <div class="row"><button class="btn">${r ? 'Save role' : 'Create role'}</button>${r && !r.system ? '<button type="button" class="btn danger" id="rl-del">Delete role</button>' : ''}</div></form>`);
      m.el.querySelectorAll<HTMLInputElement>('[data-all]').forEach((a) => {
        const items = () => [...m.el.querySelectorAll<HTMLInputElement>(`[name=perm][data-g="${CSS.escape(a.dataset.all!)}"]`)];
        a.checked = items().every((i) => i.checked);
        a.addEventListener('change', () => items().forEach((i) => (i.checked = a.checked)));
      });
      m.el.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: ($('#rl-name') as HTMLInputElement).value, description: ($('#rl-desc') as HTMLInputElement).value, permissions: [...m.el.querySelectorAll<HTMLInputElement>('[name=perm]:checked')].map((i) => i.value) };
        try { r ? await api('PUT', `/people/roles/${r.id}`, body) : await api('POST', '/people/roles', body); m.close(); toast('Saved.'); viewPeople(main, 'roles'); } catch (err) { fail(err); }
      });
      m.el.querySelector('#rl-del')?.addEventListener('click', async () => { if (await confirmBox(`Delete the ${r!.name} role? People with it lose what it allowed.`, 'Delete role')) { try { await api('DELETE', `/people/roles/${r!.id}`); m.close(); viewPeople(main, 'roles'); } catch (err) { fail(err); } } });
    };
    $('#add-role')?.addEventListener('click', () => editor(null));
    if (can('roles.manage')) box.querySelectorAll<HTMLElement>('[data-role]').forEach((el) => el.addEventListener('click', () => { const r = roles.find((x) => String(x.id) === el.dataset.role)!; if (r.name !== 'Owner') editor(r); else toast('The Owner role always has every permission.'); }));
  } else {
    const log = await api<Any[]>('GET', '/people/audit');
    act.innerHTML = '';
    box.innerHTML = log.length ? `<div class="card" style="padding:0;overflow-x:auto"><table><tbody>${log.map((l) => `<tr><td class="hint">${ago(l.created_at)}</td><td>${esc(l.name || l.email || 'Someone')}</td><td class="mono">${esc(l.action)}</td><td class="hint">${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nothing yet.</p>';
  }
}

async function viewAccount(main: HTMLElement, forced = false) {
  main.innerHTML = `<div class="head"><div><h1>${forced ? 'Pick your password' : 'Your account'}</h1><div class="sub">${forced ? 'You signed in with a temporary password. Choose your own to carry on.' : esc(ME.email)}</div></div></div>
    <div class="grid" style="max-width:560px">${forced ? '' : `<div class="card"><label class="f"><span>Your name</span><input type="text" id="ac-name" value="${esc(ME.name)}"></label><button class="btn" id="ac-save">Save</button></div>`}
    <form class="card" id="ac-pw"><label class="f"><span>Current password</span><input type="password" id="ac-cur" autocomplete="current-password" required></label>
      <label class="f"><span>New password (10 characters or more)</span><input type="password" id="ac-new" autocomplete="new-password" minlength="10" required></label><button class="btn">Change password</button></form></div>`;
  $('#ac-save')?.addEventListener('click', async () => { try { await api('PUT', '/people/me', { name: ($('#ac-name') as HTMLInputElement).value }); toast('Saved.'); } catch (e) { fail(e); } });
  $('#ac-pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('PUT', '/people/me/password', { current: ($('#ac-cur') as HTMLInputElement).value, next: ($('#ac-new') as HTMLInputElement).value }); toast('Password changed.'); if (forced) boot(); } catch (err) { fail(err); }
  });
}

// ---------- Coming next ----------
const SOON: Record<string, { title: string; body: string; items: string[] }> = {
  ideas: { title: 'Create Ideas', body: 'Your own knowledge base turns into post ideas you can review, edit and publish.', items: ['Add notes, documents, links and past posts', 'One click for fresh post ideas grounded in what you know', 'Turn any idea into a full draft and social versions', 'Everything waits in "To review" until you approve it'] },
  social: { title: 'Social', body: 'Publish once, share everywhere, in a voice that suits each place.', items: ['Facebook Page and Instagram first', 'Then LinkedIn, X, Threads and Bluesky', 'Post now or schedule', 'Per-channel wording and image crops'] },
  integrations: { title: 'Integrations', body: 'Connect outside systems through their APIs.', items: ['Any REST API with an API key, token or OAuth', 'Incoming and outgoing webhooks', 'Use connected data in page blocks', 'Keys stored encrypted, never in code'] },
  modules: { title: 'Modules', body: 'Describe what you want and AI builds it as a block you can drop on any page.', items: ['Plain-English description in, working block out', 'Preview before it goes live', 'Runs in a sandbox so it cannot break the site', 'Versioned, so you can roll back'] },
};
function viewSoon(main: HTMLElement, s: { title: string; body: string; items: string[] }) {
  main.innerHTML = `<div class="head"><div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.body)}</div></div></div>
    <div class="soon"><span class="pill scheduled">Being built</span><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
}

// ---------- Boot ----------
async function boot() {
  const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ signedIn: false }));
  if (!me.signedIn) return renderLogin();
  ME = me.user;
  $('#app').innerHTML = '';
  if (ME.mustChange) { shell(); return viewAccount($('#main'), true); }
  route();
}
boot();

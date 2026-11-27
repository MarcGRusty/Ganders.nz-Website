// Studio: the admin app for ganders.nz. Plain TypeScript, bundled by esbuild into public/admin/assets/app.js.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

type Any = Record<string, any>;

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
      boot();
    } catch (err) { fail(err); }
  });
}

// ---------- Shell ----------
const NAV: [string, string, string?][] = [
  ['/admin', 'Overview'],
  ['/admin/pages', 'Pages'],
  ['/admin/writing', 'Writing'],
  ['/admin/media', 'Media'],
  ['/admin/design', 'Design'],
  ['/admin/settings', 'Site details'],
  ['/admin/messages', 'Messages'],
  ['/admin/ai', 'AI providers', 'Next'],
  ['/admin/ideas', 'Create Ideas', 'Soon'],
  ['/admin/social', 'Social', 'Soon'],
  ['/admin/integrations', 'Integrations', 'Soon'],
  ['/admin/modules', 'Modules', 'Soon'],
];

function shell() {
  if ($('.shell')) return;
  $('#app').innerHTML = `<div class="shell"><aside class="side">
    <a class="logo" href="/admin" data-link><i></i>Studio</a>
    ${NAV.map(([href, label, tag], i) => `${i === 0 ? '<div class="grp mono">Site</div>' : i === 7 ? '<div class="grp mono">Grow</div>' : ''}<a class="nav" href="${href}" data-link>${label}${tag ? `<small>${tag}</small>` : ''}</a>`).join('')}
    <div class="foot"><a href="/" target="_blank" rel="noopener">View site</a><button id="logout">Sign out</button></div>
  </aside><main id="main"></main></div>`;
  $('#logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); renderLogin(); });
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
      ${[['published', 'Published posts'], ['drafts', 'Drafts'], ['review', 'Waiting for review'], ['pages', 'Pages'], ['unread', 'Unread messages']].map(([k, l]) => `<div class="card stat"><div class="n">${s[k]}</div><div class="mono l">${l}</div></div>`).join('')}
    </div>`;
}

// ---------- Pages ----------
async function viewPages(main: HTMLElement) {
  const pages = await api<Any[]>('GET', '/pages');
  main.innerHTML = `<div class="head"><div><h1>Pages</h1><div class="sub">Every page on the site. Click one to edit it visually.</div></div>
    <button class="btn" id="add">New page</button></div>
    <div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Title</th><th>Address</th><th>Status</th><th>In menu</th><th>Updated</th></tr></thead>
    <tbody>${pages.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${esc(p.title)}</b></td><td class="mono">/${p.slug === 'home' ? '' : esc(p.slug)}</td>
      <td><span class="pill ${p.status}">${p.status}</span></td><td>${p.in_menu ? 'Yes' : ''}</td><td class="hint">${ago(p.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
  main.querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', () => go(`/admin/pages/${(tr as HTMLElement).dataset.id}`)));
  $('#add').addEventListener('click', () => {
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
      <a class="btn ghost sm" href="${page.slug === 'home' ? '/' : '/' + esc(page.slug)}" target="_blank" rel="noopener">View</a>
      <button class="btn" id="save">Save</button>
      <button class="btn ghost" id="pub">${page.status === 'published' ? 'Unpublish' : 'Publish'}</button>
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
      if (key === 'link') return `<label class="f"><span>Link</span><input type="url" data-p="${esc(path)}" value="${esc(v)}" placeholder="https://"></label>`;
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
      ($('#pub') as HTMLButtonElement).textContent = page.status === 'published' ? 'Unpublish' : 'Publish';
      toast(page.status === 'published' ? 'Saved. It is live.' : 'Saved as a draft.');
    } catch (e) { fail(e); }
  }
  $('#save').addEventListener('click', () => save());
  $('#pub').addEventListener('click', () => save({ status: page.status === 'published' ? 'draft' : 'published' }));
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
      <label class="f"><span>Menu order</span><input type="number" id="ps-order" value="${page.menu_order || 0}"></label>
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
    <a class="btn ghost sm" href="/writing/${esc(post.slug)}?preview=1" target="_blank" rel="noopener" id="pv">Preview</a><button class="btn" id="save">Save</button></div></div>
    <div class="post-ed"><div class="paper">
      <textarea class="ttl" id="title" rows="1" placeholder="Title">${esc(post.title === 'Untitled' ? '' : post.title)}</textarea>
      <textarea class="exc" id="excerpt" rows="2" placeholder="One line that makes someone want to read it">${esc(post.excerpt)}</textarea>
      <div class="tb" id="tb"></div><div id="body"></div>
    </div>
    <aside class="grid" style="gap:14px">
      <div class="card"><label class="f"><span>Status</span><select id="status">${['idea', 'draft', 'review', 'scheduled', 'published'].map((s) => `<option ${s === post.status ? 'selected' : ''} value="${s}">${s === 'review' ? 'Ready for review' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
        <label class="f" id="when" ${post.status === 'scheduled' ? '' : 'hidden'}><span>Publish at (NZ time)</span><input type="datetime-local" id="publish_at"></label>
        <button class="btn" id="publish" style="width:100%;justify-content:center">${post.status === 'published' ? 'Update live post' : 'Publish now'}</button></div>
      <div class="card"><label class="f"><span>Cover image</span><div id="cover"></div></label></div>
      <div class="card"><label class="f"><span>Tags</span><input type="text" id="tags" value="${esc(post.tags.join(', '))}" placeholder="security, travel"></label>
        <label class="f" style="margin:0"><span>Address</span><input type="text" id="slug" value="${esc(post.slug)}"></label></div>
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
      $('#publish').textContent = post.status === 'published' ? 'Update live post' : 'Publish now';
      toast(post.status === 'published' ? 'Published.' : post.status === 'scheduled' ? 'Scheduled.' : 'Saved.');
    } catch (e) { fail(e); }
  }
  $('#save').addEventListener('click', () => save());
  $('#publish').addEventListener('click', () => save('published'));
  $('#hist').addEventListener('click', () => showHistory('post', id, (d) => {
    ($('#title') as HTMLTextAreaElement).value = d.title; ($('#excerpt') as HTMLTextAreaElement).value = d.excerpt; editor.commands.setContent(d.body || ''); post.cover = d.cover; renderCover(); dirty = true;
  }));
  const keys = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  const bu = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
  window.addEventListener('keydown', keys); window.addEventListener('beforeunload', bu);
  cleanup = () => { editor.destroy(); window.removeEventListener('keydown', keys); window.removeEventListener('beforeunload', bu); };
}

// ---------- Design ----------
const FONT_CHOICES = {
  display: ['Bricolage Grotesque', 'Fraunces', 'Instrument Serif', 'Syne', 'Unbounded', 'DM Serif Display', 'Familjen Grotesk', 'Gloock', 'Young Serif'],
  body: ['Hanken Grotesk', 'Instrument Sans', 'Figtree', 'Source Serif 4', 'Public Sans', 'Atkinson Hyperlegible', 'Newsreader'],
  mono: ['IBM Plex Mono', 'JetBrains Mono', 'DM Mono', 'Space Mono', 'Martian Mono'],
};
async function viewDesign(main: HTMLElement) {
  const s = await api<Any>('GET', '/settings');
  const t = { ...s.theme };
  const colour = (k: string, l: string) => `<label class="f"><span>${l}</span><div class="row"><input type="color" data-c="${k}" value="${esc(t[k])}" style="width:44px;height:36px;padding:2px;border:1px solid var(--line);border-radius:4px"><input type="text" data-ct="${k}" value="${esc(t[k])}" style="flex:1;font-family:var(--mono)"></div></label>`;
  const font = (k: string, l: string, list: string[]) => `<label class="f"><span>${l}</span><select data-font="${k}">${[...new Set([t[k], ...list])].map((f) => `<option ${f === t[k] ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__custom">Another Google font...</option></select></label>`;
  main.innerHTML = `<div class="head"><div><h1>Design</h1><div class="sub">Colours, type, logo and icon. Changes show in the preview straight away.</div></div><button class="btn" id="save">Save design</button></div>
    <div class="editor"><div class="blocks">
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Logo and icon</div>
        <label class="f"><span>Logo (shown in the header)</span><div id="logo"></div></label>
        <label class="f"><span>Browser icon</span><div id="fav"></div></label>
        <p class="hint" style="margin:0">No logo? Your name is shown in the display font. AI logo and icon generation arrives with the AI providers.</p></div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Colour</div>${colour('paper', 'Background')}${colour('ink', 'Text')}${colour('muted', 'Quiet text')}${colour('accent', 'Accent')}${colour('accent2', 'Second accent')}</div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Type</div>${font('displayFont', 'Headings', FONT_CHOICES.display)}${font('bodyFont', 'Body text', FONT_CHOICES.body)}${font('monoFont', 'Labels', FONT_CHOICES.mono)}</div>
      <div class="panel"><div class="mono hint" style="margin-bottom:10px">Shape and motion</div>
        <label class="f"><span>Corner roundness: <b id="rv">${t.radius}px</b></span><input type="range" min="0" max="24" data-n="radius" value="${t.radius}"></label>
        <label class="f"><span>Content width: <b id="wv">${t.maxWidth}px</b></span><input type="range" min="880" max="1480" step="20" data-n="maxWidth" value="${t.maxWidth}"></label>
        <label class="row"><input type="checkbox" id="motion" ${t.motion ? 'checked' : ''}> Gentle fade-in as you scroll</label></div>
    </div><div class="frame"><iframe id="pv" title="Design preview"></iframe></div></div>`;
  const frame = $('#pv') as HTMLIFrameElement;
  let tm: number | undefined;
  const refresh = () => { clearTimeout(tm); tm = window.setTimeout(async () => { const y = frame.contentWindow?.scrollY || 0; frame.srcdoc = await api('POST', '/preview', { slug: 'home', theme: t, settings: { logo: s.logo, favicon: s.favicon }, edit: false }); frame.onload = () => frame.contentWindow?.scrollTo(0, y); }, 250); };
  main.querySelectorAll<HTMLInputElement>('[data-c]').forEach((i) => i.addEventListener('input', () => { t[i.dataset.c!] = i.value; ($(`[data-ct="${i.dataset.c}"]`) as HTMLInputElement).value = i.value; refresh(); }));
  main.querySelectorAll<HTMLInputElement>('[data-ct]').forEach((i) => i.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(i.value)) { t[i.dataset.ct!] = i.value; ($(`[data-c="${i.dataset.ct}"]`) as HTMLInputElement).value = i.value; refresh(); } }));
  main.querySelectorAll<HTMLSelectElement>('[data-font]').forEach((sel) => sel.addEventListener('change', () => {
    if (sel.value !== '__custom') { t[sel.dataset.font!] = sel.value; return refresh(); }
    const m = modal('Use another Google font', `<form><label class="f"><span>Font name exactly as on fonts.google.com</span><input type="text" id="cf" placeholder="e.g. Space Grotesk" required></label><button class="btn">Use it</button></form>`);
    m.el.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = ($('#cf') as HTMLInputElement).value.trim(); if (v) { t[sel.dataset.font!] = v; sel.insertAdjacentHTML('afterbegin', `<option selected>${esc(v)}</option>`); refresh(); } m.close(); });
  }));
  main.querySelectorAll<HTMLInputElement>('[data-n]').forEach((i) => i.addEventListener('input', () => { t[i.dataset.n!] = Number(i.value); $(i.dataset.n === 'radius' ? '#rv' : '#wv').textContent = `${i.value}px`; refresh(); }));
  ($('#motion') as HTMLInputElement).addEventListener('change', (e) => { t.motion = (e.target as HTMLInputElement).checked; });
  const slot = (id: string, key: 'logo' | 'favicon') => {
    const v = s[key];
    $(`#${id}`).innerHTML = `<div class="row">${v ? `<img src="${esc(mediaUrl(v))}" alt="" style="height:40px;max-width:160px;object-fit:contain;background:${esc(t.paper)};padding:4px;border:1px solid var(--line);border-radius:3px">` : key === 'favicon' ? '<img src="/favicon.svg" alt="" style="height:32px">' : ''}<button type="button" class="btn ghost sm" data-k="pick">${v ? 'Change' : 'Upload or choose'}</button>${v ? '<button type="button" class="btn ghost sm" data-k="rm">Remove</button>' : ''}</div>${key === 'favicon' && !v ? '<small class="hint">Currently using a generated monogram in your colours.</small>' : ''}`;
    $(`#${id} [data-k="pick"]`).addEventListener('click', () => pickMedia((k) => { s[key] = k; slot(id, key); refresh(); }));
    $(`#${id} [data-k="rm"]`)?.addEventListener('click', () => { s[key] = null; slot(id, key); refresh(); });
  };
  slot('logo', 'logo'); slot('fav', 'favicon');
  $('#save').addEventListener('click', async () => { try { await api('PUT', '/settings', { theme: t, logo: s.logo, favicon: s.favicon }); toast('Design saved. It is live.'); } catch (e) { fail(e); } });
  refresh();
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
async function viewMessages(main: HTMLElement) {
  const list = await api<Any[]>('GET', '/messages');
  main.innerHTML = `<div class="head"><div><h1>Messages</h1><div class="sub">From the contact form on your site.</div></div></div>
    ${list.length ? list.map((m) => `<div class="card" style="margin-bottom:12px;${m.read ? '' : 'border-color:var(--accent)'}"><div class="row" style="justify-content:space-between"><b>${esc(m.name)}</b><span class="hint">${ago(m.created_at)}</span></div>
      <div class="hint" style="margin-bottom:8px;user-select:all">${esc(m.email)}</div><p style="white-space:pre-wrap;margin:0 0 12px">${esc(m.body)}</p>
      <div class="row">${m.read ? '' : `<button class="btn ghost sm" data-read="${m.id}">Mark as read</button>`}<button class="btn danger sm" data-del="${m.id}">Delete</button></div></div>`).join('') : '<p class="hint">No messages yet.</p>'}`;
  main.querySelectorAll<HTMLElement>('[data-read]').forEach((b) => b.addEventListener('click', async () => { await api('PUT', `/messages/${b.dataset.read}`); viewMessages(main); }));
  main.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (await confirmBox('Delete this message?', 'Delete')) { await api('DELETE', `/messages/${b.dataset.del}`); viewMessages(main); } }));
}

// ---------- Coming next ----------
const SOON: Record<string, { title: string; body: string; items: string[] }> = {
  ai: { title: 'AI providers', body: 'Connect the AI services you use. Auto mode picks the best one for each job, or you can choose.', items: ['Claude, ChatGPT, Grok and Gemini, with Cloudflare AI as a free backup', 'Auto mode that routes by task and falls back if a service is down', 'A model picker on every AI button', 'Every result passes the style check: no em dashes, no stock phrasing', 'AI logo and browser icon'] },
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
  $('#app').innerHTML = '';
  route();
}
boot();

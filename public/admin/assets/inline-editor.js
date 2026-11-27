// Runs inside the page preview when the visual editor is open.
// Text is edited in place; changes are sent to the Studio window.
(() => {
  const post = (msg) => parent.postMessage({ source: 'ganders-inline', ...msg }, location.origin === 'null' ? '*' : location.origin);
  const css = document.createElement('style');
  css.textContent = `
    [data-block]{position:relative;outline:1px dashed transparent;outline-offset:-1px;transition:outline-color .15s}
    [data-block]:hover{outline-color:color-mix(in srgb,var(--accent) 55%,transparent)}
    [data-block].sel{outline:2px solid var(--accent)}
    [data-f]{outline:none;border-radius:2px;cursor:text}
    [data-f]:hover{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 12%,transparent)}
    [data-f]:focus{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
    [data-f]:empty::before{content:'Type here';color:var(--muted)}
    [data-img]{cursor:pointer}
    [data-img]:hover{outline:2px solid var(--accent)}
    .g-bar{position:fixed;z-index:9999;display:none;gap:2px;background:#17140f;color:#f3efe6;padding:4px;border-radius:4px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:500 12px/1 'JetBrains Mono',monospace}
    .g-bar button{all:unset;cursor:pointer;padding:7px 9px;border-radius:3px}
    .g-bar button:hover{background:#3a352d}
    .g-tag{position:absolute;top:0;left:0;z-index:5;background:var(--accent);color:#fff;font:500 11px/1 'JetBrains Mono',monospace;padding:5px 7px;text-transform:uppercase;letter-spacing:.04em;display:none}
    [data-block]:hover>.g-tag,[data-block].sel>.g-tag{display:block}`;
  document.head.appendChild(css);

  document.querySelectorAll('[data-block]').forEach((b) => {
    const t = document.createElement('span');
    t.className = 'g-tag';
    t.textContent = b.dataset.type;
    b.prepend(t);
  });

  // Floating toolbar for rich text fields.
  const bar = document.createElement('div');
  bar.className = 'g-bar';
  const cmds = [['B', 'bold'], ['I', 'italic'], ['H2', 'h2'], ['H3', 'h3'], ['P', 'p'], ['Quote', 'blockquote'], ['List', 'insertUnorderedList'], ['Link', 'link'], ['Clear', 'removeFormat']];
  cmds.forEach(([label, cmd]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onmousedown = (e) => {
      e.preventDefault();
      if (cmd === 'link') {
        const url = prompt('Link to (leave empty to remove)');
        if (url === null) return;
        url ? document.execCommand('createLink', false, url) : document.execCommand('unlink');
      } else if (['h2', 'h3', 'p', 'blockquote'].includes(cmd)) document.execCommand('formatBlock', false, cmd);
      else document.execCommand(cmd);
      const el = document.activeElement;
      if (el && el.dataset.f) send(el);
    };
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);

  const noDash = (s) => s.replace(/\s*\u2014\s*/g, ', ');
  const send = (el) => {
    const block = el.closest('[data-block]').dataset.block;
    const rich = el.dataset.rich === '1';
    let value;
    if (rich) value = el.innerHTML;
    else if (el.dataset.md === '1') {
      // Keep the coloured word: <em>word</em> is stored as *word*.
      const c = el.cloneNode(true);
      c.querySelectorAll('em,i').forEach((x) => x.replaceWith('*' + x.textContent + '*'));
      value = c.textContent.replace(/\n+$/, '');
    } else value = el.innerText.replace(/\n+$/, '');
    value = noDash(value);
    post({ type: 'field', block, path: el.dataset.f, value });
  };

  // Swap an em dash for a comma as it is typed, keeping the caret in place.
  document.addEventListener('beforeinput', (e) => {
    if (!e.target.closest?.('[data-f]') || !e.data || !/\u2014/.test(e.data)) return;
    e.preventDefault();
    // People type a spaced em dash as space, dash, space. Drop the space before and leave a comma;
    // the space they type next completes ", ".
    const sel = getSelection();
    const n = sel.anchorNode, o = sel.anchorOffset;
    if (n && n.nodeType === 3 && o > 0 && /\s/.test(n.textContent[o - 1])) document.execCommand('delete');
    document.execCommand('insertText', false, e.data.replace(/\u2014/g, ','));
  });
  document.addEventListener('input', (e) => { const el = e.target.closest?.('[data-f]'); if (el) send(el); });
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('[data-f]');
    if (el && el.dataset.rich !== '1' && e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); post({ type: 'save' }); }
  });
  // Paste as plain text so outside formatting does not creep in.
  document.addEventListener('paste', (e) => {
    const el = e.target.closest?.('[data-f]');
    if (!el) return;
    e.preventDefault();
    document.execCommand('insertText', false, noDash(e.clipboardData.getData('text/plain')));
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-f]');
    if (el && el.dataset.rich === '1') {
      const r = el.getBoundingClientRect();
      bar.style.display = 'flex';
      bar.style.top = Math.max(8, r.top - 44) + 'px';
      bar.style.left = Math.max(8, r.left) + 'px';
    } else bar.style.display = 'none';
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.closest?.('[data-rich="1"]')) bar.style.display = 'none'; }, 100));
  window.addEventListener('scroll', () => (bar.style.display = 'none'), { passive: true });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && !a.closest('[data-f]')) e.preventDefault(); // stay in the editor
    const img = e.target.closest('[data-img]');
    const block = e.target.closest('[data-block]');
    if (img) { e.preventDefault(); post({ type: 'image', block: block.dataset.block, path: img.dataset.img }); }
    if (block) {
      document.querySelectorAll('[data-block].sel').forEach((x) => x.classList.remove('sel'));
      block.classList.add('sel');
      post({ type: 'select', block: block.dataset.block });
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'highlight') {
      const el = document.querySelector(`[data-block="${CSS.escape(e.data.block)}"]`);
      document.querySelectorAll('[data-block].sel').forEach((x) => x.classList.remove('sel'));
      if (el) { el.classList.add('sel'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  });
  post({ type: 'ready' });
})();

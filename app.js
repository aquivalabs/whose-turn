// Whose Turn window: renders the rows the local server computed and re-renders on every server-sent update.
(() => {
  let S = null;
  const ui = { feed: 'all', move: 'open', open: new Set(), modal: null, showDone: false, ws: '' };
  try { ui.ws = new URLSearchParams(location.search).get('ws') || localStorage.getItem('wt-ws') || ''; } catch (e) { /* storage may be blocked */ }
  const $ = (id) => document.getElementById(id);

  // ---------- small DOM helpers (data is untrusted: text only, https links only)
  const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
  const span = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; return s; };
  const link = (text, url) => {
    const href = safeUrl(url);
    if (!href) return document.createTextNode(text || '');
    const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a;
  };
  const button = (cls, text, onAct, label) => {
    const b = span(cls, text); b.setAttribute('role', 'button'); b.tabIndex = 0;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => { e.stopPropagation(); onAct(); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onAct(); } });
    return b;
  };
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (!isFinite(m)) return '';
    if (m < 1) return 'now';
    if (m < 60) return m + 'm ago';
    if (m < 48 * 60) return Math.round(m / 60) + 'h ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const age = (iso) => {
    const h = (Date.now() - new Date(iso)) / 3600000;
    if (!isFinite(h) || h < 0) return { text: '', old: false, hours: 0 };
    return { text: h < 1 ? '<1h' : h < 48 ? Math.floor(h) + 'h' : Math.floor(h / 24) + 'd', old: h >= 24, hours: h };
  };
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());

  // ---------- marks (kept by the server on disk)
  const marks = () => S.marks;
  const isHandled = (r) => { const m = marks().handled[r.row_id]; return !!m && String(r.activity_at || '') <= m; };
  const isNew = (r) => new Date(r.at).getTime() > (marks().base || 0) && !marks().seen.includes(r.id);
  const setMarks = (body) => post('/api/marks', body).then((m) => { S.marks = m; render(); });

  // ---------- Markdown to DOM (no HTML from data)
  const inline = (text, parent) => {
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>()]+)|(@[A-Za-z0-9-]+(?: [A-Z][a-z]+)?)|((?<![A-Za-z0-9])\*[^*\s][^*]*\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9]))/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
      const t = m[0];
      if (m[1]) { const c = document.createElement('code'); c.textContent = t.slice(1, -1); parent.append(c); }
      else if (m[2]) { const b = document.createElement('strong'); b.textContent = t.slice(2, -2); parent.append(b); }
      else if (m[3]) { const i = t.indexOf(']('); parent.append(link(t.slice(1, i), t.slice(i + 2, -1))); }
      else if (m[4]) parent.append(link(t, t));
      else if (m[5]) parent.append(span('wt-mention', t));
      else { const em = document.createElement('em'); em.textContent = t.slice(1, -1); parent.append(em); }
      last = m.index + t.length;
    }
    if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
  };
  const markdown = (src) => {
    const out = document.createDocumentFragment();
    const lines = String(src || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
    let para = [], list = null;
    const flush = () => {
      if (para.length) { const p = document.createElement('p'); para.forEach((l, i) => { if (i) p.append(document.createElement('br')); inline(l, p); }); out.append(p); para = []; }
      list = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        flush();
        const code = [];
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
        const pre = document.createElement('pre'); const c = document.createElement('code'); c.textContent = code.join('\n'); pre.append(c); out.append(pre);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flush(); const el = document.createElement(h[1].length <= 2 ? 'h4' : 'h5'); inline(h[2], el); out.append(el); continue; }
      const q = line.match(/^>\s?(.*)$/);
      if (q) { flush(); const bq = document.createElement('blockquote'); inline(q[1], bq); out.append(bq); continue; }
      const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        if (para.length) { const keep = list; flush(); list = keep; }
        const ordered = /\d/.test(li[1]);
        if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) { list = document.createElement(ordered ? 'ol' : 'ul'); out.append(list); }
        const item = document.createElement('li'); inline(li[2], item); list.append(item);
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      list = null;
      para.push(line);
    }
    flush();
    return out;
  };

  // ---------- rendering
  const prCell = (r) => {
    const td = document.createElement('td');
    if (!r.pr) return td;
    td.append(link(r.pr, r.pr_url));
    if (r.pr_state === 'OPEN' && r.checks) {
      const cls = r.checks === 'failing' ? 'bad' : r.checks === 'running' ? 'warn' : r.checks === 'passing' ? 'ok' : '';
      td.append(' ', span('wt-pill ' + cls, r.checks));
    } else if (r.pr_state) td.append(' ', span('wt-pill', r.pr_state.toLowerCase()));
    return td;
  };
  const keyCell = (r) => {
    const td = document.createElement('td');
    const k = link(r.key, r.ticket_url); if (k.classList) k.classList.add('wt-key');
    td.append(k, span('wt-sum', r.summary));
    return td;
  };

  function renderMove(turn) {
    const you = turn.filter((r) => r.group === 'you').sort((a, b) => String(a.updated).localeCompare(String(b.updated)));
    const showHandled = ui.move === 'handled';
    const rows = you.filter((r) => isHandled(r) === showHandled);
    const openCount = you.filter((r) => !isHandled(r)).length;
    $('move-open').textContent = String(openCount);
    $('move-handled').textContent = String(you.length - openCount);
    ['sum-mine', 'tile-mine'].forEach((id) => { $(id).textContent = String(openCount); });
    $('move-empty').hidden = rows.length !== 0;
    $('move-empty').textContent = showHandled ? 'Nothing marked as handled.' : 'Nothing is waiting on you.';
    $('move-body').replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      const next = document.createElement('td');
      const line = document.createElement('span'); line.className = 'wt-hint-row';
      line.append(span('wt-next', r.next));
      const ag = age(r.activity_at);
      if (ag.text) { const s = span('wt-age' + (ag.old ? ' old' : ''), ag.text); s.dataset.tip = 'Waiting since ' + new Date(r.activity_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); line.append(s); }
      if (r.why) { const q = span('wt-hint-icon', '?'); q.dataset.tip = r.why; q.setAttribute('role', 'button'); q.tabIndex = 0; q.setAttribute('aria-label', 'Why this is your move'); line.append(q); }
      next.append(line);
      if (showHandled) next.append(span('wt-handled-note', 'Marked ' + ago(marks().handled[r.row_id])));
      const comment = document.createElement('td'); comment.className = 'wt-hide-narrow';
      if (r.comment) { comment.className += ' wt-quote'; comment.append(link(r.comment, r.comment_url)); }
      const act = document.createElement('td');
      act.append(button('wt-mark' + (showHandled ? ' undo' : ''), showHandled ? 'Undo' : 'Handled',
        () => setMarks({ handled: { [r.row_id]: showHandled ? null : new Date().toISOString() } }),
        (showHandled ? 'Move back to open: ' : 'Mark as handled: ') + r.key));
      tr.append(keyCell(r), next, prCell(r), comment, act);
      return tr;
    }));
    return openCount;
  }

  function renderWaiting(turn) {
    const rows = turn.filter((r) => r.group === 'others').sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    $('waiting-body').replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      const st = document.createElement('td');
      st.append(span('wt-pill ' + (/qa|review/i.test(r.status) ? 'info' : /hold/i.test(r.status) ? 'warn' : ''), r.status));
      const who = document.createElement('td'); who.textContent = r.whose;
      if (r.status_since) {
        const ag = age(r.status_since);
        const s = span('wt-age' + (ag.hours >= 72 ? ' old' : ''), ag.text);
        s.dataset.tip = r.status + ' since ' + new Date(r.status_since).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        who.append(' ', s);
      }
      const next = document.createElement('td'); next.className = 'wt-hide-narrow';
      if (r.hold_url) {
        // One line in the table; the full comment shows on hover.
        const l = link(r.next, r.hold_url);
        if (l.classList) l.classList.add('wt-oneline');
        const wrap = document.createElement('span'); wrap.className = 'wt-hint-row';
        const q = span('wt-hint-icon', '?');
        q.dataset.tip = r.hold_full || r.next; q.setAttribute('role', 'button'); q.tabIndex = 0; q.setAttribute('aria-label', 'Full reason');
        wrap.append(l, q);
        next.append(wrap);
      } else next.textContent = r.next;
      tr.append(keyCell(r), st, who, next, prCell(r));
      return tr;
    }));
    $('sum-others').textContent = $('tile-others').textContent = String(rows.length);
  }

  const sourceOf = (id) => (S.workspace.connectors || []).find((c) => c.id === id) || { id, type: id, label: id };
  const sourceBadge = (id) => { const s = sourceOf(id); return s.type === 'github' ? 'GH' : s.label.slice(0, 2).toUpperCase(); };
  const sourceLink = (id) => 'Open in ' + sourceOf(id).label;
  function renderFilters() {
    const bar = $('feed-filters');
    const wanted = [{ id: 'all', label: 'All' }].concat((S.workspace.connectors || []).map((c) => ({ id: c.id, label: c.label })));
    if (bar.dataset.keys === wanted.map((w) => w.id).join(',')) return;
    bar.dataset.keys = wanted.map((w) => w.id).join(',');
    if (!wanted.some((w) => w.id === ui.feed)) ui.feed = 'all';
    bar.replaceChildren(...wanted.map((w) => {
      const b = span('wt-f', w.label); b.setAttribute('role', 'button'); b.tabIndex = 0; b.dataset.feedFilter = w.id;
      b.setAttribute('aria-pressed', String(ui.feed === w.id));
      onAct(b, () => { ui.feed = w.id; render(); });
      return b;
    }));
  }
  function renderFeed(feed) {
    renderFilters();
    const newCount = feed.filter(isNew).length;
    $('new-count').hidden = newCount === 0;
    $('new-count').textContent = newCount + ' new';
    const rows = feed.filter((r) => ui.feed === 'all' || r.source === ui.feed).slice(0, 120);
    $('feed-list').replaceChildren(...rows.map((r) => {
      const li = document.createElement('li');
      if (isNew(r)) li.classList.add('is-new');
      li.addEventListener('click', () => { if (isNew(r)) setMarks({ seen: [r.id] }); });
      const tone = /fail|changes/.test(r.kind) ? ' bad' : /approved|merged/.test(r.kind) ? ' ok' : '';
      const icon = span('wt-feed-icon' + (tone || (sourceOf(r.source).type === 'github' ? '' : ' jira')), sourceBadge(r.source));
      const body = document.createElement('div'); body.className = 'wt-feed-body';
      const top = document.createElement('div'); top.className = 'wt-feed-top';
      top.append(link(r.ref, r.url), span('wt-feed-kind' + (tone === ' bad' ? ' bad' : ''), r.kind));
      if (r.who) top.append(span('wt-feed-who', r.who));
      if (r.mention) top.append(span('wt-at-you', '@you'));
      top.append(span('wt-feed-when', ago(r.at)));
      const full = String(r.body || '');
      const written = /comment|approved|changes|commented|mentioned|review requested/.test(r.kind) && full.trim() !== '';
      const open = written && ui.open.has(r.id);
      if (written) {
        const t = button('wt-feed-toggle', '▾', () => { if (ui.open.has(r.id)) ui.open.delete(r.id); else ui.open.add(r.id); if (isNew(r)) setMarks({ seen: [r.id] }); else render(); }, open ? 'Collapse' : 'Expand');
        t.setAttribute('aria-expanded', String(open));
        top.append(t);
      }
      body.append(top);
      if (open) {
        li.classList.add('is-open');
        if (r.key && r.source === 'github') body.append(span('wt-feed-text', r.key));
        const f = document.createElement('div'); f.className = 'wt-feed-full'; f.textContent = full;
        const actions = document.createElement('div'); actions.className = 'wt-feed-actions';
        actions.append(button('wt-btn tonal', 'Open formatted', () => showModal(r)));
        const orig = link(sourceLink(r.source), r.url); if (orig.classList) orig.classList.add('wt-btn');
        actions.append(orig);
        body.append(f, actions);
      } else if (r.text) body.append(span('wt-feed-text', (r.source === 'github' && r.key ? r.key + ' · ' : '') + r.text));
      li.append(icon, body);
      return li;
    }));
  }

  function showModal(r) {
    ui.modal = r;
    $('modal-title').textContent = [r.ref, r.kind, r.who].filter(Boolean).join(' · ');
    const href = safeUrl(r.url);
    $('modal-link').hidden = !href;
    if (href) $('modal-link').href = href;
    $('modal-link').textContent = sourceLink(r.source);
    $('modal-body').replaceChildren(markdown(r.body || r.text || ''));
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  const closeModal = () => { $('modal').hidden = true; ui.modal = null; };

  function renderTabs() {
    const tabs = $('tabs');
    const list = S.workspaces || [];
    if (list.length < 2) { tabs.replaceChildren(); return; }
    tabs.replaceChildren(...list.map((w) => {
      const b = span('wt-seg-b', w.name); b.setAttribute('role', 'tab'); b.tabIndex = 0;
      b.setAttribute('aria-selected', String(w.id === S.workspace.id)); b.setAttribute('aria-pressed', String(w.id === S.workspace.id));
      if (w.open_moves) { const count = document.createElement('b'); count.textContent = String(w.open_moves); b.append(count); }
      onAct(b, () => { if (w.id === S.workspace.id) return; ui.ws = w.id; try { localStorage.setItem('wt-ws', w.id); } catch (e) { /* ignore */ } ui.open.clear(); lastVersion = -1; load(); });
      return b;
    }));
  }

  function render() {
    if (!S) return;
    renderTabs();
    const turn = S.turn;
    renderMove(turn);
    renderWaiting(turn);
    $('tile-done').textContent = String(turn.filter((r) => r.group === 'done').length);
    $('tile-failing').textContent = String(turn.filter((r) => r.pr_state === 'OPEN' && r.checks === 'failing').length);
    renderFeed(S.feed);
    renderTodos();
    renderStatus();
  }

  function renderStatus() {
    if (!S) return;
    const errs = S.errors || {};
    const msgs = (S.problems || []).slice();
    for (const source of Object.keys(errs)) msgs.push(source + ': ' + errs[source]);
    $('alert').hidden = msgs.length === 0;
    $('alert').textContent = msgs.join('  ·  ');
    $('status-text').textContent = 'Live · last check ' + (S.polled_at ? ago(S.polled_at) : '—') + ' · checks every minute';
  }

  // ---------- theme: the server derives the workspace scheme, the window sets the variables for the current colour scheme
  const DARK = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => {
    const root = document.documentElement.classList;
    if (root.contains('force-dark') || root.contains('force-light')) return root.contains('force-dark');
    return DARK.matches;
  };
  const themed = { theme: null, key: '', applied: [] };
  const paintTheme = () => {
    const elements = ['.wt', '.wt-shell'].map((selector) => document.querySelector(selector)).filter(Boolean);
    elements.forEach((element) => themed.applied.forEach((name) => element.style.removeProperty(name)));
    const variables = themed.theme ? themed.theme[isDark() ? 'dark' : 'light'] : null;
    themed.applied = variables ? Object.keys(variables) : [];
    elements.forEach((element) => themed.applied.forEach((name) => element.style.setProperty(name, variables[name])));
    if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.repaint();
  };
  const applyTheme = (theme) => {
    const key = theme ? JSON.stringify(theme) : '';
    if (key === themed.key) return;
    themed.key = key;
    themed.theme = theme && theme.light && theme.dark ? theme : null;
    paintTheme();
  };
  DARK.addEventListener('change', paintTheme);

  // ---------- data flow: load state, then reload on every server push
  let lastVersion = -1;
  function load() {
    return fetch('/api/state' + (ui.ws ? '?ws=' + encodeURIComponent(ui.ws) : '')).then((r) => r.json()).then((j) => {
      if (j.error) { ui.ws = ''; return load(); }
      S = j;
      ui.ws = S.workspace.id;
      applyTheme(S.workspace.theme);
      if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.show({ workspace: S.workspace.id });
      document.title = 'Whose Turn · ' + S.workspace.name;
      render();
    });
  }
  function connect() {
    const es = new EventSource('/api/stream');
    es.onopen = () => $('live').classList.remove('off');
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (S && d.ws !== S.workspace.id) return;
      if (d.version !== lastVersion) { lastVersion = d.version; load(); }
      else if (S) { S.polled_at = d.polled_at; renderStatus(); }
    };
    es.onerror = () => { $('live').classList.add('off'); $('status-text').textContent = 'Disconnected from the local server, retrying…'; };
  }

  // ---------- controls
  const onAct = (el, fn) => {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  };
  document.querySelectorAll('[data-move-view]').forEach((b) => onAct(b, () => {
    ui.move = b.dataset.moveView;
    document.querySelectorAll('[data-move-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  onAct($('mark-read'), () => {
    const ids = S.feed.map((r) => r.id);
    setMarks({ seen: ids, base: Date.now() });
  });
  onAct($('refresh'), () => { $('status-text').textContent = 'Checking now…'; post('/api/refresh'); });
  onAct($('modal-close'), closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  setInterval(renderStatus, 10000);

  // ---------- to-dos (stored by the server; Claude adds through POST /api/todos)
  const todoText = (todo, parent) => {
    const text = todo.text;
    const re = new RegExp(S.workspace.key_pattern, 'g'); let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
      parent.append(link(m[0], m[0] === todo.key ? todo.ticket_url : ''));
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
  };
  const todoAct = (body) => post('/api/todos', body).then((list) => { if (Array.isArray(list)) { S.todos = list; renderTodos(); } });
  function renderTodos() {
    const all = S.todos || [];
    const open = all.filter((t) => !t.done), done = all.filter((t) => t.done);
    $('todo-count').textContent = open.length ? String(open.length) : '';
    $('todo-done-count').textContent = String(done.length);
    const rows = ui.showDone ? open.concat(done) : open;
    $('todo-list').replaceChildren(...rows.map((t) => {
      const li = document.createElement('li'); if (t.done) li.classList.add('is-done');
      const box = button('wt-check' + (t.done ? ' on' : ''), '', () => todoAct({ action: t.done ? 'undo' : 'done', id: t.id }), t.done ? 'Mark not done' : 'Mark done');
      box.setAttribute('role', 'checkbox'); box.setAttribute('aria-checked', String(!!t.done));
      const text = document.createElement('span'); text.className = 'wt-todo-text'; todoText(t, text);
      const meta = span('wt-todo-meta', (t.by && t.by !== 'you' ? t.by + ' · ' : '') + ago(t.created));
      const del = button('wt-todo-del', '×', () => todoAct({ action: 'delete', id: t.id }), 'Delete to-do');
      li.append(box, text, meta, del);
      return li;
    }));
    if (!rows.length) $('todo-list').replaceChildren(span('wt-empty', ui.showDone ? 'Nothing here yet.' : 'Nothing to do. Add one above, or ask Claude.'));
  }
  $('todo-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const text = e.target.value.trim(); if (!text) return;
    e.target.value = '';
    todoAct({ action: 'add', text });
  });
  onAct($('todo-show-done'), () => { ui.showDone = !ui.showDone; $('todo-show-done').setAttribute('aria-pressed', String(ui.showDone)); renderTodos(); });

  // Tooltips: instant on hover, also on click or keyboard focus; one delegate covers rows drawn later.
  if (window.tippy) {
    tippy.delegate(document.body, {
      target: '[data-tip]',
      content: (el) => el.dataset.tip,
      trigger: 'mouseenter focus click',
      delay: [0, 80],
      duration: [120, 80],
      interactive: true,
      maxWidth: 440,
      placement: 'top',
      theme: 'wt',
      appendTo: () => document.body,
    });
  }
  load().then(connect);
})();

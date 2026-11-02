// Whose Turn window: renders the rows the local server computed and re-renders on every server-sent update.
(() => {
  let S = null;
  const ui = { feed: 'all', feedView: 'ticket', feedQuery: '', openGroups: new Set(), move: 'open', open: new Set(), modal: null, showDone: false, ws: '' };
  try { ui.feedView = localStorage.getItem('wt-feed-view') || 'ticket'; } catch (e) { /* storage may be blocked */ }
  try { ui.ws = new URLSearchParams(location.search).get('ws') || localStorage.getItem('wt-ws') || ''; } catch (e) { /* storage may be blocked */ }
  const $ = (id) => document.getElementById(id);

  // ---------- small DOM helpers (data is untrusted: text only, https links only)
  const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
  const element = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const span = (cls, text) => element('span', cls, text);
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

  // ---------- the AI button: one small sparkle everywhere; it copies the item with its context as text for any assistant
  const AI_HINT = 'Copy for AI: this with its context as text, ready to paste into Claude or any other assistant';
  const sparkle = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM5 15l.9 2.6 2.6.9-2.6.9L5 22l-.9-2.6-2.6-.9 2.6-.9L5 15zm14-2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z');
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  };
  const copyText = (b, query) => fetch('/api/handoff?' + new URLSearchParams(query)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => navigator.clipboard.writeText(text))
    .then(() => { b.classList.add('sent'); b.dataset.tip = 'Copied'; setTimeout(() => { b.classList.remove('sent'); b.dataset.tip = AI_HINT; }, 1600); })
    .catch(() => { b.classList.add('failed'); b.dataset.tip = 'Could not copy'; setTimeout(() => { b.classList.remove('failed'); b.dataset.tip = AI_HINT; }, 1600); });
  const aiButton = (query, extraClass) => {
    const b = button('wt-ai' + (extraClass ? ' ' + extraClass : ''), '', () => copyText(b, query), 'Copy for AI');
    b.dataset.tip = AI_HINT;
    b.append(sparkle());
    return b;
  };
  const copyButton = (kind, ref) => aiButton({ ws: S.workspace.id, kind, ref });

  // ---------- marks (kept by the server on disk)
  const marks = () => S.marks;
  const isHandled = (r) => { const m = marks().handled[r.row_id]; return !!m && String(r.activity_at || '') <= m; };
  const isNew = (r) => new Date(r.at).getTime() > (marks().base || 0) && !marks().seen.includes(r.id);
  const postWs = (url, body) => post(url, { ws: S.workspace.id, ...body });
  const setMarks = (body) => postWs('/api/marks', body).then((m) => { S.marks = m; render(); });

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
    const you = turn.filter((r) => r.group === 'you').sort((a, b) => Number(b.started) - Number(a.started) || String(a.updated).localeCompare(String(b.updated)));
    const showHandled = ui.move === 'handled';
    const rows = showHandled ? you.filter(isHandled) : you.slice().sort((a, b) => Number(isHandled(a)) - Number(isHandled(b)));
    const openCount = you.filter((r) => !isHandled(r)).length;
    $('move-open').textContent = String(openCount);
    $('move-handled').textContent = String(you.length - openCount);
    ['sum-mine', 'tile-mine'].forEach((id) => { $(id).textContent = String(openCount); });
    $('move-empty').hidden = rows.length !== 0;
    $('move-empty').textContent = showHandled ? 'Nothing marked as handled.' : 'Nothing is waiting on you.';
    $('move-body').replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      const handled = isHandled(r);
      if (handled) tr.classList.add('is-handled');
      const next = document.createElement('td');
      const line = document.createElement('span'); line.className = 'wt-hint-row';
      line.append(span('wt-next', r.next));
      const ag = age(r.activity_at);
      if (ag.text) { const s = span('wt-age' + (ag.old ? ' old' : ''), ag.text); s.dataset.tip = 'Waiting since ' + new Date(r.activity_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); line.append(s); }
      if (r.why) { const q = span('wt-hint-icon', '?'); q.dataset.tip = r.why; q.setAttribute('role', 'button'); q.tabIndex = 0; q.setAttribute('aria-label', 'Why this is your move'); line.append(q); }
      if (handled) { const chip = span('wt-handled-chip', 'handled'); chip.dataset.tip = 'Marked ' + ago(marks().handled[r.row_id]) + '. Comes back in 7 days if it is still open, or sooner when something new happens.'; line.append(chip); }
      next.append(line);
      const comment = document.createElement('td'); comment.className = 'wt-hide-narrow';
      if (r.comment) { comment.className += ' wt-quote'; comment.append(link(r.comment, r.comment_url)); }
      const act = document.createElement('td'); act.className = 'wt-actions';
      act.append(copyButton('row', r.row_id), button('wt-mark' + (handled ? ' undo' : ''), handled ? 'Undo' : 'Handled',
        () => setMarks({ handled: { [r.row_id]: handled ? null : new Date().toISOString() } }),
        (handled ? 'Move back to open: ' : 'Mark as handled: ') + r.key));
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
      const act = document.createElement('td'); act.className = 'wt-actions'; act.append(copyButton('row', r.row_id));
      tr.append(keyCell(r), st, who, next, prCell(r), act);
      return tr;
    }));
    $('sum-others').textContent = $('tile-others').textContent = String(rows.length);
  }

  const sourceOf = (id) => (S.workspace.connectors || []).find((c) => c.id === id) || { id, type: id, label: id };
  const sourceBadge = (id) => { const s = sourceOf(id); return s.type === 'github' ? 'GH' : s.label.slice(0, 2).toUpperCase(); };
  const sourceLink = (id) => 'Open in ' + sourceOf(id).label;
  function renderFilters() {
    const bar = $('feed-filters');
    const connectors = S.workspace.connectors || [];
    const wanted = connectors.length > 1 ? [{ id: 'all', label: 'All' }].concat(connectors.map((c) => ({ id: c.id, label: c.label }))) : [];
    bar.hidden = wanted.length === 0;
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
  const matchesQuery = (r) => {
    const words = ui.feedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [r.ref, r.key, r.kind, r.who, r.text, r.body].join(' ').toLowerCase();
    return words.every((word) => hay.includes(word));
  };
  const groupOf = (r) => r.key || r.ref || r.id;
  const feedGroups = (rows) => {
    const groups = new Map();
    for (const r of rows) {
      const id = groupOf(r);
      if (!groups.has(id)) groups.set(id, { id, items: [], newest: r.at, unread: 0 });
      const g = groups.get(id);
      g.items.push(r);
      if (r.at > g.newest) g.newest = r.at;
      if (isNew(r)) g.unread += 1;
    }
    return [...groups.values()].sort((a, b) => String(b.newest).localeCompare(String(a.newest)));
  };
  const groupHead = (g) => {
    const row = (S.turn || []).find((r) => r.key === g.id);
    const head = document.createElement('div'); head.className = 'wt-feed-group-head';
    const caret = span('wt-feed-group-caret', '›');
    const body = document.createElement('div');
    const keyLine = document.createElement('div'); keyLine.className = 'wt-feed-group-key';
    const k = link(g.id, row ? row.ticket_url : g.items[0].url); if (k.classList) k.classList.add('wt-key');
    keyLine.append(k);
    if (row) keyLine.append(span('wt-feed-group-sum', row.summary));
    const meta = document.createElement('div'); meta.className = 'wt-feed-group-meta';
    const kinds = [...new Set(g.items.map((r) => r.kind))].slice(0, 3).join(' · ');
    meta.append(span('wt-feed-group-count' + (g.unread ? ' new' : ''), g.unread ? g.unread + ' new' : String(g.items.length)), span('', kinds), span('wt-feed-when', ago(g.newest)));
    if (row && row.group === 'you') meta.append(span('wt-at-you', 'your move'));
    body.append(keyLine, meta);
    const copy = aiButton({ ws: S.workspace.id, kind: 'thread', ref: g.id });
    copy.classList.add('wt-feed-group-copy');
    copy.addEventListener('click', (e) => e.stopPropagation());
    head.append(caret, body, copy);
    head.addEventListener('click', () => { if (ui.openGroups.has(g.id)) ui.openGroups.delete(g.id); else ui.openGroups.add(g.id); render(); });
    return head;
  };
  function renderFeed(feed) {
    renderFilters();
    const newCount = feed.filter(isNew).length;
    $('new-count').hidden = newCount === 0;
    $('new-count').textContent = newCount + ' new';
    const bySource = feed.filter((r) => ui.feed === 'all' || r.source === ui.feed);
    const rows = bySource.filter(matchesQuery).slice(0, 200);
    $('feed-search-count').textContent = ui.feedQuery ? rows.length + ' of ' + bySource.length : '';
    document.querySelectorAll('[data-feed-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.feedView === ui.feedView)));
    if (ui.feedView === 'ticket') {
      $('feed-list').replaceChildren(...feedGroups(rows).map((g) => {
        const li = document.createElement('li'); li.className = 'wt-feed-group';
        if (g.unread) li.classList.add('is-new');
        const open = ui.openGroups.has(g.id) || Boolean(ui.feedQuery);
        if (open) li.classList.add('is-open');
        li.append(groupHead(g));
        if (open) { const children = document.createElement('ul'); children.className = 'wt-feed-children'; children.append(...g.items.map(feedItem)); li.append(children); }
        return li;
      }));
      return;
    }
    $('feed-list').replaceChildren(...rows.map(feedItem));
  }
  function feedItem(r) {
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
      const right = span('wt-feed-right', '');
      right.append(span('wt-feed-when', ago(r.at)));
      const full = String(r.body || '');
      const written = /comment|approved|changes|commented|mentioned|review requested/.test(r.kind) && full.trim() !== '';
      const open = written && ui.open.has(r.id);
      if (written) {
        const t = button('wt-feed-toggle', '', () => { if (ui.open.has(r.id)) ui.open.delete(r.id); else ui.open.add(r.id); if (isNew(r)) setMarks({ seen: [r.id] }); else render(); }, open ? 'Collapse' : 'Expand');
        t.setAttribute('aria-expanded', String(open));
        right.append(t);
      }
      top.append(right);
      body.append(top);
      if (open) {
        li.classList.add('is-open');
        if (r.key && r.source === 'github') body.append(span('wt-feed-text', r.key));
        const f = document.createElement('div'); f.className = 'wt-feed-full'; f.textContent = full;
        const actions = document.createElement('div'); actions.className = 'wt-feed-actions';
        actions.append(button('wt-btn tonal', 'Open formatted', () => showModal(r)), copyButton('feed', r.id));
        const orig = link(sourceLink(r.source), r.url); if (orig.classList) orig.classList.add('wt-btn');
        actions.append(orig);
        body.append(f, actions);
      } else if (r.text) body.append(span('wt-feed-text', (r.source === 'github' && r.key ? r.key + ' · ' : '') + r.text));
      li.append(icon, body);
      return li;
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

  // ---------- the rail: one generated icon per workspace, seeded by its id, tinted by its palette
  const SVG = 'http://www.w3.org/2000/svg';
  const svgNode = (name, attributes) => { const node = document.createElementNS(SVG, name); for (const key in attributes) node.setAttribute(key, String(attributes[key])); return node; };
  const hashOf = (text) => { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };
  const seededRandom = (seed) => window.whoseTurnBackdrop.seeded(seed);
  const workspaceColours = (w) => {
    const scheme = w.theme ? w.theme[isDark() ? 'dark' : 'light'] : null;
    return { fill: scheme ? scheme['--md-primary-container'] : 'var(--md-primary-container)', ink: scheme ? scheme['--md-on-primary-container'] : 'var(--md-on-primary-container)', dot: scheme ? scheme['--md-primary'] : 'var(--md-primary)' };
  };
  const workspaceIcon = (w) => {
    const colours = workspaceColours(w);
    const random = seededRandom(hashOf(w.id));
    const svg = svgNode('svg', { viewBox: '0 0 36 36', class: 'wt-rail-icon', 'aria-hidden': 'true' });
    svg.append(svgNode('rect', { x: 0, y: 0, width: 36, height: 36, rx: 10, fill: colours.fill }));
    const dots = 3 + Math.floor(random() * 3);
    for (let i = 0; i < dots; i += 1) {
      const angle = random() * Math.PI * 2, distance = 9 + random() * 7;
      svg.append(svgNode('circle', { cx: (18 + Math.cos(angle) * distance).toFixed(1), cy: (18 + Math.sin(angle) * distance).toFixed(1), r: (1.6 + random() * 2.2).toFixed(1), fill: colours.dot, opacity: (0.35 + random() * 0.4).toFixed(2) }));
    }
    const letter = svgNode('text', { x: 18, y: 24, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 600, 'font-family': 'Roboto, Inter, system-ui, sans-serif', fill: colours.ink });
    letter.textContent = (w.name || w.id).trim().charAt(0).toUpperCase();
    svg.append(letter);
    return svg;
  };
  const gearIcon = () => {
    const svg = svgNode('svg', { viewBox: '0 0 24 24', class: 'wt-rail-gear', 'aria-hidden': 'true' });
    svg.append(svgNode('path', { d: 'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5H9l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h6l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z', fill: 'currentColor' }));
    return svg;
  };
  const railItem = (href, label, icon, onClick) => {
    const item = element('a', 'wt-rail-item'); item.href = href; item.setAttribute('aria-label', label);
    item.append(icon, span('wt-rail-label', label));
    item.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    return item;
  };
  const switchWorkspace = (id) => {
    if (id === S.workspace.id) return;
    ui.ws = id;
    try { localStorage.setItem('wt-ws', id); } catch (e) { /* storage may be blocked */ }
    ui.open.clear(); lastVersion = -1; load();
  };
  // Dragging a workspace icon reorders the config: the same raw entries, only in the new order, so secrets and caches stay.
  let railKey = '';
  let dragged = '';
  const reorderWorkspaces = (ids) => fetch('/api/config').then((r) => r.json()).then((config) => {
    const position = (w) => { const at = ids.indexOf(w.id); return at < 0 ? ids.length : at; };
    return post('/api/config', { workspaces: [...config.workspaces].sort((a, b) => position(a) - position(b)), secrets: [] });
  }).then((j) => {
    if (j && j.error) { $('status-text').textContent = j.error.message || 'The order was not saved'; return; }
    railKey = ''; lastVersion = -1; load();
  });
  const dropBefore = (e, item) => e.clientY - item.getBoundingClientRect().top < item.offsetHeight / 2;
  const clearDropMarks = (rail) => rail.querySelectorAll('.is-dragging, [data-drop]').forEach((n) => { n.classList.remove('is-dragging'); delete n.dataset.drop; });
  const draggable = (item, w, rail) => {
    item.draggable = true;
    item.addEventListener('dragstart', (e) => { dragged = w.id; item.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); });
    item.addEventListener('dragend', () => { dragged = ''; clearDropMarks(rail); });
    item.addEventListener('dragover', (e) => {
      if (!dragged || dragged === w.id) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      item.dataset.drop = dropBefore(e, item) ? 'before' : 'after';
    });
    item.addEventListener('dragleave', () => { delete item.dataset.drop; });
    item.addEventListener('drop', (e) => {
      if (!dragged || dragged === w.id) return;
      e.preventDefault();
      const ids = S.workspaces.map((x) => x.id).filter((id) => id !== dragged);
      ids.splice(ids.indexOf(w.id) + (dropBefore(e, item) ? 0 : 1), 0, dragged);
      clearDropMarks(rail);
      reorderWorkspaces(ids);
    });
  };
  function renderRail() {
    const rail = $('rail');
    const key = JSON.stringify([S.workspaces.map((w) => [w.id, w.name, w.open_moves, w.theme && w.theme.light['--md-primary']]), S.workspace.id, isDark()]);
    if (key === railKey) return;
    railKey = key;
    const items = S.workspaces.map((w) => {
      const item = railItem('?ws=' + encodeURIComponent(w.id), w.name, workspaceIcon(w), () => switchWorkspace(w.id));
      item.setAttribute('aria-selected', String(w.id === S.workspace.id));
      if (w.open_moves) item.append(span('wt-rail-badge', String(w.open_moves)));
      draggable(item, w, rail);
      return item;
    });
    rail.replaceChildren(...items, span('wt-rail-spacer', ''), railItem('#settings', 'Settings', gearIcon(), openSettings));
  }

  // ---------- feedback: a bug, an improvement or an idea about the monitor goes to its own Linear backlog
  const feedbackProblems = (list) => { $('feedback-problems').hidden = !list.length; $('feedback-problems').textContent = list.join('  ·  '); };
  // The reporter usually has no Linear account, so the sheet lists what this machine filed with the state the server read for it.
  const renderReports = (list) => {
    const box = $('feedback-reports');
    box.replaceChildren();
    box.hidden = !list.length;
    if (!list.length) return;
    box.append(element('h4', '', 'Your reports'));
    for (const r of list) {
      const row = element('div', 'wt-feedback-report');
      row.append(link(r.id, r.report_url || r.url), span('wt-feedback-report-title', r.title), span('wt-pill ' + (r.done ? 'ok' : 'info'), r.state || 'filed'), span('wt-feed-when', ago(r.changed_at || r.filed_at)));
      box.append(row);
    }
  };
  const loadFeedback = () => fetch('/api/feedback').then((r) => r.json()).then((j) => {
    $('feedback-project').textContent = j.configured ? 'Linear · ' + j.project : 'not configured: set feedback in the config';
    renderReports(j.reports || []);
  });
  function openFeedback() {
    loadFeedback().then(() => {
      feedbackProblems([]); $('feedback-done').hidden = true;
      $('feedback').hidden = false; $('feedback-text').focus();
    });
  }
  const closeFeedback = () => { $('feedback').hidden = true; };
  const sendFeedback = () => {
    const text = $('feedback-text').value.trim();
    if (!text) { feedbackProblems(['Write at least one line.']); return; }
    const payload = { text, from: 'the window', ws: S.workspace.id, kind_ref: { kind: 'workspace', ref: S.workspace.id } };
    $('feedback-send').textContent = 'Composing…';
    post('/api/feedback', payload).then((j) => {
      $('feedback-send').textContent = 'Send';
      if (j.error) { feedbackProblems(problemsOf(j.error)); return; }
      $('feedback-done').hidden = false; $('feedback-done').replaceChildren(document.createTextNode('Filed as '), link(j.issue.identifier, j.report_url), document.createTextNode(' · ' + j.issue.title + ' · '), link('Linear', j.issue.url));
      $('feedback-text').value = '';
      renderReports(j.reports || []);
    }).catch(() => { $('feedback-send').textContent = 'Send'; feedbackProblems(['The monitor did not answer.']); });
  };

  // ---------- settings: the form is drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads
  const HEX = /^#[0-9a-f]{6}$/i;
  const settings = { list: [], selected: 0, catalogue: [], fields: {}, secrets: new Map() };
  const bind = (target, key) => (value) => { if (value && value.length) target[key] = value; else delete target[key]; };
  const field = (spec, input) => {
    const wrap = element('div', 'wt-field');
    wrap.append(element('label', '', spec.label + (spec.required ? ' *' : '')), input);
    if (spec.hint) wrap.append(element('small', '', spec.hint));
    return wrap;
  };
  const textInput = (value, onChange, placeholder) => {
    const input = element('input', 'wt-input'); input.type = 'text'; input.value = value || ''; if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  };
  const listInput = (value, onChange) => textInput((value || []).join(', '), (text) => onChange(text.split(',').map((part) => part.trim()).filter(Boolean)));
  const colourInput = (value, onChange) => {
    const wrap = element('div', 'wt-inline');
    const picker = element('input', 'wt-input'); picker.type = 'color'; picker.value = HEX.test(value || '') ? value : '#888888';
    const text = textInput(value, (next) => { onChange(next); if (HEX.test(next)) picker.value = next; }, '#rrggbb');
    picker.addEventListener('input', () => { text.value = picker.value; onChange(picker.value); });
    wrap.append(picker, text, button('wt-btn', 'None', () => { text.value = ''; onChange(''); }));
    return wrap;
  };
  const secretInput = (entry, spec) => {
    const input = element('input', 'wt-input'); input.type = 'password'; input.placeholder = 'paste to replace'; input.autocomplete = 'off';
    input.addEventListener('input', () => settings.secrets.set(entry, Object.assign(settings.secrets.get(entry) || {}, { [spec.key]: input.value })));
    return input;
  };
  const inputFor = (target, spec, entry) => {
    if (spec.secret) return secretInput(entry, spec);
    if (spec.colour) return colourInput(target[spec.key], bind(target, spec.key));
    if (spec.list) return listInput(target[spec.key], bind(target, spec.key));
    return textInput(target[spec.key], bind(target, spec.key));
  };
  const fieldsFor = (target, specs, entry) => specs.map((spec) => field(spec, inputFor(target, spec, entry)));
  const current = () => settings.list[settings.selected];
  const renderSettingsList = () => {
    const items = settings.list.map((w, index) => {
      const li = element('li', '', w.name || w.id || 'Workspace ' + (index + 1));
      li.setAttribute('aria-selected', String(index === settings.selected));
      li.addEventListener('click', () => { settings.selected = index; renderSettings(); });
      return li;
    });
    const add = element('li', 'add', '+ Add workspace');
    add.addEventListener('click', () => { settings.list.push(normaliseForForm({ id: 'new-' + (settings.list.length + 1), name: 'New workspace' })); settings.selected = settings.list.length - 1; renderSettings(); });
    $('settings-list').replaceChildren(...items, add);
  };
  const connectorCard = (w, entry, index) => {
    const spec = settings.catalogue.find((c) => c.type === entry.type) || { type: entry.type, label: entry.type, fields: [] };
    const card = element('div', 'wt-connector');
    const head = element('div', 'wt-connector-head');
    head.append(element('strong', '', spec.label), button('wt-btn danger', 'Remove', () => { w.connectors.splice(index, 1); settings.secrets.delete(entry); renderSettings(); }));
    card.append(head, field({ label: 'Entry id', hint: 'only needed when one type appears twice' }, textInput(entry.id, bind(entry, 'id'), spec.type)),
      field({ label: 'Label', hint: 'shown in the feed filter' }, textInput(entry.label, bind(entry, 'label'), spec.label)),
      ...fieldsFor(entry, spec.fields, entry));
    return card;
  };
  const renderSettingsForm = () => {
    const form = $('settings-form');
    const w = current();
    if (!w) { form.replaceChildren(element('p', 'wt-empty', 'No workspaces yet. Add one on the left.')); return; }
    const onIdOrName = (key) => (value) => { bind(w, key)(value); renderSettingsList(); };
    const workspaceFields = settings.fields.workspace.map((spec) => field(spec, ['id', 'name'].includes(spec.key) ? textInput(w[spec.key], onIdOrName(spec.key)) : inputFor(w, spec)));
    const adder = element('div', 'wt-settings-actions');
    settings.catalogue.forEach((c) => adder.append(button('wt-btn', '+ ' + c.label, () => { w.connectors.push({ type: c.type }); renderSettings(); })));
    const actions = element('div', 'wt-settings-actions');
    actions.append(button('wt-btn danger', 'Delete workspace', () => { settings.list.splice(settings.selected, 1); settings.selected = Math.max(0, settings.selected - 1); renderSettings(); }));
    form.replaceChildren(
      element('h4', '', 'Workspace'), ...workspaceFields,
      element('h4', '', 'Theme'), ...fieldsFor(w.theme, settings.fields.theme),
      element('h4', '', 'Connectors'), ...w.connectors.map((entry, index) => connectorCard(w, entry, index)), adder,
      element('h4', '', 'Rules'), ...fieldsFor(w.rules, settings.fields.rules), ...fieldsFor(w.rules.statuses, settings.fields.statuses),
      actions,
    );
  };
  const normaliseForForm = (w) => {
    const copy = structuredClone(w);
    copy.connectors = Array.isArray(copy.connectors) ? copy.connectors : Object.keys(copy.connectors || {}).map((type) => Object.assign({ type }, copy.connectors[type]));
    copy.rules = copy.rules || {}; copy.rules.statuses = copy.rules.statuses || {}; copy.theme = copy.theme || {};
    return copy;
  };
  const forSaving = (w) => {
    const copy = structuredClone(w);
    if (!Object.keys(copy.theme).length) delete copy.theme;
    if (!Object.keys(copy.rules.statuses).length) delete copy.rules.statuses;
    if (!Object.keys(copy.rules).length) delete copy.rules;
    return copy;
  };
  const pendingSecrets = () => {
    const out = [];
    settings.list.forEach((w) => w.connectors.forEach((entry) => {
      const typed = settings.secrets.get(entry) || {};
      Object.keys(typed).forEach((key) => { if (typed[key]) out.push({ ws: w.id, connector: entry.id || entry.type, key, value: typed[key] }); });
    }));
    return out;
  };
  const showProblems = (list) => { $('settings-problems').hidden = !list.length; $('settings-problems').textContent = list.join('  ·  '); };
  const problemsOf = (error) => {
    const violations = (error.details || []).find((d) => d['@type'] === 'BadRequest');
    const info = (error.details || []).find((d) => d['@type'] === 'ErrorInfo');
    return violations ? violations.field_violations.map((v) => v.description) : [info && info.metadata && info.metadata.detail ? info.metadata.detail : error.message];
  };
  function renderSettings() { renderSettingsList(); renderSettingsForm(); }
  function openSettings() {
    fetch('/api/config').then((r) => r.json()).then((j) => {
      settings.list = (j.workspaces || []).map(normaliseForForm);
      settings.catalogue = j.connectors || []; settings.fields = j.fields; settings.secrets = new Map();
      settings.selected = Math.max(0, settings.list.findIndex((w) => w.id === S.workspace.id));
      $('settings-file').textContent = j.config_file || '';
      showProblems(j.problems || []);
      renderSettings();
      $('settings').hidden = false;
      $('settings-close').focus();
    });
  }
  const closeSettings = () => { $('settings').hidden = true; };
  const saveSettings = () => post('/api/config', { workspaces: settings.list.map(forSaving), secrets: pendingSecrets() }).then((j) => {
    if (j.error) { showProblems(problemsOf(j.error)); return; }
    closeSettings();
    lastVersion = -1; load();
  });

  function renderLinks() {
    $('links').replaceChildren(...(S.workspace.links || []).map((l) => { const a = link(l.label, l.url); if (a.classList) a.title = l.url; return a; }));
  }

  function render() {
    if (!S) return;
    renderRail();
    renderLinks();
    const turn = S.turn;
    renderMove(turn);
    renderWaiting(turn);
    $('tile-done').textContent = String(turn.filter((r) => r.group === 'done').length);
    const failing = turn.filter((r) => r.pr_state === 'OPEN' && r.checks === 'failing').length;
    $('tile-failing').textContent = String(failing);
    $('sum-failing').textContent = String(failing);
    $('sum-failing-wrap').hidden = failing === 0;
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
    const elements = ['.wt', '.wt-shell', '.wt-rail'].map((selector) => document.querySelector(selector)).filter(Boolean);
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
  DARK.addEventListener('change', () => { paintTheme(); if (S) renderRail(); });

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

  // ---------- collapsible islands: the chevron in each head, the choice kept in the browser
  const collapsed = new Set();
  try { JSON.parse(localStorage.getItem('wt-collapsed') || '[]').forEach((id) => collapsed.add(id)); } catch (e) { /* storage may be blocked */ }
  const applyCollapsed = () => document.querySelectorAll('.wt-island[id]').forEach((island) => island.classList.toggle('is-collapsed', collapsed.has(island.id)));
  document.querySelectorAll('.wt-island[id]').forEach((island) => {
    const toggle = button('wt-collapse', '▾', () => {
      if (collapsed.has(island.id)) collapsed.delete(island.id); else collapsed.add(island.id);
      try { localStorage.setItem('wt-collapsed', JSON.stringify([...collapsed])); } catch (e) { /* ignore */ }
      applyCollapsed();
    }, 'Collapse or expand ' + island.id);
    toggle.dataset.tip = 'Fold this panel; it stays folded until you open it again';
    const head = island.querySelector('.wt-island-head p.wt-note') || island;
    head.append(toggle);
  });
  applyCollapsed();

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
  document.querySelectorAll('[data-feed-view]').forEach((b) => onAct(b, () => {
    ui.feedView = b.dataset.feedView;
    try { localStorage.setItem('wt-feed-view', ui.feedView); } catch (e) { /* ignore */ }
    render();
  }));
  $('feed-search').addEventListener('input', (e) => { ui.feedQuery = e.target.value.trim(); render(); });
  onAct($('mark-read'), () => {
    const ids = S.feed.map((r) => r.id);
    setMarks({ seen: ids, base: Date.now() });
  });
  onAct($('refresh'), () => {
    $('status-text').textContent = 'Checking now…';
    post('/api/refresh');
    if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.show({ workspace: S.workspace.id, seed: Math.floor(Math.random() * 4294967296) });
  });
  $('give-workspace').replaceWith(Object.assign(aiButton({ ws: '', kind: 'workspace' }, 'wt-ai-big'), { id: 'give-workspace' }));
  $('give-workspace').addEventListener('click', (e) => { e.stopPropagation(); copyText($('give-workspace'), { ws: S.workspace.id, kind: 'workspace' }); }, true);
  $('copy-all').replaceWith(Object.assign(aiButton({ all: '1' }), { id: 'copy-all' }));
  onAct($('modal-close'), closeModal);
  onAct($('feedback-send'), sendFeedback);
  onAct($('feedback-close'), closeFeedback);
  $('feedback').addEventListener('click', (e) => { if (e.target === $('feedback')) closeFeedback(); });
  onAct($('report'), openFeedback);
  $('feedback-text').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendFeedback(); } });
  onAct($('settings-save'), saveSettings);
  onAct($('settings-close'), closeSettings);
  $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) closeSettings(); });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSettings(); closeFeedback(); } });
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
  const todoAct = (body) => postWs('/api/todos', body).then((list) => { if (Array.isArray(list)) { S.todos = list; renderTodos(); } });
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

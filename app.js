// Whose Turn window: renders the local server's state and re-renders on every server-sent update.
(() => {
  const DAY = 86400000;
  let S = null;
  let ME_JIRA = '';  // your Jira display name and GitHub login, as the server reports them in /api/state
  let ME_GH = '';
  const cfg = () => (S && S.config) || { repo: '', jira_base: '', jira_email: '', keychain_service: 'whose-turn-jira', key_pattern: '\\b[A-Z][A-Z0-9_]+-\\d+\\b', rules: {} };
  const jiraUrl = (key) => (cfg().jira_base ? cfg().jira_base + '/browse/' + key : '');
  const prRef = (repo, number) => (repo === cfg().repo ? '#' : repo.split('/')[1] + '#') + number;
  const ui = { feed: 'all', move: 'open', open: new Set(), modal: null, showDone: false };
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

  // ---------- whose turn (same rules as the dashboard)
  const askRe = /\?|\b(please|pls|can you|could you|would you|let me know|need you|need your|thoughts|recommend|advise|confirm|clarify)\b/i;

  // Why a ticket is on hold: the comment by whoever moved it to On Hold, closest to that moment;
  // otherwise the last comment before it; otherwise the newest comment that says "on hold".
  const firstSentence = (body) => {
    const line = body.split('\n').map((l) => l.trim()).find((l) => l && !/^\[image\]$/.test(l)) || '';
    let text = line.replace(/^@[\w .'-]+?\s+[—–-]\s+/, '').replace(/^.*?on hold\s*[:—–-]\s*/i, '').trim() || line;
    text = text.split(/(?<=[.!?])\s/)[0].replace(/\*\*|`/g, '');
    return text.length > 140 ? text.slice(0, 139) + '…' : text;
  };
  const holdReason = (comments, ticket) => {
    const mine = comments.filter((x) => x.key === ticket.key);
    const h = ticket.hold;
    let c = null;
    if (h && h.since) {
      const t0 = new Date(h.since).getTime();
      const byMover = mine.filter((x) => x.author === h.by).sort((a, b) => Math.abs(new Date(a.at) - t0) - Math.abs(new Date(b.at) - t0))[0];
      if (byMover && Math.abs(new Date(byMover.at) - t0) < 2 * DAY) c = byMover;
      if (!c) c = mine.filter((x) => new Date(x.at).getTime() <= t0 + 10 * 60000).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    }
    if (!c) c = mine.filter((x) => /on hold/i.test(x.body)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    return c ? { text: firstSentence(c.body), full: c.author + ' · ' + new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '\n\n' + c.body.trim().slice(0, 1500), url: c.url, by: c.author } : null;
  };
  const recent = (list) => list.filter((x) => Date.now() - new Date(x.at) < 14 * DAY);

  function turnRows(jira, prs, comments, ghAsks) {
    const byKey = {};
    for (const p of prs) if (p.key) (byKey[p.key] = byKey[p.key] || []).push(p);
    const pick = (list) => (list || []).slice().sort((a, b) => (a.state === 'OPEN' ? -1 : 0) - (b.state === 'OPEN' ? -1 : 0) || String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const asks = {};
    for (const c of recent(comments).sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      // Your comment answers only the people it @-mentions; everyone else stays waiting.
      if (c.author === ME_JIRA) { if (asks[c.key]) asks[c.key] = asks[c.key].filter((x) => !c.body.includes('@' + x.c.author)); continue; }
      if (/automation/i.test(c.author) || !c.body.includes('@' + ME_JIRA)) continue;
      (asks[c.key] = asks[c.key] || []).push({ c, question: askRe.test(c.body.replace(/https?:\/\/\S+/g, '')) });
    }
    const rows = jira.map((t) => {
      const pr = pick(byKey[t.key]);
      const open = pr && pr.state === 'OPEN';
      const done = t.status_category === 'done';
      const release = pr && pr.base.startsWith(cfg().rules.release_branch_prefix || 'release/');
      let whose = t.assignee, next = 'Not yours now', group = done ? 'done' : 'others', holdUrl = '', holdFull = '', why = '';
      // A backlog ticket that is not on you is no longer your business: leave it out entirely.
      if (!done && /backlog/i.test(t.status) && t.assignee !== ME_JIRA) group = 'gone';
      const mine = (n, w) => { whose = 'You'; next = n; group = 'you'; why = w; };
      if (group === 'gone') { /* skip */ }
      else if (open && pr.checks === 'failing') mine('Look at the failing checks', 'PR #' + pr.pr + ' has failing checks.');
      else if (open && pr.review === 'CHANGES_REQUESTED') mine('Address the requested changes', 'A reviewer requested changes on PR #' + pr.pr + '.');
      else if (open && pr.unanswered) mine('Read and answer the new comment', pr.last_comment_by + ' commented on PR #' + pr.pr + ' after your last reply there.');
      else if (/passed/i.test(t.status)) mine('Merge with a merge commit, log time, move to Done', 'Ticket status is ' + t.status + ': QA passed, the PR can go in.');
      else if (done && open) mine('Ticket is Done but the PR is open: merge it', 'The ticket is ' + t.status + ' while PR #' + pr.pr + ' is still open.');
      else if (!done && pr && pr.state === 'MERGED' && !open && t.assignee === ME_JIRA) mine('Log time and move to Done', 'PR #' + pr.pr + ' is merged but the ticket is still ' + t.status + ' and on you.');
      else if (/code review/i.test(t.status) && open && pr.review === 'APPROVED') mine(release ? cfg().rules.approved_release_next : cfg().rules.approved_next, 'PR #' + pr.pr + ' into ' + pr.base + ' is approved; the ticket is still in ' + t.status + '.');
      else if (/code review/i.test(t.status)) { whose = 'Reviewer'; next = 'Code review'; }
      else if (/ready for qa|in qa/i.test(t.status)) next = 'QA';
      else if (/on hold/i.test(t.status)) { const h = holdReason(comments, t); next = h ? 'On hold: ' + h.text : 'On hold'; holdUrl = h ? h.url : ''; holdFull = h ? h.full : ''; }
      else if (!done && t.assignee === ME_JIRA) mine('Pick it up', 'Assigned to you, status ' + t.status + ', no PR step pending.');
      return {
        key: t.key, row_id: t.key, summary: t.summary, status: t.status, whose, next, group, done, jira_url: t.url,
        pr: pr ? '#' + pr.pr : '', pr_url: pr ? pr.url : '', pr_state: pr ? pr.state : '', checks: pr ? pr.checks : '',
        comment: open && pr.last_comment_by ? pr.last_comment_by + ': ' + pr.last_comment : '', comment_url: open ? pr.last_comment_url : '',
        updated: t.updated, hold_url: holdUrl, hold_full: holdFull, why, status_since: t.status_change ? t.status_change.since : '', activity_at: [new Date(t.updated).toISOString(), pr ? pr.updated_at : ''].filter(Boolean).sort().pop(),
      };
    });
    for (const key in byKey) {
      if (jira.some((t) => t.key === key)) continue;
      const pr = pick(byKey[key]);
      if (pr.state !== 'OPEN') continue;
      rows.push({ key, row_id: key, summary: pr.title, status: 'Not in your Jira list', whose: 'You', next: 'Check the ticket for this open PR', group: 'you', why: 'PR #' + pr.pr + ' is open, but its ticket is not among your Jira tickets.',
        jira_url: jiraUrl(key), pr: '#' + pr.pr, pr_url: pr.url, pr_state: pr.state, checks: pr.checks,
        comment: pr.last_comment_by ? pr.last_comment_by + ': ' + pr.last_comment : '', comment_url: pr.last_comment_url, updated: pr.updated_at, activity_at: pr.updated_at });
    }
    // GitHub: review requests and mentions on PRs and issues that are not yours.
    for (const g of ghAsks || []) {
      const ref = prRef(g.repo, g.number);
      const review = g.kind === 'review requested';
      rows.push({ key: g.key || ref, row_id: g.id, summary: g.title, status: review ? 'Review requested' : 'Mentioned', whose: 'You', group: 'you',
        next: review ? 'Review PR ' + ref : 'Answer ' + g.who + ' on ' + ref,
        why: review ? g.who + ' asked you to review ' + ref + ' and you are still in its reviewer list.' : g.who + ' @-mentioned you on ' + ref + '; you have not commented there since.',
        jira_url: g.key ? jiraUrl(g.key) : g.url, pr: ref, pr_url: g.url, pr_state: '', checks: '',
        comment: review ? '' : g.who + ': ' + g.text, comment_url: g.url, updated: g.at, activity_at: g.at });
    }
    for (const t of rows.slice()) {
      if (t.done || !asks[t.key]) continue;
      for (const { c, question } of asks[t.key]) {
        rows.push({ key: t.key, row_id: t.key + ':' + c.id, summary: t.summary, status: t.status, whose: 'You', group: 'you',
          next: question ? 'Answer ' + c.author + ' in Jira' : 'Read ' + c.author + '’s comment in Jira',
          why: c.author + (question ? ' asked you a question' : ' mentioned you') + ' on ' + new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '; you have not @-mentioned them in a reply since.',
          jira_url: t.jira_url, pr: '', pr_url: '', pr_state: '', checks: '',
          comment: c.author + ': ' + c.body.replace(/\s+/g, ' ').slice(0, 160), comment_url: c.url, updated: c.at, activity_at: c.at });
      }
    }
    return rows;
  }

  function feedRows(activity, events, jira, comments, ghAsks) {
    const rows = [];
    for (const g of ghAsks || []) rows.push({ id: g.id, at: g.at, source: 'github', ref: prRef(g.repo, g.number), key: g.key, kind: g.kind, who: g.who, text: g.text, body: g.body, url: g.url });
    for (const a of activity) rows.push({ id: 'gh:' + a.url + ':' + a.at, at: a.at, source: 'github', ref: a.pr, key: a.key, kind: a.kind, who: a.who, text: a.text, body: a.body || a.text, url: a.url });
    for (const c of recent(comments)) {
      const who = c.author === ME_JIRA ? 'you' : c.author;
      const first = c.body.replace(/\s+/g, ' ').trim();
      rows.push({ id: 'jc:' + c.id, at: c.at, source: 'jira', ref: c.key, key: c.key, kind: 'comment', who,
        mention: c.author !== ME_JIRA && !/automation/i.test(c.author) && c.body.includes('@' + ME_JIRA),
        text: first.length > 140 ? first.slice(0, 139) + '…' : first, body: c.body, url: c.url });
    }
    for (const e of events) rows.push({ id: 'jira:' + e.key + ':' + e.at + ':' + e.kind, at: e.at, source: 'jira', ref: e.key, key: e.key, kind: e.kind, who: '', text: e.text, body: '', url: e.url });
    const near = (key, t) => events.concat(recent(comments)).some((e) => e.key === key && Math.abs(new Date(e.at) - new Date(t)) < 5 * 60000);
    for (const t of jira) {
      if (near(t.key, t.updated)) continue;
      rows.push({ id: 'jira:' + t.key + ':' + t.updated, at: new Date(t.updated).toISOString(), source: 'jira', ref: t.key, key: t.key, kind: 'updated', who: '', text: t.status + ' · ' + t.assignee, body: '', url: t.url });
    }
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

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
    const k = link(r.key, r.jira_url); if (k.classList) k.classList.add('wt-key');
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

  function renderFeed(feed) {
    const newCount = feed.filter(isNew).length;
    $('new-count').hidden = newCount === 0;
    $('new-count').textContent = newCount + ' new';
    const rows = feed.filter((r) => ui.feed === 'all' || r.source === ui.feed).slice(0, 120);
    $('feed-list').replaceChildren(...rows.map((r) => {
      const li = document.createElement('li');
      if (isNew(r)) li.classList.add('is-new');
      li.addEventListener('click', () => { if (isNew(r)) setMarks({ seen: [r.id] }); });
      const tone = /fail|changes/.test(r.kind) ? ' bad' : /approved|merged/.test(r.kind) ? ' ok' : '';
      const icon = span('wt-feed-icon' + (tone || (r.source === 'jira' ? ' jira' : '')), r.source === 'github' ? 'GH' : 'J');
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
        const orig = link(r.source === 'github' ? 'Open on GitHub' : 'Open in Jira', r.url); if (orig.classList) orig.classList.add('wt-btn');
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
    $('modal-link').textContent = r.source === 'jira' ? 'Open in Jira' : 'Open on GitHub';
    $('modal-body').replaceChildren(markdown(r.body || r.text || ''));
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  const closeModal = () => { $('modal').hidden = true; ui.modal = null; };

  function notifyNew(turn) {
    const open = turn.filter((r) => r.group === 'you' && !isHandled(r));
    const fresh = open.filter((r) => !marks().notified.includes(r.row_id));
    if (!fresh.length) return;
    if (marks().notified.length === 0) { post('/api/marks', { notified: open.map((r) => r.row_id) }).then((m) => { S.marks = m; }); return; }
    const first = fresh[0];
    post('/api/notify', { title: fresh.length === 1 ? 'Your move: ' + first.key : fresh.length + ' new items are your move', body: fresh.length === 1 ? first.next : fresh.map((r) => r.key + ' — ' + r.next).join('; ') });
    post('/api/marks', { notified: fresh.map((r) => r.row_id) }).then((m) => { S.marks = m; });
  }

  function render() {
    if (!S) return;
    const turn = turnRows(S.jira, S.prs, S.jira_comments, S.gh_asks);
    renderMove(turn);
    renderWaiting(turn);
    $('tile-done').textContent = String(turn.filter((r) => r.group === 'done').length);
    $('tile-failing').textContent = String(turn.filter((r) => r.pr_state === 'OPEN' && r.checks === 'failing').length);
    renderFeed(feedRows(S.activity, S.events, S.jira, S.jira_comments, S.gh_asks));
    renderTodos();
    renderStatus();
    return turn;
  }

  function renderStatus() {
    if (!S) return;
    const errs = S.errors || {};
    const msgs = [];
    if (errs.config) msgs.push(errs.config);
    if (errs.jira && /token/i.test(errs.jira)) msgs.push('Jira is not connected: add your API token to Keychain with  security add-generic-password -a ' + cfg().jira_email + ' -s ' + cfg().keychain_service + ' -w  then press Refresh now.');
    else if (errs.jira) msgs.push('Jira: ' + errs.jira);
    if (errs.github) msgs.push('GitHub: ' + errs.github);
    $('alert').hidden = msgs.length === 0;
    $('alert').textContent = msgs.join('  ·  ');
    $('status-text').textContent = 'Live · last check ' + (S.polled_at ? ago(S.polled_at) : '—') + ' · checks every minute';
  }

  // ---------- data flow: load state, then reload on every server push
  let lastVersion = -1;
  function load() {
    return fetch('/api/state').then((r) => r.json()).then((j) => {
      S = j;
      ME_JIRA = (S.me && S.me.jira) || '';
      ME_GH = (S.me && S.me.github) || '';
      if (!S.marks.base) { S.marks.base = Date.now() - 3 * DAY; post('/api/marks', { base: S.marks.base }); }
      render();
    });
  }
  function connect() {
    const es = new EventSource('/api/stream');
    es.onopen = () => $('live').classList.remove('off');
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
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
  document.querySelectorAll('[data-feed-filter]').forEach((b) => onAct(b, () => {
    ui.feed = b.dataset.feedFilter;
    document.querySelectorAll('[data-feed-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  document.querySelectorAll('[data-move-view]').forEach((b) => onAct(b, () => {
    ui.move = b.dataset.moveView;
    document.querySelectorAll('[data-move-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  onAct($('mark-read'), () => {
    const ids = feedRows(S.activity, S.events, S.jira, S.jira_comments, S.gh_asks).map((r) => r.id);
    setMarks({ seen: ids, base: Date.now() });
  });
  onAct($('refresh'), () => { $('status-text').textContent = 'Checking now…'; post('/api/refresh'); });
  onAct($('modal-close'), closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  setInterval(renderStatus, 10000);

  // ---------- to-dos (stored by the server; Claude adds through POST /api/todos)
  const todoText = (text, parent) => {
    const re = new RegExp(cfg().key_pattern, 'g'); let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
      parent.append(link(m[0], jiraUrl(m[0])));
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
      const text = document.createElement('span'); text.className = 'wt-todo-text'; todoText(t.text, text);
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

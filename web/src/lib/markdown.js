// Markdown to DOM without ever inserting HTML from data: text nodes, a few inline marks, https links only.
import { safeUrl } from './api.js';

const link = (text, url) => {
  const href = safeUrl(url);
  if (!href) return document.createTextNode(text || '');
  const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a;
};
const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };

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

export const markdownFragment = (src) => {
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

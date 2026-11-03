// Markdown to DOM without ever inserting HTML from data: text nodes, a few inline marks, https links only.
import { safeUrl } from './api.ts';

const link = (text: string, url: string) => {
  const href = safeUrl(url);
  if (!href) {
    return document.createTextNode(text || '');
  }
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.textContent = text;
  return anchor;
};

const textElement = (tag: string, text: string, className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
};

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>()]+)|(@[A-Za-z0-9-]+(?: [A-Z][a-z]+)?)|((?<![A-Za-z0-9])\*[^*\s][^*]*\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9]))/g;

const inlineNode = (match: RegExpExecArray) => {
  const token = match[0];
  if (match[1]) {
    return textElement('code', token.slice(1, -1));
  }
  if (match[2]) {
    return textElement('strong', token.slice(2, -2));
  }
  if (match[3]) {
    const split = token.indexOf('](');
    return link(token.slice(1, split), token.slice(split + 2, -1));
  }
  if (match[4]) {
    return link(token, token);
  }
  if (match[5]) {
    return textElement('span', token, 'wt-mention');
  }
  return textElement('em', token.slice(1, -1));
};

const inline = (text: string, parent: Node & ParentNode) => {
  const pattern = new RegExp(INLINE);
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      parent.append(document.createTextNode(text.slice(last, match.index)));
    }
    parent.append(inlineNode(match));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parent.append(document.createTextNode(text.slice(last)));
  }
};

export const markdownFragment = (source: string) => {
  const out = document.createDocumentFragment();
  const lines = String(source || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  let paragraph: string[] = [];
  let list: HTMLElement | null = null;
  const flush = () => {
    if (paragraph.length) {
      const element = document.createElement('p');
      paragraph.forEach((line, index) => {
        if (index) {
          element.append(document.createElement('br'));
        }
        inline(line, element);
      });
      out.append(element);
      paragraph = [];
    }
    list = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (index++; index < lines.length && !/^\s*```/.test(lines[index]); index++) {
        code.push(lines[index]);
      }
      const pre = document.createElement('pre');
      pre.append(textElement('code', code.join('\n')));
      out.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const element = document.createElement(heading[1].length <= 2 ? 'h4' : 'h5');
      inline(heading[2], element);
      out.append(element);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      const element = document.createElement('blockquote');
      inline(quote[1], element);
      out.append(element);
      continue;
    }
    const listItem = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      if (paragraph.length) {
        const keep: HTMLElement | null = list;
        flush();
        list = keep;
      }
      const ordered = /\d/.test(listItem[1]);
      const current: HTMLElement | null = list;
      const target: HTMLElement =
        current && current.tagName === (ordered ? 'OL' : 'UL')
          ? current
          : document.createElement(ordered ? 'ol' : 'ul');
      if (target !== current) {
        out.append(target);
      }
      list = target;
      const item = document.createElement('li');
      inline(listItem[2], item);
      target.append(item);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    list = null;
    paragraph.push(line);
  }
  flush();
  return out;
};

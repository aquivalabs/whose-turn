// Markdown to a token tree: a string in, plain objects out, no DOM; unsafe links become text here. Mark lengths are bounded so hostile input stays linear.
import { safeUrl } from './api.ts';

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code' | 'strong' | 'em' | 'mention'; text: string }
  | { type: 'link'; text: string; href: string };

type ListToken = { type: 'list'; ordered: boolean; items: InlineToken[][] };

export type BlockToken =
  | { type: 'paragraph'; lines: InlineToken[][] }
  | { type: 'heading'; level: 4 | 5; inline: InlineToken[] }
  | { type: 'quote'; inline: InlineToken[] }
  | ListToken
  | { type: 'fence'; text: string };

const INLINE =
  /(`[^`]{1,500}`)|(\*\*[^*]{1,500}\*\*)|(\[[^\]]{1,300}\]\(https?:\/\/[^)\s]{1,2000}\))|(https?:\/\/[^\s<>()]{1,2000})|(@[A-Za-z0-9-]+(?: [A-Z][a-z]+)?)|((?<![A-Za-z0-9])\*[^*\s][^*]{0,500}\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_[^_\s][^_]{0,500}_(?![A-Za-z0-9]))/g;

const linkToken = (text: string, url: string): InlineToken => {
  const href = safeUrl(url);
  return href ? { type: 'link', text, href } : { type: 'text', text };
};

const inlineToken = (match: RegExpExecArray): InlineToken => {
  const token = match[0];
  if (match[1]) {
    return { type: 'code', text: token.slice(1, -1) };
  }
  if (match[2]) {
    return { type: 'strong', text: token.slice(2, -2) };
  }
  if (match[3]) {
    const split = token.indexOf('](');
    return linkToken(token.slice(1, split), token.slice(split + 2, -1));
  }
  if (match[4]) {
    return linkToken(token, token);
  }
  if (match[5]) {
    return { type: 'mention', text: token };
  }
  return { type: 'em', text: token.slice(1, -1) };
};

/** Splits one line into text and marks; a mark's text is never parsed again, so marks do not nest. */
export const inlineTokens = (text: string): InlineToken[] => {
  const pattern = new RegExp(INLINE);
  const tokens: InlineToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      tokens.push({ type: 'text', text: text.slice(last, match.index) });
    }
    tokens.push(inlineToken(match));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ type: 'text', text: text.slice(last) });
  }
  return tokens;
};

/** Splits a comment body into blocks; an unterminated fence runs to the end of the input. */
export const markdownTokens = (source: string): BlockToken[] => {
  const lines = String(source || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  const out: BlockToken[] = [];
  let paragraph: string[] = [];
  let list: ListToken | null = null;
  const flush = () => {
    if (paragraph.length) {
      out.push({ type: 'paragraph', lines: paragraph.map(inlineTokens) });
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
      out.push({ type: 'fence', text: code.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      out.push({
        type: 'heading',
        level: heading[1].length <= 2 ? 4 : 5,
        inline: inlineTokens(heading[2]),
      });
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      out.push({ type: 'quote', inline: inlineTokens(quote[1]) });
      continue;
    }
    const listItem = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      const keep: ListToken | null = list;
      if (paragraph.length) {
        flush();
        list = keep;
      }
      const ordered = /\d/.test(listItem[1]);
      const current: ListToken | null = list;
      const target: ListToken =
        current && current.ordered === ordered ? current : { type: 'list', ordered, items: [] };
      if (target !== current) {
        out.push(target);
      }
      list = target;
      target.items.push(inlineTokens(listItem[2]));
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

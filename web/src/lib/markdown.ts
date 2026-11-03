// Markdown to DOM without ever inserting HTML from data: the token tree becomes text nodes and elements. See docs/adr/0003-markdown-rendering.md
import { markdownTokens, type BlockToken, type InlineToken } from './markdown-tokens.ts';

const textElement = (tag: string, text: string, className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
};

const inlineNode = (token: InlineToken) => {
  if (token.type === 'text') {
    return document.createTextNode(token.text);
  }
  if (token.type === 'link') {
    const anchor = textElement('a', token.text);
    anchor.setAttribute('href', token.href);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener');
    return anchor;
  }
  if (token.type === 'mention') {
    return textElement('span', token.text, 'markdown-view__mention');
  }
  return textElement(token.type, token.text);
};

const inline = (tokens: InlineToken[], parent: Node & ParentNode) => {
  tokens.forEach((token) => parent.append(inlineNode(token)));
};

const inlineElement = (tag: string, tokens: InlineToken[]) => {
  const element = document.createElement(tag);
  inline(tokens, element);
  return element;
};

const blockNode = (block: BlockToken) => {
  if (block.type === 'fence') {
    const pre = document.createElement('pre');
    pre.append(textElement('code', block.text));
    return pre;
  }
  if (block.type === 'heading') {
    return inlineElement(`h${block.level}`, block.inline);
  }
  if (block.type === 'quote') {
    return inlineElement('blockquote', block.inline);
  }
  if (block.type === 'list') {
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    block.items.forEach((item) => list.append(inlineElement('li', item)));
    return list;
  }
  const paragraph = document.createElement('p');
  block.lines.forEach((line, index) => {
    if (index) {
      paragraph.append(document.createElement('br'));
    }
    inline(line, paragraph);
  });
  return paragraph;
};

export const markdownFragment = (source: string) => {
  const out = document.createDocumentFragment();
  markdownTokens(source).forEach((block) => out.append(blockNode(block)));
  return out;
};

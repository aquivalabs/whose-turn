/** Parses CHANGELOG.md (Keep a Changelog) into versions, newest first as written, and reads it next to server.mjs. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION_HEADING = /^##\s+\[([^\]]+)\](?:\s+-\s+(\S.*?))?\s*$/;
const SECTION_HEADING = /^###\s+(\S.*?)\s*$/;
const ISSUE_ID = String.raw`[A-Z][A-Z0-9]+-\d+`;
const TRAILING_IDS = new RegExp(String.raw`(?<=[.!?])\s+${ISSUE_ID}(?:,\s*${ISSUE_ID})*\.?$`);
const BRACKETED_IDS = new RegExp(String.raw`\s*\((?:${ISSUE_ID})(?:,\s*${ISSUE_ID})*\)`, 'g');

/** An entry as a user reads it: the internal tracker ids at its end or in brackets are dropped. */
export const withoutIds = (entry) => entry.replace(BRACKETED_IDS, '').replace(TRAILING_IDS, '').trim();

/** [{version, date, sections: [{kind, items: [markdown]}]}]; a malformed `##` heading ends the version above it and its body is dropped. */
export const parseChangelog = (text) => {
  const versions = [];
  let version = null;
  let section = null;
  let item = null;
  const closeItem = () => {
    if (item !== null && section) {
      section.items.push(withoutIds(item.trim()));
    }
    item = null;
  };
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('## ') || line === '##') {
      closeItem();
      const heading = line.match(VERSION_HEADING);
      version = heading ? { version: heading[1], date: heading[2] || '', sections: [] } : null;
      section = null;
      if (version) {
        versions.push(version);
      }
      continue;
    }
    if (!version) {
      continue;
    }
    const kind = line.match(SECTION_HEADING);
    if (kind) {
      closeItem();
      section = { kind: kind[1], items: [] };
      version.sections.push(section);
      continue;
    }
    if (!section) {
      continue;
    }
    if (line.startsWith('- ')) {
      closeItem();
      item = line.slice(2);
    } else if (item !== null && /^\s+\S/.test(line)) {
      item += '\n' + line.trim();
    } else {
      closeItem();
    }
  }
  closeItem();
  versions.forEach((entry) => {
    entry.sections = entry.sections.filter((one) => one.items.length);
  });
  return versions;
};

/** The reply of GET /api/changelog, or null when the file cannot be read. */
export const loadChangelog = (appDir, current) => {
  try {
    return { current, versions: parseChangelog(readFileSync(join(appDir, 'CHANGELOG.md'), 'utf8')) };
  } catch {
    return null;
  }
};

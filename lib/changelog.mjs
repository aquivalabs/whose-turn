/** Parses CHANGELOG.md (Keep a Changelog) into versions, newest first as written, and reads it next to server.mjs. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION_HEADING = /^##\s+\[([^\]]+)\](?:\s+-\s+(\S.*?))?\s*$/;
const SECTION_HEADING = /^###\s+(\S.*?)\s*$/;

/** [{version, date, sections: [{kind, items: [markdown]}]}]; a malformed `##` heading ends the version above it and its body is dropped. */
export const parseChangelog = (text) => {
  const versions = [];
  let version = null;
  let section = null;
  let item = null;
  const closeItem = () => {
    if (item !== null && section) {
      section.items.push(item.trim());
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

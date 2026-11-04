interface ChangelogSection {
  kind: string;
  items: string[];
}
interface ChangelogVersion {
  version: string;
  date: string;
  sections: ChangelogSection[];
}
export interface Changelog {
  current: string;
  versions: ChangelogVersion[];
}

const UNRELEASED = 'Unreleased';

/** The released versions after the last one the user opened, up to the running one, newest first; an unknown last-seen version counts only the running one. */
export const unseenVersions = (
  versions: ChangelogVersion[],
  seen: string,
  current: string,
): ChangelogVersion[] => {
  const released = versions.filter((entry) => entry.version !== UNRELEASED);
  const currentAt = released.findIndex((entry) => entry.version === current);
  if (!seen || currentAt < 0 || seen === current) {
    return [];
  }
  const seenAt = released.findIndex((entry) => entry.version === seen);
  return released.slice(currentAt, seenAt < 0 ? currentAt + 1 : seenAt);
};

/** One version's sections as Markdown for the shared renderer: a heading per kind, a list of items. */
export const versionMarkdown = (entry: ChangelogVersion): string =>
  entry.sections
    .map((section) => `### ${section.kind}\n${section.items.map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');

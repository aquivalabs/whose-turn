#!/usr/bin/env node
/**
 * The docs domain's deterministic pre-push check: six jobs over docs.config.json and git.
 * Prints one line per finding and exits 1 if any exists.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FROZEN_LAYER_KEY = 'frozen';
const SECTION_HEADINGS = ['Boundary', 'Shape', 'Update trigger', 'Exclusions', 'Acceptance criteria'];

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
const HEADING_PATTERN = /^#{1,6}\s+(.*)\s*$/gm;
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const NUMBER_PREFIX_PATTERN = /^(\d{4})-/;

export class DocsCheckError extends Error {}

const pyRepr = (value) => {
  const text = String(value);
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n');
  return quote + (quote === "'" ? escaped.replaceAll("'", "\\'") : escaped) + quote;
};

const finding = (job, path, message) => ({ job, path, message });
export const formatFinding = ({ job, path, message }) => `[${job}] ${path}: ${message}`;

const isFile = (path) => existsSync(path) && statSync(path).isFile();
const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory();
const realOrResolved = (path) => {
  const absolute = resolve(path);
  if (existsSync(absolute)) {
    return realpathSync(absolute);
  }
  return join(realOrResolved(dirname(absolute)), basename(absolute));
};
const escapes = (inside) => inside === '..' || inside.startsWith(`..${sep}`);
const toPosix = (path) => path.split(sep).join('/');

const readJson = (path, label) => {
  if (!isFile(path)) {
    throw new DocsCheckError(`docs-check: missing ${label} at ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new DocsCheckError(`docs-check: cannot read/parse ${path} (${error.message})`);
  }
};

export const loadConfig = (repoRoot) => readJson(join(repoRoot, '.claude', 'docs.config.json'), 'config');

const readSchemaVersion = (repoRoot) => {
  const data = readJson(join(repoRoot, '.claude', 'docs.config.schema.json'), 'schema');
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? data.version : null;
};

const normalizeLayers = (config) => {
  const normalized = {};
  for (const [name, value] of Object.entries(config.layers || {})) {
    if (typeof value === 'string') {
      normalized[name] = { root: value, index: null, requiredFields: [], numbered: false };
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      normalized[name] = {
        root: value.root,
        index: value.index,
        requiredFields: value.requiredFields || [],
        numbered: Boolean(value.numbered),
      };
    } else {
      throw new DocsCheckError(`docs-check: layer ${pyRepr(name)} has an invalid value`);
    }
  }
  return normalized;
};

const nonFrozen = (layers) => Object.entries(layers).filter(([name]) => name !== FROZEN_LAYER_KEY).map(([, layer]) => layer);

const rootComponents = (root) => root.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
const isPrefix = (shorter, longer) => shorter.length <= longer.length && shorter.every((part, index) => longer[index] === part);

export const containedPath = (repoRoot, value) => {
  const candidate = realOrResolved(resolve(repoRoot, value));
  const inside = relative(realOrResolved(repoRoot), candidate);
  if (escapes(inside)) {
    return null;
  }
  return resolve(repoRoot, value);
};

const relativeTo = (path, repoRoot) => {
  const inside = relative(realOrResolved(repoRoot), realOrResolved(path));
  return escapes(inside) ? String(path) : toPosix(inside);
};

const listMarkdownFiles = (rootPath) => {
  if (!isDirectory(rootPath)) {
    return [];
  }
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md') && isFile(full)) {
        found.push(full);
      }
    }
  };
  walk(rootPath);
  return found.sort();
};

const extractLinks = (text) => [...text.matchAll(LINK_PATTERN)].map((match) => match[1].trim());
const extractHeadings = (text) => [...text.matchAll(HEADING_PATTERN)].map((match) => match[1].trim());

export const slugifyHeading = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const resolveRelativeLink = (linkingFile, target) => {
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? null : target.slice(hashIndex + 1);
  if (!pathPart || SCHEME_PATTERN.test(pathPart)) {
    return { resolved: null, fragment };
  }
  return { resolved: resolve(dirname(linkingFile), pathPart), fragment };
};

const findDeadLinks = (markdownFile) => {
  const dead = [];
  for (const target of extractLinks(readFileSync(markdownFile, 'utf8'))) {
    const { resolved, fragment } = resolveRelativeLink(markdownFile, target);
    if (resolved === null) {
      continue;
    }
    if (!existsSync(resolved)) {
      dead.push(target);
      continue;
    }
    if (fragment && isFile(resolved) && resolved.toLowerCase().endsWith('.md')) {
      const slugs = new Set(extractHeadings(readFileSync(resolved, 'utf8')).map(slugifyHeading));
      if (!slugs.has(slugifyHeading(fragment))) {
        dead.push(target);
      }
    }
  }
  return dead;
};

export const configSanity = (config, repoRoot) => {
  const findings = [];
  const layers = normalizeLayers(config);
  const names = Object.keys(layers);
  for (let first = 0; first < names.length; first += 1) {
    for (let second = first + 1; second < names.length; second += 1) {
      const rootA = layers[names[first]].root;
      const rootB = layers[names[second]].root;
      const partsA = rootComponents(rootA);
      const partsB = rootComponents(rootB);
      if (isPrefix(partsA, partsB) || isPrefix(partsB, partsA)) {
        findings.push(finding('config-sanity', `${rootA} , ${rootB}`, `layer roots collide: ${pyRepr(rootA)} and ${pyRepr(rootB)}`));
      }
    }
  }

  const schemaVersion = readSchemaVersion(repoRoot);
  const seededAgainst = config.schemaVersion ?? 'absent';
  if (String(seededAgainst) !== String(schemaVersion)) {
    findings.push(
      finding(
        'config-sanity',
        relativeTo(join(repoRoot, '.claude', 'docs.config.json'), repoRoot),
        `config schema version mismatch: config seeded against ${seededAgainst}, schema is now ${schemaVersion}`,
      ),
    );
  }

  if (!(config.mechanisms || []).length) {
    if (config.acknowledgedEmptyMechanisms === true) {
      console.log('config-sanity: acknowledgedEmptyMechanisms is set — empty mechanism list accepted.');
    } else {
      findings.push(finding('config-sanity', 'mechanisms', 'no mechanisms declared'));
    }
  }
  return findings;
};

const isReadme = (file) => basename(file).toLowerCase() === 'readme.md';

const checkIndexAgreement = (rootPath, indexName, repoRoot) => {
  const indexPath = join(rootPath, indexName);
  if (!isFile(indexPath)) {
    return [finding('structure', relativeTo(indexPath, repoRoot), 'declared index file is missing')];
  }
  const linked = new Set();
  for (const target of extractLinks(readFileSync(indexPath, 'utf8'))) {
    const { resolved } = resolveRelativeLink(indexPath, target);
    if (resolved !== null) {
      linked.add(resolved);
    }
  }
  return listMarkdownFiles(rootPath)
    .filter((file) => resolve(file) !== resolve(indexPath) && !isReadme(file) && !linked.has(resolve(file)))
    .map((file) => finding('structure', relativeTo(file, repoRoot), `file not linked from index ${relativeTo(indexPath, repoRoot)}`));
};

const layerFiles = (rootPath, indexName) =>
  listMarkdownFiles(rootPath).filter((file) => !isReadme(file) && !(indexName && basename(file) === indexName));

const checkRequiredFields = (rootPath, indexName, requiredFields, repoRoot) => {
  const findings = [];
  if (!requiredFields.length) {
    return findings;
  }
  for (const file of layerFiles(rootPath, indexName)) {
    const headings = new Set(extractHeadings(readFileSync(file, 'utf8')).map((heading) => heading.toLowerCase()));
    for (const field of requiredFields) {
      if (!headings.has(field.toLowerCase())) {
        findings.push(finding('structure', relativeTo(file, repoRoot), `missing required field heading: ${field}`));
      }
    }
  }
  return findings;
};

const checkNumbered = (rootPath, indexName, repoRoot) => {
  const findings = [];
  const indexPath = indexName ? join(rootPath, indexName) : null;
  const indexText = indexPath && isFile(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  for (const file of layerFiles(rootPath, indexName)) {
    const match = NUMBER_PREFIX_PATTERN.exec(basename(file));
    if (!match) {
      findings.push(finding('structure', relativeTo(file, repoRoot), 'numbered layer file name does not start with NNNN-'));
      continue;
    }
    const matchingLine = indexText.split(/\r\n|\r|\n/).find((line) => line.includes(basename(file)));
    if (matchingLine === undefined || !matchingLine.includes(match[1])) {
      findings.push(
        finding('structure', relativeTo(file, repoRoot), `index row for this numbered file does not carry the matching number ${match[1]}`),
      );
    }
  }
  return findings;
};

const checkInternalLinks = (rootPath, repoRoot) =>
  listMarkdownFiles(rootPath).flatMap((file) =>
    findDeadLinks(file).map((target) => finding('structure', relativeTo(file, repoRoot), `dead relative link to ${target}`)),
  );

export const structure = (config, repoRoot) => {
  const findings = [];
  for (const layer of nonFrozen(normalizeLayers(config))) {
    const rootPath = containedPath(repoRoot, layer.root);
    if (rootPath === null) {
      findings.push(finding('structure', layer.root, 'declared layer root resolves outside the repository'));
      continue;
    }
    if (!isDirectory(rootPath)) {
      findings.push(finding('structure', layer.root, 'declared layer root does not exist'));
      continue;
    }
    if (layer.index) {
      findings.push(...checkIndexAgreement(rootPath, layer.index, repoRoot));
      if (layer.numbered) {
        findings.push(...checkNumbered(rootPath, layer.index, repoRoot));
      }
    }
    findings.push(...checkRequiredFields(rootPath, layer.index, layer.requiredFields, repoRoot));
    findings.push(...checkInternalLinks(rootPath, repoRoot));
  }
  return findings;
};

// Python fnmatch semantics: `*` and `**` cross `/`, `?` is one character, `[!x]` negates.
const fnmatchPattern = (pattern) => {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      source += '[\\s\\S]*';
    } else if (char === '?') {
      source += '[\\s\\S]';
    } else if (char === '[') {
      const close = pattern.indexOf(']', index + (pattern[index + 1] === '!' || pattern[index + 1] === ']' ? 2 : 1));
      if (close === -1) {
        source += '\\[';
      } else {
        const body = pattern.slice(index + 1, close).replaceAll('\\', '\\\\');
        source += body.startsWith('!') ? `[^${body.slice(1)}]` : `[${body}]`;
        index = close;
      }
    } else {
      source += char.replace(/[.+^${}()|\\/]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
};

const mechanismMatches = (patterns, changedPaths) => {
  const includes = patterns.filter((pattern) => !pattern.startsWith('!')).map(fnmatchPattern);
  const excludes = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => fnmatchPattern(pattern.slice(1)));
  return changedPaths.some((path) => includes.some((regex) => regex.test(path)) && !excludes.some((regex) => regex.test(path)));
};

export const pairedDocs = (config, repoRoot, changedPaths) => {
  const findings = [];
  const changed = new Set(changedPaths);
  for (const mechanism of config.mechanisms || []) {
    const mechanismId = mechanism.id ?? '<unnamed>';
    if (!mechanismMatches(mechanism.paths || [], changedPaths)) {
      continue;
    }
    if (mechanism.exempt) {
      console.log(`paired-docs: ${mechanismId} exempt — ${mechanism.exempt}`);
      continue;
    }
    if (!changed.has(mechanism.doc)) {
      findings.push(
        finding('paired-docs', mechanism.doc || mechanismId, `mechanism ${mechanismId} changed without updating its doc ${mechanism.doc}`),
      );
    }
  }
  return findings;
};

/** Repository paths a mechanism page names in the first cell of a table row, such as `| \`lib/rules.mjs\` | Role |`. */
const namedFiles = (markdown) =>
  [...markdown.matchAll(/^\|\s*`([^`\s<>]+\/[^`\s<>]+\.[a-z]+)`\s*\|/gm)].map(([, path]) => path);

export const declaredDocsResolve = (config, repoRoot) => {
  const findings = [];
  for (const mechanism of config.mechanisms || []) {
    const mechanismId = mechanism.id ?? '<unnamed>';
    const docPath = mechanism.doc ? containedPath(repoRoot, mechanism.doc) : null;
    if (docPath === null || !isFile(docPath)) {
      findings.push(
        finding(
          'declared-docs-resolve',
          mechanism.doc || mechanismId,
          `mechanism ${mechanismId} declares a doc that does not exist: ${mechanism.doc ?? 'None'}`,
        ),
      );
      continue;
    }
    for (const named of namedFiles(readFileSync(docPath, 'utf8'))) {
      const namedPath = containedPath(repoRoot, named);
      if (namedPath === null || !isFile(namedPath)) {
        findings.push(finding('declared-docs-resolve', mechanism.doc, `mechanism ${mechanismId} names a file that does not exist: ${named}`));
      }
    }
  }
  return findings;
};

export const sectionReadmes = (config, repoRoot) => {
  const findings = [];
  for (const layer of nonFrozen(normalizeLayers(config))) {
    const rootPath = containedPath(repoRoot, layer.root);
    if (rootPath === null) {
      findings.push(finding('section-readmes', layer.root, 'declared layer root resolves outside the repository'));
      continue;
    }
    const readmePath = join(rootPath, 'README.md');
    if (!isFile(readmePath)) {
      findings.push(finding('section-readmes', relativeTo(readmePath, repoRoot), 'layer root has no README.md'));
      continue;
    }
    const headings = new Set(extractHeadings(readFileSync(readmePath, 'utf8')).map((heading) => heading.toLowerCase()));
    for (const question of SECTION_HEADINGS) {
      if (!headings.has(question.toLowerCase())) {
        findings.push(finding('section-readmes', relativeTo(readmePath, repoRoot), `README.md missing heading: ${question}`));
      }
    }
  }
  return findings;
};

// Path.glob semantics: `*` stays inside one segment, `**` as a whole segment spans directories.
const globFiles = (repoRoot, pattern) => {
  const segments = pattern.split('/').filter(Boolean);
  const matches = [];
  const walk = (directory, remaining) => {
    if (!remaining.length || !isDirectory(directory)) {
      return;
    }
    const [head, ...rest] = remaining;
    if (head === '**') {
      walk(directory, rest);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(directory, entry.name), remaining);
        }
      }
      return;
    }
    const segmentRegex = new RegExp(`^${[...head].map((char) => (char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')}$`);
    for (const entry of readdirSync(directory)) {
      if (!segmentRegex.test(entry)) {
        continue;
      }
      const full = join(directory, entry);
      if (rest.length) {
        walk(full, rest);
      } else {
        matches.push(full);
      }
    }
  };
  walk(repoRoot, segments);
  return matches;
};

const countLines = (text) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));

export const surfaceRules = (config, repoRoot) => {
  const findings = [];
  const rules = config.surfaceRules || {};
  const lineCap = rules.lineCap;
  const patterns = rules.paths || [];
  if (!lineCap || !patterns.length) {
    return findings;
  }
  for (const pattern of patterns) {
    for (const path of globFiles(repoRoot, pattern)) {
      if (!isFile(path) || containedPath(repoRoot, relative(repoRoot, path)) === null) {
        continue;
      }
      const lineCount = countLines(readFileSync(path, 'utf8'));
      if (lineCount > lineCap) {
        findings.push(finding('surface-rules', relativeTo(path, repoRoot), `${lineCount} lines exceeds cap ${lineCap}`));
      }
    }
  }
  return findings;
};

const JOBS = [configSanity, structure, pairedDocs, declaredDocsResolve, sectionReadmes, surfaceRules];

export const runAll = (config, repoRoot, changedPaths) => JOBS.flatMap((job) => job(config, repoRoot, changedPaths));

const gitEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
const gitOptions = (cwd) => ({ cwd, encoding: 'utf8', env: gitEnvironment() });
const git = (repoRoot, args) => spawnSync('git', args, gitOptions(repoRoot));
const gitOutput = (repoRoot, args) => execFileSync('git', args, gitOptions(repoRoot));

export const resolveBase = (repoRoot, config) => {
  const override = config.base;
  if (override) {
    if (String(override).startsWith('-')) {
      throw new DocsCheckError(`docs-check: config \`base\` may not start with '-' (got ${pyRepr(override)})`);
    }
    const resolved = git(repoRoot, ['rev-parse', '--verify', '-q', `${override}^{commit}`]);
    if (resolved.status !== 0) {
      throw new DocsCheckError(`docs-check: config \`base\` does not resolve to a commit (got ${pyRepr(override)})`);
    }
    return resolved.stdout.trim();
  }
  if (git(repoRoot, ['rev-parse', '--verify', '-q', 'origin/main']).status === 0) {
    return gitOutput(repoRoot, ['merge-base', 'origin/main', 'HEAD']).trim();
  }
  const rootCommits = gitOutput(repoRoot, ['rev-list', '--max-parents=0', 'HEAD'])
    .split('\n')
    .filter((line) => line.trim());
  if (!rootCommits.length) {
    throw new DocsCheckError('docs-check: could not find a root commit');
  }
  return rootCommits.at(-1);
};

export const computeChangedPaths = (repoRoot, base) =>
  gitOutput(repoRoot, ['diff', '--name-only', '--end-of-options', base, 'HEAD'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const gitRepoRoot = () => {
  try {
    return gitOutput(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  } catch (error) {
    throw new DocsCheckError(`docs-check: could not determine git repo root (${error.message})`);
  }
};

export const main = () => {
  try {
    const repoRoot = gitRepoRoot();
    const config = loadConfig(repoRoot);
    const base = resolveBase(repoRoot, config);
    const findings = runAll(config, repoRoot, computeChangedPaths(repoRoot, base));
    for (const item of findings) {
      console.log(formatFinding(item));
    }
    process.exit(findings.length ? 1 : 0);
  } catch (error) {
    if (error instanceof DocsCheckError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

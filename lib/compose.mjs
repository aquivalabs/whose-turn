/** Turns a remark into an issue (title, kind, body) with the user's own agent CLI, `claude -p` unless the config names another; falls back to the first line as the title. RMA-109. */
import { execFile } from 'node:child_process';
import { escapeRegex } from './text.mjs';
import { findClaude } from './update.mjs';

const KINDS = ['bug', 'improvement', 'idea'];
export const DEFAULT_COMPOSER = { command: 'claude', args: ['-p', '--output-format', 'json', '--model', 'claude-haiku-5-5'] };

const PROMPT = (text) => `You turn a user's remark about a tool called Whose Turn (a local monitor of tickets and pull requests) into an issue for its backlog.
Answer with one JSON object only, no prose, no code fence: {"title": string, "kind": "bug" | "improvement" | "idea", "body": string}.
Rules: the title and the body are in English whatever language the remark is in; translate faithfully, keep every detail the user gave, add nothing the user did not say. The title is one line under 80 characters; kind is bug when something misbehaves, improvement when something that exists should be better, idea when it is new; the body restates the remark clearly and ends, when the remark was not in English, with one line "Original: …" quoting it as written.
Remark:
${text}`;

const DEFAULT_BUG_WORDS = ['bug', 'broken', 'crash', 'error', 'fail', 'wrong'];
const fallback = (text, bugWords) => {
  const [first, ...rest] = String(text).trim().split('\n');
  const words = [...DEFAULT_BUG_WORDS, ...[].concat(bugWords || [])].map(escapeRegex).join('|');
  const kind = new RegExp(`(^|[^\\p{L}\\p{N}])(${words})`, 'iu').test(text) ? 'bug' : 'improvement';
  return { title: first.trim().slice(0, 120), kind, body: rest.join('\n').trim(), composed_by: 'fallback' };
};

const issueFrom = (text) => {
  const match = /\{[\s\S]*\}/.exec(text);
  const issue = JSON.parse(match ? match[0] : text);
  if (!issue.title || !KINDS.includes(issue.kind)) {
    throw new Error('incomplete answer');
  }
  return { title: String(issue.title).slice(0, 120), kind: issue.kind, body: String(issue.body || '') };
};

const parse = (output, label) => {
  let text = output;
  try {
    const payload = JSON.parse(output);
    if (payload && typeof payload.result === 'string') {
      text = payload.result;
    } else if (payload && payload.title) {
      return { ...issueFrom(output), composed_by: label };
    }
  } catch {
    /* not a wrapper; the output is the answer itself */
  }
  return { ...issueFrom(text), composed_by: label };
};

const runCommand = (composer) => (prompt, timeoutMs) => new Promise((resolve, reject) => {
  const child = execFile(composer.command, composer.args || [], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  child.stdin.end(prompt);
});

/** @param {string} text @param {{ composer?: object, bugWords?: string[], run?: Function, find?: () => string, timeoutMs?: number }} [options] */
export const composeIssue = async (text, { composer = DEFAULT_COMPOSER, bugWords = [], run, find = findClaude, timeoutMs = 45000 } = {}) => {
  const clean = String(text || '').trim();
  if (!clean) {
    throw new Error('Write at least one line');
  }
  const args = composer.args || [];
  const model = args[args.indexOf('--model') + 1];
  const label = composer.label || (args.includes('--model') && model ? `${composer.command} ${model}` : composer.command);
  try {
    let runner = run;
    if (!runner) {
      const command = composer.command === 'claude' ? find() : composer.command;
      if (!command) {
        return fallback(clean, bugWords);
      }
      runner = runCommand({ ...composer, command });
    }
    return parse(await runner(PROMPT(clean), timeoutMs), label);
  } catch {
    return fallback(clean, bugWords);
  }
};

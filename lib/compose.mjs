/** Turns a remark written any old way into an issue (title, kind, body) with the user's own agent: a CLI that reads the prompt on stdin and prints JSON, `claude -p` unless the config names another; falls back to the first line as the title. RMA-109. */
import { execFile } from 'node:child_process';
import { escapeRegex } from './text.mjs';

const KINDS = ['bug', 'improvement', 'idea'];
export const DEFAULT_COMPOSER = { command: 'claude', args: ['-p', '--output-format', 'json', '--model', 'claude-haiku-5-5'] };

const PROMPT = (text, about) => `You turn a user's remark about a tool called Whose Turn (a local monitor of tickets and pull requests) into an issue for its backlog.
Answer with one JSON object only, no prose, no code fence: {"title": string, "kind": "bug" | "improvement" | "idea", "body": string}.
Rules: the title is one line under 80 characters, in the language of the remark; kind is bug when something misbehaves, improvement when something that exists should be better, idea when it is new; the body restates the remark clearly in the user's language, keeps every detail the user gave, adds nothing the user did not say, and may end with one line "Context: …" taken from the context below if it helps a developer find the place.
Remark:
${text}
${about ? `\nContext of the window at that moment:\n${about.slice(0, 3000)}` : ''}`;

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

export const composeIssue = async (text, { about = '', composer = DEFAULT_COMPOSER, bugWords = [], run, timeoutMs = 45000 } = {}) => {
  const clean = String(text || '').trim();
  if (!clean) {
    throw new Error('Write at least one line');
  }
  const args = composer.args || [];
  const model = args[args.indexOf('--model') + 1];
  const label = composer.label || (args.includes('--model') && model ? `${composer.command} ${model}` : composer.command);
  try {
    return parse(await (run || runCommand(composer))(PROMPT(clean, about), timeoutMs), label);
  } catch {
    return fallback(clean, bugWords);
  }
};

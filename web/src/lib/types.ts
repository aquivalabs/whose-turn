// The shapes the local server sends the window (/api/state, /api/stream, /api/config, /api/feedback); the server in lib/ is their source.

/** CSS variables of one colour scheme, by name. */
export type SchemeVariables = Record<string, string>;
export interface Theme {
  light: SchemeVariables;
  dark: SchemeVariables;
}

export interface ConnectorSummary {
  id: string;
  type: string;
  label: string;
}
export interface QuickLink {
  label: string;
  url: string;
}

export type HiddenMode = 'parked' | 'paused';

export interface Workspace {
  id: string;
  name: string;
  connectors: ConnectorSummary[];
  links: QuickLink[];
  key_pattern: string;
  theme: Theme | null;
  /** The seed the scheme was built from: the configured one, or the one derived from the id. */
  theme_seed?: string;
  /** False when the workspace turned its backdrop animal off. */
  backdrop?: boolean;
  open_moves?: number;
  failing_sources?: number;
  /** How the workspace is kept out of the rail: parked is checked every 15 minutes, paused not at all; empty when shown. */
  hidden?: HiddenMode | '';
  /** A parked workspace came back and its feed line is not seen yet: the rail's dot. */
  returned?: boolean;
}

/** One row of "whose turn": the server decided its group, rank and next step. */
export interface TurnRow {
  row_id: string;
  key: string;
  summary: string;
  ticket_url: string;
  /** 'gone' is a row the table hides. */
  group: 'you' | 'others' | 'done' | 'gone';
  rank: number;
  updated: string;
  activity_at?: string;
  status: string;
  status_since?: string;
  /** The chain group of the status, '' when it is none of them. */
  status_group?: 'backlog' | 'passed' | 'code_review' | 'qa' | 'on_hold' | '';
  /** Whether a handled mark covers the row's latest activity; the server decides. */
  handled?: boolean;
  next: string;
  why?: string;
  whose?: string;
  /** Everyone on the PR's review when the row waits on reviewers: still requested, approved or asking for changes. */
  reviewers?: { name: string; state: '' | 'approved' | 'changes' }[];
  hold_url?: string;
  hold_full?: string;
  pr?: string;
  pr_url?: string;
  pr_state?: string;
  checks?: string;
  comment?: string;
  comment_url?: string;
}

export interface FeedItem {
  id: string;
  ref: string;
  key?: string;
  title?: string;
  kind: string;
  who?: string;
  at: string;
  text?: string;
  body?: string;
  url?: string;
  source: string;
  mention?: boolean;
}

/** Read and handled marks; `seen` may be the server's array or a Set the window built once per render. */
export interface Marks {
  seen: string[] | Set<string>;
  base: number;
  handled: Record<string, string | null>;
  /** What a handled mark carries beyond its time: a note, or the outcome and feed event of an automatic one. */
  info: Record<string, HandledInfo>;
}

export interface HandledInfo {
  note?: string;
  auto?: boolean;
  outcome?: string;
  /** The id of the feed item that moved the row. */
  event?: string;
  /** What the event carried: who it went to, the status change and a reference to the latest comment. */
  detail?: {
    /** The head phrase of the outcome, before the status and comment parts. */
    what?: string;
    summary?: string;
    assignee?: string;
    status?: string;
    /** The feed id of the comment; marks saved before 2026-11-04 carry a copy `{author, text}` instead. */
    comment?: string | { author: string; text: string };
  };
}

export interface Todo {
  id: string;
  text: string;
  /** When the to-do was done, null while it is open. */
  done: string | null;
  by?: string;
  created: string;
  key?: string;
  ticket_url?: string;
}

export interface Health {
  ok: boolean;
  stale: boolean;
  fresh_at: string;
  failing: { source: string; polls: number }[];
  alerts: { id?: string; text: string }[];
}

/** The four header tiles, counted by the server. */
export interface Counts {
  mine: number;
  others: number;
  failing: number;
  done: number;
}

/** What a marks write changes, as /api/marks answers it. */
export interface Marked {
  marks: Marks & { seen: string[] };
  turn: TurnRow[];
  counts: Counts;
}

/** The self-update offer the server reports in /api/state, /api/summary and the stream (RMA-231). */
export interface UpdateStatus {
  current: string;
  latest: string;
  available: boolean;
  state: 'idle' | 'installing' | 'restarting' | 'failed';
  reason?: string;
  plugin?: { state: 'updated' | 'manual' | 'failed'; copy: string };
}

export interface Snapshot extends Marked {
  workspaces: Workspace[];
  workspace: Workspace;
  feed: FeedItem[];
  todos: Todo[];
  errors: Record<string, string>;
  health: Health;
  problems: string[];
  polled_at: string;
  update: UpdateStatus;
  notifications: { desktop: boolean };
}

/** One message of /api/stream: a workspace's poll, the update status when it changes, or whether a report has news (RMA-311). */
export type StreamEvent = WorkspaceEvent | { update: UpdateStatus } | { report_news: boolean };

export interface WorkspaceEvent {
  ws: string;
  version: number;
  polled_at: string;
  open_moves: number;
  hidden?: HiddenMode | '';
  returned?: boolean;
}

/** One `details[]` entry of the error envelope, by its `@type` (lib/errors.mjs). */
export type ApiErrorDetail =
  | {
      '@type': 'ErrorInfo';
      reason: string;
      domain: string;
      metadata: Record<string, string | number | undefined>;
    }
  | { '@type': 'BadRequest'; field_violations: { field: string; description: string }[] }
  | { '@type': 'DebugInfo'; detail: string };

/** The google.rpc.Status error envelope's `error`, as every refused request returns it. */
export interface ApiError {
  code: number;
  status: string;
  message: string;
  details: ApiErrorDetail[];
}

/** A raw workspace entry of config.json as the settings form edits it. */
export interface ConnectorEntry {
  type: string;
  id?: string;
  label?: string;
  [field: string]: unknown;
}
export interface RawWorkspace {
  id: string;
  name?: string;
  connectors: ConnectorEntry[];
  rules: { statuses: Record<string, unknown>; [field: string]: unknown };
  theme: Record<string, unknown>;
  [field: string]: unknown;
}

/** One field of a settings form, as the server's catalogue describes it. */
export interface FieldSpec {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  colour?: boolean;
  list?: boolean;
  boolean?: boolean;
  default?: boolean;
  choices?: string[];
  min?: number;
  max?: number;
  hint?: string;
}

/** The plain words the server sends with each fact, by fact name: the noun, and a boolean's true and false sentence. */
export type FactWords = Record<string, { name?: string; says?: [string, string] }>;

/** One row of a workspace's rules table. */
export interface RuleRow {
  when: Record<string, unknown>;
  then: { whose: string; next?: string };
}

export interface FiledReport {
  id: string;
  title: string;
  kind?: string;
  state?: string;
  outcome?: string;
  body?: string;
  filed_at: string;
  changed_at?: string;
  unanswered?: boolean;
  answers_hidden?: boolean;
  mine?: boolean;
  answers: { by?: string; at: string; text: string }[];
}

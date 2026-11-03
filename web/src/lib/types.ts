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

export interface PinnedAnimal {
  species: string;
  seed: number;
}

export interface Workspace {
  id: string;
  name: string;
  connectors: ConnectorSummary[];
  links: QuickLink[];
  key_pattern: string;
  theme: Theme | null;
  /** The seed the scheme was built from: the configured one, or the one derived from the id. */
  theme_seed?: string;
  /** The animal pinned to the workspace, or null while a new one is drawn on every load. */
  animal?: PinnedAnimal | null;
  open_moves?: number;
  failing_sources?: number;
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
}

/** One message of /api/stream: a workspace's poll, or the update status when it changes. */
export type StreamEvent = WorkspaceEvent | { update: UpdateStatus };

export interface WorkspaceEvent {
  ws: string;
  version: number;
  polled_at: string;
  open_moves: number;
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
  hint?: string;
}

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
  answers: { by?: string; at: string; text: string }[];
}

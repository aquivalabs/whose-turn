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

export interface Workspace {
  id: string;
  name: string;
  connectors: ConnectorSummary[];
  links: QuickLink[];
  key_pattern: string;
  theme: Theme | null;
  open_moves?: number;
}

/** One row of "whose turn": the server decided its group, rank and next step. */
export interface TurnRow {
  row_id: string;
  key: string;
  summary: string;
  ticket_url: string;
  group: 'you' | 'others' | 'done' | string;
  rank: number;
  updated: string;
  activity_at?: string;
  status: string;
  status_since?: string;
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
  done?: boolean;
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
  alerts: { text: string }[];
}

export interface Snapshot {
  workspaces: Workspace[];
  workspace: Workspace;
  turn: TurnRow[];
  feed: FeedItem[];
  marks: Marks & { seen: string[] };
  todos: Todo[];
  errors: Record<string, string>;
  health: Health;
  problems: string[];
  polled_at: string;
}

/** One message of /api/stream. */
export interface StreamEvent {
  ws: string;
  version: number;
  polled_at: string;
  open_moves: number;
}

/** A google.rpc.Status error envelope, as every refused write returns it. */
export interface ApiError {
  message: string;
  details?: {
    '@type': string;
    field_violations?: { description: string }[];
    metadata?: { detail?: string };
  }[];
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

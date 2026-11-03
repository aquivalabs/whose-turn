// Connector contract 1: the types of an adapter module and of what its poll returns. The page that explains them is docs/mechanisms/connector-contract.md; lib/contract.mjs checks the same shapes at run time.

/** The contract version this file describes; an adapter exports it as `contract`. */
export type ContractVersion = 1;

/** Every kind of data a source may supply. */
export type Kind = 'tickets' | 'comments' | 'prs' | 'activity' | 'asks' | 'runs';

/** An ISO 8601 date-time, UTC preferred: `2026-11-03T09:00:00Z`. */
export type IsoTime = string;

/** A link the window may follow: empty, or starting with `https://`. */
export type HttpsUrl = string;

/** One field of the settings form for a connector entry. A secret field is never written to the config. */
export interface FieldSpec {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** A comma-separated list in the form, an array in the config. */
  list?: boolean;
  boolean?: boolean;
  default?: boolean;
  /** Stored in the platform secret store under `service` and the value of the entry field named by `account`. Built-in connectors only in contract 1; a user adapter gets one token through `secret()`. */
  secret?: { account: string; service: string; default: string };
}

/** A work item: a ticket, an issue, a card, a to-do. `key` joins it to PRs and comments. */
export interface Ticket {
  key: string;
  summary: string;
  /** The status as the source names it; the rules map it onto status groups by the workspace's `rules.statuses`. */
  status: string;
  /** new: not started; indeterminate: in progress; done: finished or dropped. */
  status_category: 'new' | 'indeterminate' | 'done';
  /** Your name as `me` gives it when the item is on you. */
  assignee: string;
  updated: IsoTime;
  url: HttpsUrl;
  /** When and by whom the item entered its current status, when the source knows. */
  status_change?: { since: IsoTime; by: string } | null;
}

/** A comment on a ticket; an `@<me>` in its body is a mention of you. */
export interface Comment {
  id: string | number;
  key: string;
  at: IsoTime;
  author: string;
  body: string;
  url: HttpsUrl;
}

/** A change request of yours: a pull or merge request. */
export interface PullRequest {
  pr: number;
  /** The ticket key found in the title, '' when none. */
  key: string;
  title: string;
  base: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  review: '' | 'APPROVED' | 'CHANGES_REQUESTED';
  checks: 'passing' | 'failing' | 'running' | 'none';
  merged_at: string;
  updated_at: IsoTime;
  url: HttpsUrl;
  last_comment_by: string;
  last_comment_at: string;
  last_comment_url: HttpsUrl;
  last_comment: string;
  /** Someone else commented after your last comment and it is not an approval. */
  unanswered: boolean;
}

/** One feed line about a change request or a run: a comment, a review, a merge, a failed check. */
export interface Activity {
  at: IsoTime;
  /** The reference shown in the feed, such as `repo#12`. */
  pr: string;
  key: string;
  title?: string;
  kind: string;
  who: string;
  url: HttpsUrl;
  text: string;
  body?: string;
}

/** Someone asks you for something outside your own items. */
export interface Ask {
  id: string;
  ref: string;
  title: string;
  key: string;
  kind: 'review requested' | 'mentioned you';
  who: string;
  at: IsoTime;
  url: HttpsUrl;
  text: string;
  body: string;
}

/** A pipeline that fails on the main line; returned only while it fails. */
export interface Run {
  id: string | number;
  /** Stable per pipeline: `<repo>:<workflow>@<branch>`. */
  ref: string;
  workflow: string;
  branch: string;
  failed: boolean;
  mine: boolean;
  actor: string;
  title: string;
  url: HttpsUrl;
  at: IsoTime;
  /** The id of the first failure of the current streak; a new streak is a new move. */
  streak: string | number;
}

/** What one poll resolves to. Only declared kinds may appear; a missing declared kind counts as an empty list. */
export interface PollResult {
  /** Your name in this source, as it appears in `assignee`, `author` and `@` mentions. */
  me?: string;
  tickets?: Ticket[];
  comments?: Comment[];
  prs?: PullRequest[];
  activity?: Activity[];
  asks?: Ask[];
  runs?: Run[];
  /** The ticket URL without the key, for links to a key found elsewhere. */
  ticket_base?: string;
  /** Parts that failed while the rest succeeded: part → message. A total failure throws instead. */
  errors?: Record<string, string>;
}

/** The JSON client the server shares: ETag caching on GET, a RateLimited error on 403/429. */
export interface HttpClient {
  fetchJson(url: string, options?: { headers?: Record<string, string>; method?: string; body?: unknown; useEtag?: boolean }): Promise<any>;
}

/** What poll receives. */
export interface PollContext {
  /** The connector entry from the workspace config: `type`, `id`, `path` and the adapter's own fields. */
  settings: Record<string, any>;
  http: HttpClient;
  /** Kept in memory between polls of this entry; not written to disk in contract 1. */
  cache: Record<string, any>;
  /** The start of the feed window. */
  sinceIso: IsoTime;
  historyDays: number;
  /** Finds a ticket key in a text by the workspace's key pattern; '' when none. */
  keyOf(text: string): string;
  /** The token stored for this entry, '' when none. */
  secret(): Promise<string>;
}

/** An adapter module: these named exports, nothing else required. */
export interface Adapter {
  contract: ContractVersion;
  /** Lowercase letters, digits and hyphens, starting with a letter. */
  id: string;
  label: string;
  capabilities: Kind[];
  fields: FieldSpec[];
  poll(context: PollContext): Promise<PollResult>;
}

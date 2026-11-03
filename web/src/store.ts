// One store for the window: the workspace state the server computed, the window's own choices, and the data flow (load, SSE, marks, to-dos, the config order).
import { shallowReactive, reactive, computed, watch } from 'vue';
import {
  refAutoReset,
  useDebounceFn,
  useEventListener,
  useEventSource,
  useIntervalFn,
  useLocalStorage,
  useNow,
  useSessionStorage,
} from '@vueuse/core';
import { getJson, post } from './lib/api.ts';
import { NO_WORKSPACE_MESSAGE, retryWithoutWorkspace } from './lib/load-retry.ts';
import { turnCounts } from './lib/moves.ts';
import { orderWorkspaces } from './lib/settings.ts';
import { resolveMode, sizeBody } from './lib/window-mode.ts';
import { SERVER_DOWN, TEXT_KEPT, writeProblem } from './lib/problems.ts';
import type { ApiError, FeedItem, Marks, Snapshot, StreamEvent, Todo } from './lib/types.ts';
import { show as showBackdrop } from './backdrop.ts';
import { dark } from './scheme.ts';

// The same keys and values the window has always stored; nothing is written until a choice is made.
const STORED = { writeDefaults: false };
const lastWorkspace = useLocalStorage('wt-ws', '', STORED);
const lastMode = useSessionStorage('wt-mode', '', STORED);

// The server's snapshot: replaced wholesale on every load, never mutated in place, so shallow reactivity is enough.
export const snapshot = shallowReactive<Snapshot>({
  workspaces: [],
  workspace: { id: '', name: '', connectors: [], links: [], key_pattern: '', theme: null },
  turn: [],
  feed: [],
  marks: { seen: [], base: 0, handled: {} },
  todos: [],
  errors: {},
  health: { ok: true, stale: false, fresh_at: '', failing: [], alerts: [] },
  problems: [],
  polled_at: '',
});
export const ui = reactive({
  ws: new URLSearchParams(location.search).get('ws') || lastWorkspace.value,
  feed: 'all',
  feedView: useLocalStorage('wt-feed-view', 'ticket', STORED),
  feedQuery: '',
  openGroups: new Set<string>(),
  move: 'open',
  open: new Set<string>(),
  showDone: false,
  mode: resolveMode(location.search, lastMode.value),
  live: false,
  status: 'Connecting…',
  modal: null as FeedItem | null,
  feedback: false,
  settings: false,
  settingsDirty: false,
  settingsAsk: false,
  settingsAt: '',
});

lastMode.value = ui.mode;

/** A refused write's message: shown beside the live text for a few seconds, then gone. */
export const notice = refAutoReset('', 6000);
/** Puts the problem of a write that has no control of its own into the notice; resolves with whether the write went through. */
export const tellProblem = (outcome: unknown, options?: Parameters<typeof writeProblem>[1]) => {
  const problem = writeProblem(outcome, options);
  if (problem) {
    notice.value = problem;
  }
  return !problem;
};

/** An app window reports its size after each resize, so the next one opens the same size. */
export const reportWindowSize = () => {
  if (ui.mode !== 'app') {
    return;
  }
  useEventListener(
    window,
    'resize',
    useDebounceFn(() => post('/api/window', sizeBody(window)).catch(tellProblem), 600),
  );
};

/** A clock for "ago" texts; ticks every 30 seconds. */
export const now = useNow({ scheduler: (update) => useIntervalFn(update, 30000) });

/** The workspace palette for the current colour scheme, as the CSS variables App.vue puts on the root. */
export const themeVariables = computed(() => {
  const theme = snapshot.workspace.theme;
  return theme && theme.light && theme.dark ? theme[dark.value ? 'dark' : 'light'] : {};
});
export const counts = computed(() => turnCounts(snapshot.turn, snapshot.marks));
export const alerts = computed(() => [
  ...(snapshot.problems || []),
  ...snapshot.health.alerts.map((alert) => alert.text),
  ...Object.entries(snapshot.errors || {}).map(([source, text]) => source + ': ' + text),
]);
/** Opens the settings sheet on the current workspace, scrolled to a section when one is named. */
export const openSettings = (section = '') => {
  ui.settingsAt = section;
  ui.settings = true;
};
export const closeSheets = () => {
  if (ui.settings && ui.settingsDirty) {
    ui.settingsAsk = true;
    return;
  }
  ui.modal = null;
  ui.settings = false;
  ui.feedback = false;
};

type StateReply = Snapshot & { error?: ApiError };

let version = -1;
/** Reads one workspace's state; ui.ws changes only once the server has answered with it. */
export const load = (asked = ui.ws): Promise<Snapshot> =>
  getJson<StateReply>('/api/state' + (asked ? '?ws=' + encodeURIComponent(asked) : '')).then(
    (reply) => {
      if (reply.error) {
        if (!retryWithoutWorkspace(asked)) {
          ui.status = NO_WORKSPACE_MESSAGE;
          return snapshot;
        }
        return load('');
      }
      Object.assign(snapshot, reply);
      ui.ws = snapshot.workspace.id;
      ui.status = '';
      showBackdrop({ workspace: snapshot.workspace.id });
      document.title = 'Whose Turn · ' + snapshot.workspace.name;
      return snapshot;
    },
  );
export const reload = () => {
  version = -1;
  return load();
};

// Chromium gives up on a refused reconnect, so VueUse retries every second until the server is back; every message is a new object, so each one reaches the watcher.
const stream = useEventSource<[], StreamEvent>('/api/stream', [], {
  immediate: false,
  autoConnect: false,
  autoReconnect: true,
  serializer: { read: (raw) => JSON.parse(raw || 'null') },
});
watch(
  stream.status,
  (status) => {
    ui.live = status === 'OPEN';
    if (ui.live) {
      ui.status = '';
    }
  },
  { flush: 'sync' },
);
watch(
  stream.error,
  (error) => {
    if (error) {
      ui.status = 'Disconnected from the local server, retrying…';
    }
  },
  { flush: 'sync' },
);
watch(
  stream.data,
  (message) => {
    if (!message || (snapshot.workspace.id && message.ws !== snapshot.workspace.id)) {
      return;
    }
    ui.status = '';
    if (message.version !== version) {
      version = message.version;
      load();
    } else {
      snapshot.polled_at = message.polled_at;
    }
  },
  { flush: 'sync' },
);
export const connect = () => stream.open();

/** Switches only when the server answers with the workspace; with the server down the click is ignored and the notice says why. */
export const switchWorkspace = (id: string) => {
  if (id === snapshot.workspace.id) {
    return Promise.resolve();
  }
  version = -1;
  return load(id).then(
    () => {
      lastWorkspace.value = ui.ws;
      ui.open.clear();
    },
    () => {
      notice.value = SERVER_DOWN + '; staying on ' + snapshot.workspace.name + '.';
    },
  );
};

const postWs = <T>(url: string, body: object) =>
  post<T & { error?: ApiError }>(url, { ws: snapshot.workspace.id, ...body });
/** Sends one marks change; resolves with the problem line to show next to its control, empty when the server confirmed it. */
export const setMarks = (body: Partial<Pick<Marks, 'base' | 'handled'>> & { seen?: string[] }) =>
  postWs<Snapshot['marks']>('/api/marks', body).then(
    (marks) => {
      const problem = writeProblem(marks);
      if (!problem) {
        snapshot.marks = marks;
      }
      return problem;
    },
    (failure: Error) => writeProblem(failure),
  );
/** Sends one to-do change; resolves with the problem line to show, empty when the server confirmed it. */
export const todoAct = (body: { action: string; text?: string; id?: string }) =>
  postWs<Todo[]>('/api/todos', body).then(
    (list) => {
      const problem = writeProblem(list, { unreachable: TEXT_KEPT });
      if (!problem && Array.isArray(list)) {
        snapshot.todos = list;
      }
      return problem;
    },
    (failure: Error) => writeProblem(failure, { unreachable: TEXT_KEPT }),
  );
/** Dragging a workspace icon rewrites the config in the new order: the same raw entries, so secrets and caches stay. */
export const reorderWorkspaces = (ids: string[]) =>
  getJson<{ workspaces: { id: string }[] }>('/api/config')
    .then((config) =>
      post<{ error?: ApiError }>('/api/config', {
        workspaces: orderWorkspaces(config.workspaces, ids),
        secrets: [],
      }),
    )
    .then(
      (reply) => {
        if (tellProblem(reply, { refused: 'The order was not saved' })) {
          reload();
        }
      },
      (failure: Error) => tellProblem(failure, { refused: 'The order was not saved' }),
    );
/** The workspace the first-run card offers: invented data from the northwind scenario, no account needed. */
const DEMO_WORKSPACE = {
  id: 'demo',
  name: 'Demo',
  key_pattern: '\\bNW-\\d+\\b',
  theme: { seed: '#3d7a5c', accent: '#c27a2c' },
  connectors: [{ type: 'demo', scenario: 'northwind', label: 'Demo tracker' }],
};
/** Adds the demo workspace to the config unless one with its id is there, then switches to it. */
export const tryDemo = () =>
  getJson<{ workspaces: { id: string }[] }>('/api/config')
    .then((config) =>
      config.workspaces.some((workspace) => workspace.id === DEMO_WORKSPACE.id)
        ? null
        : post<{ error?: ApiError }>('/api/config', {
            workspaces: [...config.workspaces, DEMO_WORKSPACE],
            secrets: [],
          }),
    )
    .then(
      (reply) => {
        if (tellProblem(reply, { refused: 'The demo workspace was not added' })) {
          return switchWorkspace(DEMO_WORKSPACE.id);
        }
      },
      (failure: Error) => tellProblem(failure, { refused: 'The demo workspace was not added' }),
    );
export const refresh = () => {
  ui.status = 'Checking now…';
  post('/api/refresh').catch((failure: Error) => {
    ui.status = '';
    tellProblem(failure);
  });
  showBackdrop({ workspace: snapshot.workspace.id, seed: Math.floor(Math.random() * 4294967296) });
};

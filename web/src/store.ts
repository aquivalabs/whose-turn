// One store for the window: the workspace state the server computed, the window state more than one part reads, and the data flow (load, SSE, marks, to-dos, the config order). An island's own choices live in its feature folder; ADR 0006.
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
import { getJson, post, reasonOf } from './lib/api.ts';
import { latestWins } from './lib/latest-wins.ts';
import { withOpenMoves } from './lib/moves.ts';
import { orderWorkspaces } from './lib/settings.ts';
import { topLayer, type Layer } from './lib/layers.ts';
import { resolveMode, sizeBody } from './lib/window-mode.ts';
import { SERVER_DOWN, TEXT_KEPT, errorProblem, writeProblem } from './lib/problems.ts';
import type { ApiError, FeedItem, Marks, Snapshot, StreamEvent, Todo } from './lib/types.ts';
import { show as showBackdrop } from './backdrop.ts';
import { dark } from './scheme.ts';

// docs/adr/0002-vueuse-in-the-window.md (storage rows)
const STORED = { writeDefaults: false };
const lastWorkspace = useLocalStorage('wt-ws', '', STORED);
const lastMode = useSessionStorage('wt-mode', '', STORED);

/** The server's snapshot; every load replaces it wholesale and nothing mutates it in place. */
export const snapshot = shallowReactive<Snapshot>({
  workspaces: [],
  workspace: { id: '', name: '', connectors: [], links: [], key_pattern: '', theme: null },
  turn: [],
  feed: [],
  marks: { seen: [], base: 0, handled: {}, info: {} },
  counts: { mine: 0, others: 0, failing: 0, done: 0 },
  todos: [],
  errors: {},
  health: { ok: true, stale: false, fresh_at: '', failing: [], alerts: [] },
  problems: [],
  polled_at: '',
  update: { current: '', latest: '', available: false, state: 'idle' },
  notifications: { desktop: true },
});
export const ui = reactive({
  ws: new URLSearchParams(location.search).get('ws') || lastWorkspace.value,
  open: new Set<string>(),
  mode: resolveMode(location.search, lastMode.value),
  live: false,
  reconnects: 0,
  status: 'Connecting…',
  modal: null as FeedItem | null,
  note: '',
  feedback: false,
  reportNews: false,
  whatsNew: false,
  settings: false,
  settingsNew: false,
  monitor: false,
  settingsDirty: false,
  settingsAsk: false,
  settingsAt: '',
  focusFeed: '',
});

lastMode.value = ui.mode;

/** A refused write's message: shown beside the live text for a few seconds, then gone. */
export const notice = refAutoReset('', 6000);
/** The row just marked handled, for the Undo banner. */
export const justHandled = refAutoReset('', 8000);
/** Puts the problem of a write that has no control of its own into the notice; resolves with whether the write went through. */
export const tellProblem = (outcome: unknown, options?: Parameters<typeof writeProblem>[1]) => {
  const problem = writeProblem(outcome, options);
  if (problem) {
    notice.value = problem;
  }
  return !problem;
};

let savingNotifications = false;
/** Flips desktop notifications for the whole monitor, at once on screen and saved through the server; a refusal puts the old value back and says why. The bell and the monitor settings share it. */
export const toggleNotifications = async () => {
  if (savingNotifications) {
    return;
  }
  savingNotifications = true;
  const before = snapshot.notifications;
  snapshot.notifications = { desktop: !before.desktop };
  const settle = (outcome: unknown) => {
    if (!tellProblem(outcome, { refused: 'The notification setting was not saved' })) {
      snapshot.notifications = before;
    }
  };
  await post('/api/notifications', { desktop: snapshot.notifications.desktop }).then(settle, settle);
  savingNotifications = false;
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

const clock = { resume: () => {} };
/** A clock for "ago" texts; ticks every 30 seconds once start() has run. */
export const now = useNow({
  scheduler: (update) => {
    const ticker = useIntervalFn(update, 30000, { immediate: false });
    clock.resume = ticker.resume;
    return ticker;
  },
});

/** The workspace palette for the current colour scheme, as the CSS variables App.vue puts on the root. */
export const themeVariables = computed(() => {
  const theme = snapshot.workspace.theme;
  return theme && theme.light && theme.dark ? theme[dark.value ? 'dark' : 'light'] : {};
});
export const counts = computed(() => snapshot.counts);
/** The banner lines: one per source failing past the threshold. */
export const alerts = computed(() => {
  const name = snapshot.workspace.name;
  const prefix = name ? name + ': ' : '';
  const errors = Object.entries(snapshot.errors || {});
  const failing = snapshot.health.failing || [];
  const owner = (key: string) => failing.find(({ source }) => key === source || key.startsWith(source + '.'));
  const streaks = failing.map(({ source, polls }) => {
    const reasons = errors.filter(([key]) => owner(key)?.source === source).map(([, text]) => text);
    return `Source ${source}: ${reasons.join(', ') || 'failing'}, failed ${polls} polls in a row`;
  });
  const failingIds = new Set(failing.map(({ source }) => 'failing:' + source));
  return [
    ...(snapshot.problems || []),
    ...snapshot.health.alerts.filter((alert) => !failingIds.has(alert.id || '')).map((alert) => alert.text),
    ...streaks,
    ...errors.filter(([key]) => !owner(key)).map(([source, text]) => prefix + source + ': ' + text),
  ];
});
/** Opens the workspace settings on the current workspace, scrolled to a section when one is named. */
export const openSettings = (section = '') => {
  ui.settingsAt = section;
  ui.settingsNew = false;
  ui.settings = true;
};
/** Opens the workspace settings on an empty form for a new workspace. */
export const openNewWorkspace = () => {
  ui.settingsAt = '';
  ui.settingsNew = true;
  ui.settings = true;
};
/** The layer on top right now, or null when the window itself is in front. */
export const currentLayer = computed(() => topLayer(ui));
/** Closes only the topmost layer; a settings sheet with unsaved edits asks first. */
export const closeTopLayer = () => {
  const layer = currentLayer.value;
  if (layer === 'modal') ui.modal = null;
  if (layer === 'note') ui.note = '';
  if (layer === 'feedback') ui.feedback = false;
  if (layer === 'whatsNew') ui.whatsNew = false;
  if (layer !== 'settings' && layer !== 'monitor') return;
  if (ui.settingsDirty) {
    ui.settingsAsk = true;
    return;
  }
  ui.settings = false;
  ui.monitor = false;
};

const openers = new Map<Layer, Element | null>();
const rememberOpener = (layer: Layer, isOpen: boolean) => {
  if (isOpen) openers.set(layer, document.activeElement);
};
const returnFocus = (layer: Layer, isOpen: boolean) => {
  if (isOpen) return;
  const opener = openers.get(layer);
  openers.delete(layer);
  if (opener instanceof HTMLElement) opener.focus();
};
const layerFlags: Record<Layer, () => boolean> = {
  modal: () => Boolean(ui.modal),
  note: () => Boolean(ui.note),
  settings: () => ui.settings,
  monitor: () => ui.monitor,
  feedback: () => ui.feedback,
  whatsNew: () => ui.whatsNew,
};
watch(
  () => snapshot.turn.some((row) => row.row_id === ui.note),
  (present) => {
    if (!present) ui.note = '';
  },
  { flush: 'sync' },
);
Object.entries(layerFlags).forEach(([layer, isOpen]) => {
  watch(isOpen, (open) => rememberOpener(layer as Layer, open), { flush: 'sync' });
  watch(isOpen, (open) => returnFocus(layer as Layer, open), { flush: 'post' });
});

type StateReply = Snapshot & { error?: ApiError };

let version = -1;
let pendingSwitches = 0;
const requests = latestWins();
/** Reads one workspace's state; ui.ws changes only once the server has answered with it. */
export const load = (asked = ui.ws): Promise<Snapshot> => {
  const id = requests.next();
  return getJson<StateReply>('/api/state' + (asked ? '?ws=' + encodeURIComponent(asked) : '')).then(
    (reply) => {
      if (!requests.accepts(id)) {
        return snapshot;
      }
      if (reply.error) {
        if (reasonOf(reply.error) !== 'NO_SUCH_WORKSPACE' || !asked) {
          ui.status = errorProblem(reply.error, 'Could not load');
          return snapshot;
        }
        return load('');
      }
      if (asked && reply.workspace.hidden && reply.workspaces.some((entry) => !entry.hidden)) {
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
};
export const reload = () => {
  version = -1;
  return load();
};

// docs/adr/0002-vueuse-in-the-window.md (SSE stream)
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
      ui.reconnects++;
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
    if (!message) {
      return;
    }
    if ('update' in message) {
      snapshot.update = message.update;
      return;
    }
    if ('report_news' in message) {
      ui.reportNews = message.report_news && !ui.feedback;
      return;
    }
    const known = snapshot.workspaces.find((entry) => entry.id === message.ws);
    if (known && ((known.hidden || '') !== (message.hidden || '') || Boolean(known.returned) !== Boolean(message.returned))) {
      load();
    }
    if (typeof message.open_moves === 'number') {
      snapshot.workspaces = withOpenMoves(snapshot.workspaces, message.ws, message.open_moves);
    }
    if (snapshot.workspace.id && message.ws !== snapshot.workspace.id) {
      return;
    }
    ui.status = '';
    if (message.version !== version) {
      version = message.version;
      if (pendingSwitches === 0) {
        load();
      }
    } else {
      snapshot.polled_at = message.polled_at;
    }
  },
  { flush: 'sync' },
);
/** Opens the stream once; VueUse reports a stream that was never opened as CONNECTING, so the guard is the EventSource itself. */
export const connect = () => {
  if (!stream.eventSource.value) {
    stream.open();
  }
};
/** Starts what runs on its own: the clock, the first load and the stream behind it; importing this module does none of it. */
export const start = () => {
  clock.resume();
  return load().then(connect);
};

/** Switches only when the server answers with the workspace; with the server down the click is ignored and the notice says why. */
export const switchWorkspace = (id: string) => {
  if (id === snapshot.workspace.id) {
    return Promise.resolve();
  }
  version = -1;
  pendingSwitches++;
  return load(id)
    .then(
      () => {
        if (ui.ws !== id) {
          return;
        }
        lastWorkspace.value = ui.ws;
        ui.open.clear();
      },
      () => {
        notice.value = SERVER_DOWN + '; staying on ' + snapshot.workspace.name + '.';
      },
    )
    .finally(() => {
      pendingSwitches--;
    });
};

const postWs = <T>(url: string, body: object) =>
  post<T & { error?: ApiError }>(url, { ws: snapshot.workspace.id, ...body });
/** Sends one marks change and takes the marks, rows and counts the server recomputed; resolves with the problem line to show next to its control, empty when the server confirmed it. */
export const setMarks = (
  body: Partial<Pick<Marks, 'base' | 'handled'>> & {
    seen?: string[];
    unseen?: string[];
    notes?: Record<string, string>;
  },
) =>
  postWs<Pick<Snapshot, 'marks' | 'turn' | 'counts'>>('/api/marks', body).then(
    (reply) => {
      const problem = writeProblem(reply);
      if (!problem) {
        Object.assign(snapshot, { marks: reply.marks, turn: reply.turn, counts: reply.counts });
        snapshot.workspaces = withOpenMoves(
          snapshot.workspaces,
          snapshot.workspace.id,
          reply.counts.mine,
        );
      }
      return problem;
    },
    (failure: Error) => writeProblem(failure),
  );
/** Asks the feed island to open one item: its group, expanded, scrolled into view. */
export const showInFeed = (id: string) => {
  ui.focusFeed = id;
};
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
/** Brings a parked or paused workspace back into the rail through the server's one hide endpoint. */
export const restoreWorkspace = (id: string) =>
  post<{ error?: ApiError }>('/api/workspaces/hidden', { id, hidden: null }).then(
    (reply) => {
      if (tellProblem(reply, { refused: 'The workspace was not restored' })) {
        reload();
      }
    },
    (failure: Error) => tellProblem(failure, { refused: 'The workspace was not restored' }),
  );
export const refresh = () => {
  ui.status = 'Checking now…';
  post('/api/refresh').catch((failure: Error) => {
    ui.status = '';
    tellProblem(failure);
  });
  showBackdrop({ workspace: snapshot.workspace.id, seed: Math.floor(Math.random() * 4294967296) });
};

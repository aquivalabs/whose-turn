// What the window measures about itself for a report: closed panel names, counts and ratios, never text from the page. RMA-383.
import { clamp } from './math.ts';

export const PANELS = ['dashboard', 'settings', 'monitor_settings', 'whats_new', 'comment', 'note'] as const;

export type Panel = (typeof PANELS)[number];

export interface WindowReport {
  panel: Panel;
  font_px: number;
  console_errors: number;
  stream_reconnects: number;
  stream_last_event_minutes?: number;
  api_failures: number[];
  scroll: Partial<Record<'your_move' | 'waiting' | 'feed', number>>;
}

interface Layers {
  settings: boolean;
  monitor: boolean;
  whatsNew: boolean;
  modal: unknown;
  note: string;
}

interface Box {
  clientHeight: number;
  scrollHeight: number;
}

interface WindowEnv {
  layers: Layers;
  fontPx: number;
  consoleErrors: number;
  reconnects: number;
  lastEventAt: number;
  now: number;
  apiFailures: number[];
  boxes: Partial<Record<keyof WindowReport['scroll'], Box | null>>;
}

const MAX_FAILURES = 10;
const MINUTE = 60000;
let failures: number[] = [];

/** Remembers the HTTP status of a refused API call; only the last ten are kept. */
export const trackApiFailure = (status: number) => {
  failures = [...failures, status].slice(-MAX_FAILURES);
};

/** The statuses of the last refused API calls, oldest first. */
export const recentApiFailures = (): number[] => failures;

/** The view under the Report sheet, by the layer that is open. */
export const panelUnder = (layers: Layers): Panel => {
  if (layers.settings) {
    return 'settings';
  }
  if (layers.monitor) {
    return 'monitor_settings';
  }
  if (layers.whatsNew) {
    return 'whats_new';
  }
  if (layers.modal) {
    return 'comment';
  }
  return layers.note ? 'note' : 'dashboard';
};

/** The share of a list in view, as a whole percent. */
export const visibleShare = (box: Box | null | undefined): number | undefined =>
  box && box.scrollHeight > 0 ? clamp(Math.round((box.clientHeight / box.scrollHeight) * 100), 0, 100) : undefined;

/** The window's snapshot for a report, taken when the Report sheet opens. */
export const describeWindow = (env: WindowEnv): WindowReport => ({
  panel: panelUnder(env.layers),
  font_px: env.fontPx,
  console_errors: env.consoleErrors,
  stream_reconnects: Math.max(0, env.reconnects - 1),
  ...(env.lastEventAt ? { stream_last_event_minutes: Math.floor((env.now - env.lastEventAt) / MINUTE) } : {}),
  api_failures: env.apiFailures,
  scroll: Object.fromEntries(
    Object.entries(env.boxes).flatMap(([panel, box]) => {
      const share = visibleShare(box);
      return share === undefined ? [] : [[panel, share]];
    }),
  ),
});

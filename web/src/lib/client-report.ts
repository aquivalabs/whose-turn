import { browserOf, type BrowserInfo } from './browser.ts';

interface Env {
  navigator: Parameters<typeof browserOf>[0] & { language: string };
  screen: { width: number; height: number };
  devicePixelRatio: number;
  innerWidth: number;
  innerHeight: number;
  dark: boolean;
  mode: 'app' | 'tab';
}

export interface ClientReport {
  browser: BrowserInfo | null;
  display: { width: number; height: number; scale: number; viewport: [number, number] };
  locale: string;
  timezone: string;
  theme: 'light' | 'dark';
  mode: 'app' | 'tab';
}

/** What the window reports about itself in a bug report; no address, no raw user agent. */
export const describeClient = (env: Env): ClientReport => ({
  browser: browserOf(env.navigator),
  display: {
    width: env.screen.width,
    height: env.screen.height,
    scale: env.devicePixelRatio,
    viewport: [env.innerWidth, env.innerHeight],
  },
  locale: env.navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  theme: env.dark ? 'dark' : 'light',
  mode: env.mode,
});

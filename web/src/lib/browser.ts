// The browser's name and major version for a report, never the raw user-agent string. RMA-291.
export interface BrowserInfo {
  name: string;
  version: string;
}
interface Brand {
  brand: string;
  version: string;
}
interface Nav {
  userAgent: string;
  userAgentData?: { brands?: Brand[] };
}

const BRANDS: Record<string, string> = {
  'Google Chrome': 'Chrome',
  'Microsoft Edge': 'Edge',
  Opera: 'Opera',
  Brave: 'Brave',
  Chromium: 'Chromium',
};
const AGENTS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^]*Safari/, 'Safari'],
];

const major = (version: string): string => /^\d{1,6}/.exec(version)?.[0] ?? '';

/** Brands first (a real one over "Not A Brand" and over Chromium), the user-agent string as fallback; null when neither gives a version. */
export const browserOf = (nav: Nav): BrowserInfo | null => {
  const real = (nav.userAgentData?.brands ?? []).filter((item) => !/^not.?a.?brand/i.test(item.brand.replace(/[^\w ]/g, '')));
  const pick = real.find((item) => item.brand !== 'Chromium') ?? real[0];
  if (pick && major(pick.version)) {
    return { name: BRANDS[pick.brand] ?? 'Other', version: major(pick.version) };
  }
  for (const [pattern, name] of AGENTS) {
    const match = pattern.exec(nav.userAgent);
    if (match) {
      return { name, version: match[1]! };
    }
  }
  return null;
};

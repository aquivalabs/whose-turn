/** Derives a Material-3-style light and dark scheme from one seed colour, as the CSS variables style.css defines. RMA-93. */

const HEX = /^#[0-9a-f]{6}$/i;

export const isHex = (value) => typeof value === 'string' && HEX.test(value);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);

const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
const rgbToHex = (rgb) => `#${rgb.map((channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;

const rgbToOklch = (rgb) => {
  const [red, green, blue] = rgb.map(toLinear);
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return { lightness, chroma: Math.hypot(a, b), hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
};

const oklchToLinear = ({ lightness, chroma, hue }) => {
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
};

const inGamut = (linear) => linear.every((channel) => channel >= -0.0001 && channel <= 1.0001);

const oklchToRgb = (colour) => {
  let low = 0;
  let high = colour.chroma;
  if (inGamut(oklchToLinear(colour))) {
    return oklchToLinear(colour).map(fromLinear);
  }
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (inGamut(oklchToLinear({ ...colour, chroma: middle }))) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return oklchToLinear({ ...colour, chroma: low }).map(fromLinear);
};

const tone = (hue, chroma, lightness) => rgbToHex(oklchToRgb({ hue, chroma, lightness: clamp(lightness, 0, 1) }));

const GOLDEN_ANGLE = 137.508;

const DERIVED_CHROMA = 0.13;
const DERIVED_LIGHTNESS = 0.5;
const MIN_HUE_GAP = 40;

const hueOfId = (id) => {
  let hash = 2166136261;
  for (const char of String(id)) {
    hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  }
  return (hash * GOLDEN_ANGLE) % 360;
};

/**
 * Seeds for the workspaces that set none, keyed by id; each hue keeps MIN_HUE_GAP from the taken ones.
 * Pass the workspace entries in list order. RMA-212.
 */
export const derivedSeeds = (entries) => {
  const taken = entries.filter((entry) => isHex(entry.seed)).map((entry) => rgbToOklch(hexToRgb(entry.seed)).hue);
  const seeds = {};
  for (const entry of entries) {
    if (isHex(entry.seed)) {
      continue;
    }
    let hue = hueOfId(entry.id);
    for (let step = 0; step < entries.length && taken.some((other) => Math.abs(hueDistance(hue, other)) < MIN_HUE_GAP); step += 1) {
      hue = (hue + GOLDEN_ANGLE) % 360;
    }
    taken.push(hue);
    seeds[entry.id] = tone(hue, DERIVED_CHROMA, DERIVED_LIGHTNESS);
  }
  return seeds;
};

/** The seed one workspace gets on its own, with nothing else to keep clear of. */
export const derivedSeed = (id) => derivedSeeds([{ id }])[id];

const luminance = (hex) => {
  const [red, green, blue] = hexToRgb(hex).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const contrastRatio = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

const MIN_CONTRAST = 4.5;

const readable = (ink, ground) => {
  const towardLight = ground.lightness < 0.6;
  const step = towardLight ? 0.01 : -0.01;
  let inkLightness = ink.lightness;
  let groundLightness = ground.lightness;
  const hexes = () => [tone(ink.hue, ink.chroma, inkLightness), tone(ground.hue, ground.chroma, groundLightness)];
  for (let attempt = 0; attempt < 200 && contrastRatio(...hexes()) < MIN_CONTRAST; attempt += 1) {
    if (inkLightness > 0 && inkLightness < 1) {
      inkLightness = clamp(inkLightness + step, 0, 1);
    } else {
      groundLightness = clamp(groundLightness - step, 0, 1);
    }
  }
  const [inkHex, groundHex] = hexes();
  return { ink: inkHex, ground: groundHex };
};

const channels = (hex) => hexToRgb(hex).map((channel) => Math.round(channel * 255)).join(', ');
const rgba = (hex, alpha) => `rgba(${channels(hex)}, ${alpha})`;

const LADDERS = {
  light: {
    neutralChroma: 0.012,
    accent: [0.55, 0.17], onAccent: [1, 0], link: [0.48, 0.14], tint: [0.94, 0.03], onTint: [0.3, 0.1],
    tertiary: [0.92, 0.06], onTertiary: [0.32, 0.1],
    state: { ground: [0.93, 0.06], ink: [0.4, 0.13] },
    warn: { ground: [0.93, 0.07, 80], ink: [0.45, 0.1, 60] },
    error: [0.5, 0.19],
    surface: 0.985, sLow: 1, s: 0.965, sHigh: 0.935, sHighest: 0.915,
    onSurface: 0.22, onSurfaceVariant: 0.42, outline: 0.58, outlineVariant: 0.87, secondary: [0.92, 0.26],
    glass: 0.995,
    blobs: [[0.64, 0.2, 0.6], [0.74, 0.17, 0.5], [0.86, 0.14, 0.45]],
  },
  dark: {
    neutralChroma: 0.016,
    accent: [0.7, 0.15], onAccent: [0.2, 0.02], link: [0.8, 0.11], tint: [0.3, 0.04], onTint: [0.9, 0.05],
    tertiary: [0.32, 0.07], onTertiary: [0.9, 0.06],
    state: { ground: [0.32, 0.07], ink: [0.88, 0.1] },
    warn: { ground: [0.33, 0.07, 75], ink: [0.87, 0.1, 80] },
    error: [0.8, 0.12],
    surface: 0.17, sLow: 0.215, s: 0.23, sHigh: 0.27, sHighest: 0.31,
    onSurface: 0.94, onSurfaceVariant: 0.8, outline: 0.65, outlineVariant: 0.35, secondary: [0.33, 0.9],
    glass: 0.235,
    blobs: [[0.45, 0.13, 0.55], [0.58, 0.13, 0.28], [0.72, 0.11, 0.14]],
  },
};

/** The state hues: fixed, never moved by a seed. RMA-451. */
const STATE_HUES = { error: 25, warn: 75, success: 150, merged: 300 };
const CLEARANCE = { error: 35, success: 35, warn: 25, merged: 25 };
const MAX_SHIFT = 50;

const hueDistance = (from, to) => ((to - from + 540) % 360) - 180;
const crowding = (hue) => Object.entries(STATE_HUES).filter(([name, anchor]) => Math.abs(hueDistance(hue, anchor)) < CLEARANCE[name]);
const nearestState = (hue) => Math.min(...Object.values(STATE_HUES).map((anchor) => Math.abs(hueDistance(hue, anchor))));

const clearedHue = (hue) => {
  if (!crowding(hue).length) {
    return hue;
  }
  for (let shift = 1; shift <= MAX_SHIFT; shift += 1) {
    for (const candidate of [(hue + shift) % 360, (hue - shift + 360) % 360]) {
      if (!crowding(candidate).length) {
        return candidate;
      }
    }
  }
  return hue;
};

const scheme = (ladder, hues) => {
  const pair = (hue, [inkL, inkC], [groundL, groundC]) => readable({ hue, chroma: inkC, lightness: inkL }, { hue, chroma: groundC, lightness: groundL });
  const neutral = (lightness) => tone(hues.accent, ladder.neutralChroma, lightness);
  const accent = pair(hues.accent, ladder.onAccent, ladder.accent);
  const tint = pair(hues.accent, ladder.onTint, ladder.tint);
  const tertiary = pair(hues.tertiary, ladder.onTertiary, ladder.tertiary);
  const statePair = (hue) => pair(hue, ladder.state.ink, ladder.state.ground);
  const success = statePair(STATE_HUES.success);
  const merged = statePair(STATE_HUES.merged);
  const errorContainer = statePair(STATE_HUES.error);
  const warn = readable({ hue: ladder.warn.ink[2], chroma: ladder.warn.ink[1], lightness: ladder.warn.ink[0] }, { hue: ladder.warn.ground[2], chroma: ladder.warn.ground[1], lightness: ladder.warn.ground[0] });
  const surface = readable({ hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.onSurface }, { hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.surface });
  const surfaceVariant = readable({ hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.onSurfaceVariant }, { hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.sLow });
  const secondary = readable({ hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.secondary[1] }, { hue: hues.accent, chroma: ladder.neutralChroma, lightness: ladder.secondary[0] });
  const blobHues = [hues.seed, hues.blend, hues.tertiary];
  return {
    '--md-primary': accent.ground, '--md-on-primary': accent.ink,
    '--md-link': tone(hues.accent, ladder.link[1], ladder.link[0]),
    '--md-primary-container': tint.ground, '--md-on-primary-container': tint.ink,
    '--md-secondary-container': secondary.ground, '--md-on-secondary-container': secondary.ink,
    '--md-tertiary-container': tertiary.ground, '--md-on-tertiary-container': tertiary.ink,
    '--md-success-container': success.ground, '--md-on-success-container': success.ink,
    '--md-merged-container': merged.ground, '--md-on-merged-container': merged.ink,
    '--md-warn-container': warn.ground, '--md-on-warn-container': warn.ink,
    '--md-label-container': tertiary.ground, '--md-on-label-container': tertiary.ink,
    '--md-surface': surface.ground, '--md-s-low': surfaceVariant.ground, '--md-s': neutral(ladder.s),
    '--md-s-high': neutral(ladder.sHigh), '--md-s-highest': neutral(ladder.sHighest),
    '--md-on-surface': surface.ink, '--md-on-surface-variant': surfaceVariant.ink,
    '--md-outline': neutral(ladder.outline), '--md-outline-variant': neutral(ladder.outlineVariant),
    '--md-error': tone(STATE_HUES.error, ladder.error[1], ladder.error[0]),
    '--md-error-container': errorContainer.ground, '--md-on-error-container': errorContainer.ink,
    '--md-state': channels(surface.ink),
    '--glass': channels(neutral(ladder.glass)),
    '--move': accent.ground,
    '--ai-ink': tone(hues.tertiary, ladder.link[1], ladder.link[0]),
    '--new': tertiary.ink,
    '--new-bg': rgba(tertiary.ink, 0.12),
    '--new-edge': rgba(tertiary.ink, 0.24),
    '--new-glow': rgba(tertiary.ink, 0.35),
    '--new-ink': tertiary.ground,
    ...Object.fromEntries(ladder.blobs.map(([lightness, chroma, alpha], index) => [`--blob-${index + 1}`, rgba(tone(blobHues[index], chroma, lightness), alpha)])),
  };
};

/** The light and dark variable maps for a seed hex and an optional accent hex that sets the tertiary hue. */
export const paletteFrom = (seedHex, accentHex) => {
  if (!isHex(seedHex)) {
    return null;
  }
  const seed = rgbToOklch(hexToRgb(seedHex));
  const accent = clearedHue(seed.hue);
  const userAccent = isHex(accentHex) ? clearedHue(rgbToOklch(hexToRgb(accentHex)).hue) : null;
  const sides = [(accent + 120) % 360, (accent + 240) % 360];
  const tertiary = userAccent ?? sides.sort((first, second) => nearestState(second) - nearestState(first))[0];
  const hues = { seed: seed.hue, accent, tertiary, blend: (seed.hue + hueDistance(seed.hue, tertiary) / 2 + 360) % 360 };
  return { light: scheme(LADDERS.light, hues), dark: scheme(LADDERS.dark, hues) };
};

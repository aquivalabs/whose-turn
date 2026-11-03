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
    primary: [0.5, 0.15], onPrimary: [1, 0], primaryContainer: [0.92, 0.05], onPrimaryContainer: [0.26, 0.09],
    secondaryContainer: [0.92, 0.025], onSecondaryContainer: [0.26, 0.03],
    tertiaryContainer: [0.92, 0.05], onTertiaryContainer: [0.26, 0.07],
    surface: [0.985, 0.006], sLow: [1, 0], s: [0.965, 0.008], sHigh: [0.935, 0.01], sHighest: [0.915, 0.012],
    onSurface: [0.22, 0.01], onSurfaceVariant: [0.42, 0.018], outline: [0.58, 0.018], outlineVariant: [0.87, 0.014],
    glass: [0.995, 0.004],
    blobs: [[0.52, 0.16, 0.3], [0.62, 0.14, 0.22], [0.78, 0.12, 0.16]],
    error: [0.5, 0.19], errorContainer: [0.92, 0.05], onErrorContainer: [0.22, 0.1],
  },
  dark: {
    primary: [0.8, 0.1], onPrimary: [0.3, 0.08], primaryContainer: [0.38, 0.09], onPrimaryContainer: [0.92, 0.04],
    secondaryContainer: [0.37, 0.03], onSecondaryContainer: [0.92, 0.025],
    tertiaryContainer: [0.37, 0.06], onTertiaryContainer: [0.92, 0.05],
    surface: [0.17, 0.01], sLow: [0.215, 0.011], s: [0.23, 0.011], sHigh: [0.27, 0.012], sHighest: [0.31, 0.012],
    onSurface: [0.92, 0.008], onSurfaceVariant: [0.83, 0.015], outline: [0.65, 0.016], outlineVariant: [0.35, 0.014],
    glass: [0.235, 0.016],
    blobs: [[0.45, 0.13, 0.55], [0.58, 0.13, 0.28], [0.72, 0.11, 0.14]],
    error: [0.8, 0.12], errorContainer: [0.38, 0.12], onErrorContainer: [0.92, 0.05],
  },
};

const ERROR_HUE = 27;
const ERROR_CLEARANCE = 45;
const COOLEST_ERROR_HUE = 12;
const CROWDED_ERROR = { light: { lightness: -0.1, chroma: 0.03 }, dark: { lightness: -0.14, chroma: 0.09 } };

const hueDistance = (from, to) => ((to - from + 540) % 360) - 180;

const scheme = (ladder, hues, crowding) => {
  const at = (hue, [lightness, chroma]) => ({ hue, chroma: Math.min(chroma, hues.chroma * 1.4 + 0.004), lightness });
  const pair = (hue, inkStep, groundStep) => readable(at(hue, inkStep), at(hue, groundStep));
  const primary = pair(hues.primary, ladder.onPrimary, ladder.primary);
  const primaryContainer = pair(hues.primary, ladder.onPrimaryContainer, ladder.primaryContainer);
  const secondaryContainer = pair(hues.primary, ladder.onSecondaryContainer, ladder.secondaryContainer);
  const tertiaryContainer = pair(hues.tertiary, ladder.onTertiaryContainer, ladder.tertiaryContainer);
  const surface = pair(hues.primary, ladder.onSurface, ladder.surface);
  const surfaceVariant = pair(hues.primary, ladder.onSurfaceVariant, ladder.sLow);
  const hueOf = ([lightness, chroma]) => ({ hue: hues.error, chroma, lightness });
  const [errorLightness, errorChroma] = ladder.error;
  const crowd = hues.crowded ? crowding : { lightness: 0, chroma: 0 };
  const error = tone(hues.error, errorChroma + crowd.chroma, errorLightness + crowd.lightness);
  const errorContainer = readable(hueOf(ladder.onErrorContainer), hueOf(ladder.errorContainer));
  const plain = (step) => tone(hues.primary, at(hues.primary, step).chroma, step[0]);
  const blobHues = [hues.primary, hues.blend, hues.tertiary];
  return {
    '--md-primary': primary.ground, '--md-on-primary': primary.ink,
    '--md-primary-container': primaryContainer.ground, '--md-on-primary-container': primaryContainer.ink,
    '--md-secondary-container': secondaryContainer.ground, '--md-on-secondary-container': secondaryContainer.ink,
    '--md-tertiary-container': tertiaryContainer.ground, '--md-on-tertiary-container': tertiaryContainer.ink,
    '--md-surface': surface.ground, '--md-s-low': surfaceVariant.ground, '--md-s': plain(ladder.s),
    '--md-s-high': plain(ladder.sHigh), '--md-s-highest': plain(ladder.sHighest),
    '--md-on-surface': surface.ink, '--md-on-surface-variant': surfaceVariant.ink,
    '--md-outline': plain(ladder.outline), '--md-outline-variant': plain(ladder.outlineVariant),
    '--md-error': error, '--md-error-container': errorContainer.ground, '--md-on-error-container': errorContainer.ink,
    '--md-state': channels(surface.ink),
    '--glass': channels(plain(ladder.glass)),
    ...Object.fromEntries(ladder.blobs.map(([lightness, chroma, alpha], index) => [`--blob-${index + 1}`, rgba(tone(blobHues[index], chroma, lightness), alpha)])),
  };
};

/** The error hue: red, turned cooler to crimson once the primary hue would sit within the clearance of it. */
const errorHueFor = (primaryHue) => (Math.abs(hueDistance(primaryHue, ERROR_HUE)) < ERROR_CLEARANCE ? (Math.max(hueDistance(ERROR_HUE, primaryHue) + ERROR_HUE - ERROR_CLEARANCE, COOLEST_ERROR_HUE) + 360) % 360 : ERROR_HUE);

/** The light and dark variable maps for a seed hex and an optional accent hex that sets the tertiary hue. */
export const paletteFrom = (seedHex, accentHex) => {
  if (!isHex(seedHex)) {
    return null;
  }
  const seed = rgbToOklch(hexToRgb(seedHex));
  const accent = isHex(accentHex) ? rgbToOklch(hexToRgb(accentHex)) : null;
  const tertiary = accent ? accent.hue : (seed.hue + 80) % 360;
  const hues = {
    primary: seed.hue,
    error: errorHueFor(seed.hue),
    crowded: Math.abs(hueDistance(seed.hue, ERROR_HUE)) < ERROR_CLEARANCE,
    tertiary,
    blend: (seed.hue + hueDistance(seed.hue, tertiary) / 2 + 360) % 360,
    chroma: Math.max(seed.chroma, 0.02),
  };
  return { light: scheme(LADDERS.light, hues, CROWDED_ERROR.light), dark: scheme(LADDERS.dark, hues, CROWDED_ERROR.dark) };
};

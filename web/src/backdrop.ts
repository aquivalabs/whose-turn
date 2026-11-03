/** Backdrop under the glass: one animal per workspace drawn in dots from a seeded random. `window.whoseTurnBackdrop.show({ workspace, seed?, species?, pose? })` picks it; species live in species/*.json (docs/mechanisms/species-dsl.md); RMA-93, RMA-94, RMA-96. */
import { watch } from 'vue';
import { useDebounceFn, useEventListener } from '@vueuse/core';
import { mulberry32, randomTools } from './lib/random.ts';
import type { RandomTools } from './lib/random.ts';
import { buildSpecies, speciesNames } from './lib/species.ts';
import { MASK_SIZE, MASK_SPAN, MASK_PER_UNIT, paintMask } from './lib/silhouette.ts';
import type { MaskView } from './lib/silhouette.ts';
import { registry } from './species/index.ts';
import { clamp, lerp } from './lib/math.ts';
import { dark, isDark } from './scheme.ts';

type Rgb = number[];
interface Inks {
  core: Rgb;
  rim: Rgb;
  strength: number;
}
interface Plan {
  size: number;
  right: boolean;
  bottom: boolean;
  overflowX: number;
  overflowY: number;
}
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
interface Layout {
  size: number;
  centerX: number;
  centerY: number;
}
interface Field {
  inside: Uint8Array;
  depth: Float32Array;
  gap: Float32Array;
}
interface Dot {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  tint: number;
}
interface BackdropRequest {
  workspace?: string;
  seed?: number;
  species?: string;
  pose?: string;
}
interface BackdropCurrent {
  workspace: string;
  species: string;
  seed: number;
}

/** The console and module hook: `show` picks the animal, `repaint` redraws it, `seeded` is the random the icons share. */
export interface BackdropApi {
  species: string[];
  seeded: typeof mulberry32;
  readonly current: BackdropCurrent;
  show: (request?: BackdropRequest) => BackdropCurrent;
  repaint: () => string | undefined;
}

const SPECIES_NAMES = speciesNames(registry);

const chamferDistance = (inside: Uint8Array, wanted: number) => {
  const size = MASK_SIZE;
  const distance = new Float32Array(size * size);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = inside[index] === wanted ? 1e6 : 0;
  }
  const relax = (index: number, neighbour: number, cost: number) => {
    if (distance[neighbour] + cost < distance[index]) {
      distance[index] = distance[neighbour] + cost;
    }
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (x > 0) {
        relax(index, index - 1, 1);
      }
      if (y > 0) {
        relax(index, index - size, 1);
      }
      if (x > 0 && y > 0) {
        relax(index, index - size - 1, Math.SQRT2);
      }
      if (x < size - 1 && y > 0) {
        relax(index, index - size + 1, Math.SQRT2);
      }
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const index = y * size + x;
      if (x < size - 1) {
        relax(index, index + 1, 1);
      }
      if (y < size - 1) {
        relax(index, index + size, 1);
      }
      if (x < size - 1 && y < size - 1) {
        relax(index, index + size + 1, Math.SQRT2);
      }
      if (x > 0 && y < size - 1) {
        relax(index, index + size - 1, Math.SQRT2);
      }
    }
  }
  return distance;
};

const parseColour = (value: string): Rgb | null => {
  const text = String(value || '').trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16));
  }
  const numbers = text.match(/[\d.]+/g);
  return numbers && numbers.length >= 3 ? numbers.slice(0, 3).map(Number) : null;
};

const readInks = (host: Element): Inks => {
  const style = getComputedStyle(host);
  const primary = parseColour(style.getPropertyValue('--md-primary')) || [44, 86, 151];
  const deep = parseColour(style.getPropertyValue('--md-on-primary-container')) || primary;
  return {
    core: isDark() ? primary : primary.map((channel, index) => lerp(channel, deep[index], 0.35)),
    rim: parseColour(style.getPropertyValue('--blob-3')) || [23, 223, 220],
    strength: isDark() ? 0.9 : 1,
  };
};

const planLayout = (random: RandomTools, width: number, height: number): Plan => ({
  size: random.range(0.85, 1.05) * Math.min(width, height),
  right: random.chance(0.4),
  bottom: random.chance(0.7),
  overflowX: random.range(-0.02, 0.06),
  overflowY: random.range(-0.02, 0.04),
});

const maskBounds = (inside: Uint8Array): Bounds => {
  const bounds = { minX: MASK_SIZE, maxX: 0, minY: MASK_SIZE, maxY: 0 };
  for (let index = 0; index < inside.length; index += 1) {
    if (inside[index]) {
      const x = index % MASK_SIZE;
      const y = Math.floor(index / MASK_SIZE);
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  const toUnits = (maskPixel: number) => (maskPixel - MASK_SIZE / 2) / MASK_PER_UNIT;
  return {
    minX: toUnits(bounds.minX),
    maxX: toUnits(bounds.maxX),
    minY: toUnits(bounds.minY),
    maxY: toUnits(bounds.maxY),
  };
};

const placeLayout = (plan: Plan, bounds: Bounds, width: number, height: number): Layout => {
  const widthUnits = bounds.maxX - bounds.minX;
  const heightUnits = bounds.maxY - bounds.minY;
  const size = Math.min(
    plan.size,
    (2 * width * 0.95) / widthUnits,
    (2 * height * 0.98) / heightUnits,
  );
  const unit = size / 2;
  const marginX = -plan.overflowX * size;
  const marginY = -plan.overflowY * size;
  return {
    size,
    centerX: plan.right ? width - marginX - bounds.maxX * unit : marginX - bounds.minX * unit,
    centerY: plan.bottom ? height - marginY - bounds.maxY * unit : marginY - bounds.minY * unit,
  };
};

const mixInk = (inks: Inks, amount: number, alpha: number) => {
  const channels = inks.core.map((channel, index) =>
    Math.round(lerp(channel, inks.rim[index], amount)),
  );
  return 'rgba(' + channels.join(',') + ',' + alpha.toFixed(3) + ')';
};

const dotsFor = (random: RandomTools, layout: Layout, field: Field) => {
  const dots: Dot[] = [];
  const spacing = layout.size / 62;
  const screenPerMask = layout.size / 2 / MASK_PER_UNIT;
  const reach = (layout.size * MASK_SPAN) / 4;
  const rowHeight = spacing * 0.866;
  for (
    let row = 0, y = layout.centerY - reach;
    y < layout.centerY + reach;
    row += 1, y += rowHeight
  ) {
    for (
      let x = layout.centerX - reach + ((row % 2) * spacing) / 2;
      x < layout.centerX + reach;
      x += spacing
    ) {
      const dotX = x + random.range(-0.3, 0.3) * spacing;
      const dotY = y + random.range(-0.3, 0.3) * spacing;
      const maskX = Math.floor((dotX - layout.centerX) / screenPerMask + MASK_SIZE / 2);
      const maskY = Math.floor((dotY - layout.centerY) / screenPerMask + MASK_SIZE / 2);
      if (maskX < 0 || maskY < 0 || maskX >= MASK_SIZE || maskY >= MASK_SIZE) {
        continue;
      }
      const cell = maskY * MASK_SIZE + maskX;
      const roll = random.next();
      const sizeJitter = random.range(0.75, 1.25);
      const inkJitter = random.range(-0.15, 0.15);
      if (field.inside[cell]) {
        const depthUnits = field.depth[cell] / MASK_PER_UNIT;
        const rim = clamp(depthUnits / 0.035);
        const core = clamp(depthUnits / 0.3);
        if (roll > 0.5 + 0.5 * rim) {
          continue;
        }
        dots.push({
          x: dotX,
          y: dotY,
          radius: spacing * 0.5 * (0.45 + 0.55 * rim) * (0.95 + 0.3 * core) * sizeJitter,
          alpha: 0.5 + 0.25 * rim + 0.25 * core,
          tint: clamp(0.65 - 0.65 * core + inkJitter),
        });
      } else {
        const gapUnits = field.gap[cell] / MASK_PER_UNIT;
        if (roll > 0.14 * Math.exp(-gapUnits / 0.05) + 0.004) {
          continue;
        }
        dots.push({
          x: dotX,
          y: dotY,
          radius: spacing * random.range(0.1, 0.24),
          alpha: 0.35,
          tint: clamp(0.8 + inkJitter),
        });
      }
    }
  }
  return dots;
};

const host = () => document.getElementById('wt');
const canvas = () => document.getElementById('backdrop') as HTMLCanvasElement | null;

const randomSeed = () => Math.floor(Math.random() * 4294967296);
const sessionSeeds: Record<string, number> = {};
const current: {
  workspace: string;
  seed: number;
  species: string;
  wantedSpecies: string;
  wantedPose: string;
  built: { key: string; dots: Dot[] } | null;
} = {
  workspace: '',
  seed: randomSeed(),
  species: '',
  wantedSpecies: '',
  wantedPose: '',
  built: null,
};

const build = (width: number, height: number) => {
  const random = randomTools(current.seed);
  const rolled = SPECIES_NAMES[Math.floor(random.next() * SPECIES_NAMES.length)];
  current.species = SPECIES_NAMES.includes(current.wantedSpecies) ? current.wantedSpecies : rolled;
  const plan = planLayout(random, width, height);
  const view: MaskView = {
    facing: plan.right ? -1 : 1,
    tilt: random.range(-0.07, 0.07),
    stretchX: random.range(0.92, 1.08),
    stretchY: random.range(0.92, 1.08),
  };
  if (random.chance(0.25)) {
    view.facing = -view.facing;
  }
  const inside = paintMask(
    buildSpecies(registry, current.species, random, { pose: current.wantedPose }).shapes,
    view,
  );
  const field: Field = {
    inside,
    depth: chamferDistance(inside, 1),
    gap: chamferDistance(inside, 0),
  };
  const layout = placeLayout(plan, maskBounds(inside), width, height);
  return {
    key: current.seed + ':' + current.species + ':' + width + 'x' + height,
    dots: dotsFor(random, layout, field),
  };
};

const paint = () => {
  const target = canvas();
  if (!target) {
    return;
  }
  const width = target.clientWidth;
  const height = target.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  const wantedWidth = Math.round(width * pixelRatio);
  const wantedHeight = Math.round(height * pixelRatio);
  if (target.width !== wantedWidth || target.height !== wantedHeight) {
    target.width = wantedWidth;
    target.height = wantedHeight;
  }
  const context = target.getContext('2d');
  if (!context) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!width || !height) {
    return;
  }
  const key = current.seed + ':' + (current.wantedSpecies || '?') + ':' + width + 'x' + height;
  if (
    !current.built ||
    current.built.key.split(':')[0] !== String(current.seed) ||
    !current.built.key.endsWith(width + 'x' + height) ||
    (current.wantedSpecies && current.species !== current.wantedSpecies)
  ) {
    current.built = build(width, height);
  }
  const hostElement = host();
  if (!hostElement) {
    return key;
  }
  const inks = readInks(hostElement);
  current.built.dots.forEach((dot) => {
    context.fillStyle = mixInk(inks, dot.tint, dot.alpha * inks.strength);
    context.beginPath();
    context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    context.fill();
  });
  return key;
};

window.whoseTurnBackdrop = {
  species: SPECIES_NAMES.slice(),
  seeded: mulberry32,
  get current() {
    return { workspace: current.workspace, species: current.species, seed: current.seed };
  },
  show: (request?: BackdropRequest) => {
    const wanted = request || {};
    const workspace = String(wanted.workspace || '');
    if (!sessionSeeds[workspace]) {
      sessionSeeds[workspace] = randomSeed();
    }
    const seed = wanted.seed !== undefined ? Number(wanted.seed) >>> 0 : sessionSeeds[workspace];
    sessionSeeds[workspace] = seed;
    const species = wanted.species && SPECIES_NAMES.includes(wanted.species) ? wanted.species : '';
    const pose = String(wanted.pose || '');
    if (
      workspace === current.workspace &&
      seed === current.seed &&
      species === current.wantedSpecies &&
      pose === current.wantedPose &&
      current.built
    ) {
      return window.whoseTurnBackdrop.current;
    }
    current.workspace = workspace;
    current.seed = seed;
    current.wantedSpecies = species;
    current.wantedPose = pose;
    current.built = null;
    paint();
    return window.whoseTurnBackdrop.current;
  },
  repaint: paint,
};

watch(dark, paint);
useEventListener(window, 'resize', useDebounceFn(paint, 200));

// ES exports next to the window global, so modules import instead of reaching through window.
export const { show, repaint, seeded } = window.whoseTurnBackdrop;

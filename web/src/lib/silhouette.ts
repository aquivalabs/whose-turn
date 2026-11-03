/** Draws species shapes (ellipse, polygon, blob, tube, cut) onto a canvas; the backdrop turns the result into a dot mask, the sheet shows it as is. */
import { clamp, lerp } from './math.ts';
import type { Point, Shape } from './species.ts';

/** How the mask frame is turned before the shapes are painted: mirrored, stretched and tilted. */
export interface MaskView {
  facing: number;
  stretchX: number;
  stretchY: number;
  tilt: number;
}

export const MASK_SIZE = 256;
export const MASK_SPAN = 2.6;
export const MASK_PER_UNIT = MASK_SIZE / MASK_SPAN;

const catmullRom = (
  previous: Point,
  from: Point,
  to: Point,
  after: Point,
  amount: number,
): Point => {
  const squared = amount * amount;
  const cubed = squared * amount;
  const along = (axis: 0 | 1) =>
    0.5 *
    (2 * from[axis] +
      (-previous[axis] + to[axis]) * amount +
      (2 * previous[axis] - 5 * from[axis] + 4 * to[axis] - after[axis]) * squared +
      (-previous[axis] + 3 * from[axis] - 3 * to[axis] + after[axis]) * cubed);
  return [along(0), along(1)];
};

const sampleSpline = (points: Point[], closed: boolean, perSegment: number) => {
  const count = points.length;
  const at = (index: number) =>
    closed ? points[(index + count) % count] : points[clamp(index, 0, count - 1)];
  const segments = closed ? count : count - 1;
  const samples: Point[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    for (let step = 0; step < perSegment; step += 1) {
      samples.push(
        catmullRom(
          at(segment - 1),
          at(segment),
          at(segment + 1),
          at(segment + 2),
          step / perSegment,
        ),
      );
    }
  }
  if (!closed) {
    samples.push(points[count - 1]);
  }
  return samples;
};

const radiusAlong = (radii: number[], progress: number) => {
  if (radii.length === 1) {
    return radii[0];
  }
  const position = progress * (radii.length - 1);
  const index = Math.min(radii.length - 2, Math.floor(position));
  return lerp(radii[index], radii[index + 1], position - index);
};

const paintShape = (context: CanvasRenderingContext2D, shape: Shape) => {
  context.globalCompositeOperation = shape.cut ? 'destination-out' : 'source-over';
  context.beginPath();
  if (shape.kind === 'ellipse') {
    context.ellipse(shape.x, shape.y, shape.radiusX, shape.radiusY, shape.angle, 0, Math.PI * 2);
    context.fill();
  } else if (shape.kind === 'polygon' || shape.kind === 'blob') {
    const outline = shape.kind === 'blob' ? sampleSpline(shape.points, true, 12) : shape.points;
    outline.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    context.closePath();
    context.fill();
  } else if (shape.kind === 'tube') {
    const samples = sampleSpline(shape.points, false, 24);
    samples.forEach(([x, y], index) => {
      const radius = radiusAlong(shape.radii, index / Math.max(1, samples.length - 1));
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    });
    context.fill();
  }
};

export const paintMask = (shapes: Shape[], view: MaskView) => {
  const mask = document.createElement('canvas');
  mask.width = MASK_SIZE;
  mask.height = MASK_SIZE;
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return new Uint8Array(MASK_SIZE * MASK_SIZE);
  }
  context.translate(MASK_SIZE / 2, MASK_SIZE / 2);
  context.scale(MASK_PER_UNIT * view.facing * view.stretchX, MASK_PER_UNIT * view.stretchY);
  context.rotate(view.tilt);
  context.fillStyle = '#000';
  shapes.forEach((shape) => paintShape(context, shape));
  const pixels = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
  const inside = new Uint8Array(MASK_SIZE * MASK_SIZE);
  for (let index = 0; index < inside.length; index += 1) {
    inside[index] = pixels[index * 4 + 3] > 127 ? 1 : 0;
  }
  return inside;
};

/** Fills the shapes in the mask frame (MASK_SPAN units across, origin in the middle) onto a square canvas of any size. */
export const paintSilhouette = (canvas: HTMLCanvasElement, shapes: Shape[], ink: string) => {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(canvas.width / MASK_SPAN, canvas.width / MASK_SPAN);
  context.fillStyle = ink;
  shapes.forEach((shape) => paintShape(context, shape));
  context.restore();
};

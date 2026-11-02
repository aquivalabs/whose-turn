import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildSpecies, resolveSpecies, poseWeights, speciesNames, posesOf } from '../web/src/lib/species.js';
import { randomTools } from '../web/src/lib/random.js';

const folder = new URL('../web/src/species/', import.meta.url);
const load = (directory) => readdirSync(directory).filter((file) => file.endsWith('.json'))
  .map((file) => [file.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(file, directory), 'utf8'))]);
const registry = Object.fromEntries([...load(folder), ...load(new URL('base/', folder))]);

const shapesOf = (spec, seed = 1, options) => buildSpecies({ test: spec }, 'test', randomTools(seed), options).shapes;
const firstX = (spec, seed) => shapesOf(spec, seed)[0].x;

test('expressions follow arithmetic precedence and read earlier lets', () => {
  const [shape] = shapesOf({ body: [{ let: { a: 2, b: 'a * 3 + 1' } }, { circle: ['b', '-(a + 1) * 2', 'min(b, 5) / 2'] }] });
  assert.deepEqual(shape, { kind: 'ellipse', x: 7, y: -6, radiusX: 2.5, radiusY: 2.5, angle: 0 });
});

test('random calls draw from the seed in reading order and repeat per seed', () => {
  const spec = { body: [{ let: { a: 'range(0, 1)', b: 'range(0, 1)' } }, { circle: ['a', 'b', 1] }] };
  const random = randomTools(7);
  const expected = [random.range(0, 1), random.range(0, 1)];
  const [shape] = shapesOf(spec, 7);
  assert.deepEqual([shape.x, shape.y], expected);
  assert.deepEqual(shapesOf(spec, 7), shapesOf(spec, 7));
  assert.notEqual(firstX({ body: [{ circle: ['range(0, 1)', 0, 1] }] }, 1), firstX({ body: [{ circle: ['range(0, 1)', 0, 1] }] }, 2));
});

test('if draws only in the branch taken', () => {
  const spec = { body: [{ let: { flag: 'chance(1)' } }, { circle: ['if(flag, 1, range(0, 1))', 0, 1] }, { circle: ['range(0, 1)', 0, 1] }] };
  const random = randomTools(3);
  random.chance(1);
  const [, second] = shapesOf(spec, 3);
  assert.equal(second.x, random.range(0, 1));
});

test('repeat walks a count or a list, exposes index, and scopes its lets', () => {
  const shapes = shapesOf({ body: [{ repeat: { values: [10, 20], as: 'v', body: [{ let: { w: 'v + index' } }, { circle: ['w', 0, 1] }] } }, { repeat: { count: 3, body: [{ circle: ['index', 0, 1] }] } }] });
  assert.deepEqual(shapes.map((shape) => shape.x), [10, 21, 0, 1, 2]);
  assert.throws(() => shapesOf({ body: [{ repeat: { count: 1, body: [{ let: { inner: 1 } }] } }, { circle: ['inner', 0, 1] }] }), /unknown name "inner"/);
});

test('map builds a point list, a value reads it by index, tubes take a number or a list of radii', () => {
  const shapes = shapesOf({ body: [
    { let: { line: { map: { count: 3, as: 'step', let: { x: 'step * 2' }, value: ['x', 'x + 1'] } } } },
    { tube: ['line[0]', 'line[2]'], radii: 0.1, cut: true },
    { polygon: 'line' },
  ] });
  assert.deepEqual(shapes[0], { kind: 'tube', points: [[0, 1], [4, 5]], radii: [0.1], cut: true });
  assert.deepEqual(shapes[1].points, [[0, 1], [2, 3], [4, 5]]);
});

test('use runs a def with its own arguments and lets see the caller', () => {
  const spec = { defs: { dot: [{ circle: ['at', 'base', 1] }] }, body: [{ let: { base: 5 } }, { use: 'dot', with: { at: 1 } }, { use: 'dot', with: { at: 'base' } }] };
  assert.deepEqual(shapesOf(spec).map((shape) => [shape.x, shape.y]), [[1, 5], [5, 5]]);
});

test('extends merges params in place, appends the body, and drops parts by name', () => {
  const rest = {
    base: { abstract: true, params: { size: 1, wide: 'size * 2' }, body: [{ circle: [0, 0, 'wide'], part: 'head' }, { circle: [1, 0, 1], part: 'tail' }] },
    child: { extends: 'base', params: { size: 5 }, drop: ['tail'], body: [{ circle: [9, 0, 1] }] },
  };
  const shapes = buildSpecies(rest, 'child', randomTools(1)).shapes;
  assert.deepEqual(shapes.map((shape) => [shape.x, shape.radiusX]), [[0, 10], [9, 1]]);
  assert.deepEqual(speciesNames(rest), ['child']);
  assert.throws(() => resolveSpecies({ loop: { extends: 'loop' } }, 'loop'), /extends itself/);
});

test('poses: weighted draw, forced pose, drop and params, weight 0 disables, none means no draw', () => {
  const spec = {
    params: { size: 1 },
    body: [{ circle: [0, 0, 'size'], part: 'body' }],
    poses: { small: { weight: 1 }, big: { weight: 3, params: { size: 9 }, drop: ['body'], body: [{ circle: [0, 0, 'size * 2'] }] }, off: { weight: 0 } },
  };
  const registryOne = { spec };
  assert.deepEqual(poseWeights(resolveSpecies(registryOne, 'spec')), [['small', 1], ['big', 3]]);
  assert.equal(buildSpecies(registryOne, 'spec', randomTools(1), { pose: 'big' }).shapes[0].radiusX, 18);
  assert.equal(buildSpecies(registryOne, 'spec', randomTools(1), { pose: 'off' }).pose, buildSpecies(registryOne, 'spec', randomTools(1)).pose);
  const seen = new Set(Array.from({ length: 40 }, (unused, seed) => buildSpecies(registryOne, 'spec', randomTools(seed)).pose));
  assert.deepEqual([...seen].sort(), ['big', 'small']);
  const noPose = { body: [{ circle: ['range(0, 1)', 0, 1] }] };
  assert.equal(shapesOf(noPose, 5)[0].x, randomTools(5).range(0, 1));
});

test('a two-pose species with weights 0.55 and 0.45 draws like chance(0.55)', () => {
  const twin = { poses: { first: { weight: 0.55 }, second: { weight: 0.45 } } };
  for (let seed = 1; seed <= 500; seed += 1) {
    const expected = randomTools(seed).chance(0.55) ? 'first' : 'second';
    assert.equal(buildSpecies({ twin }, 'twin', randomTools(seed)).pose, expected);
  }
});

test('errors name the species, and unknown keys, names and functions are refused', () => {
  assert.throws(() => shapesOf({ body: [{ circle: ['nope', 0, 1] }] }), /species "test".*unknown name "nope"/);
  assert.throws(() => shapesOf({ body: [{ circle: ['nope(1)', 0, 1] }] }), /unknown function "nope"/);
  assert.throws(() => shapesOf({ body: [{ circle: [0, 0, 1], colour: 'red' }] }), /unknown key "colour"/);
  assert.throws(() => shapesOf({ body: [{ spin: 1 }] }), /unknown statement/);
  assert.throws(() => shapesOf({ body: [{ use: 'missing' }] }), /unknown def "missing"/);
  assert.throws(() => shapesOf({ body: [{ circle: ['1 +', 0, 1] }] }), /ends early/);
});

test('every bundled species builds in every pose over many seeds, finite and near the mask frame', () => {
  const names = speciesNames(registry);
  assert.ok(names.length >= 12 && names.includes('otter'));
  names.forEach((name) => {
    posesOf(registry, name).forEach((pose) => {
      for (let seed = 1; seed <= 60; seed += 1) {
        const { shapes } = buildSpecies(registry, name, randomTools(seed * 7919), { pose });
        assert.ok(shapes.length > 0, `${name} ${pose} ${seed} draws nothing`);
        shapes.forEach((shape) => {
          const numbers = JSON.stringify(shape).match(/-?\d[\d.e-]*|null/g);
          assert.ok(numbers.every((token) => token !== 'null' && Number.isFinite(Number(token))), `${name} ${pose} ${seed} has a non-finite number`);
        });
        const extent = Math.max(...shapes.filter((shape) => !shape.cut).flatMap((shape) => (shape.kind === 'ellipse' ? [Math.abs(shape.x) + shape.radiusX, Math.abs(shape.y) + shape.radiusY] : shape.points.flat().map(Math.abs))));
        assert.ok(extent < 1.5, `${name} ${pose} ${seed} leaves the frame (${extent.toFixed(2)})`);
      }
    });
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildSpecies, resolveSpecies, poseWeights, speciesNames, posesOf } from '../web/src/lib/species.ts';
import { randomTools } from '../web/src/lib/random.ts';

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

const stubRandom = (overrides = {}) => ({
  next: () => 0.5,
  range: (low, high) => 100 + low + high,
  int: (low, high) => 200 + low + high,
  chance: (probability) => probability === 0.25,
  vary: (value, spread) => value * 1000 + spread,
  ...overrides,
});
const stubbed = (spec, random = stubRandom(), options) => buildSpecies({ test: spec }, 'test', random, options);
const valueOf = (expression, random) => stubbed({ body: [{ circle: [expression, 0, 1] }] }, random).shapes[0].x;
const failure = (spec, random) => {
  try {
    stubbed(spec, random);
  } catch (error) {
    return error;
  }
  return null;
};

test('numbers read with fractions, leading dots and signed or unsigned exponents', () => {
  // Setup
  const cases = { '12': 12, '1e5': 100000, '1e+2': 100, '1e-2': 0.01, '1e10': 1e10, '.25': 0.25, '.125': 0.125, '2.5E1': 25, '3.': 3 };
  // Exercise
  const results = Object.fromEntries(Object.keys(cases).map((source) => [source, valueOf(source)]));
  // Verify
  assert.deepEqual(results, cases);
});

test('every comparison and arithmetic operator yields its result for less, equal and greater operands', () => {
  // Setup
  const cases = {
    '1 < 2': true, '2 < 2': false, '3 < 2': false,
    '1 > 2': false, '2 > 2': false, '3 > 2': true,
    '1 <= 2': true, '2 <= 2': true, '3 <= 2': false,
    '1 >= 2': false, '2 >= 2': true, '3 >= 2': true,
    '2 == 2': true, '1 == 2': false,
    '2 != 2': false, '1 != 2': true,
    '7 % 4': 3, '7 - 2 - 1': 4, '8 / 4 / 2': 1, '2 + 3 * 4': 14, '2 + 1 < 4': true,
  };
  // Exercise
  const results = Object.fromEntries(Object.keys(cases).map((source) => [source, valueOf(source)]));
  // Verify
  assert.deepEqual(results, cases);
});

test('built-in functions call their implementation with the arguments given', () => {
  // Setup
  const cases = {
    'range(1, 2)': 103, 'int(1, 2)': 203, 'chance(0.25)': true, 'chance(0.5)': false, 'vary(2, 3)': 2003,
    'sqrt(16)': 4, 'abs(-3)': 3, 'hypot(3, 4)': 5, 'hypot()': 0, 'min(4, 2, 9)': 2, 'max(4, 2, 9)': 9,
    'lerp(10, 20, 0.25)': 12.5, 'clamp(5, 0, 3)': 3, 'clamp(-5, 0, 3)': 0, 'cos(0)': 1, 'sin(0)': 0, 'PI': Math.PI,
    'if(1 < 2, 7, 8)': 7, 'if(2 < 1, 7, 8)': 8,
  };
  // Exercise
  const results = Object.fromEntries(Object.keys(cases).map((source) => [source, valueOf(source)]));
  // Verify
  assert.deepEqual(results, cases);
});

test('len counts a list and indexing picks an item', () => {
  // Setup
  const spec = { body: [{ let: { xs: [4, 5, 6] } }, { circle: ['len(xs)', 'xs[1]', 'xs[len(xs) - 1]'] }] };
  // Exercise
  const [shape] = stubbed(spec).shapes;
  // Verify
  assert.deepEqual([shape.x, shape.y, shape.radiusX], [3, 5, 6]);
});

test('a malformed expression names the problem and the expression', () => {
  // Setup
  const messageOf = (expression) => failure({ body: [{ circle: [expression, 0, 1] }] }).message;
  // Exercise
  const messages = {
    stray: messageOf('1 + $'),
    padded: messageOf('  1 $ '),
    unclosed: messageOf('(1'),
    unclosedCall: messageOf('min(1, 2'),
    trailing: messageOf('1 2'),
    operator: messageOf('*'),
    closing: messageOf(')'),
    early: messageOf('1 +'),
    unknownFunction: messageOf('nope(1)'),
    unknownName: messageOf('nope'),
  };
  // Verify
  assert.match(messages.stray, /cannot read "1 \+ \$" in expression "1 \+ \$"/);
  assert.match(messages.padded, /cannot read "1 \$" in expression "1 \$"/);
  assert.match(messages.unclosed, /expected "\)" in expression "\(1"/);
  assert.match(messages.unclosedCall, /expected "\)" in expression "min\(1, 2"/);
  assert.match(messages.trailing, /unexpected "\{"number":2\}" in expression "1 2"/);
  assert.match(messages.operator, /unexpected "\*" in expression "\*"/);
  assert.match(messages.closing, /unexpected "\)" in expression "\)"/);
  assert.match(messages.early, /expression "1 \+" ends early/);
  assert.match(messages.unknownFunction, /unknown function "nope" in expression "nope\(1\)"/);
  assert.match(messages.unknownName, /unknown name "nope" in expression "nope"/);
});

test('a missing closing bracket on an index is reported', () => {
  // Setup
  const spec = { body: [{ let: { xs: [1, 2] } }, { circle: ['xs[1', 0, 1] }] };
  // Exercise
  const error = failure(spec);
  // Verify
  assert.match(error.message, /expected "\]" in expression "xs\[1"/);
});

test('values that are not a number, expression, list, branch or map are refused', () => {
  // Setup
  const messageOf = (value) => failure({ body: [{ circle: [value, 0, 1] }] }).message;
  // Exercise
  const messages = [messageOf(null), messageOf(true), messageOf({}), messageOf({ foo: 1 })];
  // Verify
  assert.match(messages[0], /cannot evaluate null/);
  assert.match(messages[1], /cannot evaluate true/);
  assert.match(messages[2], /cannot evaluate \{\}/);
  assert.match(messages[3], /cannot evaluate \{"foo":1\}/);
});

test('value branches and maps evaluate and refuse unknown keys', () => {
  // Setup
  const spec = {
    body: [
      { polygon: { map: { count: 3, let: { n: 'index * 2' }, value: ['n', { if: 'index > 0', then: 1, else: 9 }] } } },
    ],
  };
  const withKey = (value) => failure({ body: [{ circle: [value, 0, 1] }] }).message;
  // Exercise
  const [shape] = stubbed(spec).shapes;
  // Verify
  assert.deepEqual(shape.points, [[0, 9], [2, 1], [4, 1]]);
  assert.match(withKey({ if: 1, then: 1, extra: 2 }), /value \{if\} has unknown key "extra"/);
  assert.match(withKey({ map: { count: 1, value: 1, extra: 2 } }), /value \{map\} has unknown key "extra"/);
});

test('a loop without an alias binds no name called undefined and always binds index', () => {
  // Setup
  const bare = { body: [{ repeat: { count: 2, body: [{ circle: ['undefined', 0, 1] }] } }] };
  const aliased = { body: [{ repeat: { values: [5, 6], as: 'item', body: [{ circle: ['item', 'index', 1] }] } }] };
  // Exercise
  const error = failure(bare);
  const shapes = stubbed(aliased).shapes;
  // Verify
  assert.match(error.message, /unknown name "undefined"/);
  assert.deepEqual(shapes.map((shape) => [shape.x, shape.y]), [[5, 0], [6, 1]]);
});

test('shape kinds produce their output shapes', () => {
  // Setup
  const spec = {
    body: [
      { ellipse: [1, 2, 3, 4] },
      { ellipse: [1, 2, 3, 4, 0.5], cut: true },
      { circle: [1, 2, 3] },
      { polygon: [[0, 0], [1, 0], [1, 1]] },
      { blob: [[0, 0], [2, 0], [2, 2]] },
      { tube: [[0, 0], [1, 1]], radii: [0.1, 0.2] },
      { tube: [[0, 0], [1, 1]], radii: 0.3 },
    ],
  };
  // Exercise
  const { shapes } = stubbed(spec);
  // Verify
  assert.deepEqual(shapes, [
    { kind: 'ellipse', x: 1, y: 2, radiusX: 3, radiusY: 4, angle: 0 },
    { kind: 'ellipse', x: 1, y: 2, radiusX: 3, radiusY: 4, angle: 0.5, cut: true },
    { kind: 'ellipse', x: 1, y: 2, radiusX: 3, radiusY: 3, angle: 0 },
    { kind: 'polygon', points: [[0, 0], [1, 0], [1, 1]] },
    { kind: 'blob', points: [[0, 0], [2, 0], [2, 2]] },
    { kind: 'tube', points: [[0, 0], [1, 1]], radii: [0.1, 0.2] },
    { kind: 'tube', points: [[0, 0], [1, 1]], radii: [0.3] },
  ]);
  assert.equal('cut' in shapes[0], false);
});

test('statements run their branch, loop and def, and refuse unknown keys or kinds', () => {
  // Setup
  const circles = (...xs) => xs.map((x) => ({ kind: 'ellipse', x, y: 0, radiusX: 1, radiusY: 1, angle: 0 }));
  const spec = {
    defs: { dot: [{ circle: ['x', 0, 1] }] },
    body: [
      { if: 'chance(0.25)', then: [{ circle: [1, 0, 1] }], else: [{ circle: [2, 0, 1] }] },
      { if: 'chance(0.5)', then: [{ circle: [3, 0, 1] }], else: [{ circle: [4, 0, 1] }] },
      { if: 'chance(0.5)', then: [{ circle: [5, 0, 1] }] },
      { if: 'chance(0.25)', then: [{ let: { hidden: 1 } }] },
      { repeat: { count: 2 } },
      { use: 'dot', with: { x: 7 } },
      { let: { later: 8 } },
      { circle: ['later', 0, 1] },
    ],
  };
  const messageOf = (statement) => failure({ defs: { dot: [] }, body: [statement] }).message;
  // Exercise
  const { shapes } = stubbed(spec);
  // Verify
  assert.deepEqual(shapes, circles(1, 4, 7, 8));
  assert.match(messageOf({ if: 1, then: [], extra: 1 }), /statement \{if\} has unknown key "extra"/);
  assert.match(messageOf({ let: { a: 1 }, extra: 1 }), /statement \{let\} has unknown key "extra"/);
  assert.match(messageOf({ repeat: { count: 1 }, extra: 1 }), /statement \{repeat\} has unknown key "extra"/);
  assert.match(messageOf({ repeat: { count: 1, extra: 1 } }), /repeat has unknown key "extra"/);
  assert.match(messageOf({ use: 'dot', extra: 1 }), /statement \{use\} has unknown key "extra"/);
  assert.match(messageOf({ circle: [1, 1, 1], extra: 1 }), /shape \{circle\} has unknown key "extra"/);
  assert.match(messageOf({ use: 'missing' }), /unknown def "missing"/);
  assert.match(messageOf({ nothing: 1 }), /unknown statement \{"nothing":1\}/);
});

test('a branch statement keeps its lets out of the outer scope and a use keeps its arguments out too', () => {
  // Setup
  const leakIf = { body: [{ if: 1, then: [{ let: { inner: 1 } }] }, { circle: ['inner', 0, 1] }] };
  const leakUse = { defs: { d: [] }, body: [{ use: 'd', with: { arg: 1 } }, { circle: ['arg', 0, 1] }] };
  // Exercise
  const messages = [failure(leakIf).message, failure(leakUse).message];
  // Verify
  assert.match(messages[0], /unknown name "inner"/);
  assert.match(messages[1], /unknown name "arg"/);
});

test('a species inherits poses, params, defs and body from its base, and a child pose merges onto the base pose', () => {
  // Setup
  const reg = {
    base: {
      abstract: true,
      params: { size: 1 },
      defs: { d: [] },
      body: [{ part: 'tail', circle: [1, 0, 1] }, { part: 'head', circle: [2, 0, 1] }],
      poses: { walk: { weight: 2, params: { a: 1 }, drop: ['x'], body: [{ circle: [9, 0, 1] }] } },
    },
    child: {
      extends: 'base',
      params: { extra: 2 },
      drop: ['tail'],
      poses: {
        walk: { params: { b: 2 }, drop: ['y'], body: [{ circle: [8, 0, 1] }] },
        sit: {},
      },
    },
    plain: { extends: 'base' },
  };
  // Exercise
  const child = resolveSpecies(reg, 'child');
  const plain = resolveSpecies(reg, 'plain');
  // Verify
  assert.equal(child.name, 'child');
  assert.deepEqual(child.params, { size: 1, extra: 2 });
  assert.deepEqual(Object.keys(child.defs), ['d']);
  assert.deepEqual(child.body.map((node) => node.part), ['head']);
  assert.deepEqual(plain.body.map((node) => node.part), ['tail', 'head']);
  assert.equal(child.poses.walk.weight, 2);
  assert.deepEqual(child.poses.walk.params, { a: 1, b: 2 });
  assert.deepEqual(child.poses.walk.drop, ['x', 'y']);
  assert.deepEqual(child.poses.walk.body.map((node) => node.circle[0]), [9, 8]);
  assert.deepEqual(child.poses.sit, { params: {}, drop: [], body: [] });
  assert.deepEqual(Object.keys(plain.poses), ['walk']);
  assert.equal(speciesNames(reg).join(), 'child,plain');
});

test('a species resolves once per registry and refuses unknown names', () => {
  // Setup
  const reg = { a: { body: [] } };
  // Exercise
  const first = resolveSpecies(reg, 'a');
  const second = resolveSpecies(reg, 'a');
  // Verify
  assert.equal(first, second);
  assert.throws(() => resolveSpecies(reg, 'missing'), /unknown species "missing"/);
  assert.throws(() => resolveSpecies({ a: { extends: 'missing' } }, 'a'), /unknown species "missing"/);
});

test('a pose is drawn by weight, with the boundary and the last pose as fallback', () => {
  // Setup
  const spec = { poses: { a: { weight: 1 }, b: { weight: 1 }, c: { weight: 0 } } };
  const poseFor = (next) => stubbed(spec, stubRandom({ next: () => next })).pose;
  // Exercise
  const poses = [poseFor(0), poseFor(0.49), poseFor(0.5), poseFor(0.99), poseFor(1)];
  // Verify
  assert.deepEqual(poses, ['a', 'a', 'b', 'b', 'b']);
});

test('a single pose or no pose needs no draw, and a named pose wins only when it can be drawn', () => {
  // Setup
  const noDraw = stubRandom({ next: () => { throw new Error('drew'); } });
  const spec = { poses: { a: { weight: 1 }, b: { weight: 1 } } };
  // Exercise
  const none = stubbed({}, noDraw);
  const single = stubbed({ poses: { only: {} } }, noDraw);
  const named = stubbed(spec, noDraw, { pose: 'b' });
  const unknown = stubbed(spec, stubRandom({ next: () => 0 }), { pose: 'zzz' });
  const zeroWeight = stubbed({ poses: { a: { weight: 1 }, off: { weight: 0 } } }, noDraw, { pose: 'off' });
  // Verify
  assert.equal(none.pose, '');
  assert.equal(single.pose, 'only');
  assert.equal(named.pose, 'b');
  assert.equal(unknown.pose, 'a');
  assert.equal(zeroWeight.pose, 'a');
});

test('pose weights default to one and zero weights are left out', () => {
  // Setup
  const resolved = resolveSpecies({ s: { poses: { a: {}, b: { weight: 2.5 }, c: { weight: 0 } } } }, 's');
  // Exercise
  const weights = poseWeights(resolved);
  // Verify
  assert.deepEqual(weights, [['a', 1], ['b', 2.5]]);
  assert.deepEqual(posesOf({ s: { poses: { a: {}, c: { weight: 0 } } } }, 's'), ['a']);
  assert.deepEqual(posesOf({ s: {} }, 's'), ['']);
});

test('a pose applies its params, drops parts and adds its body', () => {
  // Setup
  const spec = {
    params: { x: 1 },
    body: [{ part: 'gone', circle: [100, 0, 1] }, { part: 'kept', circle: ['x', 0, 1] }, { circle: [50, 0, 1] }],
    poses: { p: { params: { x: 2 }, drop: ['gone'], body: [{ circle: [3, 0, 1] }] } },
  };
  // Exercise
  const { shapes, pose } = stubbed(spec);
  // Verify
  assert.equal(pose, 'p');
  assert.deepEqual(shapes.map((shape) => shape.x), [2, 50, 3]);
});

test('a failure names the species, the pose and keeps the original error as cause', () => {
  // Setup
  const posed = { poses: { walk: {} }, body: [{ circle: ['nope', 0, 1] }] };
  const plain = { body: [{ circle: ['nope', 0, 1] }] };
  // Exercise
  const withPose = failure(posed);
  const without = failure(plain);
  // Verify
  assert.equal(withPose.message, 'species "test" (pose walk): unknown name "nope" in expression "nope"');
  assert.equal(without.message, 'species "test": unknown name "nope" in expression "nope"');
  assert.ok(withPose.cause instanceof Error);
  assert.equal(withPose.cause.message, 'unknown name "nope" in expression "nope"');
});

test('a species that extends itself is refused with its trail', () => {
  // Setup
  const reg = { a: { extends: 'b' }, b: { extends: 'a' } };
  // Exercise
  const act = () => resolveSpecies(reg, 'a');
  // Verify
  assert.throws(act, /species "a" extends itself through a > b/);
});

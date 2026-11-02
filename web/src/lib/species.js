/** Interprets a species description (docs/mechanisms/species-dsl.md) into a list of shapes. No DOM. */
import { clamp, lerp } from './math.js';

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(<=|>=|==|!=|[-+*/%<>(),[\]]))/iy;

const tokenize = (expression) => {
  const source = expression.trim();
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    const match = TOKEN.exec(source);
    if (!match) {
      throw new Error(`cannot read "${source.slice(TOKEN.lastIndex).trim()}" in expression "${source}"`);
    }
    tokens.push(match[1] !== undefined ? { number: Number(match[1]) } : match[2] !== undefined ? { name: match[2] } : { op: match[3] });
  }
  return tokens;
};

const BINARY = {
  '<': [1, (a, b) => a < b], '>': [1, (a, b) => a > b], '<=': [1, (a, b) => a <= b], '>=': [1, (a, b) => a >= b],
  '==': [1, (a, b) => a === b], '!=': [1, (a, b) => a !== b],
  '+': [2, (a, b) => a + b], '-': [2, (a, b) => a - b],
  '*': [3, (a, b) => a * b], '/': [3, (a, b) => a / b], '%': [3, (a, b) => a % b],
};

const FUNCTIONS = {
  range: (context, low, high) => context.random.range(low, high),
  int: (context, low, high) => context.random.int(low, high),
  chance: (context, probability) => context.random.chance(probability),
  vary: (context, value, spread) => context.random.vary(value, spread),
  cos: (context, angle) => Math.cos(angle),
  sin: (context, angle) => Math.sin(angle),
  sqrt: (context, value) => Math.sqrt(value),
  abs: (context, value) => Math.abs(value),
  hypot: (context, ...values) => Math.hypot(...values),
  min: (context, ...values) => Math.min(...values),
  max: (context, ...values) => Math.max(...values),
  lerp: (context, from, to, amount) => lerp(from, to, amount),
  clamp: (context, value, low, high) => clamp(value, low, high),
  len: (context, list) => list.length,
};

const compiled = new Map();

/** Compiles one expression string to (scope, context) => value; calls evaluate left to right, `if` evaluates only the branch taken. */
const compile = (source) => {
  if (compiled.has(source)) {
    return compiled.get(source);
  }
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (op) => {
    const token = take();
    if (!token || token.op !== op) {
      throw new Error(`expected "${op}" in expression "${source}"`);
    }
  };
  const parseArguments = () => {
    const args = [];
    if (peek() && peek().op === ')') {
      take();
      return args;
    }
    do {
      args.push(parseExpression(0));
    } while (peek() && peek().op === ',' && take());
    expect(')');
    return args;
  };
  const parsePrimary = () => {
    const token = take();
    if (!token) {
      throw new Error(`expression "${source}" ends early`);
    }
    if (token.number !== undefined) {
      return () => token.number;
    }
    if (token.op === '-') {
      const operand = parsePostfix();
      return (scope, context) => -operand(scope, context);
    }
    if (token.op === '(') {
      const inner = parseExpression(0);
      expect(')');
      return inner;
    }
    if (token.name !== undefined) {
      const name = token.name;
      if (peek() && peek().op === '(') {
        take();
        const args = parseArguments();
        if (name === 'if') {
          return (scope, context) => (args[0](scope, context) ? args[1](scope, context) : args[2](scope, context));
        }
        const call = FUNCTIONS[name];
        if (!call) {
          throw new Error(`unknown function "${name}" in expression "${source}"`);
        }
        return (scope, context) => call(context, ...args.map((argument) => argument(scope, context)));
      }
      if (name === 'PI') {
        return () => Math.PI;
      }
      return (scope) => {
        if (!(name in scope)) {
          throw new Error(`unknown name "${name}" in expression "${source}"`);
        }
        return scope[name];
      };
    }
    throw new Error(`unexpected "${token.op}" in expression "${source}"`);
  };
  const parsePostfix = () => {
    let term = parsePrimary();
    while (peek() && peek().op === '[') {
      take();
      const index = parseExpression(0);
      expect(']');
      const list = term;
      term = (scope, context) => list(scope, context)[index(scope, context)];
    }
    return term;
  };
  const parseExpression = (minimum) => {
    let left = parsePostfix();
    while (peek() && BINARY[peek().op] && BINARY[peek().op][0] >= minimum) {
      const [precedence, apply] = BINARY[take().op];
      const right = parseExpression(precedence + 1);
      const before = left;
      left = (scope, context) => apply(before(scope, context), right(scope, context));
    }
    return left;
  };
  const program = parseExpression(0);
  if (position < tokens.length) {
    throw new Error(`unexpected "${JSON.stringify(tokens[position])}" in expression "${source}"`);
  }
  compiled.set(source, program);
  return program;
};

const child = (scope) => Object.create(scope);

const only = (node, allowed, what) => {
  const unknown = Object.keys(node).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new Error(`${what} has unknown key "${unknown[0]}"`);
  }
};

/** A value: number, expression string, array of values, `{if,then,else}` or `{map: {count|values, as?, let?, value}}`. */
const evaluate = (value, scope, context) => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return compile(value)(scope, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => evaluate(item, scope, context));
  }
  if (value && typeof value === 'object' && 'if' in value) {
    only(value, ['if', 'then', 'else'], 'value {if}');
    return evaluate(evaluate(value.if, scope, context) ? value.then : value.else, scope, context);
  }
  if (value && typeof value === 'object' && value.map) {
    const spec = value.map;
    only(spec, ['count', 'values', 'as', 'let', 'value'], 'value {map}');
    return iterations(spec, scope, context).map((inner) => {
      assign(spec.let, inner, context);
      return evaluate(spec.value, inner, context);
    });
  }
  throw new Error(`cannot evaluate ${JSON.stringify(value)}`);
};

const assign = (bindings, scope, context) => {
  Object.entries(bindings || {}).forEach(([name, value]) => {
    scope[name] = evaluate(value, scope, context);
  });
};

/** One child scope per pass of a `count` or `values` loop, each carrying `index` and `as`. */
const iterations = (spec, scope, context) => {
  const items = spec.values !== undefined ? evaluate(spec.values, scope, context) : Array.from({ length: evaluate(spec.count, scope, context) }, (unused, index) => index);
  return items.map((item, index) => {
    const inner = child(scope);
    inner.index = index;
    if (spec.as) {
      inner[spec.as] = item;
    }
    return inner;
  });
};

const KINDS = {
  ellipse: ([x, y, radiusX, radiusY, angle = 0]) => ({ kind: 'ellipse', x, y, radiusX, radiusY, angle }),
  circle: ([x, y, radius]) => ({ kind: 'ellipse', x, y, radiusX: radius, radiusY: radius, angle: 0 }),
  polygon: (points) => ({ kind: 'polygon', points }),
  blob: (points) => ({ kind: 'blob', points }),
  tube: (points, node, scope, context) => ({ kind: 'tube', points, radii: [].concat(evaluate(node.radii, scope, context)) }),
};

const run = (statements, scope, context, shapes) => {
  statements.forEach((node) => {
    const shapeKind = Object.keys(KINDS).find((kind) => kind in node);
    if (shapeKind) {
      only(node, [shapeKind, 'radii', 'cut', 'part'], `shape {${shapeKind}}`);
      const shape = KINDS[shapeKind](evaluate(node[shapeKind], scope, context), node, scope, context);
      shapes.push(node.cut ? Object.assign({}, shape, { cut: true }) : shape);
    } else if ('let' in node) {
      only(node, ['let', 'part'], 'statement {let}');
      assign(node.let, scope, context);
    } else if ('repeat' in node) {
      only(node, ['repeat', 'part'], 'statement {repeat}');
      only(node.repeat, ['count', 'values', 'as', 'body'], 'repeat');
      iterations(node.repeat, scope, context).forEach((inner) => run(node.repeat.body, inner, context, shapes));
    } else if ('if' in node) {
      only(node, ['if', 'then', 'else', 'part'], 'statement {if}');
      run((evaluate(node.if, scope, context) ? node.then : node.else) || [], child(scope), context, shapes);
    } else if ('use' in node) {
      only(node, ['use', 'with', 'part'], 'statement {use}');
      const body = context.defs[node.use];
      if (!body) {
        throw new Error(`unknown def "${node.use}"`);
      }
      const inner = child(scope);
      Object.entries(node.with || {}).forEach(([name, value]) => {
        inner[name] = evaluate(value, scope, context);
      });
      run(body, inner, context, shapes);
    } else {
      throw new Error(`unknown statement ${JSON.stringify(node)}`);
    }
  });
};

const mergePoses = (base, own) => {
  const poses = { ...base };
  Object.entries(own || {}).forEach(([name, pose]) => {
    const before = poses[name] || {};
    poses[name] = {
      ...before,
      ...pose,
      params: { ...before.params, ...pose.params },
      drop: [...(before.drop || []), ...(pose.drop || [])],
      body: [...(before.body || []), ...(pose.body || [])],
    };
  });
  return poses;
};

const resolvedByRegistry = new WeakMap();

/** Follows `extends` and returns { params, defs, body, poses } for one species; `registry` maps name to the raw JSON. Resolved once per registry and name. */
export const resolveSpecies = (registry, name, trail = []) => {
  const cache = resolvedByRegistry.get(registry) || new Map();
  resolvedByRegistry.set(registry, cache);
  if (cache.has(name)) {
    return cache.get(name);
  }
  const spec = registry[name];
  if (!spec) {
    throw new Error(`unknown species "${name}"`);
  }
  if (trail.includes(name)) {
    throw new Error(`species "${name}" extends itself through ${trail.join(' > ')}`);
  }
  const base = spec.extends ? resolveSpecies(registry, spec.extends, [...trail, name]) : { params: {}, defs: {}, body: [], poses: {} };
  const resolved = {
    name,
    params: { ...base.params, ...spec.params },
    defs: { ...base.defs, ...spec.defs },
    body: [...base.body.filter((node) => !(spec.drop || []).includes(node.part)), ...(spec.body || [])],
    poses: mergePoses(base.poses, spec.poses),
  };
  cache.set(name, resolved);
  return resolved;
};

/** Pose names a species can draw, with weights; empty when the species has none. */
export const poseWeights = (resolved) => Object.entries(resolved.poses)
  .map(([name, pose]) => [name, pose.weight === undefined ? 1 : pose.weight])
  .filter(([, weight]) => weight > 0);

const pickPose = (weights, random) => {
  if (weights.length < 2) {
    return weights.length ? weights[0][0] : '';
  }
  let roll = random.next() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  const chosen = weights.find(([, weight]) => {
    roll -= weight;
    return roll < 0;
  });
  return (chosen || weights[weights.length - 1])[0];
};

/** Draws one animal: `{ shapes, pose }`. A pose named in `options.pose` wins over the weighted draw. */
export const buildSpecies = (registry, name, random, options = {}) => {
  const resolved = resolveSpecies(registry, name);
  const weights = poseWeights(resolved);
  const pose = weights.some(([poseName]) => poseName === options.pose) ? options.pose : pickPose(weights, random);
  const chosen = resolved.poses[pose] || {};
  const dropped = new Set(chosen.drop || []);
  const context = { random, defs: resolved.defs };
  const scope = {};
  const shapes = [];
  try {
    assign({ ...resolved.params, ...chosen.params }, scope, context);
    run([...resolved.body.filter((node) => !dropped.has(node.part)), ...(chosen.body || [])], scope, context, shapes);
  } catch (error) {
    throw new Error(`species "${name}"${pose ? ` (pose ${pose})` : ''}: ${error.message}`, { cause: error });
  }
  return { shapes, pose };
};

/** Species a registry offers, bases excluded (a base has `"abstract": true`). */
export const speciesNames = (registry) => Object.keys(registry).filter((name) => !registry[name].abstract);

/** Pose names a species can draw, for listing; `['']` when it has none. */
export const posesOf = (registry, name) => {
  const names = poseWeights(resolveSpecies(registry, name)).map(([pose]) => pose);
  return names.length ? names : [''];
};

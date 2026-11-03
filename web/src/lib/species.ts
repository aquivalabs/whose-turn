/** Interprets a species description (docs/mechanisms/species-dsl.md) into a list of shapes. No DOM. */
import { clamp, lerp } from './math.ts';
import type { RandomTools } from './random.ts';

export type Point = [number, number];
/** One shape the painter fills (or cuts out, with `cut`), in mask units. */
export type Shape = (
  | { kind: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number; angle: number }
  | { kind: 'polygon' | 'blob'; points: Point[] }
  | { kind: 'tube'; points: Point[]; radii: number[] }
) & { cut?: boolean };

/** What an expression yields: a number, a comparison's boolean, or a list of either. */
export type Value = number | boolean | Value[];
/** A value as the JSON writes it: a number, an expression, a list, `{if,then,else}` or `{map}`. */
export type RawValue = number | string | RawValue[] | RawBranch;
export interface RawBranch {
  if?: RawValue;
  then?: RawValue;
  else?: RawValue;
  map?: Loop;
}
export interface Loop {
  count?: RawValue;
  values?: RawValue;
  as?: string;
  let?: Bindings;
  value?: RawValue;
  body?: Statement[];
}
export type Bindings = Record<string, RawValue>;
export interface Statement {
  part?: string;
  cut?: boolean;
  radii?: RawValue;
  let?: Bindings;
  repeat?: Loop;
  if?: RawValue;
  then?: Statement[];
  else?: Statement[];
  use?: string;
  with?: Bindings;
  [shape: string]: unknown;
}
export interface Pose {
  weight?: number;
  params?: Bindings;
  drop?: string[];
  body?: Statement[];
}
export interface SpeciesSpec {
  extends?: string;
  abstract?: boolean;
  params?: Bindings;
  defs?: Record<string, Statement[]>;
  body?: Statement[];
  drop?: string[];
  poses?: Record<string, Pose>;
}
export type Registry = Record<string, SpeciesSpec>;
export interface ResolvedSpecies {
  name: string;
  params: Bindings;
  defs: Record<string, Statement[]>;
  body: Statement[];
  poses: Record<string, Pose>;
}

type Scope = Record<string, Value>;
interface Context {
  random: RandomTools;
  defs: Record<string, Statement[]>;
}
type Program = (scope: Scope, context: Context) => Value;
interface Token {
  number?: number;
  name?: string;
  op?: string;
}

const TOKEN =
  /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(<=|>=|==|!=|[-+*/%<>(),[\]]))/iy;

const tokenize = (expression: string) => {
  const source = expression.trim();
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    const match = TOKEN.exec(source);
    if (!match) {
      throw new Error(
        `cannot read "${source.slice(TOKEN.lastIndex).trim()}" in expression "${source}"`,
      );
    }
    tokens.push(
      match[1] !== undefined
        ? { number: Number(match[1]) }
        : match[2] !== undefined
          ? { name: match[2] }
          : { op: match[3] },
    );
  }
  return tokens;
};

const BINARY: Record<string, [number, (left: number, right: number) => Value]> = {
  '<': [1, (left, right) => left < right],
  '>': [1, (left, right) => left > right],
  '<=': [1, (left, right) => left <= right],
  '>=': [1, (left, right) => left >= right],
  '==': [1, (left, right) => left === right],
  '!=': [1, (left, right) => left !== right],
  '+': [2, (left, right) => left + right],
  '-': [2, (left, right) => left - right],
  '*': [3, (left, right) => left * right],
  '/': [3, (left, right) => left / right],
  '%': [3, (left, right) => left % right],
};

// docs/mechanisms/species-dsl.md, Expressions
const FUNCTIONS: Record<string, (context: Context, ...values: number[]) => Value> = {
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
  len: (context, list) => (list as unknown as Value[]).length,
};

const compiled = new Map<string, Program>();

/** Compiles one expression string to (scope, context) => value; calls evaluate left to right, `if` evaluates only the branch taken. */
const compile = (source: string): Program => {
  const cached = compiled.get(source);
  if (cached) {
    return cached;
  }
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (operator: string) => {
    const token = take();
    if (!token || token.op !== operator) {
      throw new Error(`expected "${operator}" in expression "${source}"`);
    }
  };
  const parseArguments = () => {
    const args: Program[] = [];
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
  const parsePrimary = (): Program => {
    const token = take();
    if (!token) {
      throw new Error(`expression "${source}" ends early`);
    }
    const number = token.number;
    if (number !== undefined) {
      return () => number;
    }
    if (token.op === '-') {
      const operand = parsePostfix();
      return (scope, context) => -(operand(scope, context) as number);
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
          return (scope, context) =>
            args[0](scope, context) ? args[1](scope, context) : args[2](scope, context);
        }
        const call = FUNCTIONS[name];
        if (!call) {
          throw new Error(`unknown function "${name}" in expression "${source}"`);
        }
        return (scope, context) =>
          call(context, ...(args.map((argument) => argument(scope, context)) as number[]));
      }
      if (name === 'PI') {
        return () => Math.PI;
      }
      return (scope: Scope) => {
        if (!(name in scope)) {
          throw new Error(`unknown name "${name}" in expression "${source}"`);
        }
        return scope[name];
      };
    }
    throw new Error(`unexpected "${token.op}" in expression "${source}"`);
  };
  const parsePostfix = (): Program => {
    let term = parsePrimary();
    while (peek() && peek().op === '[') {
      take();
      const index = parseExpression(0);
      expect(']');
      const list = term;
      term = (scope, context) => (list(scope, context) as Value[])[index(scope, context) as number];
    }
    return term;
  };
  const parseExpression = (minimum: number): Program => {
    let left = parsePostfix();
    while (peek() && BINARY[peek().op ?? ''] && BINARY[peek().op ?? ''][0] >= minimum) {
      const [precedence, apply] = BINARY[take().op ?? ''];
      const right = parseExpression(precedence + 1);
      const before = left;
      left = (scope, context) =>
        apply(before(scope, context) as number, right(scope, context) as number);
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

const child = (scope: Scope): Scope => Object.create(scope);

const only = (node: object, allowed: string[], what: string) => {
  const unknown = Object.keys(node).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new Error(`${what} has unknown key "${unknown[0]}"`);
  }
};

/** A value: number, expression string, array of values, `{if,then,else}` or `{map: {count|values, as?, let?, value}}`. */
const evaluate = (value: RawValue | undefined, scope: Scope, context: Context): Value => {
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

const assign = (bindings: Bindings | undefined, scope: Scope, context: Context) => {
  Object.entries(bindings || {}).forEach(([name, value]) => {
    scope[name] = evaluate(value, scope, context);
  });
};

/** One child scope per pass of a `count` or `values` loop, each carrying `index` and `as`. */
const iterations = (spec: Loop, scope: Scope, context: Context) => {
  const items =
    spec.values !== undefined
      ? (evaluate(spec.values, scope, context) as Value[])
      : Array.from(
          { length: evaluate(spec.count, scope, context) as number },
          (unused, index) => index,
        );
  return items.map((item, index) => {
    const inner = child(scope);
    inner.index = index;
    if (spec.as) {
      inner[spec.as] = item;
    }
    return inner;
  });
};

type ShapeMaker = (values: Value[], node: Statement, scope: Scope, context: Context) => Shape;
const KINDS: Record<string, ShapeMaker> = {
  ellipse: (values) => {
    const [x, y, radiusX, radiusY, angle = 0] = values as number[];
    return { kind: 'ellipse', x, y, radiusX, radiusY, angle };
  },
  circle: (values) => {
    const [x, y, radius] = values as number[];
    return { kind: 'ellipse', x, y, radiusX: radius, radiusY: radius, angle: 0 };
  },
  polygon: (points) => ({ kind: 'polygon', points: points as Point[] }),
  blob: (points) => ({ kind: 'blob', points: points as Point[] }),
  tube: (points, node, scope, context) => ({
    kind: 'tube',
    points: points as Point[],
    radii: ([] as Value[]).concat(evaluate(node.radii, scope, context)) as number[],
  }),
};

const run = (statements: Statement[], scope: Scope, context: Context, shapes: Shape[]) => {
  statements.forEach((node) => {
    const shapeKind = Object.keys(KINDS).find((kind) => kind in node);
    if (shapeKind) {
      only(node, [shapeKind, 'radii', 'cut', 'part'], `shape {${shapeKind}}`);
      const shape = KINDS[shapeKind](
        evaluate(node[shapeKind] as RawValue, scope, context) as Value[],
        node,
        scope,
        context,
      );
      shapes.push(node.cut ? Object.assign({}, shape, { cut: true }) : shape);
    } else if ('let' in node) {
      only(node, ['let', 'part'], 'statement {let}');
      assign(node.let, scope, context);
    } else if ('repeat' in node) {
      only(node, ['repeat', 'part'], 'statement {repeat}');
      const repeat = node.repeat as Loop;
      only(repeat, ['count', 'values', 'as', 'body'], 'repeat');
      iterations(repeat, scope, context).forEach((inner) =>
        run(repeat.body || [], inner, context, shapes),
      );
    } else if ('if' in node) {
      only(node, ['if', 'then', 'else', 'part'], 'statement {if}');
      run(
        (evaluate(node.if, scope, context) ? node.then : node.else) || [],
        child(scope),
        context,
        shapes,
      );
    } else if ('use' in node) {
      only(node, ['use', 'with', 'part'], 'statement {use}');
      const body = context.defs[node.use as string];
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

const mergePoses = (base: Record<string, Pose>, own: Record<string, Pose> | undefined) => {
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

const resolvedByRegistry = new WeakMap<Registry, Map<string, ResolvedSpecies>>();

/** Follows `extends` and returns { params, defs, body, poses } for one species; `registry` maps name to the raw JSON. Resolved once per registry and name. */
export const resolveSpecies = (
  registry: Registry,
  name: string,
  trail: string[] = [],
): ResolvedSpecies => {
  const cache = resolvedByRegistry.get(registry) || new Map<string, ResolvedSpecies>();
  resolvedByRegistry.set(registry, cache);
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  const spec = registry[name];
  if (!spec) {
    throw new Error(`unknown species "${name}"`);
  }
  if (trail.includes(name)) {
    throw new Error(`species "${name}" extends itself through ${trail.join(' > ')}`);
  }
  const base: Omit<ResolvedSpecies, 'name'> = spec.extends
    ? resolveSpecies(registry, spec.extends, [...trail, name])
    : { params: {}, defs: {}, body: [], poses: {} };
  const resolved: ResolvedSpecies = {
    name,
    params: { ...base.params, ...spec.params },
    defs: { ...base.defs, ...spec.defs },
    body: [
      ...base.body.filter((node) => !(spec.drop || []).includes(node.part ?? '')),
      ...(spec.body || []),
    ],
    poses: mergePoses(base.poses, spec.poses),
  };
  cache.set(name, resolved);
  return resolved;
};

/** Pose names a species can draw, with weights; empty when the species has none. */
export const poseWeights = (resolved: ResolvedSpecies) =>
  Object.entries(resolved.poses)
    .map(([name, pose]): [string, number] => [name, pose.weight === undefined ? 1 : pose.weight])
    .filter(([, weight]) => weight > 0);

const pickPose = (weights: [string, number][], random: RandomTools) => {
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
export const buildSpecies = (
  registry: Registry,
  name: string,
  random: RandomTools,
  options: { pose?: string } = {},
) => {
  const resolved = resolveSpecies(registry, name);
  const weights = poseWeights(resolved);
  const pose =
    options.pose && weights.some(([poseName]) => poseName === options.pose)
      ? options.pose
      : pickPose(weights, random);
  const chosen: Pose = resolved.poses[pose] || {};
  const dropped = new Set(chosen.drop || []);
  const context: Context = { random, defs: resolved.defs };
  const scope: Scope = {};
  const shapes: Shape[] = [];
  try {
    assign({ ...resolved.params, ...chosen.params }, scope, context);
    run(
      [...resolved.body.filter((node) => !dropped.has(node.part ?? '')), ...(chosen.body || [])],
      scope,
      context,
      shapes,
    );
  } catch (error) {
    throw new Error(
      `species "${name}"${pose ? ` (pose ${pose})` : ''}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  return { shapes, pose };
};

/** Species a registry offers, bases excluded (a base has `"abstract": true`). */
export const speciesNames = (registry: Registry) =>
  Object.keys(registry).filter((name) => !registry[name].abstract);

/** Pose names a species can draw, for listing; `['']` when it has none. */
export const posesOf = (registry: Registry, name: string) => {
  const names = poseWeights(resolveSpecies(registry, name)).map(([pose]) => pose);
  return names.length ? names : [''];
};

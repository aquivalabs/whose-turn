/** Backdrop under the glass: one animal per workspace drawn in dots from a seeded random. `window.whoseTurnBackdrop.show({ workspace, seed?, species? })` picks it; RMA-93, RMA-94. */
(() => {
  const MASK_SIZE = 256;
  const MASK_SPAN = 2.6;
  const MASK_PER_UNIT = MASK_SIZE / MASK_SPAN;

  const mulberry32 = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  };

  const randomTools = (seed) => {
    const next = mulberry32(seed);
    const range = (low, high) => low + (high - low) * next();
    return {
      next,
      range,
      int: (low, high) => Math.floor(range(low, high + 1)),
      chance: (probability) => next() < probability,
      vary: (value, spread = 0.12) => value * range(1 - spread, 1 + spread),
    };
  };

  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  const ellipse = (x, y, radiusX, radiusY, angle = 0) => ({ kind: 'ellipse', x, y, radiusX, radiusY, angle });
  const circle = (x, y, radius) => ellipse(x, y, radius, radius);
  const polygon = (points) => ({ kind: 'polygon', points });
  const blob = (points) => ({ kind: 'blob', points });
  const tube = (points, radii) => ({ kind: 'tube', points, radii: Array.isArray(radii) ? radii : [radii] });
  const cut = (shape) => Object.assign({}, shape, { cut: true });
  const mirrorX = (points) => points.map(([x, y]) => [-x, y]);

  const hedgehog = (random) => {
    const bodyY = random.range(0.05, 0.15);
    const bodyRadiusX = random.range(0.6, 0.72);
    const bodyRadiusY = random.range(0.3, 0.38);
    const spikeCount = random.int(11, 17);
    const spikeLength = random.range(0.3, 0.45);
    const sweep = random.range(0.2, 0.55);
    const frontAngle = Math.PI * random.range(1.62, 1.75);
    const shapes = [ellipse(0, bodyY, bodyRadiusX, bodyRadiusY)];
    for (let index = 0; index < spikeCount; index += 1) {
      const angle = lerp(Math.PI * 0.88, frontAngle, index / (spikeCount - 1)) + random.range(-0.04, 0.04);
      const baseX = Math.cos(angle) * bodyRadiusX * 0.9;
      const baseY = bodyY + Math.sin(angle) * bodyRadiusY * 0.9;
      const directionX = Math.cos(angle) - sweep;
      const directionY = Math.sin(angle) * 1.2;
      const directionLength = Math.hypot(directionX, directionY);
      const length = spikeLength * random.range(0.7, 1.25);
      const halfWidth = random.range(0.07, 0.1);
      const tangentX = -directionY / directionLength;
      const tangentY = directionX / directionLength;
      shapes.push(polygon([
        [baseX - tangentX * halfWidth, baseY - tangentY * halfWidth],
        [baseX + directionX / directionLength * (length + 0.08), baseY + directionY / directionLength * (length + 0.08)],
        [baseX + tangentX * halfWidth, baseY + tangentY * halfWidth],
      ]));
    }
    const snoutX = bodyRadiusX * 0.85;
    const snoutReach = random.range(0.28, 0.42);
    shapes.push(ellipse(snoutX - 0.05, bodyY + 0.12, 0.3, 0.2, 0.3));
    shapes.push(polygon([[snoutX - 0.05, bodyY - 0.02], [snoutX + snoutReach, bodyY + 0.25], [snoutX - 0.1, bodyY + 0.3]]));
    shapes.push(circle(snoutX + snoutReach - 0.02, bodyY + 0.25, 0.055));
    [-0.42, -0.15, 0.22, 0.45].forEach((legX) => {
      shapes.push(tube([[legX, bodyY + bodyRadiusY * 0.7], [legX + 0.04, bodyY + bodyRadiusY + random.range(0.08, 0.14)]], 0.06));
    });
    shapes.push(cut(circle(snoutX + 0.04, bodyY + 0.08, 0.04)));
    return shapes;
  };

  const catSitting = (random) => {
    const headX = random.range(0.12, 0.28);
    const headY = random.range(-0.58, -0.45);
    const earHeight = random.range(0.26, 0.4);
    const earTilt = random.range(-0.08, 0.08);
    const curlsForward = random.chance(0.5);
    const tailPoints = curlsForward
      ? [[-0.5, 0.78], [-0.2, 0.92], [0.25, 0.9], [random.range(0.45, 0.6), random.range(0.7, 0.85)]]
      : [[-0.55, 0.7], [-0.88, 0.62], [-random.range(0.9, 1.05), 0.3], [-random.range(0.75, 0.95), random.range(-0.05, 0.15)]];
    return [
      ellipse(-0.15, 0.45, random.vary(0.48), random.vary(0.4)),
      ellipse(0.1, 0.05, random.vary(0.3), 0.5, -0.15),
      ellipse(headX, headY, random.vary(0.27, 0.08), random.vary(0.23, 0.08)),
      polygon([[headX - 0.25, headY - 0.04], [headX - 0.2 + earTilt, headY - 0.12 - earHeight], [headX - 0.02, headY - 0.18]]),
      polygon([[headX + 0.04, headY - 0.18], [headX + 0.22 + earTilt, headY - 0.12 - earHeight], [headX + 0.27, headY - 0.03]]),
      tube([[0.14, 0.3], [0.16, 0.86]], 0.07),
      tube([[0.3, 0.3], [0.33, 0.86]], 0.065),
      tube(tailPoints, [0.075, 0.07, 0.065, 0.055]),
      cut(ellipse(headX - 0.1, headY - 0.01, 0.045, 0.03)),
      cut(ellipse(headX + 0.1, headY - 0.01, 0.045, 0.03)),
    ];
  };

  const catWalking = (random) => {
    const tailHeight = random.range(0.6, 0.95);
    const tailHook = random.range(-0.25, 0.15);
    const stride = random.range(0.05, 0.16);
    const headY = random.range(-0.32, -0.18);
    return [
      ellipse(-0.05, 0.05, random.vary(0.58, 0.08), random.vary(0.22)),
      ellipse(0.62, headY, 0.21, 0.19),
      polygon([[0.45, headY - 0.08], [0.47, headY - 0.38], [0.6, headY - 0.17]]),
      polygon([[0.64, headY - 0.17], [0.76, headY - 0.38], [0.8, headY - 0.06]]),
      tube([[-0.45, 0.1], [-0.45 - stride, 0.42], [-0.42 - stride, 0.68]], [0.08, 0.055, 0.05]),
      tube([[-0.25, 0.12], [-0.22 + stride, 0.45], [-0.2 + stride, 0.68]], [0.07, 0.05, 0.05]),
      tube([[0.3, 0.12], [0.3 + stride, 0.45], [0.32 + stride, 0.68]], [0.07, 0.05, 0.05]),
      tube([[0.42, 0.12], [0.42 - stride, 0.45], [0.43 - stride, 0.68]], [0.07, 0.05, 0.05]),
      tube([[-0.58, -0.02], [-0.85, -0.25], [-0.85, -tailHeight + 0.2], [-0.7 + tailHook, -tailHeight]], [0.06, 0.055, 0.05, 0.045]),
      cut(ellipse(0.68, headY - 0.02, 0.035, 0.022)),
    ];
  };

  const cat = (random) => (random.chance(0.55) ? catSitting(random) : catWalking(random));

  const rhino = (random) => {
    const hornLength = random.range(0.62, 0.85);
    const hornLean = random.range(-0.12, 0.02);
    const headDrop = random.range(0, 0.12);
    const legLength = random.range(0.68, 0.82);
    const shapes = [
      ellipse(-0.15, 0.05, random.vary(0.62, 0.06), random.vary(0.36, 0.08)),
      ellipse(0.15, -0.1, 0.34, 0.3),
      blob([[0.3, -0.2], [0.68, -0.02 + headDrop], [1.02, 0.24 + headDrop], [0.98, 0.42 + headDrop], [0.62, 0.42 + headDrop], [0.36, 0.3]]),
      polygon([[0.8, 0.24 + headDrop], [0.84, 0.1 + headDrop], [0.96 + hornLean, 0.24 + headDrop - hornLength], [1.05, 0.3 + headDrop]]),
      polygon([[0.66, 0.1 + headDrop], [0.74 + hornLean, 0.08 + headDrop - hornLength * 0.45], [0.82, 0.16 + headDrop]]),
      polygon([[0.34, -0.14], [random.range(0.28, 0.34), -0.46], [0.48, -0.12]]),
      tube([[-0.74, -0.02], [-0.84, 0.12], [-0.83, 0.28]], 0.025),
      cut(circle(0.6, 0.18 + headDrop, 0.03)),
    ];
    [-0.56, -0.32, 0.08, 0.3].forEach((legX) => {
      shapes.push(tube([[legX, 0.2], [legX + random.range(-0.03, 0.03), legLength]], 0.12));
    });
    return shapes;
  };

  const fox = (random) => {
    const earHeight = random.range(0.28, 0.4);
    const snout = random.range(0.95, 1.1);
    const tailDroop = random.range(-0.15, 0.25);
    const tailBush = random.range(0.13, 0.19);
    const legLength = random.range(0.6, 0.72);
    const shapes = [
      ellipse(-0.05, 0.05, random.vary(0.48, 0.08), random.vary(0.19)),
      ellipse(0.35, 0.0, 0.18, 0.22),
      blob([[0.28, -0.12], [0.52, -0.32], [0.72, -0.28], [snout, -0.12], [0.75, -0.04], [0.48, 0.14]]),
      polygon([[0.48, -0.26], [0.5, -0.28 - earHeight], [0.63, -0.31]]),
      polygon([[0.6, -0.3], [0.7, -0.28 - earHeight * 0.95], [0.75, -0.25]]),
      tube([[-0.45, 0.02], [-0.75, 0.12 + tailDroop * 0.5], [-1.0, 0.08 + tailDroop], [-1.15, -0.06 + tailDroop]], [0.06, tailBush, tailBush * 0.85, 0.025]),
      cut(ellipse(0.7, -0.17, 0.035, 0.022, -0.3)),
    ];
    [-0.4, -0.25, 0.28, 0.4].forEach((legX, index) => {
      const step = index % 2 === 0 ? random.range(-0.08, 0.08) : 0;
      shapes.push(tube([[legX, 0.12], [legX + step, legLength]], [0.05, 0.035]));
    });
    return shapes;
  };

  const whale = (random) => {
    const belly = random.range(0.24, 0.34);
    const back = random.range(-0.42, -0.32);
    const tailLift = random.range(-0.35, 0.05);
    const spout = random.chance(0.75);
    const shapes = [
      blob([[0.9, -0.02], [0.72, back + 0.1], [0.3, back], [-0.2, back + 0.12], [-0.6, -0.08 + tailLift * 0.4], [-0.88, tailLift * 0.8],
        [-0.62, 0.12 + tailLift * 0.3], [-0.1, belly], [0.5, belly + 0.02], [0.84, 0.18]]),
      ellipse(-1.0, tailLift - 0.16, random.vary(0.28), 0.075, -0.85),
      ellipse(-1.0, tailLift + 0.13, random.vary(0.28), 0.075, 0.85),
      ellipse(0.22, belly + 0.08, random.vary(0.24), 0.065, 0.55),
      cut(tube([[0.88, 0.1], [0.6, 0.16], [0.32, 0.12]], 0.018)),
      cut(circle(0.42, 0.04, 0.035)),
    ];
    if (spout) {
      shapes.push(tube([[0.55, back - 0.06], [0.56, back - 0.3], [0.44, back - 0.5]], [0.035, 0.03, 0.02]));
      shapes.push(tube([[0.56, back - 0.3], [0.7, back - 0.48]], [0.03, 0.02]));
      shapes.push(circle(0.38, back - 0.48, 0.03), circle(0.76, back - 0.42, 0.025), circle(0.6, back - 0.6, 0.025));
    }
    return shapes;
  };

  const owl = (random) => {
    const tuftHeight = random.range(0.3, 0.5);
    const eyeSize = random.range(0.13, 0.17);
    const lookX = random.range(-0.04, 0.04);
    const shapes = [
      ellipse(0, 0.15, random.vary(0.46, 0.08), random.vary(0.6, 0.06)),
      ellipse(0, -0.4, 0.44, 0.33),
      polygon([[-0.42, -0.5], [-0.5, -0.5 - tuftHeight], [-0.16, -0.66]]),
      polygon(mirrorX([[-0.42, -0.5], [-0.5, -0.5 - tuftHeight], [-0.16, -0.66]])),
      ellipse(-0.42, 0.2, 0.15, 0.42, 0.18),
      ellipse(0.42, 0.2, 0.15, 0.42, -0.18),
      tube([[-1.15, 0.82], [0, 0.8], [1.15, random.range(0.78, 0.88)]], 0.05),
      tube([[-0.14, 0.7], [-0.16, 0.82]], 0.045),
      tube([[0.14, 0.7], [0.16, 0.82]], 0.045),
      cut(circle(-0.2, -0.4, eyeSize)),
      cut(circle(0.2, -0.4, eyeSize)),
      circle(-0.2 + lookX, -0.4, eyeSize * 0.42),
      circle(0.2 + lookX, -0.4, eyeSize * 0.42),
      cut(polygon([[-0.05, -0.27], [0.05, -0.27], [0, -0.14]])),
    ];
    for (let row = 0; row < 3; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        const featherX = column * 0.16 + (row % 2) * 0.08 - 0.04;
        const featherY = 0.05 + row * 0.15;
        shapes.push(cut(tube([[featherX - 0.05, featherY], [featherX, featherY + 0.04], [featherX + 0.05, featherY]], 0.014)));
      }
    }
    return shapes;
  };

  const elephant = (random) => {
    const earSize = random.range(0.9, 1.15);
    const trunkCurl = random.range(-0.1, 0.25);
    const headY = random.range(-0.32, -0.2);
    const legLength = random.range(0.76, 0.86);
    const shapes = [
      ellipse(-0.15, 0.0, random.vary(0.6, 0.06), random.vary(0.4, 0.06)),
      ellipse(0.45, headY, 0.3, 0.3),
      tube([[-0.73, -0.1], [-0.8, 0.15], [-0.8, 0.38]], [0.025, 0.02, 0.035]),
    ];
    [-0.6, -0.36, 0.05, 0.26].forEach((legX) => {
      shapes.push(tube([[legX, 0.2], [legX, legLength]], 0.12));
    });
    shapes.push(cut(tube([[0.6, headY + 0.28], [0.78, headY + 0.38], [0.92, headY + 0.3]], 0.035)));
    shapes.push(tube([[0.68, headY - 0.02], [0.84, headY + 0.25], [0.86, headY + 0.6], [0.9 + trunkCurl, headY + 0.92], [1.02 + trunkCurl, headY + 0.85]], [0.12, 0.1, 0.075, 0.055, 0.045]));
    const earPoints = [[0.12, -0.52], [0.38, -0.6], [0.48, -0.22], [0.38, 0.16], [0.14, 0.1], [0.02, -0.2]]
      .map(([x, y]) => [0.27 + (x - 0.27) * earSize, headY + 0.05 + (y + 0.2) * earSize]);
    shapes.push(blob(earPoints));
    shapes.push(cut(tube([earPoints[1], earPoints[2], earPoints[3]], 0.022)));
    shapes.push(cut(circle(0.58, headY - 0.04, 0.035)));
    return shapes;
  };

  const rabbit = (random) => {
    const earLength = random.range(0.38, 0.52);
    const earLean = random.range(-0.5, 0.05);
    const floppy = random.chance(0.3);
    const headX = random.range(0.36, 0.46);
    const headY = random.range(-0.18, -0.05);
    const earAt = (baseX, baseY, angle, length) => ellipse(baseX + Math.sin(angle) * length, baseY - Math.cos(angle) * length, 0.085, length, angle);
    return [
      ellipse(-0.2, 0.35, random.vary(0.46, 0.08), random.vary(0.38, 0.08)),
      ellipse(0.08, 0.22, 0.38, 0.33),
      ellipse(headX, headY, 0.24, 0.2, 0.2),
      earAt(headX - 0.06, headY - 0.12, earLean, earLength),
      earAt(headX + 0.04, headY - 0.1, floppy ? earLean + 1.2 : earLean + 0.25, earLength * (floppy ? 0.85 : 0.95)),
      circle(-0.68, 0.2, random.range(0.11, 0.15)),
      ellipse(-0.08, 0.72, 0.3, 0.07),
      tube([[0.3, 0.35], [0.36, 0.72]], 0.06),
      cut(circle(headX + 0.06, headY - 0.04, 0.035)),
    ];
  };

  const bear = (random) => {
    const humpHeight = random.range(0.18, 0.3);
    const headDrop = random.range(-0.08, 0.12);
    const legLength = random.range(0.68, 0.8);
    const shapes = [
      ellipse(-0.1, 0.0, random.vary(0.62, 0.06), random.vary(0.38, 0.06)),
      ellipse(0.2, -0.12, 0.32, humpHeight + 0.1),
      ellipse(0.62, -0.02 + headDrop, 0.27, 0.23, 0.15),
      ellipse(0.82, 0.08 + headDrop, 0.12, 0.09, 0.5),
      circle(0.5, -0.24 + headDrop, 0.1),
      circle(0.68, -0.26 + headDrop, 0.09),
      circle(-0.72, -0.08, 0.07),
      cut(circle(0.7, -0.04 + headDrop, 0.03)),
    ];
    [-0.55, -0.3, 0.15, 0.36].forEach((legX) => {
      shapes.push(tube([[legX, 0.15], [legX + random.range(-0.04, 0.04), legLength]], [0.14, 0.12]));
      shapes.push(ellipse(legX + 0.06, legLength + 0.03, 0.14, 0.06));
    });
    return shapes;
  };

  const snail = (random) => {
    const shellRadius = random.range(0.48, 0.6);
    const shellX = random.range(-0.25, -0.1);
    const shellY = 0.55 - shellRadius - random.range(0.02, 0.08);
    const turns = random.range(2.6, 3.4);
    const stalk = random.range(0.3, 0.42);
    const spiral = [];
    for (let step = 0; step <= 48; step += 1) {
      const progress = step / 48;
      const angle = progress * turns * Math.PI * 2;
      const radius = shellRadius * 0.86 * progress;
      spiral.push([shellX + Math.cos(angle) * radius, shellY + Math.sin(angle) * radius]);
    }
    return [
      blob([[-0.95, 0.66], [-0.5, 0.56], [0.4, 0.56], [0.68, 0.38], [0.82, 0.08], [0.95, 0.02], [1.02, 0.18], [0.96, 0.5], [0.8, 0.7], [-0.88, 0.76]]),
      circle(shellX, shellY, shellRadius),
      cut(tube(spiral, 0.026)),
      tube([[0.88, 0.08], [0.95 + random.range(0, 0.08), 0.08 - stalk]], 0.024),
      circle(0.95 + 0.04, 0.08 - stalk - 0.02, 0.05),
      tube([[0.82, 0.1], [0.78, 0.1 - stalk * 0.8]], 0.022),
      circle(0.78, 0.1 - stalk * 0.8 - 0.02, 0.045),
    ];
  };

  const turtle = (random) => {
    const shellHeight = random.range(0.45, 0.6);
    const shellWidth = random.range(0.66, 0.76);
    const neckReach = random.range(0.85, 1.0);
    const dome = [];
    for (let step = 0; step <= 24; step += 1) {
      const angle = Math.PI + (step / 24) * Math.PI;
      dome.push([Math.cos(angle) * shellWidth, 0.25 + Math.sin(angle) * shellHeight]);
    }
    const scuteY = 0.25 - shellHeight * 0.45;
    return [
      polygon(dome),
      ellipse(0, 0.27, shellWidth + 0.07, 0.08),
      tube([[shellWidth - 0.1, 0.24], [neckReach - 0.15, 0.1]], 0.09),
      ellipse(neckReach, 0.08, 0.17, 0.12, -0.1),
      ellipse(-shellWidth * 0.62, 0.42, 0.12, 0.16, 0.3),
      ellipse(shellWidth * 0.6, 0.42, 0.12, 0.16, -0.3),
      polygon([[-shellWidth - 0.02, 0.22], [-shellWidth - 0.2, 0.3], [-shellWidth - 0.02, 0.3]]),
      cut(tube([[-shellWidth * 0.95, 0.2], [-shellWidth * 0.5, scuteY], [shellWidth * 0.5, scuteY], [shellWidth * 0.95, 0.2]], 0.015)),
      cut(tube([[-shellWidth * 0.25, scuteY], [-shellWidth * 0.3, 0.2]], 0.015)),
      cut(tube([[shellWidth * 0.25, scuteY], [shellWidth * 0.3, 0.2]], 0.015)),
      cut(tube([[-shellWidth * 0.2, scuteY], [0, 0.25 - shellHeight * 0.95]], 0.014)),
      cut(tube([[shellWidth * 0.2, scuteY], [0, 0.25 - shellHeight * 0.95]], 0.014)),
      cut(circle(neckReach + 0.06, 0.04, 0.028)),
    ];
  };

  const antler = (random, rootX, rootY, spread) => {
    const height = random.range(0.42, 0.6);
    const beam = [[rootX, rootY], [rootX - 0.1 * spread, rootY - height * 0.4], [rootX - 0.06 * spread, rootY - height * 0.8], [rootX + 0.08 * spread, rootY - height]];
    const shapes = [tube(beam, [0.04, 0.036, 0.032, 0.026])];
    const tines = random.int(2, 4);
    for (let index = 0; index < tines; index += 1) {
      const anchor = beam[Math.min(beam.length - 1, index + 1)];
      const length = random.range(0.12, 0.2);
      shapes.push(tube([anchor, [anchor[0] + length * 0.7 * spread, anchor[1] - length]], [0.03, 0.024]));
    }
    return shapes;
  };

  const deer = (random) => {
    const neckLean = random.range(0.4, 0.55);
    const headY = random.range(-0.55, -0.42);
    const legLength = random.range(0.85, 0.95);
    const headX = neckLean + 0.08;
    const shapes = [
      ellipse(-0.1, 0.05, random.vary(0.48, 0.06), random.vary(0.21, 0.08)),
      tube([[0.25, 0.0], [neckLean - 0.05, -0.25], [neckLean, headY + 0.05]], [0.13, 0.09, 0.075]),
      ellipse(headX, headY, 0.14, 0.09, 0.4),
      ellipse(headX + 0.13, headY + 0.07, 0.09, 0.06, 0.4),
      ellipse(headX - 0.13, headY - 0.06, 0.1, 0.035, -0.5),
      ellipse(-0.58, -0.04, 0.07, 0.04, -0.5),
      tube([[-0.45, 0.12], [-0.5, 0.5], [-0.42, legLength]], [0.055, 0.035, 0.03]),
      tube([[-0.32, 0.14], [-0.34, 0.5], [-0.3, legLength]], [0.05, 0.035, 0.03]),
      tube([[0.2, 0.15], [0.22, 0.55], [0.2, legLength]], [0.045, 0.035, 0.03]),
      tube([[0.32, 0.12], [0.36, 0.52], [0.33, legLength]], [0.045, 0.035, 0.03]),
      cut(circle(headX + 0.02, headY - 0.02, 0.025)),
    ];
    return shapes.concat(antler(random, headX - 0.06, headY - 0.06, -0.8), antler(random, headX + 0.04, headY - 0.06, 1.3));
  };

  const SPECIES = { hedgehog, cat, rhino, fox, whale, owl, elephant, rabbit, bear, snail, turtle, deer };
  const SPECIES_NAMES = Object.keys(SPECIES);

  const catmullRom = (previous, from, to, after, amount) => {
    const squared = amount * amount;
    const cubed = squared * amount;
    return [0, 1].map((axis) => 0.5 * ((2 * from[axis]) + (-previous[axis] + to[axis]) * amount
      + (2 * previous[axis] - 5 * from[axis] + 4 * to[axis] - after[axis]) * squared
      + (-previous[axis] + 3 * from[axis] - 3 * to[axis] + after[axis]) * cubed));
  };

  const sampleSpline = (points, closed, perSegment) => {
    const count = points.length;
    const at = (index) => (closed ? points[(index + count) % count] : points[clamp(index, 0, count - 1)]);
    const segments = closed ? count : count - 1;
    const samples = [];
    for (let segment = 0; segment < segments; segment += 1) {
      for (let step = 0; step < perSegment; step += 1) {
        samples.push(catmullRom(at(segment - 1), at(segment), at(segment + 1), at(segment + 2), step / perSegment));
      }
    }
    if (!closed) {
      samples.push(points[count - 1]);
    }
    return samples;
  };

  const radiusAlong = (radii, progress) => {
    if (radii.length === 1) {
      return radii[0];
    }
    const position = progress * (radii.length - 1);
    const index = Math.min(radii.length - 2, Math.floor(position));
    return lerp(radii[index], radii[index + 1], position - index);
  };

  const paintShape = (context, shape) => {
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

  const paintMask = (shapes, pose) => {
    const mask = document.createElement('canvas');
    mask.width = MASK_SIZE;
    mask.height = MASK_SIZE;
    const context = mask.getContext('2d', { willReadFrequently: true });
    context.translate(MASK_SIZE / 2, MASK_SIZE / 2);
    context.scale(MASK_PER_UNIT * pose.facing * pose.stretchX, MASK_PER_UNIT * pose.stretchY);
    context.rotate(pose.tilt);
    context.fillStyle = '#000';
    shapes.forEach((shape) => paintShape(context, shape));
    const pixels = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
    const inside = new Uint8Array(MASK_SIZE * MASK_SIZE);
    for (let index = 0; index < inside.length; index += 1) {
      inside[index] = pixels[index * 4 + 3] > 127 ? 1 : 0;
    }
    return inside;
  };

  const chamferDistance = (inside, wanted) => {
    const size = MASK_SIZE;
    const distance = new Float32Array(size * size);
    for (let index = 0; index < distance.length; index += 1) {
      distance[index] = inside[index] === wanted ? 1e6 : 0;
    }
    const relax = (index, neighbour, cost) => {
      if (distance[neighbour] + cost < distance[index]) {
        distance[index] = distance[neighbour] + cost;
      }
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (x > 0) { relax(index, index - 1, 1); }
        if (y > 0) { relax(index, index - size, 1); }
        if (x > 0 && y > 0) { relax(index, index - size - 1, Math.SQRT2); }
        if (x < size - 1 && y > 0) { relax(index, index - size + 1, Math.SQRT2); }
      }
    }
    for (let y = size - 1; y >= 0; y -= 1) {
      for (let x = size - 1; x >= 0; x -= 1) {
        const index = y * size + x;
        if (x < size - 1) { relax(index, index + 1, 1); }
        if (y < size - 1) { relax(index, index + size, 1); }
        if (x < size - 1 && y < size - 1) { relax(index, index + size + 1, Math.SQRT2); }
        if (x > 0 && y < size - 1) { relax(index, index + size - 1, Math.SQRT2); }
      }
    }
    return distance;
  };

  const parseColour = (value) => {
    const text = String(value || '').trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(text);
    if (hex) {
      return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16));
    }
    const numbers = text.match(/[\d.]+/g);
    return numbers && numbers.length >= 3 ? numbers.slice(0, 3).map(Number) : null;
  };

  const DARK = window.matchMedia('(prefers-color-scheme: dark)');

  const isDark = () => {
    const root = document.documentElement.classList;
    if (root.contains('force-dark') || root.contains('force-light')) {
      return root.contains('force-dark');
    }
    return DARK.matches;
  };

  const readInks = (host) => {
    const style = getComputedStyle(host);
    const primary = parseColour(style.getPropertyValue('--md-primary')) || [44, 86, 151];
    const deep = parseColour(style.getPropertyValue('--md-on-primary-container')) || primary;
    return {
      core: isDark() ? primary : primary.map((channel, index) => lerp(channel, deep[index], 0.35)),
      rim: parseColour(style.getPropertyValue('--blob-3')) || [23, 223, 220],
      strength: isDark() ? 0.9 : 1,
    };
  };

  const planLayout = (random, width, height) => ({
    size: random.range(0.85, 1.05) * Math.min(width, height),
    right: random.chance(0.4),
    bottom: random.chance(0.7),
    overflowX: random.range(-0.02, 0.06),
    overflowY: random.range(-0.02, 0.04),
  });

  const maskBounds = (inside) => {
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
    const toUnits = (maskPixel) => (maskPixel - MASK_SIZE / 2) / MASK_PER_UNIT;
    return { minX: toUnits(bounds.minX), maxX: toUnits(bounds.maxX), minY: toUnits(bounds.minY), maxY: toUnits(bounds.maxY) };
  };

  const placeLayout = (plan, bounds, width, height) => {
    const widthUnits = bounds.maxX - bounds.minX;
    const heightUnits = bounds.maxY - bounds.minY;
    const size = Math.min(plan.size, 2 * width * 0.95 / widthUnits, 2 * height * 0.98 / heightUnits);
    const unit = size / 2;
    const marginX = -plan.overflowX * size;
    const marginY = -plan.overflowY * size;
    return {
      size,
      centerX: plan.right ? width - marginX - bounds.maxX * unit : marginX - bounds.minX * unit,
      centerY: plan.bottom ? height - marginY - bounds.maxY * unit : marginY - bounds.minY * unit,
    };
  };

  const mixInk = (inks, amount, alpha) => {
    const channels = inks.core.map((channel, index) => Math.round(lerp(channel, inks.rim[index], amount)));
    return 'rgba(' + channels.join(',') + ',' + alpha.toFixed(3) + ')';
  };

  const dotsFor = (random, layout, field) => {
    const dots = [];
    const spacing = layout.size / 62;
    const screenPerMask = layout.size / 2 / MASK_PER_UNIT;
    const reach = layout.size * MASK_SPAN / 4;
    const rowHeight = spacing * 0.866;
    for (let row = 0, y = layout.centerY - reach; y < layout.centerY + reach; row += 1, y += rowHeight) {
      for (let x = layout.centerX - reach + (row % 2) * spacing / 2; x < layout.centerX + reach; x += spacing) {
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
            x: dotX, y: dotY,
            radius: spacing * 0.5 * (0.45 + 0.55 * rim) * (0.95 + 0.3 * core) * sizeJitter,
            alpha: 0.5 + 0.25 * rim + 0.25 * core,
            tint: clamp(0.65 - 0.65 * core + inkJitter),
          });
        } else {
          const gapUnits = field.gap[cell] / MASK_PER_UNIT;
          if (roll > 0.14 * Math.exp(-gapUnits / 0.05) + 0.004) {
            continue;
          }
          dots.push({ x: dotX, y: dotY, radius: spacing * random.range(0.1, 0.24), alpha: 0.35, tint: clamp(0.8 + inkJitter) });
        }
      }
    }
    return dots;
  };

  const host = () => document.getElementById('wt');
  const canvas = () => document.getElementById('backdrop');

  const randomSeed = () => Math.floor(Math.random() * 4294967296);
  const sessionSeeds = {};
  const current = { workspace: '', seed: randomSeed(), species: '', wantedSpecies: '', built: null };

  const build = (width, height) => {
    const random = randomTools(current.seed);
    const rolled = SPECIES_NAMES[Math.floor(random.next() * SPECIES_NAMES.length)];
    current.species = SPECIES[current.wantedSpecies] ? current.wantedSpecies : rolled;
    const plan = planLayout(random, width, height);
    const pose = {
      facing: plan.right ? -1 : 1,
      tilt: random.range(-0.07, 0.07),
      stretchX: random.range(0.92, 1.08),
      stretchY: random.range(0.92, 1.08),
    };
    if (random.chance(0.25)) {
      pose.facing = -pose.facing;
    }
    const inside = paintMask(SPECIES[current.species](random), pose);
    const field = { inside, depth: chamferDistance(inside, 1), gap: chamferDistance(inside, 0) };
    const layout = placeLayout(plan, maskBounds(inside), width, height);
    return { key: current.seed + ':' + current.species + ':' + width + 'x' + height, dots: dotsFor(random, layout, field) };
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
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!width || !height) {
      return;
    }
    const key = current.seed + ':' + (current.wantedSpecies || '?') + ':' + width + 'x' + height;
    if (!current.built || current.built.key.split(':')[0] !== String(current.seed) || !current.built.key.endsWith(width + 'x' + height) || (current.wantedSpecies && current.species !== current.wantedSpecies)) {
      current.built = build(width, height);
    }
    const inks = readInks(host());
    current.built.dots.forEach((dot) => {
      context.fillStyle = mixInk(inks, dot.tint, dot.alpha * inks.strength);
      context.beginPath();
      context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      context.fill();
    });
    return key;
  };

  const debounce = (action, waitMs) => {
    let timer = 0;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(action, waitMs);
    };
  };

  window.whoseTurnBackdrop = {
    species: SPECIES_NAMES.slice(),
    seeded: mulberry32,
    get current() { return { workspace: current.workspace, species: current.species, seed: current.seed }; },
    show: (request) => {
      const wanted = request || {};
      const workspace = String(wanted.workspace || '');
      if (!sessionSeeds[workspace]) {
        sessionSeeds[workspace] = randomSeed();
      }
      const seed = wanted.seed !== undefined ? Number(wanted.seed) >>> 0 : sessionSeeds[workspace];
      const species = SPECIES[wanted.species] ? wanted.species : '';
      if (workspace === current.workspace && seed === current.seed && species === current.wantedSpecies && current.built) {
        return window.whoseTurnBackdrop.current;
      }
      current.workspace = workspace;
      current.seed = seed;
      current.wantedSpecies = species;
      current.built = null;
      paint();
      return window.whoseTurnBackdrop.current;
    },
    repaint: paint,
  };

  DARK.addEventListener('change', paint);
  window.addEventListener('resize', debounce(paint, 200));
})();

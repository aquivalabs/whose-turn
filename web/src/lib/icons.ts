// Inline SVG paths used by the window; the workspace icon is generated from the workspace id and tinted by its palette.
export const SPARKLE =
  'M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM5 15l.9 2.6 2.6.9-2.6.9L5 22l-.9-2.6-2.6-.9 2.6-.9L5 15zm14-2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z';
export const COPY =
  'M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16h-9V7h9v14z';
export const GEAR =
  'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5H9l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h6l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z';
export const NEW_RELEASES =
  'M23 12l-2.4-2.8.3-3.7-3.6-.8-1.9-3.2L12 3 8.6 1.5 6.7 4.7l-3.6.8.3 3.7L1 12l2.4 2.8-.3 3.7 3.6.8 1.9 3.2L12 21l3.4 1.5 1.9-3.2 3.6-.8-.3-3.7L23 12zm-10 5h-2v-2h2v2zm0-4h-2V7h2v6z';
export const BUG =
  'M19 8h-1.8a5.9 5.9 0 0 0-1.3-1.9l1.6-1.6-1.4-1.4-1.9 1.9A5.7 5.7 0 0 0 12 4.5a5.7 5.7 0 0 0-2.2.5L7.9 3.1 6.5 4.5l1.6 1.6A5.9 5.9 0 0 0 6.8 8H5v2h1.2a7 7 0 0 0 0 1v1H5v2h1.3a6 6 0 0 0 11.4 0H19v-2h-1.2v-1a7 7 0 0 0 0-1H19V8zm-7 10a4 4 0 0 1-4-4v-3a4 4 0 0 1 8 0v3a4 4 0 0 1-4 4zm-1-7h2v5h-2z';

export interface IconDot {
  cx: string;
  cy: string;
  r: string;
  opacity: string;
}

const hashOf = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Two or three letters that stand for a workspace: the initials of its words, or the first letters of a single word; one letter alone made projects look alike (RMA-137). */
export const glyphOf = (name: string) => {
  const words = String(name || '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? words.slice(0, 3).map((word) => word.charAt(0))
      : (words[0] || '?').slice(0, 2).split('');
  return letters.join('').toUpperCase();
};
export const glyphSize = (glyph: string) =>
  (({ 1: 17, 2: 14, 3: 11 }) as Record<number, number>)[glyph.length] || 11;

/** The dots and the glyph of a workspace icon, from a seeded random so the icon is stable per workspace. */
export const workspaceIconParts = (
  workspace: { id: string; name?: string },
  seeded: (seed: number) => () => number,
) => {
  const random = seeded(hashOf(workspace.id));
  const dots: IconDot[] = [];
  const count = 3 + Math.floor(random() * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 9 + random() * 7;
    dots.push({
      cx: (18 + Math.cos(angle) * distance).toFixed(1),
      cy: (18 + Math.sin(angle) * distance).toFixed(1),
      r: (1.6 + random() * 2.2).toFixed(1),
      opacity: (0.35 + random() * 0.4).toFixed(2),
    });
  }
  const glyph = glyphOf(workspace.name || workspace.id);
  return { dots, glyph, fontSize: glyphSize(glyph) };
};

export interface IconColours {
  fill: string;
  ink: string;
  dot: string;
}

/** The workspace icon as a standalone SVG document, drawn exactly as the rail draws it; the favicon is this. */
export const workspaceIconSvg = (parts: ReturnType<typeof workspaceIconParts>, colours: IconColours) => {
  const dots = parts.dots
    .map(
      (dot) =>
        `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colours.dot}" opacity="${dot.opacity}"/>`,
    )
    .join('');
  const y = parts.fontSize >= 17 ? 24 : 23;
  const glyph = parts.glyph.replace(/[&<>]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="${colours.fill}"/>${dots}` +
    `<text x="18" y="${y}" text-anchor="middle" font-size="${parts.fontSize}" font-weight="700" letter-spacing="-0.5" font-family="Roboto, Inter, system-ui, sans-serif" fill="${colours.ink}">${glyph}</text></svg>`
  );
};
export const BELL =
  'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z';
export const BELL_OFF =
  'M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z';

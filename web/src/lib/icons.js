// Inline SVG paths used by the window; the workspace icon is generated from the workspace id and tinted by its palette.
export const SPARKLE = 'M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM5 15l.9 2.6 2.6.9-2.6.9L5 22l-.9-2.6-2.6-.9 2.6-.9L5 15zm14-2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z';
export const GEAR = 'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5H9l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h6l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z';
export const BUG = 'M19 8h-1.8a5.9 5.9 0 0 0-1.3-1.9l1.6-1.6-1.4-1.4-1.9 1.9A5.7 5.7 0 0 0 12 4.5a5.7 5.7 0 0 0-2.2.5L7.9 3.1 6.5 4.5l1.6 1.6A5.9 5.9 0 0 0 6.8 8H5v2h1.2a7 7 0 0 0 0 1v1H5v2h1.3a6 6 0 0 0 11.4 0H19v-2h-1.2v-1a7 7 0 0 0 0-1H19V8zm-7 10a4 4 0 0 1-4-4v-3a4 4 0 0 1 8 0v3a4 4 0 0 1-4 4zm-1-7h2v5h-2z';

const hashOf = (text) => { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };

/** The dots and the letter of a workspace icon, from a seeded random so the icon is stable per workspace. */
export const workspaceIconParts = (workspace, seeded) => {
  const random = seeded(hashOf(workspace.id));
  const dots = [];
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2, distance = 9 + random() * 7;
    dots.push({ cx: (18 + Math.cos(angle) * distance).toFixed(1), cy: (18 + Math.sin(angle) * distance).toFixed(1), r: (1.6 + random() * 2.2).toFixed(1), opacity: (0.35 + random() * 0.4).toFixed(2) });
  }
  return { dots, letter: (workspace.name || workspace.id).trim().charAt(0).toUpperCase() };
};

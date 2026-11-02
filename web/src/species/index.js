/** Every species and base description bundled for the window; a new JSON file in this folder needs no other change. */
const files = import.meta.glob(['./*.json', './base/*.json'], { eager: true, import: 'default' });

export const registry = Object.fromEntries(Object.entries(files).map(([path, spec]) => [path.replace(/^.*\//, '').replace(/\.json$/, ''), spec]));

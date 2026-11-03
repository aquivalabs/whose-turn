/** Every species and base description bundled for the window; a new JSON file in this folder needs no other change. */
import type { Registry, SpeciesSpec } from '../lib/species.ts';

const files = import.meta.glob<SpeciesSpec>(['./*.json', './base/*.json'], {
  eager: true,
  import: 'default',
});

export const registry: Registry = Object.fromEntries(
  Object.entries(files).map(([path, spec]) => [
    path.replace(/^.*\//, '').replace(/\.json$/, ''),
    spec,
  ]),
);

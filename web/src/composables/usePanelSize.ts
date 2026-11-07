import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { useLocalStorage } from '@vueuse/core';

type Sizes = Record<string, number>;

/** The line under the rows that says how many are hidden. */
export const MORE_LINE = 30;

/** Keeps a dragged size between the floor and the room there is. */
export const clampSize = (value: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, value)));

/** The height that shows an island's header and its first full row, plus the "more" line when rows follow. */
export const floorHeight = (rowBottom: number, rows: number) =>
  Math.ceil(rowBottom + (rows > 1 ? MORE_LINE : 0));

export interface Neighbour {
  collapsed: boolean;
  height: number;
  floor: number;
}

/** The tallest an island may be: the column minus the gaps and what every neighbour needs at least. */
export const ceilingHeight = (column: number, gap: number, neighbours: Neighbour[]) =>
  column -
  gap * neighbours.length -
  neighbours.reduce((sum, item) => sum + (item.collapsed ? item.height : item.floor), 0);

/** The remembered size under one key, in `wt-panel-sizes`; an empty key reads null and saves nothing. ADR 0002. */
export const usePanelSize = (key: MaybeRefOrGetter<string>) => {
  const sizes = useLocalStorage<Sizes>('wt-panel-sizes', {}, { writeDefaults: false });
  const size = computed(() => sizes.value[toValue(key)] ?? null);
  const set = (value: number | null) => {
    const name = toValue(key);
    if (!name) {
      return;
    }
    const { [name]: dropped, ...rest } = sizes.value;
    void dropped;
    sizes.value = value === null ? rest : { ...rest, [name]: value };
  };
  return { size, set };
};

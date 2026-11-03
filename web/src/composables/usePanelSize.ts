import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { snapshot } from '@/store.ts';

type Sizes = Record<string, Record<string, number>>;

/** The line under the rows that says how many are hidden; the floor leaves room for it. */
export const MORE_LINE = 30;

/** Keeps a dragged size between the floor and the room there is; a floor above the room wins. */
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

/** The remembered size of one panel in the open workspace, in `wt-panel-sizes`; the same key is the same size in every component. ADR 0002. */
export const usePanelSize = (id: string) => {
  const sizes = useLocalStorage<Sizes>('wt-panel-sizes', {}, { writeDefaults: false });
  const size = computed(() => sizes.value[snapshot.workspace.id]?.[id] ?? null);
  const set = (value: number | null) => {
    const workspace = snapshot.workspace.id;
    const { [id]: dropped, ...rest } = sizes.value[workspace] ?? {};
    void dropped;
    sizes.value = {
      ...sizes.value,
      [workspace]: value === null ? rest : { ...rest, [id]: value },
    };
  };
  return { size, set };
};

import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

/** The remembered fold of one panel, in the `wt-collapsed` list all panels share. ADR 0002. */
export const useFold = (id: string) => {
  const folded = useLocalStorage<string[]>('wt-collapsed', [], { writeDefaults: false });
  const collapsed = computed(() => folded.value.includes(id));
  const toggle = () => {
    folded.value = collapsed.value
      ? folded.value.filter((item) => item !== id)
      : [...folded.value, id];
  };
  return { collapsed, toggle };
};

import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

// The remembered fold of one panel: one browser list for all panels, each instance sees the others' writes through the storage event VueUse sends.
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

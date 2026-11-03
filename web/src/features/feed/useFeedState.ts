// The feed island's own choices: source filter, view, search and open groups. Module scope, so they outlive the island when the first-run card replaces the dashboard and comes back.
import { reactive } from 'vue';
import { useLocalStorage } from '@vueuse/core';

const state = reactive({
  source: 'all',
  view: useLocalStorage('wt-feed-view', 'ticket', { writeDefaults: false }),
  query: '',
  openGroups: new Set<string>(),
});

export const useFeedState = () => state;

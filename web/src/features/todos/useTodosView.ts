// Whether the to-do island lists done items too. Module scope, so the choice outlives the island when the first-run card replaces the dashboard and comes back.
import { ref } from 'vue';

const showDone = ref(false);

export const useTodosView = () => showDone;

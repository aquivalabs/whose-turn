// Which rows the your-move island lists, open or handled. Module scope, so the choice outlives the island when the first-run card replaces the dashboard and comes back.
import { ref } from 'vue';

const view = ref('open');

export const useMoveView = () => view;

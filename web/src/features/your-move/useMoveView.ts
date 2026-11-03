// Which rows the your-move island lists, open or handled.
import { ref } from 'vue';

const view = ref('open');

export const useMoveView = () => view;

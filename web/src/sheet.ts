import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import SheetPage from './features/sheet/SheetPage.vue';
import { i18n } from './i18n/index.ts';

createApp(SheetPage).use(i18n).mount('#app');

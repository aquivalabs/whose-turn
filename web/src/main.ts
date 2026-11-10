import { createApp } from 'vue';
import './backdrop.ts';
import './styles/tokens.css';
import './styles/base.css';
import { installTooltips } from './lib/tooltips.ts';
import { start } from './store.ts';
import App from './App.vue';
import { installScheme } from './scheme.ts';
import { i18n } from './i18n/index.ts';

createApp(App).use(i18n).mount('#app');
start();
installTooltips();
installScheme();

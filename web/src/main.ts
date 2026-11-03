import { createApp } from 'vue';
import './backdrop.ts';
import './styles/tokens.css';
import './styles/base.css';
import { installTooltips } from './lib/tooltips.ts';
import App from './App.vue';

createApp(App).mount('#app');
installTooltips();

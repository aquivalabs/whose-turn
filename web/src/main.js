import { createApp } from 'vue';
import './backdrop.js';
import './styles/tokens.css';
import './styles/base.css';
import { installTooltips } from './lib/tooltips.js';
import App from './App.vue';

createApp(App).mount('#app');
installTooltips();

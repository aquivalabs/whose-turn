import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import ReportPage from './features/report/ReportPage.vue';
import { i18n } from './i18n/index.ts';
import { installScheme } from './scheme.ts';

createApp(ReportPage).use(i18n).mount('#app');
installScheme();

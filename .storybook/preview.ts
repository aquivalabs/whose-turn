// docs/mechanisms/storybook.md
import type { Preview } from '@storybook/vue3';
import { setup } from '@storybook/vue3';
import '../web/src/styles/tokens.css';
import '../web/src/styles/base.css';
import { i18n } from '../web/src/i18n/index.ts';
import { installScheme, setScheme } from '../web/src/scheme.ts';
import type { SchemeChoice } from '../web/src/scheme.ts';

setup((app) => {
  app.use(i18n);
});
document.body.classList.add('page');
installScheme();

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: 'Colour scheme',
      toolbar: { title: 'Scheme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { scheme: 'light' },
  decorators: [
    (story, context) => {
      setScheme(context.globals.scheme as SchemeChoice);
      return { components: { story }, template: '<div class="app storybook-app"><div class="dashboard storybook-dashboard"><story /></div></div>' };
    },
  ],
  parameters: { layout: 'padded' },
};

export default preview;

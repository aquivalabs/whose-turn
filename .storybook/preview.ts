// docs/mechanisms/storybook.md
import type { Preview } from '@storybook/vue3';
import { computed } from 'vue';
import type { Component } from 'vue';
import { setup } from '@storybook/vue3';
import '../web/src/styles/tokens.css';
import '../web/src/styles/base.css';
import { i18n } from '../web/src/i18n/index.ts';
import { installScheme, setScheme } from '../web/src/scheme.ts';
import type { SchemeChoice } from '../web/src/scheme.ts';
import { installFakeServer, resetServer } from '../web/src/stories/fake-server.ts';
import { LazyMotion, MotionConfig } from 'motion-v';
import { loadFeatures, reduced } from '../web/src/motion.ts';

setup((app) => {
  app.use(i18n);
});
installFakeServer();
document.body.classList.add('page');
installScheme();

const preview: Preview = {
  render: (args, { component }) => ({
    components: { Component: component as Component },
    setup: () => {
      const names = Object.keys((component as { props?: object } | undefined)?.props ?? {});
      const props = computed(() => Object.fromEntries(Object.entries(args).filter(([name]) => names.includes(name) || /^on[A-Z]/.test(name))));
      return { props };
    },
    template: '<Component v-bind="props" />',
  }),
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
      return {
        components: { story, LazyMotion, MotionConfig },
        setup: () => {
          resetServer();
          return { loadFeatures, reduced };
        },
        template: `<LazyMotion :features="loadFeatures"><MotionConfig reduced-motion="user" :skip-animations="reduced">
          <div class="app storybook-app"><div class="dashboard storybook-dashboard"><story /></div></div>
        </MotionConfig></LazyMotion>`,
      };
    },
  ],
  parameters: { layout: 'padded' },
};

export default preview;

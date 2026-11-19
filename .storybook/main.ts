// docs/mechanisms/storybook.md
import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  stories: ['../web/src/**/stories/*.stories.ts'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;

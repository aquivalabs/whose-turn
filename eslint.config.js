// ESLint flat config: the window (web/src) and the Node server tree; Prettier owns formatting.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

const webFiles = ['web/src/**/*.{ts,vue}'];
const nodeGlobals = Object.fromEntries(
  ['process', 'Buffer', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'URL', 'URLSearchParams', 'fetch', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder', 'structuredClone', 'queueMicrotask', 'Headers', 'Request', 'Response', 'FormData', 'Blob', 'WebSocket', 'EventSource', 'performance', 'BroadcastChannel'].map((name) => [name, 'readonly']),
);
const serverFiles = ['lib/**/*.mjs', 'connectors/**/*.mjs', 'server.mjs', 'test/**/*.mjs'];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((cfg) => ({ ...cfg, files: webFiles })),
  ...pluginVue.configs['flat/recommended'].map((cfg) => ({ ...cfg, files: cfg.files ?? webFiles })),
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    files: webFiles,
    rules: {
      // frontend-js:conventions
      'prefer-arrow-callback': 'error',
      'func-style': ['error', 'expression'],
      quotes: ['error', 'single', { avoidEscape: true }],
      curly: ['error', 'all'],
      'id-length': [
        'error',
        {
          min: 3,
          properties: 'never',
          exceptions: ['id', 'to', 'at', 'on', 'of', 'in', 'is', 'ui', 'x', 'y'],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message: 'Import through the @ alias (web/src) instead of climbing with ../../.',
            },
          ],
        },
      ],
      // frontend-vue:sfc-conventions
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-macros-order': [
        'error',
        { order: ['defineProps', 'defineEmits', 'defineModel', 'defineSlots'] },
      ],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/no-v-html': 'error',
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: serverFiles,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    rules: {
      'prefer-arrow-callback': 'error',
      'func-style': ['error', 'expression'],
      quotes: ['error', 'single', { avoidEscape: true }],
      curly: ['error', 'all'],
      'id-length': ['error', { min: 3, properties: 'never', exceptions: ['id', 'to', 'at', 'on', 'of', 'in', 'is', 'x', 'y', 'pr', 'me', 'a', 'b'] }],
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['test/**/*.mjs'],
    rules: { 'id-length': 'off' },
  },
  prettier,
  // docs/adr/0010: eslint-config-prettier switches curly off; Prettier allows curly: 'all', so it comes back here.
  { files: [...webFiles, ...serverFiles], rules: { curly: ['error', 'all'] } },
);

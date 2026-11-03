// ESLint flat config: the window (web/src) from the frontend-vue:tooling template. Prettier owns formatting; this file owns correctness and the house style. The server tree (lib, connectors, bin, server.mjs, test) is plain Node ESM with no Vue and no TypeScript parser.
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
      // Added to the template: 'ui' (the store's window state), 'x' and 'y' (coordinates), and properties: 'never', because property names come from wire formats (ws, ok, SVG cx, rule operators gt, lt).
      'id-length': [
        'error',
        {
          min: 3,
          properties: 'never',
          exceptions: ['id', 'to', 'at', 'on', 'of', 'in', 'is', 'el', 'e', 'ui', 'x', 'y'],
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
      // vue-tsc reports undefined names with the real browser globals; typescript-eslint advises this rule off in TypeScript.
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
      'id-length': ['error', { min: 3, properties: 'never', exceptions: ['id', 'to', 'at', 'on', 'of', 'in', 'is', 'el', 'e', 'x', 'y', 'pr', 'me', 'a', 'b'] }],
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['test/**/*.mjs'],
    rules: { 'id-length': 'off' },
  },
  prettier,
);

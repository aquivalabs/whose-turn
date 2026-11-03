// ESLint flat config for the window (web/src), from the frontend-vue:tooling template. Prettier owns formatting; this file owns correctness and the house style.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
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
              message: 'Use a registered @ alias instead of climbing with ../../.',
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
  prettier,
);

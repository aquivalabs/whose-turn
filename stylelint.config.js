// Stylelint for the window's .vue and .css: the standard rules plus the house BEM selector pattern (frontend-vue:bem-styles), from the frontend-vue:tooling template.
export default {
  // The global sheet ported from the old window waits for RMA-127, which moves its rules into scoped BEM blocks per island.
  ignoreFiles: ['web/src/styles/base.css'],
  extends: ['stylelint-config-standard', 'stylelint-config-html/vue'],
  rules: {
    'selector-class-pattern': [
      '^[a-z]([a-z0-9-]+)?(__([a-z0-9]+-?)+)?(--([a-z0-9]+-?)+){0,2}$',
      {
        message:
          'Class names follow BEM: block, block__element, block--modifier (frontend-vue:bem-styles).',
        resolveNestedSelectors: true,
      },
    ],
    'selector-max-id': 0,
    'declaration-no-important': true,
    'selector-max-type': [
      0,
      {
        ignore: ['child', 'descendant', 'compounded'],
        message: 'Style structure through classes, not element selectors.',
      },
    ],
    'color-no-hex': [true, { message: 'Colours come from tokens (var(--…)), not hex literals.' }],
  },
  overrides: [{ files: ['**/tokens.css'], rules: { 'color-no-hex': null } }],
};

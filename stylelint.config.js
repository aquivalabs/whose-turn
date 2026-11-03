// Stylelint for the window's .vue and .css: the standard rules plus the house BEM selector pattern (frontend-vue:bem-styles), from the frontend-vue:tooling template.
export default {
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
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep'] }],
    'selector-max-id': 0,
    'declaration-no-important': true,
    'property-no-vendor-prefix': [
      true,
      {
        ignoreProperties: ['-webkit-backdrop-filter'],
        message:
          'No vendor prefixes, except -webkit-backdrop-filter, which Safari before 18 still needs for the glass.',
      },
    ],
    'selector-max-type': [
      0,
      {
        ignore: ['child', 'descendant', 'compounded'],
        message: 'Style structure through classes, not element selectors.',
      },
    ],
    'color-no-hex': [true, { message: 'Colours come from tokens (var(--…)), not hex literals.' }],
  },
  overrides: [
    { files: ['**/tokens.css'], rules: { 'color-no-hex': null } },
    // The Markdown view styles nodes built from text, which carry tags and no classes.
    { files: ['**/MarkdownView.vue'], rules: { 'selector-max-type': null } },
  ],
};

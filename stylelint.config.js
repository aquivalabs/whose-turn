// Stylelint for the window's .vue and .css: the standard rules plus the house BEM selector pattern (frontend-vue:bem-styles), from the frontend-vue:tooling template.
// docs/adr/0010: a component's classes belong to the block named after its file (UpdateChip.vue → update-chip).
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
// A selector starts at the component's block, or at the page context (`.app`, `.dashboard`) that places it.
const ownBlock = (component) => new RegExp(`^\\.(?:${kebab(component)}|app|dashboard)(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+){0,2}(?:[.:\\[].*)?$`);

export default {
  extends: ['stylelint-config-standard', 'stylelint-config-html/vue'],
  plugins: ['stylelint-selector-bem-pattern'],
  rules: {
    'plugin/selector-bem-pattern': {
      implicitComponents: true,
      componentSelectors: { initial: ownBlock, combined: () => /.*/ },
    },
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
    // Global sheets hold the shared primitives and tokens; they have no component block.
    { files: ['**/*.css'], rules: { 'plugin/selector-bem-pattern': null } },
    { files: ['**/tokens.css'], rules: { 'color-no-hex': null } },
    // The Markdown view styles nodes built from text, which carry tags and no classes.
    { files: ['**/MarkdownView.vue'], rules: { 'selector-max-type': null } },
  ],
};

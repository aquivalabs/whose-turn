<script setup lang="ts">
// A segmented control: one of a few options, with an optional count on each; chips is the larger variant the feed filter uses. A caller places it, the control sets no margin.
withDefaults(
  defineProps<{
    options: { id: string; label: string; count?: number }[];
    label?: string;
    chips?: boolean;
  }>(),
  { label: '' },
);
const selected = defineModel<string>({ required: true });
</script>
<template>
  <span class="segmented" :class="{ 'segmented--chips': chips }" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="segmented__option"
      :aria-pressed="selected === option.id"
      @click="selected = option.id"
    >
      {{ option.label
      }}<template v-if="option.count !== undefined">
        <b class="count">{{ option.count }}</b></template
      >
    </button>
  </span>
</template>
<style scoped>
.segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--md-outline);
  border-radius: 62.4375rem;
  vertical-align: middle;
}

.segmented--chips {
  flex: none;
  align-self: flex-start;
  background: rgb(var(--glass), 0.4);
}

.segmented__option {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  height: 1.625rem;
  padding: 0 0.6875rem;
  border-left: 1px solid var(--md-outline);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--md-on-surface);
  cursor: pointer;
  user-select: none;
}

.segmented__option:first-child {
  border-left: 0;
}

.segmented__option[aria-pressed='true'] {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}

.segmented__option:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.segmented--chips .segmented__option {
  gap: normal;
  height: 2rem;
  padding: 0 0.875rem;
  font-family: var(--md-font);
  font-size: 0.875rem;
  letter-spacing: 0.01em;
}

.segmented--chips .segmented__option:hover {
  background: var(--state-hover);
}

.segmented--chips .segmented__option[aria-pressed='true'] {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
</style>

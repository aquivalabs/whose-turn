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
    <span
      v-for="option in options"
      :key="option.id"
      class="segmented__option"
      role="button"
      tabindex="0"
      :aria-pressed="selected === option.id"
      @click="selected = option.id"
      @keydown.enter.prevent="selected = option.id"
      >{{ option.label
      }}<template v-if="option.count !== undefined">
        <b class="segmented__count">{{ option.count }}</b></template
      ></span
    >
  </span>
</template>
<style scoped>
.segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--md-outline);
  border-radius: 999px;
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
  gap: 5px;
  height: 26px;
  padding: 0 11px;
  border-left: 1px solid var(--md-outline);
  font-size: 12px;
  font-weight: 500;
  color: var(--md-on-surface);
  cursor: pointer;
  user-select: none;
}

.segmented__option:first-child {
  border-left: 0;
}

.segmented__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
  height: 32px;
  padding: 0 14px;
  font-family: var(--md-font);
  font-size: 14px;
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

<script setup lang="ts">
// A segmented control: one of a few options, with an optional count on each.
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
  <span :class="chips ? 'wt-filters' : 'wt-seg'" role="group" :aria-label="label">
    <span
      v-for="option in options"
      :key="option.id"
      :class="chips ? 'wt-f' : 'wt-seg-b'"
      role="button"
      tabindex="0"
      :aria-pressed="selected === option.id"
      @click="selected = option.id"
      @keydown.enter.prevent="selected = option.id"
      >{{ option.label
      }}<template v-if="option.count !== undefined">
        <b>{{ option.count }}</b></template
      ></span
    >
  </span>
</template>

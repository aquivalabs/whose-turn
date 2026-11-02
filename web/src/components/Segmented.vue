<script setup>
// A segmented control: one of a few options, with an optional count on each.
defineProps({ options: { type: Array, required: true }, modelValue: { type: String, required: true }, label: { type: String, default: '' }, chips: { type: Boolean, default: false } });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <span :class="chips ? 'wt-filters' : 'wt-seg'" role="group" :aria-label="label">
    <span v-for="o in options" :key="o.id" :class="chips ? 'wt-f' : 'wt-seg-b'" role="button" tabindex="0" :aria-pressed="String(modelValue === o.id)"
      @click="emit('update:modelValue', o.id)" @keydown.enter.prevent="emit('update:modelValue', o.id)">{{ o.label }}<template v-if="o.count !== undefined"> <b>{{ o.count }}</b></template></span>
  </span>
</template>

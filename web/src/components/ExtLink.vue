<script setup>
// A link to a source: followed only when it is https, otherwise the text alone (data is untrusted).
import { computed } from 'vue';
import { safeUrl } from '../lib/api.js';
const props = defineProps({ text: { type: String, default: '' }, url: { type: String, default: '' }, cls: { type: String, default: '' }, title: { type: String, default: '' } });
const href = computed(() => safeUrl(props.url));
</script>
<template>
  <a v-if="href" :href="href" target="_blank" rel="noopener" :class="cls" :title="title || null">{{ text }}</a>
  <span v-else :class="cls">{{ text }}</span>
</template>

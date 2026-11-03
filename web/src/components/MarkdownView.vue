<script setup lang="ts">
// Renders Markdown as DOM nodes built from text, never as HTML from data.
import { ref, watchEffect } from 'vue';
import { markdownFragment } from '../lib/markdown.ts';
const props = withDefaults(defineProps<{ source?: string }>(), { source: '' });
const host = ref<HTMLElement | null>(null);
watchEffect(() => {
  if (host.value) {
    host.value.replaceChildren(markdownFragment(props.source));
  }
});
</script>
<template><div ref="host" class="wt-modal-body wt-md"></div></template>

<script setup lang="ts">
// Renders Markdown as DOM nodes built from text, never as HTML from data. docs/adr/0003-markdown-rendering.md
import { ref, watchEffect } from 'vue';
import { markdownFragment } from '@/lib/markdown.ts';
const props = withDefaults(defineProps<{ source?: string }>(), { source: '' });
const host = ref<HTMLElement | null>(null);
watchEffect(() => {
  if (host.value) {
    host.value.replaceChildren(markdownFragment(props.source));
  }
});
</script>
<template><div ref="host" class="markdown-view"></div></template>
<style scoped>
.markdown-view {
  padding: 1rem 1.25rem 1.25rem;
  overflow: auto;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
  line-height: 1.6;
}

.markdown-view :deep(h4),
.markdown-view :deep(h5) {
  margin: 1rem 0 0.375rem;
  font-weight: 600;
}

.markdown-view :deep(h4) {
  font-size: 1rem;
}

.markdown-view :deep(h5) {
  font-size: 0.875rem;
}

.markdown-view :deep(p) {
  margin: 0 0 0.625rem;
}

.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  margin: 0 0 0.625rem;
  padding-left: 1.375rem;
}

.markdown-view :deep(li) {
  margin: 0.125rem 0;
}

.markdown-view :deep(code) {
  padding: 0.0625rem 0.3125rem;
  border-radius: 0.25rem;
  background: rgb(var(--md-state), 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.markdown-view :deep(pre) {
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.875rem;
  overflow: auto;
  border-radius: 0.5rem;
  background: rgb(0 0 0 / 28%);
}

.markdown-view :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 0.7813rem;
  line-height: 1.5;
  white-space: pre;
}

.markdown-view :deep(blockquote) {
  margin: 0 0 0.625rem;
  padding: 0.25rem 0.75rem;
  border-left: 3px solid var(--md-primary);
  color: var(--md-on-surface-variant);
}

.markdown-view :deep(strong) {
  font-weight: 600;
}

.markdown-view :deep(.markdown-view__mention) {
  color: var(--md-primary);
  font-weight: 500;
}
</style>

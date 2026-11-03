<script setup lang="ts">
// Renders Markdown as DOM nodes built from text, never as HTML from data; the nodes carry no scope id, so the styles reach them through :deep().
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
<template><div ref="host" class="markdown-view"></div></template>
<style scoped>
.markdown-view {
  padding: 16px 20px 20px;
  overflow: auto;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.6;
}

.markdown-view :deep(h4),
.markdown-view :deep(h5) {
  margin: 16px 0 6px;
  font-weight: 600;
}

.markdown-view :deep(h4) {
  font-size: 16px;
}

.markdown-view :deep(h5) {
  font-size: 14px;
}

.markdown-view :deep(p) {
  margin: 0 0 10px;
}

.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}

.markdown-view :deep(li) {
  margin: 2px 0;
}

.markdown-view :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(var(--md-state), 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.markdown-view :deep(pre) {
  margin: 0 0 12px;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 8px;
  background: rgb(0 0 0 / 28%);
}

.markdown-view :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre;
}

.markdown-view :deep(blockquote) {
  margin: 0 0 10px;
  padding: 4px 12px;
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

<script setup lang="ts">
// A comment opened formatted over the dashboard.
import { computed } from 'vue';
import { snapshot, ui } from '../store.ts';
import { safeUrl } from '../lib/api.ts';
import MarkdownView from './MarkdownView.vue';
const item = computed(() => ui.modal);
const title = computed(() =>
  item.value ? [item.value.ref, item.value.kind, item.value.who].filter(Boolean).join(' · ') : '',
);
const href = computed(() => (item.value ? safeUrl(item.value.url) : ''));
const label = computed(() => {
  const connector = (snapshot.workspace.connectors || []).find(
    (entry) => entry.id === item.value?.source,
  );
  return 'Open in ' + (connector ? connector.label : item.value?.source);
});
const close = () => {
  ui.modal = null;
};
</script>
<template>
  <div
    v-if="item"
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    @click.self="close"
  >
    <div class="modal__card">
      <div class="modal__head">
        <h3 id="modal-title" class="modal__title">{{ title }}</h3>
        <a v-if="href" class="btn" :href="href" target="_blank" rel="noopener">{{ label }}</a>
        <span
          class="btn btn--tonal"
          role="button"
          tabindex="0"
          @click="close"
          @keydown.enter.prevent="close"
          >Close</span
        >
      </div>
      <MarkdownView :source="item.body || item.text || ''" />
    </div>
  </div>
</template>

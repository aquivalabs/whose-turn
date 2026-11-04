<script setup lang="ts">
// A comment opened formatted over the dashboard.
import { AnimatePresence } from 'motion-v';
import { computed } from 'vue';
import { snapshot, ui } from '@/store.ts';
import { safeUrl } from '@/lib/api.ts';
import Modal from '@/ui/Modal.vue';
import MarkdownView from '@/ui/MarkdownView.vue';
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
  <AnimatePresence>
    <Modal v-if="item" :title="title" label-id="modal-title" flush @close="close">
      <template #head>
        <a v-if="href" class="btn" :href="href" target="_blank" rel="noopener">{{ label }}</a>
      </template>
      <MarkdownView :source="item.body || item.text || ''" />
    </Modal>
  </AnimatePresence>
</template>

<script setup>
// A comment opened formatted over the dashboard.
import { computed } from 'vue';
import { S, ui } from '../store.js';
import { safeUrl } from '../lib/api.js';
import MarkdownView from './MarkdownView.vue';
const item = computed(() => ui.modal);
const title = computed(() => (item.value ? [item.value.ref, item.value.kind, item.value.who].filter(Boolean).join(' · ') : ''));
const href = computed(() => (item.value ? safeUrl(item.value.url) : ''));
const label = computed(() => { const c = (S.workspace.connectors || []).find((x) => x.id === item.value?.source); return 'Open in ' + (c ? c.label : item.value?.source); });
const close = () => { ui.modal = null; };
</script>
<template>
  <div v-if="item" class="wt-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" @click.self="close">
    <div class="wt-modal-card">
      <div class="wt-modal-head">
        <h3 id="modal-title">{{ title }}</h3>
        <a v-if="href" class="wt-btn" :href="href" target="_blank" rel="noopener">{{ label }}</a>
        <span class="wt-btn tonal" role="button" tabindex="0" @click="close" @keydown.enter.prevent="close">Close</span>
      </div>
      <MarkdownView :source="item.body || item.text || ''" />
    </div>
  </div>
</template>

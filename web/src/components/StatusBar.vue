<script setup>
// The line above the dashboard: Report, the live dot and the last check, Refresh, and the copy-everything sparkle.
import { computed } from 'vue';
import { S, ui, now, refresh } from '../store.js';
import { ago } from '../lib/time.js';
import { BUG } from '../lib/icons.js';
import AiButton from './AiButton.vue';
const emit = defineEmits(['report']);
const status = computed(() => { void now.value; return ui.status || ('Live · last check ' + (S.polled_at ? ago(S.polled_at) : '—') + ' · checks every minute'); });
</script>
<template>
  <div class="wt-status">
    <span class="wt-btn wt-report" role="button" tabindex="0" title="A bug or a wish about this monitor, straight to its backlog" @click="emit('report')" @keydown.enter.prevent="emit('report')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="BUG" fill="currentColor" /></svg>Report
    </span>
    <span class="wt-live" :class="{ off: !ui.live }"></span>
    <span>{{ status }}</span>
    <span class="wt-btn" role="button" tabindex="0" @click="refresh" @keydown.enter.prevent="refresh">Refresh now</span>
    <AiButton :query="{ all: '1' }" /><span class="wt-give-hint">AI: copy everything</span>
  </div>
</template>

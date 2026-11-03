<script setup lang="ts">
// The line above the dashboard: Report, the live dot and the last check, Refresh, the app/tab switch, and the copy-everything sparkle.
import { computed } from 'vue';
import { snapshot, ui, now, notice, refresh } from '../store.ts';
import { post } from '../lib/api.ts';
import { tabUrl } from '../lib/window-mode.ts';
import { ago } from '../lib/time.ts';
import { BUG } from '../lib/icons.ts';
import AiButton from './AiButton.vue';
const emit = defineEmits<{ report: [] }>();
const stale = computed(() => snapshot.health.stale);
const status = computed(() => {
  void now.value;
  if (ui.status) {
    return ui.status;
  }
  if (stale.value) {
    return 'Stale · last data ' + ago(snapshot.health.fresh_at) + ' · checks every minute';
  }
  return (
    'Live · last check ' +
    (snapshot.polled_at ? ago(snapshot.polled_at) : '—') +
    ' · checks every minute'
  );
});
const openAsApp = () => post('/api/open', { mode: 'app' });
</script>
<template>
  <div class="wt-status">
    <span
      class="wt-btn wt-report"
      role="button"
      tabindex="0"
      title="A bug or a wish about this monitor, straight to its backlog"
      @click="emit('report')"
      @keydown.enter.prevent="emit('report')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="BUG" fill="currentColor" /></svg>Report
    </span>
    <span class="wt-live" :class="{ off: !ui.live || stale }"></span>
    <span>{{ status }}</span>
    <span v-if="notice" class="wt-notice" role="alert">{{ notice }}</span>
    <span
      class="wt-btn"
      role="button"
      tabindex="0"
      @click="refresh"
      @keydown.enter.prevent="refresh"
      >Refresh now</span
    >
    <a v-if="ui.mode === 'app'" class="wt-btn" :href="tabUrl(ui.ws)" target="_blank" rel="noopener"
      >Open in browser</a
    >
    <span
      v-else
      class="wt-btn"
      role="button"
      tabindex="0"
      @click="openAsApp"
      @keydown.enter.prevent="openAsApp"
      >Open as app</span
    >
    <AiButton :query="{ all: '1' }" /><span class="wt-give-hint">AI: copy everything</span>
  </div>
</template>

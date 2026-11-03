<script setup lang="ts">
// The line above the dashboard: Report, the live dot and the last check, Refresh, the app/tab switch, and the copy-everything sparkle.
import { computed } from 'vue';
import { snapshot, ui, now, notice, refresh } from '../store.ts';
import { post } from '../lib/api.ts';
import { tabUrl } from '../lib/window-mode.ts';
import { liveStatus } from '../lib/live-status.ts';
import { BUG } from '../lib/icons.ts';
import AiButton from './AiButton.vue';
const emit = defineEmits<{ report: [] }>();
const verdict = computed(() => {
  void now.value;
  return liveStatus(
    snapshot.health,
    snapshot.polled_at,
    snapshot.workspace.connectors.length,
    ui.live,
  );
});
const status = computed(() => ui.status || verdict.value.text);
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
    <span
      class="wt-live"
      :class="{ off: verdict.dot === 'off', warn: verdict.dot === 'warn' }"
    ></span>
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

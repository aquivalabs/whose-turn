<script setup lang="ts">
// The line above the dashboard: Report, the live dot and the last check, Refresh, the app/tab switch, and the copy-everything sparkle.
import { computed } from 'vue';
import { snapshot, ui, now, notice, refresh, tellProblem } from '../store.ts';
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
const tellOpen = (outcome: unknown) =>
  tellProblem(outcome, { refused: 'The app window did not open' });
const openAsApp = () => post('/api/open', { mode: 'app' }).then(tellOpen, tellOpen);
</script>
<template>
  <div class="status-bar">
    <span
      class="btn status-bar__btn status-bar__report"
      role="button"
      tabindex="0"
      title="A bug or a wish about this monitor, straight to its backlog"
      @click="emit('report')"
      @keydown.enter.prevent="emit('report')"
    >
      <svg class="status-bar__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="BUG" fill="currentColor" /></svg
      >Report
    </span>
    <span
      class="status-bar__live"
      :class="{
        'status-bar__live--off': verdict.dot === 'off',
        'status-bar__live--warn': verdict.dot === 'warn',
      }"
    ></span>
    <span>{{ status }}</span>
    <span v-if="notice" class="status-bar__notice" role="alert">{{ notice }}</span>
    <span
      class="btn status-bar__btn"
      role="button"
      tabindex="0"
      @click="refresh"
      @keydown.enter.prevent="refresh"
      >Refresh now</span
    >
    <a
      v-if="ui.mode === 'app'"
      class="btn status-bar__btn"
      :href="tabUrl(ui.ws)"
      target="_blank"
      rel="noopener"
      >Open in browser</a
    >
    <span
      v-else
      class="btn status-bar__btn"
      role="button"
      tabindex="0"
      @click="openAsApp"
      @keydown.enter.prevent="openAsApp"
      >Open as app</span
    >
    <AiButton :query="{ all: '1' }" /><span class="ai-hint status-bar__ai-hint"
      >AI: copy everything</span
    >
  </div>
</template>
<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 4px 8px;
  font-family: var(--md-font);
  font-size: 12px;
  color: var(--md-on-surface-variant);
}

.status-bar__btn {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  text-decoration: none;
}

.status-bar__report {
  gap: 6px;
  color: var(--md-error);
  border-color: var(--md-error);
}

.status-bar__icon {
  width: 16px;
  height: 16px;
}

.status-bar__live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--live-on);
  box-shadow: 0 0 0 0 var(--live-pulse-rest);
  animation: status-bar-pulse 2s infinite;
}

.status-bar__live--off {
  background: var(--live-off);
  animation: none;
}

.status-bar__live--warn {
  background: var(--live-warn);
  animation: none;
}

.status-bar__notice {
  color: var(--live-off);
}

.status-bar__ai-hint {
  margin-left: -4px;
}

@keyframes status-bar-pulse {
  0% {
    box-shadow: 0 0 0 0 var(--live-pulse-from);
  }

  70% {
    box-shadow: 0 0 0 8px var(--live-pulse-to);
  }

  100% {
    box-shadow: 0 0 0 0 var(--live-pulse-to);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-bar__live {
    animation: none;
  }
}
</style>

<script setup lang="ts">
// The line above the dashboard: Report, the live dot and the last check, Refresh, the app/tab switch, and the copy-everything sparkle.
import { computed, ref } from 'vue';
import { snapshot, ui, now, notice, refresh, tellProblem } from '@/store.ts';
import { post } from '@/lib/api.ts';
import { tabUrl } from '@/lib/window-mode.ts';
import { writeProblem } from '@/lib/problems.ts';
import { liveStatus } from '@/lib/live-status.ts';
import { BUG } from '@/lib/icons.ts';
import AiButton from '@/ui/AiButton.vue';
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
const OPEN_COOLDOWN_MS = 5000;
const opening = ref(false);
const opened = ref(false);
const status = computed(() =>
  opened.value
    ? 'Opened in the app window. You can close this tab.'
    : ui.status || verdict.value.text,
);
const tellOpen = (outcome: unknown) =>
  tellProblem(outcome, { refused: 'The app window did not open' });
const openAsApp = () => {
  if (opening.value) {
    return;
  }
  opening.value = true;
  setTimeout(() => (opening.value = false), OPEN_COOLDOWN_MS);
  const settle = (outcome: unknown) => {
    tellOpen(outcome);
    opened.value = !writeProblem(outcome);
  };
  void post('/api/open', { mode: 'app' }).then(settle, settle);
};
</script>
<template>
  <div class="status-bar">
    <button
      type="button"
      class="btn status-bar__btn status-bar__report"
      title="A bug or a wish about this monitor, straight to its backlog"
      @click="emit('report')"
    >
      <svg class="status-bar__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="BUG" fill="currentColor" /></svg
      >Report
    </button>
    <span
      class="status-bar__live"
      :class="{
        'status-bar__live--off': verdict.dot === 'off',
        'status-bar__live--warn': verdict.dot === 'warn',
      }"
    ></span>
    <span>{{ status }}</span>
    <span v-if="notice" class="status-bar__notice" role="alert">{{ notice }}</span>
    <button type="button" class="btn status-bar__btn" @click="refresh">Refresh now</button>
    <a
      v-if="ui.mode === 'app'"
      class="btn status-bar__btn"
      :href="tabUrl(ui.ws)"
      target="_blank"
      rel="noopener"
      >Open in browser</a
    >
    <button
      v-else
      type="button"
      class="btn status-bar__btn"
      :class="{ 'status-bar__btn--busy': opening }"
      :aria-disabled="opening"
      @click="openAsApp"
    >
      {{ opening ? 'Opening…' : 'Open as app' }}
    </button>
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

.status-bar__btn--busy {
  opacity: 0.6;
  pointer-events: none;
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

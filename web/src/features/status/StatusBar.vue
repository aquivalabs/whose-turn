<script setup lang="ts">
// The line above the dashboard in three groups: the live dot, the last check and Refresh on the left; the update chip in the centre; Copy for AI, the app/tab switch, notifications and Report on the right (RMA-343).
import { AnimatePresence, M as Motion } from 'motion-v';
import { fade } from '@/motion.ts';
import { computed, ref } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { snapshot, ui, now, notice, refresh, tellProblem } from '@/store.ts';
import { post } from '@/lib/api.ts';
import { tabUrl } from '@/lib/window-mode.ts';
import { writeProblem } from '@/lib/problems.ts';
import { liveStatus } from '@/lib/live-status.ts';
import { BUG } from '@/lib/icons.ts';
import { useAttention } from '@/composables/useAttention.ts';
import AiButton from '@/ui/AiButton.vue';
import UpdateChip from './UpdateChip.vue';
import NotificationsToggle from './NotificationsToggle.vue';
import { useText } from '@/i18n/index.ts';
const emit = defineEmits<{ report: [] }>();
const t = useText();
const wiggling = useAttention(computed(() => ui.reportNews));
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
const opening = refAutoReset(false, OPEN_COOLDOWN_MS);
const opened = ref(false);
const status = computed(() =>
  opened.value ? t('status.bar.openedInApp') : ui.status || verdict.value.text,
);
const tellOpen = (outcome: unknown) =>
  tellProblem(outcome, { refused: t('status.bar.appNotOpened') });
const openAsApp = () => {
  if (opening.value) {
    return;
  }
  opening.value = true;
  const settle = (outcome: unknown) => {
    tellOpen(outcome);
    opened.value = !writeProblem(outcome);
  };
  void post('/api/open', { mode: 'app' }).then(settle, settle);
};
</script>
<template>
  <div class="status-bar">
    <div class="status-bar__group">
      <span
        class="status-bar__live"
        :class="{
          'status-bar__live--off': verdict.dot === 'off',
          'status-bar__live--warn': verdict.dot === 'warn',
        }"
      ></span>
      <span class="status-bar__text">{{ status }}</span>
      <AnimatePresence>
        <Motion v-if="notice" v-bind="fade" as="span" class="status-bar__notice" role="alert">{{
          notice
        }}</Motion>
      </AnimatePresence>
      <button type="button" class="btn status-bar__btn" @click="refresh">
        {{ t('status.bar.refresh') }}
      </button>
    </div>
    <div class="status-bar__center">
      <UpdateChip />
    </div>
    <div class="status-bar__group status-bar__actions">
      <AiButton :query="{ all: '1' }" /><span class="ai-hint status-bar__ai-hint">{{
        t('status.bar.copyForAi')
      }}</span>
      <a
        v-if="ui.mode === 'app'"
        class="btn status-bar__btn"
        :href="tabUrl(ui.ws)"
        target="_blank"
        rel="noopener"
        >{{ t('status.bar.openInBrowser') }}</a
      >
      <button
        v-else
        type="button"
        class="btn status-bar__btn"
        :class="{ 'status-bar__btn--busy': opening }"
        :aria-disabled="opening"
        @click="openAsApp"
      >
        {{ opening ? t('status.bar.opening') : t('status.bar.openAsApp') }}
      </button>
      <NotificationsToggle />
      <button
        type="button"
        class="btn status-bar__btn status-bar__report"
        :class="{ 'status-bar__report--wiggle': wiggling }"
        :title="t('status.bar.reportTitle')"
        @click="emit('report')"
      >
        <svg class="status-bar__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="BUG" fill="currentColor" /></svg
        >{{ t('status.bar.report')
        }}<AnimatePresence
          ><Motion
            v-if="ui.reportNews"
            v-bind="fade"
            as="span"
            class="status-bar__dot"
            :title="t('status.bar.reportNews')"
        /></AnimatePresence>
      </button>
    </div>
  </div>
</template>
<style scoped>
.status-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  margin: 0 0.25rem 0.5rem;
  font-family: var(--md-font);
  font-size: 0.75rem;
  color: var(--md-on-surface-variant);
}

.status-bar__group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.status-bar__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-bar__actions {
  justify-content: flex-end;
}

.status-bar__btn {
  height: 1.625rem;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  text-decoration: none;
}

.status-bar__btn--busy {
  opacity: 0.6;
  pointer-events: none;
}

.status-bar__report {
  position: relative;
  gap: 0.375rem;
}

.status-bar__report--wiggle {
  animation: status-bar-wiggle 1.2s ease-in-out;
}

@keyframes status-bar-bug {
  0%,
  100% {
    transform: rotate(0) scale(1);
  }

  15% {
    transform: rotate(-18deg) scale(1.2);
  }

  30% {
    transform: rotate(16deg) scale(1.2);
  }

  45% {
    transform: rotate(-12deg) scale(1.15);
  }

  60% {
    transform: rotate(9deg) scale(1.1);
  }

  75% {
    transform: rotate(-5deg) scale(1.05);
  }
}

@keyframes status-bar-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--md-primary) 60%, transparent);
  }

  100% {
    box-shadow: 0 0 0 7px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-bar__report--wiggle,
  .status-bar__report--wiggle .status-bar__icon,
  .status-bar__dot {
    animation: none;
  }
}

.status-bar__dot {
  position: absolute;
  animation: status-bar-pulse 1.6s ease-out infinite;
  top: -0.1875rem;
  right: -0.1875rem;
  box-sizing: border-box;
  width: 0.625rem;
  height: 0.625rem;
  border: 2px solid var(--md-surface);
  border-radius: 50%;
  background: var(--md-primary);
}

@keyframes status-bar-wiggle {
  0%,
  100% {
    transform: rotate(0);
  }

  20% {
    transform: rotate(-8deg);
  }

  40% {
    transform: rotate(7deg);
  }

  60% {
    transform: rotate(-5deg);
  }

  80% {
    transform: rotate(3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-bar__report--wiggle {
    animation: none;
  }
}

.status-bar__icon {
  width: 1rem;
  height: 1rem;
}

.status-bar__live {
  width: 0.5rem;
  height: 0.5rem;
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
  margin-left: -0.25rem;
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

.status-bar__report--wiggle .status-bar__icon {
  animation: status-bar-bug 1.2s ease-in-out;
}
</style>

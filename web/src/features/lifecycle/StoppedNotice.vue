<script setup lang="ts">
// Shown centred over the dimmed dashboard when the monitor is not there: stopped, did not come back, never answered, or answering again (RMA-356, RMA-436).
import { computed } from 'vue';
import { AnimatePresence, M as Motion } from 'motion-v';
import { rise } from '@/motion.ts';
import { retry, reloadWindow, ui } from '@/store.ts';
import { useText } from '@/i18n/index.ts';
const t = useText();
const KINDS = ['quitting', 'lost', 'unanswered', 'back'] as const;
const kind = computed(() => KINDS.find((name) => name === ui.lifecycle));
</script>
<template>
  <AnimatePresence>
    <Motion v-if="kind" :key="kind" v-bind="rise" class="stopped-notice" role="status">
      <h2 class="stopped-notice__title">{{ t(`lifecycle.${kind}.title`) }}</h2>
      <p class="stopped-notice__text">{{ t(`lifecycle.${kind}.text`) }}</p>
      <button
        v-if="kind === 'unanswered'"
        type="button"
        class="btn stopped-notice__action"
        @click="retry"
      >
        {{ t('lifecycle.retry') }}
      </button>
      <button v-else type="button" class="btn stopped-notice__action" @click="reloadWindow">
        {{ t('lifecycle.reload') }}
      </button>
    </Motion>
  </AnimatePresence>
</template>
<style scoped>
.stopped-notice {
  position: fixed;
  inset: 0;
  z-index: 50;
  box-sizing: border-box;
  width: min(30rem, calc(100% - 2rem));
  height: fit-content;
  margin: auto;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-r-card);
  background: var(--md-s-highest);
  color: var(--md-on-surface);
  font-family: var(--md-font);
}

.stopped-notice__title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}

.stopped-notice__text {
  margin: 0 0 1rem;
  color: var(--md-on-surface-variant);
  font-size: 0.875rem;
}
</style>

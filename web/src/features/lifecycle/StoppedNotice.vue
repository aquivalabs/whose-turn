<script setup lang="ts">
// Shown over the dashboard once the monitor was quit: it says the data is no longer checked and how to start it again (RMA-356).
import { AnimatePresence, M as Motion } from 'motion-v';
import { rise } from '@/motion.ts';
import { ui } from '@/store.ts';
</script>
<template>
  <AnimatePresence>
    <Motion v-if="ui.lifecycle === 'quitting'" v-bind="rise" class="stopped-notice" role="status">
      <h2 class="stopped-notice__title">Whose Turn is stopped</h2>
      <p class="stopped-notice__text">
        It no longer checks your sources, and this page shows what it knew when it stopped. To start
        it again, ask Claude to start the monitor, or open a new Claude Code session.
      </p>
    </Motion>
  </AnimatePresence>
</template>
<style scoped>
.stopped-notice {
  position: absolute;
  inset: 25% 0 auto;
  z-index: 5;
  width: min(30rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-r-card);
  background: var(--md-s-highest);
  color: var(--md-on-surface);
}

.stopped-notice__title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}

.stopped-notice__text {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 0.875rem;
}
</style>

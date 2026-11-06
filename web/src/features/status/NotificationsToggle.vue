<script setup lang="ts">
// Switch for desktop notifications; see README, notifications.desktop.
import { computed } from 'vue';
import { snapshot, toggleNotifications as toggle } from '@/store.ts';
import { BELL, BELL_OFF } from '@/lib/icons.ts';

const on = computed(() => snapshot.notifications.desktop);
</script>

<template>
  <button
    type="button"
    role="switch"
    class="btn notifications-toggle"
    :class="{ 'notifications-toggle--off': !on }"
    :aria-checked="on"
    :data-tip="
      on
        ? 'Desktop notifications are on for every workspace. Click to turn them all off; the window and Claude\'s session summary keep updating.'
        : 'Desktop notifications are off for every workspace. The window and Claude\'s session summary still update. Click to turn them back on.'
    "
    @click="toggle"
  >
    <svg class="notifications-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="on ? BELL : BELL_OFF" fill="currentColor" /></svg
    >{{ on ? 'Notifications on' : 'Notifications off' }}
  </button>
</template>

<style scoped>
.notifications-toggle {
  gap: 0.375rem;
  height: 1.625rem;
  padding: 0 0.75rem;
  font-size: 0.75rem;
}

.notifications-toggle--off {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
}

.notifications-toggle__icon {
  width: 1rem;
  height: 1rem;
}
</style>

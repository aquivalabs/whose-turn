<script setup lang="ts">
// Switch for desktop notifications; see README, notifications.desktop.
import { computed } from 'vue';
import { snapshot, toggleNotifications as toggle } from '@/store.ts';
import { BELL, BELL_OFF } from '@/lib/icons.ts';
import { useText } from '@/i18n/index.ts';

const t = useText();
const on = computed(() => snapshot.notifications.desktop);
const label = computed(() => (on.value ? t('status.notifications.on') : t('status.notifications.off')));
</script>

<template>
  <button
    type="button"
    role="switch"
    class="btn notifications-toggle"
    :class="{ 'notifications-toggle--off': !on }"
    :aria-checked="on"
    :aria-label="label"
    :data-tip="on ? t('status.notifications.onTip') : t('status.notifications.offTip')"
    @click="toggle"
  >
    <svg class="notifications-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="on ? BELL : BELL_OFF" fill="currentColor" /></svg
    ><span class="notifications-toggle__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.notifications-toggle {
  gap: 0.375rem;
  height: 1.625rem;
  white-space: nowrap;
  padding: 0 0.75rem;
  font-size: 0.75rem;
}

@media (width <= 80em) {
  .notifications-toggle {
    padding: 0 0.5rem;
  }

  .notifications-toggle__label {
    display: none;
  }
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

<script setup lang="ts">
// The switch for desktop notifications across the whole monitor; the setting lives in the config, so it survives a restart (RMA-283).
import { computed, ref } from 'vue';
import { snapshot, tellProblem } from '@/store.ts';
import { post } from '@/lib/api.ts';
import { BELL, BELL_OFF } from '@/lib/icons.ts';

const on = computed(() => snapshot.notifications.desktop);
const saving = ref(false);

const toggle = async () => {
  if (saving.value) {
    return;
  }
  saving.value = true;
  const before = snapshot.notifications;
  snapshot.notifications = { desktop: !before.desktop };
  const settle = (outcome: unknown) => {
    if (!tellProblem(outcome, { refused: 'The notification setting was not saved' })) {
      snapshot.notifications = before;
    }
  };
  await post('/api/config', { notifications: snapshot.notifications }).then(settle, settle);
  saving.value = false;
};
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
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
}

.notifications-toggle--off {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
}

.notifications-toggle__icon {
  width: 16px;
  height: 16px;
}
</style>

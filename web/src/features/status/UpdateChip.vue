<script setup lang="ts">
// The self-update chip: the offer, a spinner while the server installs and restarts, and a reload prompt once it runs the new version (RMA-231, RMA-255).
import { computed, onMounted, ref, watch } from 'vue';
import { refAutoReset, useTimeoutFn } from '@vueuse/core';
import { snapshot, tellProblem, ui } from '@/store.ts';
import { post } from '@/lib/api.ts';
import { rememberUpdated, reloadPage, takeUpdated } from '@/lib/page-reload.ts';
import type { ApiError, UpdateStatus } from '@/lib/types.ts';

const UPDATED_SHOWN_MS = 15000;
const SLOW_RESTART_MS = 90000;
const target = ref('');
let pageVersion = '';
const ready = ref('');
const slow = ref(false);
const updatedTo = refAutoReset('', UPDATED_SHOWN_MS);
const update = computed(() => snapshot.update);
const restarting = computed(
  () => update.value.state === 'restarting' || (Boolean(target.value) && !ui.live),
);
const working = computed(() => !ready.value && (update.value.state === 'installing' || restarting.value || Boolean(target.value)));
const { start: watchSlow, stop: stopSlow } = useTimeoutFn(() => (slow.value = true), SLOW_RESTART_MS, {
  immediate: false,
});

onMounted(() => {
  updatedTo.value = takeUpdated();
});

watch(
  () => update.value.current,
  (current) => {
    if (!current) {
      return;
    }
    if (!pageVersion) {
      pageVersion = current;
      return;
    }
    if (current !== pageVersion) {
      ready.value = current;
      target.value = '';
      stopSlow();
    }
  },
  { immediate: true },
);

const onUpdate = () => {
  if (working.value) {
    return;
  }
  slow.value = false;
  target.value = update.value.latest;
  watchSlow();
  const settle = (outcome: unknown) => {
    if (!tellProblem(outcome, { refused: 'The update did not start' })) {
      target.value = '';
      stopSlow();
      return;
    }
    snapshot.update = (outcome as { update: UpdateStatus }).update;
  };
  void post<{ update: UpdateStatus; error?: ApiError }>('/api/update').then(settle, settle);
};

const onReload = () => {
  if (ready.value) {
    rememberUpdated(ready.value);
  }
  reloadPage();
};
</script>
<template>
  <button
    v-if="updatedTo"
    type="button"
    class="update-chip update-chip--done"
    title="See what changed"
    @click="ui.whatsNew = true"
  >
    Updated to {{ updatedTo }}
  </button>
  <button
    v-else-if="ready"
    type="button"
    class="update-chip update-chip--ready"
    title="Reload the window to apply the changes"
    @click="onReload"
  >
    Updated to {{ ready }} · Reload
  </button>
  <span v-else-if="working" class="update-chip update-chip--busy" role="status"
    ><span class="update-chip__spinner" aria-hidden="true"></span
    >{{ restarting ? 'Restarting…' : `Installing ${target || update.latest}…` }}<button
      v-if="slow"
      type="button"
      class="update-chip__link"
      title="The restart is taking longer than usual"
      @click="onReload"
    >
      Reload
    </button></span
  >
  <button
    v-else-if="update.available && update.state === 'failed'"
    type="button"
    class="update-chip update-chip--failed"
    :title="update.reason"
    @click="onUpdate"
  >
    Update failed · Retry
  </button>
  <button v-else-if="update.available" type="button" class="update-chip" @click="onUpdate">
    {{ update.latest }} is out · Update
  </button>
</template>
<style scoped>
.update-chip {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  font: inherit;
  color: var(--md-on-primary-container);
  white-space: nowrap;
  cursor: pointer;
  background: var(--md-primary-container);
  border: 0;
  border-radius: var(--md-r-chip);
}

.update-chip--busy {
  cursor: default;
}

.update-chip--ready {
  color: var(--md-on-primary);
  background: var(--md-primary);
}

.update-chip--failed {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
}

.update-chip__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentcolor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: update-chip-spin 0.9s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .update-chip__spinner {
    animation: none;
  }
}

.update-chip__link {
  padding: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: 0;
}

@keyframes update-chip-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

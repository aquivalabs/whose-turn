<script setup lang="ts">
// The self-update chip in the status bar: the offer, "Updating…" while the server installs and restarts, and "Updated to" once the stream reconnects to the new copy (RMA-231).
import { computed, ref, watch } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { snapshot, tellProblem } from '@/store.ts';
import { post } from '@/lib/api.ts';
import type { ApiError, UpdateStatus } from '@/lib/types.ts';

const UPDATED_SHOWN_MS = 15000;
const sending = ref(false);
const updatingFrom = ref('');
const updatedTo = refAutoReset('', UPDATED_SHOWN_MS);
const update = computed(() => snapshot.update);
const isBusy = computed(
  () => sending.value || update.value.state === 'installing' || update.value.state === 'restarting',
);

watch(
  () => update.value.current,
  (current) => {
    if (updatingFrom.value && current && current !== updatingFrom.value) {
      updatedTo.value = current;
      updatingFrom.value = '';
    }
  },
);

const onUpdate = () => {
  if (isBusy.value) {
    return;
  }
  sending.value = true;
  updatingFrom.value = update.value.current;
  const settle = (outcome: unknown) => {
    sending.value = false;
    if (!tellProblem(outcome, { refused: 'The update did not start' })) {
      updatingFrom.value = '';
      return;
    }
    snapshot.update = (outcome as { update: UpdateStatus }).update;
  };
  void post<{ update: UpdateStatus; error?: ApiError }>('/api/update').then(settle, settle);
};
</script>
<template>
  <span v-if="updatedTo" class="update-chip update-chip--done" role="status"
    >Updated to {{ updatedTo }}</span
  >
  <span v-else-if="isBusy" class="update-chip update-chip--busy" role="status">Updating…</span>
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
  align-items: center;
  height: 26px;
  padding: 0 12px;
  font: inherit;
  color: var(--md-on-primary-container);
  cursor: pointer;
  background: var(--md-primary-container);
  border: 0;
  border-radius: var(--md-r-chip);
}

.update-chip--busy,
.update-chip--done {
  cursor: default;
}

.update-chip--busy {
  opacity: 0.7;
}

.update-chip--failed {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
}
</style>

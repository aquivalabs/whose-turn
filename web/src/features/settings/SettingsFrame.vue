<script setup lang="ts">
// The chrome both settings sheets wear: the dialog, the unsaved flag and Save in its head, the confirm bar and the one alert line above the form.
import Modal from '@/ui/Modal.vue';
import type { Ask } from './useSheetGuard.ts';

defineProps<{
  title: string;
  labelId: string;
  dirty: boolean;
  ask: Ask | null;
  unloaded: string;
  problems: string[];
  wide?: boolean;
}>();
const emit = defineEmits<{ close: []; save: []; answer: [yes: boolean] }>();
</script>
<template>
  <Modal
    :title="title"
    :label-id="labelId"
    flush
    :card-class="wide ? 'settings-frame__card settings-frame__card--wide' : 'settings-frame__card'"
    @close="emit('close')"
  >
    <template #head>
      <span v-if="dirty" class="settings-frame__dirty">Unsaved changes</span>
      <button v-if="!unloaded" type="button" class="btn btn--tonal" @click="emit('save')">
        Save
      </button>
    </template>
    <div v-if="ask" class="settings-frame__confirm" role="alertdialog">
      <span class="settings-frame__confirm-text">{{ ask.text }}</span>
      <button type="button" class="btn btn--danger" @click="emit('answer', true)">
        {{ ask.yes }}
      </button>
      <button type="button" class="btn" @click="emit('answer', false)">{{ ask.no }}</button>
    </div>
    <div v-if="unloaded" class="alert settings-frame__alert" role="alert">{{ unloaded }}</div>
    <div v-else-if="problems.length" class="alert settings-frame__alert">
      {{ problems.join('  ·  ') }}
    </div>
    <div v-if="!unloaded" class="settings-frame__body"><slot /></div>
  </Modal>
</template>
<style scoped>
:deep(.settings-frame__card) {
  width: min(640px, 100%);
  height: min(760px, 100%);
}

:deep(.settings-frame__card--wide) {
  width: min(760px, 100%);
}

.settings-frame__dirty {
  color: var(--md-error);
  font-size: 12px;
  font-weight: 600;
}

.settings-frame__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 20px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
  font-size: 13px;
}

.settings-frame__confirm-text {
  flex: 1;
}

.settings-frame__alert {
  margin: 12px 20px 0;
}

.settings-frame__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.settings-frame__body > :deep(.sheet-form) {
  flex: 1;
}
</style>

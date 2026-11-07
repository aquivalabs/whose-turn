<script setup lang="ts">
// The chrome both settings sheets wear: the dialog, the unsaved flag and Save in its head, the confirm bar and the one alert line above the form.
import { useText } from '@/i18n/index.ts';
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
const t = useText();
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
      <span v-if="dirty" class="settings-frame__dirty">{{ t('settings.frame.unsaved') }}</span>
      <button v-if="!unloaded" type="button" class="btn btn--tonal" @click="emit('save')">
        {{ t('settings.frame.save') }}
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
  width: min(40rem, 100%);
  height: min(47.5rem, 100%);
}

:deep(.settings-frame__card--wide) {
  width: min(47.5rem, 100%);
}

.settings-frame__dirty {
  color: var(--md-error);
  font-size: 0.75rem;
  font-weight: 600;
}

.settings-frame__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  margin: 0.75rem 1.25rem 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.625rem;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
  font-size: 0.8125rem;
}

.settings-frame__confirm-text {
  flex: 1;
}

.settings-frame__alert {
  margin: 0.75rem 1.25rem 0;
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

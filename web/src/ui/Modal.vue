<script setup lang="ts">
// A dialog over the window: a title bar with a Close button, a scrolling body (padded unless `flush`) and an optional footer; a click on the backdrop asks to close. The backdrop fades and the card rises; the owner wraps it in AnimatePresence so it can leave the same way.
import { Motion } from 'motion-v';
import { fade, rise } from '@/motion.ts';
defineProps<{ title: string; labelId: string; flush?: boolean; cardClass?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <Motion
    v-bind="fade"
    class="modal"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="labelId"
    @click.self="emit('close')"
  >
    <Motion v-bind="rise" class="modal__card" :class="cardClass">
      <div class="modal__head">
        <h3 :id="labelId" class="modal__title">{{ title }}</h3>
        <slot name="head" />
        <button type="button" class="btn" @click="emit('close')">Close</button>
      </div>
      <div class="modal__body" :class="{ 'modal__body--flush': flush }"><slot /></div>
      <div v-if="$slots.footer" class="modal__foot"><slot name="footer" /></div>
    </Motion>
  </Motion>
</template>
<style scoped>
.modal__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
  min-height: 0;
  padding: 16px 20px;
  overflow: auto;
}

.modal__body--flush {
  gap: 0;
  padding: 0;
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--md-outline-variant);
}
</style>

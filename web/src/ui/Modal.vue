<script setup lang="ts">
// A dialog over the window: a title bar with a Close button, a scrolling body and an optional footer; a click on the backdrop asks to close.
defineProps<{ title: string; labelId: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="labelId"
    @click.self="emit('close')"
  >
    <div class="modal__card">
      <div class="modal__head">
        <h3 :id="labelId" class="modal__title">{{ title }}</h3>
        <slot name="head" />
        <button type="button" class="btn" @click="emit('close')">Close</button>
      </div>
      <div class="modal__body"><slot /></div>
      <div v-if="$slots.footer" class="modal__foot"><slot name="footer" /></div>
    </div>
  </div>
</template>
<style scoped>
.modal__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  overflow: auto;
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--md-outline-variant);
}
</style>

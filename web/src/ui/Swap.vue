<script setup lang="ts">
// docs/mechanisms/motion.md § The empty text waits for the list
import { ref, watch } from 'vue';
import { AnimatePresence } from 'motion-v';
const props = defineProps<{ face: string }>();
const shown = ref(props.face);
watch(
  () => props.face,
  () => (shown.value = shown.value ? '' : props.face),
);
const settle = () => {
  if (!shown.value) {
    shown.value = props.face;
  }
};
</script>
<template>
  <AnimatePresence :initial="false" @exit-complete="settle">
    <slot :face="shown" />
  </AnimatePresence>
</template>
